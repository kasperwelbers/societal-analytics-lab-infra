# Privacy statement template for self-hosted servers

This template is for teams that host AmCAT or AnnoTinder themselves. The team hosting a server (or its institution) is responsible for the personal data on that server, and should provide its own privacy statement. Adapt this template to your situation, replace everything in `[brackets]`, and have it checked by your institution's privacy officer.

Our own [privacy statement](./privacy.md) for the services the lab operates can serve as an example.

---

## Privacy statement: [name of your server]

**Version:** [date]

This privacy statement explains how [your team / institution] handles personal data on [server URL], an [AmCAT / AnnoTinder] server.

### Who is responsible

| | |
| --- | --- |
| **Controller** | [Institution and team] |
| **Contact** | [Contact email] |
| **Data protection officer** | [Your institution's data protection officer] |

### Which personal data we process

| Data | Source | Purpose |
| --- | --- | --- |
| Name, email address, and whether the email address is verified | The login provider ([name of your OIDC provider]) | Identifying users, and assigning access rights |
| Login identifier | The login provider | Recognizing returning users |
| Whether two-factor authentication was used, and when the user last logged in | The login provider | Protecting sensitive actions |
| Roles and access rights | Assigned by project admins | Deciding who may access what |
| Security logs (e.g. IP address, browser, actions, timestamps) | The server | Security and investigating incidents |
| API keys (stored hashed) | Created by the user | Access from R or Python clients |

We do not receive or store your password or second factor: these stay with the login provider.

### Legal basis

[To be determined with your privacy officer, e.g. a task in the public interest (education and research) or legitimate interest (security).]

### Research data

[Describe who is responsible for data that users upload to projects, and which agreements apply, e.g. data management plans or processing agreements.]

### Who we share data with

| Recipient | Why |
| --- | --- |
| [Your OIDC provider] | Logging in |
| [Your hosting provider] | Hosting the server |

[If you use the Societal Analytics Lab's shared OIDC provider: mention that the lab operates the login service, and link to the lab's [privacy statement](./privacy.md#shared-oidc-provider).]

### Retention

| Data | Retention |
| --- | --- |
| Account data | [Period] |
| Security logs | [Period] |
| Research data | [As agreed with the research project] |
| Backups | [Period] |

### Your rights

You have the right to access, correct, and delete your personal data, to restrict or object to its processing, and to receive your data in a portable format. Contact us at [contact email]. You can also file a complaint with [your national data protection authority].
