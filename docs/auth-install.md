# Installation guide: authentication

This guide is for teams that host AmCAT or AnnoTinder themselves. It covers choosing an OIDC provider for the two [tiers](./auth.md#tiers). For what our software does with the provider, see the [Authentication standard](./auth.md).

In short:

1. **Basic.** For trying out our software, teaching, and other uses without sensitive data. If you don't have a suitable OIDC provider, create an organization at the lab's Basic provider.
2. **Institutional.** For research data. Together with your institution's IT department, choose an OIDC provider that meets our [requirements](./auth.md#oidc-provider-requirements). If you started in the Basic tier, [migrate](./auth-migration.md) your users.

## Basic: the lab's Basic provider

To make it easy to start, the Societal Analytics Lab offers a Basic OIDC provider ([ZITADEL](https://zitadel.com)) with 2FA. You create your own organization there, and manage its users yourself. Other organizations at the Basic provider can't see or manage your users.

==TODO: URL of the lab's Basic provider (self-hosted or ZITADEL Cloud, to be decided).==

**Setting up your organization**

1. Register your organization at the Basic provider's sign-up page (`<basic-provider-url>/ui/login/register/org`). The account you register with becomes the organization owner.
2. In your organization's login settings, require a second factor for all users (passkey or authenticator app).
3. Create a project with a web application for your server, using the authorization code flow, with the redirect URI of your server. ==TODO: redirect URI per app (AmCAT, AnnoTinder).==
4. Configure your server with `OIDC_HOST`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` from the application, `OIDC_MFA_CLAIM=amr:mfa` ==TODO: verify the exact `amr` value ZITADEL sends==, and `AUTH_TIER=basic`. See [Configuration](./auth.md#configuration).
5. Invite your users. They create an account in your organization and set up their second factor.

**Basic terms**

* **No sensitive research data.** Names and email addresses of users (e.g. students) are personal data too, so you are responsible for handling those according to your institution's rules.
* **Best-effort availability.** If the Basic provider is down, nobody can log in to your server. Keep this in mind for teaching and exams.
* **You handle account recovery.** Your organization's owner can reset users' second factors. The lab does not provide a helpdesk.
* **The lab operates the provider.** As the operator, the lab could in principle access every organization. This is one of the reasons the Basic tier is not for sensitive data.

!!! warning "Is your Basic server getting used for research data?"
    If you start using sensitive research data, move to an Institutional provider first (see the [Migration guide](./auth-migration.md)). The web client shows server admins a **BASIC: not for sensitive data** label as a reminder.

## Institutional: choosing an OIDC provider

The safest choice is an OIDC provider that is managed by a security team and has a helpdesk for account recovery. For most universities that means the institution's own identity provider. Talk to your IT department: they decide which providers may be used for research data, and they may already have one available.

The provider must meet three [requirements](./auth.md#oidc-provider-requirements): it verifies email addresses, supports 2FA and signals it to our server, and supports step-up (`max_age` and `auth_time`).

| OIDC Provider | 2FA | 2FA signal (`OIDC_MFA_CLAIM`) | GDPR Compliant | Cost | Ease of Setup | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **SURFconext** (Dutch institutions) | Via SURFsecureID (procured by the institution) | `acr:<SURFsecureID LoA>` | **Yes** | Institutional | Medium | Standard for Dutch institutions. 2FA is signalled via `acr`, not `amr`. |
| **Microsoft Entra ID** | Yes | `amr:mfa` (add `amr` as optional claim) | **Yes** | Paid (Institutional) | Hard (Admin setup) | Proper enterprise/institutional contracts and DPAs. |
| **Google Workspace** | Yes | `amr:mfa` | **Yes** | Paid (Institutional) | Hard (Admin setup) | Google only includes `amr` when the information is available. Test before relying on it. |
| **Auth0 paid plans** | Yes (TOTP from Essentials, WebAuthn from Professional) | `amr:mfa` | **Yes** | Paid | Easy | Includes enterprise agreements, SLAs, and DPA. |
| **Self-hosted Authentik** | Yes | `amr:mfa` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | MFA must be required in the authentication flow (Authentik can't be asked for MFA on demand). |
| **Self-hosted Keycloak** | Yes | `acr:<value>` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | Map the acr value to a level of authentication that requires 2FA. |
| **ZITADEL** (self-hosted or Cloud) | Yes | `amr:mfa` (verify) | **Yes** (EU hosting or region) | Free (self-hosted) / paid plans (Cloud) | Medium | Supports isolated organizations with their own admins. The lab uses it for its Basic provider; for the Institutional tier it must be managed by your institution. |

Not suitable for the Institutional tier:

* **Auth0 free plan.** No step-up MFA factors.
* **Google consumer accounts (`@gmail.com`).** No institutional agreements, and `amr` is not always present.

The 2FA signal column was checked in November 2026; details and sources are in [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals). Provider behaviour changes, so test the setup before going live.

## Institutional checklist

* [ ] The provider is approved by your institution for the data on your server.
* [ ] The provider returns `email_verified: true` for your users.
* [ ] 2FA is required (or can be requested) for your users, and `OIDC_MFA_CLAIM` matches the provider's signal.
* [ ] Step-up works: performing a sensitive action (e.g. creating an API key) after more than `AUTH_STEP_UP_MAX_AGE` seconds asks for 2FA again.
* [ ] It is clear who handles account recovery for your users (usually the provider's helpdesk).
* [ ] The server admin page shows no [hardening warnings](./auth.md#server-hardening-warnings).
* [ ] `AUTH_TIER=institutional` is set.
* [ ] If you are moving from the Basic tier or another provider: follow the [Migration guide](./auth-migration.md).
