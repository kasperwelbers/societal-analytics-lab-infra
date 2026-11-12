# Authentication standard

All software developed by the Societal Analytics Lab (AmCAT, AnnoTinder) uses the same approach to authentication. This page is the standard: what our software does, and what it requires from the OIDC provider. For deployers, see also:

* [Installation guide](./auth-install.md): choosing and setting up an OIDC provider.
* [Migration guide](./auth-migration.md): moving to a different OIDC provider.
* [Two-factor authentication: where should it live?](./auth-2fa.md): why 2FA is handled by the OIDC provider, and what we could add later.

## OpenID Connect (OIDC)

OIDC is an open standard for authentication that builds on top of the OAuth 2.0 protocol. It allows clients to verify the identity of users based on the authentication performed by an external identity provider (IdP).
By using OIDC, our software does not handle user authentication directly, but delegates it to an external OIDC provider. 
This is an industry standard, because it outsources the hard part of authentication to a dedicated provider, which is often better equipped to handle it than the application itself.

Our software works with any OIDC provider that meets the [provider requirements](#oidc-provider-requirements). The person hosting our software chooses the provider, and is responsible for making sure it is suitable. The safest choice is a provider that is managed by a security team and has a helpdesk for account recovery. Talk to your institution's IT support circle.

## Choosing an OIDC provider

There are two options. Both require 2FA; they differ in who manages the provider, who handles account recovery, and which data is allowed. See the [Installation guide](./auth-install.md) for details.

| | Option 1: our shared OIDC provider | Option 2: your own OIDC provider |
| --- | --- | --- |
| **For** | Servers without sensitive data, such as teaching and pilots | Any server, required for sensitive research data |
| **Provider** | ZITADEL, run by the lab. Teams create their own organization and manage their own users. | Ideally your institution's identity provider (see the [Installation guide](./auth-install.md#option-2-your-own-oidc-provider)) |
| **Maintained by** | The lab, with best effort | A security team (recommended) |
| **Account recovery** | The admin of your own organization at our provider | The provider's helpdesk (recommended) |
| **Cost** | Free | Depends on the provider |

**Why our shared provider is not for sensitive data**

* **No security team.** Nobody ensures the provider is always up to date. If it is compromised, your data is at risk.
* **The lab could access your data.** As the operator, the lab could in principle log in as any of its users. This will not fly with your institution's security team and data stewards.
* **No helpdesk.** If a user loses their second factor, your own organization admin has to help them.

Names and email addresses of users (e.g. students) are personal data too, so any server must be used according to your institution's rules. Moving from our shared provider to your own is a [migration](./auth-migration.md).

The server recognizes our shared provider by its issuer (`OIDC_HOST`). When it is used, the web client shows server admins a **Shared OIDC provider: not for sensitive data** label. This can't be turned off. For other providers, the person hosting the server is responsible for choosing a provider that fits the data.

There is no option without 2FA. For development on a local machine there is a separate [development mode](#development-mode).

## OIDC provider requirements

All three requirements are strict: they can't be disabled.

| Requirement | What the provider must do |
| --- | --- |
| **Email verification** | Return `"email_verified": true` in the ID token. Our software uses email addresses to assign roles (see [Authorization](#authorization)). |
| **2FA with a usable signal** | Support 2FA, and signal in the ID token that it was used. Providers do this differently (`amr` containing `mfa`, or a specific `acr` value), so the claim is configured with `OIDC_MFA_CLAIM`. See [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals). |
| **Step-up** | Honour the `max_age` parameter (re-authenticate if the last login is older than N seconds), and return `auth_time` in the ID token. |

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

## Two-factor authentication (2FA)

For sensitive actions (e.g. creating API keys, changing roles) our servers require a 2FA login that is at most `AUTH_STEP_UP_MAX_AGE` seconds old (step-up authentication).

1. The server checks `OIDC_MFA_CLAIM` and `auth_time` in the ID token.
2. If the claim is missing or too old, the server redirects the user to the OIDC provider with `max_age`.
3. The server checks the new ID token itself, because providers do not always enforce what was requested.

Account recovery (e.g. a lost phone) is the responsibility of the OIDC provider.

## API keys

Our software also supports direct API access via API keys. These are application-managed tokens that are decoupled from the OIDC provider.

* API keys can only be created and changed by the main web client, in a session that passed step-up authentication.
* API keys always have a limited scope.

## Server hardening warnings

The web client shows server admins a list of warnings for things that make the server less secure:

| Warning | Meaning |
| --- | --- |
| **Shared OIDC provider** | The server uses our shared OIDC provider, and must not hold sensitive data (see [Choosing an OIDC provider](#choosing-an-oidc-provider)). |
| **No 2FA signal** | Recent logins did not contain the configured `OIDC_MFA_CLAIM`, so sensitive actions are blocked. Check the provider's 2FA settings and `OIDC_MFA_CLAIM`. |
| **Migration not finished** | `OIDC_PREVIOUS_HOST` is still configured after `OIDC_PREVIOUS_UNTIL`. |

## Development mode

`AUTH_DEV_MODE` lets developers run our software on their own machine without an OIDC provider, logged in as a local admin. The server refuses to start in development mode unless it only listens on localhost. Development mode is never used for servers that other people use.

## For developers

All software developed by the Societal Analytics Lab follows these rules, to ensure consistency and security across our software stack.

| Rule | Details |
| --- | --- |
| Same origin | The server and web client are always hosted on the same domain. |
| Server-side OIDC flow | The server initiates and completes the OIDC flow with the trusted provider (`OIDC_HOST`), and sets a signed, http-only session cookie. |
| One session per application | When AmCAT and AnnoTinder are hosted together, each is a separate OIDC client with its own session. The second login completes without user interaction, because the user is already signed in at the provider. Logging out is per application. |
| Authorization on the server | The server decides what users may do, not the OIDC provider (see [Authorization](#authorization)). |
| API keys for other clients | Other clients (e.g. R or Python) can only access the backend via [API keys](#api-keys). |
| Email verification | The server checks the `email_verified` claim. This cannot be disabled. |
| 2FA and step-up | The server checks `OIDC_MFA_CLAIM` and `auth_time` for sensitive actions, and performs step-up authentication if needed (see [Two-factor authentication](#two-factor-authentication-2fa)). This cannot be disabled outside development mode. |

## Authorization

Authorization is based on roles. A role can be given to a specific user (IBAC), to users with a certain attribute (ABAC), or both.

### Role table

| Column | Description |
| --- | --- |
| `role` | What role a user has (e.g. READ, WRITE, ADMIN). |
| `context` | The context in which the role applies (e.g. project, server). |
| `user_id` | If not null, the role is linked to a specific user (see [IBAC](#identity-based-access-control-ibac)). |
| `email_domain` | If not null, the user's verified email must have this domain (see [ABAC](#attribute-based-access-control-abac)). Can be combined with `user_id` to require both. |
| `require_email` | If `user_id` and `email_domain` are null: whether any user gets the role (false), or only users with a verified email address (true). |
| `granted_at` | When the role was granted (created, updated, or restored). |

### Identity Based Access Control (IBAC)

IBAC is the primary mode of authorization: roles are given to registered users.

**The identity is `iss` + `sub`, not the email address.** An email address is not a unique identifier, because it can change over time: users can change email addresses, and old email addresses can be reassigned. We *do* use the email address as a human readable way to assign roles (e.g. giving a colleague access to a project in AmCAT). This is safe, because the role is not assigned to the email address itself, but to the user (`iss` + `sub`) that **currently** owns it. Changing email addresses is the responsibility of the OIDC provider: when the email for an identity has changed, the server updates the user table.

Any user that signs in is registered, optionally with a form that collects additional information. We use this for security logs and rate limiting, which is legitimate under GDPR. Email addresses add some accountability, especially when roles require an email domain.

**User table**

| Column | Description |
| --- | --- |
| `id` | Unique user ID. |
| `email` | Email address of the user, from the most recent login. |
| `has_mfa` | Whether the most recent login contained the 2FA signal (`OIDC_MFA_CLAIM`). |
| `registered_at` | When the user first signed in. `NULL` for shadow users until the account is claimed (see [JIT account claiming](#jit-account-claiming)). |
| `last_login_at` | When the user last signed in. |
| `reactivated_at` | First login after 1 year of inactivity. |
| `...` | Optional user details (e.g. added on registration). |

**Identities table**

| Column | Description |
| --- | --- |
| `user_id` | The user this identity belongs to. |
| `iss` | Issuer of the OIDC provider. |
| `sub` | Unique subject identifier at the OIDC provider. |
| `linked_at` | When the identity was linked to the user. |
| `last_login_at` | When the user last signed in with this identity. |

Normally a user has one identity. A user can have more than one during a [migration](./auth-migration.md#account-linking) to a new OIDC provider.

### JIT account claiming

Just-In-Time (JIT) account claiming lets us give roles to an email address that is not yet registered. The role is given to a new **shadow user**, which only has an `id` and `email` (`registered_at` is `NULL`, and there is no identity yet). The current owner of the email address is invited to claim the account and role. This can be an actual invitation, or just happen automatically when they first sign in. Claiming adds an identity and sets `registered_at`.

### Safeguards against email reassignment

Two safeguards prevent giving a role to a previous or future owner of an email address. A role is **not** given to a user if one of these conditions is true:

**Dormant users.** A role is disabled when:

```sql
role.granted_at < user.reactivated_at AND NOT user.has_mfa
```

* **Why:** without 2FA, the OIDC provider only verifies *current* ownership of the email address. So after a year of inactivity, roles granted before reactivation are disabled. With 2FA required this should be rare, but it remains a safeguard for accounts claimed via email and providers that report 2FA inconsistently.
* **Restore:** per role (e.g. an AmCAT project ADMIN refreshes `granted_at`), or by a server admin.

**Expired invitations.** A role is not given when:

```sql
user.registered_at > role.granted_at + INTERVAL '3 months'
```

* **Why:** a role given to an unregistered email address must be claimed within 3 months, so that a future owner of the address can't claim it. Roles granted after registration are not affected, because then `granted_at` is later than `registered_at`.
* **Unclaimed invitations:** a shadow user that is still unclaimed (`registered_at IS NULL`) has an expired invitation when `now() > role.granted_at + INTERVAL '3 months'`.
* **Restore:** remove the invitation, or restore it by updating `granted_at`.

### Attribute Based Access Control (ABAC)

ABAC is the secondary mode of authorization: roles are given based on user attributes from OIDC claims. We currently only use the email domain, because this keeps the role of the OIDC provider restricted to authentication and email verification. In the future we could include other attributes (e.g. eduPerson claims from institutional providers).

IBAC and ABAC serve different purposes:

| | IBAC | ABAC |
| --- | --- | --- |
| **Based on** | Identities, tied to specific users | Attributes, properties of users that can change |
| **Use** | Users keep their roles when they change email addresses. Important for long-term projects where researchers change institutions. | Give and take away access based on a user's current situation, such as their affiliation with an institution. |

Email domains are useful for:

* **Convenience:** give access to anyone with an institutional email address, instead of giving everyone individual access. This should have limited privileges (never ADMIN).
* **Security:** restrict access to a trusted institution. Combined with IBAC, access is restricted to a trusted person who also has a verified email address at that institution.
