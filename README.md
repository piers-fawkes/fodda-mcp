<div align="center">
  <img src="https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddaminilogo.png" alt="Fodda Logo" width="120"/>
  
  # Fodda MCP Server

  **Expert-curated knowledge graphs for AI agents** — PSFK Retail, Beauty, Sports and partner datasets via the Model Context Protocol.

  [![MCP Registry](https://img.shields.io/badge/MCP_Registry-ai.fodda%2Fmcp--server-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server)
  [![npm](https://img.shields.io/npm/v/fodda-mcp)](https://www.npmjs.com/package/fodda-mcp)
  [![Version](https://img.shields.io/badge/version-1.30.0-green)](./CHANGELOG.md)
  [![License](https://img.shields.io/badge/license-Proprietary-red)](https://fodda.ai)

</div>

---

## Quick Start

### Claude (Web — Pro, Max, Team, Enterprise)

1. Get your personal MCP URL at [app.fodda.ai](https://app.fodda.ai) → Account → MCP Integration (format: `https://mcp.fodda.ai/c/<your-token>`)
2. In Claude, go to **Settings → Connectors → Add custom connector**, paste the URL, and click **Add**
3. Start chatting with your Fodda knowledge graphs

> **Note:** legacy `?api_key=` or `?user_id=` query string URLs are deprecated and return HTTP 401 with explicit instructions (`Fodda: this connection URL is outdated. Get your new MCP URL at https://app.fodda.ai...`). Get your fresh MCP URL or connect via OAuth at [app.fodda.ai](https://app.fodda.ai).


### Claude Code (CLI — SSE)

```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### Claude Enterprise

For Claude Enterprise with admin-managed connectors, your workspace admin can register the Fodda MCP server using the same Streamable HTTP endpoint (`https://mcp.fodda.ai/mcp`) via the Admin Console. See [Enterprise MCP Setup](./Enterprise_MCP_Setup.md) for full details.

### OpenAI (Responses API — Recommended)

Use OpenAI's native MCP support — no function definitions needed:

```python
from openai import OpenAI
client = OpenAI()

resp = client.responses.create(
    model="gpt-5",
    tools=[{
        "type": "mcp",
        "server_label": "fodda",
        "server_description": "Expert-curated knowledge graphs for retail, beauty, sports trends and earnings intelligence.",
        "server_url": "https://mcp.fodda.ai/mcp",
        "authorization": "Bearer YOUR_API_KEY",
        "require_approval": "never",
    }],
    input="What are the top emerging retail trends?",
)
print(resp.output_text)
```

```javascript
import OpenAI from "openai";
const client = new OpenAI();

const resp = await client.responses.create({
  model: "gpt-5",
  tools: [{
    type: "mcp",
    server_label: "fodda",
    server_description: "Expert-curated knowledge graphs for retail, beauty, sports trends and earnings intelligence.",
    server_url: "https://mcp.fodda.ai/mcp",
    authorization: "Bearer YOUR_API_KEY",
    require_approval: "never",
  }],
  input: "What are the top emerging retail trends?",
});
console.log(resp.output_text);
```

> **Tip:** To reduce latency with 30+ tools, use `allowed_tools` to filter:
> `"allowed_tools": ["search_graph", "search_statistics", "brand_tracker"]`

> **Legacy:** If you're using `chat.completions.create()` with function calling, define a custom function that calls the Fodda REST API. See [fodda.ai/connect](https://app.fodda.ai) for details.

### Connect from ChatGPT (ChatGPT Apps Directory)

To connect Fodda to ChatGPT (Apps Directory listing or a custom MCP connection):
- Server URL: `https://mcp.fodda.ai/chatgpt`
- Authentication: OAuth 2.1 (PKCE S256, Dynamic Client Registration) — authorization server `https://clerk.fodda.ai` (metadata at `https://clerk.fodda.ai/.well-known/oauth-authorization-server`)
- Resource metadata discovery: `https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt`
- Curated tool profile: 24 tools covering trends, brand tracking, earnings intelligence, expert intelligence, and visual generation.

### Generic Streamable HTTP Client

Connect to the `/mcp` endpoint using HTTP `POST` (Streamable HTTP) with `Authorization: Bearer YOUR_API_KEY`:
```
https://mcp.fodda.ai/mcp
```

### Gemini / Antigravity

Add to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "fodda": {
      "serverUrl": "https://mcp.fodda.ai/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Generic SSE Client

Connect to `https://mcp.fodda.ai/sse` with an `Authorization: Bearer YOUR_API_KEY` header.

---

## Available Tools

The Fodda MCP server exposes a rich suite of 30 tools to search, analyze, brainstorm, and visualize trends, expert-curated knowledge graphs, and corporate documents.

### Discovery & Search
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `list_graphs` | Discover available knowledge graphs, metadata, and routing instructions. | ✅ |
| `search_graph` | Hybrid keyword + semantic search across curated graphs for trend clusters and evidence. | ❌ |
| `search_statistics` | Search for specific quantitative metrics, indicators, and numeric data points. | ❌ |
| `search_insights` | Search expert quotes, qualitative signals, and professional interpretations. | ❌ |
| `get_label_values` | Discover valid values for a node label or category. | ✅ |

### Traversal & Graph Operations
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `get_neighbors` | Traverse from seed nodes to discover related concept nodes and links. | ✅ |
| `get_node` | Retrieve detailed metadata, properties, and attributes for a single node by ID. | ✅ |
| `get_evidence` | Retrieve source signals, articles, citations, and provenance for a trend or node. | ✅ |
| `discover_adjacent_trends` | Find semantically similar trends to a given trend node. | ✅ |

### Intelligence Domains
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `get_domain_intelligence` | Search all PSFK curated domain graphs (retail, beauty, sports, fashion, consumer electronics, F&B) in parallel. | ❌ |
| `get_expert_intelligence` | Query specialist industry graphs built by leading strategists and experts. | ❌ |
| `get_report_intelligence` | Search institutional report insights from DHL, PwC, Delta, and other partners. | ❌ |

### Earnings & Corporate Insights
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `get_earnings_intelligence` | Query management commentary, business guidance, and Q&A from company earnings calls. | ❌ |
| `get_earnings_divergence` | Detect deflections, gaps, and divergence between analyst concerns and executive responses in earnings calls. | ❌ |

### Brand & Ideation
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `brand_tracker` | Compile a comprehensive Brand Intelligence Profile across all knowledge graphs. | ❌ |
| `brainstorm_topic` | Graph-powered brainstorm map discovering unexpected connections and adjacent territories. | ❌ |

### Deep Research & Execution Agents
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `deep_research_topic` | Launch an autonomous research session combining graphs with live web search. | ❌ |
| `check_research_status` | Check progress or retrieve the final narrative report of a deep research job. | ✅ |
| `get_supplemental_context` | Fetch macro context from up to 10 institutional data sources in a single query. | ❌ |
| `check_supplemental_status` | Retrieve output from a supplemental context job. | ✅ |

### Synthetic Analyst & Visualization
| Tool | Description | Deterministic |
|------|-------------|:---:|
| `list_analysts` | List available Synthetic Analyst expert personas. | ✅ |
| `consult_analyst` | Engage a Synthetic Analyst persona to synthesize answers with specialized voice. | ❌ |
| `generate_visual` | Generate branded SVG data visualizations (Cultural Shifts, Competitive Compass, Innovation Pathway, etc.). | ❌ |
> **Note on Dynamic Partner Skills:** When partner skills (such as Paralogy or Igloo) are enabled for a user's account, additional specialized tools (e.g. `paralogy_analyze_trends`, ideation tools) are dynamically registered on the MCP server and made available automatically.
>
> **Note on System Utilities:** The server also registers several helper and account management utilities (e.g., `get_my_account`, `toggle_graph_preference`, `update_user_profile`, `manage_scheduled_reports`, `send_feedback`) to allow the AI assistant to query subscription status, manage scheduled briefings, or save personalization settings directly.

---

### Discovery Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (`{ "status": "ok", "version": "..." }`) |
| `POST /mcp` | MCP endpoint — call the standard `tools/list` method on an initialized session to retrieve full tool schemas and capabilities |

---

## Authentication

**Preferred — HTTP header (used by the directory connection and all header-capable clients).**
Pass your Fodda API key as a Bearer token:

```
Authorization: Bearer sk_live_...
```

The server also accepts the key via an `X-API-Key: sk_live_...` header.

In MCP request `_meta`:
```json
{ "_meta": { "authorization": "Bearer sk_live_..." } }
```

**Fallback — URL query parameter.** Some clients (e.g. the Claude.ai web *custom
connector* UI) cannot set custom request headers. For those, the key may be passed as
`?api_key=...`. This is provided only for compatibility; prefer header-based auth
wherever the client supports it, since URLs are more likely to be logged by
intermediaries. The server never returns your API key in tool output.

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

This server is published to the [Official MCP Registry](https://registry.modelcontextprotocol.io) as `ai.fodda/mcp-server`.

```bash
# Verify listing
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server"
```

---

## Privacy Policy

Full policy: **[https://www.fodda.ai/privacy](https://www.fodda.ai/privacy)**

Summary of how the Fodda MCP server handles data (the hosted policy is authoritative):

- **What we collect.** *Account information* (name, email, organization) to manage your
  account; *usage data* — API queries (query text, graph accessed, timestamps) logged for
  billing, service improvement, and abuse prevention; and standard *technical data* (IP,
  browser type, referral URLs). We do **not** store the full content of AI-generated
  responses. Your API key authenticates requests and is never returned in tool output.
- **How it's used.** To provide and improve the Services, process billing, enforce rate
  limits and prevent abuse, communicate support/service updates, and meet legal
  obligations. Requests are proxied to the Fodda API (`https://api.fodda.ai`) over TLS.
- **Third-party sharing.** We do **not** sell your personal information. Data is shared
  only with service providers (e.g. payment processors, cloud hosting) under
  confidentiality agreements, or when required by law.
- **AI model training.** Fodda does **not** use your queries or data to train AI models.
  Knowledge graphs are expert-curated, not generated from user interactions.
- **Retention.** Account information is retained while your account is active; query logs
  are retained for billing and analytics. You may request account/data deletion via the
  contact below.
- **Security.** TLS-encrypted connections, API-key authentication, and secure cloud
  infrastructure.
- **Contact.** Privacy inquiries: **[privacy@fodda.ai](mailto:privacy@fodda.ai)**.

See the [full hosted Privacy Policy](https://www.fodda.ai/privacy) (last updated
June 16, 2026) for the complete, authoritative terms.

---

## Support

- **Email:** [hello@fodda.ai](mailto:hello@fodda.ai)
- **Account & API keys:** [app.fodda.ai](https://app.fodda.ai) → Account → MCP Integration
- **Documentation:** [fodda.ai](https://www.fodda.ai)

To report a security issue, email **[hello@fodda.ai](mailto:hello@fodda.ai)** with
"SECURITY" in the subject line.

---

## License

Proprietary — [fodda.ai](https://www.fodda.ai)
