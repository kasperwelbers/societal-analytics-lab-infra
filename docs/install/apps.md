# Installation: apps on our servers

How apps are installed on the [lab server](../servers/lab.md) and the [service VMs](../servers/service-vms.md): one system account, every app in `/opt/<app>`, its data where its compose file puts it, and only data with a short retention in a place of its own. Read [Docker warnings](docker.md) first.

The [Keycloak VM](keycloak.md) follows the same layout, with its own system account `keycloak` instead of `sal`.

## Where things live

| Where | What | Backed up | Deleted |
| --- | --- | --- | --- |
| `/opt/<app>` | The app: code, compose file, settings, and secrets in `.env` | Yes | When the app is removed |
| Docker volumes | The app's data, as its compose file sets it up (named volumes, or folders in `/opt/<app>`) | Yes | When the app's volumes are removed |
| `/srv/temp/<app>` | Data with a short retention, e.g. uploaded audio and transcripts | No | Automatically, after a set number of days ([below](#short-retention-srvtemp)) |

The nightly backup covers `/opt` and all Docker volumes ([Backups](backups.md)), so an app's data is backed up without doing anything. Two things need a decision per app:

* **Data with a short retention** must go to `/srv/temp/<app>`, and never stay in a volume: otherwise it lives on in the backups. How to find out what an app writes where: [Sorting an app's data](#sorting-an-apps-data).
* **A database** gets a dump script, because a copy of a running database's files can be inconsistent ([Database dumps](backups.md#3-database-dumps)). **Large caches** (e.g. downloaded models) can be left out of the backup ([Leaving out large caches](backups.md#leaving-out-large-caches)).

Record the answers in [Hosted services](../servers/services.md).

## 1. The system account

Once per server:

```bash
sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
```

For each admin, so that they can enter the app directories:

```bash
sudo usermod -aG sal <admin>
```

`/opt` stays as it is: owned by `root:root`, mode `755`. `sal` is **not** in the `docker` group: membership of that group is effectively root access, and apps that run as `sal` without Docker would get it too (see [Docker warnings](docker.md#the-docker-group-is-root-access)). Admins run Docker with `sudo`.

**How access works**

* Each app directory is owned by `sal:sal`, with mode `750`. `sal` can change everything, admins (the `sal` group) can enter and read, and other users can't enter at all. That last part is what protects the files inside, whatever their own modes are.
* Secrets in `.env` get mode `600`, so only `sal` can read them. Admins use `sudo` when they need to.

**Rules for admins**

* Everything inside `/opt/<app>` is done as `sal`: `sudo -u sal <command>`, or `sudo -u sal bash` for longer work. The exception is Docker: `sudo docker compose ...`, from the folder with the compose file.
* Edit files with `sudoedit -u sal <file>`. It opens your own editor with your own settings, and saves the file as `sal`.
    * Choose the editor in your `~/.bashrc`: `export SUDO_EDITOR=nvim` (or `nano`).
    * Don't run the editor as `sal` (`sudo -u sal nvim`): `sal` has no home directory for the editor's own files.
* Pasting into a file on the server: go into insert mode and use your terminal's paste shortcut: `Cmd+V` on a Mac, `Ctrl+Shift+V` on Linux, `Ctrl+V` or right-click in Windows Terminal or PuTTY. (`"+p` doesn't work: a server has no clipboard.)
* Never use plain `sudo` for other commands inside an app directory, or files end up owned by root.
* After copying files in from elsewhere, fix the owner: `sudo chown -R sal:sal /opt/<app>`.
* Never run `docker compose down -v` or `docker volume prune` unless you mean to delete the app's data: the volumes are where it lives.

## 2. Adding an app

1. **Create its directory,** as an admin:

    ```bash
    sudo mkdir /opt/<app>
    ```

    ```bash
    sudo chown sal:sal /opt/<app> && sudo chmod 750 /opt/<app>
    ```

2. **Put the app in it,** as `sal`. The directory must be empty for `git clone`. A private repository needs a deploy key (a read-only SSH key for that repository) for `sal`.

    ```bash
    sudo -u sal git clone <repo> /opt/<app>
    ```

3. **Settings and secrets** go in `/opt/<app>/.env`, readable only by `sal`:

    ```bash
    sudo -u sal chmod 600 /opt/<app>/.env
    ```

4. **Its data:** keep the volumes of the app's compose file as they are; they are backed up. (A folder in `/opt/<app>` instead of a named volume is fine too: create it as `sal` before the first start, or Docker creates it owned by root, see [Docker warnings](docker.md#directories-for-bind-mounts).)
5. **Data with a short retention:** set up `/srv/temp/<app>` ([Short retention](#short-retention-srvtemp)), and mount it on exactly the folder for uploads and results, never on a folder that also holds settings or a database.
6. **A database:** add a dump script for the backup ([Database dumps](backups.md#3-database-dumps)). **Large caches:** leave them out of the backup ([Leaving out large caches](backups.md#leaving-out-large-caches)).
7. **Listen on localhost only,** so the app can't be reached around Caddy.
    * With Docker, publish ports on `127.0.0.1`: `"127.0.0.1:<port>:<port>"`. A plain `"<port>:<port>"` is reachable from the internet, even with a firewall (see [Docker warnings](docker.md#published-ports-bypass-the-firewall)). Check with `sudo docker ps --format '{{.Names}}\t{{.Ports}}'`: nothing should show `0.0.0.0:` or `[::]:`. See which ports are taken with `sudo ss -tlnp`.
    * Without Docker, use a systemd service with `User=sal` and `WorkingDirectory=/opt/<app>`, and bind the app to `127.0.0.1`.
8. **Start it,** from the folder with the compose file:

    ```bash
    cd /opt/<app> && sudo docker compose up -d
    ```

9. **Make it reachable** through Caddy: on the lab server, see [Adding a service](lab-server.md#2-adding-a-service).

## Short retention: `/srv/temp`

Data that may only be kept for a limited time (e.g. uploaded audio and its transcripts) goes in `/srv/temp/<app>`. It is outside the backup, so deleted data doesn't live on in backups, and Linux deletes files there once they are older than the retention period, with its own `systemd-tmpfiles`.

Create `/etc/tmpfiles.d/<app>.conf` (e.g. with `sudoedit`), with the retention period at the end (here 30 days). The `m:` counts the days from when a file was last changed; without it, a file that is still opened now and then would never be deleted:

```
d /srv/temp/<app> 0750 sal sal m:30d
```

Apply it once; this also creates the folder (and `/srv/temp`), with the right owner:

```bash
sudo systemd-tmpfiles --create /etc/tmpfiles.d/<app>.conf
```

From then on, a daily timer of the system (`systemd-tmpfiles-clean.timer`) deletes files in it that weren't changed for 30 days. To see which files are past the period: `sudo find /srv/temp/<app> -mtime +30`.

If the app has its own retention setting, use that instead: the app then also cleans up its own records. (Its data then stays in the backups until they expire: up to 6 months.)

Not `/tmp` or `/var/tmp`: Ubuntu empties `/tmp` at every restart, and cleans `/var/tmp` on its own schedule.

## Sorting an app's data

Only needed for an app with data that may be kept for a limited time. Before the first real use:

1. **Find out what it writes where:** in the app's documentation, in its compose file (the `volumes:`), and by trying it: after a test run, `sudo docker diff <container>` lists every file the container changed outside its volumes, and the volumes show the rest (`sudo ls /var/lib/docker/volumes/<volume>/_data`).
2. **Find the folder with users' uploads and results.** Everything else (settings, accounts, a database, caches) stays where the compose file puts it.
3. **Mount `/srv/temp/<app>` on exactly that folder.** A mount can point at a folder inside another mount; the more specific one wins. So the uploads can go to `/srv/temp` while the rest of the app's data stays in its volume:

    ```yaml
    volumes:
      - app-data:/app/data                       # settings, database: kept, backed up
      - /srv/temp/<app>:/app/data/uploads        # only the uploads: deleted after the set time
    ```

    (Docker leaves an empty `uploads` folder in the volume, where the second mount is attached; leave it.)

4. **Test the retention with a short period:** set `m:10m` in the tmpfiles line, wait ten minutes, run `sudo systemctl start systemd-tmpfiles-clean`, and check that the old files are gone and that the app still works (including its list of earlier results, if it has one). Then set the real period.
5. **Record it** in the "Kept" column of [Hosted services](../servers/services.md).

Where sorting by folder doesn't work:

* **Settings and uploads in the same folder** (e.g. `settings.json` next to `job-123.wav`): no mount can separate them.
* **Folders that vary,** e.g. `/app/data/<user>/uploads`: a mount needs a fixed path.
* **Files moved from one mount to the other:** some apps write a file elsewhere first and then move it into the uploads folder. Depending on how the app moves it, that is a copy (fine) or fails with "cross-device link". The test in step 4 shows it.
* **The app keeps a list of its files** (e.g. a history of transcriptions in its database): after the cleanup, the list points to files that are gone, which can confuse it.

Then use the app's own retention setting, or delete through the app (its API or admin page, run on a schedule). That is work per app: record how in Hosted services.

## Updating and removing an app

**Updating:**

```bash
cd /opt/<app> && sudo -u sal git pull && sudo docker compose up -d --build
```

**Removing** (this deletes its data, so check first that it is no longer needed, following the retention rules of the [privacy statement](../policies/privacy.md)):

```bash
cd /opt/<app> && sudo docker compose down
```

```bash
sudo rm -r /opt/<app> /srv/temp/<app> /etc/tmpfiles.d/<app>.conf
```

Its volumes stay (and stay in the backups): list them with `sudo docker volume ls`, and remove the app's with `sudo docker volume rm <volume>`.

**Moving an app's short-retention data to `/srv/temp`:** set up `/srv/temp/<app>` as above, stop the app (`sudo docker compose down`), move the files that should be kept for now (for a named volume: `sudo mv /var/lib/docker/volumes/<volume>/_data/<folder>/* /srv/temp/<app>/`), add the mount to the compose file, and start it again. Files that were already in the backups stay there until those expire.
