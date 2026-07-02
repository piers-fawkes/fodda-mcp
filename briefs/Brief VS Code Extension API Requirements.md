# Brief: VS Code Extension — API & Website Requirements

**From:** MCP Agent (VS Code Extension coder)  
**To:** API Coder + Website Coder  
**Date:** May 3, 2026  
**Context:** The Fodda VS Code extension is built and packaged (`fodda-0.1.0.vsix`). These are the API and website changes needed for it to work cleanly in production and for the developer buyer persona to have a smooth upgrade path.

---

## A. MCP URL Stability Contract (API Coder)

The extension hard-codes the following MCP URL pattern:

```
https://mcp.fodda.ai/mcp?api_key={apiKey}&user_id={userEmail}
```

**Requirement:** Any changes to the following must be communicated to the MCP/extension coder **before deployment**:
- The URL path (`/mcp`)
- Query parameter names (`api_key`, `user_id`)
- MCP tool names or parameter schemas (e.g., renaming `search_graph`, changing `graphId` to `graph_id`)

**Why:** Breaking changes break every installed extension with no auto-update mechanism. Open VSX extensions update manually — users must download a new version. A URL change would silently break all developer connections.

**Action:** Treat the URL pattern and tool schema as a versioned API contract. If a breaking change is required, publish a new MCP endpoint version (e.g., `/v2/mcp`) and deprecate the old one with a 6-month sunset.

---

## B. Developer Buyer-Type — PAYG Token Exhaustion Routing (API Coder)

### Current State
When a Base plan user exhausts credits, the API returns a `CREDITS_EXHAUSTED` 403 response that includes a `payg` object. The MCP already surfaces both the upgrade and PAYG options to the user — this is fully implemented in:

- **API:** `tracking/lava.ts` (Lava integration), metering in `decrementCredits()`
- **MCP:** `src/errorHandling.ts` (classifies and formats the 403 response)
- **MCP Prompt:** `mcp_payg_exhaustion_prompt.md` (specifies how the MCP surfaces the PAYG option)
- **System Prompt:** `src/systemPrompt.ts` lines 197–201 (BASE CREDIT EXHAUSTION rules)

### What's Needed
When the API detects a **developer buyer type** (identified via the `X-Fodda-Source: vscode-extension` header or via buyer classification in `userEnrichmentService.ts`), the `payg.checkoutUrl` in the `CREDITS_EXHAUSTED` response should link to the **pricing page** (`https://www.fodda.ai/pricing`), not attempt to create a Lava checkout session directly.

The checkout session creation lives at `POST /api/checkout/lava-session` and is triggered from the pricing page UI — not from the MCP.

**This is a narrow change:** Confirm the developer buyer-type branch routes to the correct pricing page URL in the existing 403 response builder. No new Lava infrastructure needed.

### Reference Files
| File | Location | What It Does |
|------|----------|-------------|
| `lava.ts` | `/Fodda API/Fodda/functions/tracking/lava.ts` | Lava PAYG metering + balance check |
| `mcp_payg_exhaustion_prompt.md` | `/Fodda API/Fodda/briefs/mcp_payg_exhaustion_prompt.md` | Specifies MCP presentation of PAYG option |
| `errorHandling.ts` | `/Fodda MCP/src/errorHandling.ts` | Classifies and formats CREDITS_EXHAUSTED for MCP |
| `Pricing.tsx` | `/Fodda Website/pages/Pricing.tsx` | Pricing page with Lava checkout button |

---

## C. `.well-known/mcp.json` Discovery File (⚠️ Website Coder — NOT API Coder)

### What
A static JSON file at `fodda.ai/.well-known/mcp.json` that enables auto-discovery of the Fodda MCP server. Some AI agents (OpenAI, Gemini) look for this file on the root domain to find MCP servers without manual configuration.

### Current State
- ✅ `mcp.fodda.ai/.well-known/mcp.json` — **exists** (on the MCP server)
- ❌ `fodda.ai/.well-known/mcp.json` — **does not exist** (on the main website)

Agents look at the **root domain** (`fodda.ai`), not the subdomain. The MCP server's file helps nothing for auto-discovery.

### Implementation
This is a static file in a Vite project. Add it to the website's public directory:

**File:** `/Fodda Website/public/.well-known/mcp.json`

```json
{
  "name": "Fodda",
  "description": "Expert-curated knowledge graphs for AI agents — retail, beauty, fashion, sports, and 100+ specialist domains via Model Context Protocol.",
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

Vite will serve this from `dist/.well-known/mcp.json` → nginx/Cloud Run will serve it at the root path. No API code or server-side logic needed.

**Owner:** Website coder  
**Effort:** ~5 minutes (create file, redeploy)

---

## D. Extension Source Header (API Coder)

### What
The extension constructs MCP URLs that go through the existing MCP server. To enable attribution and analytics for the developer buyer persona, the API coder should:

1. **Log** the presence of an `X-Fodda-Source` header (or a `source=vscode-extension` query param) in API request analytics
2. **Use it for buyer-type routing** in item B above when available

### Implementation
The extension itself doesn't add custom headers (MCP URL is pasted into the IDE's MCP client, which controls the HTTP layer). However, the MCP server could append a source identifier when it detects the connection came from a known extension pattern.

**Alternative approach:** Add a `source` query param to the MCP URL the extension generates:
```
https://mcp.fodda.ai/mcp?api_key={key}&user_id={email}&source=vscode-extension
```

The MCP server already reads query params from the URL (`req.query`). The API coder should:
1. Forward `source` as an `X-Fodda-Source` header on all upstream API calls
2. Use it for attribution in Airtable/analytics
3. Use it to branch the `payg.checkoutUrl` in CREDITS_EXHAUSTED responses (item B)

---

## Summary of Ownership

| Item | Owner | Effort |
|------|-------|--------|
| A. URL stability contract | API Coder | Process (no code) |
| B. Developer PAYG routing | API Coder | Small (~10 lines in 403 response builder) |
| C. `.well-known/mcp.json` | **Website Coder** | Trivial (1 static file + redeploy) |
| D. Source header forwarding | API Coder | Small (~5 lines in MCP `index.ts` + API logging) |
