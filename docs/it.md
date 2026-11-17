# Security overview (for IT)

A summary of how the lab's infrastructure is secured, for review against the university's policies. Each topic links to the page with the details. Open points are listed at the end.

## What runs where

The lab runs a login service (Keycloak) on a VM of the VU research cloud, a physical lab server with tools for lab members (Whisper, Ollama), and the lab's AmCAT server with its data storage. The full list, with who uses what: [Infrastructure overview](./infrastructure.md).

## Data

| Where | Data | Details |
| --- | --- | --- |
| **Keycloak** | Accounts: email address, name, password hashes, second factors (authenticator apps, passkeys, recovery codes); login and admin events (90 days) | [Keycloak setup](./keycloak.md) |
| **AmCAT** | Research data uploaded to projects (may contain personal data), users and their roles, hashed API keys | [AmCAT](./amcat.md) |
| **Whisper, Ollama** | Audio files, transcripts, prompts and outputs, processed on lab hardware | [Lab server](./lab-server.md) |

What we process, why, and for how long: [Privacy statement](./policies/privacy.md) (draft, to be reviewed by the VU privacy officer).

## Who can reach what

* **Only HTTPS is public.** Every server has one reverse proxy (Caddy) in front of its services, with certificates from Let's Encrypt. Services listen on internal networks or localhost only. Docker containers bypass a server's firewall, so we follow strict rules for them: [Docker on our servers](./docker.md).
* **Keycloak:** only the login pages are public. The admin consoles and the administrators' realm are on a separate hostname, reachable only from the VU network (campus and VPN). [Keycloak setup: security in short](./keycloak.md#security-in-short)
* **The lab server:** tools without their own login sit behind the lab login (the AuthWall), which only lets in lab members, optionally only one group. [Lab server](./lab-server.md#the-lab-login-oauth2-proxy)
* **The data storage server** is internal only.
* **SSH** to VMs: keys only, no `root` login, via the university network or the VU SSH gateway. [University VMs](./vm.md#3-secure-ssh-logins)

## Logins and 2FA

| Who | Where | Login | Details |
| --- | --- | --- | --- |
| Administrators of Keycloak | Realm `master` | Password and a mandatory second factor; no email, no external logins | [How users log in](./keycloak.md#how-users-log-in) |
| Lab members and invited collaborators | Realm `lab` (lab infrastructure) | Added by us; password and a mandatory second factor | [Lab authentication](./lab-auth.md) |
| Users of the lab's AmCAT and AnnoTinder servers | Realm `idp` | Anyone can create an account (email, Google or GitHub); access is given per server. A second factor is required for sensitive actions (step-up) | [Keycloak setup](./keycloak.md#the-idp-realm-one-login-for-the-labs-servers) |

* **Second factors:** authenticator apps, passkeys or security keys, and recovery codes. A lost password can't be reset by email alone: users with a second factor must use it. [How users log in](./keycloak.md#how-users-log-in)
* **Passwords:** at least 10 characters, with an uppercase letter and a digit; brute force detection in all realms.
* **Our own software** delegates logins to an OIDC provider, and checks verified email, 2FA and step-up itself. Servers only receive the email address and whether 2FA was used. [Authentication standard](./auth.md)

## Secrets

* **Never in the repository.** Secrets are in `.env` files on the servers, readable only by the system account that runs the service; the repository holds templates with placeholders.
* **The email provider's password** is only in the email relay, not in Keycloak, so Keycloak admins can send email but can't read or redirect the password. The Google and GitHub secrets are stored masked in Keycloak. [Decisions: the email relay](./decisions.md#the-email-relay-and-secrets-admins-can-use-but-not-take)
* **The internal certificate** between Caddy and Keycloak never leaves the VM.

## Updates and backups

* **Operating system:** automatic security updates (`unattended-upgrades`) on the VMs. [University VMs](./vm.md#5-updates-and-docker)
* **Software versions are pinned** (Keycloak, PostgreSQL, Caddy, oauth2-proxy) and upgraded deliberately, following the release notes. [Keycloak deployment: maintenance](./keycloak-deploy.md#10-maintenance)
* **Backups:** Keycloak's database is dumped daily on its VM (kept 14 days). [Keycloak deployment: backups](./keycloak-deploy.md#9-backups)

## Why it is set up this way

The choices behind this setup, and the alternatives we dropped: [Decisions](./decisions.md).

## Open points

* **Off-site backups:** Keycloak's dumps are still on the same VM. ==TODO: the lab's backup strategy (encrypted, off-site), and confirm the backups of the other servers.==
* **Privacy statement and acceptable use policy:** drafts, to be reviewed by the VU privacy officer ([Privacy statement](./policies/privacy.md), [AUP](./policies/aup.md)).
* **The lab server:** ==TODO: operating system updates, and the status of the AuthWall (being set up).==
* **The VM firewall:** one check of the firewall together with Docker is still to be done ([University VMs](./vm.md#docker-and-the-vm-firewall)).
* **Retention** of Whisper and Ollama inputs and outputs: ==TODO== (see the privacy statement).
