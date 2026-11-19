# Hardening plan

Considerations and proposals to make the lab's infrastructure harder to break into, beyond what is set up now. Nothing on this page is in place yet, unless it says so: each part is to be decided, tested, and then moved into the installation guides. The most sensitive machine is the [Keycloak VM](servers/keycloak.md): whoever controls it controls every login of the lab.

## Where we stand

* **SSH** to the VMs: keys only, no `root` logins ([University VMs](install/vm.md#3-secure-ssh-logins)).
* **Keycloak's admin consoles:** on a separate admin hostname, reachable only from VU IP ranges (campus and VPN); administrators need a password and a second factor (an authenticator app, a passkey or a security key).
* **Everything else public** is behind Caddy, with only HTTPS open.

What remains, from most to least serious:

1. **SSH on the Keycloak VM is reachable from the whole internet** (found in November 2026, still to fix). The VM was created from an **(extern)** template, which allows SSH from anywhere. Keys-only logins make guessing useless, but SSH runs code for every connection, before any login, and serious flaws there do occur (e.g. "regreSSHion", 2024). The fix is in the VM guide: [SSH only from the VU network](install/vm.md#ssh-only-from-the-vu-network). ==TODO: apply on the Keycloak VM; check the other VMs and the lab server (a physical server with a firewall of its own).==
2. **The VU account is the real master key.** Whoever can log in to the SciCloud portal as an owner of a VM can take it over, regardless of SSH ([Access to the VMs](#access-to-the-vms)).
3. **The admin consoles are reachable from the whole VU network:** tens of thousands of people and devices can try them ([The admin consoles](#the-admin-consoles)).
4. **Second factors can be phished:** a code from an authenticator app can be typed into a fake page; a passkey or security key can't.
5. **SSH keys are files on laptops:** malware or a stolen laptop can take them.

## Who can reach SSH

Every server should accept SSH only from a known, small set of addresses, so that a flaw in SSH can't be tried by just anyone. Two levels:

* **The VU network** (campus and VPN, which includes the VU SSH gateway): the default for every VM, set up in the VM guide ([SSH only from the VU network](install/vm.md#ssh-only-from-the-vu-network)), or with `setup-vm.sh --ssh-from`. It narrows SSH from the whole internet to the VU. But the VU is large, and anyone with VU credentials can use the VU SSH gateway.
* **Only a jump host of our own** (below): narrows SSH to the people the lab gives access, and puts the part that faces the network on a machine with nothing valuable on it.

## A jump host of our own

**The proposed direction:** a small, separate VM (a "jump host" or "bastion") with nothing on it but SSH, with security keys. It becomes the one way in:

* **SSH on all our servers** (the Keycloak VM, the service VMs, the lab server) only accepts connections from the jump host's address.
* **The Keycloak admin hostname** only accepts the jump host's address. Admins reach the admin consoles through a tunnel via the jump host, so their connection arrives at Keycloak from the jump host ([below](#the-admin-consoles)).
* **Accounts on the jump host:** full accounts for the administrators of the servers (e.g. 2), and tunnel-only accounts for the realm admins of `lab` and `idp` (e.g. 3): they can only open a tunnel to the admin consoles, without a shell or commands.
* **Who can reach the jump host:** the VU network; or, if there will be admins from outside the VU, the whole internet, with security keys only.

**What it adds:** an outer wall that is easy to protect and to watch. One small machine with one service to keep up to date, where every login is logged and can send a notification, instead of SSH on every server facing the network. For SSH to the servers themselves it adds less than for the admin consoles, because it is SSH either way; its value is the one, well-watched point of entry, and that the Keycloak VM (and the other servers) can't be reached at all from anywhere else.

**What it costs:**

* **One more VM,** which needs the same hardening as the others, including the [portal problem](#access-to-the-vms).
* **A single point of failure:** when the jump host is down, nobody gets in through SSH. The way back is the console of each VM in the portal, or temporarily allowing the VU network again.
* **Some setup per admin:** `ProxyJump` in their SSH configuration, so `ssh <server>` goes through the jump host by itself:

    ```
    # ~/.ssh/config
    Host jump
        HostName <jump host>
        User <name>
    Host keycloak
        HostName <keycloak vm>
        User <name>
        ProxyJump jump
    ```

**Tunnel-only accounts** (on the jump host): an account `tunnel-<name>` with the shell `/usr/sbin/nologin`, and in its `authorized_keys` nothing but forwarding to the admin hostname:

```
restrict,port-forwarding,command="/usr/sbin/nologin",permitopen="<admin hostname>:443" sk-ssh-ed25519@openssh.com AAAA... <name>
```

==TODO: test these restrictions (no shell, no commands, no other destinations) before giving accounts out.==

## SSH with security keys

OpenSSH supports security keys directly ("FIDO" keys, since version 8.2). The private key never leaves the key; every login needs the key, a touch and its PIN. On the admin's laptop:

```bash
ssh-keygen -t ed25519-sk -O verify-required -C "<name> yubikey 1"
```

Repeat with the spare key, and give both public keys (`~/.ssh/id_ed25519_sk.pub`) to whoever manages the server. On the server, in `/etc/ssh/sshd_config.d/00-hardening.conf`:

```
# Only security keys, and only these accounts
PubkeyAcceptedAlgorithms sk-ssh-ed25519@openssh.com,sk-ecdsa-sha2-nistp256@openssh.com
AllowUsers <admin 1> <admin 2>
```

The console in the portal stays the way back in when both keys are lost.

**Alternative without hardware:** 1Password's SSH agent keeps the key in 1Password instead of a file, and asks for approval at every use. That protects against stolen key files, but not against someone who gets into the 1Password account. As far as we know, 1Password can't combine this with a security key.

## The admin consoles

The admin hostname of Keycloak (the admin consoles of all realms, and the logins of the `master` realm) only accepts certain addresses; behind that, administrators need their password and second factor. The question is which addresses. The barrier doesn't make the login stronger: it keeps Keycloak's admin code out of reach of almost everyone, so that a flaw in Keycloak can't be tried by just anyone.

| Option | Who can reach the admin consoles | Trade-offs |
| --- | --- | --- |
| The VU network (now) | Anyone on the VU network or VPN | No setup; but tens of thousands of people and devices |
| **Through the jump host** (the proposed direction, [above](#a-jump-host-of-our-own)) | Only people with an account on the jump host (full or tunnel-only) | One more VM; also the one way in for SSH |
| Through the lab server (the lab server as jump host) | The ~5 people with SSH access to the lab server, and everything running on the lab server | No new machine, a large improvement on now; but every app on the lab server (and every container) can reach the admin consoles too, and realm admins need accounts on the lab server |
| Tunnel-only accounts on the Keycloak VM itself | Only people with an account on the Keycloak VM (full or tunnel-only) | No new machine; the Keycloak VM's own SSH has to be reachable for all of them (from outside the VU too, for external admins) |
| A VPN of our own (WireGuard) | Devices with a VPN key | Doesn't answer anyone without a key; but a service to maintain, a UDP port for VU IT to open, and the same trade-off as above for any server inside the VPN |
| Tailscale | Devices in our Tailscale network | Easy; but a US company's server decides who joins, and the free plan is for 3 users |
| Cloudflare Tunnel and Access | People who pass Cloudflare's check | No open ports; but Cloudflare decrypts all admin traffic, including passwords and tokens |
| Client certificates in the browser | Browsers with a certificate from the lab | Strong; but issuing and revoking certificates is cumbersome |

**What a tunnel looks like for an admin.** Open the tunnel (it keeps running while you work; your security key asks for a touch and its PIN):

```bash
ssh -N -D 1080 tunnel-<name>@<jump host>
```

Then use a separate browser profile, e.g. in Firefox, with **Settings → Network settings → Manual proxy: SOCKS v5, `localhost`, port `1080`**, and **Proxy DNS when using SOCKS v5** on. In that profile, open the admin console as usual (`https://<admin hostname>/admin/`): the browser connects through the jump host, so Caddy sees the jump host's address. Close the tunnel (`Ctrl+C`) when you're done.

## Access to the VMs

**The problem.** SciCloud runs on OpenNebula. At every start, OpenNebula hands the VM its "context": settings that the `one-context` package in the VM applies **as root**, such as an SSH key for `root` (or for a user), a password, and a start script (`START_SCRIPT`) that may run anything. The owner of the VM can change the context in the portal, and restart the VM. So anyone who can log in to the portal with an owner's VU account can:

* add their own SSH key, or a start script that creates an admin account or turns `root` logins back on. Turning off `root` logins over SSH doesn't prevent this: the start script runs anyway;
* open the VM's console in the portal (a virtual screen and keyboard), restart, and change the boot command in the boot menu (e.g. `init=/bin/bash`), which gives a root shell without any password.

VU IT itself can always reach the VMs (they run the hardware and can read the disks): that is the trust any cloud requires, and not something we can or need to close.

**Proposals,** from most to least effective:

1. **Protect the VU accounts of the VM owners:** a second factor, preferably a security key. Check that the portal is only reachable from the VU network or VPN.
2. **Turn off contextualization once a VM is set up:** disable or remove `one-context`, so that later changes to the context do nothing. On SciCloud, the network settings (the IP address) often come from the context, so first make the network configuration fixed in the VM itself (netplan), and test a restart. ==TODO: test on a test VM, including a restart.==
3. **Close the console route:** a password on the boot menu (GRUB), so the boot command can't be changed, and no password for `root` (Ubuntu's recovery mode then gives no shell either).
4. **Notice it when it happens:** a ping to the monitoring at every start of a VM (an unexpected restart is the first sign), and a nightly check that the SSH keys, `sudoers` and SSH settings haven't changed, reported like the backups ([Monitoring](install/backups.md#monitoring)).
5. **Ask VU IT** whether normal users can be prevented from changing the context of a VM (OpenNebula has access rules for this), and whether changes to VMs are logged.

Once tested, steps 2 to 4 can become an option of [`setup-vm.sh`](install/setup-vm.sh).

## Security keys for the lab

**Proposal: the lab buys a set of security keys** (e.g. YubiKeys), two per person who needs sensitive access: one to use, one as a spare in a safe place. They are used for:

* **SSH to the Keycloak VM** (and later other servers): see [SSH with security keys](#ssh-with-security-keys);
* **the second factor of Keycloak administrators:** the `master` realm, and the realm admins of `lab` and `idp`;
* **the VU account** of VM owners, if the VU supports security keys.

A security key holds its secret on the device itself: it can't be copied, and it only works on the real site (so it can't be phished), after a touch and a PIN.

==TODO: how many (two per administrator, plus a few spares), which model (with USB-C and NFC), and who keeps track of them.==

## Phishing-proof second factors for administrators

**Proposal:** administrators in `master`, and the realm admins of `lab` and `idp`, must use a passkey or security key as their second factor; an authenticator app is no longer enough for them. In Keycloak this is a separate login flow (or a condition on a role) that only offers WebAuthn. ==TODO: work out and test in the realm files.==

## Questions for VU IT

* Can normal users be prevented from changing the context of a VM, and are changes to VMs logged?
* Is the SciCloud portal only reachable from the VU network or VPN, and do VU accounts support security keys?
* May we run a jump host of our own on SciCloud, open to the VU network (or, for external admins, the internet)?

These go together with the open questions about backups ([Open points](index.md#open-points)).

## Order

1. SSH on the Keycloak VM (and the other servers) only from the VU network ([SSH only from the VU network](install/vm.md#ssh-only-from-the-vu-network)).
2. Protect the VU accounts of VM owners; buy security keys.
3. SSH with security keys only.
4. A jump host of our own: SSH to all servers, and the admin consoles, only through it.
5. Security keys as the second factor for Keycloak administrators.
6. After testing on a test VM: turn off contextualization, protect the boot menu, and notifications at start and on changed keys.
