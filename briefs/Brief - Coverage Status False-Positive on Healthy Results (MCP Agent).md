# Brief: MCP Agent — Coverage Status False-Positive on Healthy Results

> **For:** MCP Agent (`Fodda MCP`)  
> **Priority:** Normal — prevents false-positive `coverage.status = 'thin'` on healthy multi-graph searches returning 10 on-topic results.  
> **Date:** 2026-09-08  
> **From:** API Agent  
> **Files Expected to Change:** `src/coverageRelevance.ts`, `CHANGELOG.md`

---

## 1. Problem Statement

During live testing of multi-graph searches (e.g. Peter Abraham cycling search across specialist + macro graphs):
- The API returned 10 on-topic trends across 6 graphs with `dataStatus: "TREND_MATCH"` and `on_topic_total: 4` (Peter Abraham alone contributed 4 on-topic trends scoring 0.56–0.73).
- However, MCP's returned envelope marked:
  ```json
  "coverage": {
    "status": "thin",
    "results_returned": 10,
    "suggested_action": { "tool": "get_supplemental_context", ... }
  }
  ```
- This triggers the supplemental-recovery ladder on completely healthy results.

---

## 2. Root Cause in `src/coverageRelevance.ts`

In `addCoverageAnnotation()` (around lines 510–542):

1. **`isThinEvidence` False-Positive When Evidence Not Requested (~line 511):**
   ```typescript
   let isThinEvidence = false;
   if (!skipEvidenceCheck) {
       isThinEvidence = rows.every((r: any) => {
           const count = Array.isArray(r.evidence)
               ? r.evidence.length
               : Array.isArray(r.evidence_items)
                   ? r.evidence_items.length
                   : Array.isArray(r.evidenceItems)
                       ? r.evidenceItems.length
                       : Array.isArray(r.trendEvidence)
                           ? r.trendEvidence.length
                           : (r.evidence_count || r.evidenceCount || 0);
           return count < 3;
       });
   }
   ```
   When search is executed without inline evidence (`include_evidence: false` or omitted), trends do not carry `evidence` arrays, and `r.evidence_count` is 0. Consequently, `count < 3` is true for every row, making `isThinEvidence = true`!

2. **Ignoring Backend `dataStatus: "TREND_MATCH"` (~line 500):**
   Fodda API's backend evaluates vector similarity and relevance scores directly in the graph layer. When `normalizedData.dataStatus === 'TREND_MATCH'` (or `on_topic_total >= 3`), the backend has already confirmed that the returned trends are genuine on-topic matches. MCP's secondary heuristics should not downgrade a confirmed `TREND_MATCH` to `"thin"`.

---

## 3. What to Build

In `src/coverageRelevance.ts` inside `addCoverageAnnotation()`:

1. **Evidence Check Guard:**
   - Do NOT run `isThinEvidence` if rows do not contain evidence arrays or if evidence was not explicitly requested.
   - Alternatively, do not trigger `isThinEvidence` if `resultCount >= 3` and the query did not ask for evidence.

2. **Respect Backend `dataStatus` / `on_topic_total`:**
   - If `normalizedData.dataStatus === 'TREND_MATCH'` or `(normalizedData.on_topic_total || 0) >= 3`, do not mark `status = 'thin'`.
   - Maintain `status = 'ok'` when at least 3 on-topic results are present.

---

## 4. Definition of Done

- Querying `search_graph` for `"cycling"` or specialist queries returning >= 3 trends with backend `TREND_MATCH` yields:
  ```json
  "coverage": {
    "status": "ok",
    "results_returned": 10
  }
  ```
- `coverage.suggested_action` for supplemental recovery is NOT attached when coverage is `"ok"`.
- `npm run build` passes cleanly.
- `CHANGELOG.md` in `Fodda MCP` updated.
