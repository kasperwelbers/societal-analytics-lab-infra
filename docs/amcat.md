# AmCAT

AmCAT (**Am**sterdam **C**ontent **A**nalysis **T**oolkit) is an open-source tool for storing, managing, and analyzing research data. 

The architecture centers on a Caddy proxy that handles SSL termination and routing. The FastAPI backend 

```mermaid
graph TD
    User((Public/Researcher)) -->|HTTPS| Caddy[Caddy Proxy]
    
    subgraph SciCloud [SciCloud: AmCAT]
        Caddy -->|/| Frontend[SPA Frontend]
        Caddy -->|/api + API key 🔑| Backend[FastAPI Backend]
        Frontend -->|session cookie + CSRF 🔑| Backend
    end

    subgraph Storage [Physical Server: Data Storage]
        Backend -->|HTTPS + 🔑| ES[(ElasticSearch)]
        Backend -->|HTTPS + 🔑| S3[(S3 Object Storage)]
    end

    subgraph Auth [Delegated]
        Backend -.->|OIDC Handshake| IdP{OIDC Provider}
        IdP -.->|JWT w/ 2FA Claim| Backend
    end
    
    %% Connections for direct S3 access mentioned earlier
    Caddy -->|/s3 + pre-signed URL 🔑| S3
```

### Infrastructure Details
* **Proxy:** Caddy serving on Port 443.
* **Frontend:** Vite-built React SPA served at `/`.
* **Backend API:** FastAPI server mounted at `/api`.
* **Authentication:** OIDC Handshake through Backend; tokens set as signed, http-only session cookie
* **Data Storage (ES):** ElasticSearch, used for both metadata and primary textual data storage.
* **Object Storage (S3):** S3-compatible storage for large files.
* **Deployment Note:** FastAPI, ElasticSearch, and S3 are decoupled and may reside on different physical or virtual servers.

### Data Risks & Compliance
| Field | Value |
| :--- | :--- |
| **Data Category** | GDPR Cat 3 (PII & Research Data) |
| **Exposure Method** | Caddy Proxy (HTTPS) |
| **Authentication** | External OIDC (Delegated) |
| **Authorization** | FastAPI backend controlls all DB access |
| **2FA Status** | **Enforced by IdP** (Sufficient for Lab Policy) |
| **Storage** | ElasticSearch + S3 |
| **Backup** | Daily snapshot to University NAS |

---
**Technical Notes:** 

* Authentication is verified via JWT tokens. OIDC provider set to enforce 2FA, and Backend checks 2FA claims to verify.

* Browser authenticates via session cookie (signed, http-only, samesite lax) and CSRF token (signed double submit pattern)
