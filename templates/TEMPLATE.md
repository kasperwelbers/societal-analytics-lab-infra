# [Service name]
**Status:** 🟢 Production

### Network Flow
```mermaid
graph LR
    User((Public)) -->|Port 443| CF[Cloudflare Tunnel]
    CF -->|Docker Network| Nginx[Nginx Proxy]
    Nginx -->|Internal Port| App[Service App]
    App --> DB[(Database)]
    
    subgraph Security
    Nginx -.-> Auth{Authelia/2FA}
    end
```

### Data Risks
| Field | Value |
| :--- | :--- |
| **Data Category** | GDPR Cat 3 (PII) |
| **Backup** | Daily to Uni NAS |
| **Auth Type** | LDAP + 2FA |
