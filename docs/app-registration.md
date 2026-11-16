# App registration

The app registration site (`https://apps.example.org`) lets people use our login service (the `idp` realm of our [Keycloak](./keycloak-deploy.md)) for their own server or app. They log in, register an app, and get a client ID and secret for OpenID Connect (OIDC). They manage the app's settings on the same site. Why the idp realm is open to everyone, and what "best effort" means: [Keycloak setup](./keycloak.md#the-idp-realm-open-to-everyone-best-effort).

!!! info "Placeholders"
    This page uses `apps.example.org` and `auth.example.org` for the real hostnames.

## For app developers

1. Go to `https://apps.example.org` and log in (or create an account). Your email address must be verified.
2. Click **Register a new app**. Fill in a name (shown to users when they log in), and the redirect URIs of your app.
3. The app page shows the connection details: the issuer `https://auth.example.org/realms/idp`, the client ID, and the client secret.

Configure your server with these details. Most OIDC libraries only need the issuer (they find the rest via the discovery URL), the client ID and the secret.

| Rule | Why |
| --- | --- |
| **Authorization code flow with PKCE (S256)** | Other flows (implicit, password) are turned off, and PKCE is required. |
| **The client secret stays on your server** | Apps are confidential clients. Create a new secret on the app page if it may have leaked. |
| **Redirect URIs are exact URLs, with `https://`** | `http://` is only allowed for `localhost`, `127.0.0.1` and `[::1]` (development). No wildcards (`*`) and no `#fragments`. At most 10. |
| **Users always consent** | Before your app gets their name and email address, users see a consent screen with your app's name. |

The ID token contains `email` (verified), `name`, and `amr`: `amr` contains `mfa` when the user logged in with a second factor. 2FA is optional in this realm; if your app needs it for sensitive actions, check `amr` and ask the user to log in again with a second factor (see the [Authentication standard](./auth.md#two-factor-authentication-2fa)).

### Limits

| Limit | Default |
| --- | --- |
| Apps per user | 3 |
| Emails per app | 25 per 30 minutes |

The email limit counts the emails our login service sends because of your app: to verify email addresses (after registering) and to reset passwords. Above the limit, people who try to register or reset their password through your app see "This app has reached its limit for sign-ups and password resets", and can try again later. Logging in to your app always keeps working. Contact us if your app needs more apps or a higher email limit.

## For administrators

### How it works

The site is a small Node.js server ([`deploy/keycloak/app-registration/`](https://github.com/vu-societal-analytics/societal-analytics-lab-infra/tree/main/deploy/keycloak/app-registration)), deployed with Keycloak ([step 8 of the runbook](./keycloak-deploy.md#8-app-registration)).

* **Login:** users log in with the client `app-registration` in the `idp` realm (authorization code flow with PKCE). The site keeps a signed session cookie for 8 hours.
* **Managing apps:** the same client has a service account with one role of the `realm-management` client: `manage-clients`: it can create, change and delete any client in the idp realm (including Keycloak's built-in clients), and nothing else: no access to users, realm settings or login flows. It also holds the realm role `client-self-service`, which only makes the client policy below apply to it. The client and its role are defined in `realms/idp-realm.json`.
* **Ownership:** an app (client) belongs to the user whose ID is in its attribute `registration.owner`. Users only see and change their own apps, and only the settings on the site: name, description, home page, redirect URIs, post logout redirect URIs, and logo, privacy policy and terms of service URLs.
* **Fixed settings:** every app is a confidential client with only the authorization code flow, PKCE (S256), consent required, and no service account. Tokens don't contain the user's roles in the `idp` realm (`fullScopeAllowed` off).
* **Enforced by Keycloak too:** the client policy `self-service-clients` (in `realms/idp-realm.json`) applies to every change made by the site's service account: it turns on consent and PKCE, and refuses redirect URIs with wildcards or other unsafe forms. So even a bug in the site can't create an app without consent or with a wildcard redirect URI. Admins (in the admin console) are not affected by this policy.
* **Email limit:** not part of the site. Caddy limits the emails per app (client ID), in tiers set in `caddy/email-tiers.caddy` on the VM (see [Email limits](./keycloak-deploy.md#email-limits)).

**Why not let owners use the Keycloak admin console?** Keycloak can give a user access to only their own clients (fine-grained admin permissions), and we tested that: it works. But creating those permissions for each new user requires the role `manage-realm`, which can change the whole realm, including login flows and login providers. Giving that role to a web application was too risky, so the site manages the apps itself, with narrow rights.

### Settings

In `.env` (see `.env.example`):

| Setting | Default | |
| --- | --- | --- |
| `APPS_HOSTNAME` | | The hostname of the site |
| `APP_REGISTRATION_CLIENT_SECRET` | | Secret of the `app-registration` client; set in Keycloak by the realm configuration |
| `APP_REGISTRATION_SESSION_SECRET` | | Signs the session cookies |
| `MAX_APPS_PER_USER` | 3 | |
| `CONTACT_EMAIL` | | Shown to users who reach a limit |

Apply changes with `sudo docker compose up -d app-registration`.

### Common tasks

All commands are run from the deployment folder, after `sudo ./admin-cli.sh login` (see the runbook). Find the internal ID of an app first:

```bash
sudo ./admin-cli.sh get clients -r idp -q clientId=<client ID> --fields id,clientId,enabled,attributes
```

**A higher email limit for an app** (for owners you trust): add a line with its client ID and tier to `email_tier_apps` in `caddy/email-tiers.caddy` (tier2: 100 per 30 minutes, tier3: 500), and apply it with `sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` (see [Email limits](./keycloak-deploy.md#email-limits)).

**More apps for a user:** register the app for them in the admin console (or let them use a colleague's account), and make them the owner by setting `registration.owner` to their user ID (**Users → the user → Details**, field ID):

```bash
sudo ./admin-cli.sh update clients/<id> -r idp -s 'attributes."registration.owner"=<user ID>'
```

The same command transfers an app to another owner. An app created in the admin console must also follow the fixed settings above (consent, PKCE, confidential client).

**Disable an app** (e.g. abuse): **Clients → the app → Enabled** off in the admin console. The site doesn't enable it again, and tells the owner to contact us.

**Logs:** registrations, new secrets and deletions are logged:

```bash
sudo docker compose logs app-registration
```

Changes to clients also appear in the admin events of the `idp` realm (**Events → Admin events**).

### Development

```bash
cd deploy/keycloak/app-registration
```

```bash
npm install && npm test
```

The tests cover the validation of the form. The whole flow (login, registering, editing, a new secret, consent, the limit on apps, deleting) was tested end to end against a local Keycloak with the realm configuration.
