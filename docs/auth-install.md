# Authentication provider

Our software doesn't handle passwords or second factors itself: it delegates logins to an OIDC provider (see the [Authentication standard](./auth.md)). This page is for teams that host AmCAT or AnnoTinder themselves, and need to choose that provider.

**What the lab uses:** its own Keycloak, for the lab's own servers ([Keycloak VM](./servers/keycloak.md)). It is not a service for other teams' servers, but its setup and realm files ([deploy-keycloak](https://github.com/vu-societal-analytics/deploy-keycloak)) can serve as an example if you decide to run your own Keycloak.

**What the provider must do** ([requirements](./auth.md#oidc-provider-requirements)): verify email addresses, support 2FA and signal it to the server, and support step-up (`max_age` and `auth_time`). Which provider fits depends on your institution and on the data on your server:

1. **Your institution's identity provider,** or another provider that meets the requirements. Required for sensitive research data.
2. **For teaching and other servers without sensitive data:** a provider that doesn't meet all requirements, with [weaker security settings](#teaching-and-low-sensitivity-servers).

Your team is responsible for the personal data on your server, and needs its own privacy statement; the lab's [privacy statement](./policies/privacy.md) can serve as an example. Moving to another provider later is a [migration](./auth-migration.md).

## Options

The safest choice is a provider that is managed by a security team and has a helpdesk for account recovery: for most universities, the institution's own identity provider. Talk to your IT department: they decide which providers may be used for research data, and may already have one available.

| Provider | 2FA signal (`OIDC_MFA_CLAIM`) | Notes |
| --- | --- | --- |
| **Your institution's identity provider** | Depends on the provider | Recommended for research data. Ask your IT department. |
| **SURFconext** (Dutch institutions) | `acr:<SURFsecureID LoA>` | 2FA via SURFsecureID, which institutions procure separately. Arranged by your institution. |
| **SURF SRAM** (Dutch institutions) | ==TODO: verify== | For research collaborations, including members from other institutions (eduGAIN) and guests (eduID). Every user logs in with 2FA. |
| **Microsoft Entra ID**, **Google Workspace** | `amr:mfa` | Institutional accounts. Entra ID needs `amr` as an optional claim; Google only includes `amr` when the information is available, so test it. |
| **ZITADEL Cloud** | `amr:mfa` (verify) | Free plan for small teams (100 daily active users), EU data region. You handle account recovery yourself. Use one instance per team. |
| **Self-hosted Keycloak** | `amr:mfa` | Like the lab's own. Only as secure as its maintenance: someone has to keep it updated and handle account recovery. |

Not suitable where 2FA is required: the Auth0 free plan (no step-up) and Google consumer accounts (`@gmail.com`, no institutional agreements, and `amr` is not always present). The 2FA signals were checked in November 2026 ([details and sources](./auth-2fa.md#provider-support-for-mfa-signals)); provider behaviour changes, so test the setup before going live. The full evaluation, including Authentik and Auth0: [Provider comparison](./auth-providers.md).

## Teaching and low-sensitivity servers

For a server without sensitive data, such as a course or a pilot, a provider that doesn't meet all requirements can be used, with one or both of the [weaker security settings](./auth.md#weaker-security-teaching-and-low-sensitivity-servers):

* **`AUTH_INSECURE_DISABLE_2FA=true`** when the provider has no 2FA, or can't signal it. Sensitive actions (API keys, changing roles) then only need a recent login. Everyone understands the limitation: whoever has a user's password can act as that user.
* **`AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION=true`** only when the provider does verify email addresses but doesn't send `email_verified`. Never with a provider where users can choose an address without proving they own it: roles given to an email address could then be claimed by someone else.

Both settings show a permanent warning on the admin page. If the server later gets sensitive data, choose a provider that meets the requirements and [migrate](./auth-migration.md) first.

## Checklist for your own provider

* [ ] The provider is approved by your institution for the data on your server.
* [ ] The provider returns `email_verified: true` for your users.
* [ ] 2FA is required (or can be requested) for your users, and `OIDC_MFA_CLAIM` matches the provider's signal. (Or, for a teaching server only: `AUTH_INSECURE_DISABLE_2FA=true`.)
* [ ] Step-up works: performing a sensitive action (e.g. creating an API key) after more than `AUTH_STEP_UP_MAX_AGE` seconds asks for 2FA again.
* [ ] It is clear who handles account recovery for your users (a helpdesk, or your own admin).
* [ ] The server admin page shows no [hardening warnings](./auth.md#server-hardening-warnings), or only the ones you chose deliberately.
* [ ] If you are moving from another provider: follow the [Migration guide](./auth-migration.md).
