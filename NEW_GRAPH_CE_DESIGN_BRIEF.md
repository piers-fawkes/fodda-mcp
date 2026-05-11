# New Graph Available: `ce-design` (Consumer Electronics & Design)

## What Happened

A new Neo4j graph (`graphId: "ce-design"`) has been synced. It contains 22 trends, 279 evidence articles, 7 macro trends, and 222 taxonomy nodes (materials, forms, contexts, aesthetics, physical characteristics) covering consumer electronics design innovation.

## MCP Impact

The MCP server should already be able to query `ce-design` data through the existing Fodda API — the `search_graph`, `get_neighbors`, and `get_evidence` tools all accept a `graph_id` parameter.

### To enable for a user

When configuring a user's MCP access, set their graph to `ce-design`:
```
graph_id: "ce-design"
```

### What the graph contains

- **Trends**: Named design trends like "Biophilic Interfaces", "Smart Knobs", "Transparent Tech"
- **Articles**: Evidence supporting each trend — case studies, statistics, reports, interviews
- **Taxonomy**: Rich categorization via Materials, Forms, Context, Aesthetic, Physical Characteristics
- **Embeddings**: All trends and articles have 768-dim vectors for semantic search
- **Similarity**: Trends are connected via SEMANTICALLY_SIMILAR edges (cosine ≥ 0.78)

### Key difference from other graphs

CE articles do NOT have a numeric `articleId` — they use `airtableRecordId` (e.g., `recXXXXXX`) as their unique key. If the API returns `null` for article IDs, this is why. A fix has been briefed to the API team to use `coalesce(a.articleId, a.airtableRecordId)`.

### Taxonomy queries (future opportunity)

The CE graph has rich taxonomy edges not present in other graphs. These enable queries like:
- "Show me all products using recycled materials"
- "What trends are associated with wearable form factors?"
- "Find articles about minimalist aesthetics in home contexts"

If the MCP tools are extended to support taxonomy-based filtering, the CE graph would benefit significantly from it. This is not required for basic search/evidence functionality.
