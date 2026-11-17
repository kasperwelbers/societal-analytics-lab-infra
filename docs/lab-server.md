# Lab server

How applications are installed on the lab server (LabServices: Whisper, Ollama and other tools), and how apps without a login of their own get the lab login (the AuthWall). Why it is set up this way: [Decisions](./decisions.md#the-lab-server).

!!! info "Placeholders"
    This page uses `llm.example.org` for the server, `<app>.example.org` for its apps, `auth.example.org` for the lab's Keycloak, and `admin@example.org`. The real names are only on the server.

All applications live in their own directory `/opt/<app>`, owned by the system account `sal`. `/opt` itself stays owned by root. Caddy (in `/etc/caddy`) is the only thing reachable from outside: it handles HTTPS, and puts the lab login in front of apps that have no login of their own.

## 1. The system account

Once per server:

```bash
sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin sal
```

For each admin, so that they can enter the app directories:

```bash
sudo usermod -aG sal <admin>
```

`/opt` stays as it is: owned by `root:root`, mode `755`. `sal` is **not** in the `docker` group: membership of that group is effectively root access (see [University VMs](./vm.md)), and apps that run as `sal` without Docker would get it too. Admins run Docker with `sudo`.

**How access works**

* Each app directory is owned by `sal:sal`, with mode `750`. `sal` can change everything, admins (the `sal` group) can enter and read, and other users can't enter at all. That last part is what protects the files inside, whatever their own modes are.
* Secrets in `.env` get mode `600`, so only `sal` can read them. Admins use `sudo` when they need to.

**Rules for admins**

* Everything inside `/opt/<app>` is done as `sal`: `sudo -u sal <command>`, or `sudo -u sal bash` for longer work. The exception is Docker: `sudo docker compose ...`, from the app's directory.
* Edit files with `sudoedit -u sal <file>`. It opens your own editor with your own settings, and saves the file as `sal`.
    * Choose the editor in your `~/.bashrc`: `export SUDO_EDITOR=nvim` (or `nano`).
    * Don't run the editor as `sal` (`sudo -u sal nvim`): `sal` has no home directory for the editor's own files.
* Pasting into a file on the server: go into insert mode and use your terminal's paste shortcut: `Cmd+V` on a Mac, `Ctrl+Shift+V` on Linux, `Ctrl+V` or right-click in Windows Terminal or PuTTY. (`"+p` doesn't work: a server has no clipboard.)
* Never use plain `sudo` for other commands inside an app directory, or files end up owned by root. Docker creates a missing directory for a bind mount as root, so create data directories as `sal` before the first start.
* After copying files in from elsewhere, fix the owner: `sudo chown -R sal:sal /opt/<app>`.

## 2. Caddy and the lab login

### Caddy

Install Caddy from its official apt repository (see [Install](https://caddyserver.com/docs/install)). It runs as a service and reads `/etc/caddy/Caddyfile`. Check `caddy version`: the snippets below need 2.9 or newer.

HTTPS is automatic: every site with a domain name gets a Let's Encrypt certificate, renewed on its own, as long as its DNS points to this server and ports 80 and 443 are open.

After each change to the Caddyfile:

```bash
sudo systemctl reload caddy
```

Sites keep running during the reload. If the new file has an error, Caddy keeps the old configuration; see why with `journalctl -u caddy -n 50`.

### The lab login (oauth2-proxy)

Apps without their own login sit behind [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/), which sends visitors to the lab's Keycloak (the `lab` realm). Users log in once: for the next app, Keycloak's session lets them in without a login page. Each app gets its own cookie, so an app never receives the login of another.

**In Keycloak** (admin console of the `lab` realm), create the client `lab-authwall`:

1. **Clients → Create client.** **Client ID:** `lab-authwall`. **Next.**
2. **Client authentication:** on. **Authentication flow:** only **Standard flow**. **Next.**
3. **Valid redirect URIs:** one line per app behind the login, `https://<app>.example.org/oauth2/callback` (no wildcards: each app is added when it is installed, see step 3). **Valid post logout redirect URIs:** `+`. **Save.**
4. **Advanced** tab: **Proof Key for Code Exchange Code Challenge Method:** `S256`. **Save.**
5. **Client scopes** tab → `lab-authwall-dedicated` → **Configure a new mapper** (or **Add mapper → By configuration**):
    * **Audience:** name `audience`, **Included Client Audience** `lab-authwall`, **Add to ID token** and **Add to access token** on. oauth2-proxy needs this.
    * **Group Membership:** name `groups`, **Token Claim Name** `groups`, **Full group path** off. Only needed for apps restricted to a group (step 3).
6. **Credentials** tab: copy the **Client secret**.

**On the server**, create its directory:

```bash
sudo mkdir /opt/oauth2-proxy
```

```bash
sudo chown sal:sal /opt/oauth2-proxy && sudo chmod 750 /opt/oauth2-proxy
```

Create `/opt/oauth2-proxy/compose.yml` with `sudoedit -u sal`. It uses the server's network, and only listens on localhost:

```yaml
services:
  oauth2-proxy:
    # Pin a release; check https://github.com/oauth2-proxy/oauth2-proxy/releases for a newer one
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.6
    restart: unless-stopped
    # Caddy (on the server itself) reaches it at 127.0.0.1:4180
    network_mode: host
    env_file: .env
    environment:
      OAUTH2_PROXY_PROVIDER: keycloak-oidc
      OAUTH2_PROXY_OIDC_ISSUER_URL: https://auth.example.org/realms/lab
      OAUTH2_PROXY_CODE_CHALLENGE_METHOD: S256
      # All members of the lab realm; restrict an app to a group in the Caddyfile (step 3)
      OAUTH2_PROXY_EMAIL_DOMAINS: "*"
      # Where users may be sent back to after logging in
      OAUTH2_PROXY_WHITELIST_DOMAINS: .example.org
      # Go straight to the lab login, without oauth2-proxy's own "Sign in" page
      OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true"
      OAUTH2_PROXY_REVERSE_PROXY: "true"
      # Only Caddy may set X-Forwarded-* headers
      OAUTH2_PROXY_TRUSTED_PROXY_IP: 127.0.0.1/32
      OAUTH2_PROXY_SET_XAUTHREQUEST: "true"
      OAUTH2_PROXY_HTTP_ADDRESS: 127.0.0.1:4180
```

No `COOKIE_DOMAINS`: without it, each app gets its own cookie.

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
	email admin@example.org
}

# The lab login, for apps without their own: import authwall { reverse_proxy ... }
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

# The same, for an app that only members of one Keycloak group may use:
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
```

The app receives the user's email address in the header `X-Auth-Request-Email`. Two separate snippets, because a snippet argument that isn't given stays in the text literally.

**How long a login lasts:** oauth2-proxy's cookie is valid for 7 days (its default). Someone removed from the `lab` realm (or from a group) keeps access to an app until their cookie for that app expires. For a shorter time, set `OAUTH2_PROXY_COOKIE_EXPIRE` (e.g. `12h`) in `compose.yml`.

## 3. Adding an application

1. **Choose a free port.** See which ports are taken with `sudo ss -tlnp` (and in the Caddyfile).
2. **Create the directory,** as an admin:

    ```bash
    sudo mkdir /opt/<app>
    ```

    ```bash
    sudo chown sal:sal /opt/<app> && sudo chmod 750 /opt/<app>
    ```

3. **Put the app in it,** as `sal`. The directory must be empty for `git clone`. A private repository needs a deploy key (a read-only SSH key for that repository) for `sal`.

    ```bash
    sudo -u sal git clone <repo> /opt/<app>
    ```

4. **Secrets** go in `/opt/<app>/.env`, readable only by `sal`:

    ```bash
    sudo -u sal chmod 600 /opt/<app>/.env
    ```

5. **Listen on localhost only,** so the app can't be reached around Caddy.
    * With Docker, publish ports on `127.0.0.1`: `"127.0.0.1:<port>:<port>"`. A plain `"<port>:<port>"` is reachable from the internet, even with a firewall (see [Docker and the VM firewall](./vm.md#docker-and-the-vm-firewall)).
    * Without Docker, use a systemd service with `User=sal` and `WorkingDirectory=/opt/<app>`, and bind the app to `127.0.0.1`.
6. **Start it:**

    ```bash
    cd /opt/<app> && sudo docker compose up -d
    ```

7. **Add it to `/etc/caddy/Caddyfile`.**
    * No login of its own: behind the lab login. Also add `https://<app>.example.org/oauth2/callback` to **Valid redirect URIs** of the client `lab-authwall` in Keycloak (section 2).

        ```
        <app>.example.org {
        	import authwall {
        		reverse_proxy 127.0.0.1:<port>
        	}
        }
        ```

    * Only for members of one group: create the group in the `lab` realm (**Groups**), add the members, and use `authwall-group`:

        ```
        <app>.example.org {
        	import authwall-group <group> {
        		reverse_proxy 127.0.0.1:<port>
        	}
        }
        ```

    * Its own login (e.g. AmCAT, AnnoTinder, Jupyter with its token):

        ```
        <app>.example.org {
        	reverse_proxy 127.0.0.1:<port>
        }
        ```

    * For long requests or large uploads, add a `transport http { read_timeout 3000s write_timeout 3000s }` block inside `reverse_proxy`, and `request_body { max_size 2.5GB }` to the site.
8. **Point DNS** for `<app>.example.org` at the server, then reload Caddy (`sudo systemctl reload caddy`).

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

Then remove its block from the Caddyfile, reload Caddy, and remove its callback URL from the client `lab-authwall` in Keycloak.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| Keycloak shows "Invalid parameter: redirect_uri" | The app's `https://<app>.example.org/oauth2/callback` is not in **Valid redirect URIs** of `lab-authwall`. |
| "Forbidden" after logging in | The app uses `authwall-group`, and the user is not in that group in the `lab` realm. |
| A page of oauth2-proxy with a "Sign in" button | `OAUTH2_PROXY_SKIP_PROVIDER_BUTTON` is not set. |
| oauth2-proxy doesn't start | Check `cd /opt/oauth2-proxy && sudo docker compose logs`. It needs to reach `https://auth.example.org/realms/lab` at startup. |
| A change to the Caddyfile has no effect | The reload failed: `journalctl -u caddy -n 50`. |

## Tested

On a test installation (November 2026), with oauth2-proxy v7.15.6 (built from source, with the settings above), Caddy 2.11 with these snippets, and the `lab` realm of our Keycloak:

* a first visit to an app goes to the lab login (password, and setting up 2FA the first time), and back to the same page; the app receives the user's email address;
* a second app logs in without a login page (single sign-on through Keycloak);
* each app has its own cookie, and an app with its own login receives none;
* an app restricted to a group lets members of the group in, and shows "Forbidden" to other lab members, who can still use the other apps.
