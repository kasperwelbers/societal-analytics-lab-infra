# Authentication standard

All software developed by the Societal Analytics Lab (AmCAT, AnnoTinder) uses the same approach to authentication. 

## OpenID Connect (OIDC)

OIDC is an open standard for authentication that builds on top of the OAuth 2.0 protocol. It allows clients to verify the identity of users based on the authentication performed by an external identity provider (IdP).
By using OIDC, our software does not handle user authentication directly, but delegates it to an external OIDC provider. 
This is an industry standard, because it outsources the hard part of authentication to a dedicated provider, which is often better equipped to handle it than the application itself.

To host our software, you need to configure an OIDC provider that meets the security requirements of your organization. This can be a commercial provider (e.g., Google, Microsoft, Auth0) or a self-hosted solution (e.g., Keycloak, Dex, Authentik).
However, our software does by default require an OIDC provider and setup that meets the following criteria:

* **2FA (MFA) with step-up authentication**: For certain privileged actions our servers require multi-factor authentication (MFA) with a minimum freshness. The OIDC provider needs to support returning the `amr` claim in the ID token, and support step-up authentication. This can be disabled by setting the `DISABLE_2FA_YOLO` environment variable flag. Use this only as a *convenience* for low-risk servers that use an easy-to-setup OIDC provider without 2FA (e.g. free tier cloud services like Auth0).
* **Email Verification Required**: Our software uses email addresses as the primary identifier for users. The OIDC provider must assert email ownership by returning `"email_verified": true` in the ID token. This has implications for how the OIDC provider is set up. (see ... section). Email verification CANNOT be disabled. 

## API keys

Our software also supports direct API access via API keys. These are application-managed tokens that are decoupled from the OIDC provider. API keys can only be created with an OIDC provider authenticated session, and always have a limited scope. 


## For developers

All software developed by the Societal Analytics Lab needs to follow the following authentication standard. This is to ensure consistency and security across our software stack.

* The server and web client are always hosted on the same domain (same origin). 
* An OIDC provider is used to authenticate the web client. 
* Authorization is handled by the server (not the OIDC provider).
* Other clients (e.g., R or Python clients) can only access the backend via API keys.
* API keys and their scope can only be created and changed by the main web client in an OIDC provider authenticated session.
* The server checks the `amr` claim for sensitive actions, and performs step-up authentication if the claim is missing or does not meet the required freshness. This can only be turned of explicitly by setting the `DISABLE_2FA_YOLO` environment variable flag.
* The server checks the `email_verified` claim to verify that the OIDC provider confirms that the user owns an email address. This cannot be disabled.
* Authorization is handled based on a `role table`, that has the columns:
  * `role`: what role a user has (e.g. READ, WRITE, ADMIN)
  * `context`: the context in which the role applies (e.g. project, server)
  * `user_id`: if not null, the role is linked to a specific identity. (see IBAC)
  * `email_domain`: if not null, the email in the OIDC claim must have this domain. Can be used together with user_id to require both identity and domain (see ABAC)
  * `require_email`: if user_id and email_domain are null, should any user get the role (false) or only users that have a verified email address (true). 
  * `granted_at`: timestamp of when the role was granted (created, updated, or restored) 
* Primary mode of authorization: **Identity Based Access Control (IBAC)**. 
  * Assign roles to registered identities, stored in the `user table`:
    * `id`: unique user ID
    * `email`: email address of the user
    * `iss`: issuer of the OIDC provider
    * `sub`: unique subject identifier of the OIDC provider. 
    * `has_mfa`: whether the user has 2FA enabled on their OIDC provider account
    * `registered_at`: timestamp of when the user first registered
    * `last_login_at`: timestamp of last login
    * `reactivated_at`: timestamp of first login after 1 year of inactivity
    * `...`: optional user details (e.g. added on registration)
  * Any user that signs in is registered, optionally with a form that collects additional information. We use this for security logs and rate limiting, which is legitimate under GDPR. Email addresses add some level of accountability, especially when roles enforce email domains. 
  * The identity is determined by the combination of `iss` and `sub`, NOT BY THE EMAIL ADDRESS. An email address is not a unique identifier, because it can change over time. Users can change email addresses, and their old email addresses can be reassigned. 
  * Changing email addresses is the responsibility of the OIDC provider. When the server authenticates a user and sees that the `email` for a user (`sub + iss`) has changed, it updates the user table.
  * We DO use the email address as a human readable identifier for assigning roles to users (e.g. giving a collegue access to a project in AmCAT). This is safe, because the role is not assigned to the email address itself, but to the user (`iss + sub`) that **currently** owns the email address.
  * We support **Just-In-Time (JIT) account claiming**, which allows roles to be given to an email address that is not yet registered. The role is created for a new **shadow user** that only has an `id` and `email`, and the current owner of this email address is invited to claim this user account and role. This can be an actual invitation or just happen automatically on next sign in or registration.
  * There are two safeguard needed to prevent giving a role to a previous or future owner of an email address. A role is NOT given to an account if one of the following conditions is true:
    * **Dormant users**: `role.granted_at < user.reactivated_at AND NOT user.has_mfa`. If a user did not use 2FA, the OIDC provider only verifies current ownership of the email address. So after a period of inactivity we disable roles assigned before reactivation. Access can be restored per role (e.g. AmCAT project ADMIN refreshes `granted_at`) or by a server admin.
    * **Shadow account role expired**: `roles.granted_at > users.registered_at + INTERVAL '3 months'`. When an unregistered email is given a role, it needs to be claimed within 3 months, to prevent unclaimed roles being claimed by future owners of the email address. Expired invitations can either be removed, or be restored by updating the `granted_at` timestamp. 
* Secondary mode of authentication: **Attribute Based Access Control (ABAC)**. 
  * We also allow assigning roles based on user attributes from OIDC claims. We currently only use the email claim, because this keeps the role of the OIDC provider restricted to authentication and email verification. As mentioned in IBAC, emails are not identities, but attributes. These are not just alternatives for authorization, but serve different purposes.
    * Identities (IBAC) are tied to specific users. This lets them keep their roles when they change email addresses, which is important for long-term projects and collaborations where researchers may change institutions.
    * Attributes (ABAC) are properties of users that can change. This allows us to give and take away access based on their current situation, such as their affiliation to an institution. This check can also be added on top of IBAC, to require both identity and attribute for a role.
  * We currently only use email domain as an attribute, because this keeps the role of the OIDC provider restricted to authentication and email verification. We could decide to include custom attributes in the future (e.g. if a server uses an OIDC provider that provides eduPerson claims)
  * Email domains can be a useful attribute for convenience and security. 
    * Convenience: it's convenient to give access to anyone that has an institutional email address, rather than giving them all individual access. Note that this should have limited privileges (never ADMIN access).
    * Security: setting an email domain requirement can be used to restrict access to a specific, trusted institution. This can also be done in addition to IBAC, so that access is restricted to a trusted person that also has a verified email address with a specific domain. 
    
    
### Self-hosting and OIDC Provider Requirements

If you self-host our software, you can choose an OIDC provider that meets the security requirements of your organization (e.g. GDPR, 2FA).
This can be a commercial provider (e.g., Google, Microsoft, Auth0) or a self-hosted solution (e.g., Keycloak, Dex, Authentik).
There are two requirements that all OIDC providers must meet to be compatible with our software, one strict and one recommended. 

* **strict**. Our software always checks the `email_verified` claim to verify that the OIDC provider confirms that the user owns an email address. This cannot be disabled.
* **recommended**. Our software checks the `amr` claim to verify that the OIDC provider supports multi-factor authentication (MFA, 2FA), and uses step-up authentication for sensitive actions. Both must be supported. If this is not possible (e.g., using the Auth0 free tier), you can disable this check with the `DISABLE_2FA_YOLO` environment variable flag, but only do so on low-risk servers.

| OIDC Provider | 2FA Support | Email Verification Support | GDPR Compliant | Cost | Ease of Setup | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Google Consumer (`@gmail.com`)** | Yes | Yes | **No** (for institutional use) | Free | Easy | No DPA or institutional guarantees; consumer terms apply. |
| **Google Workspace / Entra ID** | Yes | Yes | **Yes** | Paid (Institutional) | Hard (Admin setup) | Proper enterprise/institutional contracts and DPAs. |
| **Auth0 Free Tier** | No | Yes | **No** (for production use) | Free (limited) | Easy | Lacks enterprise SLAs, formal DPAs, and compliance vetting. |
| **Auth0 Paid Tier** | Yes | Yes | **Yes** | Paid | Easy | Includes enterprise agreements, SLAs, and DPA. |
| **Self-Hosted (Keycloak, Authentik, Dex)** | Yes | Yes | **Yes** (when hosted on-prem/EU cloud) | Hosting cost / labor | Medium | Full data sovereignty; fully compliant for university research environments. |



### Changing OIDC providers

Changing OIDC providers is a tricky thing. ==This was one of the main reason for considering doing the second factor on the server instead of the OIDC provider==.

The main problem is that the OIDC provider is the source of truth for the identity of a user. If you change OIDC providers, the `iss` and `sub` claims will change, and the server will not recognize the user anymore. This means that all roles and permissions assigned to that user will be lost.

The easy solution is resetting the *iss* and *sub* claims for all users, and use the JIT account claiming mechanism described above. 
Since we do require email verification, disable roles for dormant users, and require accounts to be claimed within 3 months, the risk is limited, but not eliminated.

The correct solution is to use an OIDC provider that supports upstream federation, and configure it to federate with the old OIDC provider. This way, the `iss` and `sub` claims will remain the same, and the server will recognize the user as the same identity.

==Supposedly this is a pretty standard feature of OIDC providers, but I have not tested it yet.==
