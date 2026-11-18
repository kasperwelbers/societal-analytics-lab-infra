# Hardening plan

Proposals to make the lab's infrastructure harder to break into, beyond what is set up now. Nothing on this page is in place yet, unless it says so: each part is to be decided, tested, and then moved into the installation guides. The most sensitive machine is the [Keycloak VM](servers/keycloak.md): whoever controls it controls every login of the lab.

## Where we stand

* **SSH** to the VMs: keys only, no `root` logins, from the VU network or via the VU SSH gateway ([University VMs](install/vm.md#3-secure-ssh-logins)).
* **Keycloak's admin consoles:** on a separate admin hostname, reachable only from VU IP ranges (campus and VPN); administrators need a password and a second factor (an authenticator app, a passkey or a security key).
* **Everything else public** is behind Caddy, with only HTTPS open.

What remains, from most to least serious:

1. **The VU account is the real master key.** Whoever can log in to the SciCloud portal as an owner of a VM can take it over, regardless of SSH (see [Access to the VMs](#access-to-the-vms)).
2. **The admin consoles are reachable from the whole VU network:** tens of thousands of people and devices can try them.
3. **Second factors can be phished:** a code from an authenticator app can be typed into a fake page; a passkey or security key can't.
4. **SSH keys are files on laptops:** malware or a stolen laptop can take them.

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

* **SSH to the Keycloak VM** (and later other servers): see below;
* **the second factor of Keycloak administrators:** the `master` realm, and the realm admins of `lab` and `idp`;
* **the VU account** of VM owners, if the VU supports security keys.

A security key holds its secret on the device itself: it can't be copied, and it only works on the real site (so it can't be phished), after a touch and a PIN.

==TODO: how many (two per administrator, plus a few spares), which model (with USB-C and NFC), and who keeps track of them.==

## SSH with security keys

OpenSSH supports security keys directly ("FIDO" keys, since version 8.2). The private key never leaves the key; every login needs the key, a touch and its PIN. On the admin's laptop:

```bash
ssh-keygen -t ed25519-sk -O verify-required -C "<name> yubikey 1"
```

Repeat with the spare key, and give both public keys (`~/.ssh/id_ed25519_sk.pub`) to whoever manages the server. On the Keycloak VM, in `/etc/ssh/sshd_config.d/00-hardening.conf`:

```
# Only security keys, and only these accounts
PubkeyAcceptedAlgorithms sk-ssh-ed25519@openssh.com,sk-ecdsa-sha2-nistp256@openssh.com
AllowUsers <admin 1> <admin 2> tunnel-*
```

The console in the portal stays the way back in when both keys are lost.

**Alternative without hardware:** 1Password's SSH agent keeps the key in 1Password instead of a file, and asks for approval at every use. That protects against stolen key files, but not against someone who gets into the 1Password account. As far as we know, 1Password can't combine this with a security key.

## The admin consoles through SSH

**Proposal:** the admin hostname is no longer open to the VU network, only to connections that come through an SSH tunnel to the Keycloak VM itself. To reach an admin console, you first open a tunnel, with your security key. This replaces the VU IP ranges as the barrier, and makes a VPN of our own unnecessary.

| Option | Who can reach the admin consoles | Considered |
| --- | --- | --- |
| VU IP ranges (now) | Anyone on the VU network or VPN, then password and second factor | Too wide |
| **SSH tunnel to the Keycloak VM** | Only people with an SSH key (security key) for the VM, then password and second factor | **Proposed** |
| Only from the lab server's IP address (admins SSH into the lab server first) | Everything that runs on the lab server, including every app container | No: a broken-into app on the lab server could reach the admin consoles; and admins would need accounts on the lab server |
| A VPN of our own (WireGuard) | Devices with a VPN key | Works, but adds a service to maintain, a UDP port for VU IT to open, and keys to manage; the SSH tunnel does the same with what exists |
| Tailscale | Devices in our Tailscale network | A US company's server decides who joins; the free plan is for 3 users |
| Cloudflare Tunnel and Access | People who pass Cloudflare's check | No: Cloudflare decrypts all admin traffic, including passwords and tokens |
| Client certificates in the browser | Browsers with a certificate from the lab | Strong, but issuing and revoking certificates is cumbersome |

**Tunnel-only accounts for realm admins.** Realm admins of `lab` and `idp` don't need access to the VM itself. They get an SSH account (`tunnel-<name>`) that can only open a tunnel to the admin console: its shell is `/usr/sbin/nologin` (no commands), and its `authorized_keys` allows nothing but forwarding to the admin hostname:

```
restrict,port-forwarding,command="/usr/sbin/nologin",permitopen="<admin hostname>:443" sk-ssh-ed25519@openssh.com AAAA... <name>
```

==TODO: test these restrictions (no shell, no commands, no other destinations) before giving accounts out.==

**What it looks like for an admin.** Open the tunnel (it keeps running while you work; your security key asks for a touch and its PIN):

```bash
ssh -N -D 1080 tunnel-<name>@<keycloak vm>
```

Then use a separate browser profile, e.g. in Firefox, with **Settings → Network settings → Manual proxy: SOCKS v5, `localhost`, port `1080`**, and **Proxy DNS when using SOCKS v5** on. In that profile, open the admin console as usual (`https://<admin hostname>/admin/`): the browser connects through the VM, so Caddy sees the connection coming from the VM itself. Close the tunnel (`Ctrl+C`) when you're done.

==TODO: test how Caddy (in Docker) sees connections from the VM itself, and restrict the admin hostname to exactly those; and how admins outside the VU network reach SSH (the VU SSH gateway needs a VUnetID).==

## Phishing-proof second factors for administrators

**Proposal:** administrators in `master`, and the realm admins of `lab` and `idp`, must use a passkey or security key as their second factor; an authenticator app is no longer enough for them. In Keycloak this is a separate login flow (or a condition on a role) that only offers WebAuthn. ==TODO: work out and test in the realm files.==

## Questions for VU IT

* Can normal users be prevented from changing the context of a VM, and are changes to VMs logged?
* Is the SciCloud portal only reachable from the VU network or VPN, and do VU accounts support security keys?
* Is SSH to our VMs reachable from outside the VU network, or only via the VU SSH gateway?

These go together with the open questions about backups ([Open points](index.md#open-points)).

## Order

1. Protect the VU accounts of VM owners; buy security keys.
2. SSH to the Keycloak VM with security keys only.
3. The admin consoles through SSH tunnels; tunnel-only accounts for realm admins.
4. Security keys as the second factor for Keycloak administrators.
5. After testing on a test VM: turn off contextualization, protect the boot menu, and notifications at start and on changed keys.
