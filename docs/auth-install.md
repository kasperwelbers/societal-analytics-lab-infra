# Installation guide: authentication

This guide is for teams that host AmCAT or AnnoTinder themselves. It covers choosing and setting up an OIDC provider. For what our software does with the provider, see the [Authentication standard](./auth.md).

The provider must meet three [requirements](./auth.md#oidc-provider-requirements): it verifies email addresses, supports 2FA and signals it to our server, and supports step-up (`max_age` and `auth_time`). Which provider fits depends on your institution and on the data on your server:

1. **Your institution's identity provider,** or another provider that meets the requirements (below). Required for sensitive research data.
2. **For teaching and other servers without sensitive data:** a provider that doesn't meet all requirements, with [weaker security settings](#teaching-and-low-sensitivity-servers).

Whichever you choose, your team is responsible for the personal data on your server. We provide a [privacy statement template](./policies/privacy-template.md) to get started. Moving to another provider later is a [migration](./auth-migration.md).

## Providers that meet the requirements

**Your institution's identity provider (recommended for research data)**

The safest choice is a provider that is managed by a security team and has a helpdesk for account recovery. For most universities that means the institution's own identity provider. Talk to your IT department: they decide which providers may be used for research data, and they may already have one available.

**SURF (Dutch institutions)**

Dutch universities and research institutes are usually connected to SURF, which offers two relevant services. Both are arranged through your institution, not directly with SURF.

* **SURFconext** is the standard login for Dutch institutions. Your institution's SURFconext contact connects your server as a service. 2FA is provided by SURFsecureID, which institutions procure separately, and is signalled with an `acr` value (`OIDC_MFA_CLAIM=acr:<SURFsecureID LoA>`).
* **SURF Research Access Management (SRAM)** is designed for research collaborations, including members from other (also international) institutions via eduGAIN, and guests via eduID. SRAM makes sure every user logs in with 2FA: it uses the home institution's 2FA when available, and its own second factor otherwise. SRAM offers OIDC. ==TODO: verify which claim SRAM uses to signal 2FA.==

SURF is only available to Dutch institutions. Institutions in other countries often have a comparable national research and education federation; ask your IT department.

**ZITADEL Cloud free plan (small teams)**

If your institution can't offer a provider, you can create your own [ZITADEL Cloud](https://zitadel.com) instance. The free plan includes 2FA and passkeys, and lets you choose an EU data region, but is limited to 100 daily active users. We only recommend it if you don't expect many active users, or are able to move to a paid plan when you do. You handle account recovery yourself.

**Other providers**

| OIDC Provider | 2FA | 2FA signal (`OIDC_MFA_CLAIM`) | GDPR Compliant | Cost | Ease of Setup | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **SURFconext** (Dutch institutions) | Via SURFsecureID (procured by the institution) | `acr:<SURFsecureID LoA>` | **Yes** | Institutional | Medium | See [SURF](#providers-that-meet-the-requirements) above. |
| **Microsoft Entra ID** | Yes | `amr:mfa` (add `amr` as optional claim) | **Yes** | Paid (Institutional) | Hard (Admin setup) | Proper enterprise/institutional contracts and DPAs. |
| **Google Workspace** | Yes | `amr:mfa` | **Yes** | Paid (Institutional) | Hard (Admin setup) | Google only includes `amr` when the information is available. Test before relying on it. |
| **Auth0 paid plans** | Yes (TOTP from Essentials, WebAuthn from Professional) | `amr:mfa` | **Yes** | Paid | Easy | Includes enterprise agreements, SLAs, and DPA. |
| **ZITADEL** (Cloud or self-hosted) | Yes | `amr:mfa` (verify) | **Yes** (EU region or hosting) | Free plan (100 daily active users) / paid plans / hosting cost | Easy (Cloud) / Medium (self-hosted) | Use one instance per team: organizations within one instance don't isolate users from each other (see the [comparison](./auth-providers.md#zitadel)). |
| **Self-hosted Authentik** | Yes | `amr:mfa` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | MFA must be required in the authentication flow (Authentik can't be asked for MFA on demand). |
| **Self-hosted Keycloak** | Yes | `amr:mfa` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | Add the AMR mapper (a client scope), with a reference value (`pwd` or `mfa`) on each authenticator. The lab's own setup is an example: [Keycloak setup](./keycloak.md) and the realm files in `deploy/keycloak/realms/`. |

A self-hosted provider is only as secure as its maintenance: someone has to keep it updated and handle account recovery.

Not suitable with 2FA required (at most for a teaching server, see below):

* **Auth0 free plan.** No step-up MFA factors.
* **Google consumer accounts (`@gmail.com`).** No institutional agreements, and `amr` is not always present.

The 2FA signal column was checked in November 2026; details and sources are in [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals). Provider behaviour changes, so test the setup before going live.

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
