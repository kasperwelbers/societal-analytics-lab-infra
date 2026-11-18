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

## Setting up a server

First create a check for the server in the lab's healthchecks.io project ([Monitoring](#monitoring)), and copy its ping URL. Then clone the job, and run its setup script with that URL:

```bash
sudo git clone https://github.com/vu-societal-analytics/deploy-backup.git /opt/backup
```

```bash
sudo /opt/backup/setup.sh https://hc-ping.com/<uuid>
```

The script ([`setup.sh`](https://github.com/vu-societal-analytics/deploy-backup/blob/main/setup.sh)) can safely run again: it never replaces a password or a repository that exists. It:

1. makes `/opt/backup` readable only by root (the job must read every app's files and secrets, so it runs as root);
2. creates the encryption password in `/etc/restic/password`, readable only by root;
3. puts the ping URL in `/etc/restic/env`;
4. creates the repository, where restic keeps the backups (for now `/var/backups/restic`);
5. turns on the timer: every night between 03:30 and 04:00, and catching up after a night the server was off.

!!! danger "Store the password in the password manager"
    Without the password, the backups can't be read: not by us, and not by anyone else. Store it in the lab's password manager, accessible to at least two people: `sudo cat /etc/restic/password`.

Then make the first backup, and check it (healthchecks.io should show it too):

```bash
sudo systemctl start backup.service
```

```bash
journalctl -u backup.service -n 50
```

Updating the job later: `sudo git -C /opt/backup pull`. For every other restic command, use `restic.sh` from `/opt/backup`: it runs restic with this server's settings (`/etc/restic/env`).

## Monitoring

A backup that silently stopped is the most common way to lose data. So every run reports to [healthchecks.io](https://healthchecks.io): a ping at the start, and one with the result at the end. Healthchecks.io emails us when a run failed, and also when no run arrived for a day (e.g. the server was off, or the timer broke). It only receives these pings, no data. The free plan covers 20 checks.

For each server, in the lab's healthchecks.io project (==TODO: create the account and project; who has access==): add a check named after the server, with **Period** 1 day, **Grace** 2 hours, and the email addresses to notify. Its ping URL goes to `setup.sh`, or later in `/etc/restic/env` as `PING_URL=<url>`.

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
