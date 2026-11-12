# Privacy statement: Societal Analytics Lab services

!!! warning "Draft"
    This is a draft, to be reviewed by the VU privacy officer before use. Items marked TODO still need to be filled in or confirmed.

**Version:** draft, November 2026

This privacy statement explains how the Societal Analytics Lab handles personal data in the services that the lab operates. It supplements the general privacy statement of Vrije Universiteit Amsterdam ==TODO: link to the VU privacy statement==.

This statement does **not** apply to AmCAT or AnnoTinder servers that are hosted by other teams. The team hosting such a server is responsible for it, and should provide its own privacy statement (see the [template](./privacy-template.md)).

## Who is responsible

| | |
| --- | --- |
| **Controller** | Vrije Universiteit Amsterdam (VU), Societal Analytics Lab ==TODO: faculty / department== |
| **Contact** | ==TODO: lab contact email== |
| **Data protection officer** | VU data protection officer ==TODO: contact details== |

## Services covered

| Service | What it does | Service-specific data |
| --- | --- | --- |
| **AmCAT** (lab server) | Storing, managing and sharing research data | Data that users upload to projects (see [Research data](#research-data)) |
| **AnnoTinder** (lab server) | Annotating research data | Data that users upload, and their annotations |
| **Whisper** | Transcription of audio | Audio files and transcripts, processed on lab hardware |
| **Ollama** | AI inference with language models | Prompts and outputs, processed on lab hardware |
| **Shared OIDC provider** (ZITADEL) | Login service for teams hosting our software | Accounts of users in the organizations at the provider (see [Shared OIDC provider](#shared-oidc-provider)) |

## Which personal data we process

| Data | Source | Purpose |
| --- | --- | --- |
| Name, email address, and whether the email address is verified | The login provider (OIDC) | Identifying users, and assigning access rights |
| Login identifier (`iss` + `sub`) | The login provider (OIDC) | Recognizing returning users |
| Whether two-factor authentication was used, and when the user last logged in | The login provider (OIDC) | Protecting sensitive actions |
| Roles and access rights | Assigned by project admins | Deciding who may access what |
| Security logs (e.g. IP address, browser, actions, timestamps) | Our servers | Security, rate limiting, and investigating incidents |
| API keys (stored hashed) | Created by the user | Access from R or Python clients |
| Optional profile details | Provided by the user at registration | ==TODO: which details, if any== |

We do not receive or store your password or second factor: these stay with the login provider.

## Legal basis

==TODO: to be confirmed by the VU privacy officer.== Most likely, the processing of account data and security logs is necessary for the performance of a task in the public interest (education and research, GDPR article 6(1)(e)), or for the legitimate interest of securing our services (article 6(1)(f)).

## Research data

AmCAT and AnnoTinder store data that users upload to research projects. That data may contain personal data (e.g. social media posts or interview transcripts). For this data:

* The research project (or its institution) is responsible for having a legal basis and the required agreements, such as a data management plan or a data processing agreement.
* The lab processes the data only to provide the service, and only as instructed by the project.
* Project admins decide who has access to the project's data.

==TODO: confirm with the VU privacy officer whether a standard processing agreement is needed for projects from other institutions.==

## Shared OIDC provider

The lab offers a [shared OIDC provider](../auth-install.md#option-1-our-shared-oidc-provider) for teams that host our software themselves. For accounts at this provider:

* The lab processes account data (name, email address, login and 2FA settings, security logs) to provide the login service.
* Each organization at the provider is managed by its own owner, who invites users and can reset their second factor.
* The team hosting a server that uses the shared provider is responsible for that server, and for the data in it.

## Who we share data with

| Recipient | Why |
| --- | --- |
| The login provider (e.g. SURF, or ZITADEL for the shared provider) | Logging in. The login provider has its own privacy statement. |
| ==TODO: hosting providers (e.g. SURF for SciCloud)== | Hosting our servers |

We do not sell personal data, and do not share it for advertising. ==TODO: confirm that no data is transferred outside the EU/EEA (relevant if the shared provider runs on ZITADEL Cloud).==

## Retention

| Data | Retention |
| --- | --- |
| Account data | As long as the account is active, and ==TODO: period== after the last login |
| Security logs | ==TODO: period (e.g. 6 or 12 months)== |
| Research data | As agreed with the research project |
| Whisper and Ollama inputs and outputs | ==TODO: e.g. deleted after processing, or after a fixed period== |
| Backups | ==TODO: backup retention period== |

## Security

* All traffic is encrypted (HTTPS).
* Sensitive actions require two-factor authentication (see the [Authentication standard](../auth.md)).
* API keys are stored hashed.
* Servers are backed up daily to a university NAS.

## Your rights

You have the right to access, correct, and delete your personal data, to restrict or object to its processing, and to receive your data in a portable format. Contact us at ==TODO: lab contact email==. If you are not satisfied with how we handle your request, you can contact the VU data protection officer, or file a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).

## Changes

We may update this privacy statement. The version and date are shown at the top of this page, and the history of changes is available in the [repository of this documentation](https://github.com/kasperwelbers/societal-analytics-lab-infra).
