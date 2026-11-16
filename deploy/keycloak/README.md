# Keycloak deployment

Keycloak with PostgreSQL behind Caddy (TLS via Let's Encrypt), for a single VM.

Setup, checks, backups, upgrades and recovery are described in the runbook: [docs/keycloak-deploy.md](../../docs/keycloak-deploy.md) (also on the documentation site).

The files are owned by a `keycloak` system user, and Docker is run with `sudo` from your own admin account, which must be in the `keycloak` group (see "Users and permissions" in the runbook). In short, from this folder:

```bash
sudo -u keycloak cp .env.example .env && sudo -u keycloak chmod 600 .env   # then: sudo -u keycloak nano .env
sudo -u keycloak cp caddy/admin-access.example.caddy caddy/admin-access.caddy   # then: add your IP ranges (step 4)
sudo -u keycloak cp caddy/email-tiers.example.caddy caddy/email-tiers.caddy
sudo docker compose up -d --build
```

Then continue with the checks in step 3 of the runbook.

| Folder or file | |
| --- | --- |
| `realms/` | The realms (`master`, `lab`, `idp`) as Keycloak realm files, imported by Keycloak on start when a realm doesn't exist yet (runbook step 7, and `realms/README.md`). Check changes with `python3 check-realms.py`. |
| `caddy/` | Everything for Caddy: the Caddyfile, and the local settings `admin-access.caddy` (admin restrictions, step 4) and `email-tiers.caddy` (email limits per app), copied from the `*.example.caddy` templates next to them. The local copies are never committed; a missing one is created from its template on start. |
| `app-registration/` | The app registration site ([docs/app-registration.md](../../docs/app-registration.md)). |
