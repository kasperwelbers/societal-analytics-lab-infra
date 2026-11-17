# Realm files

`master-realm.json`, `lab-realm.json` and `idp-realm.json` are complete realm files in Keycloak's own export format. Keycloak imports them when it starts (`--import-realm`), but only realms that don't exist yet: an existing realm is never changed. See runbook step 7 in `docs/keycloak-deploy.md`, and the overview in `docs/keycloak.md`.

* **Values from `.env`** are written as placeholders: `${SMTP_FROM}`, `${SMTP_FROM_NAME}`, `${APPS_HOSTNAME}`, `${APP_REGISTRATION_CLIENT_SECRET}`, and `${IDP_GOOGLE_CLIENT_ID}`, `${IDP_GOOGLE_CLIENT_SECRET}`, `${IDP_GITHUB_CLIENT_ID}`, `${IDP_GITHUB_CLIENT_SECRET}`. Keycloak doesn't start while one of them is missing. (Lower-case placeholders, e.g. `${role_admin}`, are Keycloak's own texts.)
* **Not in the files:** users, clients of our deployments (created in the admin console, runbook step 8), signing keys and IDs. Keycloak creates the keys and IDs on import.
* **After a change:** run `python3 check-realms.py` (from `deploy/keycloak`). It catches flow mistakes that Keycloak accepts silently.

Most of each file is Keycloak's defaults. What we changed:

## All realms

| Setting | Value | Why |
| --- | --- | --- |
| `registrationEmailAsUsername`, `loginWithEmailAllowed` | true | The email address is the username |
| `passwordPolicy` | `length(10) and upperCase(1) and digits(1) and notUsername and notEmail` | At least 10 characters, an uppercase letter and a digit |
| `accessCodeLifespanUserAction` | 1800 | "Login action timeout": 30 minutes for each page of the login, e.g. to set up 2FA and save the recovery codes |
| `ssoSessionIdleTimeout`, `ssoSessionMaxLifespan` | 1800 (master: 1800 and 28800) | Sessions at Keycloak; applications keep their own |
| `bruteForceProtected`, `eventsEnabled`, `adminEventsEnabled` | true; events kept 90 days | |
| `loginTheme`, `accountTheme`, `emailTheme` | `sal-admin` / `sal-lab` / `sal-idp`, account `sal`, email `sal-lab` (lab) | Our themes in `themes/` (logo, colours, texts) |
| `displayName` | "Societal Analytics Lab" (lab), "... identity provider" (idp), "... administration" (master) | Shown in the browser tab and in emails; `displayNameHtml` is empty (the themes show the logo and name) |
| `rememberMe` | false (lab: true) | lab: **Remember me** on the login page; `ssoSessionIdleTimeoutRememberMe` 7 days, `ssoSessionMaxLifespanRememberMe` 30 days |
| `actionTokenGeneratedByUserLifespan` | 1800 (lab, idp) | Email links (forgot password, verify email) valid 30 minutes instead of 5 |
| Required action priorities | `UPDATE_PASSWORD`, `VERIFY_PROFILE`, `UPDATE_PROFILE`, `CONFIGURE_TOTP`, `CONFIGURE_RECOVERY_AUTHN_CODES`: 51-55 | Keycloak runs pending required actions in this order: after the email link, first the password, then the name, then 2FA (by default, OTP setup came before the password) |
| `webAuthnPolicyPasswordlessPasskeysEnabled` | true | "Enable passkeys": users can sign in with only a passkey, which counts as 2FA (see the flows below) |
| client scope `amr` | added to the default scopes | The `amr` claim: `pwd` for a password, `mfa` for a second factor |
| Required action **Configure OTP**: `add-recovery-codes` | true | After setting up an authenticator app, users set up recovery codes (unless they have them) |

## Flows

Each step that counts as a login method has an `amr` setting (`default.reference.value`: `pwd` or `mfa`). Recovery codes, OTP and passkeys/security keys count as a second factor. A login with only a passkey (on the login page: "Sign in with Passkey", or the browser's suggestion in the email field) counts as 2FA too: a passkey is a device plus fingerprint, face or PIN.

* **`browser-2fa-required`** (master, lab): cookie → external provider redirect → `browser-2fa-required-forms`: password, then the conditional sub-flow `browser-2fa-required-2fa` (only for users with a second factor: OTP, passkey/security key or recovery code), then `browser-2fa-required-setup-otp`, which asks users without a second factor to set up OTP ("Condition - sub-flow executed": the 2FA sub-flow was not executed). This is the pattern "Conditional 2FA sub-flow with OTP default" from the Keycloak documentation. The OTP setup has no `amr` setting: setting up an app is not using it, and Keycloak doesn't record it, so the token of that first login has `pwd` only.
* **After a passkey login** (all three realms): the passkey login happens in the step with the password form, so the 2FA sub-flow is skipped ("Condition - credential": a passkey was used), and so is the OTP setup (the same condition). The sub-flow `browser-2fa-required-passkey` (`browser-2fa-optional-passkey` in idp) only runs after a passkey login, and records `mfa` in `amr` (an "Allow access" step with an `amr` setting). So `amr` is `pwd` + `mfa`: `pwd` because the passkey was used in the password form step.
* **`browser-2fa-optional`** (idp): the same, without the OTP setup: users with a second factor are asked for it, others are not.
* **`reset-credentials-2fa-required`** (lab) and **`reset-credentials-2fa-optional`** (idp), "forgot password" and the first time: choose user → email link → the sub-flow `...-2fa` (users with a second factor enter it: OTP, security key or recovery code, recorded as `mfa`) → new password; in lab then `...-setup-otp` (users without a second factor set up OTP, "Condition - sub-flow executed" as in the browser flow). The user is logged in at the end. Keycloak's own `reset credentials` flow instead logs the user in after the new password without the second factor, and its "Reset OTP" step lets the user set up a new authenticator app, so an inbox was enough to take over an account. `amr` after a reset: `mfa` with a second factor, otherwise empty (the reset has no `pwd` step).
* **`post-login-2fa-optional`** (idp): after a login with Google or GitHub, which replaces only the password: the second factor, if the user has one. The final "Allow access" step is needed, because a flow in which nothing runs counts as failed.

Copying a flow in the admin console keeps the old flow name in "Condition - sub-flow executed". `check-realms.py` checks these names in the files.

## master

* No email server, no external login providers, no registration, no "forgot password": admin access doesn't depend on an inbox or anyone's Google account. Recovery goes through the VM.
* `verifyEmail` false: without an email server, verification would lock admins out.
* Required action **Update email** off: together with email as username, it would make accounts without an email address (the temporary admin, recovery admins) "not fully set up", and `admin-cli.sh` could no longer log in with them.

## lab

* By invitation only (`registrationAllowed` false), with institutional email addresses: no Google or GitHub login.
* New members are imported without a password, and set one themselves with "forgot password". The theme `sal-lab` adapts the texts for them ("Sign in with your lab account", "First time, or forgot your password?", "Set your lab password", ...): see `themes/README.md`.
* `verifyEmail`, `resetPasswordAllowed`: true.
* Email through the relay (`smtpServer`: host `mail-relay`, port 587, no login).
* Required action **Update email** on, and `editUsernameAllowed` true (needed for the "Update email" button in the account console): users change their address there, and it only changes after they confirm the new address.

## idp

* Open registration (`registrationAllowed` true), `verifyEmail`, `resetPasswordAllowed`, email through the relay, and **Update email** as in lab.
* **Google** (`trustEmail` true, PKCE) and **GitHub** (`trustEmail` false: Keycloak verifies the address itself), with the default first broker login flow and `post-login-2fa-optional`.
* **Default client scopes** (for new clients): only `email`, `amr`, `basic` (`sub`, `auth_time`), `acr` and `web-origins` (plus the SAML defaults); no `profile` or `roles`, and no optional scopes. Servers get the email address, `email_verified` and `amr`, and no name. The scope `amr` is shown on the consent screen (`consent.screen.text` `${amrScopeConsentText}`); the texts are in the theme `sal-idp`. Keycloak's built-in clients (e.g. the account console) keep their own scopes. A login that requests another scope (e.g. `profile`) is refused with `invalid_scope`.
* **Client policy `deployment-clients`** (profile and policy of the same name): applies to confidential clients that admins create or change (conditions `client-updater-context` = by authenticated user, and `client-access-type` = confidential; Keycloak's public built-in clients are not affected). It turns on consent and PKCE automatically (`auto-configure`), and refuses `http://`, wildcards and other unsafe redirect URIs. PKCE is also checked at every login of these clients. See runbook step 8.
