<div align="center">
  <img src="https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddaminilogo.png" alt="Fodda Logo" width="120"/>
  
  # Fodda MCP Server

  **Expert-curated knowledge graphs for AI agents** — 100+ datasets across retail, beauty, sports, culture and more via the Model Context Protocol.

  [![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.piers--fawkes%2Ffodda-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda)
  [![npm](https://img.shields.io/npm/v/fodda-mcp)](https://www.npmjs.com/package/fodda-mcp)
  [![License](https://img.shields.io/badge/license-Proprietary-red)](https://fodda.ai)

</div>

---

Your AI produces generic output because it has generic context. Fodda gives it expert-curated knowledge and real institutional evidence — so it reasons better and explains its work.

Unlike flat text or generic retrieval, Fodda organizes insight as interconnected entities, relationships, evidence, and metadata — giving AI systems both the qualitative context and quantitative evidence they need for trusted, explainable outputs.

[Quick Start](#quick-start) · [Available Tools](#available-tools) · [Graph Showcase](#graph-showcase) · [How It Works](#how-it-works) · [REST API](#rest-api-reference) · [Self-Hosting](#self-hosting)

---

## Quick Start

After receiving your API key (`sk_live_...`), connect to Fodda in your preferred tool:

### Claude (Pro / Max / Team / Enterprise)
```
Connector URL: https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL
```
Paste into: **Claude → Settings → Connectors → Add custom connector**. Leave OAuth fields **blank**.

### Claude Code (CLI)
```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fodda": {
      "url": "https://mcp.fodda.ai/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor / Windsurf / Any MCP Client
```json
{
  "mcpServers": {
    "fodda": {
      "url": "https://mcp.fodda.ai/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Notion (Business / Enterprise)
1. Custom Agent → Tools & Access → Add connection → Custom MCP server
2. URL: `https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL`
3. Auth type: API Key → Key: `api_key`, Value: `YOUR_API_KEY`

### Microsoft 365 Copilot
Use the Agents Toolkit in VS Code → Add an Action → Start with an MCP Server → URL: `https://mcp.fodda.ai/sse`

### Google Gemini (via Vertex AI)
```json
{
  "tools": [{
    "type": "mcp",
    "name": "fodda",
    "url": "https://mcp.fodda.ai/sse",
    "headers": {
      "Authorization": "Bearer YOUR_API_KEY",
      "X-Fodda-Mode": "deterministic"
    }
  }]
}
```

### OpenAI Codex / ChatGPT (via REST API)
```bash
# List available graphs (public, no auth required)
curl https://api.fodda.ai/v1/graphs/catalog

# Search a graph
curl -X POST https://api.fodda.ai/v1/graphs/retail/search \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "checkout friction", "limit": 10, "use_semantic": true}'
```

> **No API key yet?** Try Fodda instantly by adding one of these trial connectors in [Claude](https://claude.ai/customize/connectors):
> | Graph | Trial Connector URL |
> |-------|---------------------|
> | 🛒 Retail | `https://mcp.fodda.ai/mcp?api_key=sk_trial_retail&user_id=claude-user` |
> | 💄 Beauty | `https://mcp.fodda.ai/mcp?api_key=sk_trial_beauty&user_id=claude-user` |
> | ⚽ Sports | `https://mcp.fodda.ai/mcp?api_key=sk_trial_sports&user_id=claude-user` |

---

## Available Tools

Once connected, your agent has access to these tools:

| Tool | Description |
|------|-------------|
| `list_graphs` | List all knowledge graphs you can access |
| `search_graph` | Search for trends, signals, and case studies |
| `get_evidence` | Get source articles and evidence for a trend |
| `search_insights` | Find expert quotes and qualitative analysis |
| `search_statistics` | Find curated data points and metrics |
| `get_adjacent_trends` | Discover related trends across graphs |
| `search_domain_graphs` | Search all curated domain graphs in one call |
| `search_expert_graphs` | Search all expert specialist graphs in one call |
| `search_filtered` | Semantic search with metadata filters (category, date, brand, geography) |
| `get_supplemental_context` | Unified access to 22 live institutional data sources |
| `deep_dive_research` | Autonomous deep-dive research with cited analysis |
| `research_chat` | Multi-turn conversational research with session memory |
| `get_my_account` | Check your account status and API call balance |

When using Fodda via MCP, your agent has access to **22 live institutional data sources** spanning US economic indicators, health & science databases, global trade data, academic research, and consumer market signals. These are accessed via the unified `get_supplemental_context` tool — you don't need to call individual sources directly.

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /mcp/tools` | Full tool schemas, versions, and capabilities |
| `GET /health` | Health check (`{ "status": "ok" }`) |
| `GET /.well-known/mcp.json` | MCP server auto-discovery manifest |

---

## Graph Showcase

Fodda hosts **100+ expert-curated knowledge graphs**. Here are some highlights:

| Graph | Curator | Coverage |
|-------|---------|----------|
| [PSFK Retail](https://www.fodda.ai/graphs/psfk-retail) | PSFK | Commerce, CX, and omnichannel retail |
| [PSFK Beauty](https://www.fodda.ai/graphs/psfk-beauty) | PSFK | Biotech, personalization, and wellness |
| [PSFK Sports](https://www.fodda.ai/graphs/psfk-sports) | PSFK | Fandom, performance, and media platforms |
| [SIC — Culture & Platforms](https://www.fodda.ai/graphs/sic) | Ben Dietz | Culture, media, marketing, and platform intelligence |
| [Publicis Sapient — Guide To Next](https://www.fodda.ai/graphs/publicis-sapient) | Jay Gallagher | Scaling enterprise AI and managing agentic debt |
| [TBWA Backslash — Edges](https://www.fodda.ai/graphs/alyson-stevens) | TBWA\Backslash | Cultural shifts with the scale to help brands secure the future |
| [Comunicano MLB](https://www.fodda.ai/graphs/mlb-sponsorship) | Andy Abramson | Technology and sponsorship reshaping Major League Baseball |
| [Dentsu Creative](https://www.fodda.ai/graphs/dentsu-generative-realities) | Pats McDonald | The intersection of technology and culture |
| [Edelman — Tipping Points](https://www.fodda.ai/graphs/edelman-tipping-points) | Edelman | Four reactions pushing settled truths towards a new tipping point |
| [BASF — Automotive Color Trends](https://www.fodda.ai/graphs/basf) | BASF Coatings | How societal forces drive automotive color decisions |

**See all graphs:** `curl https://api.fodda.ai/v1/graphs/catalog`

---

## How It Works

```
Your Agent (Claude, Cursor, Gemini, Copilot, etc.)
        ↓ calls MCP tools
Fodda MCP Server (mcp.fodda.ai)
        ↓ translates to REST calls
Fodda API (api.fodda.ai)
        ↓ queries
Neo4j Knowledge Graphs + Supplemental Sources
```

### What happens during a typical prompt

When you ask your agent a research question, the MCP server orchestrates multiple tool calls behind the scenes:

1. **`list_graphs`** — Agent discovers which graphs are relevant to your query
2. **`search_graph`** — Fires a hybrid semantic + keyword search across one or more graphs
3. **`get_evidence`** — Retrieves source articles backing the top trends
4. **`search_statistics`** — Pulls curated metrics, expert quotes, and signals
5. **`get_supplemental_context`** — The unified supplemental tool fires relevant institutional data sources based on your query content, returning quantitative evidence across economic, health, academic, and market categories
6. **`get_adjacent_trends`** — Discovers related trends across graph boundaries

A single prompt typically chains **6–10 tool calls** — this is why 1 MCP prompt ≈ 8 API calls.

### Supplemental data

The unified supplemental tool intelligently routes your query to the most relevant institutional data sources based on topic and domain. Results are consolidated into five stable categories — demand signals, economic context, market data, research signals, and demographic context — and woven into the agent's response with full source attribution.

---

## API Call Usage

| Unit | Cost |
|------|------|
| 1 request to the Fodda API | 1 API call |
| 1 MCP prompt | ≈ 8 API calls (multiple tool calls) |
| Deep dive research | 10 API calls (fast) or 25 API calls (comprehensive) |

Check balance with the `get_my_account` tool or at [app.fodda.ai](https://app.fodda.ai).

---

## REST API Reference

Base URL: `https://api.fodda.ai`

All private requests require: `X-API-Key: YOUR_API_KEY`

### Public Endpoints (no auth required)
- **GET /v1/graphs/catalog** — Public graph registry
- **POST /v1/psfk/overview** — LLM-synthesized industry overview

### Core Graph Endpoints (API key required)
- **POST /v1/graphs/:graph_id/search** — Hybrid semantic + keyword search
- **GET /v1/graphs/:graph_id/nodes/:node_id** — Node metadata lookup
- **POST /v1/graphs/:graph_id/neighbors** — Graph traversal
- **POST /v1/graphs/:graph_id/evidence** — Source articles for a trend
- **GET /v1/graphs/:graph_id/statistics** — Curated metrics, quotes, signals
- **GET /v1/graphs/:graph_id/adjacent** — Semantically similar trends
- **POST /v1/brand-intelligence/:brandName** — Cross-graph brand analysis

### Multi-Graph Search Endpoints (API key required)
- **POST /v1/search/domain** — Search all curated domain graphs
- **POST /v1/search/expert** — Search all expert specialist graphs
- **POST /v1/search/report** — Search all industry report graphs
- **POST /v1/search/filtered** — Semantic search with metadata filters

### Research Endpoints (API key required)
- **POST /v1/research/deep-dive** — Autonomous deep-dive research
- **POST /v1/research/chat** — Multi-turn research with session memory

### Copilot Adapter Endpoints (API key required)
- **POST /copilot/search_insights** — Flattened narrative insights
- **POST /copilot/get_evidence** — Trend-level supporting articles
- **POST /copilot/get_statistics** — Quantitative statistics search

Full API docs: [app.fodda.ai/knowledge/api-docs](https://app.fodda.ai/knowledge/api-docs)

---

## Authentication

Pass your Fodda API key as a Bearer token:

```
Authorization: Bearer sk_live_...
```

| Client | Auth method |
|--------|------------|
| Claude Web, Notion | URL parameter: `?api_key=sk_live_...` (HTTPS-encrypted) |
| Claude Code, Cursor, Desktop | Bearer header: `Authorization: Bearer sk_live_...` |

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port (omit for stdio mode) | — |
| `FODDA_API_URL` | Upstream API base URL | `https://api.fodda.ai` |
| `FODDA_MCP_SECRET` | HMAC signing secret | — |
| `ALLOWED_TOOLS` | Comma-separated allowlist of Enterprise Tool scope | `search_graph,get_node,...` |
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

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Unauthorized" | Verify API key starts with `sk_live_` — check at [app.fodda.ai](https://app.fodda.ai) |
| "Connector can't connect" | Leave OAuth fields **blank** in Claude |
| "Empty results" | Try thematic, conversational queries — full sentences work best |
| "Plan limit exceeded" | Upgrade at [fodda.ai/pricing](https://www.fodda.ai/pricing) |

---

## Best Practices

1. **Use thematic, conversational queries**: Full sentences work best — e.g., *"How are retailers removing friction from the buying journey?"* outperforms short keywords like *"checkout friction"*
2. **Search, then deep-dive**: First `search_graph`, then use `get_evidence` and `search_statistics` on specific trends
3. **Cross-graph discovery**: Use `get_adjacent_trends` to find connections between domains, or `search_domain_graphs` to search across all curated graphs at once
4. **Validate with data**: Use `get_supplemental_context` to add quantitative backing from institutional data sources
5. **Use filtered search**: When you know what you're looking for, use `search_filtered` with category, date, brand, or geography filters for precision results

---

## MCP Registry

This server is published to the [Official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.piers-fawkes/fodda`.

```bash
# Verify listing
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda"
```

---

## Links

- **Website**: [fodda.ai](https://www.fodda.ai)
- **App**: [app.fodda.ai](https://app.fodda.ai)
- **API Docs**: [app.fodda.ai/knowledge/api-docs](https://app.fodda.ai/knowledge/api-docs)
- **QuickStart Guide**: [Fodda_Quickstart.md](https://app.fodda.ai/Fodda_Quickstart.md)
- **npm**: [fodda-mcp](https://www.npmjs.com/package/fodda-mcp)
- **Support**: piers.fawkes@psfk.com

---

## License

Proprietary — [fodda.ai](https://www.fodda.ai)
