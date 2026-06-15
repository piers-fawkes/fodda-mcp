# Brief — Graph Catalog Data Fixes (API / Airtable)

**For:** API/backend agent
**From:** MCP-side QA (Claude Code)
**Date:** 2026-06-14
**Source of truth:** live `list_graphs` response, 221 graphs (parsed programmatically, not eyeballed).

## What this is

A Claude-via-MCP audit of the graph catalog surfaced data-quality and access issues. The **MCP-side fixes are already done and deployed** (routing-instruction leak → `routing_hint`; `get_label_values` discoverability). The remaining items live in the **API / Airtable / ingestion** layer — the MCP server only relays `/v1/graphs` and cannot author `status`, `trend_count`, `evidence_count`, `curator`, `name`, or `description`.

**Your task:** verify each item below against the live data, decide the right owner/fix for each, delegate, and report back what's intended-behavior vs. genuine bug. Exact graph IDs are enumerated so nothing is ambiguous.

> [!NOTE]
> **Item #5 (routing leak) is already resolved** — included only as a no-regression check. Live data confirms **0** `[ROUTING INSTRUCTION:]` strings in any description, and `routing_hint` is present on 82 graphs.

---

## Catalog snapshot (for reference)
- Total graphs: **221** — industry report 96, supplemental 85, domain 36, skill 2, expert 2.
- Status: live 189, coming_soon 32.

---

## Items to verify and fix

### #1 — Live "industry report" graphs with zero content (shells)
**28 `industry report` graphs are `status: live` but `trend_count: 0` and `evidence_count: 0`** — publicly listable, nothing queryable behind them. Plus the `paralogy` skill graph is live/empty.

```
tbwa-australia-creative-ai-national-infrastructure-insights
accenture-agentic-commerce-trends
ilo-employment-and-social-trends
keurig-drpepper-beverage-trends
hilton-hospitality-mindset-trends
mckinsey-quantum-technology-outlook
shopmy-performance-marketing-shift-report
eventbrite-live-experiences-2026
seatrade-cruise-retail-trends
stanford-ai-index-2026-report
ondeck-small-business-trends
activate-consulting-technology-media-outlook-2026
huhtamaki-foodservice-packaging-trends
entrupy-counterfeit-market-state-2026
intouch-insight-mobile-order-trends
google-ai-gemini-agents-trends
sipri-military-expenditure-trends-2025
microsoft-work-trend-agents
amazon-trustworthy-shopping-graph
brenton-way-beauty-marketing-trends
cbre-dutch-shopping-streets-resilience
apa-planning-trends-2026
mckinsey-fashion
pinterest-summer-2026-trends-report
oecd-work
harris-poll-retail-trust
carney-ai-consumer-engagement
huhtamaki-foodservice-trends-report
```
**Action:** for each, either run/complete ingestion or flip `status` to `draft`/`coming_soon` in Airtable. A live graph that returns nothing on search is a bad client experience.
**Decision needed from you:** `mckinsey-fashion` and `oecd-work` are new since the original audit — confirm whether they're mid-ingestion or stalled.

> [!NOTE]
> The ~85 `supplemental` connectors also show 0/0 (FRED, OECD, census feeds, etc.). Those are live API data feeds that legitimately carry no trend/evidence nodes — **not** in scope here unless you decide they shouldn't expose `trend_count`/`evidence_count` at all. Confirm intended behavior.

### #2 / #3 — Trends ingested but evidence not attached (evidence-linker failure)
**10 graphs have `trend_count > 0` but `evidence_count == 0`:**
```
pinterest-fashion (28/0)
greenhouse-retail (9/0)
pinterest-home (8/0)
michaels-2026-creativity-trend-report (8/0)
mckinsey-health (5/0)
pinterest-beauty (5/0)
delta-the-connection-index (4/0)
mintel-beauty (3/0)
alex-mercer-retail-graph (2/0)
mckinsey-automotive (1/0)
```
`pinterest-fashion` at 28 trends / 0 evidence is the clearest broken ingest.
**Action:** run the evidence linker for these graphs.
**Why it matters beyond the count:** `search_insights` / `search_statistics` query Statistic/Evidence nodes via `/v1/graphs/{id}/statistics`. With no evidence nodes, those tools return only a thin trend-node fallback. Fixing the linker makes those MCP tools work on these graphs automatically.
**New since original audit:** `alex-mercer-retail-graph` (2/0) — verify.

### #4 — ILO graph self-describes as broken
`ilo-employment-and-social-trends` is `status: live` and 0/0, and its `description` ends with *"NOTE: The graph is currently unresponsive to queries."*
**Action:** fix the Airtable description (remove the failure note) and flip `status` to `draft` until it has content. (This is also in the #1 shell list.)

### #6 — Typos in live descriptions (confirmed in live data)
- `edelman-marketing` (description): *"…research into marketing **treansa**"* — garbled/truncated, likely "transformation" or "trends".
- `dentsu-creative-marketing` (description): *"Fodda's interpretation of **Dentu's** research…"* — should be "Dentsu's".
**Action:** fix copy in Airtable.

### #7 — Duplicate earnings graph (ID collision)
`earnings_calls` and `earnings-calls` both exist (underscore vs hyphen), both `supplemental` / Fodda Finance Pipeline, near-identical descriptions. `earnings_calls` has empty domain; `earnings-calls` has a domain + `last_updated`.
**Action:** deduplicate to one canonical ID; redirect/retire the other.

### #8 — Placeholder / missing curators
**8 graphs have `curator: "Industry Report"`** (should be the real author/org):
```
forrester-predictions2026_b2bmarketing
tiktok-marketing
visa-creators_report-2025
ecdb-global-ecommerce-outlook-2026
youtube-eoy_cats_trends_report_2025
mintel-2026_global_food_and_drink_predictions
bompasparr-future-of-food-and-drink-1
mintel-2026_global_household_predictions
```
Additionally **24 graphs have an empty-string curator** (mostly economic supplemental feeds).
**Action:** populate real curator/author names in Airtable. Decide whether empty-curator supplementals need a default attribution.
**Note:** `forrester-predictions2026_b2bmarketing` is new vs. the original audit list.

### #9 — Raw IDs surfacing as display names
**13 supplemental graphs have `graphs[].name` identical to the raw `graph_id`** (not humanized):
```
acs_tract, airnow, cbs_buurt, cbs_crime, epc_uk, fbi_crime, hud_housing,
luchtmeetnet, msc_aqhi, ons_neighbourhood, pdok_bag, police_uk, statcan_census
```
The humanized names already exist in the `supplemental_sources` block (e.g. "US Neighbourhood Demographics") — the join that populates those names didn't run for the `graphs[]` array.
**Action:** populate `graphs[].name` from the same source as `supplemental_sources`.

---

## Bonus (API behavior, not a data bug)
When `search_insights` falls back to trend nodes (because a graph has no evidence), it returns `count: 1` (top match only), which an agent can misread as "this graph has 1 trend." Consider returning all matching trend nodes in the fallback, or including the graph's total trend count.

## Confirmed intentional (do not change)
`supplemental_sources` anonymizes source names (FRED → "Federal Economic Indicators", Amazon → "Product & Pricing Reality") while the `graphs` array uses real names. This matches the "public payloads anonymize" design — flagged only so a downstream sheet doesn't read the wrong surface.

---

## Suggested grouping for delegation
- **Airtable copy/status edits (fast):** #1 (status flips), #4, #6, #7, #8
- **Ingestion / evidence-linker pipeline:** #1 (re-ingest option), #2, #3
- **API response join:** #9
- **API behavior tweak (optional):** search_insights fallback
- **No-regression check:** #5 (routing leak — already clean)

Please verify each against live data, assign owners, and report which items are confirmed bugs vs. intended behavior.
