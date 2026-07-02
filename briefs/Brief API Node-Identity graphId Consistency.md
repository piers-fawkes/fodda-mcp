# Brief: API Node-Identity — Consistent `graphId` Across Surfaces

> **Type:** `[x] Bug Fix`
> **Priority:** `[x] P1` — chained calls / attribution; **scope is narrower than the round-2 spec implied** (see below).
> **Agent:** API agent (`functions/v1/`).
> **Source:** Round-2 audit + live re-verification 2026-06-12. Supersedes the "node identity" section of `briefs/Brief Round 2 Surface Audit - Evidence Ranking and Node Identity.md` with the corrected diagnosis.
>
> **🛑 FOLDED — do not action this brief independently.** Node-identity is a single change in one file (`functions/v1/v1Router.ts`), so it's been merged into **`briefs/Brief Cypher Node-Identity graphId Normalization.md`** (which now includes the thin handler residual as "Fix 4"). Hand over **that** brief, to a single owner. This file is kept only as the diagnosis record below.

---

## Corrected diagnosis (re-verified live)

The round-2 spec said "`get_node` ignores the graph." **That's not true for clean data.** Live probe:
- Clean node **6678** ("Small-Format Store Growth", `psfk_graph_slug: "retail"`): `get_node(retail, 6678)` → **200**; `get_node(beauty|food|tech, 6678)` → **404**. The graph check (`v1Router.ts:685-695` Cypher: `$graphId` must be in `psfk_graph_slug` / via `CONTAINS_TREND` / `psfk_vertical`) **works correctly.**
- Corrupted node **6779** (7109-cluster, 21-vertical mega-slug): matches **every** graph — but that's the **mega-slug data corruption**, already routed to the PSFK ingestor (cluster cleanup). Not an API bug.

So **most of the visible symptom clears when the ingestion cluster fix lands.** What remains is a genuine, narrow API inconsistency:

## The real issue — three surfaces, three `graphId` answers for the same node

| Surface | what it reports | node 6678 | field it reads |
|---|---|---|---|
| `search` (post-§3) | normalized single id derived from slug | `retail` ✅ | `psfk_graph_slug`, deprecated-aliased |
| `get_node` | the **raw stored `node.graphId` property** | **`psfk`** (deprecated) / `tech` (wrong) | stale node property |
| `brainstorm` | comma-joined raw slug string | `retail,food,…` | raw `psfk_graph_slug` |

`get_node` validated that 6678 is in `retail` (the Cypher matched on the slug) — then returned the node carrying its **stale `graphId` property** (`psfk`), contradicting `search`. That's what breaks chained calls and mis-attributes the curator.

## Fix

Make `graphId` **one consistent, normalized, slug-derived value** everywhere — never the raw stored `node.graphId` property.

1. **`get_node` graphId — handled in Cypher, not here.** The normalized `graphId` now comes from the query's `RETURN n { .*, graphId: $normalizedGraphId }` (see the Cypher brief). App-side: just pass the deprecation-normalized `$normalizedGraphId` into the query params and consume the result as-is. **Do not** add an app-code override on top.
2. **Single source of truth:** derive reported `graphId` from `psfk_graph_slug` (+ deprecation alias) across `search`, `get_node`, and `brainstorm`. Stop reading the stale `node.graphId` property anywhere it's user-facing; consider dropping it from serialized output entirely.
3. **`brainstorm`:** report a normalized single `graphId` (or array) per node, not a comma-joined slug string — this overlaps the existing brainstorm P1 item (`graph_id` → array), so fix together.

## Dependency / sequencing
- The "node appears in every graph" symptom is **gated on the ingestion 7109/mega-slug cleanup** — once that lands, corrupted nodes stop matching every graph. **Re-probe after the PSFK cluster fix deploys** (`scratch/probe_node2.mjs`) to confirm the residual is only the graphId-source inconsistency above.
- This API change is independent and can ship before or after the ingestion fix.

## Acceptance
- [ ] For a clean node, `search`, `get_node`, and `brainstorm` all report the **same** normalized `graphId` (e.g. `retail`, never `psfk`).
- [ ] `get_node(retail, 6678)` response shows `graphId: "retail"`, not `"psfk"`.
- [ ] `get_node` still 404s when a (clean) node isn't in the requested graph.
- [ ] After the ingestion cluster fix: `get_node(beauty, 6779)` 404s (no longer matches every graph).
