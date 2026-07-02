# Brief: Website — Audit & Fix Stale MCP Connection Instructions

## Context

A user (`creative@sudsies.com`) hit a 500 error connecting to the MCP server because they followed old instructions showing `Authorization: Bearer` headers and `X-Fodda-Mode: deterministic`.

The MCP server (`mcp.fodda.ai`) authenticates via **URL query parameters** for the primary Streamable HTTP endpoint:
```
https://mcp.fodda.ai/mcp?api_key=YOUR_KEY&user_id=YOUR_EMAIL
```

The SSE endpoint (`/sse`) does accept `Authorization: Bearer` headers — this is correct for CLI tools.

`X-Fodda-Mode` is **no longer a user-facing header**. Remove all references from public documentation.

## Files With Stale Instructions (confirmed via grep)

### 1. `pages/IntegrationVertexAI.tsx`

- **Line 90**: JSON-LD schema says "Point your MCP client to `https://mcp.fodda.ai/messages` with the required Authorization header" — `/messages` is a **dead endpoint** (returns 404). Must be updated to `/mcp` with URL params or `/sse` with Bearer.
- **Line 249**: Shows `Bearer YOUR_API_KEY` as the auth method.
- **Line 284**: Code block showing:
  ```
  Authorization: Bearer YOUR_API_KEY        # Required
  X-Fodda-Mode: constrained                 # Optional
  ```
  Both lines are wrong for the `/mcp` endpoint. `X-Fodda-Mode` must be removed entirely.
- **Lines 297-309**: Gemini ADK config showing Bearer + `X-Fodda-Mode: constrained`. The Gemini config should use the `/sse` endpoint with Bearer (which is correct), but remove `X-Fodda-Mode`.

### 2. `pages/IntegrationClaude.tsx`

- **Line 181**: FAQ answer showing `claude mcp add --transport sse fodda https://mcp.fodda.ai/sse --header "Authorization: Bearer YOUR_API_KEY"` — **this is correct** (SSE transport uses Bearer).
- **Line 744**: Same Claude CLI command — **also correct**.
- **Verify**: Make sure the primary Claude Web instructions show the URL-param method (`?api_key=...`), not Bearer headers.

## What Correct Instructions Look Like

### Vertex AI / Gemini ADK (SSE endpoint)
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
No `X-Fodda-Mode` header. SSE uses Bearer — that's correct.

### Claude Web (Streamable HTTP)
```
URL: https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL
```
No OAuth, no Bearer. Paste into Claude Settings → Connectors.

### Claude Code CLI (SSE)
```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

## Action Required

1. **IntegrationVertexAI.tsx**: Fix the dead `/messages` endpoint reference → use `/sse`. Remove all `X-Fodda-Mode` references. Update auth examples.
2. **IntegrationClaude.tsx**: Verify primary Claude Web instructions use URL params (not Bearer). The CLI/SSE examples are already correct — leave those.
3. **Global search**: Run `grep -rn "X-Fodda-Mode\|/messages" --include="*.tsx" --include="*.ts" --include="*.md"` to catch any other stale references across the website codebase.
