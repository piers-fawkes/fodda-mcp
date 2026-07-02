# Fodda × Claude Connectors — Co-pilot README

**Last updated:** June 24, 2026

---

## The Opportunity: Claude Custom Connectors

Anthropic has opened **custom connectors** — a way for third-party services to plug into Claude via the Model Context Protocol (MCP). This is the primary integration point for Claude across **all tiers**: Pro, Max, Team, and Enterprise.

### Why this matters for Fodda

| Capability | What it means |
|---|---|
| **Universal access** | Every Claude user (Pro, Max, Team, Enterprise) can add Fodda as a connector — no plugin gatekeeping |
| **Claude Research integration** | When users run Research queries, Claude can automatically invoke Fodda tools to search knowledge graphs, traverse relationships, and retrieve evidence — hands-free |
| **Admin governance** | Enterprise workspace Owners manage which connectors and tools are available, giving IT the control they need to approve Fodda |
| **Zero-install** | Users paste one URL. No CLI, no local setup, no code |
| **Connectors Directory** | Anthropic is building a public directory of connectors (like an app store). Fodda has submitted for listing |

### Reference Links

- [Get Started with Custom Connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Use Connectors to Extend Claude](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- [Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Connectors Directory FAQ](https://support.claude.com/en/articles/11596036-anthropic-connectors-directory-faq)

---

## What Fodda Offers via Claude

Fodda connects Claude to **expert-curated knowledge graphs** built by PSFK covering retail, beauty, sports, and emerging industries.

### Available Tools (31 total)

**Core Research**

| Tool | What it does |
|---|---|
| `list_graphs` | Discover available knowledge graphs and schemas |
| `search_graph` | Find trends across 100+ curated knowledge graphs |
| `get_neighbors` | Discover what's connected to a specific trend |
| `get_evidence` | Get source articles and citations behind a trend |
| `get_node` | Get the full profile of a specific trend |
| `get_label_values` | List all brands, locations, or trends in a graph |
| `discover_adjacent_trends` | Find similar trends across domains |
| `brainstorm_topic` | Explore connections and adjacencies around a topic |

**Intelligence Engines**

| Tool | What it does |
|---|---|
| `brand_tracker` | Complete brand intelligence profile |
| `get_domain_intelligence` | Search PSFK domain graphs (retail, beauty, etc.) |
| `get_expert_intelligence` | Search specialist graphs from named strategists |
| `get_report_intelligence` | Search industry report graphs (DHL, PwC, etc.) |
| `search_statistics` | Find specific numbers and data points |
| `search_insights` | Find expert quotes and editorial analysis |
| `get_earnings_intelligence` | Query earnings call intelligence |
| `get_earnings_divergence` | Detect exec deflection in earnings calls |

**Deep Research & Market Data**

| Tool | What it does |
|---|---|
| `deep_research_topic` | Autonomous multi-source research reports (async) |
| `check_research_status` | Poll for deep research results |
| `get_supplemental_context` | Real-time market data from 80+ sources (async) |
| `check_supplemental_status` | Poll for market data results |
| `read_url` | Extract text from any URL for cross-referencing |

**Analysts & Visualization**

| Tool | What it does |
|---|---|
| `list_analysts` | Discover available synthetic expert analysts |
| `consult_analyst` | Consult a named expert in their domain |
| `generate_visual` | Create presentation-ready data visualizations |

**Account & Settings**

| Tool | What it does |
|---|---|
| `get_my_account` | Check API call balance and plan status |
| `update_user_profile` | Save research preferences for personalized results |
| `toggle_graph_preference` | Enable/disable specific graphs or data sources |
| `manage_scheduled_reports` | Create/manage recurring intelligence briefings |
| `send_feedback` | Forward feedback to the Fodda team |
| `sign_up_free_account` | Create a free Base account (100 calls/month) |

### Key properties
- **Read-only** — no tools create, modify, or delete user data
- **Source-backed** — every insight is traceable to articles with URLs
- **All tools have MCP spec annotations** — `readOnlyHint: true`, `title`, etc.

---

## Setup Steps

### For Individual Users (Pro / Max)

**⚡ Quick Connect Method:**
Use this [Add to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Fodda&connectorUrl=https%3A%2F%2Fmcp.fodda.ai%2Fmcp%3Fapi_key%3DYOUR_API_KEY%26user_id%3DYOUR_EMAIL) quick link. *(You will need to manually replace `YOUR_API_KEY` and `YOUR_EMAIL` in the browser URL bar before hitting enter).*

**Manual Setup Method:**
1. Go to [Settings → Connectors](https://claude.ai/settings/connectors)
2. Click **"Add custom connector"**
3. Paste the Fodda connector URL:
   ```
   https://mcp.fodda.ai/mcp?api_key=YOUR_API_KEY&user_id=YOUR_EMAIL
   ```
4. Leave OAuth Client ID and Secret **blank** → click **"Add"**
5. In a new conversation, click **"+"** → **Connectors** → enable **Fodda**
6. Start prompting — e.g. *"What are the top emerging trends in omnichannel retail?"*

> Get your API key at [app.fodda.ai](https://app.fodda.ai) → Account → MCP Integration.

### For Enterprise / Team (Admin-Managed)

1. Workspace **Owner** goes to [Organization Settings → Connectors](https://claude.ai/admin-settings/connectors)
2. Click **"Add custom connector"**
3. Paste the connector URL (with account API key)
4. Leave OAuth fields blank → click **"Add"**
5. Team members then go to [Settings → Connectors](https://claude.ai/settings/connectors) → find Fodda → click **"Connect"**

> Owners control which tools are available. All tools are read-only — safe for enterprise governance.

### For Claude Code (CLI)

```bash
claude mcp add --transport sse fodda https://mcp.fodda.ai/sse \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### For Claude Tag (Slack)

Claude Tag embeds Claude as a persistent team member in Slack. Admins connect Fodda's MCP tools, and anyone in the channel can `@Claude` with trend research questions.

1. In Claude Tag admin, add Fodda as an MCP connector
2. Set endpoint to `https://mcp.fodda.ai/mcp`
3. Set auth type to **Bearer Token** with your Fodda API key
4. Assign tools to channels (start with `search_graph`, `brand_tracker`, `deep_research_topic`)

> **Full setup guide:** [docs/claude-tag-setup.md](docs/claude-tag-setup.md) — covers tool selection by team type, async tool pairing, billing, and troubleshooting.

---

## Current Status

| Item | Status |
|---|---|
| MCP server live at `mcp.fodda.ai` | ✅ Production |
| Streamable HTTP + SSE transports | ✅ Both supported |
| Tool annotations (MCP spec) | ✅ All 30 tools |
| Claude Tag readiness (Slack) | ✅ Verified — [setup guide](docs/claude-tag-setup.md) |
| Connectors Directory submission | ✅ Submitted (March 2026) |
| MCP Registry listing | ✅ `io.github.piers-fawkes/fodda` |
| npm package | ✅ `fodda-mcp` |
| Claude Enterprise Plugin | ⚡ Secondary — Connector is primary |

---

## Terminology Guide

| Context | Use | Don't use |
|---|---|---|
| User-facing | **"Connector"** | "Plugin", "MCP server" |
| Setup instructions | **"Connector URL"** | "Remote MCP Server URL" |
| Enterprise messaging | **"Admin-managed Connector"** | "Enterprise Plugin" |
| Developer/technical docs | **"MCP"** is fine | — |

---

## Architecture

```
Claude (any tier)
    ↓ Connector URL
mcp.fodda.ai (MCP Server — Cloud Run, us-east4)
    ↓ API Key + HMAC
api.fodda.ai (Fodda API)
    ↓
Neo4j Knowledge Graphs
```

- **Stateless** — no query or response data persisted
- **Encrypted** — TLS 1.2+ for all communications
- **GDPR compliant** — Data Processor role, no PII beyond auth

---

## Key Files in the MCP Codebase

| File | Purpose |
|---|---|
| `src/index.ts` | Express server, MCP transports, auth |
| `src/toolHandlers.ts` | All 31 tool definitions and handlers |
| `src/tools.ts` | Tool versioning constants |
| `src/errorHandling.ts` | Structured error responses and credit gating |
| `docs/claude-tag-setup.md` | Claude Tag (Slack) admin setup guide |
| `server.json` | MCP Registry manifest |
| `Enterprise_MCP_Setup.md` | Enterprise deployment guide |
| `SECURITY_PACK.md` | Security documentation for procurement |
| `CHANGELOG.md` | Version history |
| `BACKBURNER.md` | Future work items |

---

## Next Steps / Backburner

- **Connectors Directory approval** — awaiting Anthropic review
- **Agent Skills** — explore packaging a "Trend Research" Skill alongside the connector (see BACKBURNER.md #13)
- **Promotional screenshots** — capture real Claude + Fodda sessions for directory listing
- **Privacy policy / ToS** — created, ensure links are visible on directory listing
