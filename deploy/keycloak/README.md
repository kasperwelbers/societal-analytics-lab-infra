# Keycloak deployment

Keycloak with PostgreSQL behind Caddy (TLS via Let's Encrypt), for a single VM.

Setup, checks, backups, upgrades and recovery are described in the installation guide: [docs/install/keycloak.md](../../docs/install/keycloak.md) (also on the documentation site).

The files are owned by a `keycloak` system user, and Docker is run with `sudo` from your own admin account, which must be in the `keycloak` group (see "Users and permissions" in the installation guide (docs/install/keycloak.md)). In short, from this folder:

```bash
sudo -u keycloak cp .env.example .env && sudo -u keycloak chmod 600 .env   # then: sudo -u keycloak nano .env
sudo -u keycloak cp caddy/admin-access.example.caddy caddy/admin-access.caddy   # then: add your IP ranges (step 4)
sudo docker compose up -d --build
```

Then continue with the checks in step 3 of the installation guide.

| Folder or file | |
| --- | --- |
| `realms/` | The realms (`master`, `lab`, `idp`) as Keycloak realm files, imported by Keycloak on start when a realm doesn't exist yet (installation guide step 7, and `realms/README.md`). Check changes with `python3 check-realms.py`. |
| `caddy/` | Everything for Caddy: the Caddyfile, and the local setting `admin-access.caddy` (admin restrictions, step 4), copied from the template `admin-access.example.caddy` next to it. The local copy is never committed; if it is missing, it is created from the template on start. |
| `themes/` | Our login pages, account console and emails (logo, colours, texts): `themes/README.md`. |
