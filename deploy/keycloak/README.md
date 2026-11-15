# Keycloak deployment

Keycloak with PostgreSQL behind Caddy (TLS via Let's Encrypt), for a single VM.

Setup, checks, backups, upgrades and recovery are described in the runbook: [docs/keycloak-deploy.md](../../docs/keycloak-deploy.md) (also on the documentation site).

Quick start, after the prerequisites in the runbook (DNS, ports, Docker):

```bash
cp .env.example .env && chmod 600 .env   # then fill in .env
docker compose up -d --build
```

Then continue with step 3 of the runbook (pointing the admin realm to the admin hostname with `./admin-cli.sh`).
