# Installation: lab server

How the [lab server](../servers/lab.md) is set up: the system account for the apps, Caddy, the lab login (oauth2-proxy), and how a new service is added. Why it is set up this way: [Decisions](../decisions.md#the-lab-server).

Every application has two directories, both owned by the system account `sal`: `/opt/<app>` for the app itself (code, compose file, settings and secrets), and `/srv/<app>` for everything it writes (uploads, results, databases, downloaded models). `/opt` and `/srv` themselves stay owned by root. Caddy (in `/etc/caddy`) is the only thing reachable from outside: it handles HTTPS, and puts the lab login in front of apps that have no login of their own.

## 1. The system account

Once per server:

```bash
sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
```

For each admin, so that they can enter the app and data directories:

```bash
sudo usermod -aG sal <admin>
```

`/opt` and `/srv` stay as they are: owned by `root:root`, mode `755`. If the server has a separate data disk, mount it on `/srv`. `sal` is **not** in the `docker` group: membership of that group is effectively root access, and apps that run as `sal` without Docker would get it too (see [Docker warnings](docker.md#the-docker-group-is-root-access)). Admins run Docker with `sudo`.

**How access works**

* Each app directory and each data directory is owned by `sal:sal`, with mode `750`. `sal` can change everything, admins (the `sal` group) can enter and read, and other users can't enter at all. That last part is what protects the files inside, whatever their own modes are.
* Secrets in `.env` get mode `600`, so only `sal` can read them. Admins use `sudo` when they need to.

**Rules for admins**

* Everything inside `/opt/<app>` and `/srv/<app>` is done as `sal`: `sudo -u sal <command>`, or `sudo -u sal bash` for longer work. The exception is Docker: `sudo docker compose ...`, from the app's directory.
* Edit files with `sudoedit -u sal <file>`. It opens your own editor with your own settings, and saves the file as `sal`.
    * Choose the editor in your `~/.bashrc`: `export SUDO_EDITOR=nvim` (or `nano`).
    * Don't run the editor as `sal` (`sudo -u sal nvim`): `sal` has no home directory for the editor's own files.
* Pasting into a file on the server: go into insert mode and use your terminal's paste shortcut: `Cmd+V` on a Mac, `Ctrl+Shift+V` on Linux, `Ctrl+V` or right-click in Windows Terminal or PuTTY. (`"+p` doesn't work: a server has no clipboard.)
* Never use plain `sudo` for other commands inside an app or data directory, or files end up owned by root. Docker creates a missing directory for a bind mount as root, so create data directories as `sal` before the first start ([Docker warnings](docker.md#directories-for-bind-mounts)).
* After copying files in from elsewhere, fix the owner: `sudo chown -R sal:sal /opt/<app>` (or `/srv/<app>`).

## 2. Caddy and the lab login

### DNS

Two records, both pointing to this server: `lab.societal-analytics.nl` and `*.lab.societal-analytics.nl`. New services then need no DNS change. Only the lab's own services may get an address under `lab.`: see [the lab zone](../servers/lab.md#the-lab-zone-everything-under-lab).

### Caddy

Install Caddy from its official apt repository (see [Install](https://caddyserver.com/docs/install)), not Ubuntu's own `caddy` package, which is too old. It runs as a service and reads `/etc/caddy/Caddyfile`. Check `caddy version`: the snippets below need 2.9 or newer.

HTTPS is automatic: every site with a domain name gets a Let's Encrypt certificate, renewed on its own, as long as its DNS points to this server and ports 80 and 443 are open.

After each change to the Caddyfile, check it, then apply it:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

```bash
sudo systemctl reload caddy
```

Sites keep running during the reload. If the new file has an error, Caddy keeps the old configuration; see why with `journalctl -u caddy -n 50`.

### The lab login (oauth2-proxy)

Services without their own login sit behind [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/), which sends visitors to the lab's Keycloak (the `lab` realm). After logging in, they can use every service behind the lab login, until they sign out or are inactive for 2 hours.

**In Keycloak** (admin console of the `lab` realm), create the client `lab-authwall`:

1. **Clients → Create client.** **Client ID:** `lab-authwall`. **Next.**
2. **Client authentication:** on. **Authentication flow:** only **Standard flow**. **Next.**
3. **Valid redirect URIs:** `https://lab.societal-analytics.nl/oauth2/callback` (the one place every login comes back to; Keycloak doesn't allow a wildcard in the host name). **Valid post logout redirect URIs:** `+`. **Save.**
4. **Advanced** tab: **Proof Key for Code Exchange Code Challenge Method:** `S256`. **Save.**
5. **Client scopes** tab → `lab-authwall-dedicated` → **Configure a new mapper** (or **Add mapper → By configuration**):
    * **Audience:** name `audience`, **Included Client Audience** `lab-authwall`, **Add to ID token** and **Add to access token** on. oauth2-proxy needs this.
    * **Group Membership:** name `groups`, **Token Claim Name** `groups`, **Full group path** off. Only needed for services restricted to a group (step 3).
6. **Credentials** tab: copy the **Client secret**.

**On the server**, create its directory:

```bash
sudo mkdir /opt/oauth2-proxy
```

```bash
sudo chown sal:sal /opt/oauth2-proxy && sudo chmod 750 /opt/oauth2-proxy
```

Create `/opt/oauth2-proxy/compose.yml` with `sudoedit -u sal`. oauth2-proxy gets a Docker network of its own, and its port is only published on localhost, for Caddy:

```yaml
services:
  oauth2-proxy:
    # Pin a release; check https://github.com/oauth2-proxy/oauth2-proxy/releases for a newer one
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.6
    restart: unless-stopped
    # Only for Caddy on this server
    ports:
      - "127.0.0.1:4180:4180"
    networks: [authwall]
    env_file: .env
    environment:
      OAUTH2_PROXY_PROVIDER: keycloak-oidc
      OAUTH2_PROXY_OIDC_ISSUER_URL: https://auth.societal-analytics.nl/realms/lab
      OAUTH2_PROXY_CODE_CHALLENGE_METHOD: S256
      # All members of the lab realm; restrict a service to a group in the Caddyfile (step 3)
      OAUTH2_PROXY_EMAIL_DOMAINS: "*"
      # One login cookie for the lab zone (see [the lab zone](../servers/lab.md#the-lab-zone-everything-under-lab))
      OAUTH2_PROXY_COOKIE_DOMAINS: .lab.societal-analytics.nl
      # Every login comes back here (the redirect URI in Keycloak)
      OAUTH2_PROXY_REDIRECT_URL: https://lab.societal-analytics.nl/oauth2/callback
      # Where users may be sent after logging in or out: the lab's sites (including the website)
      OAUTH2_PROXY_WHITELIST_DOMAINS: .societal-analytics.nl
      # Signing out also ends the Keycloak session (otherwise the next visit logs straight back in)
      OAUTH2_PROXY_BACKEND_LOGOUT_URL: https://auth.societal-analytics.nl/realms/lab/protocol/openid-connect/logout?id_token_hint={id_token}
      # Check the login with Keycloak every 10 minutes: users who signed out, or were inactive
      # longer than Keycloak's idle time (2 hours), have to log in again
      OAUTH2_PROXY_COOKIE_REFRESH: 10m
      # Go straight to the lab login, without oauth2-proxy's own "Sign in" page
      OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true"
      OAUTH2_PROXY_REVERSE_PROXY: "true"
      # Requests from the server (Caddy) arrive from the gateway of the network below:
      # only that address may set X-Forwarded-* headers
      OAUTH2_PROXY_TRUSTED_PROXY_IPS: 172.30.255.1/32
      OAUTH2_PROXY_SET_XAUTHREQUEST: "true"
      OAUTH2_PROXY_HTTP_ADDRESS: 0.0.0.0:4180
    # No writes, no extra privileges (the image already runs as a non-root user)
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]

networks:
  # oauth2-proxy alone, with a fixed range, so that the gateway address above is fixed too.
  # Pick a range that no other Docker network on the server uses.
  authwall:
    ipam:
      config:
        - subnet: 172.30.255.0/29
          gateway: 172.30.255.1
```

==TODO: until Keycloak has moved to `auth.societal-analytics.nl`, use its current address in `OAUTH2_PROXY_OIDC_ISSUER_URL` and `OAUTH2_PROXY_BACKEND_LOGOUT_URL`.==

Its own network keeps oauth2-proxy away from the apps on this server: from inside its container, the services on the server's `127.0.0.1` can't be reached, and no other container can reach oauth2-proxy. (With `network_mode: host` it could reach every app on the server's localhost, including apps that rely on the lab login.)

Create `/opt/oauth2-proxy/.env`, also with `sudoedit -u sal`:

```bash
OAUTH2_PROXY_CLIENT_ID=lab-authwall
OAUTH2_PROXY_CLIENT_SECRET=<the client secret from Keycloak>
OAUTH2_PROXY_COOKIE_SECRET=<output of: openssl rand -base64 32 | tr -- '+/' '-_'>
```

Protect the secrets, and start it:

```bash
sudo -u sal chmod 600 /opt/oauth2-proxy/.env
```

```bash
cd /opt/oauth2-proxy && sudo docker compose up -d
```

At the top of `/etc/caddy/Caddyfile`:

```
{
	email <admin email address>
}

# The lab login, for services without their own: import authwall { reverse_proxy ... }
(authwall) {
	handle /oauth2/* {
		reverse_proxy 127.0.0.1:4180 {
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-Uri {uri}
		}
	}
	handle {
		forward_auth 127.0.0.1:4180 {
			uri /oauth2/auth
			header_up X-Real-IP {remote_host}
			copy_headers X-Auth-Request-User X-Auth-Request-Email
			@error status 401
			handle_response @error {
				redir * /oauth2/sign_in?rd={scheme}://{host}{uri}
			}
		}
		{block}
	}
}

# The same, for a service that only members of one Keycloak group may use:
# import authwall-group <group> { reverse_proxy ... }
(authwall-group) {
	handle /oauth2/* {
		reverse_proxy 127.0.0.1:4180 {
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-Uri {uri}
		}
	}
	handle {
		forward_auth 127.0.0.1:4180 {
			uri /oauth2/auth?allowed_groups={args[0]}
			header_up X-Real-IP {remote_host}
			copy_headers X-Auth-Request-User X-Auth-Request-Email
			@error status 401
			handle_response @error {
				redir * /oauth2/sign_in?rd={scheme}://{host}{uri}
			}
		}
		{block}
	}
}

# The overview of the lab's services, behind the lab login
lab.societal-analytics.nl {
	import authwall {
		root * /var/www/lab
		templates
		file_server
	}
}
```

The service receives the user's email address in the header `X-Auth-Request-Email`. Two separate snippets, because a snippet argument that isn't given stays in the text literally.

### The overview page

`/var/www/lab/index.html` (readable by Caddy; e.g. `sudo mkdir -p /var/www/lab`, then `sudoedit /var/www/lab/index.html`). Caddy fills in who is signed in (`templates`). A minimal version:

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Lab services</title></head>
<body>
<h1>Lab services</h1>
<p>Signed in as {{.Req.Header.Get "X-Auth-Request-Email"}} ·
<a href="/oauth2/sign_out?rd=https%3A%2F%2Fsocietal-analytics.nl%2F">Sign out</a></p>
<ul>
  <li><a href="https://whisper.lab.societal-analytics.nl/">Whisper</a>: transcription</li>
  <li><a href="https://llm.lab.societal-analytics.nl/">LLM chat</a> (its own login)</li>
</ul>
</body></html>
```

### Signing out, and inactivity

What members experience: [Signing out, and inactivity](../servers/lab.md#signing-out-and-inactivity). The settings behind it:

* The 2 hours are the idle time of the `lab` realm in Keycloak (**Realm settings → Sessions → SSO Session Idle**); `OAUTH2_PROXY_COOKIE_REFRESH` makes oauth2-proxy check the session every 10 minutes.
* To sign out everyone at once (e.g. after a stolen laptop), set a new `OAUTH2_PROXY_COOKIE_SECRET` and restart oauth2-proxy.

## 3. Adding an application

1. **Choose a free port** and a name. See which ports are taken with `sudo ss -tlnp` (and in the Caddyfile). The address will be `<app>.lab.societal-analytics.nl`; DNS needs no change.
2. **Create its directories,** as an admin: `/opt/<app>` for the app, `/srv/<app>` for its data.

    ```bash
    sudo mkdir /opt/<app> /srv/<app>
    ```

    ```bash
    sudo chown sal:sal /opt/<app> /srv/<app> && sudo chmod 750 /opt/<app> /srv/<app>
    ```

3. **Put the app in it,** as `sal`. The directory must be empty for `git clone`. A private repository needs a deploy key (a read-only SSH key for that repository) for `sal`.

    ```bash
    sudo -u sal git clone <repo> /opt/<app>
    ```

4. **Settings and secrets** go in `/opt/<app>/.env`, readable only by `sal`. Put the data directory there too, as `DATA_DIR=/srv/<app>`:

    ```bash
    sudo -u sal chmod 600 /opt/<app>/.env
    ```

    In the compose file, every directory the app writes to is a bind mount under it, e.g. `${DATA_DIR}/uploads:/app/uploads`. Create those subdirectories as `sal` before the first start (`sudo -u sal mkdir /srv/<app>/uploads`). A container that writes as its own user (e.g. PostgreSQL) needs that user as the owner of its subdirectory; the app's documentation says which user.

5. **Listen on localhost only,** so the app can't be reached around Caddy.
    * With Docker, publish ports on `127.0.0.1`: `"127.0.0.1:<port>:<port>"`. A plain `"<port>:<port>"` is reachable from the internet, even with a firewall (see [Docker warnings](docker.md#published-ports-bypass-the-firewall)). Check with `sudo docker ps --format '{{.Names}}\t{{.Ports}}'`: nothing should show `0.0.0.0:` or `[::]:`.
    * Without Docker, use a systemd service with `User=sal` and `WorkingDirectory=/opt/<app>`, and bind the app to `127.0.0.1`.
6. **Start it:**

    ```bash
    cd /opt/<app> && sudo docker compose up -d
    ```

7. **Add it to `/etc/caddy/Caddyfile`.**
    * No login of its own: behind the lab login.

        ```
        <app>.lab.societal-analytics.nl {
        	import authwall {
        		reverse_proxy 127.0.0.1:<port>
        	}
        }
        ```

    * Only for members of one group: create the group in the `lab` realm (**Groups**), add the members, and use `authwall-group`:

        ```
        <app>.lab.societal-analytics.nl {
        	import authwall-group <group> {
        		reverse_proxy 127.0.0.1:<port>
        	}
        }
        ```

    * Its own login, through Keycloak: create a client for it in the `lab` realm (**Clients → Create client**, client authentication on, the app's callback URL as **Valid redirect URI**), and configure the app's OIDC settings with issuer `https://auth.societal-analytics.nl/realms/lab` (e.g. Open WebUI):

        ```
        <app>.lab.societal-analytics.nl {
        	reverse_proxy 127.0.0.1:<port>
        }
        ```

    * For long requests or large uploads, add a `transport http { read_timeout 3000s write_timeout 3000s }` block inside `reverse_proxy`, and `request_body { max_size 2.5GB }` to the site.
8. **Add it to the overview page** (`/var/www/lab/index.html`), and reload Caddy.

**Moving a service to its address under `lab.`:** keep the old address working for a while with a redirect, e.g. `whisper.societal-analytics.nl { redir https://whisper.lab.societal-analytics.nl{uri} }`.

**Updating an app:**

```bash
cd /opt/<app> && sudo -u sal git pull && sudo docker compose up -d --build
```

**Removing an app:**

```bash
cd /opt/<app> && sudo docker compose down
```

```bash
sudo rm -r /opt/<app>
```

Its data stays in `/srv/<app>`: remove it as well (`sudo rm -r /srv/<app>`) once it is no longer needed, following the retention rules of the [privacy statement](../policies/privacy.md). Then remove its block from the Caddyfile and its line from the overview page, and reload Caddy.

**Moving an existing app's data to `/srv`:** stop the app (`sudo docker compose down`), create `/srv/<app>` as above, move the data directories with `sudo mv`, fix the owner with `sudo chown -R sal:sal /srv/<app>` (except for subdirectories owned by a container's user), set `DATA_DIR` and the bind mounts, and start it again.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| `caddy validate` says `unrecognized directive: {block}` | Caddy is older than 2.9 (Ubuntu's own package): install it from Caddy's apt repository (section 2). |
| Keycloak shows "Invalid parameter: redirect_uri" | `https://lab.societal-analytics.nl/oauth2/callback` is not in **Valid redirect URIs** of `lab-authwall`, or `OAUTH2_PROXY_REDIRECT_URL` differs from it. |
| A service behind the lab login returns 502 | Caddy can't reach oauth2-proxy (`curl -s localhost:4180/ping` should print `OK`), or the service itself. `journalctl -u caddy -n 20` says which. |
| "Forbidden" after logging in | The service uses `authwall-group`, and the user is not in that group in the `lab` realm. |
| A page of oauth2-proxy with a "Sign in" button | `OAUTH2_PROXY_SKIP_PROVIDER_BUTTON` is not set. |
| After signing out, the next visit logs straight back in | `OAUTH2_PROXY_BACKEND_LOGOUT_URL` is missing or wrong, so the Keycloak session wasn't ended. |
| oauth2-proxy doesn't start | Check `cd /opt/oauth2-proxy && sudo docker compose logs`. It needs to reach `https://auth.societal-analytics.nl/realms/lab` at startup. If the network can't be created, its range is in use: choose another `subnet` (and `gateway`, and `OAUTH2_PROXY_TRUSTED_PROXY_IPS`). |
| oauth2-proxy logs "no --trusted-proxy-ip CIDRs were configured" | The setting is missing or misspelled: it is `OAUTH2_PROXY_TRUSTED_PROXY_IPS` (plural). |
| A change to the Caddyfile has no effect | The reload failed: `sudo caddy validate --config /etc/caddy/Caddyfile`, or `journalctl -u caddy -n 50`. |

## Tested

On a test installation (November 2026), with oauth2-proxy v7.15.6 (built from source, in a container with the settings and network above), Caddy 2.11 with these snippets, and the `lab` realm of our Keycloak:

* a first visit to a service goes to the lab login, comes back through the one fixed callback, and ends on the same page; the service receives the user's email address;
* the login cookie is set for the zone, so a second service needs no login and no redirect; a site outside the zone receives no cookie; a service with its own login under the zone keeps working;
* the overview page shows who is signed in; signing out there ends the login for all services and the Keycloak session, and goes to the website;
* with a short idle time: a user who keeps working stays signed in, an inactive user has to log in again, and a 90-second request completes;
* a service restricted to a group lets members of the group in, and shows "Forbidden" to other lab members;
* oauth2-proxy sees Caddy's requests from the gateway `172.30.255.1`, and ignores forged `X-Forwarded-*` headers from any other address; it can't reach an app on the server's `127.0.0.1`, and another container can't reach it;
* Keycloak refuses a redirect URI with a wildcard in the host name.
