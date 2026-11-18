# Hosted services

The services the lab runs, where they run, and how users log in. The [privacy statement](../policies/privacy.md) and the [acceptable use policy](../policies/aup.md) apply to all of them.

| Service | What it does | For | Runs on | Login | Data it handles |
| --- | --- | --- | --- | --- | --- |
| **Whisper** | Transcription of audio | Lab members | [Lab server](./lab.md), `whisper.lab.societal-analytics.nl` | The lab login | Audio files and transcripts |
| **Ollama** | Language models (LLMs) | Lab members | [Lab server](./lab.md), ==TODO: address== | ==TODO: the lab login, or its own== | Prompts and outputs |
| **Scriptorium** | ==TODO== | ==TODO== | ==TODO== | ==TODO== | ==TODO== |
| **AmCAT** | Storing, managing and sharing research data ([AmCAT](../amcat.md)) | Researchers, also outside the lab | A [service VM](./service-vms.md), with its data on the [database server](./database.md) | Its own login, through Keycloak | Research data uploaded to projects (may contain personal data) |
| **AnnoTinder** | Annotating research data ([AnnoTinder](../annotinder.md)) | Researchers, also outside the lab | ==TODO== | Its own login, through Keycloak | Research data and annotations |

All data is processed on the lab's own servers, on VU premises or in VU SciCloud. How long inputs and outputs are kept: ==TODO== (see [Open points](../index.md#open-points)).

The login service itself, Keycloak, is part of the infrastructure: [Keycloak VM](./keycloak.md).
