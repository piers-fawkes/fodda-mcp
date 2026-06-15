# Graph Catalog QA — Handoff Note

**Date:** 2026-06-14
**Scope:** Data-quality + access review of the graph catalog, triggered by a Claude-via-MCP audit of `list_graphs`.
**Author:** Claude Code (MCP codebase)

This note records what was fixed in the **MCP server** and what still needs to happen on the **API / Airtable** side. The MCP server only relays `/v1/graphs` — it does not author `status`, `trend_count`, `evidence_count`, `curator`, `name`, or `description` values for individual graphs. Those originate upstream.

---

## ✅ Done in the MCP codebase (`src/toolHandlers.ts`, `tsc --noEmit` clean)

### 1. Routing instructions leaking into the public `description` field
**Was:** `list_graphs` appended `[ROUTING INSTRUCTION: <agent_prompt>]` onto each graph's `description` *before* serialization, so internal router guidance leaked into every payload an MCP client saw.
**Now:**
- `agent_prompt` is exposed as a dedicated **`routing_hint`** field instead. The LLM still sees routing guidance; the public `description` stays clean.
- Added a defensive sanitizer in `serializeGraphForList` that strips any `[ROUTING INSTRUCTION: ...]` block from `description` regardless of source — so even API-baked routing text cannot surface.

### 2. Report-graph trend enumeration was undiscoverable (not actually missing)
**Was:** Agents couldn't tell that report-graph trends are enumerable.
**Now:** `get_label_values` description explicitly states that `label="Trend"` returns a graph's complete, deterministic trend list — the right tool when semantic search/`search_insights` returns only the top match (or nothing, when evidence is unlinked).

---

## ⚠️ Correction to the original implementation brief

The brief proposed editing `graph_profiles.json` to fix the ILO graph. **That file is not imported anywhere in `src/`** — it is a stale artifact, and editing it changes nothing in live MCP output. The ILO "currently unresponsive to queries" note leaks from the **API `/v1/graphs` description** and must be fixed in Airtable.

---

## 🔬 The "report-graph node-retrieval gap" was tested live — mostly outdated

Tested against `michaels-2026-creativity-trend-report` (8 trends):

| Tool | Earlier claim | Live result |
|------|---------------|-------------|
| `get_label_values(label='Trend')` | "won't work" | ✅ Returned all 8 trends deterministically |
| `search_insights` | "returns 0" | ⚠️ Returns a trend-node **fallback** (top match only), capped by `min_score` |
| `search_graph` | works for domain graphs | ✅ Returns trends, but `evidence: []`, `evidence_count: 0` |

**Conclusion:** There IS an MCP path to enumerate report-graph trends (`get_label_values` with `label='Trend'`). The reason `search_insights`/`search_statistics` return nothing substantive is the **evidence-linker failure** (items #2/#3 below) — those endpoints query Statistic/Evidence nodes, and these graphs have none. This is a backend data issue, not a missing MCP capability.

---

## 🛠️ Needs to happen on the API / Airtable side (NOT MCP)

| # | Issue | Where to fix | Action |
|---|-------|-------------|--------|
| 1 | ~23 "live" report graphs with `trend_count: 0` and `evidence_count: 0` (live-but-empty shells) | Airtable `status` | Flip to `draft`/`pending`, or run the ingestion pipeline |
| 2 | `mckinsey-automotive` (1 trend/0 evidence), `mckinsey-health` (5/0) | Evidence linker | Trends ingested, evidence not attached |
| 3 | More graphs with trends but `evidence_count: 0`: `pinterest-home` (8/0), `pinterest-fashion` (28/0), `pinterest-beauty` (5/0), `mintel-beauty` (3/0), `greenhouse-retail` (9/0), `michaels-2026-creativity-trend-report` (8/0), `delta/the-connection-index` (4/0) | Evidence linker | Same root cause. Fixing this also makes `search_insights`/`search_statistics` work on report graphs |
| 4 | `ilo-employment-and-social-trends` is `live` but its `description` ends with "NOTE: The graph is currently unresponsive to queries." | Airtable | Fix description + flip `status` to `draft` |
| 6 | Typos in live descriptions: "marketing treansa" (`edelman-marketing`), "Dentu's" (`dentsu-creative-marketing`) | Airtable descriptions | Fix copy |
| 7 | Duplicate earnings graphs: `earnings_calls` and `earnings-calls` (underscore vs hyphen ID collision) | Airtable | Deduplicate to one canonical ID |
| 8 | `curator: "Industry Report"` placeholder instead of a real author (e.g. `tiktok-marketing`, `visa-creators_report-2025`, `ecdb-global-ecommerce-outlook-2026`, `youtube-eoy_cats_trends_report_2025`, `mintel-2026_global_food_and_drink_predictions`, `bompasparr-future-of-food-and-drink-1`, `mintel-2026_global_household_predictions`) | Airtable `curator` | Real author names |
| 9 | ~13 supplemental graphs show raw IDs as their display name in `graphs[].name`: `acs_tract`, `airnow`, `cbs_buurt`, `cbs_crime`, `epc_uk`, `fbi_crime`, `hud_housing`, `luchtmeetnet`, `msc_aqhi`, `ons_neighbourhood`, `pdok_bag`, `police_uk`, `statcan_census` | API `graphs[]` response | The humanized names already exist in the `supplemental_sources` block — populate `graphs[].name` from the same join |

### Bonus API suggestion (not a bug)
When `search_insights` falls back to trend nodes, it returns `count: 1` (top match only), which an agent can misread as "this graph has 1 trend." Have the fallback return all matching trend nodes, or include the graph's total trend count, so the fallback isn't mistaken for the full picture.

### Confirmed intentional (not a bug)
`supplemental_sources` anonymizes source names (e.g. FRED → "Federal Economic Indicators", Amazon → "Product & Pricing Reality") while the `graphs` array uses real names. This matches the "public payloads anonymize" design. Flagged only in case the wrong surface feeds a downstream sheet.

---

## Verification

```bash
cd "/Users/piersfawkes/Documents/Fodda MCP"
npx tsc --noEmit                       # passes
grep -n "ROUTING INSTRUCTION" src/toolHandlers.ts   # only the sanitizer regex remains
```

After deploy, call `list_graphs` and confirm: no `[ROUTING INSTRUCTION: ...]` in any `description`; a `routing_hint` field appears for graphs that have `agent_prompt`.
