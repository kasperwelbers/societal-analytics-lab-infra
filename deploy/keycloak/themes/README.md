# Themes

Keycloak themes for the login pages, the account console and emails. Only texts, CSS and images: no page templates (`.ftl`), except `footer.ftl`, which Keycloak provides for this purpose. Templates change between Keycloak versions; texts and CSS rarely do.

| Theme | Type | Used by | What |
| --- | --- | --- | --- |
| `sal` | login | (parent of the others) | Logo, favicon, colours, the footer link |
| `sal-admin` | login | `master` | Subtitle "Administration" |
| `sal-lab` | login, email | `lab` | Subtitle "Lab account", and the texts for members (first time, set your lab password) |
| `sal-idp` | login | `idp` | Subtitle "Identity provider", and the consent screen ("Allow ... to use your account?", what the app will see: email address, 2FA, and the name only for apps that ask; Allow / Don't allow) |
| `sal` | account | all realms | Logo in the account console |

* **Texts** are in `messages/messages_en.properties`. The keys are Keycloak's own: see `theme/base/login/messages/messages_en.properties` in the `org.keycloak.keycloak-themes` jar of the Keycloak version in use.
* **Realm overrides** (**Realm settings → Localization → Realm overrides**) take precedence over the theme: handy for a quick change, but put lasting changes here.
* **The logo** is in two places, because each theme type has its own folder: `sal/login/resources/img/logo.svg` and `sal/account/resources/logo.svg`. `sal/login/resources/img/favicon.ico` is made from it.
* **A single quote** in a text must be written twice (`Don''t`), or it disappears.
* **After a change:** restart Keycloak (`sudo docker compose restart keycloak`); it caches themes.
* **After a Keycloak upgrade:** check the login pages. Keys that were renamed fall back to Keycloak's own text.
