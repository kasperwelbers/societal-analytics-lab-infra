# Migration guide: changing OIDC providers

This guide is for teams that move their AmCAT or AnnoTinder server to a different OIDC provider, for instance from our [shared OIDC provider](./auth-install.md#option-1-our-shared-oidc-provider) to their institution's provider. The person hosting the server is responsible for the migration.

## Why migration needs care

The OIDC provider is the source of truth for the identity of a user. Our software identifies users by the combination of `iss` (the provider) and `sub` (the user at that provider), not by email address (see [IBAC](./auth.md#authorization)). A new provider means a new `iss` and new `sub` values, so without a migration the server will not recognize existing users, and all their roles are lost.

There are two strategies:

| | Account linking | JIT re-claiming |
| --- | --- | --- |
| **How users keep their account** | They link their new login while still logged in with the old one | They log in with the new provider and re-claim their account via their email address |
| **Relies on email** | No | Yes |
| **Both providers needed** | Yes, during a transition period | No |
| **Effort for users** | One extra login during the transition period | None |
| **Best for** | Servers with important data, including moving from our shared provider while it is still available | Servers without sensitive data, or when the old provider is no longer available |

## Account linking

Account linking is the industry standard way to migrate. A user can have multiple login identities (see the `identities table` in [IBAC](./auth.md#authorization)), so a user can add their new login to their existing account. Because the user is authenticated at both providers when linking, email plays no role.

**Steps**

1. Register your server at the new provider, and check it against the [checklist](./auth-install.md#checklist-for-your-own-provider).
2. Move the current provider settings to the `OIDC_PREVIOUS_*` variables, set the new provider in the `OIDC_*` variables, and choose an end date in `OIDC_PREVIOUS_UNTIL` (e.g. three months ahead). See [Configuration](./auth.md#configuration).
3. Users can now log in with either provider. Users who log in with the old provider are asked to link their new login: they sign in at the new provider, and the server adds the new identity to their account.
4. Remind users before the end date. Server admins can see which users have not linked yet.
5. After `OIDC_PREVIOUS_UNTIL`, the old provider is no longer accepted. Remove the `OIDC_PREVIOUS_*` variables. Users who did not link can still re-claim their account (see below).

## JIT re-claiming

With JIT re-claiming, the server forgets the old identities, and users re-claim their account based on their verified email address, using the same [JIT account claiming](./auth.md#authorization) mechanism we use for invitations.

**Steps**

1. Register your server at the new provider, and check it against the [checklist](./auth-install.md#checklist-for-your-own-provider).
2. Set the new provider in the `OIDC_*` variables.
3. ==TODO: admin command that removes all identities, turning existing users into shadow users that can be claimed by email.==
4. Users log in with the new provider. If their verified email address matches an existing user, they claim that account.

**Risks**

Re-claiming relies on email ownership. Someone who controls a user's email address at the new provider (for instance after an address was reassigned) can claim that user's account and roles. Our safeguards limit this: email verification is required, roles of dormant users are disabled, and unclaimed accounts expire after 3 months. But the risk is not eliminated, so prefer account linking for servers with important data.

For a server without sensitive data (e.g. a teaching server) this is usually acceptable. It is also the fallback for users who missed the account linking transition period.

## Upstream federation does not keep identities

It may seem possible to avoid migration by letting the new provider federate with the old one. This does **not** by itself keep the `iss` and `sub` values the same: the new provider issues tokens with its own `iss`, and generates its own `sub` (in Authentik, for instance, based on its own user ID or a configured attribute). So federation still requires one of the two strategies above.
