# Brief: Regenerate a Complete, Priced, Current OpenAPI Spec

**Date:** 2026-06-22
**From:** MCP Agent (Coordinator)
**To:** API Agent (primary) + Website Agent (Part B)
**Repos:** ~/Documents/Fodda API/Fodda · ~/Documents/Fodda Website
**Priority:** P2 (the largest remaining agent-discoverability gap)

---

## 0. Why

OpenAPI is the standard machine-readable surface that agent frameworks (LangChain, tool importers, OpenAI/Anthropic tool specs) and API indexers consume to discover what an API can do. Fodda's is stale:
- API repo: `functions/openapi/fodda-vertex-tool.yaml` (served at `/openapi/fodda-vertex-tool.yaml`) documents only the **legacy `POST /api/query`** — none of the `/v1` surface. `mcp_schema.json` lists obsolete tool names.
- Website: `openapi.json` covers only **14 paths**.

So the real `/v1` surface (graphs search/nodes/neighbors/evidence/statistics/insights, supplemental, brand-intelligence, research deep-dive/meter/pricing/offerings, analysts/consult, search/domain|expert|report, adjacent, earnings) is **invisible to agent frameworks**, and nothing carries pricing.

Everything else in the discoverability layer is now done (offering pages + Product/Offer JSON-LD, graphs as Dataset, experts as Person, llms.txt, A2A agent card, registry metadata, `/v1/offerings`). OpenAPI is the gap.

## Part A — API: one complete, current, priced OpenAPI 3.x spec

1. **Cover every public/billable `/v1` endpoint** actually served (cross-check against the Express routers — `index.ts`, `v1Router.ts`, `researchRouter.ts`, `analysts.ts`, supplemental routes). Retire/replace the legacy `fodda-vertex-tool.yaml` and the obsolete `mcp_schema.json`.
2. **Annotate each operation with price** using the catalog as the source — e.g. an `x-fodda-price-usd` extension and/or a clear description line, resolved from the same `bills_as → TOKEN_COSTS × $0.50` logic the `/v1/offerings` catalog already uses. Mark free/utility endpoints `$0`.
3. **Anti-drift:** generate the spec from the route definitions + catalog where feasible (preferred), or maintain it by hand **with a parity check** that fails CI if a served `/v1` route is missing from the spec, or a spec path no longer exists. (Same philosophy as the catalog parity weld — don't let it rot again.)
4. **Serve it at a stable public path** (e.g. `/openapi.json` or `/v1/openapi.json`), in `PUBLIC_PATHS`, and link it from `/v1/offerings`, the 402 payload, and llms.txt so agents can find it.

## Part B — Website

1. **Stop hand-maintaining `openapi.json`** (the stale 14-path file). Either serve the API's spec directly or regenerate the website copy from it at build time — one source.
2. **Point the llms generator at the full catalog:** `generate-llms.js` currently fetches `/v1/research/pricing` (~20 interaction types). Switch it to `/v1/offerings` so `llms-full.txt` lists the **30 real tools** with names, prices, and `bills_as`, plus a link to the OpenAPI spec.

## Verify
- The spec lists every live `/v1` endpoint with a price (or $0), validates against an OpenAPI linter, and imports cleanly into an agent framework.
- A served route missing from the spec (or vice-versa) fails the parity check.
- `llms-full.txt` lists 30 tools and links the OpenAPI spec.
- The legacy `/api/query`-only spec is gone.

---

**Not in scope (already done):** offering pages + JSON-LD, graphs `Dataset`, experts `Person`, robots/sitemap, A2A agent card (MCP), registry descriptions (MCP), `/v1/offerings` + `tools-manifest.json`.
