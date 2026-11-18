#!/usr/bin/env bash
# Dump the Keycloak database to /opt/keycloak/backups/keycloak.dump (overwriting the previous dump).
# Run by the server's nightly backup as a hook (/opt/backup/hooks.d/keycloak.sh), which then backs up
# /opt with restic, so restic keeps the history. See docs/install/backups.md.
# Usage: sudo ./backup.sh   (from anywhere)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/keycloak/backups}"

cd "$(dirname "$0")"
umask 077
mkdir -p "$BACKUP_DIR"

target="$BACKUP_DIR/keycloak.dump"

# Custom format: compressed, and restorable with pg_restore.
# jgroups_ping is Keycloak's register of running instances: restoring old entries makes a
# new instance believe another one is running, so only its structure is backed up.
docker compose exec -T postgres pg_dump -U keycloak -d keycloak --format=custom --exclude-table-data=jgroups_ping > "$target.partial"
mv "$target.partial" "$target"

echo "$(date -Is) backup written: $target ($(du -h "$target" | cut -f1))"
