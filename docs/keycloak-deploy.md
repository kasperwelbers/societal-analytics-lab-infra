# Keycloak deployment

This runbook sets up Keycloak on a single VM, with PostgreSQL and Caddy (TLS via Let's Encrypt), using the files in [`deploy/keycloak/`](https://github.com/kasperwelbers/societal-analytics-lab-infra/tree/main/deploy/keycloak). It takes about an hour. Why Keycloak is being evaluated is explained in the [OIDC provider comparison](./auth-providers.md); what to test after the setup is in its [test checklist](./auth-providers.md#keycloak-test-checklist).

!!! info "Placeholders"
    This page uses `auth.example.org` (public hostname) and `auth-admin.example.org` (admin hostname). The real hostnames, IP ranges and secrets are only stored in `.env` on the VM.

## Overview

| Component | Role |
| --- | --- |
| **Caddy** | Public TLS certificates via Let's Encrypt. Forwards only the paths that need to be public to Keycloak, over a second TLS connection (re-encrypt). |
| **Keycloak** | An optimized image (built from the official image), started with `start --optimized`. Only accepts HTTPS, with an internal certificate that only Caddy trusts. |
| **tls-init** | A one-off service that creates the internal certificate on the first start (and does nothing on later starts). |
| **PostgreSQL** | The database, only reachable by Keycloak. |

Two TLS connections:

* **Browser to Caddy:** the public certificates from Let's Encrypt, which Caddy renews automatically.
* **Caddy to Keycloak:** an internal certificate, valid for 10 years, which is never shown to browsers. Caddy trusts exactly this certificate. This is the *re-encrypt* setup preferred in the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy), so that traffic between Caddy and Keycloak is encrypted too.

Two hostnames:

* **`auth.example.org`** (public): logins, OIDC endpoints and static resources (`/realms/`, `/resources/`, `/.well-known/`). Everything else returns 404, including the admin console and the admin realm (`master`).
* **`auth-admin.example.org`** (admin): the admin console and the `master` realm, only reachable from the IP ranges in `ADMIN_ALLOWED_IPS` (e.g. the university network and its VPN).

| File | Contents |
| --- | --- |
| `docker-compose.yml` | The three services, pinned versions, memory limits, health checks, and two networks (the database network has no internet access) |
| `Dockerfile` | The optimized Keycloak image (`kc.sh build` with PostgreSQL and health endpoints) |
| `internal-tls.sh` | Creates the internal certificate (run by the tls-init service) |
| `admin-cli.sh` | Runs Keycloak's admin command-line tool (`kcadm.sh`) inside the container, over the internal TLS connection |
| `Caddyfile` | The public and admin hostnames |
| `.env.example` | All settings. Copied to `.env`, which holds the secrets and is never committed. |
| `backup.sh` | A database dump, for a daily cron job |

## 1. Prerequisites

**DNS.** Create two **A records** pointing to the VM's IPv4 address, e.g. `auth` and `auth-admin` in the zone of your domain. Don't create AAAA (IPv6) records: with IPv4 only, the IP restriction of the admin hostname only needs IPv4 ranges, and Let's Encrypt can't fail on a stale IPv6 address. If your DNS provider can proxy traffic (e.g. Cloudflare), use "DNS only", otherwise Caddy can't see visitors' IP addresses. Check from your own machine:

```bash
dig +short auth.example.org
```

**Ports.** Ports 80 and 443 must be reachable from the internet (Let's Encrypt needs port 80), and nothing else on the VM may use them. Check on the VM:

```bash
sudo ss -tlnp '( sport = :80 or sport = :443 )'
```

**Docker.** Docker Engine with the compose plugin ([installation](https://docs.docker.com/engine/install/)). The commands below assume your user may run `docker` (member of the `docker` group); otherwise prefix them with `sudo`.

```bash
docker compose version
```

**Admin IP ranges.** Find the ranges that may reach the admin console. Run this **on your own device** (not on the VM), connected to the VPN:

```bash
curl -4 https://ifconfig.me
```

Then look up the range that address belongs to (the `whois` port is blocked on some networks; this uses HTTPS):

```bash
curl -s https://rdap.db.ripe.net/ip/<your IP> | grep -E '"(name|startAddress|endAddress)"'
```

Check that `name` belongs to your institution, and write the range in CIDR notation (e.g. `startAddress 192.0.2.0` to `endAddress 192.0.2.255` is `192.0.2.0/24`). Repeat on campus without VPN if you also want access from there. Note that a whole institutional range includes everyone on that network: it is an extra layer, the admin console still requires an admin account with 2FA.

## 2. Installation

Get the files onto the VM:

```bash
sudo git clone https://github.com/kasperwelbers/societal-analytics-lab-infra.git /opt/societal-analytics-lab-infra
```

```bash
sudo chown -R "$USER" /opt/societal-analytics-lab-infra
```

```bash
cd /opt/societal-analytics-lab-infra/deploy/keycloak
```

Create `.env`, readable only by you:

```bash
cp .env.example .env && chmod 600 .env
```

Generate three secrets with the command below (run it once per secret), and paste them into `.env`: `POSTGRES_PASSWORD`, `INTERNAL_TLS_KEYSTORE_PASSWORD` and `KC_BOOTSTRAP_ADMIN_PASSWORD`.

```bash
openssl rand -hex 32
```

Fill in the other values in `.env`: both hostnames (without `https://`), `ADMIN_ALLOWED_IPS` (ranges separated by spaces), and `ACME_EMAIL` (for Let's Encrypt expiry notices). Store the secrets in your password manager as well.

```bash
nano .env
```

Build and start. The first time, this builds the Keycloak image, and the tls-init service creates the internal certificate:

```bash
docker compose up -d --build
```

Wait until Keycloak is `healthy` (about a minute):

```bash
docker compose ps
```

Check that Caddy obtained both certificates (look for `certificate obtained successfully`):

```bash
docker compose logs caddy | grep -i certificate
```

## 3. Point the admin realm to the admin hostname

**Required.** By default, the login pages of the `master` realm (used by the admin console) are served on the public hostname, where Caddy blocks them. Without this step, the admin console stays stuck on a loading spinner. Set the `master` realm's frontend URL to the admin hostname, with Keycloak's command-line tool inside the container.

The commands use `admin-cli.sh`, which runs Keycloak's admin tool (`kcadm.sh`) inside the container. Log in as the temporary admin (you are prompted for the `KC_BOOTSTRAP_ADMIN_PASSWORD` from `.env`):

```bash
./admin-cli.sh login
```

Set the frontend URL (use your real admin hostname):

```bash
./admin-cli.sh update realms/master -s attributes.frontendUrl=https://auth-admin.example.org
```

This changes the issuer of the `master` realm, so the login of the admin tool is no longer valid afterwards. For further `admin-cli.sh` commands, run `./admin-cli.sh login` again.

## 4. Checks

From your own device, **connected to the VPN**:

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

**Disconnect from the VPN**, and check that the admin hostname is refused (`403`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://auth-admin.example.org/admin/
```

## 5. Permanent admin account

Following [Bootstrapping and recovering an admin account](https://www.keycloak.org/server/bootstrap-admin-recovery): the bootstrap account is temporary, and must be replaced by a permanent admin with 2FA. The `master` realm is for administrators only; users never go in `master`.

1. On the VPN, open `https://auth-admin.example.org/admin/` and log in as `temp-admin`. A yellow banner says you are using a temporary admin account.
2. In the `master` realm, go to **Users → Add user**. Fill in a username and your email address, turn on **Email verified**, and under **Required user actions** choose **Configure OTP**. Click **Create**.
3. On the **Credentials** tab, click **Set password**, and turn off **Temporary**.
4. On the **Role mapping** tab, click **Assign role**, filter by realm roles, and assign **admin**.
5. Open a private browser window, go to the admin console, and log in as the new admin. Keycloak shows **Mobile Authenticator Setup**: scan the QR code with an authenticator app. Check that you can use the admin console.
6. As the new admin, go to **Users**, and delete `temp-admin`.
7. Remove the value of `KC_BOOTSTRAP_ADMIN_PASSWORD` from `.env`. It is only used on the very first start, but there is no reason to keep it.

By default, Keycloak asks for the second factor of every user who has one configured, so the permanent admin always needs their authenticator app.

## 6. First realm

Create the realm for the shared pool of users. Everything after these basics follows the [test checklist](./auth-providers.md#keycloak-test-checklist).

1. **Manage realms → Create realm**, with a short name (it becomes part of every URL, e.g. `https://auth.example.org/realms/<name>`).
2. **Realm settings → Login:** turn on **User registration**, **Verify email** and **Login with email**.
3. **Realm settings → Email:** the sender address and SMTP server. For Scaleway Transactional Email: host `smtp.tem.scaleway.com`, port `465`, **Enable SSL**, username your Scaleway project ID, password an API secret key. Click **Test connection**.
4. **Realm settings → Sessions:** **SSO Session Idle** and **SSO Session Max** to 30 minutes. Applications keep their own sessions; this only determines how long users stay signed in at Keycloak.

## 7. Backups

`backup.sh` writes a compressed database dump (`pg_dump --format=custom`) to `/var/backups/keycloak`, and removes dumps older than 14 days. Run it once by hand:

```bash
sudo /opt/societal-analytics-lab-infra/deploy/keycloak/backup.sh
```

Schedule it daily (03:15):

```bash
echo '15 3 * * * root /opt/societal-analytics-lab-infra/deploy/keycloak/backup.sh >> /var/log/keycloak-backup.log 2>&1' | sudo tee /etc/cron.d/keycloak-backup
```

* **The dumps are sensitive:** they contain user data, password hashes, client secrets and the realm signing keys. The backup folder is only readable by root.
* **Keycloak has no master key:** the database dump (plus `.env`) is all you need to restore. The internal certificate is not part of the backup: on a new VM, tls-init creates a new one.
* **Keycloak's register of running instances** (the `jgroups_ping` table) is left out of the dump. Restoring old entries would make Keycloak believe another instance is running.
* ==TODO: encryption and an off-site copy, once the lab's backup strategy is decided. Until then, the dumps are on the same VM, so they don't protect against losing the VM.==

**Restore** (tested; this replaces the current database):

```bash
cd /opt/societal-analytics-lab-infra/deploy/keycloak
```

```bash
docker compose stop keycloak
```

```bash
docker compose exec -T postgres dropdb -U keycloak keycloak
```

```bash
docker compose exec -T postgres createdb -U keycloak keycloak
```

```bash
sudo cat /var/backups/keycloak/<dump file> | docker compose exec -T postgres pg_restore -U keycloak -d keycloak --no-owner
```

```bash
docker compose start keycloak
```

Do a restore test after setting up the backups, e.g. on a test machine.

## 8. Maintenance

**Logs:**

```bash
docker compose logs -f keycloak
```

A warning about deprecated features (`identity-brokering-api:v1`, `twitter-broker:v1`) being enabled by default is expected.

**The internal certificate** is valid for 10 years. Check its expiry date (shown in the output of tls-init):

```bash
docker compose logs tls-init
```

To replace it (e.g. before it expires), create a new one, and restart Keycloak and Caddy so that both use it:

```bash
docker compose run --rm tls-init renew
```

```bash
docker compose restart keycloak caddy
```

**Upgrading Keycloak.** Keycloak has quarterly feature releases and frequent patch releases; follow the [Keycloak blog](https://www.keycloak.org/blog) for releases and security announcements.

1. Read the release notes and the [upgrading guide](https://www.keycloak.org/docs/latest/upgrading/) for the new version.
2. Make a backup with `backup.sh`.
3. Change the version in `docker-compose.yml` (`KEYCLOAK_IMAGE`, the only place where it is set).
4. Rebuild and restart. Keycloak migrates the database on start.

```bash
docker compose build --pull && docker compose up -d
```

**PostgreSQL and Caddy:** change the image tag in `docker-compose.yml`, and run `docker compose up -d`. Minor PostgreSQL versions (e.g. 18.7 to 18.8) need nothing else. A new major version (e.g. 18 to 19) needs a dump and restore; check that Keycloak supports it first.

**Recovering admin access** (e.g. a lost authenticator app, or no admin left), following the [recovery guide](https://www.keycloak.org/server/bootstrap-admin-recovery). This requires access to the VM, which is the break-glass route. Stop Keycloak and create a temporary admin (you are prompted for a password):

```bash
docker compose stop keycloak
```

```bash
docker compose run --rm keycloak bootstrap-admin user --optimized --username recovery-admin
```

```bash
docker compose start keycloak
```

Log in to the admin console as `recovery-admin`, fix the problem (e.g. delete the lost OTP credential on the admin's **Credentials** tab), and delete `recovery-admin` again.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| No certificate, or browser warnings | The DNS record doesn't point to the VM yet, or port 80 is blocked. Check `docker compose logs caddy`. |
| Admin console stays on a loading spinner | Step 3 (frontend URL of the `master` realm) was skipped or has a typo. |
| Admin hostname returns 403 while on the VPN | Your IP address is not in `ADMIN_ALLOWED_IPS`. Check `curl -4 https://ifconfig.me` on your device. After changing `.env`, run `docker compose up -d caddy`. |
| Requests through Caddy return 502 Bad Gateway | Keycloak is still starting, or Caddy doesn't trust Keycloak's internal certificate (e.g. after `tls-init renew` without restarting Caddy). Run `docker compose restart caddy`, and check `docker compose logs caddy`. |
| Requests through Caddy return 403 Forbidden | `KC_PROXY_HEADERS` is not set to `xforwarded`, so Keycloak's origin checks fail (see the reverse proxy guide). |

## Why it is set up this way

* **Optimized image:** recommended in [Running Keycloak in a container](https://www.keycloak.org/server/containers). Build options are baked in, so starts are faster and predictable.
* **Re-encrypt, `KC_PROXY_HEADERS=xforwarded`:** the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy) prefers re-encrypt over edge termination (plain HTTP between proxy and Keycloak). Caddy still terminates the public TLS connection, so it can filter paths and IP addresses; Keycloak only accepts HTTPS. Caddy overwrites the `X-Forwarded-*` headers, and Keycloak is only reachable through the internal network. Passthrough (Keycloak handling the public certificate) would make the path and IP filtering impossible.
* **The internal certificate is self-signed and long-lived:** it is only trusted by Caddy (and the admin tool), never by browsers, and its key never leaves the VM.
* **Only `/realms/`, `/resources/` and `/.well-known/` are public:** the exposed paths recommended in the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy#_exposed_path_recommendations). `/admin/` and `/realms/master/` are internal only.
* **The health endpoint on plain HTTP** (`KC_HTTP_MANAGEMENT_SCHEME=http`): the management port (9000) is only used by the container's health check, and is not exposed (see the [management interface guide](https://www.keycloak.org/server/management-interface)).
* **A separate admin hostname** (`KC_HOSTNAME_ADMIN`), see the [hostname guide](https://www.keycloak.org/server/hostname). The `hostname-admin` option alone doesn't block the admin API on the public hostname; Caddy does that.
* **PostgreSQL 18:** the version Keycloak 26.8 is tested with.
* **Temporary bootstrap admin, replaced by a permanent admin with 2FA:** see [Bootstrapping and recovering an admin account](https://www.keycloak.org/server/bootstrap-admin-recovery).

## Next steps

* Work through the [test checklist](./auth-providers.md#keycloak-test-checklist).
* Configuration as code: once the realm settings are clear, keep them in this repository (realm export or [keycloak-config-cli](https://github.com/adorsys/keycloak-config-cli)), so that realms, clients and policies can be rebuilt as well.
* Encrypted, off-site backups (part of the lab's backup strategy).
