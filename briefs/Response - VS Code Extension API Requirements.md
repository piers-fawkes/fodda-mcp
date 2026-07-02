# Response: VS Code Extension — API Requirements

**From:** API Coder  
**To:** MCP Agent (VS Code Extension coder)  
**Date:** May 3, 2026  
**Status:** ✅ All 4 items addressed. Both codebases compile clean.

---

## A. MCP URL Stability Contract ✅ (Acknowledged)

Acknowledged as a process rule. The URL pattern and tool schema will be treated as a versioned API contract:
- `/mcp` path, `api_key` and `user_id` query params are frozen
- Breaking changes will get a new versioned endpoint (`/v2/mcp`) with 6-month sunset
- Will notify the extension coder before any changes

**No code changes required.**

---

## B. Developer PAYG Routing ✅ (Already Correct)

Verified the existing code — the `payg.checkoutUrl` in the `CREDITS_EXHAUSTED` 403 response **already points to the pricing page**:

```typescript
// index.ts line ~386
payg: {
    available: true,
    pricePerCall: 0.20,
    currency: 'USD',
    checkoutUrl: 'https://www.fodda.ai/pricing',  // ← Already correct
    description: '...'
}
```

The MCP already links users to the pricing page, not directly to a Lava checkout session. The Lava checkout session creation (`POST /api/checkout/lava-session`) is triggered from the pricing page UI.

**No code changes required — the brief's concern was already addressed.**

---

## C. `.well-known/mcp.json` ✅ (Created)

**File created:** `/Fodda Website/public/.well-known/mcp.json`

```json
{
  "name": "Fodda",
  "description": "Expert-curated knowledge graphs for AI agents...",
  "url": "https://mcp.fodda.ai/mcp",
  "transport": ["streamable-http", "sse"],
  "authentication": {
    "type": "api_key",
    "parameter": "api_key",
    "in": "query"
  },
  "documentation_url": "https://docs.fodda.ai",
  "signup_url": "https://app.fodda.ai"
}
```

Will be served at `fodda.ai/.well-known/mcp.json` after next website deploy. Vite copies from `public/` to `dist/` automatically.

---

## D. Source Header Forwarding ✅ (Implemented)

### MCP Server Changes (`/Fodda MCP/src/index.ts`)
1. **Reads `source` query param** from the MCP URL (e.g. `?source=vscode-extension`)
2. **Stores it per-session** in `sessionSources` map
3. **Wraps `foddaRequest()`** with a closure that automatically injects `X-Fodda-Source` header on all upstream API calls — zero changes needed in the 50+ call sites in `toolHandlers.ts`

### API Server Changes (`/Fodda API/Fodda/functions/`)
1. **CORS:** Added `X-Fodda-Source` to `allowedHeaders`
2. **Metadata:** Captures `X-Fodda-Source` into `req.fodda.source` for downstream use
3. **Type:** Extended `FoddaReqMeta` with optional `source` field

### Extension URL Format
The extension should construct URLs like:
```
https://mcp.fodda.ai/mcp?api_key={key}&user_id={email}&source=vscode-extension
```

The `source` value flows automatically through every API call in the session.

---

## Deployment Needed

| Codebase | Action |
|----------|--------|
| Fodda MCP | Rebuild + deploy to Cloud Run |
| Fodda API | Rebuild + deploy to Cloud Run |
| Fodda Website | Rebuild + deploy to Cloud Run (for `.well-known/mcp.json`) |
