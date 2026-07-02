# Brief: App — Audit & Fix Stale MCP Connection Instructions

## Context

A user (`creative@sudsies.com`) hit a 500 error connecting to the MCP server because they were using `Authorization: Bearer` headers and `X-Fodda-Mode: deterministic` — instructions that are **wrong** for the current MCP server architecture.

The MCP server (`mcp.fodda.ai`) authenticates via **URL query parameters**, not headers:
```
https://mcp.fodda.ai/mcp?api_key=YOUR_KEY&user_id=YOUR_EMAIL
```

The SSE endpoint (`/sse`) is the one exception — Claude Code CLI uses `--header "Authorization: Bearer"` for SSE transport, and the server does read that. But the primary Streamable HTTP endpoint (`/mcp`) reads `req.query.api_key`.

The old `X-Fodda-Mode: deterministic` header is **no longer used by end users** — the MCP server now sends `X-Fodda-Billing: mcp-orchestrated` internally.

## Files With Stale Instructions (confirmed via grep)

### 1. `frontend/components/AccountPortal.tsx`

- **Line ~416**: Shows `Authorization: Bearer ${account.apiKey}` — this may be for the API test panel (which is fine), but verify context.
- **Line ~1332**: Displays a `<pre>` block showing:
  ```
  Authorization: Bearer <YOUR_API_KEY>
  X-Fodda-Mode: deterministic
  ```
  This is likely in the MCP Integration section of the account portal. **This is almost certainly where the user got their instructions.** It must be updated to show the correct URL-based auth format.
- **Lines ~1389-1391**: Shows Claude CLI command with `--header "Authorization: Bearer"` for the SSE endpoint. **This one is correct** — SSE transport does use Bearer headers. But verify the URL is `https://mcp.fodda.ai/sse`.

### 2. `public/Fodda_Quickstart.md`

- **Lines 29, 40, 54, 89**: All show `Authorization: Bearer YOUR_API_KEY` as the auth method. These need updating:
  - For the Streamable HTTP (`/mcp`) endpoint: use URL params `?api_key=YOUR_KEY&user_id=YOUR_EMAIL`
  - For the SSE (`/sse`) endpoint: Bearer header is correct
  - Remove any `X-Fodda-Mode` references

### 3. `public/Fodda_Copilot_README.md`

- **Line 28**: Shows `Authorization: Bearer [YOUR_API_KEY]` — update to reflect URL param auth for `/mcp`.

### 4. `public/Fodda_Claude_Skill.md`

- **Lines 37, 48**: Shows Bearer auth. Update to match current auth model.

### 5. `frontend/App.tsx` and `shared/dataService.ts`

- These reference `Authorization: Bearer` and `X-Fodda-Mode` — may be internal API calls (which are fine) rather than user-facing instructions. Verify and leave internal usage alone.

## What Correct Instructions Look Like

### Claude Web (Streamable HTTP) — PRIMARY
```
URL: https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL
```
No OAuth, no Bearer header. Paste URL directly into Claude Settings → Connectors.

### Claude Code CLI (SSE)
```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```
Bearer header is correct for SSE transport.

### Gemini CLI (SSE)
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

## Action Required

1. Update `AccountPortal.tsx` MCP Integration section to show URL-param auth for the primary `/mcp` endpoint
2. Remove all `X-Fodda-Mode: deterministic` references from user-facing UI
3. Update the three public markdown files (`Fodda_Quickstart.md`, `Fodda_Copilot_README.md`, `Fodda_Claude_Skill.md`)
4. Keep SSE/CLI examples using Bearer header (that's correct)
5. Verify `App.tsx` and `dataService.ts` are internal usage only (no changes needed if so)
