# Fodda + Little Plains: Deep Research Agent Integration
_Prepared by Piers Fawkes, PSFK / Fodda_

---

## What Fodda Is

Fodda is a marketplace of expert knowledge graphs accessible via MCP. Once connected, any Claude conversation or agentic workflow can query curated trend and category intelligence — structured trend nodes, evidence articles, brand examples, relevance scores, and adjacent signals — sourced from PSFK's 20-year research archive and institutional data sources.

It is not a chatbot or a generative tool. It returns structured data. Outputs are deterministic and traceable to named sources.

**MCP endpoint:** `https://mcp.fodda.ai/mcp`  
**Auth:** API key via URL param (`?api_key=YOUR_KEY&user_id=YOUR_EMAIL`)  
**Trial key:** `[TRIAL_KEY_HERE]`

---

## Integration: Deep Research Agent Loop

### Current workflow (Little Plains)
1. Multi-step query agent runs research across web and internal sources.
2. Output compressed to a markdown file.
3. Markdown uploaded to a Claude Project.
4. Team members query the Project throughout the engagement.

### Proposed addition
After the competitive and audience research steps, the agent calls Fodda via MCP to pull category and trend context from the relevant domain graph.

### Implementation

**Step 1: Add Fodda goal to the research agent's system prompt**  
Because Fodda exposes its tools via MCP with rich semantic descriptions, you do not need to hardcode a step-by-step tool sequence. The agent will orchestrate `list_graphs`, `search_graph`, and `get_evidence` on its own. 

Simply append this **Goal & Constraint block** to the agent's instructions:

```markdown
### Goal: Category Signal Research
You have access to the Fodda MCP tools. Your goal is to ground your competitive and audience research in live cultural and market signals. 

1. Use the Fodda tools to discover what is happening in the client's category (e.g., retail, beauty, wellness, or cross-industry innovation).
2. You must not invent trends. Every trend you report must be backed by a Fodda graph node.
3. You must retrieve the underlying evidence (source articles, URLs) for the strongest signals using the available MCP tools.
4. Output your findings using the "Category Signals" schema below.
```

**Step 2: Output schema for markdown artifact**

```markdown
## Category Signals (via Fodda / PSFK)

### [Trend Name]
- Signal score: [0-100]
- Summary: [trend description]
- Evidence: [Article Title](sourceUrl) — [Brand], [Geography], [Date]
- Adjacent signals: [Trend A], [Trend B]
```

---

## Setup & Configuration

**1. Claude Web App (Pro / Team / Enterprise)**
- Go to Settings > Connectors > Add custom connector
- Paste: `https://mcp.fodda.ai/mcp?api_key=[TRIAL_KEY_HERE]&user_id=emmett@littleplains.co`
- Leave OAuth fields blank.

**2. Claude Code (CLI) / Cursor Config**
For agentic workflows, use the SSE endpoint:
```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer [TRIAL_KEY_HERE]"
```

Questions: piers@psfk.com
