# Lab Infrastructure Registry

This registry serves as the authoritative map for the lab's physical hardware and the research services they host.

---

## 🌐 Infrastructure Landscape
This diagram maps our primary physical servers to the high-level services accessible to researchers.

```mermaid
graph TD
    User((Researcher))
    
    %% Authentication
    subgraph Auth [Cloud or physical server 2]
        IdP{OIDC Provider - Authentik}
    end
    User -.->|OIDC Handshake| IdP
    IdP -.->|JWT w/ 2FA Claim| User

    %% SciCloud Environment
    subgraph SciCloud [SciCloud]
        AmCAT[AmCAT Suite]
    end
    
    %% Physical Server 1
    subgraph LabServices [Physical Server 1: LabServices]
        ProxyLab(Rev Proxy + AuthWall)
        ProxyLab -->|port xxxx| Whisper
        ProxyLab -->|port xxxx| Ollama
    end

    %% Physical Server 2
    subgraph Storage [Physical Server 2: Data Storage]
        ProxyStorage{Reverse Proxy}
        ES[(ElasticSearch)]
        S3[(S3 Storage)]
    end
    

    %% External Incoming Connections
    User -->|HTTPS| AmCAT
    User -->|HTTPS| ProxyLab

    %% Storage Routing (Internal via Proxy)
    AmCAT -->|HTTPS + 🔑| ProxyStorage
    ProxyStorage -->|port xxxx| ES
    ProxyStorage -->|port xxxx| S3

    %% Clickable Links
    click AmCAT "./amcat" "View AmCAT Technical Docs"
```

---

## 🖥️ Physical Assets & Service Ownership

| Physical Server | Hosted Services | Access Level | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **SciCloud** | **[AmCAT](./amcat.md)** | Public / Authentiated | Web Application & API for storing, managing and sharing data |
| **Data Storage** | **ElasticSearch**, **S3** | Internal Only | Backend storage for text and large files. |
| **LabServices** | **Whisper**, **Ollama** | Authenticated | GPU-accelerated AI inference & transcription. |

---

## 🔐 Security Considerations
* **Edge Security:** No service is exposed via plain HTTP. All traffic is TLS-encrypted.
* **Identity:** We use a "Zero Trust" approach where the Caddy/Nginx proxy validates OIDC tokens before traffic reaches the service.
* **2FA:** Multi-factor authentication is required for all researcher logins via the central Identity Provider.
* **Resilience:** All servers perform daily off-site backups to the University NAS.
