# Brief: Expert Graph Embedding Repair — Generate Missing Vector Embeddings

> **For:** API Agent (`Fodda API/`)  
> **From:** MCP Server Agent (`Fodda MCP/`)  
> **Priority:** High — 10 graphs are registered as `live` but vector search is broken  
> **Date:** 2026-04-01  
> **Blocked by:** Pipeline Agent must fix 3 empty graphs first (see separate brief)

---

## Problem

10 expert graphs have Trend nodes in Neo4j but their nodes **lack the `embedding` property**. When `POST /v1/graphs/{graph-id}/search` runs with `use_semantic: true`, these graphs fall back to `search_path: "keyword"` instead of `search_path: "vector"`, causing most queries to return `NO_MATCH`.

## Evidence

Every graph below was tested with `query: "innovation strategy"`. All returned `search_path: "keyword"` and `dataStatus: "NO_MATCH"`. By contrast, `mlb-sponsorship` (properly embedded) returns `search_path: "vector"` for the same query.

## Affected Graphs (10 — have trends, need embeddings)

| Graph ID | Trend Count |
|---|---|
| `juan-isaza-trends` | 8 |
| `braze-2026-trends` | 4 |
| `common-ground-trail-trends` | 8 |
| `dhl-ecommerce-trends-2026` | 8 |
| `firefish-treat-culture` | 22 |
| `havas-media-trends` | 10 |
| `joanna-haugen-travel-trends` | 16 |
| `marieke-neleman-trends` | 10 |
| `publicis-sapient-next-graph` | 10 |
| `alyson-stevens-macro` | 7 |

## What to Do

1. **Generate `gemini-embedding-001 (768d)` embeddings** for all Trend nodes in these 10 graphs. Write the `embedding` property to each Trend node in Neo4j. Use the same text-to-embed pattern as existing PSFK graphs (likely `trendName + trendDescription`).
2. **Ensure the shared vector index covers these nodes.** The existing PSFK graphs use a shared vector index — the expert graph Trend nodes should be included automatically if they have the `embedding` property. If the index needs a rebuild, do so.
3. **After Pipeline Agent fixes the 3 empty graphs**, run embedding generation for those 3 as well: `ezra-eeman-wayfinder`, `automotive-color-trends`, `florian-schleicher-friction-unloaded`.

## Verify

```bash
curl -s -X POST "https://api.fodda.ai/v1/graphs/juan-isaza-trends/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: fodda-internal-service-key" \
  -H "X-User-Id: qa-test" \
  -d '{"query": "consumer culture brand strategy", "limit": 3, "use_semantic": true}'
```
Expected: `search_path: "vector"`, `dataStatus: "TREND_MATCH"`, results with `semantic_score > 0.7`.

## No Changes Needed To

- Graph registry — all 13 are correctly registered as `live`
- Search endpoint logic — correctly falls back to keyword when embeddings are missing
- MCP server — already updated and deployed (v1.18.0)
