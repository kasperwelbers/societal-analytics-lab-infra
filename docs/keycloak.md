# Keycloak setup

A helicopter view of the lab's Keycloak installation: what it is for, how it is organized, and how it is secured. It documents our setup for our own audit and for our IT department, and is an example for research teams that decide to run their own. The details are on other pages: [Keycloak deployment](./keycloak-deploy.md) (the runbook), the [Authentication standard](./auth.md) that our software follows, and [Decisions](./decisions.md) (why it is set up this way).

## Three realms

A realm in Keycloak is a separate login: its own users, apps, settings and admins. Users of one realm don't exist in another.

| Realm | For | Login | Who can join |
| --- | --- | --- | --- |
| **master** | Administering Keycloak itself | Password + mandatory 2FA | Only the administrators |
| **lab** | The lab's own infrastructure | Password + mandatory 2FA | Added by us, with an institutional email address |
| **idp** | The lab's own servers (AmCAT, AnnoTinder, and more) | Password, Google or GitHub; 2FA optional | Anyone (an account gives no access by itself) |

* **master** has no email and no external logins, so admin access never depends on an inbox or someone's Google account. Lost access is recovered via the server.
* **lab** uses institutional email addresses, so there is no Google or GitHub login. (Institutional login, e.g. via SURF, may come later; see [Lab authentication](./lab-auth.md).)
* **idp** is the one login for all of the lab's own servers ([below](#the-idp-realm-one-login-for-the-labs-servers)).

**How users log in** (password, passkey, Google or GitHub, the second factor, and what to do after losing a password or phone): see [How users log in](#how-users-log-in) below.

All realms show the lab logo and name on their login pages, with a subtitle ("Administration", "Lab account", "Identity provider"), so users know whose login this is; apps in `idp` are named on the consent screen. The look and the texts are our Keycloak themes ([Themes](./keycloak-deploy.md#themes)).

The realms are set up from realm files in the repository (`deploy/keycloak/realms/`), which Keycloak imports itself when it starts, for realms that don't exist yet. They document the configuration, including the login flows, and make it easy to set up the realms again (see [Realms](./keycloak-deploy.md#7-realms) in the runbook).

## How users log in

| | master | lab | idp |
| --- | --- | --- | --- |
| **Sign in with** | Password, or only a passkey | Password, or only a passkey | Password, only a passkey, Google or GitHub |
| **Second factor (2FA)** | Mandatory | Mandatory | Optional |
| **First time, or forgot password** | Not possible (no email): another admin, or the VM | Email link, the second factor (if any), a new password, and in | Same as lab |
| **Lost second factor** | Recovery code, another admin, or the VM | Recovery code, or a lab admin | Recovery code, or one of our admins |

In all realms, the email address is the username. A second factor is an authenticator app (one-time codes, OTP), a passkey or security key, or a recovery code. Tokens contain `amr`: `pwd` for a password, `mfa` for a second factor. Servers that run our software check `mfa` for sensitive actions (see [Two-factor authentication](./auth.md#two-factor-authentication-2fa)).

**Why:**

* **Mandatory 2FA in master and lab,** because these accounts give access to our infrastructure. **Optional in idp,** to keep the barrier low for students and collaborators: our servers require `mfa` for sensitive actions (step-up).
* **A passkey alone counts as two factors:** the device, plus a fingerprint, face or PIN to unlock it. Passkeys can't be phished: they only work on our own domain.
* **Email never replaces the second factor.** After the email link, users with a second factor must enter it before they can choose a new password, so someone who gets into their inbox can't get in. (Keycloak's default reset logs the user in after the new password without the second factor, and lets them set up a new authenticator app, so an inbox would be enough to take over an account. We changed that.)
* **master has no email and no external logins,** so admin access never depends on an inbox or someone's Google account.

### Step by step

* **First time (lab):** lab members are added by us, without a password (see [Adding lab members](./keycloak-deploy.md#adding-lab-members)). The login page says **Sign in with your lab account**. They click **First time, or forgot your password?**, enter their email address, and click the link in the email (**Set your lab password**, valid for 30 minutes). Then, in one go: choose a password, fill in their name, set up an authenticator app, save the recovery codes, and they are logged in. Others get no email (the page says the same to everyone).
* **Password:** email address and password, then the second factor if the user has one (**Try another way** offers the user's other second factors, e.g. a recovery code). In master and lab, users without a second factor set up an authenticator app at their first login, and get recovery codes right after: shown once, to save somewhere safe. (The token of that first login has `amr` `pwd` only, because setting up an app doesn't count as using it. A server that requires `mfa` asks for a code once more.)
* **Passkey:** **Sign in with Passkey** on the login page (or the browser's suggestion in the email field), then the fingerprint, face or PIN. No password and no other factor. Users register a passkey in the account console (**Account security → Signing in**), which offers it twice. A passkey under **Passwordless** is for signing in with only the passkey. A passkey under **Two-factor authentication** is a second factor after the password. Both work.
* **Google or GitHub (idp only):** the first time, an account is created with the address from Google or GitHub (Keycloak verifies a GitHub address itself). If an account with that address already exists, Keycloak shows **Account already exists**: the user links the two by clicking a link sent to the address, or by entering the account's password (and its second factor; after linking it is asked once more, only this first time). After that, users with a second factor are asked for it after Google or GitHub. `amr` has no `pwd` for these logins: `mfa`, or empty.
* **Setting up 2FA later (idp):** in the account console (**Account security → Signing in**). After setting up an authenticator app, Keycloak asks for recovery codes right away. After adding a passkey it doesn't: users who only use passkeys should set up recovery codes there too, or register a second passkey.
* **Forgot password (lab, idp):** the same link on the login page, then a link by email (valid for 30 minutes). Users with a second factor enter it first (or a recovery code), then choose a new password, and they are logged in.
* **Remember me (lab):** users who tick it stay logged in on that device for up to 30 days (7 days without using it). Without it, the session at Keycloak ends after 30 minutes without use. Sensitive actions in our software still ask for the second factor again (step-up).
* **Lost second factor:** log in with a recovery code (**Try another way → Recovery Authentication Code**; each code works once). Then, in the account console, set up a new authenticator app or passkey, and new recovery codes. Without recovery codes: in lab, a lab admin removes the lost factor after checking who the user is (not by email alone: the inbox may be the problem); in idp, one of our admins does the same; in master, another admin, or the VM ([Recovering admin access](./keycloak-deploy.md#recovering-admin-access)). How: [A user lost their second factor](./keycloak-deploy.md#a-user-lost-their-second-factor).
* **Time:** each page of the login (e.g. setting up the authenticator app, or saving the recovery codes) may take 30 minutes. After that, Keycloak says **Your login attempt timed out** and the login starts again.

The flows behind these steps: `deploy/keycloak/realms/README.md`.

## The idp realm: one login for the lab's servers

`idp` is the central login of the lab's own servers: our AmCAT and AnnoTinder servers, and other tools later. Users have one account for all of them.

* **Anyone can create an account,** with an email address, or with Google or GitHub. An account gives no access by itself: each server decides what a user may do, with roles given to an email address or a user (see [Authorization](./auth.md#authorization)). So students and collaborators sign up themselves when a project gives them access, instead of waiting for us.
* **Only our admins add servers** (clients), in the admin console ([step 8 of the runbook](./keycloak-deploy.md#8-clients-for-our-deployments)). A client policy turns on consent and PKCE, and refuses unsafe redirect URIs, so a client can't be created with a mistake. Users always see a consent screen with the server's name before it gets their name and email address.
* **Not a service for others.** Teams that host our software themselves use their own provider, ideally their institution's (see the [Installation guide](./auth-install.md)). This documentation describes how we set up ours, for our IT department and as an example for teams that choose to run their own.

## More realms

New realms are cheap, and isolated from each other:

* **Isolated realms for our own servers,** e.g. one per AmCAT or AnnoTinder server we host, so that their users don't share accounts with other servers.
* **A realm for a lab member** (or their team), with its own admin, who manages it in the admin console of that realm only.

Every new realm can send email through our email relay (host `mail-relay`, port 587, no login, our sender address). The relay holds the credentials of the email provider: a realm admin can send email through it, but can't read the password or send it to another server, and the relay caps the email of the whole installation.

## Security in short

* **Two TLS connections ("double certificate"):** browsers connect to Caddy with a public certificate (Let's Encrypt), and Caddy connects to Keycloak with an internal certificate that only Caddy trusts. Traffic is encrypted all the way, and Caddy decides which paths are public.
* **Only the login paths are public.** The admin consoles, the admin API and the master realm are only on a separate admin hostname.
* **Admin access from the university network only:** the admin hostname (the admin consoles, the admin API and the master realm) is restricted to VU IP ranges (campus and VPN), for all realms. A realm for a team outside the university can get an exception for its own admin console.
* **The email relay:** Keycloak sends all email through it without a password, the relay only accepts our sender address, and it caps the email for the whole installation. Together with the limit per IP address, this protects the monthly quota of our email provider.
* **Clients with safe defaults:** in `idp`, a client policy turns on consent and PKCE for every client our admins create, and refuses unsafe redirect URIs. It prevents mistakes; it doesn't stop an admin who wants otherwise.
* **Secrets an admin can use but not take:** the email provider's password is only in the relay, and the Google and GitHub secrets are stored masked in Keycloak, which refuses to send them to another address without entering them again. This is an extra layer, not a wall: admins can send email and use these logins, and a real admin can always replace the secrets, but not read them out.
* **Brute force detection, a password policy, and login and admin events** in all realms, and daily database backups ([Backups](./keycloak-deploy.md#9-backups)).

Why it is set up this way: [Decisions](./decisions.md).
