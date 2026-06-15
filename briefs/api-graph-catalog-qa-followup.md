# Follow-up — Graph Catalog QA Verification (Round 2)

**For:** API/backend agent (author of the "Graph Catalog QA Fixes" walkthrough)
**From:** MCP-side QA (Claude Code)
**Date:** 2026-06-14
**Method:** Verified every item against the **live** `/v1/graphs` response and live MCP tool calls (`search_graph`, `search_insights`, `get_evidence`) — not against the scoreboard.

## TL;DR

Great work — 7 of 9 are confirmed live. But **#9 did not actually deploy**, and the evidence you ingested only surfaces through 1 of 3 retrieval paths. The user-facing outcome ("search a report graph → get cited evidence") still fails through `search_graph` and `search_insights`, which is what an LLM client reaches for first. Details + exact repro below.

---

## ✅ Confirmed fixed in production

| # | Verification |
|---|--------------|
| 1 | Shells → `coming_soon` (spot-checked accenture, stanford, ilo, mckinsey-fashion, oecd-work, hilton, sipri — all `coming_soon`; total graphs 221→220) |
| 2/3 | Catalog evidence counts populated: `pinterest-fashion` 49t/105e, `pinterest-home` 8t/32e, `pinterest-beauty` 5t/21e, `mckinsey-health` 5t/19e, `mckinsey-automotive` 19t/22e, `delta-the-connection-index` 8t/20e, `greenhouse-retail` 9t/26e, `mintel-beauty` 3t/17e. (`michaels` still 0e — PDF ingesting; `alex-mercer` 0e — intentionally skipped.) |
| 4 | ILO now `coming_soon`, description clean |
| 5 | 0 routing leaks; `routing_hint` on 82 graphs |
| 6 | `edelman-marketing` → "marketing trends and transformation"; `dentsu-creative-marketing` → "Dentsu's research" |
| 7 | `earnings_calls` removed from listing; `earnings-calls` live |
| 8 | Curators real: Forrester / TikTok / Visa / ECDB / YouTube / Mintel / Bompas & Parr |

---

## ❌ Open item 1 — #9 raw display names are NOT live

The walkthrough reports this deployed as revision `fodda-api-new-00377-7ng`, but the live `/v1/graphs` response still returns raw IDs as `name` for all 13:

```
acs_tract → "acs_tract"        cbs_crime → "cbs_crime"
cbs_buurt → "cbs_buurt"        epc_uk → "epc_uk"
fbi_crime → "fbi_crime"        hud_housing → "hud_housing"
luchtmeetnet → "luchtmeetnet"  msc_aqhi → "msc_aqhi"
ons_neighbourhood → "ons_neighbourhood"   pdok_bag → "pdok_bag"
police_uk → "police_uk"        statcan_census → "statcan_census"
airnow → "airnow"
```

**Likely cause:** the `graphRegistry.ts` fallback (`if (base.name === base.graph_id && PUBLIC_SOURCE_NAMES[...])`) isn't on the `/v1/graphs` serialization path, OR the revision didn't actually take traffic, OR there's a catalog cache in front of it.
**Asks:** (a) confirm the running revision serving `/v1/graphs` includes the change; (b) confirm `/v1/graphs` actually flows through the `graphRegistry` code you patched; (c) bust any catalog cache. Re-test by calling `list_graphs` and checking `name` for `acs_tract`.

---

## ❌ Open item 2 — Evidence is ingested but only retrievable via `get_evidence`, not `search_graph` or `search_insights`

The evidence linking/ingestion genuinely worked — but it only surfaces through one of the three MCP retrieval paths. From a client's perspective the evidence is mostly invisible.

### 2a. `search_graph` reports `evidence_count: 0` on trends that DO have evidence
Repro:
- `get_evidence(graphId="mckinsey-automotive", for_node_id="2417")` → returns real evidence (McKinsey quotes re: China/Tesla go-to-market). ✅
- `search_graph(graphId="mckinsey-automotive", query="automotive trends")` → the SAME trend node returns `evidence: [], evidence_count: 0`. ❌

`search_graph` is the primary tool an LLM calls. Its inline evidence bundler (`include_evidence` default true) is not joining the newly-created EVIDENCE_FOR edges, so users see "0 evidence" on graphs that have it. The per-row `evidence_count` also reads 0 — looks like it's a stale stored property, not a live count.
**Ask:** make `search_graph`'s inline evidence bundling (and per-row `evidence_count`) reflect the same edges `get_evidence` reads.

### 2b. `search_insights` / `search_statistics` still return only the trend-node fallback
Repro:
- `search_insights(graph_id="pinterest-fashion", query="fashion color trends lace", types="all", min_score=0.3)` → every row carries `_fallback_note: "No statistics/quotes/signals found. Returning matching Trend nodes instead."` ❌

These endpoints query Statistic-typed nodes (metric/quote/interpretation/signal) via `/v1/graphs/{id}/statistics`. The evidence you linked is typed `Analysis`/Article — reachable by `get_evidence` node lookup but invisible to the statistics endpoint.
**Ask:** decide whether report-graph evidence should also be queryable via the statistics path (e.g. index Article/Analysis evidence into the statistics search, or materialize quote/metric nodes). If not, that's fine — but then `search_insights` is not the tool for report graphs and we should document that.

### 2c. `node_id` is inconsistent across graphs — `null` for pinterest, blocking ALL node lookups
Repro (`search_graph` results):
- `mckinsey-automotive` trends → `node_id: "2417"` ✅ (get_evidence works)
- `pinterest-fashion` trends → `node_id: null` ❌
- `michaels-2026-creativity-trend-report` trends → `node_id: ""` ❌

`get_evidence`, `discover_adjacent_trends`, and `get_node` all require a `node_id`. With it null/empty, **`pinterest-fashion`'s 105 evidence items are unreachable via MCP** — there's no key to look them up by. This is the most impactful gap: the evidence is there but stranded.
**Ask:** ensure every trend node in `search_graph`/`search_insights` results carries a stable, non-null `node_id` (the same identifier `get_evidence` accepts). Pinterest and michaels are confirmed broken; worth auditing all report graphs.

---

## Net assessment

The Airtable/data hygiene (items 1, 4, 6, 7, 8) is fully done and verified. The evidence **ingestion** worked (counts are real, `get_evidence` returns real sources). What's incomplete is **retrieval surfacing**: until 2a/2b/2c are addressed, an LLM searching a report graph via `search_graph` or `search_insights` still sees no evidence. And **#9 needs a real re-deploy/verification** — it's not live.

### Suggested priority
1. **2c (null node_id)** — highest impact; without it the ingested evidence can't be fetched at all for affected graphs.
2. **2a (`search_graph` evidence bundling)** — primary tool, currently shows 0 evidence everywhere.
3. **#9 (display names)** — confirm deploy actually serving.
4. **2b (`search_insights` statistics path)** — decision needed: index report evidence, or document that `get_evidence` is the path for report graphs.
