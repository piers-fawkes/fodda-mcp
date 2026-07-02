# Brief: Website — Update OpenAI Integration Page for Responses API MCP

> **Type:** `[x] Agent Task`
> **Priority:** `[x] P1 — High`
> **Agent(s):** Website agent
> **Triggered by:** OpenAI released native MCP support in the Responses API (June 2025)

---

## 1. Objective

OpenAI now supports **native MCP connections** in their Responses API — developers pass `type: "mcp"` with `server_url: "https://mcp.fodda.ai/mcp"` and OpenAI handles the full MCP handshake (tool listing, tool calling, session management) automatically. This is a significantly simpler integration path than the legacy function-calling approach.

The website's OpenAI integration page needs to be updated to **show both approaches**, with the Responses API MCP pattern as the **primary/recommended** method and function calling as a clearly-labeled fallback.

## 2. Why Show Both (Not Just MCP)

**Show both, with Responses API as primary.** Rationale:

- The Responses API is still relatively new — many developers are still on `chat.completions.create()` with function calling
- Some OpenAI SDK versions and wrappers don't support the Responses API yet
- Function calling gives developers more control over the API call (custom error handling, caching, retry logic)
- Showing both demonstrates Fodda works with the full OpenAI ecosystem, not just the newest API
- Keep the page scannable by using a tabbed layout or clear section separation (don't make it feel cluttered)

## 3. Page Structure (Recommended)

```
Hero / Intro
  "Connect Fodda to OpenAI — two ways to access knowledge graphs from GPT models"

━━━ Option A: Responses API with Native MCP (Recommended) ━━━
  Badge: "✨ Recommended — Zero setup"
  Description: OpenAI handles the MCP connection natively. No function definitions needed.
  Code tabs: Python | JavaScript | cURL
  
  Key features to highlight:
  - server_url: "https://mcp.fodda.ai/mcp"  
  - authorization: "Bearer sk_live_..."
  - require_approval: "never" (or show filtering with allowed_tools)
  - server_description for better model routing (see suggested text below)
  - Works with gpt-5, gpt-5.5, and later models
  
━━━ Option B: Function Calling (Legacy / Advanced) ━━━
  Badge: "🔧 Advanced — Full control"
  Description: Define custom functions, handle Fodda API calls yourself.
  (Keep existing function-calling code, lightly updated)
  
━━━ FAQ / Troubleshooting ━━━
```

## 4. Code Examples for Option A

### Python
```python
from openai import OpenAI

client = OpenAI()

resp = client.responses.create(
    model="gpt-5",
    tools=[{
        "type": "mcp",
        "server_label": "fodda",
        "server_description": "Expert-curated knowledge graphs covering retail, beauty, sports, consumer electronics, F&B trends, plus earnings intelligence and institutional research data.",
        "server_url": "https://mcp.fodda.ai/mcp",
        "authorization": "Bearer sk_live_YOUR_API_KEY",
        "require_approval": "never",
    }],
    input="What are the top emerging retail trends for Q3 2025?",
)

print(resp.output_text)
```

### JavaScript
```javascript
import OpenAI from "openai";
const client = new OpenAI();

const resp = await client.responses.create({
  model: "gpt-5",
  tools: [{
    type: "mcp",
    server_label: "fodda",
    server_description: "Expert-curated knowledge graphs covering retail, beauty, sports, consumer electronics, F&B trends, plus earnings intelligence and institutional research data.",
    server_url: "https://mcp.fodda.ai/mcp",
    authorization: "Bearer sk_live_YOUR_API_KEY",
    require_approval: "never",
  }],
  input: "What are the top emerging retail trends for Q3 2025?",
});

console.log(resp.output_text);
```

### cURL
```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5",
    "tools": [{
      "type": "mcp",
      "server_label": "fodda",
      "server_description": "Expert-curated knowledge graphs for retail, beauty, sports trends and earnings intelligence.",
      "server_url": "https://mcp.fodda.ai/mcp",
      "authorization": "Bearer sk_live_YOUR_API_KEY",
      "require_approval": "never"
    }],
    "input": "What are the top emerging retail trends for Q3 2025?"
  }'
```

## 5. Suggested `allowed_tools` Examples

For developers who want to limit which Fodda tools GPT can access (reduces latency with 30+ tools):

```python
# Discovery only
"allowed_tools": ["list_graphs", "search_graph", "search_statistics", "search_insights"]

# Earnings focus
"allowed_tools": ["get_earnings_intelligence", "get_earnings_divergence", "brand_tracker"]

# Research mode
"allowed_tools": ["deep_research_topic", "check_research_status", "search_graph"]
```

Add these as a collapsible "Advanced: Filter available tools" section under the Responses API code.

## 6. Recommended `server_description` Text

```
"Expert-curated knowledge graphs covering retail, beauty, sports, consumer electronics, F&B trends, plus earnings intelligence and institutional research data from PSFK and partner datasets."
```

This helps OpenAI's model decide when to route queries to Fodda vs. other tools.

## 7. What NOT to Change

- Keep the existing function-calling (Option B) code largely as-is — just relabel it as "Legacy / Advanced"
- Don't remove any existing auth instructions
- The `/mcp` endpoint URL is already correct — do NOT use `/sse` for the Responses API examples (OpenAI prefers Streamable HTTP)

## 8. Auth Notes

- Fodda uses API key auth, NOT OAuth
- For the Responses API, pass the key as: `"authorization": "Bearer sk_live_..."`
- OpenAI does NOT store the `authorization` value — it must be sent on every request
- No OAuth Client ID/Secret needed (same as Claude connectors)

## 9. Relevant OpenAI Documentation

- Responses API MCP guide: https://developers.openai.com/api/docs/guides/mcp-connectors
- Model compatibility: https://developers.openai.com/api/docs/models (check MCP tool support)
- Supported transports: Streamable HTTP and HTTP/SSE

## 10. CHANGELOG Entry

```
### Changed
- OpenAI integration page: Added Responses API native MCP as primary connection method (recommended), moved function calling to secondary/legacy section
```
