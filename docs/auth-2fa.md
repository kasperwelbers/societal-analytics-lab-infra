# Two-factor authentication: decision record

All our software requires a second factor (2FA, MFA) for sensitive actions (see the [Authentication standard](./auth.md)). This page records **which component provides that second factor**: the OIDC provider, our own server, or a combination of both.

**Status: decided (November 2026).** We implement Option A now, and plan Option B as an additional deployment mode. See [Decision](#decision).

This page is about how AmCAT and AnnoTinder handle 2FA, including when other teams deploy them. Our own lab infrastructure (e.g. the AuthWall in front of Whisper and Ollama) is out of scope: it uses our own OIDC provider with 2FA regardless of what we decide here.

The comparison below was written before the decision, as a neutral comparison: it introduces the relevant concepts, describes each option as honestly as possible, and ends with decision criteria. It mentions `DISABLE_2FA_YOLO`, an opt-out from 2FA that the decision removed.

* **Option A: the OIDC provider handles 2FA.** The server checks the `amr`/`acr` claims and asks the provider for step-up authentication. *This is the approach the authentication standard was originally written from.*
* **Option B: the OIDC provider only verifies email, the server handles 2FA.** The server enrolls and checks its own second factor (passkey or TOTP).
* **Option C: hybrid.** The server accepts the provider's 2FA if the deployer configured that provider as trusted, and otherwise uses its own second factor.

## Concepts

### Authentication factors

A factor is a type of proof that you are who you claim to be: something you **know** (password), something you **have** (phone, security key, access to an inbox), or something you **are** (fingerprint, usually used to unlock a device). Two-factor authentication means that a login requires two *different* types of proof, so that stealing one is not enough.

Two things are easy to overlook:

* **Email is a factor.** Logging in via an email link, or via a social account whose password can be reset by email, proves possession of the inbox. An OIDC login without 2FA is therefore usually one factor, no matter how many screens it has.
* **A factor that can be recovered by email is not a second factor.** If losing your authenticator app can be fixed by clicking a link in your inbox, then an attacker with access to the inbox can do the same. Real 2FA always needs a recovery route that is stronger than email: recovery codes, a second registered device, or a person (admin, helpdesk) who verifies your identity out of band. *This is true for every option on this page.* The options only differ in **who** owns the recovery.

### Second factor types

* **TOTP** (authenticator apps, 6-digit codes): widely supported and easy to implement, but can be phished (a fake login page can ask for the code and use it immediately).
* **Passkeys / WebAuthn** (device biometrics, security keys): bound to the website's domain, so they cannot be phished on a look-alike page. The strongest common option.
* **SMS**: better than nothing, but vulnerable to SIM swapping. Not considered further here.

### Relevant OIDC claims

An OIDC provider returns an ID token with claims about the login. The ones that matter for this discussion:

* **`iss` + `sub`**: the issuer and the subject identifier. Together they are the user's identity (see IBAC in the [Authentication standard](./auth.md)).
* **`email` + `email_verified`**: the email address and whether the provider confirms the user owns it.
* **`auth_time`**: when the user last actually authenticated (not when the token was issued). Used to check freshness.
* **`amr`** (Authentication Methods References): a list of methods used, such as `pwd`, `otp`, `hwk`, `mfa`. The claim is defined by OIDC and RFC 8176 registers common values, but **providers decide which values they send and when**, and the claim is optional.
* **`acr`** (Authentication Context Class Reference): a single value describing the *level* of the login, for example a level of assurance (LoA) URI. Many institutional federations (including SURFconext) signal MFA through `acr` rather than `amr`.

### Step-up and freshness

**Step-up authentication** means asking an already logged-in user for a (fresh) second factor before a sensitive action, such as creating an API key or changing roles. **Freshness** means the second factor must have been used recently, e.g. within the last 10 minutes.

With an OIDC provider, step-up works by sending the user back to the provider with `max_age` (re-authenticate if the last login is older than N seconds), `prompt=login` (always re-authenticate) and/or `acr_values` (request a specific level). The server then **must check the returned token itself** (`auth_time` and `amr`/`acr`), because providers do not always enforce what was requested. For instance, Keycloak recently had a vulnerability (CVE-2026-97176) where a token could be issued at a lower level than the client requested; applications that checked the returned `acr` themselves were not affected.

### Account linking

**Account linking** means that one user account can have multiple login identities (multiple `iss` + `sub` pairs), for instance in an `identities` table (`user_id`, `iss`, `sub`, `linked_at`) instead of `iss` and `sub` columns on the user. A logged-in user can add a new identity by signing in at another trusted provider. Because the user is authenticated at both providers when linking, email plays no role.

This makes changing providers a gradual migration instead of a hard switch: the server trusts the old and the new provider for a transition period, users link their new login, and after a cutoff the old provider is removed. Users who did not link fall back to re-claiming their account (see the [Migration guide](./auth-migration.md)). Account linking works under all three options.

### Threats that matter here

* **T1. Stolen password or inbox.** The most common attack. Any real 2FA stops it.
* **T2. Email reassignment.** Old email addresses get reassigned (especially institutional ones). Our dormant user and shadow account safeguards exist for this.
* **T3. Compromised or misconfigured provider.** A breached provider, a careless admin, or a social login with weak account recovery. The provider can then issue valid tokens for any user.
* **T4. Phishing.** A fake login page captures credentials and one-time codes.
* **T5. Lockout.** A user loses their factor. Not an attack, but the reason recovery procedures exist, and recovery procedures are a common attack surface themselves.

## Option A: the OIDC provider handles 2FA

**How it works**

* The provider is configured to require 2FA (always, or on request).
* The server checks the ID token for an MFA signal (`amr` contains `mfa`, or a configured `acr` value) and stores `has_mfa` on the user.
* For sensitive actions, the server checks `auth_time` for freshness. If the login is too old or has no MFA signal, it redirects to the provider with `max_age` (and `acr_values` if the provider supports it), and checks the new token.
* Deployers whose provider cannot do this can opt out with `DISABLE_2FA_YOLO`.

**Strengths**

* **The standard pattern.** This is how most organizations do it. Auditors, university IT and other developers recognize it immediately.
* **No 2FA code in our software.** Enrollment, factor storage, phishing-resistance and rate limiting are the provider's problem.
* **One second factor across applications.** If a team already uses its provider for other applications, users have one second factor for all of them.
* **Recovery is outsourced.** With an institutional provider, the institution's helpdesk handles lost factors with its own identity checks.
* **One prompt for users.** Users who already do 2FA at their institution are not asked again.

**Weaknesses**

* **The MFA signal is not uniform.** Whether and how providers report MFA differs per provider and sometimes per plan or endpoint (see [Provider support](#provider-support-for-mfa-signals)). Each new provider needs to be checked and possibly configured, and some send the signal only when it is available.
* **Deployers need a provider with 2FA.** Free and simple providers often lack it (e.g. the Auth0 free plan has no step-up MFA factors). In practice this pushes small deployments to `DISABLE_2FA_YOLO`, i.e. no 2FA at all.
* **The provider is a single point of trust (T3).** If the provider is compromised or misconfigured, it can issue tokens with `amr: ["mfa"]`, and the server has no way to tell.
* **We cannot see the quality of the 2FA or its recovery.** The token says 2FA happened, not whether it was a passkey or SMS, or whether the factor was reset by a helpdesk that only asked for an email address.
* **`has_mfa` is only as good as the signal.** Our dormant user safeguard relies on it. If a provider does not send the signal, every user counts as having no 2FA, and the safeguard can't tell users apart.
* **Switching providers relies on email.** New `iss` and `sub` values mean users must re-claim their accounts. With [account linking](#account-linking) users can move their login during a transition period, but users who miss it re-claim their account based on email alone (see the [Migration guide](./auth-migration.md)).

## Option B: the OIDC provider only verifies email, the server handles 2FA

**How it works**

* The provider only needs to authenticate the user and assert `email_verified: true`. Any OIDC provider qualifies, including free tiers and social logins (via a broker such as Auth0 or Authentik for providers that don't speak OIDC, like GitHub).
* After the first login, the server asks the user to enroll a second factor: a passkey (preferred) and/or TOTP. Users are encouraged to register two factors (e.g. laptop and phone) and receive recovery codes.
* For sensitive actions, the server asks for its own factor directly in the web client. No redirect to the provider is needed.
* A lost factor is reset by a server admin with a logged command (not via the web interface), after verifying the user out of band. The user is notified by email, but email is never the recovery route.

**Strengths**

* **Works with any provider.** Deployments can start with a free provider and switch later. No `DISABLE_2FA_YOLO` needed.
* **The same 2FA everywhere.** Every deployment of our software has the same quality of 2FA, and we know exactly what it is (passkeys are phishing-resistant, T4).
* **Independent of the provider (T1, T3).** A compromised provider, a hijacked inbox or a social account with weak recovery is not enough to perform sensitive actions.
* **Reliable `has_mfa`.** The server knows for certain whether a user has 2FA, which makes the dormant user safeguard (T2) work as intended.
* **Safe provider switching.** If `iss` and `sub` change, users re-claim their account via email *and* must pass the second factor the server already holds. The new owner of an email address can't do this.
* **Simpler step-up.** Step-up happens inside the web client, without depending on each provider's support for `max_age` or `acr_values`.

**Weaknesses**

* **We own security-critical code.** WebAuthn and TOTP enrollment, encrypted storage of TOTP secrets, rate limiting, recovery codes and the admin reset all have to be implemented, tested and maintained in every product (or in a shared library).
* **Every deployment owns recovery.** Each deployer needs an admin who can verify users and reset factors. For small research deployments this is usually easy (the admin knows the users), but it is a real responsibility.
* **Double prompts.** Users whose institution already enforces 2FA are asked twice.
* **Separate enrollment per server.** A user of both AmCAT and AnnoTinder (or of two AmCAT servers) enrolls a factor on each. Passkeys make this cheap, but it is more friction than a single provider login.
* **Less familiar.** It deviates from the common pattern, so it needs explaining to auditors and colleagues (this page).

## Option C: hybrid

**How it works**

* The server implements its own second factor (as in B).
* Deployers can mark a provider as trusted for 2FA and configure which signal counts as MFA (e.g. `amr` contains `mfa`, or `acr` equals a specific LoA value). For users from a trusted provider, a valid and fresh signal satisfies the 2FA requirement and the server's own factor is not asked.
* Without such configuration, the server's own factor is used.

**Strengths**

* **Fits both kinds of deployment.** A deployment with an institutional provider that enforces 2FA can rely on it (one prompt), while a small deployment on a free provider still gets real 2FA.
* **No `DISABLE_2FA_YOLO`.** There is always a working 2FA route.
* **An explicit trust decision.** Trusting the provider becomes a documented configuration choice of the deployer, instead of an implicit requirement.

**Weaknesses**

* **The most code.** Both the provider path (A) and the server path (B) must be implemented and tested.
* **Security depends on configuration.** A deployment that trusts its provider inherits all weaknesses of Option A (T3, invisible recovery quality). Two deployments of the same software can have very different security.
* **`has_mfa` means different things per path.** The dormant user safeguard and provider switching are only as strong as the path the user took.
* **More to document and explain.** Deployers need to understand when to trust a provider and how to configure the signal.

## Comparison

| Criterion | A: provider | B: server | C: hybrid |
| --- | --- | --- | --- |
| Follows the common pattern | Yes | No | Partly |
| 2FA code we maintain | None | Enrollment, storage, step-up, recovery | Same as B, plus provider path |
| Provider requirements | 2FA *and* a usable MFA signal | `email_verified` only | `email_verified`; 2FA signal optional |
| Cheapest working setup with real 2FA | Paid or self-hosted provider | Any free provider | Any free provider |
| Stolen password or inbox (T1) | Protected, if the provider enforces 2FA | Protected | Protected |
| Email reassignment (T2) | Safeguard works only if `has_mfa` is signalled | Safeguard works | Depends on path |
| Compromised or misconfigured provider (T3) | Not protected | Protected for sensitive actions | Not protected on trusted path |
| Phishing (T4) | Depends on provider factors | Passkeys: protected | Depends on path |
| Who handles recovery (T5) | Provider operator (e.g. institution helpdesk) | Each deployment's admin | Depends on path |
| Visibility into 2FA quality | None | Full | Depends on path |
| Switching providers | Account linking; otherwise re-claim by email only | Account linking; otherwise re-claim by email + existing factor | Depends on path |
| Prompts for users with institutional 2FA | One | Two | One (if trusted) |
| Familiar to auditors | Yes | Needs explaining (see [precedents](#precedents)) | Needs explaining (see [precedents](#precedents)) |

## Consequences for the authentication standard

The choice affects several parts of the [Authentication standard](./auth.md):

* **`has_mfa`.** A: copied from the provider's signal on each login, and unknown (false) if the provider sends none. B: set by the server when a factor is enrolled. C: either, depending on the path; the user table should then also record the source.
* **Dormant user safeguard** (`role.granted_at < user.reactivated_at AND NOT user.has_mfa`). Works under all options, but under A it only distinguishes users when the provider signals MFA.
* **`DISABLE_2FA_YOLO`.** Needed under A. Not needed under B and C.
* **Step-up.** A: redirect to the provider with `max_age`, then check `auth_time` and `amr`/`acr`. B: in-app prompt. C: both.
* **Changing OIDC providers.** Under all options, [account linking](#account-linking) lets users move to a new provider during a transition period. For users who miss it: A: re-claiming accounts relies on email ownership plus our safeguards. B: re-claiming also requires the server's factor, which makes the "easy solution" (reset `iss` + `sub` and use JIT account claiming) safe for users with 2FA. C: depends on path.
* **Self-hosting requirements.** A: the provider table must document the MFA signal per provider. B: only `email_verified` matters. C: both, plus the trust configuration.
* **Product work.** A: implement the provider check and step-up redirect. B and C: build the server-side 2FA, preferably as a shared library used by all our products.

## Provider support for MFA signals

Checked in November 2026. Provider behaviour changes, so re-check before relying on a row.

| Provider | MFA signal | Step-up | Notes |
| --- | --- | --- | --- |
| **Google** (consumer and Workspace) | `amr` (`mfa`, `hwk`, `swk`, `pwd`, ...) | `max_age` | Part of the Sign in with Google "security bundle". Google includes `amr` only when the information is available, so it may be absent even when requested. |
| **Microsoft Entra ID** | `amr` (`mfa` only when MFA was completed) | Conditional Access, `max_age` | `amr` was long only available in v1.0 tokens; since 2026 it can be added as an optional claim to v2.0 tokens. Configure per app. |
| **Auth0** | `amr` contains `mfa` | Actions + `acr_values` | The free plan supports passkeys and passwordless as *primary* login, but no step-up MFA factors (TOTP from the Essentials plan, WebAuthn from Professional). `amr` can be missing on silent SSO renewal. |
| **Authentik** | `amr` (`pwd`, `mfa`, passwordless WebAuthn) based on the login event | `max_age`, `prompt=login` | `acr` is a fixed default value, so `acr_values` can't be used to request MFA. MFA must be part of the authentication flow. |
| **Keycloak** | `acr` (levels of authentication mapped to flows) | `acr_values`, `max_age` | Full step-up support since version 20. Always check the returned `acr` yourself (see CVE-2026-97176). |
| **SURFconext** (Dutch institutions) | `acr` with a SURFsecureID LoA value | `acr_values` | MFA via SURFsecureID, which institutions procure separately. Not signalled via `amr`. |
| **GitHub** | None | None | GitHub sign-in is OAuth, not OIDC. Usable only through a broker (e.g. Auth0, Authentik), which then has to provide 2FA or email verification itself. |

## Precedents

Option A is the common pattern for applications that use OIDC. Options B and C are less common, but have precedents:

* **NIST SP 800-63C-4** (US federal guidelines for federated login). At its highest federation assurance level (FAL3), the relying party (our server) must verify that the user controls an authenticator in addition to the provider's assertion. This can be a **bound authenticator** that the relying party manages itself, which the provider never sees. The relying party is then also responsible for unbinding lost authenticators and binding new ones. Note that NIST presents this as *extra* protection against a compromised provider (T3), not as a way to use simpler providers.
* **GitLab** (self-hosted). Users can sign in via external providers (Google, SAML, etc.), and GitLab can enforce its own 2FA on top. The `allow_bypass_two_factor` setting lets administrators skip GitLab's 2FA for specific providers. With no providers configured, this is Option B. With some providers configured, it is Option C.

## Decision criteria

**Option A fits best if:**

* deployments of our software will mostly use institutional or self-hosted providers that enforce 2FA and send a usable signal,
* we prefer to keep security-critical code out of our products,
* deployments without 2FA (`DISABLE_2FA_YOLO`) are acceptable for low-risk use.

**Option B fits best if:**

* many deployments will use free or simple providers, and we want them to have real 2FA anyway,
* we don't want sensitive actions to depend on the security of the provider or of users' inboxes,
* we want reliable `has_mfa` and safe provider switching,
* we are willing to maintain a shared 2FA library and ask every deployer to own recovery.

**Option C fits best if:**

* we expect both kinds of deployment (with institutional providers that enforce 2FA *and* small deployments on free providers),
* we accept the extra code and documentation to support both,
* we are comfortable with deployers making an explicit trust decision about their provider.

**Questions to answer as a team:**

* Who deploys our software today, and with which providers? How many deployments would end up on `DISABLE_2FA_YOLO` under Option A?
* How much do we worry about T3 (provider compromise or misconfiguration) compared to the cost of maintaining our own 2FA code?
* Are we willing to build and maintain a shared 2FA library for all products?
* Is a second prompt acceptable for users whose institution already enforces 2FA?

## Decision

**November 2026: Option A now, Option B later as an additional deployment mode.** Option C is not built as a separate mode: it is what you get by offering A and B side by side.

**Option A (implemented now)**

* AmCAT and AnnoTinder trust one OIDC provider (`OIDC_HOST`), chosen by the hosting team. The provider must verify email addresses, support 2FA with a usable signal (configured with `OIDC_MFA_CLAIM`), and support step-up. See the [Authentication standard](./auth.md).
* There is no opt-out from 2FA (`DISABLE_2FA_YOLO` is removed). Instead, teams without a suitable provider can use our [shared OIDC provider](./auth-install.md#option-1-our-shared-oidc-provider) (ZITADEL, with 2FA) for servers without sensitive data, and move to their own provider for research data (see [Choosing an OIDC provider](./auth.md#choosing-an-oidc-provider)).
* Changing providers is supported with account linking or JIT re-claiming (see the [Migration guide](./auth-migration.md)).

Main reasons:

* It is the industry standard, and keeps 2FA, account recovery and phishing-resistance with providers that are managed by security teams.
* It requires the least security-critical code in our products.
* The shared provider solves the main weakness of A (teams without a suitable provider would otherwise run without 2FA), and account linking solves migration.

**Option B (planned)**

B becomes a deployment mode that requires no changes to AmCAT or AnnoTinder: a **local broker**, an OIDC provider on the same server (e.g. at `domain.com/oidc`). The apps use it as their `OIDC_HOST`, like any other trusted provider. The local broker:

* uses an upstream OIDC provider (e.g. Auth0) only to verify email addresses (first factor),
* enforces its own second factor that cannot be reset by email (passkeys, TOTP),
* sends the same 2FA signal (`amr` with `mfa`, and `auth_time`) to the apps.

Because the apps only ever see the local broker's `iss` and `sub`, changing the upstream provider no longer requires a migration in the apps (the broker links the new upstream login to the existing identity itself). And a compromised upstream provider or inbox is not enough for sensitive actions. This approach has precedents (see [Precedents](#precedents)): NIST's highest federation assurance level, and GitLab's own 2FA on top of external logins.

We prefer to adopt an existing, well-maintained service for the local broker over building one. Rauthy comes closest (OIDC provider with upstream login providers, passkeys and TOTP), but was pre-1.0 with upstream providers in beta at the time of this decision.

**Revisit when**

* A lightweight OIDC provider that supports upstream login with its own enforced 2FA reaches a stable release (e.g. Rauthy 1.0), or
* teams report that they can't get a suitable provider of their own, or
* passkeys become the default login at the providers our users rely on.

## Sources

* [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) (`amr`, `acr`, `auth_time`, `max_age`)
* [RFC 8176: Authentication Method Reference Values](https://www.rfc-editor.org/rfc/rfc8176.txt)
* [Google: Sign in with Google security bundle](https://developers.google.com/identity/siwg/security-bundle)
* [Microsoft Entra: optional claims (`amr` for v2.0)](https://entradiff.merill.net/changes/2026-08-12/optional-claims-02/), [access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
* [Auth0: step-up authentication for web apps](https://auth0.com/docs/secure/multi-factor-authentication/step-up-authentication/configure-step-up-authentication-for-web-apps), [Auth0 MFA factors per plan](https://auth0.com/blog/seven-architectural-readiness-checks-before-production-launch), [`amr` omitted on renewal](https://community.auth0.com/t/amr-and-acr-claims-omitted-from-id-token-on-renewal/88528)
* [Authentik source: ID token `amr`](https://github.com/goauthentik/authentik/blob/main/authentik/providers/oauth2/id_token.py) and [authorize view (`max_age`, `prompt`)](https://github.com/goauthentik/authentik/blob/main/authentik/providers/oauth2/views/authorize.py)
* [Keycloak step-up authentication guide](https://skycloak.io/blog/keycloak-step-up-authentication-guide/), [CVE-2026-97176](https://skycloak.io/blog/cve-2026-97176-keycloak-loa-acr-cookie-bypass/)
* [SURFconext: requesting SURFsecureID in authentication requests](https://wiki.surfnet.nl/display/surfconextdev/Requesting+SURFsecureID+in+authentication+requests)
* [NIST SP 800-63C-4: federation assurance levels](https://pages.nist.gov/800-63-4/sp800-63c/fal), [NIST SP 800-217: RP-managed bound authenticators](https://pages.nist.gov/800-217/federation)
* [GitLab: OmniAuth settings (`allow_bypass_two_factor`)](https://docs.gitlab.com/integration/omniauth/)
