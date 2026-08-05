# Brief — NANDA Index Registration (Piers)

**Status:** AgentFacts endpoint shipped in 1.37.0 (branch `claude/project-nanda-brainstorm-388bd6`); registration is a manual step for Piers (needs account signup + DNS access).

## What's already done (code side)

- `/.well-known/agent-facts.json` on the MCP server serves a NANDA
  [AgentFacts](https://github.com/projnanda/agentfacts-format) document,
  schema-validated, projected from the same canonical metadata as the A2A
  card and MCP discovery card. Goes live at `mcp.fodda.ai` on next deploy.
- The A2A Agent Card at `https://mcp.fodda.ai/.well-known/agent-card.json`
  is **already live in production** — registration can point at it today,
  no deploy needed.

## Why register

The NANDA Index (MIT, nandaindex.org) is a resolution layer for agent
discovery: one index record per org, pointing at a next-hop discovery
document. It resolves NANDA-native agents, A2A cards, and MCP server cards
— registering makes Fodda discoverable to NANDA-ecosystem agents and their
agentic search.

## Registration steps (~15 min + DNS propagation)

1. **Create an account** at https://nandaindex.org/register
   (email/password, Google, or GitHub).
2. **Register the org** via the web UI (or `POST https://api.nandaindex.org/api/v1/orgs`):
   - `org_id`: `fodda`
   - `domain`: `fodda.ai`
   - `media_type`: `application/a2a-agent-card+json`
   - `registry_url`: `https://mcp.fodda.ai/.well-known/agent-card.json`

   (Alternative: `application/mcp-server-card+json` +
   `https://mcp.fodda.ai/.well-known/mcp-server.json`. The A2A card is
   recommended — it's the single-agent type their agentic search
   synthesizes candidates from, and it carries skills + examples.)
3. **Verify the domain** (ACME dns-01 style): the index issues a TXT
   challenge. Add a DNS TXT record:
   - Name: `_nanda-challenge.fodda.ai`
   - Value: `nanda-verify=<token they give you>`

   Then trigger verification (web UI button, or
   `POST /api/v1/orgs/fodda/verify-domain`). Same DNS muscle as the MCP
   registry DNS-auth we did for `ai.fodda`.
4. **Confirm resolution:**
   ```bash
   curl -s https://api.nandaindex.org/api/v1/index/fodda
   ```
   Expect an IndexRecord with `registry_url` → the mcp.fodda.ai card.

## Optional follow-ups

- **List39** (www.list39.org, Google OAuth) — NANDA's AgentFacts registry;
  create an entry mirroring `/.well-known/agent-facts.json`.
- **NEST sandbox** (nest.projectnanda.org) — test an unknown agent
  discovering Fodda and completing a paid task via the SPT rail; strong
  case-study material for the NANDA consortium.
- **DataFacts** — per-graph dataset metadata (`data_facts_url` in
  AgentFacts); differentiator, revisit once the index listing is live.
