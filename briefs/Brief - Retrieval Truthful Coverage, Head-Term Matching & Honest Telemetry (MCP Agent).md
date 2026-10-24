# Brief — Retrieval: Truthful Coverage, Head-Term Matching & Honest Telemetry (MCP Agent companion)

Execution handle: `/build-from-brief briefs/Brief - Retrieval Truthful Coverage, Head-Term Matching & Honest Telemetry (MCP Agent).md`

**To:** `mcp-agent` (Fodda MCP repo: `/Users/piersfawkes/Documents/Fodda MCP`)
**From:** `api-agent` (companion to Part A in Fodda API)
**Date:** 2026-10-24
**Context:** Derived from Part B of `brief_retrieval_sector_vocabulary_and_routing_API.md` (Thiago Bersou query-quality review). Part A (API-side sector vocabulary, routing hint, and ranking boost) is running in parallel in Fodda API.

---

## 1. Context

During diagnosis of Thiago Bersou's 83 logged queries, the MCP layer exhibited four critical telemetry and retrieval defects:
1. `layers_searched` and logged `searched_graphs` report candidate lists (or ~290-300 graphs) rather than what the API actually searched (which was 7 or 0).
2. `resultQuality` reports `STRONG` by matching superficial non-head tokens (e.g. "home" in a Pinterest Home row for a tequila query), inflated further by floor-lifts in `coverageRelevance.ts`.
3. The MCP tool schemas teach `sector: 'Alcoholic Drinks'` as the primary example value, while concurrently mirroring `sector` into `topic` (`params.set('topic', sector)`), multiplying hard-filter eliminations on the backend.
4. `suggested_action.arguments.graph_ids` dumps ~300 graph IDs on empty responses, and `search_graph` fails to strip evidence when `include_evidence: false` on the sector branch, producing ~147KB payloads.
5. Expert recommendations match modifiers like "home" instead of core category nouns, recommending home business strategists (Liz Parker) for at-home tequila/cocktail queries.

---

## 2. What to Build

### B1. Truthful Coverage and Telemetry (Highest Priority)
- **`layers_searched` (`src/coverageRelevance.ts:462-464`):**
  Currently derived from the MCP's pre-request candidate list, not from what the API actually searched. In the reproduced case it claimed six layers while `graphs_searched` was `[]`. Derive `layers_searched` strictly from the API response's `graphs_searched` / `graphs_with_results`.
- **Logged `searched_graphs` (`src/toolHandlers.ts:755-756`):**
  Thiago's stats rows log ~290 graph IDs when the API searched 7 or 0. Log the API-reported `graphs_searched` list.
- **`resultQuality` (`src/toolHandlers.ts:744-753`):**
  Currently flags `STRONG` when ≥5 rows pass any token match. The match counts "home" in a Pinterest Home row as on-topic for a tequila query, and `coverageRelevance.ts:565-577` lifts the count to ≥3 whenever the backend `on_topic_total` is high.
  - Remove that floor-lift.
  - Make the on-topic check require a match on the query's **head terms** (category/product nouns, e.g. "tequila", "soda", "sunscreen", "infant formula"), not on incidental modifiers like "home" or "weekday".
  - The API Part A judged eval set (`Fodda/eval/retrieval_thiago_2026_10/baseline_results.json`) is the calibration target: ensure STRONG/WEAK/MISS agrees with the ground-truth judge.
- **`research_gaps` guidance note (`src/toolHandlers.ts:2590`):**
  Soften the prompt instruction "Never describe coverage as limited in user-facing prose". When judged coverage is thin, the model should speak plainly that Fodda's coverage is thin on this specific niche and offer the Deep Dive. Keep the "recover via supplemental first" recommendation step.

### B2. Stop Teaching Failing Values; Stop Mirroring `sector` into `topic`
- **`sector` parameter descriptions (`src/toolHandlers.ts:2056`, `4800`, `4924`):**
  Currently leads with `'Alcoholic Drinks'`. Reword the `.describe()` string as a free-text category hint (e.g., `"e.g. tequila, sun care, infant formula, luxury"`) rather than an enumerated rigid list. Confirm TS-owned string stability.
- **Remove topic mirroring (`src/toolHandlers.ts:4862` and `4953`):**
  Delete `params.set('topic', sector);`. The API treats `topic` as an exact-equality match on graph topics; mirroring `sector` turns one filter into two.

### B3. Payload Size & Evidence Stripping
- **Cap suggested graph IDs (`src/coverageRelevance.ts:604-606`):**
  Cap `suggested_action.arguments.graph_ids` at the graphs that returned rows, or at most 10. Do not emit 300 IDs on empty responses.
- **Evidence stripping on `search_graph` (`src/toolHandlers.ts:2076-2079`):**
  `search_graph` requests evidence upstream and promises to strip it when `include_evidence: false`. Fix the strip and limit truncation on the sector branch so responses don't balloon to ~147K chars.

### B4. Expert Lane Matching
- **`findCandidateExperts` (`src/coverageRelevance.ts:966`):**
  Match expert lanes on the query's **head terms** (category/domain entities), not on modifiers like "home". Ensure an "at-home cocktail / tequila" query recommends drinks/spirits experts (e.g. Russell Davis, Thiago Bersou), not home business strategists (Liz Parker).

---

## 3. Definition of Done
- On the retrieval evaluation suite: no MCP response reports a layer or graph that the API did not search, and logged `searched_graphs` equals the API-reported list.
- STRONG/WEAK/MISS agreement with judged relevance improves noticeably over baseline.
- No empty response carries >10 suggested graph IDs.
- `search_graph` with `sector` and `include_evidence: false` returns ≤ `limit` rows with no raw evidence bodies.
- A tequila at-home query recommends a drinks expert, never Liz Parker.
- `npm run build` clean in `/Users/piersfawkes/Documents/Fodda MCP`.
- MCP package version bumped and `CHANGELOG.md` updated with verification results.

---

## 4. Files Expected to Change (in Fodda MCP repo)
- `src/toolHandlers.ts`
- `src/coverageRelevance.ts`
- `CHANGELOG.md`

## 5. Do Not
- Do not add new tools or a new `view` parameter.
- Do not hide thin-coverage signals from the model.
