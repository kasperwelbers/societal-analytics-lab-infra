# Lab authentication

**Status: open decision.**

This page is about authentication for the lab's own infrastructure: our own AmCAT and AnnoTinder servers, and the AuthWall in front of services without their own login (Whisper, Ollama). It is not about the [shared OIDC provider](./auth-install.md#option-1-our-shared-oidc-provider) that we offer to other teams. That one runs on ZITADEL, and is kept separate from the lab's own identity provider, because it is open to the public.

## What we need

* **Meets our [Authentication standard](./auth.md):** verified email (`email_verified`), a 2FA signal (`amr`/`acr`), and step-up (`max_age`, `auth_time`).
* **Forward auth** for services without their own login (the AuthWall).
* **External collaborators:** researchers from other institutions, including abroad, and guests without an institutional account.
* **Little maintenance,** and a clear route for account recovery.

## Options

### SURF Research Access Management (SRAM)

SRAM is SURF's service for research collaborations. We register our services, create a collaboration (e.g. "Societal Analytics Lab"), and invite members. Members log in with their own institution (VU, or other institutions worldwide via eduGAIN), or with eduID if they have no institutional account. The VU already uses SRAM, for instance for Yoda.

* **Strengths**
    * Institutional logins, including international collaborators and guests, without managing accounts ourselves.
    * 2FA for everyone: SRAM uses the home institution's 2FA when available, and its own second factor otherwise.
    * No identity provider to maintain, and account recovery goes through the user's institution, eduID or SURF.
* **Weaknesses and open questions**
    * Depends on the VU: we may need to request a collaboration, and service registrations are reviewed.
    * Each service needs a privacy policy and an acceptable use policy (AUP) URL.
    * Less control: we can't reset a member's 2FA ourselves.
    * ==To test:== does SRAM's ID token include `email_verified`, a 2FA signal (`amr`/`acr`), and `auth_time`, and does it honour `max_age`? If SRAM enforces 2FA but doesn't signal it, our standard needs a way to handle that.

### ZITADEL (lab instance)

The same software as our shared provider, but as a separate instance for the lab (on its own VM).

* **Strengths**
    * One software stack for both the lab and the shared provider.
    * Full control, including account recovery and 2FA resets.
    * Signals 2FA via `amr` (to verify).
* **Weaknesses**
    * We maintain it ourselves: updates, backups, availability.
    * External collaborators need an account with us, unless we set up federation with SURFconext or eduGAIN, which is extra work.
    * No forward auth built in: the AuthWall needs oauth2-proxy (see below).

### Authentik (current setup)

Our current lab identity provider. It has forward auth built in (proxy provider) and can serve LDAP. But since we run ZITADEL for the shared provider anyway, keeping Authentik for the lab means maintaining two identity stacks. So we only keep Authentik if we decide against both SRAM and a lab ZITADEL instance.

## The AuthWall

* **With SRAM or ZITADEL:** Caddy `forward_auth` with oauth2-proxy, which handles the OIDC login and session for services without their own login.
* **With Authentik:** Authentik's built-in proxy provider (forward auth).

## Next steps

1. Test SRAM on its acceptance environment (`acc.sram.surf.nl`): register a test service, log in, and check the claims in the ID token against our standard.
2. If SRAM meets the standard (or the gaps can be handled), use SRAM for the lab, and run ZITADEL only for the shared provider.
3. Otherwise, set up a lab ZITADEL instance on a separate VM, and migrate the lab's few Authentik users.

## Sources

* [SURF Research Access Management (SURF wiki)](https://wiki.surfnet.nl/x/UsLaAQ)
* [SRAM at the University of Twente (incl. eduGAIN and eduID)](https://www.utwente.nl/en/service-portal/research-support/it-facilities-for-research/sram-surf-research-access-management)
* [VU Research Support Handbook: SRAM invitations and eduID](https://rdm.vu.nl/tools/yoda/sram_invitations_eduid_activation.html)
* [SRAM setup guide (service registration, collaborations)](https://sorenwacker.github.io/sram-fastapi/sram-setup/)
* [Authentik proxy provider](https://docs.goauthentik.io/add-secure-apps/providers/proxy/)
* [ZITADEL with oauth2-proxy](https://zitadel.com/docs/examples/identity-proxy/oauth2-proxy)
