# Fodda MCP Server

**Expert-curated knowledge graphs for AI agents** — PSFK Retail, Beauty, Sports and partner datasets via the Model Context Protocol.

[![MCP Registry](https://img.shields.io/badge/MCP_Registry-ai.fodda%2Fmcp--server-blue)](https://registry.modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-1.3.0-green)](./CHANGELOG.md)

---

## Quick Start

### Claude Code

```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Gemini CLI

```json
{
  "tools": [{
    "type": "mcp",
    "name": "fodda",
    "url": "https://mcp.fodda.ai/sse",
    "headers": { "Authorization": "Bearer YOUR_API_KEY" }
  }]
}
```

### Generic SSE Client

Connect to `https://mcp.fodda.ai/sse` with an `Authorization: Bearer YOUR_API_KEY` header.

---

## Available Tools

| Tool | Description | Deterministic |
|------|-------------|:---:|
| `search_graph` | Hybrid keyword + semantic search on a knowledge graph | ❌ |
| `get_neighbors` | Traverse from seed nodes to discover related concepts | ✅ |
| `get_evidence` | Source signals, articles, and provenance for a node | ✅ |
| `get_node` | Retrieve metadata for a single node by ID | ✅ |
| `get_label_values` | Discover valid values for a node label/category | ✅ |
| `psfk_overview` | Structured macro overview across industries and sectors | ❌ |

All tools require `userId` and — except `psfk_overview` — a `graphId`.

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /mcp/tools` | Full tool schemas, versions, and capabilities |
| `GET /health` | Health check (`{ "status": "ok" }`) |
| `GET /.well-known/mcp.json` | MCP server auto-discovery manifest |

---

## Authentication

Pass your Fodda API key as a Bearer token:

```
Authorization: Bearer fk_live_...
```

In MCP request `_meta`:
```json
{ "_meta": { "authorization": "Bearer fk_live_..." } }
```

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | SSE server port (omit for stdio mode) | — |
| `FODDA_API_URL` | Upstream API base URL | `https://api.fodda.ai` |
| `FODDA_MCP_SECRET` | HMAC signing secret | — |
| `NODE_ENV` | Environment (`development` / `production`) | `production` |
| `INTERNAL_TEST_KEYS` | Comma-separated keys for simulation mode | — |
| `RATE_LIMIT_RPM` | Requests per minute per API key | `60` |

---

## Build & Run

```bash
npm install
npm run build

# Stdio mode
npm start

# SSE mode
PORT=8080 npm start
```

## Self-Hosting

- **Docker**: `docker build -t fodda-mcp . && docker run -p 8080:8080 -e PORT=8080 fodda-mcp`
- **Cloud Run**: `./deploy_cloud_run.sh`
- **Kubernetes**: See [`deployment/k8s/`](./deployment/k8s/)
- **Terraform**: See [`deployment/terraform/`](./deployment/terraform/)

---

## MCP Registry

This server is published to the [Official MCP Registry](https://registry.modelcontextprotocol.io) as `ai.fodda/mcp-server`.

```bash
# Verify listing
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server"
```

---

## License

Proprietary — [fodda.ai](https://www.fodda.ai)
