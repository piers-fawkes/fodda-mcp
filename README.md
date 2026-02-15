# Fodda MCP Server

This MCP server provides access to Fodda's knowledge graph and analytical tools.

## Tools

### `search_graph`
Perform hybrid (keyword + semantic) search on a Fodda knowledge graph.
- **Inputs**: `graphId`, `query`, `userId`, `limit`, `use_semantic`

### `get_neighbors`
Traverse the graph from seed nodes to find related concepts.
- **Inputs**: `graphId`, `seed_node_ids`, `userId`, `depth`, `limit`, `relationship_types`

### `get_evidence`
Get source signals and articles for a node.
- **Inputs**: `graphId`, `for_node_id`, `userId`, `top_k`

### `get_node`
Retrieve metadata for a single node.
- **Inputs**: `graphId`, `nodeId`, `userId`

### `get_label_values`
Discover valid values for a node label.
- **Inputs**: `graphId`, `label`, `userId`

### `psfk_overview`
Get a structured macro overview from the PSFK Graph (max 3 meta_patterns).
- **Inputs**:
  - `userId` (Required)
  - `industry` (Optional, but required if sector is missing)
  - `sector` (Optional, but required if industry is missing)
  - `region` (Optional)
  - `timeframe` (Optional)
- **Note**: Does not require `graphId`.

## Authentication
Tools require `userId` and an API Key (passed via `_meta` or handled by the server environment).
