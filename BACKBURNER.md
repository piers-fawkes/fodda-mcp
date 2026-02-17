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
**Status**: ✅ Complete (v1.3.0)

Packaged the MCP server for the Official MCP Registry and npm.

**Deliverables (completed)**:
- `fodda_mcp_server.json` — conforming to 2025-12-11 registry schema with `remotes` + `packages`
- `/.well-known/mcp.json` endpoint for auto-discovery
- `scripts/publish_registry.sh` — one-command npm + registry publish
- npm package support for self-hosted installs (`npx fodda-mcp`)
- Marketplace-quality `README.md` with Claude/Gemini quick-start examples

---

## Strategic Guardrails (What NOT To Do)
To maintain the focus on **Stability > Innovation**, the following are strictly out of scope for the current phase:

- **NO Clever AI Layers**: Do not add intermediate "reasoning" or "agentic" layers inside the MCP proxy.
- **NO Summarization Magic**: The proxy should remain a pass-through for structured data; do not add LLM-based summarization of results.
- **NO Scope Expansion**: Stay focused on the core graph retrieval tools.
- **NO Dynamic Retrieval Experiments**: Do not implement self-correcting or multi-hop retrieval logic within the MCP layer.

### 8. WebMCP `navigator.modelContext` Integration
**Owner**: Website
**Status**: ⏸️ Blocked — awaiting browser support (ETA: 2027+)

The Fodda Website's `AgentInsightPanel` contains a tool registration via the proposed `navigator.modelContext.registerTool()` API (WebMCP spec from Microsoft/Google). The entire panel is **commented out** from all graph pages until the platform is ready.

**Research findings (Feb 16, 2026)**:
- Chrome: Canary flag / Early Preview Program only — not origin trial, not stable
- Edge: Unspecified (Chromium-derived, likely same as Chrome)
- Firefox / Safari: No engagement found
- Spec: W3C Community Group draft (not standards-track)
- MCP-B polyfill: ~789 users — too niche
- **Realistic production ETA: 2027+**

**Commented-out files**:
- `components/AgentInsightPanel.tsx` — WebMCP registration block (lines 106–183)
- `pages/GraphBeauty.tsx` — `<AgentInsightPanel>` import + usage
- `pages/GraphRetail.tsx` — `<AgentInsightPanel>` import + usage
- `pages/GraphSports.tsx` — `<AgentInsightPanel>` import + usage

**When to activate**: Only when **Piers confirms** that `navigator.modelContext` has shipped in Chrome/Edge stable or a public origin trial. At that point:
- Uncomment `AgentInsightPanel` on all three graph pages
- Verify the WebMCP tool registration lights up
- Consider wiring additional API tools (`searchGraph`, `getEvidence`, `getLabelValues`)
- **Also update the corresponding pages on the PSFK website**

> **Note**: Do NOT begin implementation until Piers explicitly confirms browser support is available.

---

**Philosophy**: *The MCP layer is a secure, stateless, and deterministic bridge. Reliability is the primary feature.*
