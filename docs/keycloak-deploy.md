# Keycloak deployment

This runbook sets up Keycloak on a single VM, with PostgreSQL and Caddy (TLS via Let's Encrypt), using the files in [`deploy/keycloak/`](https://github.com/vu-societal-analytics/societal-analytics-lab-infra/tree/main/deploy/keycloak). It takes about an hour. For an overview of the setup (the realms, the open idp realm with its tiers, and the security measures), see [Keycloak setup](./keycloak.md). Why we chose Keycloak is explained in the [OIDC provider comparison](./auth-providers.md); what to test after the setup is in its [test checklist](./auth-providers.md#keycloak-test-checklist).

!!! info "Placeholders"
    This page uses `auth.example.org` (public hostname), `auth-admin.example.org` (admin hostname) and `apps.example.org` (app registration). The real hostnames, IP ranges and secrets are only stored on the VM (`.env`, and `caddy/admin-access.caddy` and `caddy/email-tiers.caddy`).

## Overview

| Component | Role |
| --- | --- |
| **Caddy** | Public TLS certificates via Let's Encrypt. Forwards only the paths that need to be public to Keycloak, over a second TLS connection (re-encrypt). Built with a rate limit module, to limit requests that make Keycloak send emails. |
| **Keycloak** | An optimized image (built from the official image), started with `start --optimized`. Creates the realms from `realms/` when it starts, if they don't exist yet. Only accepts HTTPS, with an internal certificate that only Caddy trusts. |
| **tls-init** | A one-off service that creates the internal certificate on the first start (and does nothing on later starts). |
| **PostgreSQL** | The database, only reachable by Keycloak. |
| **mail-relay** | Sends all email of the realms to the email provider; the only place with the provider's password ([step 7](#email-the-relay)). |
| **app-registration** | A small site where users register apps (OIDC clients) in the `idp` realm ([step 8](#8-app-registration)). |

Two TLS connections:

* **Browser to Caddy:** the public certificates from Let's Encrypt, which Caddy renews automatically.
* **Caddy to Keycloak:** an internal certificate, valid for 10 years, which is never shown to browsers. Caddy trusts exactly this certificate. This is the *re-encrypt* setup preferred in the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy), so that traffic between Caddy and Keycloak is encrypted too.

Three hostnames:

* **`auth.example.org`** (public): logins, OIDC endpoints and static resources (`/realms/`, `/resources/`, `/.well-known/`). Everything else returns 404, including the admin console and the admin realm (`master`).
* **`auth-admin.example.org`** (admin): the admin consoles of all realms, the admin API, and the logins of the administrative `master` realm. Restricted to the university's IP ranges, for all realms ([step 4](#4-restrict-admin-access)): app owners use the [app registration site](./app-registration.md), not the admin console.
* **`apps.example.org`** (app registration): the [app registration site](./app-registration.md).

| File | Contents |
| --- | --- |
| `docker-compose.yml` | The services, pinned versions, memory limits, health checks, and two networks (the database network has no internet access) |
| `Dockerfile` | The optimized Keycloak image (`kc.sh build` with PostgreSQL and health endpoints) |
| `Caddy.Dockerfile` | Caddy with the [rate limit module](https://github.com/mholt/caddy-ratelimit) |
| `realms/` | The realms (`master`, `lab`, `idp`) as Keycloak realm files, imported when a realm doesn't exist yet ([step 7](#7-realms)); `realms/README.md` explains what we changed |
| `check-realms.py` | Checks `realms/` for mistakes that Keycloak accepts silently (run it after every change) |
| `app-registration/` | The [app registration site](./app-registration.md) |
| `internal-tls.sh` | Creates the internal certificate (run by the tls-init service) |
| `admin-cli.sh` | Runs Keycloak's admin command-line tool (`kcadm.sh`) inside the container, over the internal TLS connection |
| `caddy/` | Everything for Caddy, mounted into its container: |
| `caddy/Caddyfile` | The public and admin hostnames, and the email limits |
| `caddy/admin-access.example.caddy`, `caddy/email-tiers.example.caddy` | Templates for the local Caddy settings `caddy/admin-access.caddy` and `caddy/email-tiers.caddy` (copied in step 2, never committed): restrictions of the admin hostname ([step 4](#4-restrict-admin-access)) and the email limits per app ([Email limits](#email-limits)). |
| `caddy/init.sh` | Run by the caddy-init service before Caddy starts: creates a missing local Caddy setting from its template, so that Caddy can always start |
| `.env.example` | All settings. Copied to `.env`, which holds the secrets and is never committed. |
| `backup.sh` | A database dump, for a daily cron job |

## 1. Prerequisites

**The VM.** On a university VM, first follow [University VMs](./vm.md): secure SSH logins, open ports 80 and 443 in the VM firewall, and install Docker. Read the warning there about Docker bypassing the VM firewall.

**DNS.** Create three **A records** pointing to the VM's IPv4 address, e.g. `auth`, `auth-admin` and `apps` in the zone of your domain. Don't create AAAA (IPv6) records: with IPv4 only, the IP restriction of the admin hostname only needs IPv4 ranges, and Let's Encrypt can't fail on a stale IPv6 address. If your DNS provider can proxy traffic (e.g. Cloudflare), use "DNS only", otherwise Caddy can't see visitors' IP addresses. Check from your own machine:

```bash
dig +short auth.example.org
```

**Ports.** Ports 80 and 443 must be reachable from the internet (Let's Encrypt needs port 80), and nothing else on the VM may use them. Check on the VM:

```bash
sudo ss -tlnp '( sport = :80 or sport = :443 )'
```

Only a header line, without any rows below it, means the ports are free. This doesn't show whether they are reachable from outside: that shows in step 2, when Caddy obtains its certificates.

**Docker.** Docker Engine with the compose plugin ([installation](https://docs.docker.com/engine/install/)). This runbook runs Docker with `sudo` (see [Users and permissions](#users-and-permissions)).

```bash
sudo docker compose version
```

## 2. Installation

### Users and permissions

The deployment uses two accounts:

| Account | Role | Rights |
| --- | --- | --- |
| **`keycloak`** (system user) | Owns the files in `/opt/keycloak`, including `.env` with the secrets | No login shell, no `sudo`, not in the `docker` group |
| **Your own admin account** (your personal account on the VM) | Runs the commands in this runbook | `sudo`, and **member of the `keycloak` group** |

How commands are run:

* **File operations** (cloning, editing `.env`, `git pull`) run **as `keycloak`**, with `sudo -u keycloak ...`, so that the files stay owned by `keycloak`.
* **Docker commands** (`docker compose ...`, `./admin-cli.sh`, `backup.sh`) run **from your own account with `sudo`**, from the deployment folder `/opt/keycloak/societal-analytics-lab-infra/deploy/keycloak`. Docker reads `.env` as root, so your account doesn't need to be able to read it.

!!! warning "Required: your admin account must be in the `keycloak` group"
    `/opt/keycloak` is only accessible to the `keycloak` user and group (`chmod 750`). The Docker commands are run from the deployment folder inside it, so your admin account must be a member of the `keycloak` group, otherwise `cd` into the folder fails with `Permission denied`. Group membership gives access to the folder and the deployment files, but not to `.env`, which stays readable only by `keycloak` (`chmod 600`).

Why not simpler:

* **Don't add `keycloak` (or anyone) to the `docker` group.** Membership of the `docker` group is effectively root access: anyone who can run Docker can mount the whole disk into a container. Running Docker with `sudo` keeps that power with administrators, and `sudo` logs who did what.
* **Don't give `keycloak` `sudo` rights.** That would turn the service account into an admin account.
* The containers don't run as the `keycloak` host user: Keycloak runs as its own user inside its container. The host user only owns the files.

### System user and folder

Create the `keycloak` system user and group, with `/opt/keycloak` as its home folder:

```bash
sudo groupadd --system keycloak
```

```bash
sudo useradd --system -g keycloak --shell /usr/sbin/nologin --home-dir /opt/keycloak keycloak
```

```bash
sudo mkdir /opt/keycloak && sudo chown keycloak:keycloak /opt/keycloak && sudo chmod 750 /opt/keycloak
```

Add your own admin account to the `keycloak` group:

```bash
sudo usermod -aG keycloak "$USER"
```

**Log out and log in again**, so that the group membership takes effect. Then check that `keycloak` is listed in your groups, and that you can open the folder:

```bash
id
```

```bash
ls /opt/keycloak
```

### Files and settings

Get the files onto the VM, as `keycloak`:

```bash
sudo -u keycloak git clone https://github.com/vu-societal-analytics/societal-analytics-lab-infra.git /opt/keycloak/societal-analytics-lab-infra
```

Go to the deployment folder. All further commands in this runbook are run from here:

```bash
cd /opt/keycloak/societal-analytics-lab-infra/deploy/keycloak
```

Create `.env`, readable only by `keycloak`:

```bash
sudo -u keycloak cp .env.example .env && sudo -u keycloak chmod 600 .env
```

Generate four secrets with the command below (run it once per secret), and paste them into `.env`: `POSTGRES_PASSWORD`, `INTERNAL_TLS_KEYSTORE_PASSWORD`, `APP_REGISTRATION_CLIENT_SECRET` and `APP_REGISTRATION_SESSION_SECRET`.

```bash
openssl rand -hex 32
```

The password of the temporary admin (`KC_BOOTSTRAP_ADMIN_PASSWORD`) must meet the password policy of the `master` realm (an uppercase letter and a digit); generate it with:

```bash
echo "Temp-$(openssl rand -hex 24)"
```

Fill in the other values in `.env`: the three hostnames (without `https://`), `ACME_EMAIL` (for Let's Encrypt expiry notices), and the values under "Realms": the email provider and the Google and GitHub apps (see [step 7](#7-realms)). Keycloak creates the realms on its first start, with these values, and doesn't start while one is missing. Store the secrets in your password manager as well.

```bash
sudo -u keycloak nano .env
```

Create the local Caddy settings in `caddy/`, from the templates there: `admin-access.caddy` restricts the admin hostname ([step 4](#4-restrict-admin-access)), and `email-tiers.caddy` holds the [email limits](#email-limits) per app. These copies are not in the repository, so `git pull` never changes them.

```bash
sudo -u keycloak cp caddy/admin-access.example.caddy caddy/admin-access.caddy
```

```bash
sudo -u keycloak cp caddy/email-tiers.example.caddy caddy/email-tiers.caddy
```

Set up the admin restriction now, so the admin hostname is restricted from the first start: find your IP ranges and edit `caddy/admin-access.caddy` as described in [step 4](#4-restrict-admin-access). The email tiers can stay as they are.

If one of these files is missing when the stack starts, it is created from its template (Caddy doesn't start without them): unchanged, the templates add no admin restriction and give every app the default email limit.

### Build and start

From your own account, in the deployment folder. The first time, this builds the Keycloak image, and the tls-init service creates the internal certificate:

```bash
sudo docker compose up -d --build
```

Wait until Keycloak is `healthy` (about a minute):

```bash
sudo docker compose ps
```

On this first start, Keycloak also creates the realms from `realms/` ([step 7](#7-realms)); the app registration site starts once Keycloak is ready.

Check that Caddy obtained the certificates (look for `certificate obtained successfully`):

```bash
sudo docker compose logs caddy | grep -i certificate
```

## 3. Point the admin realm to the admin hostname

The login pages of the `master` realm (used by the admin console) must be on the admin hostname: the public hostname blocks them. On a new installation this is already done: `master-realm.json` sets the frontend URL of `master` to `KC_HOSTNAME_ADMIN`. Check it (it should show the admin hostname):

```bash
curl -s https://auth-admin.example.org/realms/master/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

On an installation from before the realm files, set it once with Keycloak's admin tool. `admin-cli.sh` runs it inside the container; log in as an admin of `master` (you are prompted for the password), and set the frontend URL (use your real admin hostname):

```bash
sudo ./admin-cli.sh login
```

```bash
sudo ./admin-cli.sh update realms/master -s attributes.frontendUrl=https://auth-admin.example.org
```

This changes the issuer of `master`, so the admin tool's login is no longer valid afterwards: run `sudo ./admin-cli.sh login` again for further commands.

## 4. Restrict admin access

Keycloak recommends not exposing the administration interfaces to the public internet, and in particular restricting the administrative `master` realm to internal access (see [Configuring Keycloak for production](https://www.keycloak.org/server/configuration-production) and the [exposed path recommendations](https://www.keycloak.org/server/reverseproxy#_exposed_path_recommendations)). With this step, everything on the admin hostname (the admin consoles, the admin API and the `master` realm) is only reachable from the IP ranges you choose, e.g. the university network and its VPN. The public hostname, where users log in, is not affected.

**How it works.** The admin hostname reads the rules in `caddy/admin-access.caddy` (copied from `caddy/admin-access.example.caddy` in [step 2](#files-and-settings)), from top to bottom; the first rule that matches a request decides. Requests that match no rule go to Keycloak. The file is local to the VM: it is not in the repository, so `git pull` never changes it.

Set this up before the first start (step 2), so the admin hostname is never open; you can also do it later. After a change while Caddy runs, apply it with a reload, which checks the file first: if it contains a mistake, the reload fails with an error message, and Caddy keeps running with the previous settings.

```bash
sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Find your IP ranges

Run this **on your own device** (not on the VM), connected to the VPN:

```bash
curl -4 https://ifconfig.me
```

Then look up the range that address belongs to (the `whois` port is blocked on some networks; this uses HTTPS):

```bash
curl -s https://rdap.db.ripe.net/ip/<your IP> | grep -E '"(name|startAddress|endAddress)"'
```

Check that `name` belongs to your institution, and write the range in CIDR notation. This command calculates it from `startAddress` and `endAddress`:

```bash
python3 -c "import ipaddress as i; print(*i.summarize_address_range(i.ip_address('START'), i.ip_address('END')))"
```

For example, `192.0.2.0` to `192.0.2.255` is `192.0.2.0/24`. The VPN and the campus network may use different ranges: repeat this on campus without VPN (wired and Wi-Fi) if you also want access from there, and list every range you find. The university's IT department can tell you the official ranges. A whole institutional range includes everyone on that network: it is an extra layer, admin accounts still need 2FA.

### Restrict the admin hostname

Edit the file (in step 2, or later):

```bash
sudo -u keycloak nano caddy/admin-access.caddy
```

At the bottom, remove the `#` in front of the restriction, and put your ranges after `remote_ip`, separated by spaces:

```
@not_allowed not remote_ip 192.0.2.0/24 198.51.100.0/24
handle @not_allowed {
	respond 403
}
```

If Caddy is already running, apply it with the reload above. Check, from your own device (once the stack runs). On the VPN this shows the `master` realm's issuer; **without the VPN** (e.g. on a phone hotspot) it should return `403`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://auth-admin.example.org/realms/master/.well-known/openid-configuration
```

### Exceptions for specific realms

The `idp` realm gets no exception: its users and app owners never need the admin console (apps are managed on the [app registration site](./app-registration.md)).

A realm can have admins who are not on your network, e.g. a research group outside the university that manages its own realm (see [Isolated OIDC providers](./auth-providers.md#use-cases)). For such a realm, add an exception **above** the restriction, in the same file. It makes the admin console of that realm, and only that realm, reachable from another range (or from anywhere, without the `remote_ip` line):

```
@realm_research_group {
	path /admin/research-group/* /admin/realms/research-group /admin/realms/research-group/* /admin/serverinfo /resources/*
	remote_ip 203.0.113.0/24
}
handle @realm_research_group {
	import keycloak
}
```

* Replace `research-group` with the name of the realm (four times), and use a unique name after `@` for each exception (letters, digits and underscores).
* The paths are what a realm's admin console needs: its console, the admin API for that realm, general server information (`/admin/serverinfo`, behind login), and scripts and styles (`/resources/`).
* The `master` realm and the other realms stay restricted: their paths are not part of the exception. Admins of the realm can only manage their own realm.
* Admins of such a realm have an account **in that realm** with the role `realm-admin` of the client `realm-management` (in that realm: **Users → the user → Role mapping → Assign role → filter by clients**). They use the console at `https://auth-admin.example.org/admin/<realm>/console/`. Make 2FA required for them in that realm.
* Apply it with `sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

Tested: with the restriction and an exception, the realm's admin console works from the exception range, while the `master` realm, the console of another realm, and the admin API of other realms are refused (by Caddy, and by Keycloak for the realm admin's own token).

## 5. Checks

From your own device (on an allowed network, if you restricted admin access in step 4):

```bash
curl -s https://auth-admin.example.org/realms/master/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

This should show `https://auth-admin.example.org/realms/master`. Then check that the public hostname doesn't expose the admin console or the admin realm (both should return `404`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://auth.example.org/admin/
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://auth.example.org/realms/master/.well-known/openid-configuration
```

## 6. Permanent admin account

Following [Bootstrapping and recovering an admin account](https://www.keycloak.org/server/bootstrap-admin-recovery): the bootstrap account is temporary, and must be replaced by a permanent admin with 2FA. The `master` realm is for administrators only; users never go in `master`.

1. Open `https://auth-admin.example.org/admin/` (from an allowed network, if you restricted admin access) and log in as `temp-admin`. Because 2FA is mandatory in `master`, Keycloak first asks you to set up an authenticator app and recovery codes for `temp-admin` too (it is deleted in step 6). A yellow banner then says you are using a temporary admin account.
2. In the `master` realm, go to **Users → Add user**. Fill in your email address (it is the username), turn on **Email verified**, and under **Required user actions** choose **Configure OTP**. Click **Create**.
3. On the **Credentials** tab, click **Set password**, and turn off **Temporary**.
4. On the **Role mapping** tab, click **Assign role**, filter by realm roles, and assign **admin**.
5. Open a private browser window, go to the admin console, and log in as the new admin. Keycloak shows **Mobile Authenticator Setup**: scan the QR code with an authenticator app. Then it shows **Recovery Authentication Codes**: save them somewhere safe (e.g. a password manager), apart from the authenticator app. Check that you can use the admin console.
6. As the new admin, go to **Users**, and delete `temp-admin`.
7. Remove the value of `KC_BOOTSTRAP_ADMIN_PASSWORD` from `.env`. It is only used on the very first start, but there is no reason to keep it.

By default, Keycloak asks for the second factor of every user who has one configured, so the permanent admin always needs their authenticator app.

## 7. Realms

The realms are in `realms/` as complete Keycloak realm files (`master-realm.json`, `lab-realm.json`, `idp-realm.json`). Keycloak imports them itself when it starts (its own `--import-realm`), but only realms that don't exist yet: an existing realm is never changed. So the files set up the realms once, document how they are configured (`realms/README.md` explains what we changed), and make it easy to set them up again. Later changes are made in the admin console.

| Realm | For | Login | Registration | External login |
| --- | --- | --- | --- | --- |
| `master` | Administrators only | Password + mandatory 2FA | No | No (and no email) |
| `lab` | The lab's own infrastructure | Password + mandatory 2FA | Added by us ([Adding lab members](#adding-lab-members)) | No (institutional addresses) |
| `idp` | The shared login for servers run by others | Password + optional 2FA | Open | Google, GitHub |

In all realms:

* **2FA:** OTP (authenticator app), passkeys or security keys, and recovery codes count as a second factor. Users can also sign in with only a passkey ("Sign in with Passkey" on the login page), which counts as 2FA, also where 2FA is mandatory. With mandatory 2FA, users without a second factor are asked to set up OTP when they log in. After setting up OTP, users set up recovery codes. In `idp`, Google and GitHub replace only the password: the second factor is asked after them, in the same way. All login paths, and why: [How users log in](./keycloak.md#how-users-log-in).
* **Forgot password, or first time** (`lab`, `idp`): after the email link (valid 30 minutes), users with a second factor enter it, then choose a new password, and are logged in. The email link never replaces the second factor. In `lab`, users without a second factor set one up in the same go.
* **The `amr` claim** in tokens contains `mfa` when a second factor was used, and `pwd` for a password (for our software: `OIDC_MFA_CLAIM=amr:mfa`, see the [Authentication standard](./auth.md)).
* **Passwords:** at least 10 characters, with an uppercase letter and a digit, not equal to the username or email.
* **Login action timeout** 30 minutes for each page of the login (e.g. setting up 2FA, saving the recovery codes), brute force detection, and login and admin events kept for 90 days.
* **Sessions** at Keycloak last 30 minutes in `lab` and `idp` (applications keep their own sessions), and up to 8 hours in `master`. In `lab`, **Remember me** on the login page keeps users logged in on that device for up to 30 days (7 days idle).
* **The email address is the username**, and users log in with it. In `lab` and `idp`, users change their address in the account console (**Personal info → Update email**): the address, and with it the username, only changes after they confirm the new address with a link sent to it. The user stays the same (same `sub`), also for users who log in with Google or GitHub. In `master`, which has no email server, admins change an address in the admin console. Existing usernames without an email address (`temp-admin`, a recovery admin) keep working.
* **Registration** (in `idp`) asks only for email and name: users choose their password after verifying their email address. This is Keycloak's default when email verification is on, so that nobody can set a password for an address they don't own.

The files contain no users (except the service account of the app registration site), signing keys or IDs: Keycloak creates those. Values from `.env` are placeholders (`${SMTP_FROM}`, `${IDP_GOOGLE_CLIENT_SECRET}`, ...); Keycloak doesn't start while one of them is missing (`Missing in .env: ...` in its log).

### Google and GitHub (idp realm)

The `idp` realm offers login with Google and GitHub. The `lab` realm doesn't: its accounts are tied to institutional email addresses (institutional login may be added later). Register an OAuth app at both, with this redirect URI (callback URL):

```
https://auth.example.org/realms/idp/broker/<google or github>/endpoint
```

* **Google:** in the [Google Cloud console](https://console.cloud.google.com/apis/credentials), **Create credentials → OAuth client ID → Web application**, with the redirect URI above. The OAuth consent screen needs the scopes `openid`, `email` and `profile`, and must be published (**In production**), otherwise only test users can log in.
* **GitHub:** under the organization's **Settings → Developer settings → OAuth Apps → New OAuth App**, with the redirect URI above as **Authorization callback URL**. Email addresses from GitHub are not trusted as verified: Keycloak verifies them itself.

Put the client IDs and secrets in `.env` (`IDP_GOOGLE_CLIENT_ID`, `IDP_GOOGLE_CLIENT_SECRET`, `IDP_GITHUB_CLIENT_ID`, `IDP_GITHUB_CLIENT_SECRET`). The import stores the secrets in Keycloak's database. The admin console never shows them, and Keycloak only sends a secret to the provider it was entered for: an admin who changes where a provider points must enter the secret again.

### Email: the relay

All email of the `lab` and `idp` realms goes through the email relay (`mail-relay`, a Postfix container), which sends it on to the email provider. `master` has no email: admin access never depends on an inbox.

* **Only the relay has the provider's password.** Keycloak sends to the relay without a password, and only Keycloak can reach the relay (on its own internal network). A realm admin who points the realm's email settings elsewhere gets no password.
* **Only one sender address:** the relay refuses emails from any other address than `SMTP_FROM`.
* **A cap for the whole Keycloak instance:** at most `EMAIL_RELAY_LIMIT` emails per `EMAIL_RELAY_LIMIT_PERIOD` (default 400 per hour). Above it, the relay refuses emails until the period ends, and users see an error that the email could not be sent. It protects the monthly quota of the email provider; see [Email limits](#email-limits). Apply a change with `sudo docker compose up -d mail-relay`.
* **Queueing:** when the provider is unreachable, the relay keeps the emails and retries.

Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and `SMTP_FROM_NAME` in `.env`. The relay requires TLS to the provider: use port 587 (STARTTLS). For Scaleway Transactional Email: host `smtp.tem.scaleway.com`, user your Scaleway project ID, and as password an API secret key with only the permission to send email.

Check the relay's log (each email shows up with `status=sent`, or the reason it wasn't):

```bash
sudo docker compose logs mail-relay
```

### Check

Keycloak's log shows the import on the first start (`Realm 'lab' imported`, ...; on later starts: `already exists. Import skipped`):

```bash
sudo docker compose logs keycloak | grep -i import
```

Then check, in a private browser window:

* the `idp` login page (`https://auth.example.org/realms/idp/account`) shows Google and GitHub, and the `lab` login page doesn't;
* a user without a second factor is asked to set up OTP in `lab`, and not in `idp`;
* **Realm settings → Email → Test connection** works in both realms, and the email shows up in `sudo docker compose logs mail-relay`.

### Setting up a realm again

To set up `lab` or `idp` again from its file (e.g. after experiments, or to get the latest version of the file): make a backup ([Backups](#9-backups)), delete the realm in the admin console (**Manage realms** → the realm → **Action → Delete**; this deletes its users too), and restart Keycloak:

```bash
sudo docker compose restart keycloak
```

After setting up `idp` again, also restart the app registration site (`sudo docker compose restart app-registration`): it still holds a login token of the deleted realm. `master` is only imported on a new installation: on an existing one, it keeps its settings.

**Changes to the realm files after the realms were created** only reach a new realm. For `lab` and `idp` without users, set them up again as above. `master` keeps its settings. It still works with a password and a second factor; to bring it in line with the files by hand, in the admin console of `master`:

* **Recovery codes after OTP setup:** **Authentication → Required actions → Configure OTP**, the gear icon, turn on **Add Recovery Codes**.
* **Login action timeout:** **Realm settings → Sessions → Login action timeout**: 30 minutes.
* **Passkey login** (optional; it takes more steps, see `realms/README.md`): admins can do without it, and `master` gets it on a new installation.

**Updating from the version with keycloak-config-cli:** the `keycloak-config` client in `master` is no longer used, and it has admin rights: delete it (**Clients** → `keycloak-config` → **Action → Delete**), and remove `KEYCLOAK_CONFIG_SECRET` from `.env`. If `lab` and `idp` have no users yet, delete them and restart Keycloak to set them up from the files, as above. (From the version with a vault, also: put the SMTP password in `.env` as `SMTP_PASSWORD`, the idp client secrets as `IDP_GOOGLE_CLIENT_SECRET` and `IDP_GITHUB_CLIENT_SECRET`, set `SMTP_PORT=587`, and delete the `vault/` folder.)

### Changing the realm files

The files are the starting point and the documentation; the realms themselves are changed in the admin console. To keep a change in the files too:

* **Small changes:** edit the file directly, and run the checks:

    ```bash
    python3 check-realms.py
    ```

    It catches mistakes in flows that Keycloak accepts silently, e.g. a "Condition - sub-flow executed" that refers to a flow that doesn't exist (which happens when a flow is copied in the admin console: the copy keeps the old name), and placeholders that `docker-compose.yml` doesn't pass to Keycloak.
* **New values from `.env`:** write `${NAME}` (upper case), and add `NAME` to the environment of the `keycloak` service in `docker-compose.yml`. Lower-case placeholders, e.g. `${role_admin}`, are Keycloak's own texts.
* **Larger changes:** make them in the admin console of a test installation, and export the realm (**Realm settings → Action → Partial export**, with clients, groups and roles). Then put the placeholders back for the secrets and hostnames, and compare with the old file before replacing it.

## 8. App registration

The [app registration site](./app-registration.md) at `https://apps.example.org` lets anyone with an account in the `idp` realm register apps (OIDC clients) and manage their settings. Its client and service account are created by the realm import ([step 7](#7-realms)), with the secret from `APP_REGISTRATION_CLIENT_SECRET`. How it works, its limits, and how to raise them for a user: see [App registration](./app-registration.md).

## 9. Backups

`backup.sh` writes a compressed database dump (`pg_dump --format=custom`) to `/var/backups/keycloak`, and removes dumps older than 14 days. Run it once by hand:

```bash
sudo /opt/keycloak/societal-analytics-lab-infra/deploy/keycloak/backup.sh
```

Schedule it daily (03:15):

```bash
echo '15 3 * * * root /opt/keycloak/societal-analytics-lab-infra/deploy/keycloak/backup.sh >> /var/log/keycloak-backup.log 2>&1' | sudo tee /etc/cron.d/keycloak-backup
```

* **The dumps are sensitive:** they contain user data, password hashes, client secrets and the realm signing keys. The backup folder is only readable by root.
* **Keycloak has no master key:** the database dump (plus `.env`, `caddy/admin-access.caddy` and `caddy/email-tiers.caddy`) is all you need to restore. The internal certificate is not part of the backup: on a new VM, tls-init creates a new one.
* **Keycloak's register of running instances** (the `jgroups_ping` table) is left out of the dump. Restoring old entries would make Keycloak believe another instance is running.
* ==TODO: encryption and an off-site copy, once the lab's backup strategy is decided. Until then, the dumps are on the same VM, so they don't protect against losing the VM.==

**Restore** (tested; this replaces the current database):

```bash
cd /opt/keycloak/societal-analytics-lab-infra/deploy/keycloak
```

```bash
sudo docker compose stop keycloak
```

```bash
sudo docker compose exec -T postgres dropdb -U keycloak keycloak
```

```bash
sudo docker compose exec -T postgres createdb -U keycloak keycloak
```

```bash
sudo cat /var/backups/keycloak/<dump file> | sudo docker compose exec -T postgres pg_restore -U keycloak -d keycloak --no-owner
```

```bash
sudo docker compose start keycloak
```

Do a restore test after setting up the backups, e.g. on a test machine.

## 10. Maintenance

**Logs:**

```bash
sudo docker compose logs -f keycloak
```

A warning about deprecated features (`identity-brokering-api:v1`, `twitter-broker:v1`) being enabled by default is expected.

**The internal certificate** is valid for 10 years. Check its expiry date (shown in the output of tls-init):

```bash
sudo docker compose logs tls-init
```

To replace it (e.g. before it expires), create a new one, and restart Keycloak and Caddy so that both use it:

```bash
sudo docker compose run --rm tls-init renew
```

```bash
sudo docker compose restart keycloak caddy
```

**Upgrading Keycloak.** Keycloak has quarterly feature releases and frequent patch releases; follow the [Keycloak blog](https://www.keycloak.org/blog) for releases and security announcements.

1. Read the release notes and the [upgrading guide](https://www.keycloak.org/docs/latest/upgrading/) for the new version.
2. Make a backup with `backup.sh`.
3. Change the version in `docker-compose.yml` (`KEYCLOAK_IMAGE`, the only place where it is set). Preferably make the change in the repository, and get it onto the VM with `sudo -u keycloak git pull`.
4. Rebuild and restart. Keycloak migrates the database on start.

```bash
sudo docker compose build --pull && sudo docker compose up -d
```

**PostgreSQL:** change the image tag in `docker-compose.yml`, and run `sudo docker compose up -d`. Minor PostgreSQL versions (e.g. 18.7 to 18.8) need nothing else. A new major version (e.g. 18 to 19) needs a dump and restore; check that Keycloak supports it first.

**Caddy** is built with the rate limit module: change `CADDY_VERSION` in `Caddy.Dockerfile` (and, if needed, the pinned commit of the module), then rebuild with `sudo docker compose up -d --build caddy`.

**The realm files** stay importable after a Keycloak upgrade: Keycloak converts older realm files when it imports them. After a major upgrade, set up a test realm from the files once to check.

**The app registration site:** after `git pull`, rebuild it with `sudo docker compose up -d --build app-registration`.

### Email limits

Keycloak has no limit on the emails it sends. Without limits, anyone could use the registration and "forgot password" forms to send many emails: to bomb someone's inbox, or to use up the monthly quota of the email provider (after which nobody gets a verification or reset email until the next month). There are three limits:

| Limit | Where | Default | Counts | Above the limit |
| --- | --- | --- | --- | --- |
| **Per IP address** | Caddy; `.env`: `EMAIL_LIMIT_PER_IP` per `EMAIL_LIMIT_PER_IP_WINDOW` | 200 per hour | Requests that can send an email, plus registrations and first logins with Google or GitHub | That person sees "Too many attempts from your network" |
| **Per app** (client ID), only in `idp` | Caddy; `caddy/email-tiers.caddy` | 25 per 30 minutes; tier2 100, tier3 500 | Requests that can send an email, through that app | That person sees "This app has reached its limit for sign-ups and password resets" |
| **All email** | The relay; `.env`: `EMAIL_RELAY_LIMIT` per `EMAIL_RELAY_LIMIT_PERIOD` | 400 per hour | Emails actually sent | Keycloak can't send email; users see that the email could not be sent |

The requests that can send an email are the first visit to the "verify your email" page (after registering, or when a user with an unverified email address logs in) and submitting "forgot password". Logins (with password, OTP, passkey, Google or GitHub), token requests and refresh grants, and choosing the new password after the email link are never limited. (Users with a second factor enter it on the reset page after the link, which counts once more: a reset counts 1, or 2 with a second factor.)

**How they count:**

* **Caddy (per IP, per app): a sliding window.** A request is allowed if fewer than the maximum were allowed in the last period, so spots free up one by one, each exactly one period after the request that took it. Refused requests are not counted, so trying again doesn't make the wait longer. The error page sends the wait time as `Retry-After`.
* **The relay (all email): a fixed period.** The count starts at the first email and is reset when the period ends. Above the cap, all email is refused until then (from seconds to the whole period), after which the full number is available again. Refused emails are not queued: users have to try again.
* **Why the limit on all email is only in the relay:** Caddy counts requests, and anyone can send requests that make Keycloak send nothing (e.g. reloading a page, or invalid requests). A limit on all requests together in Caddy could be used up by one person, and would block sign-ups for everyone. The relay only counts emails that were actually sent, which one person can't do in large numbers, because of the limit per IP address. So the cap on all email is only reached by an attack from many addresses, or by email that doesn't pass Caddy (e.g. emails that admins trigger).

**Choosing the numbers:**

* **All email** protects the provider's monthly quota (check it in the provider's console; for Scaleway under the project's quotas). Keep the cap well below it: an attack that keeps going sends at most the cap per period, e.g. 400 × 24 = 9,600 per day. Set up a usage alert at the provider (e.g. at half the monthly quota) if it offers one: an attack that stays below the cap is only visible in the usage, and in the logs below.
* **Per IP address** is generous, because many people can share one address (e.g. a class on a campus network): 200 per hour is about 100 sign-ups per hour from one address. It must stay well below the cap on all email, so that one address can't use that up.
* **Per app, only in `idp`:** anyone can register there, and register apps, so each app has its own limit: one app (or someone abusing its login page) can't use up the email for all others. Other realms have no limits per app, only the limit per IP address and the cap on all email.

**Tiers per app (idp).** Every app gets `default`. Give a higher tier to apps whose owners you trust (e.g. because they asked for more, and you know them). `caddy/email-tiers.caddy` (copied from `caddy/email-tiers.example.caddy` in step 2) holds both the tiers and the list of apps with a higher tier, e.g.:

```
(email_tier_limits) {
	import email_tier default 25 30m
	import email_tier tier2 100 30m
	import email_tier tier3 500 30m
}

(email_tier_apps) {
	account-console      tier2
	app-registration     tier2
	survey-tool-1890fa   tier2
}
```

Edit it with `sudo -u keycloak nano caddy/email-tiers.caddy`, and apply it with a reload, which keeps the current counts:

```bash
sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

If the file contains a mistake, the reload fails with an error message and Caddy keeps running with the previous settings: fix the file before Caddy is restarted (e.g. by a reboot), because Caddy doesn't start with an invalid file.

* **New apps** are not added anywhere: apps that are not listed get `default`. Tiers are only assigned by hand.
* **Keycloak's own apps** are each shared by all users of the realm, so the template gives them tier2: `account-console` (where users manage their account, and can also register or reset their password) and `app-registration` (the app registration site). On an installation whose `caddy/email-tiers.caddy` was created before they were in the template, add these two lines by hand.
* **More tiers:** add a line to `email_tier_limits` (a name, a number, a period), and use the name in `email_tier_apps`.
* **The limit per app can't be avoided** by leaving out or changing the client ID in the URL: Keycloak then refuses the request and sends nothing (tested). Someone can use up an app's limit on purpose, but then only sign-ups and password resets through that app pause; its logins keep working.

**Is a limit being hit?** Caddy logs every refused request, with the limit (`zone`) and what was counted (`key`: the IP address, or the client ID), and the relay logs every refused email:

```bash
sudo docker compose logs caddy | grep 'rate limit exceeded'
```

```bash
sudo docker compose logs mail-relay | grep -E 'rate limit exceeded|reject'
```

The counts are kept in memory: a restart of Caddy or the relay resets them (a Caddy reload doesn't).

### Adding lab members

`lab` has no registration form: only people we add can use it. We add them without a password and without sending anything. When they want to use a lab service, they click **First time, or forgot your password?** on the login page. Keycloak then emails them a link (only if they are a member; the page says the same to everyone). After the link, in one go, they choose a password, fill in their name, set up an authenticator app and save their recovery codes, and they are logged in.

1. Write the members to a file, e.g. `members.json`. An import doesn't fill anything in by itself, so each user needs a username (the email address) and the realm's default roles (`default-roles-lab`). Without these roles, users can log in, but the account page shows "Sorry, an unexpected error has occurred" (its requests are refused with 401):

    ```json
    {
      "users": [
        {"username": "j.doe@example.org", "email": "j.doe@example.org", "enabled": true, "emailVerified": true, "realmRoles": ["default-roles-lab"]},
        {"username": "a.smith@example.org", "email": "a.smith@example.org", "enabled": true, "emailVerified": true, "realmRoles": ["default-roles-lab"]}
      ]
    }
    ```

2. In the admin console of `lab`: **Realm settings → Action** (top right) **→ Partial import**, choose the file, tick **Users**, choose **Skip** for existing users, and click **Import**. If it fails, the reason is in the log: `sudo docker compose logs --since 10m keycloak | grep -E "WARN|ERROR"`.
3. Tell the members, e.g.: *"Go to <a lab service, or https://auth.example.org/realms/lab/account>, click 'First time, or forgot your password?', and enter your VU email address. You'll get an email with a link to set your lab password (not your VU password). You'll also need an authenticator app on your phone, e.g. Microsoft Authenticator."*

One member at a time: **Users → Add user**, with the email address (and **Email verified** on); users added this way get the default roles automatically.

Members imported without `default-roles-lab`: import the file again with the roles and **Overwrite** (this recreates them, so members who already set a password start again with "First time?"), or give one user the role in **Users → the user → Role mapping → Assign role** (filter by realm roles).

The texts on the login pages and the email subject ("Sign in with your lab account", "First time, or forgot your password?", "Set your lab password", ...) are realm overrides (`localizationTexts`) in `realms/lab-realm.json`; change them in **Realm settings → Localization → Realm overrides**.

### A user lost their second factor

First check who the user is, not by email alone (the inbox may be the problem): e.g. in person, or by a video call. Then, in the admin console of the realm: **Users** → the user → **Credentials**, and delete the lost credential (e.g. **otp**). In `lab`, the user sets up a new authenticator app (and new recovery codes) at the next login; in `idp`, they can set up a new one in the account console. For an admin in `master`, another admin does the same, or see below.

Users who still have a recovery code don't need us: they log in with it, and set up a new second factor themselves (see [How users log in](./keycloak.md#how-users-log-in)).

### Recovering admin access

Recovering admin access (e.g. a lost authenticator app, or no admin left), following the [recovery guide](https://www.keycloak.org/server/bootstrap-admin-recovery). This requires access to the VM, which is the break-glass route. Stop Keycloak and create a temporary admin (you are prompted for a password):

```bash
sudo docker compose stop keycloak
```

```bash
sudo docker compose run --rm keycloak bootstrap-admin user --optimized --username recovery-admin
```

```bash
sudo docker compose start keycloak
```

Log in to the admin console as `recovery-admin`, fix the problem (e.g. delete the lost OTP credential on the admin's **Credentials** tab), and delete `recovery-admin` again.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| `cd /opt/keycloak/...` gives `Permission denied` | Your account is not in the `keycloak` group yet, or you haven't logged in again since adding it. Check with `id`. |
| `permission denied while trying to connect to the Docker daemon socket` | The command was run without `sudo` (see [Users and permissions](#users-and-permissions)). |
| `sudo: ... is not in the sudoers file` while logged in as `keycloak` | Docker commands are run from your own admin account, not as `keycloak`. |
| No certificate, or browser warnings | The DNS record doesn't point to the VM yet, or port 80 is blocked. Check `sudo docker compose logs caddy`. |
| Admin console stays on a loading spinner | The frontend URL of `master` is wrong: check `KC_HOSTNAME_ADMIN` in `.env`, or, on an installation from before the realm files, step 3. |
| Admin hostname returns 403 while on the VPN | Your IP address is not in the ranges in `caddy/admin-access.caddy`. Check `curl -4 https://ifconfig.me` on your device. After changing the file, run `sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`. |
| A reload of Caddy fails, or Caddy doesn't start after a restart | A mistake in `caddy/admin-access.caddy` or `caddy/email-tiers.caddy`: the error message names the file and line. Fix it and reload again (`sudo docker compose up -d caddy` if Caddy is not running). |
| The admin console of a realm with an exception stays on "Loading", or shows a permission error | The exception is missing `/resources/*` or `/admin/serverinfo`, or the realm name in the paths is misspelled (see step 4). |
| Requests through Caddy return 502 Bad Gateway | Keycloak is still starting, or Caddy doesn't trust Keycloak's internal certificate (e.g. after `tls-init renew` without restarting Caddy). Run `sudo docker compose restart caddy`, and check `sudo docker compose logs caddy`. |
| Requests through Caddy return 403 Forbidden | `KC_PROXY_HEADERS` is not set to `xforwarded`, so Keycloak's origin checks fail (see the reverse proxy guide). |
| Keycloak doesn't start: `Missing in .env: ...` | A value used in the realm files is not set in `.env` (see [step 7](#7-realms)). |
| Keycloak doesn't start on the first start: `invalidPasswordMinUpperCaseCharsMessage` (or a similar password message) | `KC_BOOTSTRAP_ADMIN_PASSWORD` doesn't meet the password policy of `master` (at least 10 characters, an uppercase letter and a digit). Generate a new one (step 2), and remove the database volume of this failed first start: `sudo docker compose down -v` (only on a new installation: this deletes all data). |
| Locked out of the admin console after turning on **Verify email** in `master` | `master` has no email server, so the verification email never arrives. Don't turn it on (the realm configuration keeps it off). To recover, follow [Recovering admin access](#recovering-admin-access), but create a service account (`bootstrap-admin service --optimized --client-id recovery`) instead of a user, because a new user would also have to verify their email. Log in to the admin tool with `sudo ./admin-cli.sh config credentials --server https://localhost:8443 --realm master --client recovery --secret <secret>` (after `sudo ./admin-cli.sh login` has set up the truststore; its password prompt may fail), turn verification off with `sudo ./admin-cli.sh update realms/master -s verifyEmail=false`, and delete the `recovery` client. |
| After renaming a realm, the account console or admin console of that realm doesn't load | Keycloak doesn't update the URLs of the built-in clients (`account`, `account-console`, `security-admin-console`): fix their root and redirect URLs by hand, or create the realm again with the new name. |
| `admin-cli.sh login` fails with `Account is not fully set up` | The account has no email address, while the realm uses email addresses as usernames and has the required action **Update email** turned on. The realm configuration keeps **Update email** off in `master` for this reason; check **Authentication → Required actions** in `master`. |
| A login flow asks for OTP twice, or not at all | A "Condition - sub-flow executed" refers to a flow name that doesn't exist (e.g. after copying a flow). Run `python3 check-realms.py`. |
| Users see that an email could not be sent | The relay refused or couldn't deliver it. `sudo docker compose logs mail-relay` shows why, e.g. the cap was reached (`Message delivery request rate limit exceeded`), a wrong sender address in a realm (`Sender address rejected`), or a login or TLS problem with the provider. |
| The app registration site restarts continuously | The `idp` realm doesn't exist yet (Keycloak imports it when it starts: check `sudo docker compose logs keycloak | grep -i import`), or a value is missing in `.env`: check `sudo docker compose logs app-registration`. |
| Users see "Please try again later" | An email limit was reached (see [Email limits](#email-limits)). The message says which: their network, or the app. |
| `WARN ... configured to build using Bake, but buildx isn't installed` | Harmless: Compose falls back to the classic build. To remove the warning, install the buildx plugin (`sudo apt install docker-buildx-plugin`, with Docker from Docker's own repository). |

## Why it is set up this way

* **Optimized image:** recommended in [Running Keycloak in a container](https://www.keycloak.org/server/containers). Build options are baked in, so starts are faster and predictable.
* **Re-encrypt, `KC_PROXY_HEADERS=xforwarded`:** the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy) prefers re-encrypt over edge termination (plain HTTP between proxy and Keycloak). Caddy still terminates the public TLS connection, so it can filter paths and IP addresses; Keycloak only accepts HTTPS. Caddy overwrites the `X-Forwarded-*` headers, and Keycloak is only reachable through the internal network. Passthrough (Keycloak handling the public certificate) would make the path and IP filtering impossible.
* **The internal certificate is self-signed and long-lived:** it is only trusted by Caddy (and the admin tool), never by browsers, and its key never leaves the VM.
* **Only `/realms/`, `/resources/` and `/.well-known/` are public:** the exposed paths recommended in the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy#_exposed_path_recommendations). `/admin/` and `/realms/master/` are internal only.
* **The health endpoint on plain HTTP** (`KC_HTTP_MANAGEMENT_SCHEME=http`): the management port (9000) is only used by the container's health check, and is not exposed (see the [management interface guide](https://www.keycloak.org/server/management-interface)).
* **A separate admin hostname** (`KC_HOSTNAME_ADMIN`), see the [hostname guide](https://www.keycloak.org/server/hostname). The `hostname-admin` option alone doesn't block the admin API on the public hostname; Caddy does that.
* **IP restriction of the admin hostname in a local file:** restricting the administration interfaces, and the `master` realm in particular, follows Keycloak's recommendations. The ranges and exceptions are specific to each installation, so they live in `caddy/admin-access.caddy` on the VM instead of in the repository.
* **All Caddy settings in one folder:** `caddy/` holds the Caddyfile, the templates, and the local copies (same pattern as `.env.example` and `.env`). The folder is mounted instead of single files, because Docker keeps showing the old version of a single mounted file after an editor replaces it, so that a reload would silently not apply the change. `.env` stays next to `docker-compose.yml`, where Compose reads it, and out of Caddy's container. A missing local copy is created from its template before Caddy starts, because Caddy doesn't start without it.
* **Exceptions for specific realms:** not a Keycloak recommendation, but a deliberate choice to let admins outside our network manage their own realm. It makes that realm's admin console reachable for them, behind its own login and 2FA, and keeps the `master` realm restricted.
* **PostgreSQL 18:** the version Keycloak 26.8 is tested with.
* **Realm files imported by Keycloak itself:** the realms are set up once from complete realm files, with Keycloak's own import (no extra tools with admin rights). They document how the realms are configured, and make it easy to set them up again; later changes are made in the admin console. (An earlier version used keycloak-config-cli, a third-party tool that applies changes again and again; that needs an admin client with a secret on the server, for a workflow we don't use.)
* **An email relay instead of Keycloak's own SMTP login:** Keycloak would send its SMTP password to whatever server a realm admin enters. With the relay, Keycloak has no password to give away, and the relay adds a cap, a fixed sender address and a queue. (An earlier version kept secrets in Keycloak's [file vault](https://www.keycloak.org/server/vault): that keeps them out of the database, but a realm admin can use a vault reference anywhere, and so send the secret to their own server. Tested, so we don't use it.)
* **The idp's Google and GitHub secrets in the database:** Keycloak masks them, and requires them again when a provider is pointed elsewhere, so a realm admin can't send them to their own server.
* **Email limits in Caddy and the relay:** Keycloak has no limit on how many emails it sends; brute force detection only covers logins. Caddy blocks only the requests that send an email, so a limit never breaks logins or the sessions of an app, and the limit per app keeps one app (or someone abusing its login page) from using up everything. The cap on all email is in the relay, because only the relay counts emails that were actually sent (see [Email limits](#email-limits)).
* **2FA with OTP as the default to set up:** OTP works on every device and doesn't depend on a particular platform; passkeys and security keys can be added in the account console.
* **Temporary bootstrap admin, replaced by a permanent admin with 2FA:** see [Bootstrapping and recovering an admin account](https://www.keycloak.org/server/bootstrap-admin-recovery).

## Next steps

* Work through the [test checklist](./auth-providers.md#keycloak-test-checklist), including real logins with Google and GitHub.
* Institutional login for the `lab` realm (e.g. via the university).
* Encrypted, off-site backups (part of the lab's backup strategy).
