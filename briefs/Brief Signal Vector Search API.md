# Brief: Switch Signal Search to Native Vector Index

## Problem

The API's `getStatistics()` handler (in `graphService.ts`) searches for signals using an **indirect workaround**: it queries `article_summary_index`, then JOINs to find Signal nodes via `(s:Signal)-[:EVIDENCED_BY]->(a)`. This is both slower and less accurate than the direct vector search used for metric, quote, and interpretation.

The PSFK pipeline has been updated to:
1. Generate 768-dim embeddings on all `Signal` nodes
2. Create `signal_summary_index` (same spec as `metric_summary_index`)

The API should now switch to the direct vector index pattern.

## Current State

### Working pattern (metric, quote, interpretation)
```typescript
// graphService.ts line 551-558 — Metric example
const metricResult = await runLoggedQuery(
    localSession,
    buildEvidenceCypher('metric_summary_index', 'm', 'metricId'),
    searchParams, meta, "statistics_search"
);
metrics = metricResult.records.map((rec: any) => mapResultRecord(rec, 'metric', 'metricId'));
```

All three use the shared `buildEvidenceCypher()` helper (line 516–542) which generates a clean vector search query against the named index.

### Current signal workaround (lines 585–620)
```typescript
// Searches article_summary_index, then JOINs to Signal nodes
const signalCypher = `
    CALL db.index.vector.queryNodes('article_summary_index', toInteger($topK), $queryEmbedding)
    YIELD node AS a, score
    WHERE score >= $minScore
      AND (any(val IN split(toLower(coalesce(a.psfk_graph_slug, a.graphId, '')), ',') WHERE trim(val) = toLower($graphId)))
    MATCH (s:Signal)-[:EVIDENCED_BY]->(a)
    ...
`;
```

This is slow (scans all articles, then filters to the ~2,387 that have Signal nodes) and can miss signals whose parent Article scores below the threshold but whose Signal embedding would have scored higher.

## Required Change

### [MODIFY] `functions/v1/graphService.ts`

Replace the signal search block (lines 585–620) with the same one-liner pattern used by metric/quote/interpretation:

```typescript
if (requestedTypes.has('signal')) {
    promises.push((async () => {
        const localSession = getDriver().session({ database: NEO4J_DATABASE });
        try {
            const signalResult = await runLoggedQuery(
                localSession,
                buildEvidenceCypher('signal_summary_index', 's', 'signalId'),
                searchParams, meta, "signal_search"
            );
            signals = signalResult.records.map((rec: any) => mapResultRecord(rec, 'signal', 'signalId'));
        } catch (e) {
            console.log('[GraphService] Signal search skipped:', (e as any)?.message);
        } finally { await localSession.close(); }
    })());
}
```

That's ~8 lines replacing ~32 lines. The `buildEvidenceCypher` helper already handles:
- Vector index query with `$topK`, `$queryEmbedding`, `$minScore`
- Graph slug filtering (`psfk_graph_slug` / `graphId`)
- Optional parent Trend traversal via `EVIDENCED_BY → Article → EVIDENCE_FOR → Trend`
- All the standard return fields: `title`, `summary`, `source_url`, `publication`, `brands`, `place`, `vertical`, `score`, and parent trend metadata

## Why This Works

The `buildEvidenceCypher` helper (line 516) generates:
```cypher
CALL db.index.vector.queryNodes('signal_summary_index', toInteger($topK), $queryEmbedding)
YIELD node AS s, score
WHERE score >= $minScore
  AND (any(val IN split(toLower(coalesce(s.psfk_graph_slug, s.graphId, '')), ',') WHERE trim(val) = toLower($graphId)))

OPTIONAL MATCH (s)-[:EVIDENCED_BY]->(a:Article)-[:EVIDENCE_FOR]->(t:Trend)

RETURN
    s.id AS signalId,
    s.title AS title,
    s.summary AS summary,
    ...
```

This directly searches Signal node embeddings. The `OPTIONAL MATCH` still traverses back to the parent Article and Trend for context, exactly like the other evidence types.

## Verification

After deploying:

```bash
# Test signal search returns results
curl -s "https://[API_URL]/v1/graphs/psfk/statistics?query=sustainable+packaging&types=signal" \
  -H "x-api-key: [KEY]" | jq '.results | length'
# Expected: > 0

# Test types=all includes signals
curl -s "https://[API_URL]/v1/graphs/psfk/statistics?query=AI+retail&types=all" \
  -H "x-api-key: [KEY]" | jq '[.results[] | .type] | unique'
# Expected: ["interpretation", "metric", "quote", "signal"]
```

## Context

- **Prerequisite:** The PSFK pipeline (`Fodda PSFK/src/services/neo4j-sync.ts`) has been updated with Step 7f to generate Signal embeddings and create `signal_summary_index`. This must be deployed and run before the API change will work.
- **Risk:** Low — this simplifies the code by removing a custom query in favor of the shared helper. The fallback `catch` block ensures the API still returns gracefully if the index doesn't exist yet.
- **Lines of code:** Net reduction (~24 lines removed, 8 added).
