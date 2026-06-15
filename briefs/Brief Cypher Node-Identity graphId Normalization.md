# Brief: Cypher — Normalize `graphId` at the Query Layer (Node Identity)

> **Type:** `[x] Bug Fix` · query-level
> **Priority:** `[x] P1`
> **Owner:** Neo4j Cypher work (the "Cypher query techniques" thread) — **single owner of the whole node-identity change.** Everything below lives in one file (`functions/v1/v1Router.ts`), so this brief covers both the query change *and* the thin handler residual. There is **no separate API hand-off** — `briefs/Brief API Node-Identity graphId Consistency.md` is folded into this and should not be actioned independently.
> **Source:** Round-2 audit + live re-verification 2026-06-12. All line refs are `functions/v1/v1Router.ts`.

## Why this is a Cypher problem

The same node reports three different `graphId`s depending on which tool you call (`search` → `retail`, `get_node` → `psfk`, `brainstorm` → `retail,food,…`). The root is that the **node-lookup query returns the raw stored `n.graphId` property**, which is stale/deprecated (`psfk`) or wrong (`tech`) — even though the query already *proved* which graph the node belongs to in its `WHERE` clause. The fix belongs in the `RETURN`, not in app code.

## Current query (`get_node`, ~L685-695) — the membership check is correct

```cypher
MATCH (n)
WHERE (toString(n.id) IN [$nodeId, $nodeIdAlt] OR toString(toInteger(n.trendId)) = $nodeId)
  AND (
    any(val IN split(toLower(coalesce(n.psfk_graph_slug, n.graphId, '')), ',') WHERE trim(val) = toLower($graphId))
    OR (n:Trend AND (n)<-[:CONTAINS_TREND]-(:PSFKGraph {slug: toLower($graphId)}))
    OR toLower(coalesce(n.psfk_vertical, '')) = toLower($graphId)
  )
RETURN n
LIMIT 1
```

**Verified:** this works for clean data — clean node 6678 (`slug: "retail"`) returns 200 for `retail`, **404** for `beauty/food/tech`. The check is fine. Two issues live in the `RETURN` and in the matching:

## Fix 1 — return the *matched, normalized* graph, not `n.graphId`

The membership clause matched on `$graphId`, so the authoritative graph for this lookup **is `$graphId`** (normalized for deprecation). Override it in the `RETURN` via map projection so the node never carries its stale property downstream:

```cypher
RETURN n { .*, graphId: $normalizedGraphId } AS n
LIMIT 1
```

- `$normalizedGraphId` = `$graphId` run through the deprecation alias (`psfk → retail`, `waldo → …`) — **the same normalization `search` already applies (§3)**, so the surfaces converge.
- Net: `get_node(retail, 6678)` returns `graphId: "retail"` instead of `psfk`.

## Fix 2 — consistency across the three queries

`search`, `get_node`, and `brainstorm` each compute `graphId` differently (slug-derived single / raw property / comma-joined slug). **Standardize:** derive the reported `graphId` from `psfk_graph_slug` (+ deprecation alias) in every query's `RETURN`; stop returning raw `n.graphId` as the user-facing value anywhere. For `brainstorm`, return a single normalized id (or an array) rather than the comma-joined slug string — overlaps the brainstorm `graph_id`→array P1 item.

## Fix 3 (optional stopgap) — mega-slug guard

> **Confirmed still needed on `search` — live re-verification 2026-06-15.** A `search_graph(graphId="sports")` run pulled ~13 tech/startup nodes (`psfk_graph_slug = "startup,tech,sports"`, e.g. 6611/6614/6618) plus two 7109-cluster nodes (6746, 6621, `relevance_score` > 1.0) into sports results. Per the API-agent scope audit, **0 of the 80 returned trends are canonically `graphId="sports"`** — they enter via the slug comma-list. Caveat for a "boost matching graph" variant: because `graphId` is stale, the guard/boost must key on **slug membership / `CONTAINS_TREND`**, not the `graphId` property (a `graphId == query` boost would match nothing). Full evidence + node IDs in `briefs/Brief Ingestion Data Integrity - PSFK Cluster and Validation Gates.md` §7.

A 7109-cluster node carries a corrupted 21-vertical `psfk_graph_slug` (`"beauty,retail,sports,food,…,B2C"`), so `split(slug, ',')` matches **every** graph — that's why corrupted node 6779 returns 200 for all graphs. The real fix is the ingestion cluster cleanup (already routed to PSFK). If you want a query-level stopgap until that lands, refuse the slug match when it looks like a mega-slug:

```cypher
// only treat the slug as authoritative if it isn't a corrupted catch-all
size(split(coalesce(n.psfk_graph_slug, ''), ',')) <= 6
AND any(val IN split(toLower(n.psfk_graph_slug), ',') WHERE trim(val) = toLower($graphId))
```
Mark this clearly as a stopgap — remove once ingestion de-corrupts the cluster.

## Fix 4 — handler residual (same file, while you're in `v1Router.ts`)

These are the thin non-Cypher bits that go with the query change — do them in the same pass so there's no separate API hand-off:
- **Pass `$normalizedGraphId`** (the deprecation-aliased request graph) into the `get_node` query params instead of the raw `graph_id`.
- **`search` and `brainstorm`:** make them report the *same* normalized, slug-derived `graphId` the query now returns — stop reading the raw stored `n.graphId` property as the user-facing value anywhere. (`search`'s §3 already does this; `brainstorm`'s `graph_id` should become a single normalized id or array, not the comma-joined slug string — this also closes the brainstorm `graph_id`→array P1 item.)
- Consider dropping the raw `graphId` property from serialized node output entirely once nothing reads it.

## Coordination (important)
- **Single owner for `v1Router.ts`.** This brief covers the entire node-identity change (query + handler residual). Don't let a separate API task also edit this handler — that's the whole reason it's merged here.
- **Override `graphId` in the `RETURN`, never in app code** — one place only.
- Reuse `search`'s existing deprecation-alias helper for `$normalizedGraphId` so the surfaces don't diverge.

## Acceptance
- [x] `get_node(retail, 6678)` → `graphId: "retail"` (not `psfk`). *(Verified live 2026-06-12.)*
- [x] `search`, `get_node`, `brainstorm` report the **same** normalized `graphId` for a given clean node. *(Shared `liveGraphsCypher`/`normalizedGraphIdCypher` helpers + `DEPRECATED_GRAPHS` in `functions/v1/utils.ts`; same rule as search §3.)*
- [x] `get_node` still 404s when a clean node isn't in the requested graph. *(Verified: `beauty/6678` → 404.)*
- [x] (Stopgap used) `get_node(beauty, 6779)` 404s even before the ingestion fix; remove the guard once the cluster is clean. *(Verified live.)*

## Implementation notes (2026-06-12, Cypher thread)
- Both `get_node` copies updated: the inline query in `v1Router.ts` **and** `GraphService.getNode` (used by the Claude plugin router, incl. its `'psfk'` fallback retry).
- The corruption is **not just the slug**: the 7109-cluster nodes also carry ~21 real `CONTAINS_TREND` edges, so the slug-only guard from this brief was insufficient. The guard was extended to the relationship arm (`COUNT { (n)<-[:CONTAINS_TREND]-(:PSFKGraph) } <= 6`). Live data is bimodal — clean trends have 1–6 containing graphs, corrupted have 11+ (30 nodes) — so ≤6 separates cleanly.
- Consequence: the 30 corrupted nodes 404 in **every** graph until the PSFK ingestion cleanup lands (their true graph is unknowable). Remove both guard arms together once the cluster is clean.
- `brainstorm`/`adjacent` (`GraphService.getAdjacent`) now returns `graph_id` (single normalized) + `graph_ids` (array); `vertical` is kept for back-compat but now holds the normalized single id, not the comma-joined slug.
- `$normalizedGraphId` is computed **in the RETURN** (CASE over the node's live slugs) rather than passed as a param — there is no standalone alias map in code; search's §3 normalization is node-dependent (requested-if-live, else first live slug), so the param-only sketch in Fix 1 couldn't reproduce it. Same rule, one Cypher fragment, reused by all three surfaces.
