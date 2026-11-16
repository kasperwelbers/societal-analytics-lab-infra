# Keycloak setup

A helicopter view of our Keycloak installation: what it is for, how it is organized, and how it is secured. The details are on other pages: [Keycloak deployment](./keycloak-deploy.md) (the runbook), [App registration](./app-registration.md), and the [Authentication standard](./auth.md) that our software follows.

## Three realms

A realm in Keycloak is a separate login: its own users, apps, settings and admins. Users of one realm don't exist in another.

| Realm | For | Login | Who can join |
| --- | --- | --- | --- |
| **master** | Administering Keycloak itself | Password + mandatory 2FA | Only the administrators |
| **lab** | The lab's own infrastructure | Password + mandatory 2FA | Added by us, with an institutional email address |
| **idp** | Logins for servers that run our software, hosted by others | Password, Google or GitHub; 2FA optional | Anyone |

* **master** has no email and no external logins, so admin access never depends on an inbox or someone's Google account. Lost access is recovered via the server.
* **lab** uses institutional email addresses, so there is no Google or GitHub login. (Institutional login, e.g. via SURF, may come later; see [Lab authentication](./lab-auth.md).)
* **idp** is the shared login provider that teams can use for their own AmCAT or AnnoTinder server (option 1 in the [Installation guide](./auth-install.md)).

**How users log in** (password, passkey, Google or GitHub, the second factor, and what to do after losing a password or phone): see [How users log in](#how-users-log-in) below.

The realms are set up from realm files in the repository (`deploy/keycloak/realms/`), which Keycloak imports itself when it starts, for realms that don't exist yet. They document the configuration, including the login flows, and make it easy to set up the realms again (see [Realms](./keycloak-deploy.md#7-realms) in the runbook).

## How users log in

| | master | lab | idp |
| --- | --- | --- | --- |
| **Sign in with** | Password, or only a passkey | Password, or only a passkey | Password, only a passkey, Google or GitHub |
| **Second factor (2FA)** | Mandatory | Mandatory | Optional |
| **Forgot password** | Not possible (no email): another admin, or the VM | Email link, then log in again with the second factor | Same as lab |
| **Lost second factor** | Recovery code, another admin, or the VM | Recovery code, or a lab admin | Recovery code, or us (best effort) |

In all realms, the email address is the username. A second factor is an authenticator app (one-time codes, OTP), a passkey or security key, or a recovery code. Tokens contain `amr`: `pwd` for a password, `mfa` for a second factor. Servers that run our software check `mfa` for sensitive actions (see [Two-factor authentication](./auth.md#two-factor-authentication-2fa)).

**Why:**

* **Mandatory 2FA in master and lab,** because these accounts give access to our infrastructure. **Optional in idp,** to keep the barrier low for an open service: each server decides for itself when it requires `mfa`.
* **A passkey alone counts as two factors:** the device, plus a fingerprint, face or PIN to unlock it. Passkeys can't be phished: they only work on our own domain.
* **Email never replaces the second factor.** Someone who gets into a user's inbox can reset the password, but still needs the second factor to log in. (Keycloak's default reset also lets the user set up a new authenticator app, so an inbox would be enough to take over an account. We turned that off.)
* **master has no email and no external logins,** so admin access never depends on an inbox or someone's Google account.

### Step by step

* **First time (lab):** lab members are added by us, without a password (see [Adding lab members](./keycloak-deploy.md#adding-lab-members)). They click **First time, or forgot your password?** on the login page, get a link by email, choose a password and fill in their name. Then they log in, and set up an authenticator app and recovery codes. Others get no email.
* **Password:** email address and password, then the second factor if the user has one (**Try another way** offers the user's other second factors, e.g. a recovery code). In master and lab, users without a second factor set up an authenticator app at their first login, and get recovery codes right after: shown once, to save somewhere safe. (The token of that first login has `amr` `pwd` only, because setting up an app doesn't count as using it. A server that requires `mfa` asks for a code once more.)
* **Passkey:** **Sign in with Passkey** on the login page (or the browser's suggestion in the email field), then the fingerprint, face or PIN. No password and no other factor. Users register a passkey in the account console (**Account security → Signing in**), which offers it twice. A passkey under **Passwordless** is for signing in with only the passkey. A passkey under **Two-factor authentication** is a second factor after the password. Both work.
* **Google or GitHub (idp only):** the first time, an account is created with the address from Google or GitHub (Keycloak verifies a GitHub address itself). If an account with that address already exists, Keycloak shows **Account already exists**: the user links the two by clicking a link sent to the address, or by entering the account's password (and its second factor; after linking it is asked once more, only this first time). After that, users with a second factor are asked for it after Google or GitHub. `amr` has no `pwd` for these logins: `mfa`, or empty.
* **Setting up 2FA later (idp):** in the account console (**Account security → Signing in**). After setting up an authenticator app, Keycloak asks for recovery codes right away. After adding a passkey it doesn't: users who only use passkeys should set up recovery codes there too, or register a second passkey.
* **Forgot password (lab, idp):** **Forgot password?** on the login page, then a link by email (valid for 5 minutes), and a new password. Keycloak then shows **Your account has been updated**: the user goes back to the app (**Back to application**, if the app has a home page) and logs in with the new password and the second factor.
* **Lost second factor:** log in with a recovery code (**Try another way → Recovery Authentication Code**; each code works once). Then, in the account console, set up a new authenticator app or passkey, and new recovery codes. Without recovery codes: in lab, a lab admin removes the lost factor after checking who the user is (not by email alone: the inbox may be the problem); in idp, we can do that on a best-effort basis; in master, another admin, or the VM ([Recovering admin access](./keycloak-deploy.md#recovering-admin-access)). How: [A user lost their second factor](./keycloak-deploy.md#a-user-lost-their-second-factor).
* **Time:** each page of the login (e.g. setting up the authenticator app, or saving the recovery codes) may take 30 minutes. After that, Keycloak says **Your login attempt timed out** and the login starts again.

The flows behind these steps: `deploy/keycloak/realms/README.md`.

## The idp realm: open to everyone, best effort

**Goal:** make it easy for users of our software to set up their own server. Instead of running an identity provider themselves, they register their server as an app on the [app registration site](./app-registration.md), and get a client ID and secret right away. Their users log in with an account in the idp realm, and always see a consent screen before the server gets their data.

**Best effort.** We run this provider as a service to the community, without guarantees on availability or support. For a server with sensitive data, use your own institution's provider or a hosted OIDC provider instead (see the [Installation guide](./auth-install.md)).

**Tiers.** Because anyone can register, and register apps, the emails Keycloak sends (to verify addresses and reset passwords) are limited per app: one app, or someone abusing its login page, can't use up the email for everyone else. Every app starts in the default tier, so nobody has to ask permission first. When we trust an app's owners, we give it a higher tier, for instance:

* for use in teaching, where a whole class signs up at once;
* for a larger pilot;
* to bridge the time needed to move to another OIDC provider when its user base suddenly grows.

Logins are never limited, only the emails. How the limits work: [Email limits](./keycloak-deploy.md#email-limits).

## More realms

New realms are cheap, and isolated from each other:

* **Isolated realms for our own servers,** e.g. one per AmCAT or AnnoTinder server we host, so that their users don't share accounts with other servers.
* **A realm for a lab member** (or their team), with its own admin, who manages it in the admin console of that realm only.

Every new realm can send email through our email relay (host `mail-relay`, port 587, no login, our sender address). That is safe to share: the relay holds the credentials of the email provider, so a realm admin never sees them and can't send them elsewhere, and the relay caps the email of the whole installation.

## Security in short

* **Two TLS connections ("double certificate"):** browsers connect to Caddy with a public certificate (Let's Encrypt), and Caddy connects to Keycloak with an internal certificate that only Caddy trusts. Traffic is encrypted all the way, and Caddy decides which paths are public.
* **Only the login paths are public.** The admin consoles, the admin API and the master realm are only on a separate admin hostname.
* **Admin access from the university network only:** the admin hostname (the admin consoles, the admin API and the master realm) is restricted to VU IP ranges (campus and VPN), for all realms. Nobody outside needs it: owners of apps in idp manage them on the [app registration site](./app-registration.md), not in the admin console. A realm for a team outside the university can get an exception for its own admin console.
* **The email relay:** Keycloak sends all email through it without a password, the relay only accepts our sender address, and it caps the email for the whole installation. Together with the limits per IP address and per app, this protects the monthly quota of our email provider.
* **Registered apps can't weaken the login:** the app registration site manages apps with a service account that can only manage the clients of the idp realm (the role `manage-clients`), not users or realm settings. A Keycloak policy enforces consent, PKCE and safe redirect URIs for every change it makes. Each app's owner is recorded on the app itself (`registration.owner`).
* **Secrets stay put:** the email provider's password is only in the relay, and the Google and GitHub secrets are stored masked in Keycloak, which refuses to send them to another address without entering them again.
* **Brute force detection, a password policy, and login and admin events** in all realms, and daily database backups ([Backups](./keycloak-deploy.md#9-backups)).

Details and reasoning: [Why it is set up this way](./keycloak-deploy.md#why-it-is-set-up-this-way) in the runbook.
