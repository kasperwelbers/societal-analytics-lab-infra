#!/usr/bin/env bash
# Dump the Keycloak database to a local folder, and remove dumps older than KEEP_DAYS.
# Usage: ./backup.sh   (run from anywhere; meant for a daily cron job)
#
# TODO: encryption and an off-site copy, once the lab's backup strategy is decided.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/keycloak}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$(dirname "$0")"
umask 077
mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/keycloak-$timestamp.dump"

# Custom format: compressed, and restorable with pg_restore
docker compose exec -T postgres pg_dump -U keycloak -d keycloak --format=custom > "$target.partial"
mv "$target.partial" "$target"

find "$BACKUP_DIR" -name 'keycloak-*.dump' -type f -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup written: $target ($(du -h "$target" | cut -f1))"
