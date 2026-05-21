<div align="center">
  <img src="https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddaminilogo.png" alt="Fodda Logo" width="120"/>
  
  # Fodda MCP Server

  **Expert-curated knowledge graphs for AI agents** — PSFK Retail, Beauty, Sports and partner datasets via the Model Context Protocol.

  [![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.piers--fawkes%2Ffodda-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda)
  [![npm](https://img.shields.io/npm/v/fodda-mcp)](https://www.npmjs.com/package/fodda-mcp)
  [![Version](https://img.shields.io/badge/version-1.7.0-green)](./CHANGELOG.md)
  [![License](https://img.shields.io/badge/license-Proprietary-red)](https://fodda.ai)

</div>

---

## Quick Start

### Claude (Web — Pro, Max, Team, Enterprise)

**⚡ Quick Connect:** Use this [Add to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Fodda&connectorUrl=https%3A%2F%2Fmcp.fodda.ai%2Fmcp%3Fapi_key%3DYOUR_API_KEY%26user_id%3DYOUR_EMAIL) quick link (replace `YOUR_API_KEY` and `YOUR_EMAIL` in the URL before pressing enter).

**Manual Setup:**
1. In Claude, go to **Settings → Connectors → Add custom connector**
2. Enter URL: `https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL`
3. Under **Advanced settings** — leave OAuth Client ID and Secret **blank** (Fodda uses API key auth, not OAuth)
4. Click **Add** — then start chatting with your Fodda knowledge graphs

> Get your API key at [app.fodda.ai](https://app.fodda.ai) → Account → MCP Integration.  
> Your API key starts with `fk_live_...`  
> Use the email address associated with your Fodda account for `user_id`.

### Claude Code (CLI — SSE)

```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Claude Enterprise

For Claude Enterprise with admin-managed connectors, your workspace admin can register the Fodda MCP server using the same Streamable HTTP endpoint (`https://mcp.fodda.ai/mcp`) via the Admin Console. See [Enterprise MCP Setup](./Enterprise_MCP_Setup.md) for full details.

### OpenAI Frontier or Streamable HTTP Client
Connect to the `/mcp` endpoint using HTTP `GET` to establish a stream and `POST` to execute:
```bash
https://mcp.fodda.ai/mcp
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
| `list_graphs` | Discover available knowledge graphs and their schemas | ✅ |
| `search_graph` | Hybrid keyword + semantic search on a knowledge graph | ❌ |
| `get_neighbors` | Traverse from seed nodes to discover related concepts | ✅ |
| `get_evidence` | Source signals, articles, and provenance for a node | ✅ |
| `get_node` | Retrieve metadata for a single node by ID | ✅ |
| `get_label_values` | Discover valid values for a node label/category | ✅ |
| `discover_adjacent_trends` | Find semantically similar trends to a given trend | ✅ |

All tools require `userId` and — except `list_graphs` — a `graphId`.

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
| `PORT` | HTTP server port (omit for stdio mode) | — |
| `FODDA_API_URL` | Upstream API base URL | `https://api.fodda.ai` |
| `FODDA_MCP_SECRET` | HMAC signing secret for API requests | — |
| `NODE_ENV` | Environment (`development` / `production`) | `production` |

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

This server is published to the [Official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.piers-fawkes/fodda`.

```bash
# Verify listing
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda"
```

---

## License

Proprietary — [fodda.ai](https://www.fodda.ai)
