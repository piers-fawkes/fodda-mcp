# Fodda MCP — Backburner (Stability Phase)

This document tracks upcoming requirements for enterprise stability, security hardening, and infrastructure readiness.

## MCP — MUST DO (Next)
These items are required before pitching to top-tier infrastructure teams (Publicis, Omnicom, McKinsey, etc.).

### 1. Customer-Managed MCP Deployment
Large organizations require full control over their deployment environment.
- **Deliverables**: Clear documentation and templates for:
  - **Cloud Run**: Terraform or gcloud scripts for rapid deployment.
  - **Kubernetes**: Helm charts or K8s manifests.
  - **VPC Isolation**: Documentation on setting up private service connects and egress controls.

### 2. Signed Request Support (HMAC)
Enhanced security for the communication channel between the MCP proxy and the Fodda API.
- **Deliverables**: Implement request signing using HMAC to protect against:
  - Replay attacks.
  - Man-in-the-middle (MITM) attacks within internal corporate infrastructure.

### 3. Tool Capability Registry Endpoint
Provide transparency for enterprise AI orchestration teams.
- **Deliverables**: Implement a read-only endpoint `GET /mcp/tools` (or equivalent) that returns:
  - Tool names.
  - Required parameters.
  - Response schemas.
  - Deterministic status.

---

## Enterprise Readiness & Tooling (New)

### 4. Simulated Gemini Tool Invocation Mode
**Owner**: App + MCP
Add a third execution mode:
- Direct API
- MCP
- Simulated Gemini Invocation

**Goal**: Useful for enterprise readiness testing.
**Simulation**:
```json
{
  "tool_calls": [
    {
      "name": "search_graph",
      "arguments": {}
    }
  ]
}
```

### 5. MCP Versioning Discipline
**Owner**: MCP
- Add MCP `schema_version`
- Version tool definitions
- Prevent silent schema changes
- Add diff visibility between versions

### 6. Latency Profiling Mode
**Owner**: App + MCP
Track:
- Direct API latency
- MCP overhead
- Neo4j latency
Compare visually.

### 7. Marketplace Registry Packaging
**Owner**: MCP
Prepare:
- `server.json` metadata
- Docker image
- Registry publication config

---

## Strategic Guardrails (What NOT To Do)
To maintain the focus on **Stability > Innovation**, the following are strictly out of scope for the current phase:

- **NO Clever AI Layers**: Do not add intermediate "reasoning" or "agentic" layers inside the MCP proxy.
- **NO Summarization Magic**: The proxy should remain a pass-through for structured data; do not add LLM-based summarization of results.
- **NO Scope Expansion**: Stay focused on the core graph retrieval tools.
- **NO Dynamic Retrieval Experiments**: Do not implement self-correcting or multi-hop retrieval logic within the MCP layer.

---

**Philosophy**: *The MCP layer is a secure, stateless, and deterministic bridge. Reliability is the primary feature.*
