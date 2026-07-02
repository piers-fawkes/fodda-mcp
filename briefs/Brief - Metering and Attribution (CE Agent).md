# Brief: CE Graph Identity — Confirm CE Stays Out of the Metering Loop & graphId Keys Line Up
**Date:** 2026-06-19
**From:** MCP Agent
**To:** CE Agent
**Priority:** P1 — High. Not a live double-charge (CE is not on the request/billing path), but CE owns the `graphId` attribution key and its read path still tolerates two encodings of the same graph (`graphIdFilter`, `src/shared/generic-graph/routes.ts:71-73`). Inconsistent keys break per-graph attribution downstream in API/MCP. Everything else here is P2 cleanup.
**Context:** Findings A specify that every MCP-orchestrated query fires one `POST /v1/research/meter` charged at a fixed price by query-type, attributed to the user via Airtable/Neo4j keyed on `graphId`. CE is the ingestion/dashboard pipeline that *writes* that key. We need to confirm CE never accidentally meters/bills, never serves per-user queries, and emits a single canonical `graphId` so MCP↔API↔CE attribution joins cleanly.
---

## 1. Objective
Confirm and lock the boundary: CE (`expert.fodda.ai`) is strictly upstream of billing — it ingests content and writes graph identity into Airtable + Neo4j; it does not serve end-user research queries, emit query-type codes, or call the meter. Verified true today. The one substantive risk is **graphId encoding drift**: CE's read/lookup helpers still match a compound `userSlug/graphSlug` form alongside the flat slug, so a graph can persist under two keys. Since the API meters/attributes on `graphId`, drift here silently mis-attributes (or fails to attribute) per-graph charges. Normalize to one canonical flat slug end-to-end and remove the compound fallback once data is clean.

## 2. What You Need To Do

**Scope items 1 & 2 (query-type emission; FODDA_INTERNAL_API_KEY anti-double-billing) are N/A for CE — confirmed below, no action.** All real work is item 3 (graphId consistency) plus dead-code cleanup.

1. **Confirm CE is not on the metering path (no code change — verification statement back to MCP/API).**
   - CE serves only ingestion/admin/dashboard routes: `src/index.ts:39-115` (health, redirect, admin, `/new`, the five mounted graph routers, watchdog, copy-editor, expert-ingest, generic catch-all). Graph routers expose ingest + dashboard reads only, e.g. `src/graphs/piers-fawkes/consumer-electronics/routes.ts`: `POST /api/process-url` (:163), `POST /api/process-file` (:302), `POST /api/run/neo4j-sync` (:458), `GET /api/evidence` (:436), `GET /api/trends` (:446). No per-user research serving.
   - Grep is clean: no `research/meter`, `billable_units`, `query_type`/`queryType`, `topic_research`, `expert_agent`, `research_chat`, `decrementCredits` anywhere in `src/`.
   - Auth is Google OIDC for scheduler-triggered endpoints (`src/shared/auth.ts:11-97`), not Fodda user api keys. CE never receives or forwards an `X-API-Key`, never sets `X-Fodda-Billing: mcp-orchestrated`.
   - **Therefore:** there is no CE interaction that should emit a query-type code, and no CE-originated path that can bill a user. The fixed-price query-types from Findings A (`topic_research` 15, `expert_agent` 5, `research_chat` 3, …) are emitted by API/MCP at serve time, against graphs CE *populated*. (confirm with API: that the serving layer derives query-type, not CE.)

2. **Confirm no internal-key requirement leaks into CE (no code change).**
   - `FODDA_INTERNAL_API_KEY` / `INTERNAL_API_KEY` / `internal_service`: zero hits in `src/`. CE makes no authenticated calls back into the API research surface, so there is no anti-double-billing internal-key hop to add here. If that ever changes (e.g. CE calls `/v1/research/*` during enrichment), it MUST use `FODDA_INTERNAL_API_KEY` and carry `mcp-orchestrated` so the API trust gate (`API functions/index.ts:593-602`) defers per-call billing. Today: N/A. (confirm: CE has no outbound research calls — verified by grep, but flag if a future enrichment step adds one.)

3. **graphId encoding — make CE write/read exactly one canonical key.** This is the load-bearing item.

   3a. **Remove the compound-graphId fallback in the read path.** `graphIdFilter()` matches both forms:
   ```ts
   // src/shared/generic-graph/routes.ts:71-73
   function graphIdFilter(userSlug, graphSlug) {
     const compound = `${userSlug}/${graphSlug}`;
     return `OR({graphId} = '${graphSlug}', {graphId} = '${compound}')`;
   }
   ```
   The same `OR({graphId} = flat, {graphId} = compound)` pattern recurs at graph-meta read (`:204-206`) and graph-meta write/publish (`:292-294`). This means a graph stored under `edelman/tipping-points` and one stored under `tipping-points` both resolve in CE — but the API/MCP attribution key is the flat slug per GRAPHID_FORMAT_CHANGE.md. Compound-keyed rows are invisible to API metering/attribution.
   - **Action:** after 3b confirms data is clean, drop the `compound` branch so CE matches the flat slug only. Until then, leave the `OR` but log a warning when a record is matched via the compound branch, so we can detect remaining dirty rows.

   3b. **Verify the migration actually covered the data, not just 4 hardcoded IDs.** `scripts/fix-graphid-format.ts` only rewrites a hardcoded list:
   ```ts
   // scripts/fix-graphid-format.ts:40-45
   const SLASH_IDS = ['revisionary-studio/2026-macro-trend-graph','green-house/thrive-report','pwc/sxsw-2026-key-insights','edelman/tipping-points'];
   ```
   across Trends/Evidence/Reports (`:115-121`) and the Registry (`:125`). Any graph with a slash NOT in that list was never normalized. (confirm) Run a one-off scan over Airtable Trends/Evidence/Reports + Registry (base `appXUeeWN1uD9NdCW`) for any `graphId` containing `/`; normalize survivors with `stripUserPrefix` (`:47-50`).

   3c. **Confirm Neo4j carries one canonical key, and tell API which property is authoritative.** Sync writes BOTH on the graph node:
   ```ts
   // src/agent/neo4j-sync-generic.ts:341-342
   psfk_graph_slug: graphId,
   graphId: graphId,
   ```
   and node-level `Trend {graphId: $graphId}` (`:359`). Two properties holding the same value is fine *only if* both are always the flat slug. Confirm `syncGraph` is always invoked with the flat slug (CLI usage `:6`; guard `:218-219`). State to API which property they should join on for attribution (`graphId` vs `psfk_graph_slug`) so MCP↔API↔CE all key identically. (confirm with API.)

4. **Dead-code cleanup (P2, no functional impact).** `incrementGraphQueryCount(graphId)` (`src/shared/graph-registry.ts:330-368`) is documented "Usage from API side" (`:326-328`) but is **never called anywhere in CE** — the only other references are literal text inside generated brief strings (`src/shared/brief-generator.ts:483`, `src/shared/generic-graph/routes.ts:780`). Either delete it from CE or confirm the API imports it cross-repo. If kept, note it is per-graph telemetry, **not** billing — do not let it be mistaken for a metering signal.

## 3. Acceptance Criteria
- [ ] CE confirms in writing (to MCP + API) that no CE route emits a query-type code or calls `/v1/research/meter`, and no CE path bills a user. (Grep-backed: items 1–2.)
- [ ] Airtable scan returns **zero** `graphId` values containing `/` across Trends, Evidence, Reports, and Registry.
- [ ] `graphIdFilter` and the two graph-meta `OR(...)` lookups (`generic-graph/routes.ts:71-73, :204-206, :292-294`) either (a) log when the compound branch matches, or (b) are reduced to flat-slug-only after the scan is clean.
- [ ] Neo4j: every graph node's `graphId` and `psfk_graph_slug` equal the flat slug; API is told which property is the canonical attribution key.
- [ ] `incrementGraphQueryCount` is either removed from CE or confirmed imported by API; in either case it is documented as telemetry, not billing.

## 4. Testing Plan
- **Encoding scan (read-only):** query Airtable bases for `FIND('/', {graphId})` across the four tables; expect empty result post-migration. Re-run after any new ingest.
- **Round-trip key check:** ingest a test graph via `POST /:user/:graph/api/ingest-pdf` (`generic-graph/routes.ts:350`), sync via `neo4j-sync-generic`, then confirm the API serves/attributes a query to that same flat `graphId` (coordinate with API to read `Source 'mcp_passthrough'` log + graph attribution). The graphId on the meter/attribution row must byte-match the slug CE wrote.
- **Anti-double-billing:** N/A inside CE today (no outbound research calls — grep clean). If a future CE enrichment step calls the API research surface, that hop MUST use `FODDA_INTERNAL_API_KEY` + `mcp-orchestrated` so the API trust gate defers per-call billing (`API functions/index.ts:593-602`); add a test then.
- **Regression:** after removing the compound branch, hit `GET /:user/:graph/api/status|trends|evidence|reports` for all five mounted graphs and confirm 200s with non-empty data (proves all live graphs are flat-keyed).

## 5. Dependencies & Coordination
- **API:** must confirm (a) query-type is derived at serve time, not expected from CE; (b) the canonical Neo4j attribution property (`graphId` vs `psfk_graph_slug`); (c) whether API imports CE's `incrementGraphQueryCount`. Handshake: one flat-slug `graphId` is THE join key across MCP↔API↔CE.
- **MCP:** per GRAPHID_FORMAT_CHANGE.md (`briefs/GRAPHID_FORMAT_CHANGE.md:36-38`) MCP passes graphIds through from the API catalog — no MCP change needed once CE+API agree on the flat slug. MCP will confirm `list_graphs`/routing surfaces the same slug CE writes.
- **No expert-onboarding scope:** per owner framing, agents do not onboard as experts; CE's expert-ingest path is out of scope for this brief except as a graphId *writer* (handler.ts:124 `graphId || analystId` — confirm it always lands a flat slug).

## 6. CHANGELOG Entry
```
### Changed
- CE: graphId attribution key normalized to a single canonical flat slug across Airtable (Trends/Evidence/Reports/Registry) and Neo4j (graphId + psfk_graph_slug) so MCP↔API↔CE metering/attribution joins on one key.
### Fixed
- CE: removed/guarded compound `userSlug/graphSlug` fallback in graph lookups (generic-graph/routes.ts graphIdFilter + graph-meta) that let a graph resolve under two encodings, masking mis-attributed query traffic.
### Removed
- CE: dead `incrementGraphQueryCount` export (graph-registry.ts) — never called in CE; was telemetry, never a billing signal.
```

---
**Verification note (file:line confirmed against `/Users/piersfawkes/Documents/Fodda CE`):** CE has NO metering/billing surface — confirmed by grep (no `research/meter`, `query_type`, `billable_units`, `decrementCredits`, `FODDA_INTERNAL_API_KEY`, `mcp-orchestrated` in `src/`). CE auth is Google OIDC (`src/shared/auth.ts`), not Fodda user keys. The substantive finding is graphId encoding drift (`generic-graph/routes.ts:71-73`) combined with a migration that only normalized 4 hardcoded IDs (`scripts/fix-graphid-format.ts:40-45`) — this is why I raised to P1. Claims marked "(confirm)" require API-side or Airtable-data verification I could not perform from the CE repo alone.
