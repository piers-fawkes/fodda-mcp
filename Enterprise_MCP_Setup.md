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
1. Get your personal MCP URL at [app.fodda.ai](https://app.fodda.ai) → Connections (format: `https://mcp.fodda.ai/c/<your-token>`)
2. Go to **Settings → Connectors → Add custom connector**, paste the URL, click **Add**

> **Legacy query parameter URLs are retired.** The server rejects them with an explicit 401 response and tells the user to get a new MCP URL at [app.fodda.ai/connections](https://app.fodda.ai/connections). Connection tokens are opaque and revocable; OAuth authentication is also live for supported clients.

### Claude Enterprise (Admin-Managed Connectors)
Enterprise workspace admins can register the Fodda MCP server via the Admin Console:
- **URL:** `https://mcp.fodda.ai/mcp` (authentication via `Authorization: Bearer` header or the OAuth connector — never in the URL)

### Claude Code (CLI)
```bash
# Connect via OAuth:
claude mcp add --transport http fodda https://mcp.fodda.ai/mcp

# Or with an API key:
claude mcp add --transport http fodda https://mcp.fodda.ai/mcp \
  --header "Authorization: Bearer sk_live_..."
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
