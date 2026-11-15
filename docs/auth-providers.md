# OIDC provider comparison

**Status: under evaluation.** Keycloak is being tested hands-on (see the [test checklist](#keycloak-test-checklist), and the [Keycloak deployment](./keycloak-deploy.md) runbook). Until a decision is made, the shared OIDC provider described in the [Installation guide](./auth-install.md#option-1-our-shared-oidc-provider) is not available.

This page compares three self-hosted OIDC providers for the lab: **Keycloak**, **Authentik** and **ZITADEL**. It lists what we need, how each provider fits, and what still needs to be tested. Our software works with any provider that meets the [provider requirements](./auth.md#oidc-provider-requirements); this page is only about the provider that the lab runs itself.

## What we need

### Use cases

| # | Use case | Description |
| --- | --- | --- |
| 1 | **Lab authentication** | Login for the lab's own infrastructure: our AmCAT and AnnoTinder servers, and the AuthWall in front of services without their own login (Whisper, Ollama). Ideally from the same user pool as use case 3, but isolated if that is more secure. |
| 2 | **Easy client registration** | Users who host our software can register their server themselves, and get a client ID, client secret and redirect URI configuration. |
| 3 | **Identity provider** | One shared pool of users, with one account for all servers that use our provider. We control everything: users can't manage other users or add login methods. |
| 4 | **Isolated OIDC providers** | Power users (e.g. a research group) get their own pool of users, and fully manage it themselves: users, login methods, 2FA settings and account recovery. |
| 5 | **Migration** | Teams can move to another OIDC provider later (see the [Migration guide](./auth-migration.md)). |
| 6 | **Self-registration** | Users (not power users) can create an account themselves. Client registration starts with limits (e.g. a maximum number of clients) that we can increase. |
| 7 | **Consent and SSO** | Single sign-on across all servers, but users consent once per host before a server receives their data. AmCAT and AnnoTinder on the same host count as one host, so one consent covers both. |

### Requirements

These follow from the use cases and the [Authentication standard](./auth.md).

* **Consent screen.** When other people register clients, the provider must ask users before sharing their data with a client they haven't used before. Without consent, any registered client receives the name and email address of a signed-in user, without the user being asked. That is acceptable only when we register every client ourselves.
* **Tenant isolation.** For use cases 1 and 4, users in one pool must not be able to sign in to (or be signed in to) clients of another pool, and this must be enforced by the provider, not by the configuration of each client.
* **Self-service client registration with limits,** ideally via the standard ([OAuth 2.0 Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591), DCR), so that our registration page or tooling stays small.
* **The [provider requirements](./auth.md#oidc-provider-requirements) of our standard:** `email_verified`, a 2FA signal (`amr` or `acr`), and step-up (`max_age`, `auth_time`). Ideally also the option to *request* 2FA (`acr_values`), so that users without a second factor are asked to set one up.
* **Little maintenance,** and an active project with a clear future.

## Comparison

| Use case | Keycloak | Authentik | ZITADEL |
| --- | --- | --- | --- |
| **1. Lab authentication** | ✅ A separate **realm** on the same server: its own users, sessions, keys and admins. The AuthWall needs [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/). | ✅ Built-in forward auth ([proxy provider](https://docs.goauthentik.io/add-secure-apps/providers/proxy/)) for the AuthWall. Isolation from the shared pool requires a second installation. | ⚠️ Fine for clients we register ourselves. Isolation from the shared pool requires a second installation (see [Tenant isolation](#zitadel)). |
| **2. Easy client registration** | ✅ DCR with **client registration policies** (e.g. consent required, trusted hosts, maximum number of clients). **Initial access tokens** allow a fixed number of registrations, with an expiry date. Or via the admin API. | ⚠️ DCR exists in the current source code, with an option to force an authorization flow (e.g. with consent) for registered clients. ==To verify:== from which release, and whether it is part of the free or the Enterprise edition. Otherwise via the admin API. | ⚠️ No DCR ([open request](https://github.com/zitadel/zitadel/issues/9810)). Via the API from our own registration page. |
| **3. Identity provider** | ✅ One realm, with consent per client. | ✅ One installation, with consent per application. | ❌ **No consent screen** (see [ZITADEL](#zitadel)). Only usable if we register and vet every client ourselves. |
| **4. Isolated OIDC providers** | ✅ **A realm per power user**, who is admin of only that realm. Each realm has its own issuer and sessions. ==To verify:== performance guidance for large numbers of realms. | ❌ No isolated pools within one installation: [multi-tenancy was removed](https://github.com/goauthentik/authentik/tree/main/authentik/tenants/migrations). Each power user would need a separate installation. | ❌ **Users can't be isolated across organizations** within one instance (see [ZITADEL](#zitadel)). Each power user would need a separate instance. |
| **5. Migration** | ✅ Standard OIDC, and realm export/import **including users, user IDs and password hashes**. A team moving to its own Keycloak keeps the same user IDs (only `iss` changes). | ✅ Standard OIDC. ==To verify:== whether a user export includes user IDs and password hashes. | ✅ Standard OIDC. |
| **6. Self-registration** | ✅ Self-registration per realm. Client limits via initial access tokens, or our registration page. | ✅ Enrollment flows with policies. Client limits via DCR policies or our registration page. | ✅ Self-registration. Client limits via our registration page. |
| **7. Consent and SSO** | ✅ SSO within a realm. Consent is stored per client, so one client per host gives one consent per host (see [One client per host](#one-client-per-host)). | ✅ SSO within an installation. Consent is stored per application (optionally with an expiry), so the same approach works. | ❌ SSO, but no consent. |
| **Requesting 2FA (`acr_values`)** | ✅ Levels of authentication, mapped to authentication flows. | ❌ `acr` is fixed, so 2FA must be part of the login flow (see [Provider support](./auth-2fa.md#provider-support-for-mfa-signals)). | ❌ Not natively ([discussion](https://github.com/zitadel/zitadel/discussions/5083)). |
| **`amr`, `max_age`, `auth_time`** | ✅ With the AMR protocol mapper. | ✅ `amr` contains `mfa` after an MFA stage. `max_age=0` is [ignored](https://github.com/goauthentik/authentik/issues/27483); positive values (our default is 600) work. | ✅ `amr` and `auth_time`. ==To verify:== `max_age`. |
| **Deployment** | One container plus PostgreSQL, behind our reverse proxy. Large admin console with many options. | Server and worker containers plus PostgreSQL. | API and login containers plus PostgreSQL. |

### Teams and future support

| | Keycloak | Authentik | ZITADEL |
| --- | --- | --- | --- |
| **Who develops it** | Started at Red Hat (now part of IBM). A [CNCF](https://www.cncf.io/) incubating project since April 2023. Red Hat sells a commercial version ([Red Hat build of Keycloak](https://access.redhat.com/articles/7040805)). | Authentik Security Inc., a small open core company (around 5 to 10 people), backed by Open Core Ventures. MIT license, with paid Enterprise features. | ZITADEL, a company in Switzerland that also sells a cloud service. |
| **Releases** | Quarterly feature releases, patch releases every few weeks. Security issues are handled by Red Hat's product security team. | Frequent releases. Several critical authentication bypasses in 2026, mostly in features we would not use (SAML sources, proxy, device trust). | Frequent releases. |
| **Our estimate of future support** | **Very high.** Commercially backed, with CNCF governance as a safety net. | **Medium.** Depends on a small company. The MIT license and a large community make a fork possible. | **Medium to high.** Company-backed, with a commercial cloud service. |

## Per provider

### Keycloak

The most complete fit for our use cases, and the most battle-tested. Its main cost is complexity: Keycloak has many settings, and a misconfiguration is a bigger risk than the code itself. We manage that by keeping the configuration in files in this repository (realm export, or a tool such as [keycloak-config-cli](https://github.com/adorsys/keycloak-config-cli)), so that it is reviewable and reproducible.

* **Realms** give us strong isolation on one server: a realm for the shared pool, a realm for the lab, and a realm per power user.
* **Consent** is stored per client. The consent screen is skipped only when the user already approved everything the client asks for.
* **Client registration policies** can force consent for every self-registered client, so a registered client can't skip it.
* **Step-up:** levels of authentication (`acr`) can require 2FA on request. Our servers must still check the returned `acr` themselves, because providers don't always enforce what was requested (see CVE-2026-97176 in [Provider support](./auth-2fa.md#provider-support-for-mfa-signals)).
* **Deployment:** one container and PostgreSQL. `start-dev` is for local testing only; production needs `start` with a database, hostname and reverse proxy settings (see the [production](https://www.keycloak.org/server/configuration-production), [reverse proxy](https://www.keycloak.org/server/reverseproxy) and [hostname](https://www.keycloak.org/server/hostname) guides).

### Authentik

Our current lab provider. Simpler than Keycloak, with good forward auth and a built-in consent flow. It covers the identity provider case, but not isolated pools for power users, and it can't request 2FA on demand. It also depends on a small team.

* **Consent:** a built-in [explicit consent flow](https://github.com/goauthentik/authentik/blob/main/blueprints/default/flow-default-provider-authorization-explicit-consent.yaml), configurable per application.
* **Isolation:** one installation is one pool. Multi-tenancy existed for a while, but has been removed.
* **DCR:** present in the current source code, including an option to force the authorization flow (e.g. explicit consent) for dynamically registered clients. Its availability in releases and editions needs to be verified.

### ZITADEL

ZITADEL works well when **we register every client ourselves**, and the users are ours. It is not suitable for the two other roles we need:

* **Identity provider (use case 3).** ZITADEL has no consent screen. A user who is signed in is passed to any registered client without being asked, and the client receives their name and email address. When other people can register clients, users have no say in which clients receive their data. So ZITADEL can't be our identity provider for servers that others run, unless we vet every client.
* **Tenant isolation (use cases 1 and 4).** ZITADEL organizations separate *user management*, but they don't isolate users: whether a client accepts users from other organizations depends on the configuration of that client's project, which is managed by the project's owner. The instance admin can't enforce isolation for all organizations. So separate pools for power users, or for the lab, would each need a separate ZITADEL instance.

## One client per host

AmCAT and AnnoTinder hosted together on the same host can use **the same client ID and client secret**. This gives users one consent per host, which matches who actually receives their data: the operator of the host, not the software.

* Register the redirect URIs and post-logout redirect URIs of both applications on the client.
* Each application still has its own session (its own session cookie), and logging out is still per application.
* Both applications share the client secret. Rotating the secret means updating both.
* Tokens have the same audience for both applications. This is not a problem, because our applications use their own session cookies and don't accept each other's tokens.
* A client has one back-channel logout URL. Our applications don't use back-channel logout; if that changes, each application needs its own client again.

The [Authentication standard](./auth.md#for-developers) describes this as an option.

## Keycloak test checklist

To be done on a test machine, before migrating anything. Mark items as done, and add findings below each section.

**Basics**

- [ ] Run Keycloak locally with `start-dev`, create a realm and a confidential client (authorization code flow with PKCE).
- [ ] Log in to a test application, and check the ID token: `email_verified`, `auth_time`, `amr`.

**Consent (use cases 3 and 7)**

- [ ] A new user logging in to a client with consent required sees a consent screen.
- [ ] The consent is remembered: a second login to the same client shows no consent screen.
- [ ] AmCAT and AnnoTinder sharing one client on host A: one consent covers both.
- [ ] A client on host B asks for consent again.
- [ ] A silent login (`prompt=none`) for a user who did not consent returns an error, not a token.
- [ ] Users can see and revoke their consents in the account console.

**Client registration (use cases 2 and 6)**

- [ ] Register a client via DCR with an initial access token that allows 2 registrations. A third registration is refused.
- [ ] A client registration policy forces consent for every dynamically registered client.
- [ ] A registered client can't turn off consent afterwards (via the client update endpoint).
- [ ] Trusted hosts or redirect URI restrictions work as expected.
- [ ] ==To verify:== whether a policy exists that keeps new clients disabled until an admin enables them.

**Users and 2FA**

- [ ] Self-registration with required email verification.
- [ ] `amr` for password, password plus TOTP, and passkey logins.
- [ ] Step-up: `max_age=600` triggers a new login, and `auth_time` is updated.
- [ ] Requesting 2FA with `acr_values`: a user without a second factor is asked to set one up. Our server checks the returned `acr`.
- [ ] Users can't add login methods (e.g. link other accounts) unless we allow it.

**Sessions**

- [ ] SSO session lifetime of 30 minutes (idle and maximum).
- [ ] Behaviour on a shared computer after the session ends.

**Isolation (use cases 1 and 4)**

- [ ] A second realm with a delegated realm admin. That admin can't see or change anything in other realms.
- [ ] A user signed in to one realm is not signed in to another realm.

**Migration (use case 5)**

- [ ] Export a test realm with users, import it into a fresh Keycloak. Logins work, and user IDs are unchanged.

**Operations**

- [ ] Production setup with `start`, PostgreSQL and our reverse proxy (hostname and proxy headers): see the [Keycloak deployment](./keycloak-deploy.md) runbook.
- [ ] Configuration as code (realm export or keycloak-config-cli).
- [ ] Upgrade from one 26.x release to the next.
- [ ] Backups of the database, and a restore test.
- [ ] oauth2-proxy in front of a service without its own login (the AuthWall).

**Findings**

==TODO: add findings while testing.==

## Learning resources

* [OAuth 2.0 Simplified](https://www.oauth.com/) (Aaron Parecki): flows, PKCE, scopes and tokens.
* [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/html/rfc9700).
* [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html), sections 2 (ID token) and 3.1 (authorization code flow).
* *Keycloak – Identity and Access Management for Modern Applications* (2nd edition, 2023) by Stian Thorgersen and Pedro Igor Silva, both Keycloak developers.
* [Keycloak documentation](https://www.keycloak.org/documentation): Getting started with Docker, the Server Administration Guide (realms, clients, client scopes and mappers, authentication flows, sessions, client registration, consent), and the server guides (production, reverse proxy, database, hostname).
* [Keycloak blog](https://www.keycloak.org/blog), for releases and security announcements.

## Sources

* Keycloak: [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/index.html), [protocol mappers](https://www.keycloak.org/admin-api/protocol-mappers), [consent-required client registration policy (source)](https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/services/clientregistration/policy/impl/ConsentRequiredClientRegistrationPolicyFactory.java), [user consent model (source)](https://github.com/keycloak/keycloak/blob/main/server-spi/src/main/java/org/keycloak/models/UserConsentModel.java), [CNCF graduation discussion](https://github.com/keycloak/keycloak/issues/52410), [Red Hat build of Keycloak release schedule](https://access.redhat.com/articles/7040805)
* Authentik: [OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/), [dynamic client registration](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/dynamic-client-registration/), [ID token `amr` (source)](https://github.com/goauthentik/authentik/blob/main/authentik/providers/oauth2/id_token.py), [consent model (source)](https://github.com/goauthentik/authentik/blob/main/authentik/stages/consent/models.py), [`max_age=0` issue](https://github.com/goauthentik/authentik/issues/27483), [company background](https://goauthentik.io/blog/2023-11-1-happy-birthday-to-us/), [security updates in 2026](https://authhost.de/en/blog/authentik-security-updates-summer-2026)
* ZITADEL: [source code (v4.16.0)](https://github.com/zitadel/zitadel/tree/v4.16.0), [OIDC endpoints and prompt values](https://zitadel.com/docs/apis/openidoauth/endpoints), [dynamic client registration request](https://github.com/zitadel/zitadel/issues/9810), [ACR discussion](https://github.com/zitadel/zitadel/discussions/5083)
