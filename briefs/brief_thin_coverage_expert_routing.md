# Brief — Thin-Coverage Expert Routing (lane-match, not array order)

**For:** mcp-agent (Fodda MCP repo)
**From:** Piers, from prospect feedback (Patrick Nancarrow, performance-marketing tester, Aug 2026)
**Status:** Ready
**Execution:** `/build-from-brief briefs/brief_thin_coverage_expert_routing.md`

## Context

Prospect evidence: catalog-wide search for "creative effectiveness benchmarks" came back thin and surfaced **Anu Lingala (cultural macro-trends)** as the recommended expert — wrong lane for a squarely performance-marketing query. A scoped Dentsu search correctly surfaced **Nathan Grotticelli**, and in-consult referral behavior is good. So the confident path works; the thin-coverage fallback is the miss.

Code reality (verified 2026-08-24) — the thin-coverage pick has **no ranking at all**:

- `src/coverageRelevance.ts:1028-1069` inside `generateNextMoves()`: the expert is chosen with `activeAnalysts.find(...)` — **first match in Airtable roster order**. No score, no lane weighting.
- The match itself barely fires: two key-casing mismatches make the intended signals dead.
  - `src/catalogCache.ts:113-135` caches the raw `/v1/analysts` payload with no normalization. The API emits `id` and `expertIn`; the `CatalogAnalyst` interface (`catalogCache.ts:66-82`) expects `analyst_id` / `expert_in`. Result: the "analyst whose graph was searched" branch is dead (`a.analyst_id` is always undefined), the emitted `specific.expert.analyst_id` is undefined, and the lane lookup at `coverageRelevance.ts:1053` always falls through to a description-first-clause fallback. (`toolHandlers.ts:900` already normalizes these keys for `list_analysts` — catalogCache never got the same treatment.)
  - `outside_their_lane` / `blindSpots` is not represented in `CatalogAnalyst` at all, so the picker structurally cannot exclude an expert whose declared blind spot covers the query.
- The fallback token match (`coverageRelevance.ts:1046`) is an unanchored substring test — a single short token anywhere in a name or description qualifies.
- `status` (`ok | thin | empty`) is passed into `generateNextMoves` (line 616) but the expert block ignores it; the `reason` string is hardcoded optimistic (`coverageRelevance.ts:1060-1062`): "covers … directly" even on an empty result.
- On unscoped fan-out, `toolHandlers.ts:1020-1025` maps `getRelevantGraphs(query)` results to bare graphs, **discarding the relevance scores** before the expert picker ever sees them.
- Why the scoped path works: `toolHandlers.ts:1229` puts exactly one deliberately-chosen graph in scope, and the surfaced expert comes from that graph's curator metadata (`catalogCache.ts:258-283` `buildDisplayName()`), which has no casing problem.

## What to build

1. **Normalize catalyst keys in `catalogCache`** (`fetchAnalysts` / `getAnalysts`): map `analyst_id ← id`, `expert_in ← expertIn`, and carry `outside_their_lane ← blindSpots | outside_their_lane | outsideTheirLane` into `CatalogAnalyst` — same aliasing `toolHandlers.ts:900-908` already does for `list_analysts`.
2. **Replace `.find()` with a lane-fit score** over active analysts in `coverageRelevance.ts:1028-1069`:
   - Positive signals: query-token / topic overlap against `expert_in`, `description`, `topics`; boost analysts whose own graph scored high in `getRelevantGraphs` — pass the scores through `toolHandlers.ts:1020-1025` instead of discarding them.
   - Negative signal: **exclude or heavily penalize** an analyst whose `outside_their_lane` matches the query.
   - Require a minimum fit score to surface an expert at all; a no-fit result should omit the expert step rather than name whoever is first in the roster.
3. **Make the reason honest and status-aware**: on `thin`/`empty`, say the coverage was thin and this is the nearest-lane expert (e.g. "closest expert lane for this topic"), never "covers this directly" unless the fit signal actually supports it.
4. **Keep the scoped/curator path as-is** — it's correct; this brief changes only the fan-out fallback.

## Where to register

- No new tools or endpoints; behavior change inside `search_graph`'s `next_moves` envelope.
- If the bibles describe next_moves expert selection, update the matching bible and bump `Last updated:` in the same change.

## Definition of Done

- Repro test: catalog-wide "creative effectiveness benchmarks" (thin coverage) surfaces the performance/growth expert (Nathan Grotticelli), not a cultural-trends expert. Add this as a case to `src/test_next_moves_transcripts.ts`.
- Scoped Dentsu search still surfaces Nathan via curator metadata (regression check).
- `specific.expert.analyst_id` is populated (no longer undefined) in emitted next_moves.
- A query with no reasonable lane match omits the expert step instead of naming the first roster entry.
- `CHANGELOG.md` updated with actual before/after transcript output as verification.

## Do Not

- Do not rename `outside_their_lane` in user-visible output or echo the raw `blindSpots` key (see `src/systemPrompt.ts:75`).
- Do not touch the in-consult referral logic — it already works.
- Do not add per-query LLM calls to rank experts; keep scoring lexical/metadata-based (context and latency budget).

## Files-changed (expected)

- `src/catalogCache.ts` (key normalization, `CatalogAnalyst` interface)
- `src/coverageRelevance.ts` (scored picker, status-aware reason)
- `src/toolHandlers.ts` (pass graph relevance scores through)
- `src/test_next_moves_transcripts.ts` (new repro case)
- `CHANGELOG.md`
