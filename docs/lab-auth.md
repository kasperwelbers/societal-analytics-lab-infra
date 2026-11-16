# Lab authentication

**Status: decided.** The lab uses the `lab` realm of our Keycloak: invitation only, institutional email addresses, password and mandatory 2FA, no Google or GitHub (see [Keycloak setup](./keycloak.md)). Institutional login (SURF SRAM) may be added later as a login option of that realm.

This page is about authentication for the lab's own infrastructure: our own AmCAT and AnnoTinder servers, and the AuthWall in front of services without their own login (Whisper, Ollama). It is not about the [shared OIDC provider](./auth-install.md#option-1-our-shared-oidc-provider) for other teams: that is the `idp` realm on the same Keycloak, a separate realm that is open to the public and isolated from `lab`.

## What we need

* **Meets our [Authentication standard](./auth.md):** verified email (`email_verified`), a 2FA signal (`amr`), and step-up (`max_age`, `auth_time`). The `lab` realm provides all three.
* **Forward auth** for services without their own login (the AuthWall).
* **External collaborators:** researchers from other institutions, including abroad, and guests without an institutional account. For now, they get an account in the `lab` realm by invitation.
* **Little maintenance,** and a clear route for account recovery: lab admins can reset a member's second factor.

Which options were considered, and why we chose Keycloak: see the [decision](./auth-providers.md#decision).

## The AuthWall

Caddy `forward_auth` with [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/), which handles the OIDC login against the `lab` realm and the session for services without their own login.

## Later: institutional login via SRAM

SURF Research Access Management (SRAM) is SURF's service for research collaborations: members log in with their own institution (VU, or other institutions worldwide via eduGAIN), or with eduID if they have no institutional account. The VU already uses SRAM, for instance for Yoda.

Keycloak can offer SRAM as a login option of the `lab` realm (as an external OIDC provider), so lab members and collaborators could log in with their institution, while our services keep talking to Keycloak, with the same claims. Open questions before we do that:

* Does SRAM's ID token include `email_verified`, a 2FA signal (`amr`/`acr`), and `auth_time`, and does it honour `max_age`? If SRAM enforces 2FA but doesn't signal it, the `lab` realm would still ask for its own second factor.
* SRAM depends on the VU: we may need to request a collaboration, and service registrations are reviewed. Each service needs a privacy policy and an acceptable use policy (AUP) URL. Drafts: [privacy statement](./policies/privacy.md) and [AUP](./policies/aup.md).

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
