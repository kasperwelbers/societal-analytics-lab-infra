# Lab authentication

The lab's infrastructure uses the `lab` realm of our Keycloak: members added by us, institutional email addresses, password and mandatory 2FA, no Google or GitHub (see [Keycloak setup](./keycloak.md)). Institutional login (SURF SRAM) may be added later as a login option of that realm. Why: [Decisions](./decisions.md).

This page is about authentication for the lab's infrastructure: the AuthWall in front of services without their own login (Whisper, Ollama), and other services for lab members. The lab's AmCAT and AnnoTinder servers use the `idp` realm on the same Keycloak: a separate realm, where anyone can create an account and the servers decide who gets access (see [Keycloak setup](./keycloak.md#the-idp-realm-one-login-for-the-labs-servers)).

## What we need

* **Meets our [Authentication standard](./auth.md):** verified email (`email_verified`), a 2FA signal (`amr`), and step-up (`max_age`, `auth_time`). The `lab` realm provides all three.
* **Forward auth** for services without their own login (the AuthWall).
* **External collaborators:** researchers from other institutions, including abroad, and guests without an institutional account. For now, we add them to the `lab` realm ([Adding lab members](./keycloak-deploy.md#adding-lab-members)).
* **Little maintenance,** and a clear route for account recovery: lab admins can reset a member's second factor.

Which options were considered, and why we chose Keycloak: see [Decisions](./decisions.md).

## The AuthWall

Caddy `forward_auth` with [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/), which handles the OIDC login against the `lab` realm and the session for services without their own login.

## Later: institutional login via SRAM

SURF Research Access Management (SRAM) is SURF's service for research collaborations: members log in with their own institution (VU, or other institutions worldwide via eduGAIN), or with eduID if they have no institutional account. The VU already uses SRAM, for instance for Yoda.

Keycloak can offer SRAM as a login option of the `lab` realm (as an external OIDC provider), so lab members and collaborators could log in with their institution, while our services keep talking to Keycloak, with the same claims. Open questions before we do that:

* Does SRAM's ID token include `email_verified`, a 2FA signal (`amr`/`acr`), and `auth_time`, and does it honour `max_age`? If SRAM enforces 2FA but doesn't signal it, the `lab` realm would still ask for its own second factor.
* SRAM depends on the VU: we may need to request a collaboration, and service registrations are reviewed. Each service needs a privacy policy and an acceptable use policy (AUP) URL. Drafts: [privacy statement](./policies/privacy.md) and [AUP](./policies/aup.md).
* `lab` fits such a review well: a known list of lab services, for lab members and invited collaborators. (`idp`, behind all our AmCAT and AnnoTinder servers and open to anyone, would be much harder to justify as a login service that passes identities on.)

Later, `lab` itself can become a login option of `idp` ("Sign in with your lab account"), so lab members use one account everywhere, and, with SRAM, log in with their institution. Since `lab` always requires 2FA, a login through it could count as 2FA in `idp`, but step-up must be checked first: `idp` has to pass a request for a fresh login (`max_age`) on to `lab`.

## Next steps

1. Move the lab's few Authentik users to the `lab` realm, and retire Authentik.
2. Set up the AuthWall with oauth2-proxy against the `lab` realm.
3. Later: test SRAM on its acceptance environment (`acc.sram.surf.nl`), and add it as a login option of the `lab` realm if it meets our standard.

## Sources

* [SURF Research Access Management (SURF wiki)](https://wiki.surfnet.nl/x/UsLaAQ)
* [SRAM at the University of Twente (incl. eduGAIN and eduID)](https://www.utwente.nl/en/service-portal/research-support/it-facilities-for-research/sram-surf-research-access-management)
* [VU Research Support Handbook: SRAM invitations and eduID](https://rdm.vu.nl/tools/yoda/sram_invitations_eduid_activation.html)
* [SRAM setup guide (service registration, collaborations)](https://sorenwacker.github.io/sram-fastapi/sram-setup/)
* [oauth2-proxy: Keycloak OIDC provider](https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/keycloak_oidc)
