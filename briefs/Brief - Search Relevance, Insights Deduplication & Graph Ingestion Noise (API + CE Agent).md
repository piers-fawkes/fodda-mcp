# Brief: Search Relevance, Insights Deduplication & Graph Ingestion Noise (API + CE Agent)

**Date**: 2026-10-05  
**Origin**: MCP Agent (from Claude client testing & evaluation of live queries)  
**Target**: Fodda API Agent (`functions/v1/`), Fodda CE Agent (Graph Ingestion & Schemas)  
**Status**: Ready for Implementation  

---

## 1. Context & Motivation

During live evaluation of natural customer inquiries in Claude (e.g. *"use fodda to give me examples of a founder led brand being bought and converted by an enterprise company"*), Claude surfaced significant upstream quality issues originating in the API search layer and graph ingestion pipeline.

While the MCP client correctly routes and queries available tools, the upstream responses degraded the user experience in four specific ways:
1. **Unbalanced Lexical Ranking**: A single incidental token match (e.g. "acquisition") overwhelmed semantic meaning, ranking *"Automakers Launching Niche Mobility Vehicles"* as the top result with `0.94` relevance.
2. **Duplicate Insights & "Dropped" Trends**: `/v1/insights/search` returned identical statistics twice (once per graph) and returned records tagged with status `"Dropped"` (tombstoned/removed by editors).
3. **Ingestion Noise in Specialist Graphs**: Specialist graphs (e.g., Ben Dietz's `ben-dietz-sic`) surfaced extraneous pop-science stats (marriage intent, pregnancy brain studies, weight loss) during brand acquisition queries.
4. **Unstructured Deal/M&A Modeling**: M&A events (acquisitions, buyouts, parent-brand integrations) are currently stored only as unstructured prose snippets rather than indexed business events (acquirer, target brand, deal type, date).

---

## 2. Work Required by Fodda API Agent

### A. Deduplicate & Filter Tombstoned Records in `/v1/insights/search`
- **Deduplication**: When an insight or metric is indexed across multiple graphs (e.g. Retail and Food), deduplicate by insight hash/id before returning results to clients.
- **Tombstone / Dropped Filter**: Ensure queries to Firestore / BigQuery exclude records where:
  - `status == 'dropped'`
  - `trend_status == 'dropped'`
  - `is_deleted == true`

### B. Balanced Search Ranking (`/v1/search`, `/v1/graphs/search`)
- Ensure hybrid vector + lexical scoring penalizes single-keyword outlier hits when the remainder of the query tokens and semantic embedding show near-zero cosine similarity.
- Queries seeking "brand acquisitions" should not elevate automotive manufacturing articles simply because the word "acquisition" appeared in a secondary paragraph.

---

## 3. Work Required by Fodda CE Agent

### A. Specialist Graph Ingestion Gates (`ben-dietz-sic` & Curated Feeds)
- Tighten the ingestion relevance filter on newsletter sidebars and peripheral web links.
- Ben Dietz's graph focuses on brand culture, youth subcultures, media, and creative strategy. Lifestyle/medical links (pregnancy brain, marriage demographics) should be filtered out during extraction or gated as low-relevance metadata so they don't pollute cross-domain searches.

### B. Structured Modeling for Corporate & Brand Acquisitions
- Define or populate a structured `M&A_Event` / `Acquisition` entity or relationship:
  - `acquirer_name`: string (e.g. Danone, Supreme, Estée Lauder)
  - `target_brand`: string (e.g. Huel, SlimFast, Deciem)
  - `deal_type`: enum (`majority_acquisition`, `minority_stake`, `licensing`, `brand_buyout`)
  - `year`: integer / string
  - `post_acquisition_status`: string
- When queries ask for "brand being bought by enterprise", this structured index will allow exact retrieval instead of fuzzy text scanning.

---

## 4. Acceptance Criteria
- `/v1/insights/search` returns 0 rows tagged as `"Dropped"`.
- Duplicate statistics across graphs are consolidated into a single entry with multi-graph attribution.
- Querying "founder-led brand bought and converted by enterprise" does not return automotive mobility vehicles at >0.90 relevance.
- [SIC] Weekly graph queries do not return off-topic medical/pop-science snippets.
