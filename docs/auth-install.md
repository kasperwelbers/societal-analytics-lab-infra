# Installation guide: authentication

This guide is for teams that host AmCAT or AnnoTinder themselves. It covers choosing an OIDC provider, from a first pilot to a production server. For what our software does with the provider, see the [Authentication standard](./auth.md).

In short:

1. **Pilot.** Request access to the lab's pilot OIDC provider and try our software. No sensitive data.
2. **Production.** Together with your institution's IT department, choose an OIDC provider that meets our [requirements](./auth.md#oidc-provider-requirements), and [migrate](./auth-migration.md) your pilot users to it.

## Pilot: the lab pilot provider

To make it easy to start, the Societal Analytics Lab hosts a pilot OIDC provider (Authentik) with 2FA. You don't need to set up or configure an OIDC provider yourself.

**How to get access**

==TODO: request procedure and pilot provider URL.==

* Request access for your server. We register your server as a client and send you the `OIDC_HOST`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` values.
* Your users create an account at the pilot provider and set up a second factor (passkey or authenticator app).

**Pilot terms**

* **No sensitive or personal research data.** A pilot server is for trying out our software.
* **No availability guarantee.** If the pilot provider is down, nobody can log in to your server.
* **Limited account recovery.** Users get recovery codes when they set up 2FA. If they lose both their second factor and their recovery codes, they create a new account and are invited again by a project admin.
* **Pilots are temporary.** The web client shows server admins a **PILOT** label and a [hardening warning](./auth.md#server-hardening-warnings) until the server uses its own provider.

!!! warning "Is your pilot becoming a production server?"
    If you start using real research data, or more people depend on the server, it is time to move to a production provider. Don't wait until the pilot provider becomes a bottleneck.

## Production: choosing an OIDC provider

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

Not suitable for production:

* **Auth0 free plan.** No step-up MFA factors.
* **Google consumer accounts (`@gmail.com`).** No institutional agreements, and `amr` is not always present.

The 2FA signal column was checked in November 2026; details and sources are in [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals). Provider behaviour changes, so test the setup before going live.

## Production checklist

* [ ] The provider is approved by your institution for the data on your server.
* [ ] The provider returns `email_verified: true` for your users.
* [ ] 2FA is required (or can be requested) for your users, and `OIDC_MFA_CLAIM` matches the provider's signal.
* [ ] Step-up works: performing a sensitive action (e.g. creating an API key) after more than `AUTH_STEP_UP_MAX_AGE` seconds asks for 2FA again.
* [ ] It is clear who handles account recovery for your users (usually the provider's helpdesk).
* [ ] The server admin page shows no [hardening warnings](./auth.md#server-hardening-warnings).
* [ ] If you are moving from a pilot or another provider: follow the [Migration guide](./auth-migration.md).
