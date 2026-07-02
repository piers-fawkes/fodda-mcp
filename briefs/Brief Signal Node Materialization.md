# Brief: Materialize Signal Nodes for Vector Search

## Problem

The MCP's `search_insights(types=all)` endpoint searches four evidence types via dedicated Neo4j vector indexes:

| MCP type | Neo4j Label | Vector Index | Status |
|---|---|---|---|
| `metric` | `Metric` | `metric_summary_index` | ✅ Working |
| `quote` | `Quote` | `quote_summary_index` | ✅ Working |
| `interpretation` | `Interpretation` | `interpretation_summary_index` | ✅ Working |
| `signal` | ??? | ??? | ❌ **Missing** |

**Case studies exist in Neo4j** — there are **2,387 Article nodes** with `psfk_type` in (`case_study`, `Case Study`, `Case Studies`, `signal`, `Startup,Case Study`). But they live as generic `Article` nodes, not as a dedicated `Signal` label with its own vector index.

When the API receives `types=signal`, it has no `signal_summary_index` to search. Result: zero signal results, always.

## Current State (Cypher audit, April 4 2026)

```
=== Article psfk_type distribution ===
case_study:          1,279
Case Study:            971
Case Studies:           71
signal:                 38
Startup,Case Study:     28
                     -----
Total signal-class:  2,387

=== Existing vector indexes ===
article_summary_index         → Article [embedding]
metric_summary_index          → Metric [embedding]
quote_summary_index           → Quote [embedding]
interpretation_summary_index  → Interpretation [embedding]
```

## Required Changes

### 1. Materialize Signal nodes

Follow the same pattern used for Metric, Quote, and Interpretation:

- For each Article where `psfk_type` IN (`Case Study`, `case_study`, `Case Studies`, `Signal`, `signal`, `Startup`, `Startup,Case Study`):
  - Create/merge a `Signal` node
  - Copy the Article's `embedding` to the Signal node
  - Copy relevant properties: `title`, `summary`, `sourceUrl`, `published_date`, `psfk_graph_slug`, `brandNames`
  - Create relationship `(Signal)-[:DERIVED_FROM]->(Article)`
  - If the Article is linked to a Trend via `EVIDENCE_FOR`/`EVIDENCED_BY`, create `(Signal)-[:EVIDENCE_FOR]->(Trend)`

### 2. Create vector index

```cypher
CREATE VECTOR INDEX signal_summary_index IF NOT EXISTS
FOR (s:Signal) ON (s.embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 1536,
  `vector.similarity_function`: 'cosine'
}}
```

### 3. Normalize psfk_type values

The `psfk_type` field has inconsistent casing and values. During materialization, normalize:

| Raw value | Normalized MCP type |
|---|---|
| `Case Study`, `case_study`, `Case Studies` | `signal` |
| `Signal`, `signal` | `signal` |
| `Startup`, `Startup,Case Study` | `signal` |
| `Statistic`, `Statistics`, `metric` | `metric` |
| `Quote`, `quote`, `Speech/Interview`, `Speech-Interview`, `Interview` | `quote` |
| `Opinion`, `Analysis`, `interpretation` | `interpretation` |

Consider adding a normalized `evidence_type` property to all materialized nodes for consistent downstream querying.

### 4. Update the API search handler

The API's statistics/insights search handler needs to include the new `Signal` label when `types=signal` or `types=all` is requested. The search should use `signal_summary_index` for vector similarity, matching the pattern for metric/quote/interpretation.

## Verification

After the pipeline runs:

```cypher
-- Verify Signal nodes created
MATCH (s:Signal) RETURN count(s) AS signal_count

-- Verify vector index populated
SHOW INDEXES WHERE name = 'signal_summary_index'

-- Verify trend linkage
MATCH (s:Signal)-[:EVIDENCE_FOR]->(t:Trend)?
RETURN count(s) AS total_signals, count(t) AS linked_to_trends

-- Test vector search
CALL db.index.vector.queryNodes('signal_summary_index', 5, $embedding)
YIELD node, score
RETURN node.title, score
```

## Context

- **Who consumes this:** The Fodda API's `/v1/graphs/:graphId/statistics` endpoint, which powers both `search_statistics` and `search_insights` MCP tools
- **Why now:** The MCP workflow was updated to use `search_insights(types=all)` as a single call to gather all curated evidence. Without Signal materialization, case studies — which are the most compelling evidence type — are invisible to vector search
- **Priority:** Case studies are the proof a trend is real. The MCP's evidence presentation hierarchy puts them first. Right now they return zero results.
