# Installation: apps on our servers

How apps are installed on the [lab server](../servers/lab.md) and the [service VMs](../servers/service-vms.md): one system account, every app in `/opt/<app>`, and a fixed place for its data, depending on how long it must be kept. Read [Docker warnings](docker.md) first.

The [Keycloak VM](keycloak.md) follows the same layout, with its own system account `keycloak` instead of `sal`.

## Where things live

| Where | What | Backed up | Deleted |
| --- | --- | --- | --- |
| `/opt/<app>` | The app: code, compose file, settings, and secrets in `.env` | Yes | When the app is removed |
| `/opt/<app>/data` | Data that must be kept: projects, accounts, a database | Yes | When the app is removed, or by the app itself |
| `/opt/<app>/temp` | Data with a short retention, e.g. uploaded audio and transcripts | No | Automatically, after a set number of days ([below](#short-retention-temp)) |
| Docker named volumes | Caches, downloaded models: anything that can be downloaded or created again | No | When the volume is removed |

So everything that must survive is under `/opt`, and a backup of the server is all of `/opt`, except the `temp` folders. ==TODO: the backup itself (see [Open points](../index.md#open-points)).==

For every new app, decide where its data goes: does it need to be kept (`data`), deleted after a while (`temp`), or is it a cache (a named volume)? Record the answer in [Hosted services](../servers/services.md).

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
* Never run `git clean` in an app directory (it deletes `data` and `temp`), and never `docker compose down -v` or `docker volume prune` unless you mean to delete the volumes.

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

    Check that the repository has no `data` or `temp` folder at the top. (If it has, choose other names, and use them in the steps below.) Keep our folders out of `git status`:

    ```bash
    printf 'data/\ntemp/\n' | sudo -u sal tee -a /opt/<app>/.git/info/exclude
    ```

3. **Settings and secrets** go in `/opt/<app>/.env`, readable only by `sal`:

    ```bash
    sudo -u sal chmod 600 /opt/<app>/.env
    ```

4. **Data that must be kept:** create `data`, as `sal`, before the first start. Docker would otherwise create it owned by root ([Docker warnings](docker.md#directories-for-bind-mounts)).

    ```bash
    sudo -u sal mkdir /opt/<app>/data
    ```

    In the compose file, mount it (or subfolders of it) into the container, e.g. `/opt/<app>/data/uploads:/app/uploads`. Use the full path: a relative path counts from the folder with the compose file, which isn't always `/opt/<app>`. A container that writes as its own user (e.g. PostgreSQL) needs that user as the owner of its folder; the app's documentation says which user.

5. **Data with a short retention:** set up `temp` as below ([Short retention](#short-retention-temp)), and mount it like `data`.
6. **Caches and downloaded models:** keep the named volumes the app's compose file already has.
7. **Listen on localhost only,** so the app can't be reached around Caddy.
    * With Docker, publish ports on `127.0.0.1`: `"127.0.0.1:<port>:<port>"`. A plain `"<port>:<port>"` is reachable from the internet, even with a firewall (see [Docker warnings](docker.md#published-ports-bypass-the-firewall)). Check with `sudo docker ps --format '{{.Names}}\t{{.Ports}}'`: nothing should show `0.0.0.0:` or `[::]:`. See which ports are taken with `sudo ss -tlnp`.
    * Without Docker, use a systemd service with `User=sal` and `WorkingDirectory=/opt/<app>`, and bind the app to `127.0.0.1`.
8. **Start it,** from the folder with the compose file:

    ```bash
    cd /opt/<app> && sudo docker compose up -d
    ```

9. **Make it reachable** through Caddy: on the lab server, see [Adding a service](lab-server.md#2-adding-a-service).

## Short retention: `temp`

Data that may only be kept for a limited time (e.g. uploaded audio and its transcripts) goes in `/opt/<app>/temp`. Linux deletes files there once they are older than the retention period, with its own `systemd-tmpfiles`. It isn't backed up, so deleted data doesn't live on in backups.

Create `/etc/tmpfiles.d/<app>.conf` (e.g. with `sudoedit`), with the retention period at the end (here 30 days):

```
d /opt/<app>/temp 0750 sal sal 30d
```

Apply it once; this also creates the folder, with the right owner:

```bash
sudo systemd-tmpfiles --create /etc/tmpfiles.d/<app>.conf
```

From then on, a daily timer of the system (`systemd-tmpfiles-clean.timer`) deletes files in it older than 30 days. To see which files are past the period: `sudo find /opt/<app>/temp -mtime +30`.

If the app keeps its own list of these files (e.g. in a database), check that it copes with files that disappear; otherwise use the app's own retention setting, if it has one.

## Updating and removing an app

**Updating:**

```bash
cd /opt/<app> && sudo -u sal git pull && sudo docker compose up -d --build
```

**Removing** (this deletes its data, including `data`, so check first that it is no longer needed, following the retention rules of the [privacy statement](../policies/privacy.md)):

```bash
cd /opt/<app> && sudo docker compose down
```

```bash
sudo rm -r /opt/<app> /etc/tmpfiles.d/<app>.conf
```

Named volumes stay: list them with `sudo docker volume ls`, and remove the app's with `sudo docker volume rm <volume>`.

**Moving data into `data` or `temp`** (e.g. from a named volume, or from another folder): stop the app (`sudo docker compose down`), copy the files (for a named volume: `sudo cp -a /var/lib/docker/volumes/<volume>/_data/. /opt/<app>/data/<folder>/`), fix the owner (`sudo chown -R sal:sal /opt/<app>/data`, except for folders owned by a container's user), change the mount in the compose file, and start it again. Remove the old volume once everything works.
