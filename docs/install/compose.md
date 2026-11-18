# Installation: Docker Compose standards

Every app on our servers runs with Docker Compose, from a `compose.yml` at the top of its folder, `/opt/<app>/compose.yml`. One way of working, so the examples below apply everywhere, and every app's setup can be read in one file. How an app is installed (the system account, the steps): [Apps on our servers](apps.md).

| In the app's folder | What | Backed up by us |
| --- | --- | --- |
| `compose.yml` | The services of the app | Yes |
| `.env` | Settings and secrets, readable only by `sal` | Yes |
| `data/` | Files that must be kept | Yes |
| `backups/` | Database dumps, made by the app's backup service | Yes |
| Named volumes | Everything else: caches, models, a database's own files, data with a short retention | No |

Everything in `/opt` is backed up every night ([Backups](backups.md)). The named volumes are only in the server backups of VU IT, the last resort.

Paths in a compose file (`./data`) count from the folder of the compose file. Docker creates a missing folder owned by root: create `data/` as `sal` before the first start ([Docker warnings](docker.md#directories-for-bind-mounts)). `backups/` may be created by Docker: the dumps are only for root anyway.

## A basic app

```yaml
services:
  app:
    image: example/app:1.2.3          # a fixed version, never "latest"
    restart: unless-stopped
    env_file: .env                    # settings and secrets
    ports:
      - "127.0.0.1:8080:8080"         # only for Caddy on this server, never "8080:8080"
```

* **A fixed version:** upgrades happen when we change the version, after reading the release notes.
* **Ports only on `127.0.0.1`:** a port published without it is open to the whole internet, whatever the firewall says ([Docker warnings](docker.md#published-ports-bypass-the-firewall)). Services that talk to each other (an app and its database) use the compose network, without publishing a port at all.
* **Our own code:** put it in `/opt/<app>/src`, and build it with `build: ./src` instead of `image:`.

## Files that must be kept

```yaml
services:
  app:
    # ...
    volumes:
      - ./data:/app/data              # kept and backed up
```

Before the first start, as `sal`:

```bash
sudo -u sal mkdir /opt/<app>/data
```

If the container runs as its own user, that user must be able to write there: the app's documentation says which user (e.g. `sudo chown 1000:1000 /opt/<app>/data`).

## PostgreSQL, with daily backups

A database's own files can't be backed up while it runs: a copy can be inconsistent. So the database stays in a named volume, and a backup service in the same compose file dumps it every day into `./backups`, which is backed up. It uses the official `postgres` image, the same version as the database, so `pg_dump` matches it.

```yaml
services:
  app:
    # ...
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:18.7-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - db-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 10s
      retries: 10

  db-backup:
    # A dump at the start and every day at 02:00 (UTC) into ./backups, kept 7 days
    image: postgres:18.7-alpine
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    entrypoint: ["/bin/sh", "/db-backup.sh"]
    environment:
      PGHOST: db
      PGUSER: app
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: app
      BACKUP_TIME: "02:00"
      KEEP_DAYS: 7
    volumes:
      - ./db-backup.sh:/db-backup.sh:ro
      - ./backups:/backups

volumes:
  db-data:
```

`db-backup.sh`, next to the compose file (the same script as in [deploy-keycloak](https://github.com/vu-societal-analytics/deploy-keycloak/blob/main/db-backup.sh)):

```sh
#!/bin/sh
# Database backup service: dumps the database once at the start, then every day at BACKUP_TIME (UTC),
# into /backups, and keeps the dumps of the last KEEP_DAYS days. Runs in the official postgres image.
# Settings: PGHOST, PGUSER, PGPASSWORD, PGDATABASE (the connection), BACKUP_TIME (default 02:00),
# KEEP_DAYS (default 7), DUMP_OPTIONS (extra pg_dump options).
set -eu
umask 077
time="${BACKUP_TIME:-02:00}"
keep="${KEEP_DAYS:-7}"
hours="${time%%:*}"; minutes="${time##*:}"
at=$(( ${hours#0} * 3600 + ${minutes#0} * 60 ))   # "08" would be read as octal, so without the leading 0

dump() {
	file="/backups/$PGDATABASE-$(date -u +%Y%m%d).dump"
	# shellcheck disable=SC2086
	if pg_dump --format=custom ${DUMP_OPTIONS:-} > "$file.partial"; then
		mv "$file.partial" "$file"
		echo "$(date -u -Iseconds) dump written: $file"
	else
		rm -f "$file.partial"
		echo "$(date -u -Iseconds) ERROR: pg_dump failed" >&2
	fi
	find /backups -name "$PGDATABASE-*.dump" -type f -mtime +"$((keep - 1))" -delete
}

until pg_isready -q; do sleep 5; done
dump
while true; do
	now=$(date -u +%s)
	next=$(( now - now % 86400 + at ))
	[ "$next" -gt "$now" ] || next=$(( next + 86400 ))
	sleep $(( next - now ))
	dump
done
```

* **Check it** after the first start: `sudo docker compose logs db-backup` says `dump written`, and the dump is in `backups/`.
* **Monitoring:** the server's nightly backup fails (and so sends an email) if a `backups/` folder has no dump from the last 26 hours ([Backups](backups.md#monitoring)).
* **The history:** the folder keeps 7 days; the nightly backup keeps older dumps for up to 6 months.

### Restoring a dump

This replaces the database with the dump. From the app's folder:

1. Stop the app, so nothing writes to the database (the database itself keeps running):

    ```bash
    sudo docker compose stop app db-backup
    ```

2. Choose the dump: one in `backups/` (`sudo ls backups/`), or an older one from the nightly backup ([Restoring](backups.md#restoring), `--include /opt/<app>/backups`).
3. Empty the database, and load the dump:

    ```bash
    sudo docker compose exec -T db dropdb -U app app
    ```

    ```bash
    sudo docker compose exec -T db createdb -U app app
    ```

    ```bash
    sudo cat backups/<dump> | sudo docker compose exec -T db pg_restore -U app -d app --no-owner
    ```

4. Start everything again:

    ```bash
    sudo docker compose up -d
    ```

Test a restore once when setting up an app, e.g. on a copy: a backup that can't be restored is no backup.

## Data with a short retention

Data that may only be kept for a limited time (e.g. uploaded audio and its transcripts) goes in a named volume, so it isn't in our backups, with a cleanup service in the same compose file that deletes files once they are older than the retention period:

```yaml
services:
  app:
    # ...
    volumes:
      - uploads:/app/uploads          # deleted after 30 days, not backed up

  cleanup:
    # Retention: every hour, delete uploads not changed for 30 days
    image: busybox:1.37
    restart: unless-stopped
    command: >
      sh -c 'while true; do
               find /uploads -type f -mtime +30 -delete;
               find /uploads -mindepth 1 -type d -empty -delete;
               sleep 3600;
             done'
    volumes:
      - uploads:/uploads

volumes:
  uploads:
```

* **Only the folder for uploads and results:** never a folder that also holds settings or a database. How to find out what an app writes where: [Sorting an app's data](apps.md#sorting-an-apps-data).
* **`-mtime +30`** counts from the last change of a file: a file that is only read now and then is still deleted on time.
* **The app's own retention setting** is better, if it has one: the app then also cleans up its own records. Record which applies in [Hosted services](../servers/services.md), which is also where the retention policy is documented for IT and the [privacy statement](../policies/privacy.md).
* **The server backups of VU IT** do contain these volumes, for as long as IT keeps its backups. ==TODO: ask VU IT how long that is.==
* **Test the retention with a short period** first: e.g. `-mmin +10` instead of `-mtime +30`, and check after a quarter of an hour that old files are gone and the app still works.
