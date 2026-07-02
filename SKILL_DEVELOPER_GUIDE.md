---
id: FODDA-SKILL-DEV-GUIDE
title: Fodda Skill Developer Guide
version: 2.0.0
compliance: RFC-2119
owner: Fodda / PSFK
created: 2026-06-08
---

# Fodda Skill Developer Guide

> [!NOTE]
> Guidelines for third-party developers building MCP-compatible skills for the Fodda platform.

---

## 1. Overview & Architecture

A Fodda Skill is an **external MCP server** that post-processes Fodda's knowledge graph output. When a user enables your skill, Fodda automatically calls your MCP server after completing its research pipeline, passes your server the structured search results, and appends your transformed output to the user's response.

Skills are not knowledge graphs. They do not contain data — they transform, filter, reframe, or augment existing Fodda data before it reaches the user.

### SEQUENCE: SkillExecutionWorkflow
1. **User Query** — User asks a question through any MCP client (Claude, Copilot, the Fodda App).
2. **Research Pipeline** — Fodda runs its normal research pipeline: graph search, evidence gathering, supplemental data context.
3. **Skill Check** — Fodda checks if the user has any skills enabled.
4. **Tool Call** — Fodda connects to your skill's MCP server via Streamable HTTP, discovers available tools, and calls the designated tool.
5. **Post-Processing** — Your tool receives the Fodda output as structured JSON and returns transformed text.
6. **Delivery** — Fodda appends your output as a labeled section: `── SKILL: YourSkillName ──`.

---

## 2. Technical Requirements

### RULE: ProtocolConformance
- Your skill MUST implement the Model Context Protocol (MCP) over **Streamable HTTP** transport.
- The server MUST respond to the `initialize` JSON-RPC handshake.
- The server MUST respond to `tools/list` with your tool schemas.
- The server MUST respond to `tools/call` with tool execution results.
- The server MUST support the `mcp-session-id` header for session management.
- The server MUST expose at least one tool. Fodda calls `listTools()` and triggers the specified tool.

### RECORD: InputPayload
- query: String — User's original question.
- trends: List[TrendItem] — Curated trends returned by Fodda.
- evidence: List[EvidenceItem] — Curated evidence articles returned by Fodda.
- fodda_output: Object — Full query envelope, containing:
  - query: String
  - graphId: String — Which graph was searched (e.g. `"retail"`).
  - context: Object — Graph metadata (name, curator, domain).
  - trends: List[TrendItem]
  - evidence: List[EvidenceItem]
  - supplemental: Object — Optional supplemental data (Google Trends, Census).

### RECORD: TrendItem
- name: String
- summary: String
- signal_score: Number (0-100)
- trendLifecycle: String — `"emerging"`, `"growing"`, `"established"`, or `"declining"`
- momentum: String — `"accelerating"`, `"stable"`, or `"decelerating"`
- evidence_count: Number
- graphName: String

### RECORD: EvidenceItem
- title: String
- sourceUrl: String
- brandNames: List[String]
- place: String
- snippet: String

### RECORD: OutputPayload
- content: List[ContentBlock] — Standard MCP tool text response.
  ```json
  {
    "content": [
      {
        "type": "text",
        "text": "🔀 **Paralogy Reframe:**\n\nYour creative counter-perspective content..."
      }
    ]
  }
  ```

---

## 3. Security & Constraints

### RULE: Authentication
- Your server MAY require authentication. Fodda supports service-key credentials.
- Static M2M: Fodda passes your service key in the `Authorization: Bearer <your_service_key>` header.
- The agent MUST NOT use OAuthPKCE or interactive browser logins for server-to-server calls.

### TOKEN: SkillConstraints
- Response Timeout: 10 seconds (Fodda fails open after 10s and drops the skill response).
- Connection Timeout: 5 seconds.
- Trends Input: Up to ~50 trends.
- Evidence Input: Capped at 50 articles.
- Fail-Open Policy: Enabled (errors or downtime do not crash the Fodda app).
- Stateless: Required (each call must be fully self-contained).
- No PII: Guaranteed (no names, user keys, or user emails are sent).

---

## 4. Platform Registration

To register your skill on Fodda, your MCP server must be configuration-mapped in the registry.

### RECORD: RegistrySettings
- graphId: String — Unique slug identifier (e.g. `paralogy`).
- Graph Name: String — Display name (e.g. `Paralogy`).
- graphType: "skill"
- graphStatus: "beta" | "live"
- mcpUrl: String — HTTPS endpoint of your Streamable HTTP server.
- skillPhase: "output"
- skillToolName: String — Tool name to call (e.g. `process_trends`).
- Headline: String — User-facing description.
- topics: "all" | List[String] — Target verticals.

---

## 5. Implementation Templates

### CODE: Python (FastMCP)
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
        return ""  # Graceful fallback
        
    result = f"🔀 **My Skill Analysis:**\n\n"
    for t in trends:
        name = t.get("name", "Unknown")
        score = t.get("signal_score", 0)
        result += f"- **{name}** (signal: {score}/100)\n"
    return result

mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

### CODE: TypeScript (MCP SDK)
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';

const server = new McpServer({ name: 'my-skill', version: '1.0.0' });

server.tool(
  'process_trends',
  'Transform Fodda trend data',
  {
    query: z.string().optional(),
    trends: z.array(z.any()).optional(),
    evidence: z.array(z.any()).optional(),
    fodda_output: z.any().optional(),
  },
  async ({ query, trends, evidence, fodda_output }) => {
    const trendList = trends || fodda_output?.trends || [];
    if (trendList.length === 0) return { content: [{ type: 'text', text: '' }] };
    
    let result = `🔀 **My Skill Analysis:**\n\n`;
    for (const t of trendList) {
      result += `- **${t.name}** (signal: ${t.signal_score}/100)\n`;
    }
    return { content: [{ type: 'text', text: result }] };
  }
);

const app = express();
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport('/mcp', res);
  await server.connect(transport);
  await transport.handleRequest(req, res);
});
app.listen(8000);
```

---

## 6. Definition of Done (Checklist)

- [ ] Your server runs on HTTPS.
- [ ] `tools/list` returns at least one tool.
- [ ] Your tool accepts `fodda_output`, `query`, `trends`, and `evidence` arguments.
- [ ] Your tool returns `{ content: [{ type: "text", text: "..." }] }`.
- [ ] Your tool responds within 10 seconds under load.
- [ ] Your tool handles empty inputs gracefully (returns `""` or a brief fallback note).
- [ ] Your server is completely stateless.
