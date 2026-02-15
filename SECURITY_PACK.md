# Fodda Enterprise Security Pack
**Revision**: February 2026 | **Status**: Draft | **Version**: 1.1

---

## 1. Executive Summary

Fodda is a high-performance knowledge graph platform designed for enterprise intelligence. Our Model Context Protocol (MCP) implementation is architected with a "Security-First" philosophy, specifically tailored to the requirements of Global 2000 procurement and information security (InfoSec) teams.

This Security Pack outlines the controls, governance, and architectural decisions that ensure your proprietary data remains private, your queries remain confidential, and your AI interactions remain deterministic.

## 2. Core Security Pillars

### 2.1 Private-by-Default & Stateless Architecture
Fodda does **not** ingest client proprietary data into its primary knowledge graphs. We provide access to curated, validated intelligence.
- **Stateless Operation**: The MCP server is purely transactional. It does not write to local storage, does not persist temporary files, and has no persistent database connection.
- **Zero-Retention Core**: Prompt text and structured response bodies are handled in-memory and are never persisted by the proxy or the backend.
- **No Training**: Fodda does **not** train its underlying models or graph algorithms on client queries or results.

### 2.2 Model B Deployment (Customer-Managed)
For full network control, Fodda recommends the **Model B** deployment pattern. In this model, the MCP proxy is hosted within the customer's own Virtual Private Cloud (VPC) or Google Cloud project.

- **Network Isolation**: The MCP server lives behind your firewall, communicating only with authorized LLM endpoints (e.g., Vertex AI) and the Fodda API.
- **Identity Control**: You manage the IAM roles and service accounts that permit the LLM to access the MCP server.

### 2.3 Deterministic Safety & Parameter Guardrails
All enterprise requests through the MCP layer are hardcoded to `X-Fodda-Mode: deterministic`.
- **Exfiltration Prevention**: By forcing deterministic responses, Fodda eliminates the risk of "prompt injection" or "model hallucinations" being used to manipulate the API into leaking unintended data.
- **Defense in Depth (MCP Layer)**: Even if the underlying API permits higher limits, the MCP proxy enforces strict local caps on traversal depth (max 2) and result sizes (max 50) to prevent resource exhaustion or bulk data exfiltration.
- **Reproducibility**: Every query yields identical results across identical data states, simplifying audit and compliance workflows.

---

## 3. Data Governance & Privacy

| Control | Description | Status |
| :--- | :--- | :--- |
| **Data Residency** | Hosted on SOC2-compliant GCP regions (US-Central). | ✅ |
| **Transit Encryption** | TLS 1.2+ for all API and MCP communications. | ✅ |
| **Metadata Logging** | Logs capture latency and status; **no query/result text**. | ✅ |
| **Tenant Isolation** | Logical separation enforced via graph-level and key-level scoping. | ✅ |

---

## 4. Operational Security Detail

### 4.1 Authentication & Authorization
The Fodda MCP server utilizes a dual-layer authentication model:
1. **API Key Integration**: Every request must include a Fodda API Key, which determines the graphs and data sets accessible to that session.
2. **User Identity Tracking**: The `userId` parameter is mandatory for all tool calls, allowing for granular audit trails within your own logging infrastructure.

### 4.2 Logging & Auditability
The MCP server emits structured JSON logs. These logs are designed to provide full visibility into usage without exposing sensitive information.
```json
{
  "event": "mcp.tool_call",
  "tool": "search_graph",
  "graphId": "enterprise-graph-01",
  "userId": "analyst-789",
  "status": 200,
  "durationMs": 112,
  "billable_units": 1,
  "deterministic": true
}
```

### 4.3 Rate Limiting & DoS Protection
Standard rate limits are applied at the Fodda API gateway to prevent resource exhaustion and ensure high availability for all enterprise tenants. Custom tiering is available for high-frequency trading or real-time monitoring use cases.

---

## 5. Compliance & Regulatory Alignment

Fodda is committed to maintaining the highest standards of regulatory compliance and data protection.

### 5.1 GDPR & CCPA
- **Data Processor Role**: Fodda acts as a Data Processor under GDPR/CCPA. We do not process sensitive personal information (SPI) or personally identifiable information (PII) beyond what is required for authentication and billing (API keys and user IDs).
- **Data Subject Rights**: We support all standard data subject requests in alignment with our enterprise DPAs.

### 5.2 SOC2 Type II
- **Current Status**: Fodda operates in a SOC2 Type II compliant environment.
- **Reporting**: Full SOC2 reports and bridge letters are available for review by enterprise security teams under a standard Non-Disclosure Agreement (NDA).

### 5.3 Vulnerability Management
- **CI/CD Security**: Every build of the MCP server undergoes automated dependency scanning (SCA) and container vulnerability scanning.
- **Vulnerability Disclosure**: We maintain a coordinated disclosure program to ensure any identified security issues are remediated rapidly.

---

## 6. Infrastructure Security

The Fodda MCP server is designed for modern, containerized environments (GCP Cloud Run, AWS Fargate, or Kubernetes).

- **Hardened Images**: We use minimalist base images (Distroless or Alpine) to reduce the attack surface.
- **Non-Root Execution**: The server process runs as a non-privileged user.
- **Read-Only Filesystem**: The proxy is designed to run in a read-only environment, preventing local persistence or file-based exfiltration.

---

## 7. Next Steps for Procurement

To move forward with a technical security review, please request:
1. **Model B Deployment Manifest**: For GCP Cloud Run / Vertex AI integration.
2. **Current SOC2 Report**: Via our security portal.
3. **Data Processing Addendum (DPA)**: Standard agreement for enterprise signatures.

**Security Office**: [security@fodda.ai](mailto:security@fodda.ai)  
**Technical Support**: [support@fodda.ai](mailto:support@fodda.ai)
