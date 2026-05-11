# Fodda Skill Developer Guide

> **Version**: 1.1  
> **Last Updated**: 2026-04-12  
> **For**: Third-party developers building MCP-compatible skills for the Fodda platform

---

## What is a Fodda Skill?

A Fodda Skill is an **external MCP server** that post-processes Fodda's knowledge graph output. When a user enables your skill, Fodda automatically calls your MCP server after completing its research pipeline, passes your server the structured search results, and appends your transformed output to the user's response.

**Skills are not knowledge graphs.** They don't contain data — they transform, filter, reframe, or augment existing Fodda data before it reaches the user.

### Current Skills

| Skill | What it does |
|-------|-------------|
| **Paralogy** | "Structured creative friction" — reframes trend data through divergent-thinking lenses so strategists don't get the same answer as everyone else |
| **Igloo** | "Stability gate" — evaluates trends for groundedness and filters unsubstantiated signals |

---

## How It Works

```
┌──────────┐     ┌───────────────────┐     ┌──────────────────────┐
│   User   │────▶│ Fodda MCP Server  │────▶│ Your Skill MCP Server│
│ (Claude, │     │                   │     │                      │
│  Copilot,│     │ 1. search_graph() │     │ Receives:            │
│  App)    │     │ 2. get_evidence() │     │   • query             │
│          │     │ 3. supplemental   │     │   • trends[]          │
│          │◀────│                   │◀────│   • evidence[]        │
│          │     │ Response + skill  │     │                      │
│          │     │ output appended   │     │ Returns:             │
└──────────┘     └───────────────────┘     │   transformed text   │
                                           └──────────────────────┘
```

**Step by step:**

1. User asks a question through any MCP client (Claude, Copilot, the Fodda App, etc.)
2. Fodda runs its normal research pipeline — graph search, evidence gathering, supplemental data
3. Fodda checks if the user has any skills enabled
4. Fodda connects to your MCP server via Streamable HTTP, discovers your tools, calls the designated tool
5. Your tool receives the full Fodda output as structured JSON and returns transformed text
6. Fodda appends your output as a labeled section: `── SKILL: YourSkillName ──`

---

## Technical Requirements

### 1. You Must Run a Real MCP Server

Your skill must implement the [Model Context Protocol](https://modelcontextprotocol.io/) over **Streamable HTTP** transport (not just a REST API, not just a `.well-known/mcp.json` manifest).

Fodda connects to your server using:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

**This means your server must:**
- Respond to `initialize` JSON-RPC handshake
- Respond to `tools/list` with your tool schemas
- Respond to `tools/call` with tool execution results
- Support the `mcp-session-id` header for session management

**This is NOT sufficient:**
- ❌ A REST API with JSON responses
- ❌ A `.well-known/mcp.json` manifest file without a protocol endpoint
- ❌ An SSE-only endpoint without Streamable HTTP support

### Recommended Frameworks

| Language | Framework | Effort |
|----------|-----------|--------|
| **Python** | [FastMCP](https://github.com/jlowin/fastmcp) | ~30 min |
| **TypeScript** | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | ~30 min |
| **Go** | [go-mcp](https://github.com/mark3labs/go-mcp) | ~1 hour |

### 2. Your Server Must Expose at Least One Tool

Fodda will:
1. Call `listTools()` to discover your available tools
2. Call the tool specified in your registration (or the first available tool as fallback)

### 3. Your Tool Receives This Input

Fodda passes your tool a JSON argument with this structure:

```json
{
  "query": "AI in retail personalization",
  "trends": [
    {
      "name": "AI-Powered Hyper-Personalization Engines",
      "summary": "Retailers deploying real-time AI systems...",
      "signal_score": 98,
      "trendLifecycle": "growing",
      "momentum": "accelerating",
      "evidence_count": 12,
      "graphName": "PSFK's Retail Graph"
    }
  ],
  "evidence": [
    {
      "title": "Sephora's AI Color Match drives 28% conversion lift",
      "sourceUrl": "https://example.com/sephora-ai",
      "brandNames": ["Sephora"],
      "place": "United States",
      "snippet": "Sephora's Virtual Artist tool uses computer vision..."
    }
  ],
  "fodda_output": {
    "query": "AI in retail personalization",
    "graphId": "retail",
    "context": {
      "graphName": "PSFK's Retail Graph",
      "curatorName": "PSFK Editorial",
      "domain": "Retail & Commerce"
    },
    "trends": ["... same as above ..."],
    "evidence": ["... same as above ..."],
    "supplemental": {
      "google_trends": { "interest_over_time": 78, "trending": true },
      "census_retail": { "total_retail_sales": "$7.2T" }
    }
  }
}
```

**Note:** We pass key fields at both the top level (`query`, `trends`, `evidence`) AND inside the nested `fodda_output` object. Use whichever is more convenient for your implementation.

#### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | User's original question |
| `trends[].name` | string | Trend name |
| `trends[].summary` | string | Trend description |
| `trends[].signal_score` | number (0-100) | How strongly this trend is signaled in the data |
| `trends[].trendLifecycle` | string | `"emerging"`, `"growing"`, `"established"`, or `"declining"` |
| `trends[].momentum` | string | `"accelerating"`, `"stable"`, or `"decelerating"` |
| `trends[].evidence_count` | number | Count of supporting articles |
| `evidence[].title` | string | Article headline |
| `evidence[].sourceUrl` | string | Link to the source article |
| `evidence[].brandNames` | string[] | Brands mentioned in the article |
| `evidence[].place` | string | Geographic location |
| `evidence[].snippet` | string | Key excerpt from the article |
| `fodda_output.graphId` | string | Which graph was searched (e.g. `"retail"`) |
| `fodda_output.context` | object | Graph metadata — name, curator, domain |
| `fodda_output.supplemental` | object | Optional supplemental data (Google Trends, Census, etc.) |

### 4. Your Tool Returns Text Content

Return a standard MCP tool response:

```json
{
  "content": [
    {
      "type": "text",
      "text": "🔀 **Paralogy Reframe:**\n\nWhile Fodda identifies AI personalization as a top signal...\n\n**Counter-frame:** What if the real trend isn't *more* personalization but *selective transparency* — retailers who show customers HOW they're being personalized, creating trust through algorithmic legibility?"
    }
  ]
}
```

The AI assistant (Claude, Copilot, etc.) will integrate your output naturally into its response and attribute it to your skill by name.

---

## Authentication

Fodda supports authenticated skill servers. If your MCP server requires authentication:

### Option A: Service API Key (Recommended)

Provide Fodda a static API key or Bearer token. We'll attach it to every request:

```
Authorization: Bearer <your_service_key>
```

Set the env var `SKILL_AUTH_<YOUR_SKILL_ID>` (e.g. `SKILL_AUTH_PARALOGY`) on the Fodda MCP server, or provide the token to the Fodda team for secure storage.

### Option B: Open Endpoint for Partners

Create a partner-accessible endpoint or whitelist Fodda's user-agent (`fodda-skill-client/1.0.0`).

### Option C: No Auth (Simplest)

If your skill doesn't handle sensitive data, consider making the MCP endpoint auth-free. Fodda only calls it with structured trend data — no user PII is transmitted.

> **Important:** Fodda does NOT support OAuth flows (PKCE, authorization_code, etc.) for server-to-server skill calls. If you use Clerk, Auth0, or similar, you must provide a machine-to-machine token or bypass.

---

## Constraints

| Constraint | Value | Why |
|-----------|-------|-----|
| **Response timeout** | 10 seconds | Fodda fails open after 10s — your output is dropped silently |
| **Connection timeout** | 5 seconds | MCP connection must be established within 5s |
| **Trend items** | Up to ~50 | Typical search returns 5-25 trends |
| **Evidence articles** | Capped at 50 | To avoid oversized payloads |
| **Fail-open** | Always | If your server is down, Fodda returns normal results — no error shown |
| **Stateless** | Required | Each call is independent — no session state between requests |
| **No PII transmitted** | Guaranteed | Fodda sends trend data only, never user email, name, or API keys |

---

## Quick Start: Python (FastMCP)

This is the fastest way to build a Fodda skill:

```python
from fastmcp import FastMCP

mcp = FastMCP("My Skill Name")

@mcp.tool()
def process_trends(
    query: str = "",
    trends: list = [],
    evidence: list = [],
    fodda_output: dict = {}
) -> str:
    """Transform Fodda trend data with your unique perspective."""
    
    if not trends:
        return ""  # Gracefully handle empty results
    
    # Your transformation logic here
    trend_names = [t.get("name", "") for t in trends]
    
    result = f"🔀 **My Skill Analysis:**\n\n"
    result += f"Analyzing {len(trends)} trends for: {query}\n\n"
    
    for t in trends:
        name = t.get("name", "Unknown")
        score = t.get("signal_score", 0)
        result += f"- **{name}** (signal: {score}/100)\n"
    
    return result

# Run on Streamable HTTP (required for Fodda)
mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

Deploy this anywhere with HTTPS (Railway, Render, Fly.io, Cloud Run) and give us the URL.

## Quick Start: TypeScript (MCP SDK)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';

const server = new McpServer({ name: 'my-skill', version: '1.0.0' });

server.tool(
  'process_trends',
  'Transform Fodda trend data with your unique perspective',
  {
    query: z.string().optional(),
    trends: z.array(z.any()).optional(),
    evidence: z.array(z.any()).optional(),
    fodda_output: z.any().optional(),
  },
  async ({ query, trends, evidence, fodda_output }) => {
    const trendList = trends || fodda_output?.trends || [];
    
    if (trendList.length === 0) {
      return { content: [{ type: 'text', text: '' }] };
    }
    
    // Your transformation logic here
    let result = `🔀 **My Skill Analysis:**\n\n`;
    result += `Analyzing ${trendList.length} trends for: ${query}\n\n`;
    
    for (const t of trendList) {
      result += `- **${t.name}** (signal: ${t.signal_score}/100)\n`;
    }
    
    return { content: [{ type: 'text', text: result }] };
  }
);

// Standard Express + Streamable HTTP setup
const app = express();
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport('/mcp', res);
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.listen(8000, () => console.log('Skill MCP server running on :8000'));
```

---

## Registration

To register your skill on the Fodda platform:

### Step 1: Build & Deploy Your MCP Server

Use the quick-start above, deploy with HTTPS, and verify it works with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).

### Step 2: Contact Fodda

Email us with:
- **Skill name** and description
- **MCP URL** (e.g. `https://mcp.yourskill.com/mcp`)
- **Tool name** to call (e.g. `process_trends`)
- **Auth requirements** (API key, or none)

### Step 3: We Add You to the Platform

We add a row to our registry:

| Field | Your value |
|-------|-----------|
| `graphId` | Unique slug (e.g. `paralogy`) |
| `Graph Name` | Display name (e.g. `Paralogy`) |
| `graphType` | `skill` |
| `graphStatus` | `beta` → `live` |
| `mcpUrl` | Your MCP URL |
| `skillPhase` | `output` |
| `skillToolName` | Your tool name |
| `Headline` | User-facing description |
| `topics` | `all` (universal access) |

**No code deployment is needed on Fodda's side.** Adding a skill is a configuration operation. The catalog refreshes hourly.

---

## Validation Checklist

Before contacting Fodda, verify:

- [ ] Your server runs on HTTPS
- [ ] `tools/list` returns at least one tool
- [ ] Your tool accepts `fodda_output`, `query`, `trends`, and `evidence` arguments
- [ ] Your tool returns `{ content: [{ type: "text", text: "..." }] }`
- [ ] Your tool responds within 10 seconds with realistic input (5+ trends, 10+ evidence articles)
- [ ] Your tool handles empty input gracefully (returns `""` or a brief note, does not error)
- [ ] Your server handles concurrent connections
- [ ] Your server is stateless (no session state between calls)
- [ ] If auth is required: you have a service/API key ready for Fodda (no OAuth browser flows)

---

## Best Practices

1. **Transform, don't repeat.** Your output is appended alongside Fodda's standard analysis — add a new perspective, don't echo what Fodda already said.

2. **Be concise.** Aim for 500–2000 characters. The LLM will incorporate your output into a larger response — walls of text get ignored.

3. **Brand your output.** Start with your skill's emoji and name (e.g. "🔀 **Paralogy Reframe:**"). Fodda wraps it in a `── SKILL: [name] ──` block, but internal branding reinforces attribution.

4. **Degrade gracefully.** If the input has no trends or the query is irrelevant, return an empty string — don't error. Fodda will silently omit your section.

5. **Avoid external API calls.** You have 10 seconds total. Use that budget to process the Fodda data, not to call external APIs.

6. **Log on your side.** Fodda logs call success/failure and duration. You should log inputs and outputs on your server for debugging and analytics.

7. **Test with the sample payload.** Use the JSON example above as test input to verify your tool works end-to-end before integration.

---

## FAQ

**Q: Can my skill modify the Fodda search results?**  
A: No. Skills receive a read-only copy. Your output is appended as a separate section — it doesn't modify the original trends or evidence.

**Q: Can my skill influence what Fodda searches for?**  
A: Not yet. Currently only `output` phase skills (post-research) are supported. `research` phase skills that influence query routing are on the roadmap.

**Q: How do users enable my skill?**  
A: Users toggle skills on/off in the My Graphs dashboard at [app.fodda.ai](https://app.fodda.ai). Skills are enabled by default when registered with `topics: all`.

**Q: What if my server is down?**  
A: Fodda fails open — users get normal results without your skill. No error is shown. Your uptime is invisible to the user.

**Q: Can users skip my skill for one query?**  
A: Yes. They can say "without [your skill name]" or "skip skills" in their query. This suppresses skill execution for that single query only.

**Q: Does Fodda send user PII?**  
A: No. Fodda sends only trend data, evidence articles, and the search query. No user email, name, IP, or API key is included.

**Q: What clients see my skill output?**  
A: Any MCP-compatible client the user is connected through — Claude (Anthropic), Microsoft Copilot, the Fodda web app, or custom integrations.

**Q: Is there a revenue share model?**  
A: Contact the Fodda team to discuss partnership terms.

---

## Support

- **Technical integration**: Reach out to the Fodda engineering team
- **MCP Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MCP Inspector** (test tool): [github.com/modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector)
