# Installation guide: authentication

This guide is for teams that host AmCAT or AnnoTinder themselves. It covers choosing and setting up an OIDC provider. For what our software does with the provider, see the [Authentication standard](./auth.md).

There are two options:

1. **Our shared OIDC provider.** Free, for servers without sensitive data, such as teaching and pilots.
2. **Your own OIDC provider.** Required for sensitive research data. Ideally your institution's identity provider, but there are other options.

You can start with option 1 and [migrate](./auth-migration.md) to option 2 later.

Whichever option you choose, your team is responsible for the personal data on your server. We provide a [privacy statement template](./policies/privacy-template.md) to get started.

## Option 1: our shared OIDC provider

To make it easy to start, the Societal Analytics Lab offers a shared OIDC provider: the `idp` realm of our Keycloak (see [Keycloak setup](./keycloak.md)), separate from the realm for the lab's own infrastructure. Users can log in with an email address and password, or with Google or GitHub. A second factor is optional at login; our software asks for it for sensitive actions.

* **One account per user.** Users create one account at the shared provider, which works on every server that uses it.
* **You register your server yourself** on the [app registration site](./app-registration.md), and get a client ID and client secret right away. You can register up to 3 apps; the lab can raise this, and the email limits of an app, on request.
* **Users consent once per host.** Before your server receives a user's name and email address, the user is asked to consent. AmCAT and AnnoTinder on the same host share one client, so one consent covers both (see [One client per host](./auth-providers.md#one-client-per-host)).
**Setting up your server:** register it on the app registration site (with your server's redirect URIs), and configure our software with the issuer `https://auth.example.org/realms/idp`, the client ID and secret from the app page, and `OIDC_MFA_CLAIM=amr:mfa`. Details: [App registration](./app-registration.md#for-app-developers).

**Terms**

* **No sensitive research data.** Names and email addresses of users (e.g. students) are personal data too, so you are responsible for handling those according to your institution's rules.
* **Best-effort availability.** If the shared provider is down, nobody can log in to your server. Keep this in mind for teaching and exams.
* **Account recovery.** Users reset their own password by email, and still need their second factor to log in. For a lost second factor, users have recovery codes; without them, the lab helps on a best-effort basis; the lab does not provide a helpdesk. See [How users log in](./keycloak.md#how-users-log-in).
* **The lab operates the provider.** As the operator, the lab could in principle access every account. This is one of the reasons the shared provider is not for sensitive data.

!!! warning "Is your server getting used for research data?"
    If you start using sensitive research data, move to your own OIDC provider first (see the [Migration guide](./auth-migration.md)). The web client shows server admins a **Shared OIDC provider: not for sensitive data** label as a reminder.

## Option 2: your own OIDC provider

The provider must meet three [requirements](./auth.md#oidc-provider-requirements): it verifies email addresses, supports 2FA and signals it to our server, and supports step-up (`max_age` and `auth_time`). Which provider fits depends on your institution and on what you want to do.

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
| **SURFconext** (Dutch institutions) | Via SURFsecureID (procured by the institution) | `acr:<SURFsecureID LoA>` | **Yes** | Institutional | Medium | See [SURF](#option-2-your-own-oidc-provider) above. |
| **Microsoft Entra ID** | Yes | `amr:mfa` (add `amr` as optional claim) | **Yes** | Paid (Institutional) | Hard (Admin setup) | Proper enterprise/institutional contracts and DPAs. |
| **Google Workspace** | Yes | `amr:mfa` | **Yes** | Paid (Institutional) | Hard (Admin setup) | Google only includes `amr` when the information is available. Test before relying on it. |
| **Auth0 paid plans** | Yes (TOTP from Essentials, WebAuthn from Professional) | `amr:mfa` | **Yes** | Paid | Easy | Includes enterprise agreements, SLAs, and DPA. |
| **ZITADEL** (Cloud or self-hosted) | Yes | `amr:mfa` (verify) | **Yes** (EU region or hosting) | Free plan (100 daily active users) / paid plans / hosting cost | Easy (Cloud) / Medium (self-hosted) | Use one instance per team: organizations within one instance don't isolate users from each other (see the [comparison](./auth-providers.md#zitadel)). |
| **Self-hosted Authentik** | Yes | `amr:mfa` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | MFA must be required in the authentication flow (Authentik can't be asked for MFA on demand). |
| **Self-hosted Keycloak** | Yes | `amr:mfa` | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | Add the AMR mapper (a client scope), with a reference value (`pwd` or `mfa`) on each authenticator; our realm files are an example (`deploy/keycloak/realms/`). |

A self-hosted provider is only as secure as its maintenance: someone has to keep it updated and handle account recovery.

Not suitable:

* **Auth0 free plan.** No step-up MFA factors.
* **Google consumer accounts (`@gmail.com`).** No institutional agreements, and `amr` is not always present.

The 2FA signal column was checked in November 2026; details and sources are in [Provider support for MFA signals](./auth-2fa.md#provider-support-for-mfa-signals). Provider behaviour changes, so test the setup before going live.

## Checklist for your own provider

* [ ] The provider is approved by your institution for the data on your server.
* [ ] The provider returns `email_verified: true` for your users.
* [ ] 2FA is required (or can be requested) for your users, and `OIDC_MFA_CLAIM` matches the provider's signal.
* [ ] Step-up works: performing a sensitive action (e.g. creating an API key) after more than `AUTH_STEP_UP_MAX_AGE` seconds asks for 2FA again.
* [ ] It is clear who handles account recovery for your users (a helpdesk, or your own admin).
* [ ] The server admin page shows no [hardening warnings](./auth.md#server-hardening-warnings).
* [ ] If you are moving from our shared provider or another provider: follow the [Migration guide](./auth-migration.md).
