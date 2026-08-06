# Fodda — Claude Code project instructions

> Loaded every session. This is what keeps the briefing process from being reinvented.
> Portable: the same file can be dropped into any Fodda repo root.

## Two brains, two stores (do not confuse them)

- **Antigravity** executes briefs. It reads `~/.gemini/GEMINI.md` (global house rules) and each
  repo's `.agents/` (agents, workflows, rules, `mcp_config.json`) automatically.
- **Claude Code** (you) reads THIS file + `~/.claude/projects/.../memory/`. You do NOT read
  `~/.gemini/` or `.agents/`. If a rule needs to bind you, it must be here or in memory.

## When Piers asks you to prepare a brief — DEFAULT PROCEDURE

Do not write a one-off prose brief and stop. Produce it in the Antigravity file-kit convention so
Antigravity can execute it directly:

1. Write the brief as markdown in the owning repo's `briefs/`, keeping the house shape:
   **Context → What to build → Where to register → Definition of Done → Do Not → Files-changed.**
2. Route it to the owning repo's agent (see topology below). Execution handle is
   `/build-from-brief briefs/<file>.md`.
3. **Do NOT restate the global house rules in the brief** — they already live in `~/.gemini/GEMINI.md`.
   Only add genuinely project-specific rules, and put those in that repo's `.agents/rules/`.
4. If the brief is a **repeatable process**, also draft a `.agents/workflows/<name>.md` workflow.
   If it introduces a **recurring role**, draft a subagent scoped to the MCP servers it needs.
5. Flag any conflict with the house rules instead of silently diverging.

## Repo topology & routing (agents hand off cross-repo)

| Repo | Owns | Agent |
|---|---|---|
| Fodda API | API code, supplemental layer, metering, read-layer | `api-agent` (global) |
| Fodda MCP | MCP server, tool schemas, publishing | `mcp-agent` (global) |
| Fodda App | user dashboard | — |
| Fodda CE | ingestions: Expert data & research | — |
| Fodda PSFK | ingestions: PSFK research | — |
| Fodda Ben Dietz Graph | ingestions: Ben Dietz / SICexpert | — |
| Fodda Sales | Slack agent + outreach | (outreach; API agent may work it) |
| Fodda Website | website | — |
| Fodda Finance | earnings calls (usage unsure) | — |
| Fodda Anthropic Plugin | plugin surface (low priority) | — |

`api-agent` and `mcp-agent` are **global** (`~/.gemini/config/agents/`); every repo inherits them.
Project-specific agents/workflows/rules live in that repo's `.agents/`.

## Non-negotiables you must respect (mirror of the global house rules)

- **AIRTABLE is the source of truth for pricing.** Read customer-visible prices from Airtable and
  quote them exactly. Offering pricing is a SEPARATE rate from the SPT per-token rate — never compute
  a price from `TOKEN_COSTS` × `SPT_RATE_CENTS`. Never invent, round, or "correct" a price from
  memory; if one looks wrong, STOP and ask Piers.
- Supplemental clients never throw — always return `{ error, message, source }`; 10s timeout.
- **NEVER use "tokens" in user-visible text** — express cost as **API calls** + the published USD
  price from Airtable.
- Prefer one MCP tool with a `view` param over many tools (context budget).
- **Test sends go ONLY to `nathan@searchshop.ai` and `piers.fawkes@psfk.com`** — never a real
  user/prospect. Hard rule.
- Every change updates `CHANGELOG.md` and states a real verification result.
