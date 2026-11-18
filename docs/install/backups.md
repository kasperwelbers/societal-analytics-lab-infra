# Installation: backups

The lab's servers are backed up in two layers (why: [Backup strategies](../backup-strategies.md)):

1. **Server backups, by VU IT:** a copy of each whole server, the last resort after losing a server. ==TODO: confirm with VU IT which servers they back up, how often, and how long they keep the backups.==
2. **Our own backups, per app:** every night, each server backs up `/opt`, encrypted. Everything needed to restore an app is there: its `compose.yml` and `.env`, its files (`data/`) and its databases as dumps (`backups/`), made every day by the app itself ([Apps on our servers](apps.md#where-things-live)). This page is about this layer.

The nightly job is in its own repository, [deploy-backup](https://github.com/vu-societal-analytics/deploy-backup), cloned to `/opt/backup` on every server. Every night it:

1. **checks the database dumps:** every `/opt/<app>/backups` folder must have a dump from the last 26 hours, otherwise the app's backup service has stopped;
2. **backs up `/opt`** with [restic](https://restic.net): encrypted on the server, before anything leaves it, and only the changes since the last backup;
3. **removes old backups:** it keeps the last 7 daily, 4 weekly and 6 monthly backups, so data deleted on the server can remain in these backups for up to 6 months;
4. **checks the backups:** the structure every night, and on Sundays also a sample of 5% of the data itself;
5. **reports the result** to the monitoring, which emails us when a backup failed or didn't run ([Monitoring](#monitoring)).

!!! warning "For now, the backups stay on the server itself"
    Until the lab has a place for backups elsewhere, they are stored on the same server (`/var/backups/restic`). They protect against mistakes (a deleted file, a failed upgrade), but **not against losing the server**: for that, there are only the server backups of VU IT. ==TODO: a location off the server, to be agreed with VU IT ([Changing the location](#changing-the-location)).==

    The database server is not covered by this page yet. ==TODO==

## 1. Install

restic, from Ubuntu's packages:

```bash
sudo apt install restic
```

The job, owned by root, which runs it (it must be able to read every app's files and secrets):

```bash
sudo git clone https://github.com/vu-societal-analytics/deploy-backup.git /opt/backup && sudo chmod 700 /opt/backup
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
cd /opt/backup && sudo ./restic.sh init
```

`restic.sh` runs restic with this server's settings: the defaults (`/var/backups/restic` and `/etc/restic/password`), or what is set in `/etc/restic/env`. Use it for every restic command below, from `/opt/backup`.

## 3. Monitoring

A backup that silently stopped is the most common way to lose data. So every run reports to [healthchecks.io](https://healthchecks.io): a ping at the start, and one with the result at the end. Healthchecks.io emails us when a run failed, and also when no run arrived for a day (e.g. the server was off, or the timer broke). It only receives these pings, no data. The free plan covers 20 checks.

1. In the lab's healthchecks.io project (==TODO: create the account and project; who has access==), add a check for this server: name it after the server, **Period** 1 day, **Grace** 2 hours, and the email addresses to notify.
2. Copy its ping URL into `/etc/restic/env`:

    ```bash
    sudoedit /etc/restic/env
    ```

    ```
    PING_URL=https://hc-ping.com/<uuid>
    ```

    ```bash
    sudo chmod 600 /etc/restic/env
    ```

## 4. Every night

Connect the service and the timer from the repository, and turn on the timer:

```bash
sudo systemctl link /opt/backup/backup.service /opt/backup/backup.timer
```

```bash
sudo systemctl enable --now backup.timer
```

Make the first backup now, and see how it went (healthchecks.io should show it too):

```bash
sudo systemctl start backup.service
```

```bash
journalctl -u backup.service -n 50
```

It runs every night between 03:30 and 04:00, and catches up after a night the server was off. Updating the job: `sudo git -C /opt/backup pull`.

## Checking

* **When it last ran, and when it runs next:** `systemctl list-timers backup.timer`.
* **Whether it worked:** `systemctl status backup.service` (`status=0/SUCCESS`), and the details with `journalctl -u backup.service -n 50`. A missing dump or unreadable files make the run fail, even though the rest is backed up.
* **The backups:** `sudo ./restic.sh snapshots`, and what is in the latest: `sudo ./restic.sh ls latest`.

While there are fewer than 7 days of backups, restic keeps a few extra; that sorts itself out.

## Leaving something out

`/etc/restic/excludes` (optional, readable only by root) lists what to leave out, one pattern per line, e.g. large files in an app's folder that can be downloaded again:

```
/opt/<app>/models
```

## Restoring

From `/opt/backup`. Restore into a separate folder first, and copy back what you need:

```bash
sudo ./restic.sh restore latest --target /tmp/restore --include /opt/<app>/<file or folder>
```

The files are then in `/tmp/restore/opt/<app>/...`. Stop the app (`sudo docker compose down`, without `-v`), copy the files back with `sudo cp -a`, and start it again. An older backup: use its ID from `snapshots` instead of `latest`.

* **A database:** restore its dump the same way (`--include /opt/<app>/backups`), and load it ([Restoring a dump](compose.md#restoring-a-dump); Keycloak: [Backups](keycloak.md#9-backups)).
* **A whole app on a new server:** restore `/opt/<app>`, and start it with `sudo docker compose up -d`; then load its database dump.

**Test a restore** after setting up the backups, and then twice a year: a backup that can't be restored is no backup.

## Changing the location

Once there is a place for backups elsewhere (e.g. an SFTP server or S3 storage), add it to `/etc/restic/env`, with what that location needs (e.g. its access keys), and create the repository there:

```
RESTIC_REPOSITORY=s3:https://<host>/<bucket>/<server>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

```bash
sudo ./restic.sh init
```

The local backups can be copied over with `restic copy`, or kept until they have expired.
