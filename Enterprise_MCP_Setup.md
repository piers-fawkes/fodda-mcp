# Fodda Enterprise MCP Setup Guide

This guide is designed for enterprise platform teams and AI engineers integrating the Fodda MCP server into enterprise environments (e.g., OpenAI Frontier, Anthropic Enterprise Connectors, or advanced local orchestration).

## 1. Transport Modes: Streamable HTTP vs SSE

The latest Fodda Enterprise MCP server runs both **Streamable HTTP (2025-11-25)** and backward-compatible **SSE (2024-11-05)** simultaneously.
- **Port:** Configured by `$PORT` (default 8080).

**Endpoints**
- **Streamable HTTP:** `http://localhost:$PORT/mcp`
  - *Best for:* OpenAI Frontier, Next-Gen MCP clients.
  - *Method:* GET to establish, POST to execute.
- **SSE:** `http://localhost:$PORT/sse`
  - *Best for:* Legacy Claude Code, basic HTTP SSE implementations.

The server advertises these via `.well-known/mcp.json`.

## 2. Setting Up Enterprise Defaults

### allowed tools list
To prevent LLM drift or expansive capability hallucination, define your precise toolset using the `ALLOWED_TOOLS` environment variable.
The default Fodda enterprise toolset is intentionally constrained to:
```bash
ALLOWED_TOOLS="search_graph,get_node,get_evidence,get_neighbors"
```

### Traceability & Observability
Fodda MCP natively supports **OpenTelemetry Distributed Tracing Headers**:
- Inject a `traceparent` header into your MCP `POST /mcp` tool execution request.
- The MCP server correlates this trace and injects a UUIDv4 `X-Request-Id` alongside it.
- Both headers are propagated to the Fodda upstream API for full-stack auditability, and all `mcp.tool_call` and `mcp.tool_error` structured logs map perfectly to these IDs.

## 3. Deployment Examples

### Google Cloud Run
1. `docker build -t gcr.io/YOUR_PROJECT/fodda-mcp:latest .`
2. `docker push gcr.io/YOUR_PROJECT/fodda-mcp:latest`
3. Deploy securely:
```bash
gcloud run deploy fodda-mcp \
  --image gcr.io/YOUR_PROJECT/fodda-mcp:latest \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars="FODDA_MCP_SECRET=your_secret,ALLOWED_TOOLS=search_graph,get_node"
```
*(Optionally layer Cloud IAM in front of Cloud Run to authenticate Enterprise plugins directly at the service level).*

## 4. Connecting 

### OpenAI Responses API (Frontier)
```json
{
  "mcp_servers": [
    {
      "name": "fodda",
      "transport": "http",
      "url": "https://mcp.yourdomain.com/mcp",
      "auth": {
        "type": "bearer",
        "token": "YOUR_API_KEY"
      }
    }
  ]
}
```

### Claude (Web — Pro, Max, Team)
Individual users can add Fodda as a custom connector directly in Claude:
1. Go to **Settings → Connectors → Add custom connector**
2. URL: `https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY`
3. Under **Advanced settings** — leave OAuth Client ID and Secret **blank** (Fodda uses API key auth, not OAuth)
4. Click **Add**

> **Why the key is in the URL:** Claude's web connector form only supports OAuth for auth — it doesn't have a "Custom headers" option. Since Fodda uses API key authentication, the key is passed as a URL parameter instead. The connection is over HTTPS, so the key is encrypted in transit.

### Claude Enterprise (Admin-Managed Connectors)
Enterprise workspace admins can register the Fodda MCP server via the Admin Console:
- **URL:** `https://mcp.fodda.ai/mcp?api_key=YOUR_ORG_API_KEY`
- **OAuth fields:** Leave blank (not used)
- **Fallback (SSE):** `https://mcp.fodda.ai/sse?api_key=YOUR_ORG_API_KEY`
- **Auto-discovery:** `https://mcp.fodda.ai/.well-known/mcp.json`

### Claude Code (CLI)
```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

## 5. Security & Error Handling

Fodda MCP employs a strict deterministic JSON error envelope pattern matching the upstream graph infrastructure:
```json
{
  "error": {
    "code": "INVALID_PARAMS",
    "message": "graphId is required for all Fodda tools except psfk_overview.",
    "requestId": "2b9211c4-..."
  }
}
```
No `HTML` errors or raw stack traces will ever be emitted out of the MCP tools wrapper. Ensure your orchestration agents inspect `isError: true` gracefully.
