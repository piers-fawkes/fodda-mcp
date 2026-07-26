# Brief - Pricing Infrastructure Handoff (MCP Agent)

**From:** API Agent (Coordinator)  
**To:** MCP Agent (`Fodda MCP/`)  
**Date:** 2026-07-26  
**Context:** Handoff from `PRICING-INFRA-BRIEF.md` (§2, §5, §6, §7)  

---

## 1. Goal

Implement the MCP-layer items from `PRICING-INFRA-BRIEF.md`:
1. **§2 — 1-Call 1-Price (`query_costs` explicit mode args)**: Make multi-price tools (e.g., `get_company_earnings`, `search_graph`, `deep_research_topic`) require explicit mode parameters in their schemas so `query_costs` maps `(tool + args) -> single cost`.
2. **§5 — Discovery Surface & Card**: Serve a `.well-known` MCP server card and structure the free/anonymous metadata tier (structure free, substance metered).
3. **§6 — Citable Resource URIs**: Expose MCP Resources using durable URIs (`fodda://expert/{slug}/insight/{id}`, `fodda://graph/{vertical}/trend/{slug}`).
4. **§7 — Error-Rate Instrumentation**: Instrument tool success/failure logging, calculate error rates, and expose a feedback/error reporting route.

---

## 2. Work Breakdown

### §2 — Tool Signatures & `query_costs` Assembly
- **Files:** `Fodda MCP/src/tools.ts`, `toolHandlers.ts`, `pricingCache.ts`
- Ensure every tool signature that varies in cost accepts an explicit mode string enum (e.g. `mode: "compare" | "history" | "qa"` for `get_company_earnings`).
- Update `query_costs` assembly so that every tool entry resolves to a single deterministic cost when arguments are passed.

### §5 — `.well-known` MCP Server Card & Free Metadata Tier
- **Files:** `Fodda MCP/src/index.ts` / server routes
- Serve `.well-known/mcp-server.json` or `.well-known/mcp` metadata card for server discovery.
- Keep structural/discovery calls free and unauthenticated (list graphs, inspect schemas/topics), while substance queries require auth/metering.

### §6 — Citable Resource URIs
- **Files:** `Fodda MCP/src/resources.ts` (or equivalent)
- Register MCP Resources with the `fodda://` scheme format to facilitate automatic downstream attribution.

### §7 — Error-Rate Instrumentation
- **Files:** `Fodda MCP/src/telemetry.ts` (or handler wrappers)
- Record pass/fail outcomes per tool call.
- Expose error rate metrics and feedback handler.

---

## 3. Deliverables Expected

- Updated tool schemas & `query_costs` in `Fodda MCP`.
- `.well-known` card handler.
- Resources support (`fodda://`).
- `CHANGELOG.md` update in `Fodda MCP`.
