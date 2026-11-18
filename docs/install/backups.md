# Installation: backups

Every server is backed up the same way, every night:

1. **Database dumps:** the dump scripts of the server (`/opt/backup/hooks.d/`) write a dump of each database into the app's folder, e.g. `/opt/<app>/backups/`.
2. **The backup:** [restic](https://restic.net) backs up all of `/opt` and all Docker volumes (`/var/lib/docker/volumes`), encrypted, except what is listed in `/etc/restic/excludes` ([Leaving out large caches](#leaving-out-large-caches)).
3. **Old backups** are removed: restic keeps the last 7 daily, 4 weekly and 6 monthly backups. So data deleted on the server can remain in the backups for up to 6 months.

So the apps, their settings and secrets, and their data are backed up by default, however an app's compose file stores its data ([Apps on our servers](apps.md#where-things-live)). Only data with a short retention is kept out of the backups: it is in `/srv/temp`, which isn't backed up ([Short retention](apps.md#short-retention-srvtemp)). The files are in [`deploy/backup/`](https://github.com/vu-societal-analytics/societal-analytics-lab-infra/tree/main/deploy/backup).

!!! warning "For now, the backups stay on the server itself"
    Until the lab has a place for backups elsewhere, the backups are stored on the same server (`/var/backups/restic`). They protect against mistakes (a deleted file, a failed upgrade), but **not against losing the server**. ==TODO: a location off the server, to be agreed with VU IT ([Changing the location](#changing-the-location)).==

    The database server is not covered by this page yet. ==TODO==

## 1. Install

restic, from Ubuntu's packages:

```bash
sudo apt install restic
```

The backup job, owned by root, which runs it (it must be able to read every app's files and secrets):

```bash
sudo mkdir -m 700 /opt/backup /opt/backup/hooks.d
```

```bash
sudo git clone https://github.com/vu-societal-analytics/societal-analytics-lab-infra.git /opt/backup/societal-analytics-lab-infra
```

## 2. The password and the repository

The backups are encrypted with a password. Create it, readable only by root:

```bash
sudo mkdir -m 700 /etc/restic
```

```bash
openssl rand -base64 32 | sudo tee /etc/restic/password > /dev/null && sudo chmod 600 /etc/restic/password
```

!!! danger "Store the password in the password manager"
    Without the password, the backups can't be read: not by us, and not by anyone else. Store it in the lab's password manager, accessible to at least two people: `sudo cat /etc/restic/password`.

Create the repository, where restic keeps the backups:

```bash
cd /opt/backup/societal-analytics-lab-infra/deploy/backup
```

```bash
sudo ./restic.sh init
```

`restic.sh` runs restic with this server's settings: the defaults (`/var/backups/restic` and `/etc/restic/password`), or what is set in `/etc/restic/env`. Use it for every restic command below.

## 3. Database dumps

The database's own files are in the backup too (in its volume), but a copy of a running database's files can be inconsistent. So every app with a database gets a dump script in `/opt/backup/hooks.d/`, which runs before the backup. Only root can change these scripts (they run as root).

**An app with PostgreSQL:** copy the template, and fill in the app, the database service of its compose file, the user and the database:

```bash
sudo cp /opt/backup/societal-analytics-lab-infra/deploy/backup/postgres-hook.example.sh /opt/backup/hooks.d/<app>.sh
```

```bash
sudoedit /opt/backup/hooks.d/<app>.sh
```

The dump goes to `/opt/<app>/backups/`, readable only by root, and replaces the previous one: the history is in the backups.

**The Keycloak VM:** its dump script already exists:

```bash
printf '#!/usr/bin/env bash\nexec /opt/keycloak/societal-analytics-lab-infra/deploy/keycloak/backup.sh\n' | sudo tee /opt/backup/hooks.d/keycloak.sh > /dev/null
```

Test the scripts by hand: `sudo bash /opt/backup/hooks.d/<app>.sh`, then check the dump in `/opt/<app>/backups/`.

## Leaving out large caches

Caches and downloaded models (e.g. the language models of Ollama, which can be tens of GB) can be downloaded again, and only make the backups large. Leave their volumes out in `/etc/restic/excludes`, one line per volume:

```bash
sudoedit /etc/restic/excludes
```

```
/var/lib/docker/volumes/<project>_<volume>
```

The volume names are in `sudo docker volume ls` (a compose project's volumes start with its folder name). Forgetting one is harmless: the backups are just larger.

## 4. Every night

Connect the service and the timer from the repository, and turn on the timer:

```bash
sudo systemctl link /opt/backup/societal-analytics-lab-infra/deploy/backup/backup.service /opt/backup/societal-analytics-lab-infra/deploy/backup/backup.timer
```

```bash
sudo systemctl enable --now backup.timer
```

Make the first backup now, and see how it went:

```bash
sudo systemctl start backup.service
```

```bash
journalctl -u backup.service -n 50
```

It runs every night between 03:30 and 04:00, and catches up after a night the server was off.

## Checking

* **When it last ran, and when it runs next:** `systemctl list-timers backup.timer`.
* **Whether it worked:** `systemctl status backup.service` (`status=0/SUCCESS`), and the details with `journalctl -u backup.service -n 50`. A failed dump script or unreadable files make the run fail, even though the rest is backed up.
* **The backups:** `sudo ./restic.sh snapshots`, and what is in the latest: `sudo ./restic.sh ls latest`.

While there are fewer than 7 days of backups, restic keeps a few extra; that sorts itself out.

## Restoring

From `/opt/backup/societal-analytics-lab-infra/deploy/backup`. Restore into a separate folder first, and copy back what you need:

```bash
sudo ./restic.sh restore latest --target /tmp/restore --include <path>
```

The files are then in `/tmp/restore/<path>`. The path of a file in an app's folder is `/opt/<app>/...`; of a file in a volume `/var/lib/docker/volumes/<volume>/_data/...` (`sudo ./restic.sh ls latest` shows them). Stop the app (`sudo docker compose down`, without `-v`), copy the files back with `sudo cp -a`, and start it again. An older backup: use its ID from `snapshots` instead of `latest`.

**A database:** restore its dump the same way, then load it into the database with `pg_restore` (Keycloak: [Backups](keycloak.md#9-backups)).

**Test a restore** after setting up the backups, and then twice a year: a backup that can't be restored is no backup.

## Changing the location

Once there is a place for backups elsewhere (e.g. an SFTP server or S3 storage), put it in `/etc/restic/env` (readable only by root), with what that location needs (e.g. its access keys), and create the repository there:

```bash
sudoedit /etc/restic/env
```

```
RESTIC_REPOSITORY=s3:https://<host>/<bucket>/<server>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

```bash
sudo ./restic.sh init
```

The local backups can be copied over with `restic copy`, or kept until they have expired.
