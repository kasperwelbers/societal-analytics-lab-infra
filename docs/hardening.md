# Hardening plan

What else to do to make the lab's infrastructure harder to break into, beyond what is set up now. The aim is a setup that is safe *and* simple: every step here is cheap, easy to understand, and hard to get wrong. More elaborate options are at the end, for when there is a concrete reason. Nothing on this page is in place yet, unless it says so.

The most sensitive machine is the [Keycloak VM](servers/keycloak.md): whoever controls it controls every login of the lab.

## Where we stand

* **SSH** to the VMs: keys only, no `root` logins ([University VMs](install/vm.md#3-secure-ssh-logins)).
* **Keycloak's admin consoles:** on a separate admin hostname, reachable only from VU IP ranges (campus and VPN); administrators need a password and a second factor (an authenticator app, a passkey or a security key).
* **Everything else public** is behind Caddy, with only HTTPS open.

What remains, from most to least serious:

1. **SSH on the Keycloak VM is reachable from the whole internet** (found in November 2026, still to fix). The VM was created from an **(extern)** template, which allows SSH from anywhere. Keys-only logins make guessing useless, but SSH runs code for every connection, before any login, and serious flaws there do occur (e.g. "regreSSHion", 2024).
2. **The VU account is the real master key** of a VM: whoever can log in to the SciCloud portal as its owner can take it over, regardless of SSH ([step 4](#4-access-to-the-vms-through-the-portal)).
3. **Second factors can be phished:** a code from an authenticator app can be typed into a fake page; a security key can't. And SSH keys are files on laptops, which malware or a thief can take.
4. **A flaw in Keycloak itself** could be tried by anyone who can reach its admin console: now the whole VU network.

## The plan

### 1. SSH only from the VU network

Allow SSH on every server only from the VU network (campus and VPN, which includes the VU SSH gateway), and keep ports 80 and 443 open to everyone. One firewall change per server: [SSH only from the VU network](install/vm.md#ssh-only-from-the-vu-network), or `setup-vm.sh --ssh-from` for new VMs. This is now the default for new VMs.

==TODO: apply on the Keycloak VM; check the other VMs, and the lab server (a physical server with a firewall of its own).==

### 2. Security keys

**The lab buys a set of security keys** (e.g. YubiKeys), two per person with sensitive access: one to use, one as a spare in a safe place. A security key holds its secret on the device itself: it can't be copied, it only works on the real site (so it can't be phished), and it needs a touch and a PIN. Use them for:

* **SSH** to the servers (below);
* **the second factor of Keycloak administrators:** the `master` realm, and the realm admins of `lab` and `idp`. Keycloak accepts security keys as a second factor already; making them mandatory for administrators (no authenticator app) is a separate login flow. ==TODO: work out and test in the realm files.==
* **the VU accounts** of VM owners, if the VU supports security keys.

==TODO: how many (two per administrator, plus a few spares), which model (with USB-C and NFC), and who keeps track of them.==

**SSH with a security key.** OpenSSH supports security keys directly. On the admin's laptop, once per key:

```bash
ssh-keygen -t ed25519-sk -O verify-required -C "<name> yubikey 1"
```

Give both public keys (`~/.ssh/id_ed25519_sk.pub`, from the key and the spare) to whoever manages the server. Once every admin of a server uses one, the server can accept nothing else, in `/etc/ssh/sshd_config.d/00-hardening.conf`:

```
# Only security keys, and only these accounts
PubkeyAcceptedAlgorithms sk-ssh-ed25519@openssh.com,sk-ecdsa-sha2-nistp256@openssh.com
AllowUsers <admin 1> <admin 2>
```

The console in the SciCloud portal stays the way back in when both keys are lost. (Without hardware, 1Password's SSH agent is a step up from key files: it asks for approval at every use. But anyone who gets into the 1Password account has the key.)

### 3. Keycloak up to date, quickly

A barrier in front of the admin console is there because of possible flaws in Keycloak. The most direct defense against those is installing security updates quickly:

* **Follow Keycloak's security announcements** (the [Keycloak blog](https://www.keycloak.org/blog), and the releases on GitHub, which can send notifications), and apply a security release within days, following [Upgrading Keycloak](install/keycloak.md#10-maintenance).
* **The same for the rest of the VM:** the operating system updates itself ([University VMs](install/vm.md#5-updates-and-docker)); Caddy and PostgreSQL follow their releases.

==TODO: who follows the announcements, and who updates.==

### 4. Access to the VMs through the portal

**The problem.** SciCloud runs on OpenNebula. At every start, OpenNebula hands the VM its "context": settings that the `one-context` package in the VM applies **as root**, such as an SSH key, a password, and a start script that may run anything. The owner of a VM can change its context in the portal and restart it, and can open its console there (a virtual screen and keyboard), from which a restart and a changed boot command (`init=/bin/bash`) give a root shell. So anyone who can log in to the portal as an owner can take the VM over. Turning off `root` logins over SSH doesn't prevent this. (VU IT itself can always reach the VMs: that is the trust any cloud requires.)

**Now:**

* **Protect the VU accounts of the VM owners** with a second factor, preferably a security key, and keep the number of owners small.
* **Ask VU IT** whether normal users can be prevented from changing the context of a VM, and whether changes to VMs are logged.

**Later, after testing on a test VM** (each of these can break a VM if done wrong):

* **Turn off contextualization once a VM is set up** (disable `one-context`), so later changes to the context do nothing. On SciCloud, the network settings often come from the context, so the network configuration must first be fixed in the VM itself, and a restart tested.
* **A password on the boot menu (GRUB),** so the boot command can't be changed from the console.
* **A notification at every start of a VM, and when SSH keys change:** an unexpected restart with new keys is what this attack looks like.

## Where Keycloak runs

An open question: is a SciCloud VM the best place for the lab's login service? What matters:

* **Who can take over the machine** outside SSH: owner accounts, the console, the provider's own staff, and how well those are protected (security keys, logging).
* **Availability:** when Keycloak is down, nobody in the lab can log in. Is there a support agreement, and how quickly is a failure fixed?
* **Backups and recovery** by the platform itself.
* **Data location and agreements:** the accounts of lab members and others are personal data; an external provider needs a data processing agreement.
* **Cost, effort, and whether VU IT accepts it.**

| Place | Pros | Cons |
| --- | --- | --- |
| **A SciCloud VM (now)** | Free; VU hardware, data stays at the VU; a public address is possible | Self-service portal: an owner's VU account can take the VM over ([step 4](#4-access-to-the-vms-through-the-portal)); a research cloud, possibly without guaranteed availability; its own backups unclear |
| **A VM managed by VU IT** (their regular hosting, not the research cloud) | Run by people whose job it is; backups and monitoring by IT; probably no self-service console for owners | A request process; less control over updates and configuration; possibly costs |
| **A dedicated physical server on VU premises** | No portal | The hardware is our job (disks, failures); a remote console (IPMI) is a risk of its own. Not on the lab server, which runs many apps |
| **A VM at a European cloud provider** (e.g. Hetzner, Scaleway, OVH) | A provider account with a security key, snapshots, good consoles; a few euros a month | Outside the VU: a data processing agreement is needed, and the VU network restrictions no longer apply by themselves |
| **Hosted Keycloak** (as a service) | No server of our own | Costs; the provider can reach everything; less control |
| **No Keycloak of our own** (the VU's login or SURF SRAM for `lab`) | Nothing to host | Considered before: no open sign-up for `idp`, and less control over 2FA and account recovery ([Decisions](decisions.md#keycloak)) |

**For now,** a SciCloud VM is reasonable if two things hold: the VU accounts of its owners are well protected ([step 4](#4-access-to-the-vms-through-the-portal)), and VU IT confirms its availability and access rules. The most obvious alternative is a VM managed by VU IT. ==TODO: ask VU IT (see below).==

## Further options, if needed

Only for when there is a concrete reason, e.g. realm admins from outside the VU (who have no VU VPN), or a request from VU IT. Each adds something to run and maintain.

* **A VPN of our own (WireGuard),** on a small VM of its own. Each admin's device gets a key and an address in a private network (e.g. `10.8.0.x`): traffic to that network is encrypted and sent to the VPN server's public address, which unwraps it. The admin console (and SSH) would then only accept the VPN. Without a key, the VPN doesn't answer at all, and it is easy for realm admins (switch on the app). But the keys are files on devices, with no second factor per session; it needs a UDP port that VU IT has to allow; and it is one more machine. Self-hosted tools on top of WireGuard (Headscale, NetBird) add a login with a second factor, at the cost of another service.
* **A jump host:** a small VM with only SSH, the one way in to the servers (`ProxyJump`). Simple for technical admins; for the admin console, users need an SSH tunnel and a browser profile that uses it. A jump host and a VPN can be the same small VM.
* **Tunnel-only SSH accounts** (on the Keycloak VM, or on a jump host or the lab server): an account that can only forward to the admin console, without a shell (`nologin`, and `restrict,port-forwarding,permitopen=...` on its key).
* **Tailscale:** a VPN without setup; but a US company's server decides who joins, and the free plan is for 3 users. **Cloudflare Tunnel:** no open ports; but Cloudflare decrypts all traffic, including passwords. **Client certificates:** strong, but cumbersome to issue and revoke.

Whatever is chosen: **never put private keys on a jump host or VPN server,** and don't forward your SSH agent to it (`ssh -A`). With `ProxyJump`, the connection to a server runs from your own laptop, through the jump host, so a broken-into jump host gives no logins.

## Questions for VU IT

* Can normal users be prevented from changing the context of a VM, and are changes to VMs logged?
* Is the SciCloud portal only reachable from the VU network or VPN, and do VU accounts support security keys?
* Which address ranges are the VU network and VPN (for the SSH and admin restrictions)?
* What availability does SciCloud offer (support, failures, backups)? And could the lab's login service run on a VM managed by VU IT instead, and who could reach its console there?

These go together with the open questions about backups ([Open points](index.md#open-points)).
