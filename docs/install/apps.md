# Installation: apps on our servers

How apps are installed on the [lab server](../servers/lab.md) and the [service VMs](../servers/service-vms.md): one system account, every app in `/opt/<app>` with a `compose.yml` at the top, and a fixed place for its data, depending on whether it must be kept. Read [Docker warnings](docker.md) first.

The [Keycloak VM](keycloak.md) follows the same layout, with its own system account `keycloak` instead of `sal`, and its folder cloned from its own repository ([deploy-keycloak](https://github.com/vu-societal-analytics/deploy-keycloak)).

## Where things live

| Where | What | Backed up by us | Deleted |
| --- | --- | --- | --- |
| `/opt/<app>` | `compose.yml`, `.env` (settings and secrets), the app's own code if we build it (`src/`) | Yes | When the app is removed |
| `/opt/<app>/data` | Files that must be kept | Yes | When the app is removed, or by the app |
| `/opt/<app>/backups` | Database dumps, made every day by the app's backup service | Yes | After 7 days (older ones stay in the nightly backup) |
| Named volumes | A database's own files, caches, models, data with a short retention | No | By a cleanup service or the app ([short retention](compose.md#data-with-a-short-retention)), or when removed |

So our nightly backup of `/opt` ([Backups](backups.md)) contains everything needed to restore an app: its setup, its files, and its databases (as dumps). The examples for each case are on [Docker Compose standards](compose.md).

For every new app, decide:

* **Files that must be kept?** Mount them from `./data`.
* **A database?** Add the backup service ([PostgreSQL, with daily backups](compose.md#postgresql-with-daily-backups)).
* **Data that may only be kept for a limited time?** A named volume with a cleanup service, or the app's own retention setting ([Data with a short retention](compose.md#data-with-a-short-retention)).

Record the answers in [Hosted services](../servers/services.md): that is where the lab's retention policy is documented.

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
* Never run `docker compose down -v` or `docker volume prune` unless you mean to delete the app's volumes (with its database, caches and data with a short retention).

## 2. Adding an app

1. **Create its directory,** as an admin:

    ```bash
    sudo mkdir /opt/<app>
    ```

    ```bash
    sudo chown sal:sal /opt/<app> && sudo chmod 750 /opt/<app>
    ```

2. **Write its `compose.yml`,** with `sudoedit -u sal /opt/<app>/compose.yml`, from the examples on [Docker Compose standards](compose.md). Our own code goes in `/opt/<app>/src` (`sudo -u sal git clone <repo> /opt/<app>/src`; a private repository needs a deploy key, a read-only SSH key for that repository, for `sal`).
3. **Settings and secrets** go in `/opt/<app>/.env`, readable only by `sal`:

    ```bash
    sudo -u sal chmod 600 /opt/<app>/.env
    ```

4. **Files that must be kept:** create `data` as `sal` before the first start (Docker would create it owned by root):

    ```bash
    sudo -u sal mkdir /opt/<app>/data
    ```

5. **Check the ports:** only on `127.0.0.1` (`"127.0.0.1:<port>:<port>"`), and not yet taken (`sudo ss -tlnp`).
6. **Start it:**

    ```bash
    cd /opt/<app> && sudo docker compose up -d
    ```

    Check that nothing is published to the outside: `sudo docker ps --format '{{.Names}}\t{{.Ports}}'` should show no `0.0.0.0:` or `[::]:`. With a database: check that the first dump is in `backups/`.

7. **Make it reachable** through Caddy: on the lab server, see [Adding a service](lab-server.md#2-adding-a-service).
8. **Record it** in [Hosted services](../servers/services.md): what it keeps, and for how long.

## Sorting an app's data

Most apps don't say what they keep where. Before the first real use:

1. **Find out what it writes where:** in the app's documentation, in its own example compose file (the `volumes:`), and by trying it: after a test run, `sudo docker diff <container>` lists every file the container changed outside its volumes.
2. **Sort every folder:**
    * settings, accounts, uploads that must be kept: `./data`;
    * a database: a named volume, plus the backup service;
    * caches and downloaded models: a named volume;
    * uploads and results that may only be kept for a limited time: a named volume with a cleanup service.
3. **Mount each folder where it belongs.** A mount can point at a folder inside another mount; the more specific one wins. So the uploads can expire while the rest of the app's data is kept:

    ```yaml
    volumes:
      - ./data:/app/data                 # settings: kept, backed up
      - uploads:/app/data/uploads        # only the uploads: deleted by the cleanup service
    ```

    (Docker leaves an empty `uploads` folder in `data`, where the second mount is attached; leave it.)

Where sorting by folder doesn't work:

* **Settings and uploads in the same folder** (e.g. `settings.json` next to `job-123.wav`): no mount can separate them.
* **Folders that vary,** e.g. `/app/data/<user>/uploads`: a mount needs a fixed path.
* **Files moved from one mount to the other:** some apps write a file elsewhere first and then move it into the uploads folder. Depending on how the app moves it, that is a copy (fine) or fails with "cross-device link". A test run shows it.
* **The app keeps a list of its files** (e.g. a history of transcriptions in its database): after the cleanup, the list points to files that are gone, which can confuse it.

Then use the app's own retention setting, or delete through the app (its API or admin page, run on a schedule). That is work per app: record how in Hosted services.

## Updating and removing an app

**Updating:** change the version in `compose.yml` (after reading the release notes), then:

```bash
cd /opt/<app> && sudo docker compose pull && sudo docker compose up -d
```

For our own code: `sudo -u sal git -C /opt/<app>/src pull`, then `sudo docker compose up -d --build`.

**Removing** (this deletes its data, so check first that it is no longer needed, following the retention rules of the [privacy statement](../policies/privacy.md)):

```bash
cd /opt/<app> && sudo docker compose down -v
```

```bash
sudo rm -r /opt/<app>
```

`-v` also removes its named volumes. Its folder stays in the nightly backups until they expire (up to 6 months).
