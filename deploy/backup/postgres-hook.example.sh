#!/usr/bin/env bash
# Example dump script for an app with a PostgreSQL database. Copy it to /opt/backup/hooks.d/<app>.sh
# (owned by root) and fill in the app, the compose service, the database user and the database.
# The dump overwrites the previous one: restic keeps the history.
set -euo pipefail

app=<app>             # the folder in /opt
service=<service>     # the database service in the app's compose file
user=<user>
database=<database>

cd "/opt/$app"        # the folder with the compose file
mkdir -p "/opt/$app/backups"
docker compose exec -T "$service" pg_dump -U "$user" -d "$database" --format=custom > "/opt/$app/backups/$database.dump.partial"
mv "/opt/$app/backups/$database.dump.partial" "/opt/$app/backups/$database.dump"
