# Brief: Expert Graph Ingestion Repair — 3 Graphs With Zero Trends

> **For:** Pipeline / Neo4j Sync Agent  
> **From:** MCP Server Agent (`Fodda MCP/`)  
> **Priority:** High — graphs are registered as `live` but contain no data  
> **Date:** 2026-04-01  
> **Dependency:** API Agent is blocked on this for embedding generation (see `Brief Expert Graph Embedding Repair.md`)

---

## Problem

3 of the 13 new expert graphs have `trend_count: 0` — they are registered as `status: "live"` in the graph registry but no Trend nodes exist in Neo4j. The PDF ingestion pipeline either didn't run or failed for these graphs.

## Affected Graphs

| Graph ID | Display Name | Curator | Expected Content |
|---|---|---|---|
| `ezra-eeman-wayfinder` | Ezra Eeman — Wayfinder | Ezra Eeman | Future of Work, hybrid work, organizational design, digital transformation |
| `automotive-color-trends` | BASF Automotive Color Trends | Renee Rashid-Merem (BASF) | Automotive color forecasting, car materials, coatings, vehicle aesthetics |
| `florian-schleicher-friction-unloaded` | Florian Schleicher — Friction Unloaded | Florian Schleicher | Deliberate friction in UX, anti-convenience, intentional slowness, analog resurgence |

## What to Do

1. **Locate the source PDFs** for these 3 graphs in the ingestion input directory or Airtable.
2. **Re-run PDF ingestion** for each graph. This should create Trend nodes in Neo4j with `graphId` set to the graph slug, plus Article/Evidence nodes linked via `EVIDENCED_BY`.
3. **Generate embeddings** — after Trend nodes exist, generate `gemini-embedding-001 (768d)` embeddings and write the `embedding` property. (Or flag the API Agent to handle this step.)

## Verify

```bash
curl -s "https://api.fodda.ai/v1/graphs" \
  -H "X-API-Key: fodda-internal-service-key" \
  -H "X-User-Id: qa-test" | python3 -c "
import sys,json
for g in json.load(sys.stdin).get('graphs',[]):
    if g['graph_id'] in ['ezra-eeman-wayfinder','automotive-color-trends','florian-schleicher-friction-unloaded']:
        print(f\"{g['graph_id']}: trend_count={g.get('trend_count',0)}\")"
```
Expected: `trend_count > 0` for all three.

Then verify vector search:
```bash
curl -s -X POST "https://api.fodda.ai/v1/graphs/ezra-eeman-wayfinder/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: fodda-internal-service-key" \
  -H "X-User-Id: qa-test" \
  -d '{"query": "hybrid work digital transformation", "limit": 3, "use_semantic": true}'
```
Expected: `search_path: "vector"`, `dataStatus: "TREND_MATCH"`.

## Reference

`mlb-sponsorship` was ingested correctly and serves as the working reference:
- trend_count: 10
- Vector search: works (`search_path: "vector"`)
- Node types: Trend, Article, Industry, Sector, Technology, Audience, Brand
