# Two-factor authentication: where should it live?

All our software requires a second factor (2FA, MFA) for sensitive actions (see the [Authentication standard](./auth.md)). This page discusses **which component provides that second factor**: the OIDC provider (option A), or a component of our own (option B). It explains the relevant concepts, lists the pros and cons of both options, and ends with a recommendation.

This page is about AmCAT and AnnoTinder, including when other teams host them. The lab's own infrastructure is discussed in [Lab authentication](./lab-auth.md).

## Concepts

### Authentication factors

A factor is a type of proof that you are who you claim to be: something you **know** (password), something you **have** (phone, security key, access to an inbox), or something you **are** (fingerprint, usually used to unlock a device). Two-factor authentication means that a login requires two *different* types of proof, so that stealing one is not enough.

Two things are easy to overlook:

* **Email is a factor.** Logging in via an email link, or via an account whose password can be reset by email, proves possession of the inbox. A login without 2FA is therefore usually one factor, no matter how many screens it has.
* **A factor that can be recovered by email is not a second factor.** If a lost authenticator app can be replaced by clicking a link in your inbox, an attacker with access to the inbox can do the same. Real 2FA needs a recovery route that is stronger than email: recovery codes, a second registered device, or a person (admin, helpdesk) who verifies your identity. This is true for both options; they differ in **who** handles recovery.

### Second factor types

| Type | Notes |
| --- | --- |
| **Passkeys / WebAuthn** (device biometrics, security keys) | Bound to the website's domain, so they can't be phished on a look-alike page. The strongest common option. |
| **TOTP** (authenticator apps, 6-digit codes) | Widely supported, but can be phished: a fake login page can ask for the code and use it immediately. |
| **SMS** | Better than nothing, but vulnerable to SIM swapping. |

### OIDC claims

An OIDC provider returns an ID token with claims about the login. The ones that matter here:

| Claim | Meaning |
| --- | --- |
| `iss` + `sub` | The provider (issuer) and the user at that provider. Together they are the user's identity. |
| `email` + `email_verified` | The email address, and whether the provider confirms the user owns it. |
| `auth_time` | When the user last actually authenticated (not when the token was issued). Used to check freshness. |
| `amr` | Authentication methods used, such as `pwd`, `otp`, `mfa`. Standardized names exist, but **providers decide which values they send and when**. |
| `acr` | The *level* of the login, e.g. a level-of-assurance URI. Institutional federations (including SURFconext) often signal 2FA through `acr` instead of `amr`. |

### Step-up and freshness

**Step-up authentication** means asking an already logged-in user for a fresh second factor before a sensitive action, such as creating an API key or changing roles. With an OIDC provider, the server sends the user back to the provider with `max_age` (re-authenticate if the last login is older than N seconds), and then checks `auth_time` and the 2FA claim in the new token itself. The server must check this itself, because providers don't always enforce what was requested. For instance, Keycloak had a vulnerability (CVE-2026-97176) where a token could be issued at a lower level than requested.

### Threats

| Threat | Description |
| --- | --- |
| **T1. Stolen password or inbox** | The most common attack. Any real 2FA stops it. |
| **T2. Email reassignment** | Old email addresses get reassigned, especially institutional ones. Our [safeguards](./auth.md#safeguards-against-email-reassignment) exist for this. |
| **T3. Compromised or misconfigured provider** | A breached provider, a careless admin, or weak account recovery at the provider. The provider can then issue valid tokens for any user. |
| **T4. Phishing** | A fake login page captures credentials and one-time codes. |
| **T5. Lockout** | A user loses their second factor. Not an attack, but recovery procedures are a common attack surface themselves. |

## Option A: the OIDC provider handles 2FA

**How it works**

* The OIDC provider requires 2FA, and signals it in the ID token. Which claim counts as 2FA is configured per deployment with `OIDC_MFA_CLAIM` (e.g. `amr` containing `mfa`, or a specific `acr` value).
* For sensitive actions, the server checks the claim and `auth_time`, and redirects to the provider with `max_age` if the login is too old.
* Teams without a suitable provider can use our [shared OIDC provider](./auth-install.md#option-1-our-shared-oidc-provider) (ZITADEL, with 2FA) for servers without sensitive data.

| Pros | Cons |
| --- | --- |
| **The standard pattern.** Auditors, university IT and other developers recognize it immediately. | **The 2FA signal differs per provider.** Each provider needs to be checked and configured (see [Provider support](#provider-support-for-mfa-signals)). |
| **No 2FA code in our software.** Enrollment, factor storage, phishing-resistance and rate limiting are the provider's job. | **Teams need a provider with 2FA.** Free and simple providers often lack it. Our shared provider covers servers without sensitive data. |
| **Recovery is handled by the provider.** With an institutional provider, the institution's helpdesk handles lost factors. | **The provider is a single point of trust (T3).** A compromised or misconfigured provider can issue tokens that claim 2FA was used. |
| **One login prompt.** Users whose institution already requires 2FA are not asked again. | **We can't see the quality of the 2FA.** The token says 2FA was used, not whether it was a passkey or SMS, or how the factor can be recovered. |
| **Works with our existing OIDC code.** | **Changing providers needs a [migration](./auth-migration.md).** Account linking makes this manageable. |

## Option B: our own second factor (local broker)

**How it works**

* Next to AmCAT or AnnoTinder, the server runs a small OIDC provider of its own (a **local broker**), e.g. at `domain.com/oidc`.
* The broker uses an upstream OIDC provider (e.g. Auth0, Google, an institutional provider) only to verify the user's email address: the first factor.
* The broker enforces its own second factor (passkeys, TOTP) that can't be reset by email, and sends the same 2FA signal (`amr`, `auth_time`) to the apps.
* For AmCAT and AnnoTinder the broker is just another OIDC provider: they use it as their `OIDC_HOST`.

| Pros | Cons |
| --- | --- |
| **Works with any upstream provider** that verifies email, including free ones. | **An extra component** that every deployment runs, and that we either adopt or build and maintain. |
| **The second factor is independent of the upstream provider (T1, T3).** A compromised upstream provider or hijacked inbox is not enough for sensitive actions. | **Every deployment handles recovery.** Each server needs an admin who can verify users and reset factors. |
| **We know the quality of the 2FA** (e.g. phishing-resistant passkeys, T4). | **Two login prompts** for users whose institution already requires 2FA. |
| **Changing the upstream provider is invisible to the apps.** They only see the broker's `iss` and `sub`; the broker links the new upstream login to the existing identity. | **Less familiar.** It deviates from the common pattern, so it needs explaining to auditors and colleagues. |

### Existing tools

Some OIDC providers can act as such a broker, for instance [Rauthy](https://github.com/sebadob/rauthy) (upstream login providers, passkeys and TOTP, lightweight). At the time of writing Rauthy is pre-1.0, and its upstream provider support is described as beta.

### Precedents

Option A is the common pattern, but option B also has precedents:

* **NIST SP 800-63C-4** (US federal guidelines for federated login). At its highest assurance level (FAL3), the relying party must verify that the user controls an authenticator *in addition to* the provider's assertion. This can be a **bound authenticator** that the relying party manages itself, and the provider never sees. NIST presents this as extra protection against a compromised provider (T3).
* **GitLab** (self-hosted). Users can sign in via external providers, and GitLab can enforce its own 2FA on top. Administrators can choose to skip GitLab's 2FA for specific providers they trust.

## Comparison

| | A: provider handles 2FA | B: local broker |
| --- | --- | --- |
| Follows the common pattern | Yes | No |
| Security-critical code we maintain | None | The broker (adopted or built) |
| Provider requirements | 2FA and a usable 2FA signal | Verified email only |
| Cheapest setup with real 2FA | Our shared provider, or a free plan with 2FA (e.g. ZITADEL Cloud) | Any free provider plus the broker |
| Stolen password or inbox (T1) | Protected | Protected |
| Compromised or misconfigured provider (T3) | Not protected | Protected for sensitive actions |
| Phishing (T4) | Depends on the provider's factors | Protected with passkeys |
| Account recovery (T5) | The provider (e.g. institution helpdesk) | Each deployment's admin |
| Changing providers | Migration (account linking or re-claiming) | Invisible to the apps |
| Prompts for users with institutional 2FA | One | Two |

## Why B can be added later

Option B doesn't require changes to AmCAT or AnnoTinder. Both apps only talk OIDC to whatever `OIDC_HOST` points to, and check the same 2FA claim. A local broker is just another OIDC provider. So:

* We can build A now, and add B later as an extra deployment option.
* A and B can be used side by side: a deployment with a good institutional provider uses it directly (A), a deployment with a simple provider puts the broker in front of it (B).
* Account linking and the identities table, which we need for A anyway, also cover moving a deployment from A to B.

## Recommendation

**Start with option A, and consider option B later.**

* A is the standard approach, and keeps 2FA, account recovery and phishing-resistance with providers that are managed by security teams.
* A requires the least security-critical code in our products.
* A's main weakness, that teams without a suitable provider would have no 2FA, is covered by our shared provider for servers without sensitive data.
* B solves problems that A can't (provider compromise, providers without 2FA), but adds a component to maintain. Because B can be added without changing the apps, we don't need to decide on it now.

We should reconsider B when:

* teams report that they can't get a suitable provider with 2FA,
* a lightweight OIDC provider that supports upstream login with its own enforced 2FA reaches a stable release (e.g. Rauthy 1.0), or
* passkeys become the default login at the providers our users rely on.

## Provider support for MFA signals

Checked in November 2026. Provider behaviour changes, so re-check before relying on a row.

| Provider | MFA signal | Step-up | Notes |
| --- | --- | --- | --- |
| **Google** (consumer and Workspace) | `amr` (`mfa`, `hwk`, `swk`, `pwd`, ...) | `max_age` | Part of the Sign in with Google "security bundle". Google includes `amr` only when the information is available, so it may be absent even when requested. |
| **Microsoft Entra ID** | `amr` (`mfa` only when MFA was completed) | Conditional Access, `max_age` | Since 2026, `amr` can be added as an optional claim to v2.0 tokens. Configure per app. |
| **Auth0** | `amr` contains `mfa` | Actions + `acr_values` | The free plan has no step-up MFA factors (TOTP from the Essentials plan, WebAuthn from Professional). `amr` can be missing on silent SSO renewal. |
| **Authentik** | `amr` (`pwd`, `mfa`, passwordless WebAuthn) | `max_age`, `prompt=login` | `acr` is a fixed value, so MFA can't be requested on demand. MFA must be part of the authentication flow. |
| **Keycloak** | `acr` (levels of authentication mapped to flows) | `acr_values`, `max_age` | Always check the returned `acr` yourself (see CVE-2026-97176). |
| **ZITADEL** | `amr` and `acr` in the ID token | `max_age` (to verify) | The exact `amr` values need to be verified; one report mentions `amr` as a string instead of a list, so accept both. |
| **SURFconext** (Dutch institutions) | `acr` with a SURFsecureID LoA value | `acr_values` | 2FA via SURFsecureID, which institutions procure separately. |

## Sources

* [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) (`amr`, `acr`, `auth_time`, `max_age`)
* [RFC 8176: Authentication Method Reference Values](https://www.rfc-editor.org/rfc/rfc8176.txt)
* [Google: Sign in with Google security bundle](https://developers.google.com/identity/siwg/security-bundle)
* [Microsoft Entra: optional claims (`amr` for v2.0)](https://entradiff.merill.net/changes/2026-08-12/optional-claims-02/)
* [Auth0: step-up authentication for web apps](https://auth0.com/docs/secure/multi-factor-authentication/step-up-authentication/configure-step-up-authentication-for-web-apps), [Auth0 MFA factors per plan](https://auth0.com/blog/seven-architectural-readiness-checks-before-production-launch)
* [Authentik source: ID token `amr`](https://github.com/goauthentik/authentik/blob/main/authentik/providers/oauth2/id_token.py)
* [Keycloak step-up authentication](https://skycloak.io/blog/keycloak-step-up-authentication-guide/), [CVE-2026-97176](https://skycloak.io/blog/cve-2026-97176-keycloak-loa-acr-cookie-bypass/)
* [ZITADEL documentation](https://zitadel.com/docs)
* [SURFconext: requesting SURFsecureID](https://wiki.surfnet.nl/display/surfconextdev/Requesting+SURFsecureID+in+authentication+requests)
* [NIST SP 800-63C-4: federation assurance levels](https://pages.nist.gov/800-63-4/sp800-63c/fal), [NIST SP 800-217: RP-managed bound authenticators](https://pages.nist.gov/800-217/federation)
* [GitLab: OmniAuth settings (`allow_bypass_two_factor`)](https://docs.gitlab.com/integration/omniauth/)
* [Rauthy](https://github.com/sebadob/rauthy)
