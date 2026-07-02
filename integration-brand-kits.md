# Fodda + Little Plains: Brand Kit & Retrieval Rules Integration
_Prepared by Piers Fawkes, PSFK / Fodda_

---

## What Fodda Is

Fodda is a marketplace of expert knowledge graphs accessible via MCP. Once connected, any Claude conversation or agentic workflow can query curated trend and category intelligence — structured trend nodes, evidence articles, brand examples, relevance scores, and adjacent signals — sourced from PSFK's 20-year research archive and institutional data sources.

It is not a chatbot or a generative tool. It returns structured data. Outputs are deterministic and traceable to named sources.

**MCP endpoint:** `https://mcp.fodda.ai/mcp`  
**Auth:** API key via URL param (`?api_key=YOUR_KEY&user_id=YOUR_EMAIL`)  
**Trial key:** `[TRIAL_KEY_HERE]`

---

## Integration: Brand Kit Development & Retrieval Rules

### Where it fits
Upstream of writing the `/agent` folder chunks — specifically `positioning.md`, `differentiation.md`, and audience persona files. This is the judgment-call stage you described as the highest-value part of the engagement.

### Purpose
Before a strategist commits to a positioning direction, Fodda queries ground the category thinking in structured evidence. Not to generate the positioning, but to pressure-test the hypothesis against what is actually happening in the category.

### Implementation

**Step 1: Pre-positioning research via Agent**
Before a strategist drafts `positioning.md`, they can deploy an agent to test their hypotheses against emerging signals. Because Fodda’s MCP tools are self-describing, the strategist only needs to give the agent a mandate:

```markdown
### Goal: Pressure-Test Positioning Hypothesis
You have access to the Fodda MCP tools. My current positioning hypothesis for the client is [HYPOTHESIS].

1. Use the Fodda tools to search the relevant graphs for signals that support or challenge this hypothesis.
2. Find evidence of early-mover brands or geographic patterns acting on these signals.
3. Present the structured evidence to me. Do not generate the positioning yourself — I will make the final judgment call.
```

**Step 2: Create `category-signals.md` chunk**
Document the signals reviewed and how they informed the positioning call. This becomes a new chunk in the `/agent` folder:

```yaml
---
chunk_id: "category-signals"
domain: "research"
category: "market-context"
subcategory: "trend-evidence"
context_tags:
  - "category-signals"
  - "market-trends"
  - "positioning-evidence"
token_count: 400
format: "markdown"
source: "Fodda / PSFK"
version: "1.0"
last_updated: "2026-06-07"
status: "active"
summary: >-
  Trend signals and category evidence reviewed prior to positioning.
  Documents the market context that informed the positioning direction.
---

## Category Signals Reviewed
[Structured Fodda output here, filtered to relevant signals]

## Positioning Implications
[Strategist notes: how these signals informed the direction taken in positioning.md]
```

**Step 3: Reference in `positioning.md`**
Add a `depends_on` reference in `positioning.md` to `category-signals`. This creates a traceable chain from the positioning assertion back to the evidence layer.

**Step 4: Dynamic Retrieval Rules (`_retrieval-rules.yaml`)**
Once the kit is built, you can use Fodda dynamically within your client's retrieval rules so downstream agents query live market contexts when generating copy:

```yaml
task_profiles:
  website_copy:
    description: "Writing or editing copy for client landing page"
    always_load:
      - "voice-core"
      - "positioning-core"
    load_if_relevant:
      # Agent dynamically calls Fodda to pull live category trend clusters
      - "mcp://fodda/discover_adjacent_trends?query=[core-brand-topic]"
    token_budget: 2500
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
