# Lab Infrastructure Registry

This registry serves as the authoritative map for the lab's physical hardware and the research services they host.

---

## 🌐 Infrastructure Landscape
This diagram maps our primary physical servers to the high-level services accessible to researchers.

```mermaid
graph TD
    User((Researcher)) -->|HTTPS| SciCloud
    User -->|HTTPS| AuthWall{Auth Proxy / OIDC}
    
    subgraph SciCloud [SciCloud]
        AmCAT[AmCAT Suite]
    end
    
    subgraph LabServices [Physical Server 1: LabServices]
        AuthWall
        AuthWall --> Whisper[Whisper AI]
        AuthWall --> Ollama[Ollama LLM]
    end

    subgraph Storage [Physical Server 2: Data Storage]
        ES[(ElasticSearch)]
        S3[(S3 Storage)]
    end


    %% Internal Data Connections
    AmCAT ---|HTTPS + 🔑| ES
    AmCAT ---|HTTPS + 🔑| S3

    %% Clickable Links
    click AmCAT "/amcat" "View AmCAT Technical Docs"
```

---

## 🖥️ Physical Assets & Service Ownership

| Physical Server | Hosted Services | Access Level | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **SciCloud** | **[AmCAT](./amcat.md)** | Public / Auth | Main research application & API. |
| **Data Storage** | **ElasticSearch**, **S3** | Internal Only | Backend storage for text and large files. |
| **LabServices** | **Whisper**, **Ollama** | Public / Auth | GPU-accelerated AI inference & transcription. |

---

## 🔐 Security Standards
* **Edge Security:** No service is exposed via plain HTTP. All traffic is TLS-encrypted.
* **Identity:** We use a "Zero Trust" approach where the Caddy/Nginx proxy validates OIDC tokens before traffic reaches the service.
* **2FA:** Multi-factor authentication is required for all researcher logins via the central Identity Provider.
* **Resilience:** All servers perform daily off-site backups to the University NAS.
