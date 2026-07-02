import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = {
    "model": "claude-opus-4-8",
    "max_tokens": 5000,
    "system": "You are a senior software engineer and product strategist conducting a frank code and product review. Be direct about problems. Do not soften findings. Prioritise issues by severity. Use clear markdown sections.",
    "messages": [{
        "role": "user",
        "content": """Please give two reviews in one response:

## PART 1: Code Review — Fodda MCP Server

Review the Fodda MCP Server codebase. Here is a comprehensive summary:

### What it does
Fodda MCP (Model Context Protocol) server v1.29.0. TypeScript/Express.js server that exposes Fodda knowledge graph data to AI clients (Claude, Cursor, ChatGPT etc) via the MCP protocol. Deployed to Google Cloud Run.

### Architecture
- Entry point: src/index.ts (718 lines)
- src/toolHandlers.ts: 191KB, 2993 lines — single file containing createServer() which registers 30+ MCP tools
- src/errorHandling.ts: 435 lines — trial credit exhaustion, auto-upgrade flows, Stripe checkout
- src/systemPrompt.ts: 34KB — dynamic system prompt builder
- src/brandTemplate.ts: 45KB — HTML widget rendering
- src/catalogCache.ts: 37KB — in-memory graph catalog cache
- src/trialTracker.ts: 9KB — per-user trial limits via Firestore
- src/queryCache.ts: 8KB — in-memory query response cache
- src/skillClient.ts: 14KB — external skill API calls
- src/a2aHandler.ts: 15KB — agent-to-agent protocol

### Key patterns and concerns

1. API key in URL query params — primary method is ?api_key=YOUR_KEY. Keys appear in Cloud Run access logs and downstream proxy logs.

2. toolHandlers.ts is 191KB / 2993 lines — a single factory function createServer() registers 30+ MCP tools inline. Massive single-responsibility violation.

3. All session state is in-memory Maps — transports, sessionApiKeys, sessionUserIds, widgetCache, activeResearchJobs all in plain Maps. Cloud Run can run multiple instances. Sessions on instance A are invisible to instance B. 50% of session resumes fail when scaled to 2 instances.

4. Session cleanup has a dead condition — cleanup sweep reads (transport as any)._createdAt, a private field never set anywhere. Sessions accumulate indefinitely.

5. New McpServer + blocking API call per session — createServer() fires GET /v1/graphs synchronously on every MCP initialize handshake, before any tool is available.

6. Two redundant Google GenAI SDK packages — both @google/genai ^1.50.1 and @google/generative-ai ^0.24.1 in production deps.

7. CORS fully open — Access-Control-Allow-Origin: * with no origin validation.

8. No request body size limit — express.json() with no limit option set.

9. Hardcoded Cloud Run URL fragment — getServiceUrl() falls back to hardcoded string '7mopqjzhwq'. If project or region changes, service URL breaks silently.

10. Trial detection by string prefix only — apiKey.startsWith('sk_trial_') with no cryptographic verification.

11. Dockerfile missing NODE_ENV=production — Node defaults to development mode.

12. All logging via console.error — no structured logger, no correlation IDs.

13. 120-second axios timeout — a 2-minute upstream timeout holds MCP sessions open when MCP clients typically timeout much sooner.

Review across: architecture, security, scalability, code quality, infrastructure. End with a Top 3 to fix first section.

---

## PART 2: Headerless UX Strategy

Fodda's MCP server is essentially a headless product. Users experience Fodda entirely through AI chat clients (Claude, Cursor, Windsurf, ChatGPT) with no Fodda app, no navigation, no visual chrome of their own. The AI chat IS the entire interface.

The MCP server currently tries to compensate with pre-rendered HTML widgets (brand intelligence cards, search result grids) served as iframes inside a widget cache — HTML blobs that some AI clients can render.

Give your senior product and UX perspective on:
1. What does good 'headerless UX' look like when the interface is an AI assistant? What are the core design principles?
2. What does Fodda's current MCP approach get right and wrong about this?
3. Is the widget/iframe approach the right move, or does it fight the medium?
4. What should a B2B data product's design principles be when it has no UI of its own?
5. How does the headerless MCP experience compare to traditional dashboard-based B2B data products — where does it win, where does it lose?"""
    }]
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(
    'https://api.anthropic.com/v1/messages',
    data=data,
    headers={
        'Content-Type': 'application/json',
        'x-api-key': 'sk-ant-api03-[REDACTED]',
        'anthropic-version': '2023-06-01',
    }
)

with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
    result = json.loads(resp.read())

text = result['content'][0]['text']
print(text)

# Save to file
with open('scratch/mcp_review_output.md', 'w') as f:
    f.write(text)
print('\n\n--- Saved to scratch/mcp_review_output.md ---')
