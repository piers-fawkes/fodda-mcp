# Brief: API Changes for Evidence Deduplication in Fodda API

## Problem

When querying `search_insights` or `search_statistics` (which call `/v1/graphs/:graphId/statistics`), the API returns the exact same evidence node (e.g. quote `quo_13500.0`) multiple times. For example, a single quote from Anu Lingala returned 6 times against different parent trends.

This happens because the underlying Cypher query matches paths like `(s:Evidence)-[:EVIDENCED_BY]->(a:Article)-[:EVIDENCE_FOR]->(t:Trend)` and returns a separate row for each matching Trend `t`. This creates redundant noise that crowds out other unique evidence items in Claude's context.

---

## Required Changes in Fodda API

### [MODIFY] `functions/v1/graphService.ts` (in `getStatistics` / `getStatisticsSearch` handler)

Update the response mapping/deduplication logic for the `/v1/graphs/:graphId/statistics` endpoint:

1. **Deduplicate by Evidence Node ID**:
   - Before returning the `statistics` array, group the results by the unique evidence ID (e.g., `id`, `metricId`, `quoteId`, `signalId`, or `interpretationId`).
   - If IDs are missing/null, fallback to grouping by the exact combination of `title` and `summary`.

2. **Select the Highest-Scoring Association**:
   - For each unique evidence node, keep only the record with the highest `relevance_score` / `score`.
   - The single `parent_trend` object in the returned item should represent the trend that matched with the highest score.

3. **Optional: Aggregate Associated Trends**:
   - To prevent losing graph context, collect all other matched trends for that evidence item into a new `parent_trends` array on the evidence object:
     ```json
     "parent_trends": [
       { "trendId": 6503, "trendName": "Trend A" },
       { "trendId": 6838, "trendName": "Trend B" }
     ]
     ```
   - Keep the existing single `parent_trend` field pointing to the highest-scoring one to preserve backwards compatibility.

---

## Verification

Run the test query that previously returned duplicates:
- Path: `GET /v1/graphs/:graphId/statistics?query=future of brand strategy&types=quote`
- Verify that:
  - Each unique quote ID (e.g. `quo_13500.0`) appears exactly once in the `statistics` array.
  - The response is populated with diverse quotes, not the same quote repeated.
  - The `suggested_followup_queries` are diverse and align with the deduplicated trends.
