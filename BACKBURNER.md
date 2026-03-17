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

### 11. Re-Add Stripped Features to McpServer Architecture
**Owner**: MCP
**Status**: ⏸️ Pending — add ONE at a time, test Claude after each

Rev 42 rebuilt the server using `McpServer` (no middleware). The following features were removed and should be re-added carefully:

| Priority | Feature | Notes |
|----------|---------|-------|
| High | Usage logging (`mcp.tool_call` events) | Safe — just `console.error()` inside handlers |
| High | Credit exhaustion error enrichment | Safe — catch block logic only |
| Medium | Response size guard (2MB max) | Safe — pre-return check |
| Low | Rate limiting | Add inside `app.all('/mcp')`, NOT as global middleware. Do NOT set response headers. |
| Low | HMAC verification | Only needed for server-to-server calls. May not need for MCP clients. |

**⚠️ Do NOT re-add**: AsyncLocalStorage, diagnostic response interceptors (`res.writeHead`/`res.write`/`res.end` overrides), or global `app.use()` middleware for MCP paths.

### 12. Search Output Improvements
**Owner**: MCP
**Status**: ⏸️ Pending

Improve how search results appear when surfaced by Claude/AI agents:

- **Default `include_evidence` to `true`**: Gives Claude article URLs (`sourceUrl`) automatically. Currently defaults to `false`. Simple one-line change.
- **Add `fodda_url` to each trend**: Post-process API response to add `https://app.fodda.ai/trends/{trendSlug}`.
- **Add `psfk_trend_label`**: Friendly label like `PSFK Trend #6278` so Claude uses it instead of raw node IDs.
- **Update tool description**: Mention the new fields so Claude naturally uses them.

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

### 9. Publish v1.6.0 to npm + MCP Registry
**Owner**: MCP
**Status**: ⏸️ Blocked — npm auth token expired

v1.6.0 (API alignment: `list_graphs`, `filters`, `include_evidence`, `direction`, `property`) is **built locally** but not yet deployed to Cloud Run, npm, or the MCP Registry. The npm login session expired during a prior publish attempt.

**To complete**:
```bash
npm login          # complete browser auth
bash scripts/publish_registry.sh
```

**Verify after publish**:
- https://www.npmjs.com/package/fodda-mcp (should show 1.6.0)
- `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server"`

### 10. Check Claude.ai Web Client Bug Report
**Owner**: Piers
**Status**: ✅ Resolved (March 10, 2026)
**Filed**: March 7, 2026

Bug report filed at [github.com/anthropics/claude-ai-mcp](https://github.com/anthropics/claude-ai-mcp/issues) for Claude.ai web client returning "Error occurred during tool execution" despite valid 200 OK JSON responses.

**Resolution**: Root cause was not a Claude bug — it was the Fodda server's middleware chain (`Server` class + AsyncLocalStorage + response interceptors) interfering with the SDK's `@hono/node-server` response pipeline. Rebuilding the server using `McpServer` (high-level API, no middleware) fixed it immediately. Both `list_graphs` and `search_graph` now work end-to-end through Claude.ai.

**To do**: Consider updating/closing the GitHub issue with the resolution.

### 13. Explore Anthropic Agent Skills for Fodda
**Owner**: MCP
**Status**: ⏸️ Backburner

Anthropic's Connectors Directory supports **Skills** — modular capability packages (instructions, metadata, resources) that extend Claude's functionality. Fodda could submit a Skill alongside the MCP connector to guide Claude in creative and effective use of the knowledge graph tools.

**To explore**:
- Review Skill spec and examples on claude.com/connector
- Design a Fodda research Skill (e.g., "Trend Research Assistant" that guides multi-step graph exploration)
- Package as a public GitHub repo with instructions, metadata, and optional prompt templates
- Submit via the Connectors Directory form (Skills section)

**Value**: A Skill could differentiate Fodda from other MCP servers by providing opinionated research workflows, not just raw tool access.

### 14. Community Graph Quality — MCP-Side Implications
**Owner**: MCP (monitor) + API (enforce)
**Status**: ⏸️ Watch — API agent owns enforcement

Co-pilot review (March 2026) flagged three quality risks for community Pattern Graphs:

1. **Signal summary quality** — weak summaries degrade search/clustering. API should enforce min 250 chars at `/validate`. MCP impact: none (proxies results as-is).
2. **Pattern inflation** — 1:1 signal-to-pattern ratios destroy the model. API should enforce min 2 signals/pattern at `/refresh`. MCP impact: none.
3. **Entity normalization** — `Nike` vs `nike` vs `NIKE` vs `Nike Inc` will accumulate over time. API should add a normalization layer (Sheets → normalize → cache). **MCP impact**: if/when we add an `entity_search` or `entity_autocomplete` tool, normalized entities would make fuzzy matching much cleaner.

**Action**: Periodically check that the API agent has implemented these guards. If entity normalization ships, consider adding an `entity_search` MCP tool.

---

**Philosophy**: *The MCP layer is a secure, stateless, and deterministic bridge. Reliability is the primary feature.*
