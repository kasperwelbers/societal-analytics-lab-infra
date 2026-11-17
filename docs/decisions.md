# Decisions

This page records the choices behind our authentication setup: what we chose, why, and which alternatives we dropped. The other pages describe how it is; this page explains why. The evaluations behind these decisions are under **Background** ([2FA: where should it live?](./auth-2fa.md), [Provider comparison](./auth-providers.md)).

Last reviewed: November 2026.

## Authentication in our software

### OIDC for all our software

**Chosen:** AmCAT and AnnoTinder delegate logins to an OIDC provider, and work with any provider that meets our [requirements](./auth.md#oidc-provider-requirements).

**Why:** logins, passwords, second factors and account recovery are the provider's job, done by people who specialize in it; our software contains no password or 2FA code. The person hosting a server can use the provider their institution already has.

### Requirements: verified email, 2FA signal, step-up

**Chosen:** by default, the provider must confirm email addresses (`email_verified`), signal 2FA (`amr` or `acr`), and support step-up (`max_age`, `auth_time`). Our software checks the tokens itself.

**Why:** roles can be given to an email address, so the address must be verified. Sensitive actions (API keys, roles) need a recent login with a second factor. Providers don't always enforce what is asked of them, so our software checks the result itself instead of trusting the request. See the [Authentication standard](./auth.md).

### 2FA lives at the OIDC provider

**Chosen:** the second factor is part of the login at the provider (option A in [2FA: where should it live?](./auth-2fa.md)).

**Dropped (for now): a local broker on each server** (option B), which would add its own second factor on top of any provider. It would make the second factor independent of the provider, but each server would then run a security-critical login service, with an admin page for recovery that has to be exposed and protected too. Setting that up properly is harder than a clear, visible limitation. Option B needs no change to our software, so it can still be added later (see [Later](#later)).

### Weaker security for teaching: two explicit settings

**Chosen:** `AUTH_INSECURE_DISABLE_2FA` and `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION` ([Weaker security](./auth.md#weaker-security-teaching-and-low-sensitivity-servers)). Both are off by default, named "insecure", logged at every start, and shown permanently on the admin page.

**Why:** teams need an easy way to run a server for teaching or a pilot, with whatever login they have. A limitation that everyone understands ("this server doesn't require 2FA") is better than a complex setup that is easy to get wrong.

**Dropped:**

* **A shared OIDC provider run by the lab for other teams' servers** (the `idp` realm with self-service app registration). It would make us responsible for the availability of their servers, and for recovering their users' second factors, and as the operator we could log in as any of their users. See [The idp realm](#the-idp-realm-the-labs-own-login-not-a-public-service).
* **`OIDC_MFA_CLAIM=none`:** reads like a harmless default, not like a deliberate weakening.
* **A setting that "trusts" the provider's email addresses:** we record `email_verified = false` when the claim is missing, so we don't trust it; we skip the check. Hence a flag of the same kind as the 2FA flag.

### `email_verified` and `has_mfa` in the user table

**Chosen:** the user table records `email_verified` (what the provider sent at the last login: `true`, otherwise `false`; `NULL` for shadow users) next to `has_mfa`. The admin page warns about users with roles and an unverified address; `has_mfa` is shown without a warning, because 2FA is only needed for sensitive actions.

**Why:** with `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`, admins must be able to see who could claim roles without a verified address. Later, our software could verify addresses itself (see [Later](#later)).

## The identity provider of the lab

### Keycloak

**Chosen:** one Keycloak installation for the lab ([Keycloak setup](./keycloak.md)).

**Why:**

* **Realms:** separate logins (users, sessions, keys, admins) in one installation: `lab`, `idp`, and later realms for other teams.
* **Everything our standard needs:** `email_verified`, `amr` (with our configuration), step-up with `max_age`, and it can also be asked for 2FA (`acr_values`). Consent per client, enforced by client policies.
* **Realm files:** the configuration of a realm is a file in the repository, which documents it and sets it up again.
* **A mature project** with a large community, backed by Red Hat and the CNCF.

**Dropped:**

* **Authentik** (our previous provider): no isolated pools within one installation (its multi-tenancy was removed), and it depends on a small company. It also can't be *asked* for 2FA: an app can't send `acr_values` to make Authentik require a second factor; whether 2FA is asked depends only on the login flow. With our step-up (`max_age`, checking `amr`) that matters little, as long as the flow asks for 2FA from everyone who has it.
* **ZITADEL:** no consent screen (any registered app gets the data of a signed-in user), and its organizations don't isolate users.
* **SURF SRAM as our provider:** less control (we can't reset 2FA or recover accounts ourselves), depends on approval by the university, and not suitable for our open `idp`. It may become a login option of `lab` (see [Later](#later)).

The comparison and the hands-on tests: [Provider comparison](./auth-providers.md).

### `lab` and `idp` are separate realms

**Chosen:** `lab` (the lab's infrastructure: members added by us, mandatory 2FA, no Google or GitHub) and `idp` (the lab's AmCAT and AnnoTinder servers: open sign-up, optional 2FA) are separate realms.

**Dropped: one realm, with roles for lab access and mandatory 2FA per client.**

* **Mandatory 2FA per client works badly with single sign-on:** after a login without 2FA to one server, the session would also open a lab service, unless Keycloak's levels of authentication are used, the mechanism of a recent bypass vulnerability (CVE-2026-97176).
* **Open sign-up in the realm of the lab services:** one lab service that forgets its role check would be open to anyone with a Google account. Separate realms make this impossible by design.
* **Different rules:** login options, texts, recovery and admins differ between the two.

The cost: lab members have two accounts. `lab` as a login option of `idp` solves that later (see [Later](#later)).

### The `idp` realm: the lab's own login, not a public service

**Chosen:** `idp` is the one login for the lab's own servers. Anyone can create an account (with email, Google or GitHub), but an account gives no access by itself: each server gives roles. Our admins create the clients of our servers in the admin console; a client policy turns on consent and PKCE and refuses unsafe redirect URIs ([step 8 of the runbook](./keycloak-deploy.md#8-clients-for-our-deployments)).

**Why:** students and collaborators sign up themselves when a project gives them access, instead of waiting for an admin. The client policy prevents mistakes, not misuse: admins are trusted.

**Servers get the email address and the 2FA signal** (and the account ID and login time), and the name only if they ask for it (the scope `profile`), not roles. Our software only uses the email address and the 2FA signal, so it requests `openid email`; other services (which often request `profile`) work too. The consent screen says it in words everyone understands: "see your email address; see whether you signed in with two-factor authentication", plus "see your name" for services that ask for it. Keycloak refuses a request for a scope it doesn't offer (e.g. `roles`), so only these are offered.

**Dropped:**

* **`idp` as a public service for other teams' servers**, with the app registration site (where others registered their servers) and email limits per app in tiers. See [Weaker security for teaching](#weaker-security-for-teaching-two-explicit-settings) for why; with only our own servers, these are no longer needed.
* **Closed sign-up in `idp`:** every student and collaborator would have to be added by an admin first.
* **Letting app owners manage their client in the admin console** (fine-grained admin permissions): creating those permissions requires a role that can change the whole realm. (No longer relevant without outside app owners.)

### Login in `lab`: password and mandatory 2FA

**Chosen:**

* **Members are added by us,** without a password and without an email from us. They set their password themselves with **First time, or forgot your password?** on the login page. After the email link, in one go: a password, their name, an authenticator app, recovery codes, and they're in ([Adding lab members](./keycloak-deploy.md#adding-lab-members)).
* **2FA is mandatory:** these accounts give access to our infrastructure, and a mandatory second factor is needed for `lab` to become a trusted login option of `idp` later.
* **"Remember me"** keeps members logged in for up to 30 days on their own device.

**Dropped:**

* **Login with a code or link by email, without passwords:** Keycloak can't do this without a third-party extension, and we don't install extensions in our login service.
* **Invitation emails sent by us:** members sign up when they need a lab service.
* **Passkeys as the default second factor:** many people don't understand them. Passkeys are offered in the account console, and a passkey alone counts as two factors.
* **Optional 2FA in `lab`, with a recommendation:** a login flow can't offer a skippable step. A landing page could recommend 2FA (an app can send users to the 2FA setup with a **Cancel** button), but `lab` keeps 2FA mandatory.

### A password reset never replaces the second factor

**Chosen:** after the email link, users with a second factor enter it before they can choose a new password ([How users log in](./keycloak.md#how-users-log-in)).

**Dropped:** Keycloak's default reset, which logs the user in after the new password without the second factor, and lets them set up a new authenticator app, so an inbox was enough to take over an account. Also dropped: a first fix that made users log in again after the reset (secure, but clumsy for new members).

### Recovery codes, and OTP as the default second factor

**Chosen:** users who set up an authenticator app (OTP) get recovery codes right after. Where 2FA is mandatory, users without a second factor are asked to set up OTP.

**Why:** OTP works on every device, with any authenticator app. Recovery codes let users recover from a lost phone without us, which matters because email can't be used for that.

### Our look: texts and CSS only

**Chosen:** Keycloak themes with the lab logo, colours and our texts, but no changed page templates ([Themes](./keycloak-deploy.md#themes)).

**Why:** page templates change between Keycloak versions and can break after an upgrade; texts, CSS and images rarely do. Users see whose login this is.

**Dropped:** the VU logo (its use is usually restricted to official VU communication; a link to the department page instead), and realm overrides for texts (a changed "Email" label then also showed up outside the login pages).

## The Keycloak deployment

### Setup

* **One VM, Docker Compose, Keycloak's optimized image:** recommended in [Running Keycloak in a container](https://www.keycloak.org/server/containers); build options are baked in, so starts are faster and predictable.
* **Caddy in front, re-encrypt:** the [reverse proxy guide](https://www.keycloak.org/server/reverseproxy) prefers re-encrypt over plain HTTP between proxy and Keycloak. Caddy terminates the public TLS connection, so it can filter paths and IP addresses; Keycloak only accepts HTTPS, with an internal, long-lived certificate that only Caddy trusts. (Passthrough would make path and IP filtering impossible.)
* **Only `/realms/`, `/resources/` and `/.well-known/` are public:** the exposed paths recommended in the reverse proxy guide. The admin consoles, the admin API and the `master` realm are only on a separate admin hostname, restricted to the university's IP ranges. The ranges are in a local file on the VM, not in the repository; a realm for a team outside the university can get an exception for its own admin console.
* **The health endpoint on plain HTTP** (port 9000): only used by the container's health check, and not exposed.
* **All Caddy settings in one mounted folder:** Docker keeps showing the old version of a single mounted file after an editor replaces it, so a reload would silently not apply a change.
* **PostgreSQL 18:** the version Keycloak 26.8 is tested with.
* **A temporary bootstrap admin,** replaced by a permanent admin with 2FA ([Bootstrapping and recovering an admin account](https://www.keycloak.org/server/bootstrap-admin-recovery)).

### Realm files, imported by Keycloak itself

**Chosen:** complete realm files, imported by Keycloak's own `--import-realm` when a realm doesn't exist yet ([Realms](./keycloak-deploy.md#7-realms)). Later changes are made in the admin console.

**Dropped:** keycloak-config-cli, a third-party tool that applies the files again and again. It needs an admin client with a secret on the server, for a workflow we don't use.

### The email relay, and secrets admins can use but not take

**Chosen:** Keycloak sends all email through a relay on the VM, without a password; only the relay holds the email provider's password. It also caps all email, accepts only our sender address, and queues mail. The Google and GitHub secrets of `idp` are stored masked in Keycloak, which requires them again when a provider is pointed elsewhere.

**Why:** a realm admin can change a realm's email server. With Keycloak's own SMTP login, Keycloak would send the password to whatever server they enter. This is an extra layer, not a wall: admins can send email and use the Google and GitHub logins, and a real admin can always replace the secrets, but not read them out. It matters most once other teams get their own realm.

**Dropped:** Keycloak's file vault for the secrets: a realm admin can use a vault reference anywhere, and so send the secret to their own server (tested).

### Email limits

**Chosen:** a limit per IP address in Caddy, on the requests that make Keycloak send an email, and a cap on all email in the relay ([Email limits](./keycloak-deploy.md#email-limits)).

**Why:** Keycloak has no limit on the emails it sends, and its brute force detection only covers logins. Blocking only the requests that send an email never breaks logins or the sessions of a server. The cap on all email is in the relay, because only the relay counts emails that were actually sent; a limit on all requests in Caddy could be used up by one person.

**Dropped:** limits per app, in tiers (only needed while others could register apps), and disabling a client that sends too much email (it would also break the logins and refresh grants of that server, and could be abused to block it).

## The lab server

### One system account, Caddy on the server, Docker with `sudo`

**Chosen:** every app in `/opt/<app>`, owned by the system account `sal` (no login, no home directory); admins are in the `sal` group and work as `sal` with `sudo -u sal` and `sudoedit -u sal`. Caddy runs on the server itself and is the only way in. Admins run Docker with `sudo` ([Lab server](./lab-server.md)).

**Why:** one convention for all apps on a server with many small apps, and no app files owned by root or by an admin's personal account. Caddy in front of everything gives HTTPS and one place to decide what is reachable.

**Dropped:** `sal` in the `docker` group. Membership of that group is effectively root access, and apps that run as `sal` without Docker would get it too.

### All lab services under `lab.`, with one login cookie for the zone

**Chosen:** every service the lab runs for its members gets an address under `lab.example.org` (e.g. `whisper.lab.example.org`), with or without its own login, and `lab.example.org` is the overview page. Services without their own login sit behind oauth2-proxy with Caddy's `forward_auth`, against the `lab` realm. oauth2-proxy sets **one login cookie for the zone** (`.lab.example.org`), and every login comes back to one fixed address (`lab.example.org/oauth2/callback`). Signing out ends the login for all services and the Keycloak session (oauth2-proxy's backend logout). oauth2-proxy checks the session with Keycloak every 10 minutes, so inactive users (2 hours, Keycloak's idle time) and removed members are signed out ([Lab server](./lab-server.md#2-caddy-and-the-lab-login)).

**Why:** users need one login, and one sign-out that ends everything. oauth2-proxy can't do that with a cookie per service: a browser only lets a site clear its own cookies, and oauth2-proxy doesn't support Keycloak's back-channel logout. A shared cookie is the common way to use oauth2-proxy, but a cookie for the whole domain would also go to the lab's website, which is hosted by GitHub Pages. A zone of its own keeps the cookie within the lab's own services on this server, which could reach each other anyway. The zone also makes the rule visible: everything under `lab.` is a lab service.

**The condition:** only services the lab runs on its own servers may be under `lab.`. A site hosted by someone else would receive a login that works for all services behind the lab login (the cookie isn't bound to one service).

**oauth2-proxy in a Docker network of its own,** with its port published on `127.0.0.1` only, and only the gateway of that network trusted for `X-Forwarded-*` headers. It can't reach the apps on the server's localhost, and no other container can reach it.

**Dropped:**

* **A cookie per service:** signing out of one service would leave the others logged in until their next check with Keycloak. (oauth2-proxy also doesn't bind a cookie to a service, so it protected less than it seemed.)
* **One cookie for the whole domain:** it would be sent to the website on GitHub Pages.
* **Services under one address, by path** (`lab.example.org/whisper`): all services would share one origin, so their cookies could clash, and a bug in one could read the others' pages; many apps also can't run under a sub-path.
* **A wildcard redirect URI** (`https://*.lab.example.org/...`): Keycloak doesn't allow a wildcard in the host name (tested). One fixed callback replaces it.
* **`network_mode: host` for oauth2-proxy** (simpler, but a compromised oauth2-proxy could reach every app on the server's localhost).
* **A CMS for the website on the lab server:** the public website stays on GitHub Pages (quick updates, nothing to maintain); the overview page of lab services is a static page behind the lab login.

## Later

* **"Sign in with your lab account" in `idp`:** `lab` as a login option of `idp`, so lab members use one account. A login through `lab` (which always requires 2FA) could count as 2FA in `idp`, if step-up works: `idp` must pass a request for a fresh login (`max_age`) on to `lab`. To be tested.
* **Institutional login for `lab`,** via SURF SRAM ([Lab authentication](./lab-auth.md#later-institutional-login-via-sram)). A known list of lab services fits SURF's review better than `idp` would.
* **A local broker (option B)** as a deployment option, if the field moves towards passkeys that sync across devices, or a lightweight broker with upstream login and enforced 2FA matures (see [2FA: where should it live?](./auth-2fa.md#why-b-can-be-added-later)).
* **Recommending 2FA in `idp`** on a landing page of the lab's services: an app can send users to the 2FA setup with a **Cancel** button (`kc_action`), and learns whether they set it up.
* **Verifying email addresses in our software,** for servers with their own email server, so that `email_verified` can become `true` without the provider.
