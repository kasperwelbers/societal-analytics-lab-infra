# Installation: backups

Every server is backed up the same way, every night:

1. **Database dumps:** the dump scripts of the server (`/opt/backup/hooks.d/`) write a dump of each database into the app's folder, e.g. `/opt/<app>/backups/`.
2. **The backup:** [restic](https://restic.net) backs up all of `/opt`, encrypted, except the `temp` folders of the apps (data with a short retention, see [Apps on our servers](apps.md#short-retention-temp)).
3. **Old backups** are removed: restic keeps the last 7 daily, 4 weekly and 6 monthly backups. So data deleted on the server can remain in the backups for up to 6 months.

Everything that must survive is under `/opt` ([Apps on our servers](apps.md#where-things-live)), so this covers the apps, their settings and secrets, and their data. The files are in [`deploy/backup/`](https://github.com/vu-societal-analytics/societal-analytics-lab-infra/tree/main/deploy/backup).

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

A copy of a running database's files can be inconsistent, so every app with a database gets a dump script in `/opt/backup/hooks.d/`, which runs before the backup. Only root can change these scripts (they run as root).

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
sudo ./restic.sh restore latest --target /tmp/restore --include /opt/<app>/data/<file or folder>
```

The files are then in `/tmp/restore/opt/<app>/...`. Copy them back, and fix the owner (`sudo chown -R sal:sal ...`, except for folders owned by a container's user). An older backup: use its ID from `snapshots` instead of `latest`.

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
