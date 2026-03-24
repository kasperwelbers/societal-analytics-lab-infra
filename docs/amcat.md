# AmCAT

AmCAT (AMsterdam Content Analysis Toolkit) is an open-source tool for storing, managing, and analyzing research data. 

The architecture centers on a Caddy proxy that handles SSL termination and routing. The FastAPI backend orchestrates data across distributed storage layers.

```mermaid
graph TD
    User((Public/Researcher)) -->|HTTPS:443| Caddy[Caddy Proxy]
    
    subgraph "Frontend Layer"
        Caddy -->|/| Vite[Vite Static Client]
    end

    subgraph "Application Layer"
        Caddy -->|/api| FastAPI[FastAPI Backend]
    end
    
    subgraph "Storage Layer (Distributed)"
        FastAPI --> ES[(ElasticSearch)]
        FastAPI --> S3[(S3 Object Storage)]
    end

    subgraph "Authentication Flow"
        FastAPI -.->|OIDC Handshake| IdP{OIDC Provider}
        IdP -.->|JWT w/ 2FA Claim| FastAPI
    end
    
    note1[ES: Metadata & Textual Data]
    note2[S3: Large-scale Research Files]
    ES -.-> note1
    S3 -.-> note2
```

### Infrastructure Details
* **Proxy:** Caddy serving on Port 443.
* **Frontend:** Vite-built static client served at `/`.
* **Backend API:** FastAPI server mounted at `/api`.
* **Data Storage (ES):** ElasticSearch, used for both metadata and primary textual data storage.
* **Object Storage (S3):** S3-compatible storage for large research files.
* **Deployment Note:** FastAPI, ElasticSearch, and S3 are decoupled and may reside on different physical or virtual servers.

### Data Risks & Compliance
| Field | Value |
| :--- | :--- |
| **Data Category** | GDPR Cat 3 (PII & Research Data) |
| **Exposure Method** | Caddy Proxy (HTTPS) |
| **Authentication** | External OIDC (Delegated) |
| **2FA Status** | **Enforced by IdP** (Sufficient for Lab Policy) |
| **Storage** | ElasticSearch + S3 |
| **Backup** | Daily snapshot to University NAS |

---
**Technical Note:** Authentication is verified via JWT tokens. As long as the OIDC Provider (IdP) enforces 2FA, the AmCAT FastAPI backend is considered protected by 2FA.
