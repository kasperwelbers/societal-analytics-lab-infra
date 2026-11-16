# Keycloak setup

A helicopter view of our Keycloak installation: what it is for, how it is organized, and how it is secured. The details are on other pages: [Keycloak deployment](./keycloak-deploy.md) (the runbook), [App registration](./app-registration.md), and the [Authentication standard](./auth.md) that our software follows.

## Three realms

A realm in Keycloak is a separate login: its own users, apps, settings and admins. Users of one realm don't exist in another.

| Realm | For | Login | Who can join |
| --- | --- | --- | --- |
| **master** | Administering Keycloak itself | Password + mandatory 2FA | Only the administrators |
| **lab** | The lab's own infrastructure | Password + mandatory 2FA | By invitation, with an institutional email address |
| **idp** | Logins for servers that run our software, hosted by others | Password, Google or GitHub; 2FA optional | Anyone |

* **master** has no email and no external logins, so admin access never depends on an inbox or someone's Google account. Lost access is recovered via the server.
* **lab** uses institutional email addresses, so there is no Google or GitHub login. (Institutional login, e.g. via SURF, may come later; see [Lab authentication](./lab-auth.md).)
* **idp** is the shared login provider that teams can use for their own AmCAT or AnnoTinder server (option 1 in the [Installation guide](./auth-install.md)).

**How users log in.** In all realms, the email address is the username, and it is verified before it can be used; users can change it, and the new address must be confirmed too. A second factor is an authenticator app (OTP), a passkey or security key, or recovery codes. It is mandatory in master and lab, because these accounts give access to our infrastructure. In idp it is optional, to keep the barrier low: the token tells each server whether a second factor was used (`amr`), so a server decides itself when to require it, e.g. for sensitive actions (see [Two-factor authentication](./auth.md#two-factor-authentication-2fa) in the standard).

The realms are set up from realm files in the repository (`deploy/keycloak/realms/`), which Keycloak imports itself on its first start. They document the configuration, including the login flows, and make it easy to set up the realms again (see [Realms](./keycloak-deploy.md#7-realms) in the runbook).

## The idp realm: open to everyone, best effort

**Goal:** make it easy for users of our software to set up their own server. Instead of running an identity provider themselves, they register their server as an app on the [app registration site](./app-registration.md), and get a client ID and secret right away. Their users log in with an account in the idp realm, and always see a consent screen before the server gets their data.

**Best effort.** We run this provider as a service to the community, without guarantees on availability or support. For a server with sensitive data, use your own institution's provider or a hosted OIDC provider instead (see the [Installation guide](./auth-install.md)).

**Tiers.** Because anyone can register, and register apps, the emails Keycloak sends (to verify addresses and reset passwords) are limited per app: one app, or someone abusing its login page, can't use up the email for everyone else. Every app starts in the default tier, so nobody has to ask permission first. When we trust an app's owners, we give it a higher tier, for instance:

* for use in teaching, where a whole class signs up at once;
* for a larger pilot;
* to bridge the time needed to move to another OIDC provider when its user base suddenly grows.

Logins are never limited, only the emails. How the limits work: [Email limits](./keycloak-deploy.md#10-maintenance).

## More realms

New realms are cheap, and isolated from each other:

* **Isolated realms for our own servers,** e.g. one per AmCAT or AnnoTinder server we host, so that their users don't share accounts with other servers.
* **A realm for a lab member** (or their team), with its own admin, who manages it in the admin console of that realm only.

Every realm can send email through our email relay out of the box. That is safe to share: the relay holds the credentials of the email provider, so a realm admin never sees them and can't send them elsewhere, and the relay caps the email of the whole installation.

## Security in short

* **Two TLS connections ("double certificate"):** browsers connect to Caddy with a public certificate (Let's Encrypt), and Caddy connects to Keycloak with an internal certificate that only Caddy trusts. Traffic is encrypted all the way, and Caddy decides which paths are public.
* **Only the login paths are public.** The admin consoles, the admin API and the master realm are only on a separate admin hostname.
* **Admin access from the university network only:** the admin hostname is restricted to VU IP ranges (campus and VPN) for master and lab. The admin console of idp is reachable from elsewhere: users there only have the default user role, so they can't change anything, and the realm's own admins still need their login and 2FA.
* **The email relay:** Keycloak sends all email through it without a password, the relay only accepts our sender address, and it caps the email for the whole installation. Together with the limits per IP address and per app, this protects the monthly quota of our email provider.
* **Registered apps can't weaken the login:** a Keycloak policy enforces consent, PKCE and safe redirect URIs for every app registered through the site.
* **Secrets stay put:** the email provider's password is only in the relay, and the Google and GitHub secrets are stored masked in Keycloak, which refuses to send them to another address without entering them again.
* **Brute force detection, a password policy, and login and admin events** in all realms, and daily database backups ([Backups](./keycloak-deploy.md#9-backups)).

Details and reasoning: [Why it is set up this way](./keycloak-deploy.md#why-it-is-set-up-this-way) in the runbook.
