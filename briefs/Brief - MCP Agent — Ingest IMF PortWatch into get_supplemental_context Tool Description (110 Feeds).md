# Brief (MCP Agent) — Update `get_supplemental_context` Tool Description (110 Feeds & IMF PortWatch)

**Target Repo:** `Fodda MCP`  
**Target Files:** `src/toolHandlers.ts`, `CHANGELOG.md`  
**Execution Handle:** `/build-from-brief briefs/Brief - MCP Agent — Ingest IMF PortWatch into get_supplemental_context Tool Description (110 Feeds).md`  
**Priority:** Medium (Tool Routing & Semantic Discovery Parity)  
**Date:** 2026-10-12  
**Prepared by:** API Agent  
**Related Documents:**
- API Source of Truth: `https://api.fodda.ai/v1/supplemental/sources`
- API CHANGELOG: Entry for 2026-10-12 (`portwatchClient.ts`, `socrataClient.ts`, `supplementalRouter.ts`, `unifiedContextHandler.ts`)

---

## 1. Context & Motivation

The Fodda API has expanded its federated Supplemental Data Layer to **110 live sources** with the addition of **IMF PortWatch** (maritime trade, daily container ship port calls, and chokepoint transits across 2,065 ports and 28 straits including Suez and Panama) and expanded municipal Socrata tracking (NYC Restaurant Inspections & NYS Liquor Licenses).

In `Fodda MCP/src/toolHandlers.ts` (line 4067), the `get_supplemental_context` tool description currently reads:
> *"Federated empirical data layer: queries 90+ live institutional and government feeds (FRED, BLS, US Census, World Bank, OECD, WTO, etc.) for real-time macroeconomic indicators, demographic shifts, trade flows, and retail spending..."*

Because foundation models (Claude, ChatGPT, Copilot) rely directly on tool descriptions to route user queries, shipping, logistics, and port throughput queries (e.g. *"Check container congestion through the Suez Canal"* or *"What are import volumes at Long Beach?"*) risk being misrouted to web search or rejected if the tool description only references macroeconomic indicators and retail spending.

---

## 2. Required Changes in `Fodda MCP`

### 2.1 Update Tool Description in `src/toolHandlers.ts`

In `src/toolHandlers.ts` (around line 4066–4075), update the registration description for `get_supplemental_context`:

**Replace:**
```typescript
        'get_supplemental_context',
        'Federated empirical data layer: queries 90+ live institutional and government feeds (FRED, BLS, US Census, World Bank, OECD, WTO, etc.) for real-time macroeconomic indicators, demographic shifts, trade flows, and retail spending. Use when verifying macroeconomic benchmarks, checking consumer spending metrics, grounding trend hypotheses with empirical statistics, or when knowledge graph coverage is thin. Sibling routing: Use search_graph or get_domain_intelligence for curated consumer trends and brand case studies; use get_supplemental_context when you need authoritative government statistics or regional/country economic context. Returns a structured 5-bucket evidence bundle (demand_signals, economic_context, market_data, financial_reporting, demographic_context) with full source provenance.',
```

**With:**
```typescript
        'get_supplemental_context',
        'Federated empirical data layer: queries 110+ live institutional and government feeds (FRED, BLS, US Census, World Bank, OECD, WTO, IMF PortWatch, etc.) for real-time macroeconomic indicators, demographic shifts, global trade flows, container shipping & port throughput, maritime chokepoints (Suez, Panama), and retail spending. Use when verifying macroeconomic benchmarks, checking consumer spending metrics, grounding supply chain or trend hypotheses with empirical statistics, or when knowledge graph coverage is thin. Sibling routing: Use search_graph or get_domain_intelligence for curated consumer trends and brand case studies; use get_supplemental_context when you need authoritative government statistics, port/logistics telemetry, or regional/country economic context. Returns a structured 5-bucket evidence bundle (demand_signals, economic_context, market_data, financial_reporting, demographic_context) with full source provenance.',
```

---

## 3. Verification & Acceptance Criteria

1. **Build Check:** Run `npm run build` in `Fodda MCP` and verify 0 TypeScript compilation errors.
2. **Schema Output:** Run `npx tsx scripts/export_tool_manifest.ts` (or equivalent tool inspection script) to verify `get_supplemental_context` exports the updated `110+` description.
3. **CHANGELOG:** Update `CHANGELOG.md` in `Fodda MCP` documenting the tool description refresh for 110 live feeds and IMF PortWatch logistics routing.
