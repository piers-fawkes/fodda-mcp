# Fodda MCP Server

This MCP server provides access to Fodda's knowledge graph and analytical tools. It enables AI agents to query the graph, retrieve evidence, and generate macro insights.

## Features

- **Graph Search**: Hybrid keyword and semantic search.
- **Traversal**: Neighbor discovery and relationship mapping.
- **Evidence Retrieval**: Access to source signals and articles.
- **Macro Insights**: High-level industry and sector overviews.
- **Simulated Mode**: `gemini_echo` mode for tool invocation testing.

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

## Configuration

The server is configured via environment variables. Create a `.env` file in the root directory:

```env
PORT=8080                   # Port for the SSE server (default: stdio if unset)
FODDA_API_URL=              # URL of the Fodda API (default: https://api.fodda.ai)
NODE_ENV=production         # Environment mode (development|production)
INTERNAL_TEST_KEYS=         # Comma-separated list of keys allowed to use simulation headers in production
```

## Usage

### Building
```bash
npm install
npm run build
```

### Running (Stdio)
```bash
npm start
```

### Running (SSE)
```bash
PORT=8080 npm start
```

## Authentication
Tools require `userId` and an API Key. The API Key must be passed in the `_meta` field of the MCP request under `authorization` (Bearer token) or handled by the server environment.
