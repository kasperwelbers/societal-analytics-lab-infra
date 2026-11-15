# Keycloak deployment

Keycloak with PostgreSQL behind Caddy (TLS via Let's Encrypt), for a single VM.

Setup, checks, backups, upgrades and recovery are described in the runbook: [docs/keycloak-deploy.md](../../docs/keycloak-deploy.md) (also on the documentation site).

The files are owned by a `keycloak` system user, and Docker is run with `sudo` from your own admin account, which must be in the `keycloak` group (see "Users and permissions" in the runbook). In short, from this folder:

```bash
sudo -u keycloak cp .env.example .env && sudo -u keycloak chmod 600 .env   # then: sudo -u keycloak nano .env
sudo docker compose up -d --build
```

Then continue with step 3 of the runbook (pointing the admin realm to the admin hostname with `sudo ./admin-cli.sh`).
