# Brief: Domain Search — Graceful Degradation & Cross-Graph Score Normalisation

**Endpoint:** `POST /v1/search/domain`
**Priority:** High
**Identified by:** QA observation on "GLP-1 impact on beauty industry skincare" query

---

## Context

A real-world query against `get_domain_intelligence` ("GLP-1 impact on beauty industry skincare") returned 5 trends scored at exactly 0.967 — all of them unrelated to GLP-1 or beauty (e-commerce growth, wellness wearables, Leon's Furniture, hotel travel). The `graphs_searched` field correctly showed `["sports", "retail", "beauty", "fashion"]` — meaning the beauty graph was searched but sports dominated every result. A control query ("fan monetization sports betting participatory fandom") returned correctly differentiated scores (0.974, 0.973, 0.958) with on-topic, named-brand results.

The 0.967 tie to 3 decimal places is not a relevance ranking. It is a symptom of two distinct problems:

1. **Score collapse fallback** — when cosine similarity can't find good matches, the endpoint silently substitutes high-`signal_score` trends regardless of topical fit, returning them at a manufactured ceiling score.
2. **Cross-graph volume bias** — the sports graph has more trends and evidence items than the beauty graph, so its absolute cosine scores consistently outcompete smaller graphs even on off-topic queries.

In agentic contexts (Claude, Cursor, VS Code), the LLM treats results as authoritative. Returning irrelevant trends at high scores is worse than returning nothing — it produces confidently wrong output that the user has no way to detect.

---

## Fix 1: Score Collapse — Graceful Degradation

**Problem:** When no trend cluster matches the query well, the endpoint returns high-signal-score trends at a manufactured score (~0.967) instead of signalling low coverage.

**Required behaviour:**

- After running vector search, check the **highest relevance score** in the result set.
- If `max_relevance_score < 0.75`, treat this as a low-coverage response.
- Return a response with:
  ```json
  {
    "trends": [],
    "graphs_searched": ["sports", "retail", "beauty", "fashion"],
    "low_coverage": true,
    "coverage_message": "No strong matches found for this query in the searched graphs. The beauty, sports, retail, and fashion graphs were searched but no trend cluster scored above the relevance threshold.",
    "max_relevance_score": 0.61
  }
  ```
- Do **not** fall back to returning high-`signal_score` trends when there are no good cosine matches. High signal score = high evidence volume, not topical fit.
- The threshold of 0.75 should be configurable via an internal env var or query param. Start there — adjust after observing real query distributions.

**Why this matters:** `get_expert_intelligence` already behaves correctly — it returns zero results when no expert graph covers the topic. Domain intelligence should match that behaviour. Honest empty returns are better for agentic callers than authoritative-sounding wrong results.

---

## Fix 2: Cross-Graph Volume Bias — Per-Graph Score Normalisation

**Problem:** The cross-graph result merge compares **absolute** cosine scores across graphs of different sizes. A larger graph (sports: ~200+ trends) will statistically produce higher absolute scores than a smaller graph (beauty: ~60 trends) even on off-topic queries, because more trends = more chances for peripheral cosine overlap.

**Required change:**

Before merging results across graphs, **normalise each graph's scores within its own distribution.**

Simplest working approach:
1. Run vector search per graph → get raw scores per graph.
2. For each graph independently: normalise scores to [0, 1] using the graph's own min/max, or use z-score normalisation relative to that graph's score distribution.
3. Merge normalised scores across graphs.
4. Sort merged list by normalised score descending.

This ensures a beauty graph trend ranked #1 within beauty competes on equal footing with a sports graph trend ranked #1 within sports — rather than the sports graph winning by sheer volume.

**Alternative (simpler, acceptable as interim fix):** Cap each graph's contribution to the merged result to a proportional slot — e.g., if 4 graphs are searched, allocate up to `ceil(limit / 4)` slots per graph, fill them by per-graph relevance, then merge. This prevents any single graph from monopolising the result list.

---

## Fix 3: Within-Trend Evidence Ranking

**Observed:** In the fan monetization control query, Trend 2 had 44 evidence items but the 5 returned included a luxury resale market sizing stat that didn't fit the trend label ("fandom monetization through sustainability"). This suggests the top-5 evidence items per trend are being selected by `published_at` or total evidence count rather than by cosine proximity to the trend's query match.

**Required change:**

When selecting the top-N evidence items to return per trend, rank them by **cosine similarity between the evidence embedding and the query embedding**, not by date or count. The query embedding is already computed during the search step — reuse it for evidence ranking within each result trend.

---

## Acceptance Criteria

- [ ] A "GLP-1 impact on beauty industry skincare" query against `POST /v1/search/domain` returns `low_coverage: true` with empty or near-empty results, not 5 sports trends at 0.967.
- [ ] A "fan monetization sports betting participatory fandom" query continues to return differentiated, on-topic results (regression check).
- [ ] A "sustainable packaging beauty" query returns beauty graph results at the top, not retail or sports graph results.
- [ ] When `low_coverage: true`, the response includes `graphs_searched`, `max_relevance_score`, and a human-readable `coverage_message`.
- [ ] The `min_score` query parameter (already exposed on the MCP tool) correctly filters the result set — results below `min_score` are excluded, even if this means returning fewer than `limit` results.
