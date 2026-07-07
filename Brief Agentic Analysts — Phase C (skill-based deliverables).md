# Brief: Agentic Analysts — Phase C (skill-based deliverables)

> Extracted from `Brief Agentic Analysts.md` §"Phase C — Skill-based deliverables". Standalone; hand to a fresh thread. Touches three surfaces (Airtable, API, MCP). This is the new **product surface** — gate it on the guardrails.

## Status going in (verified 2026-07-06)
- ✅ Phase A shipped (analysts orchestrate the DB via MCP-as-tool; `EXPERT_AGENT_MCP_TOOLS=true`).
- 🟡 Phase B: API sessions done & committed; MCP passthrough is a separate small brief (do that first — the "ongoing project → deliverable" funnel line depends on sessions being reachable).
- ⬜ Phase C: **not started.** `request_deliverable` / `check_deliverable_status` exist nowhere in the codebase. `interaction.artifacts[]` is never read anywhere.
- **Dependency:** expert payouts on offerings need Brief Expert Self-Use ownership linkage (`Analysts.ownerAccount`) — that shipped 2026-07-02, so the ownership rail exists.

## Objective
Turn analysts into producers of billable, finished documents: a marketer writes a marketing plan, a strategist reviews a deck, any twin produces a trend briefing. An "offering" is a purchasable deliverable type owned by an expert; a "deliverable" is the produced artifact; commissioning one is a single MCP tool call.

## Build (C)

**C1. Airtable — link Offerings ↔ Analysts.** Add to the Offerings table:
- `offered_by` (linked record → Analysts)
- `deliverable_template` (long text or attachment — the format contract)
- Seed 2–3 pilots: `marketing_plan` (marketing analyst), `deck_review` (strategy analyst), `trend_briefing` (any twin).
- Pricing per flat stance: `typical_calls × $0.50`, with `published_price_usd` overridable.

**C2. New endpoint `POST /v1/analysts/{id}/deliver`** — body `{offering_key, brief, attachments?}`:
- Launch the analyst's managed agent with `background: true`, `store: true`.
- Mount the deliverable template into the sandbox (`environment.sources` inline — same mechanism as consult attachments today, `analysts.ts:1599–1630`).
- Agent researches via MCP tools (Phase A pattern), then produces the document with sandbox code execution (Bash/Python/Node on `antigravity-preview-05-2026`).
- Poll via the existing pattern (`ingest/researchRouter.ts:157–183`); extract `interaction.artifacts[]` (currently never read) and return artifact URLs.
- ⚠️ **No structured outputs** on the Antigravity agent — the template file in the sandbox IS the format contract. The delivery prompt must instruct writing to a known path (e.g. `/workspace/deliverable.pdf`).
- Add `check_deliverable_status` (job id → status/artifact URLs).

**C3. Billing.** Charge the offering's `published_price_usd` up-front (SPT-compatible for anonymous agents). Meter the agent's internal reads as `mcp-orchestrated` to avoid double-billing (same skip Phase A uses). Expert payout is on the offering, not per-read.

**C4. MCP surface.**
- New `request_deliverable` tool (+ `check_deliverable_status`).
- List offerings per analyst in `list_analysts` output.
- Add each live offering to the A2A agent-card skills (`MCP src/a2aHandler.ts:27–71`) and registry metadata — **derived from the Offerings table via `tools-manifest.json`, never hand-edited.**

## Instructions & Discovery (instruct at the moment of choice)

**C-i. Offerings discoverable where the choice happens:**
- `list_analysts` gains `offerings: [{key, name, price_usd, turnaround, example_brief}]` per analyst.
- Consult responses gain `offerings_available` with a one-line pitch when the topic matches (e.g. marketing question → "This analyst can also produce a full Marketing Plan — $10, ~20 min. Use request_deliverable."). This is the only deliverables funnel.

**C-ii. `request_deliverable` description carries the whole contract:**
> "Commission a finished document from an analyst. Specify offering_key (see list_analysts offerings), a brief (2–5 sentences: audience, goal, constraints), and optional attachments. Returns a job id — poll with check_deliverable_status. Price is charged on acceptance; the analyst's research is included, not billed separately. Example brief: 'Marketing plan for a DTC skincare launch targeting Gen-Z, $50k budget, 90-day horizon.'"

The per-offering `example_brief` field matters most — agents imitate examples far more reliably than abstract instructions.

**C-iii. A2A card + registry** (`src/a2aHandler.ts`, `server.json`): each live offering → an agent-card skill with price + example prompt; registry description mentions commissioned deliverables. Same manifest-derived discipline as the 30 tools.

**Vocabulary lock:** "engagement" (multi-turn session), "offering" (purchasable deliverable type), "deliverable" (produced artifact), "consult" (a Q&A turn). Identical words across tool descriptions, envelopes, agent card, Airtable field names, website copy.

## Guardrails (PREREQUISITE for Phase C)
From the API BACKLOG (135–174), now load-bearing:
- Per-consult tool-call cap (suggest 15) + token budget (`max_thinking_tokens` currently never set; sessions unbounded).
- Kill switch: auto-disable an expert agent after 3 consecutive failures.
- `post_tool_call` audit hook → JSON log pipeline (required once agents call MCP tools with user keys).

## Environment variables
- `EXPERT_AGENT_TOOLCALL_CAP` (default 15), `EXPERT_AGENT_MAX_TOKENS`
- `FODDA_MCP_URL` (default `https://mcp.fodda.ai/mcp`) — don't hardcode in two places.

## Repo discipline
- `git status` in each repo touched; checkpoint any pre-existing uncommitted work first (both repos deploy from source).
- API: `npx tsc -p tsconfig.api.json --noEmit` clean. MCP: `npm run build` clean + regenerate manifest.
- Commit each repo clearly. **Do NOT deploy.**

## Testing
1. `marketing_plan` request → returns a PDF artifact; offering price charged once; internal reads NOT separately billed to the client.
2. `list_analysts` shows `offerings` per analyst; a matching consult surfaces `offerings_available`.
3. Kill switch: 3 forced failures disables the agent + Slack alert fires (extend existing fallback alert, `analysts.ts:1771–1778`).
4. A2A card exposes each live offering as a skill with price + example.

## Priority
P1, but **the new product surface — gate on the guardrails above.** Depends on Brief Expert Self-Use (ownership linkage, shipped) for expert payouts, and reads best after Phase B MCP passthrough lands (the funnel line references sessions).
