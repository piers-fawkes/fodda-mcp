# Fodda × Claude Connectors — Co-pilot README

**Last updated:** March 12, 2026

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

### Available Tools (8 total)

| Tool | What it does |
|---|---|
| `list_graphs` | Discover available knowledge graphs and schemas |
| `search_graph` | Hybrid keyword + semantic search across trend data |
| `get_neighbors` | Traverse graph relationships to find connected concepts |
| `get_evidence` | Retrieve source articles with full provenance |
| `get_node` | Get full metadata for a specific node |
| `get_label_values` | Discover values for categories (Brand, Location, etc.) |
| `psfk_overview` | Macro-level industry overview |
| `discover_adjacent_trends` | Find semantically similar trends |

### Key properties
- **Read-only** — no tools create, modify, or delete data
- **Deterministic** — same query returns same results (except search, which uses semantic scoring)
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

---

## Current Status

| Item | Status |
|---|---|
| MCP server live at `mcp.fodda.ai` | ✅ Production |
| Streamable HTTP + SSE transports | ✅ Both supported |
| Tool annotations (MCP spec) | ✅ All 8 tools |
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
| `src/index.ts` | Express server, MCP transports, tool handlers |
| `src/tools.ts` | Tool definitions with schemas and annotations |
| `src/types.ts` | TypeScript types for API requests/responses |
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
