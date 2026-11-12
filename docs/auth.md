# Authentication standard

All software developed by the Societal Analytics Lab (AmCAT, AnnoTinder) uses the same approach to authentication. This page is the standard: what our software does, and what it requires from the OIDC provider. For deployers, see also:

* [Installation guide](./auth-install.md): choosing an OIDC provider, from pilot to production.
* [Migration guide](./auth-migration.md): moving to a different OIDC provider.
* [Two-factor authentication: decision record](./auth-2fa.md): why 2FA is handled by the OIDC provider, and what we plan next.

## OpenID Connect (OIDC)

OIDC is an open standard for authentication that builds on top of the OAuth 2.0 protocol. It allows clients to verify the identity of users based on the authentication performed by an external identity provider (IdP).
By using OIDC, our software does not handle user authentication directly, but delegates it to an external OIDC provider. 
This is an industry standard, because it outsources the hard part of authentication to a dedicated provider, which is often better equipped to handle it than the application itself.

Our software works with any OIDC provider that meets the [provider requirements](#oidc-provider-requirements). The person hosting our software chooses the provider, and is responsible for making sure it is suitable. The safest choice is a provider that is managed by a security team and has a helpdesk for account recovery. Talk to your institution's IT support circle.

## Deployment stages

We distinguish two stages: pilot and production. The pilot stage is just an easy way to try out our software without first setting up an OIDC provider. The production stage is for real use, with a provider that meets the requirements. If you already have a suitable OIDC provider, you can skip the pilot stage.

* **Pilot.** You can use our lab's pilot OIDC provider, which is hosted by the Societal Analytics Lab and supports 2FA. Teams can request access (see the [Installation guide](./auth-install.md#pilot-the-lab-pilot-provider)). We keep this running with best effort, but is not intended for production because:
  * We do not have a security team that ensures the provider is always up to date. If the provider is compromised, your data is at risk.
  * Using our OIDC provider means we have full access to your data. This will not fly with your institution's security team and data stewards.
  * We do not have a helpdesk. If a user loses access to their account (e.g. set-up 2fa then lose the key), we are not always available to help. (==looking into whether we can let admins of pilot accounts handle account recovery. Could be possible if we use ZITADEL==)
* 
* A pilot server must not hold sensitive or personal research data. The web client shows a **PILOT** label to server admins.
* **Production.** The server uses an OIDC provider chosen by the hosting team, typically together with their institution's IT department. Moving from pilot to production is a [migration](./auth-migration.md).

There is no production or pilot mode without 2FA. For development on a local machine there is a separate [development mode](#development-mode).

## OIDC provider requirements

* **Email verification (strict).** Our software uses email addresses to assign roles (see [Authorization](#authorization)). The OIDC provider must assert email ownership by returning `"email_verified": true` in the ID token. This cannot be disabled.
* **2FA with a usable signal (strict).** The OIDC provider must support multi-factor authentication (MFA, 2FA) and tell our server when it was used, through a claim in the ID token. Providers do this in different ways (`amr` containing `mfa`, or a specific `acr` value), so the claim is configured per deployment with `OIDC_MFA_CLAIM`. See [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals).
* **Step-up (strict).** The OIDC provider must honour the `max_age` parameter (re-authenticate if the last login is older than N seconds) and return `auth_time` in the ID token.

## Configuration

==Proposed names; to be aligned with the AmCAT and AnnoTinder code.==

| Variable | Required | Description |
| --- | --- | --- |
| `OIDC_HOST` | yes | Issuer URL of the trusted OIDC provider. |
| `OIDC_CLIENT_ID` | yes | Client ID registered at the provider. |
| `OIDC_CLIENT_SECRET` | yes | Client secret registered at the provider. |
| `OIDC_MFA_CLAIM` | no | Which claim counts as 2FA: `amr:mfa` (default) or `acr:<value>`, e.g. `acr:http://test.surfconext.nl/assurance/loa2` for SURFconext. |
| `AUTH_STEP_UP_MAX_AGE` | no | Maximum age in seconds of the last 2FA login for sensitive actions. Default: 600. |
| `OIDC_PREVIOUS_HOST`, `OIDC_PREVIOUS_CLIENT_ID`, `OIDC_PREVIOUS_CLIENT_SECRET`, `OIDC_PREVIOUS_MFA_CLAIM` | no | The previous OIDC provider, only during a [migration](./auth-migration.md#account-linking). |
| `OIDC_PREVIOUS_UNTIL` | no | Date after which the previous provider is no longer accepted. |
| `AUTH_DEV_MODE` | no | Enables [development mode](#development-mode). Refused unless the server only listens on localhost. |

The server knows the issuer of the lab's pilot provider. If `OIDC_HOST` points to it, the server runs in the pilot stage.

## Two-factor authentication (2FA)

* For sensitive actions (e.g., creating API keys, changing roles) our servers require a 2FA login that is at most `AUTH_STEP_UP_MAX_AGE` seconds old (step-up authentication).
* The server checks the configured `OIDC_MFA_CLAIM` and `auth_time` in the ID token. If the claim is missing or too old, the server redirects the user to the OIDC provider with `max_age`, and checks the new ID token itself (providers do not always enforce what was requested).
* Account recovery (e.g., a lost phone) is the responsibility of the OIDC provider.

## API keys

Our software also supports direct API access via API keys. These are application-managed tokens that are decoupled from the OIDC provider.

* API keys can only be created and changed by the main web client, in a session that passed step-up authentication.
* API keys always have a limited scope.

## Server hardening warnings

The web client shows server admins a list of warnings for things that make the server less secure:

* **Pilot provider in use.** The server uses the lab's pilot provider (see [Deployment stages](#deployment-stages)).
* **No 2FA signal.** Recent logins did not contain the configured `OIDC_MFA_CLAIM`, so sensitive actions are blocked. Check the provider's 2FA settings and `OIDC_MFA_CLAIM`.
* **Migration not finished.** `OIDC_PREVIOUS_HOST` is still configured after `OIDC_PREVIOUS_UNTIL`.

## Development mode

`AUTH_DEV_MODE` lets developers run our software on their own machine without an OIDC provider, logged in as a local admin. The server refuses to start in development mode unless it only listens on localhost. Development mode is never used for pilot or production servers.

## For developers

All software developed by the Societal Analytics Lab needs to follow the following authentication standard. This is to ensure consistency and security across our software stack.

* The server and web client are always hosted on the same domain (same origin). 
* The trusted OIDC provider (`OIDC_HOST`) is used to authenticate the web client. The OIDC flow is initiated and completed by the server, which sets a signed, http-only session cookie.
* When AmCAT and AnnoTinder are hosted together, each is a separate OIDC client with its own session. Because the user is already signed in at the OIDC provider, the second login completes without user interaction. Logging out is per application.
* Authorization is handled by the server (not the OIDC provider).
* Other clients (e.g., R or Python clients) can only access the backend via API keys.
* The server checks the `email_verified` claim. This cannot be disabled.
* The server checks `OIDC_MFA_CLAIM` and `auth_time` for sensitive actions, and performs step-up authentication if needed (see [Two-factor authentication](#two-factor-authentication-2fa)). This cannot be disabled outside development mode.

## Authorization

* Authorization is handled based on a `role table`, that has the columns:
  * `role`: what role a user has (e.g. READ, WRITE, ADMIN)
  * `context`: the context in which the role applies (e.g. project, server)
  * `user_id`: if not null, the role is linked to a specific user. (see IBAC)
  * `email_domain`: if not null, the email in the OIDC claim must have this domain. Can be used together with user_id to require both identity and domain (see ABAC)
  * `require_email`: if user_id and email_domain are null, should any user get the role (false) or only users that have a verified email address (true). 
  * `granted_at`: timestamp of when the role was granted (created, updated, or restored) 
* Primary mode of authorization: **Identity Based Access Control (IBAC)**. 
  * Assign roles to registered users, stored in the `user table`:
    * `id`: unique user ID
    * `email`: email address of the user (from the most recent login)
    * `has_mfa`: whether the user's most recent login contained the 2FA signal (`OIDC_MFA_CLAIM`)
    * `registered_at`: timestamp of when the user first signed in. `NULL` for shadow users (see JIT account claiming) until the account is claimed.
    * `last_login_at`: timestamp of last login
    * `reactivated_at`: timestamp of first login after 1 year of inactivity
    * `...`: optional user details (e.g. added on registration)
  * A user's login identities are stored in the `identities table`:
    * `user_id`: the user this identity belongs to
    * `iss`: issuer of the OIDC provider
    * `sub`: unique subject identifier of the OIDC provider
    * `linked_at`: timestamp of when the identity was linked to the user
    * `last_login_at`: timestamp of the last login with this identity
  * Normally a user has one identity. A user can have more than one during a [migration](./auth-migration.md#account-linking) to a new OIDC provider.
  * Any user that signs in is registered, optionally with a form that collects additional information. We use this for security logs and rate limiting, which is legitimate under GDPR. Email addresses add some level of accountability, especially when roles enforce email domains. 
  * The identity is determined by the combination of `iss` and `sub`, NOT BY THE EMAIL ADDRESS. An email address is not a unique identifier, because it can change over time. Users can change email addresses, and their old email addresses can be reassigned. 
  * Changing email addresses is the responsibility of the OIDC provider. When the server authenticates a user and sees that the `email` for an identity (`iss + sub`) has changed, it updates the user table.
  * We DO use the email address as a human readable identifier for assigning roles to users (e.g. giving a colleague access to a project in AmCAT). This is safe, because the role is not assigned to the email address itself, but to the user (`iss + sub`) that **currently** owns the email address.
  * We support **Just-In-Time (JIT) account claiming**, which allows roles to be given to an email address that is not yet registered. The role is created for a new **shadow user** that only has an `id` and `email` (`registered_at` is `NULL`, and there is no identity yet), and the current owner of this email address is invited to claim this user account and role. This can be an actual invitation or just happen automatically on next sign in or registration. Claiming adds an identity and sets `registered_at`.
  * Two safeguards are needed to prevent giving a role to a previous or future owner of an email address. A role is NOT given to an account if one of the following conditions is true:
    * **Dormant users**: `role.granted_at < user.reactivated_at AND NOT user.has_mfa`. If a user did not use 2FA, the OIDC provider only verifies current ownership of the email address. So after a period of inactivity we disable roles assigned before reactivation. Since our provider requirements include 2FA this should be rare, but it remains a safeguard for accounts claimed via email (JIT) and providers that report 2FA inconsistently. Access can be restored per role (e.g. AmCAT project ADMIN refreshes `granted_at`) or by a server admin.
    * **Shadow account role expired**: `user.registered_at > role.granted_at + INTERVAL '3 months'`. When an unregistered email is given a role, it needs to be claimed within 3 months, to prevent unclaimed roles being claimed by future owners of the email address. Roles granted after registration are not affected, because then `granted_at` is later than `registered_at`. A shadow user that is still unclaimed (`registered_at IS NULL`) with `now() > role.granted_at + INTERVAL '3 months'` has an expired invitation. Expired invitations can either be removed, or be restored by updating the `granted_at` timestamp. 
* Secondary mode of authorization: **Attribute Based Access Control (ABAC)**. 
  * We also allow assigning roles based on user attributes from OIDC claims. We currently only use the email claim, because this keeps the role of the OIDC provider restricted to authentication and email verification. As mentioned in IBAC, emails are not identities, but attributes. These are not just alternatives for authorization, but serve different purposes.
    * Identities (IBAC) are tied to specific users. This lets them keep their roles when they change email addresses, which is important for long-term projects and collaborations where researchers may change institutions.
    * Attributes (ABAC) are properties of users that can change. This allows us to give and take away access based on their current situation, such as their affiliation to an institution. This check can also be added on top of IBAC, to require both identity and attribute for a role.
  * We could decide to include custom attributes in the future (e.g. if a server uses an OIDC provider that provides eduPerson claims).
  * Email domains can be a useful attribute for convenience and security. 
    * Convenience: it's convenient to give access to anyone that has an institutional email address, rather than giving them all individual access. Note that this should have limited privileges (never ADMIN access).
    * Security: setting an email domain requirement can be used to restrict access to a specific, trusted institution. This can also be done in addition to IBAC, so that access is restricted to a trusted person that also has a verified email address with a specific domain.
