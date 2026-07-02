# Brief: Agentic Analysts — MCP Tools, Sessions & Skill-Based Deliverables

## Objective
Evolve analysts from single-shot consultations into agents that (A) manage research across the full Fodda database and other agents, (B) hold multi-session engagements, and (C) produce skill-based deliverables (a marketer writes a marketing plan, a strategist reviews a deck) as billable offerings.

## Context
Audited 2026-07-01. The consult pipeline (`Fodda API functions/v1/analysts.ts:856–1780`) is already more than RAG — coverage gate, referrals, executive personalization, and ben-dietz-sic running as a managed agent (`antigravity-preview-05-2026` base) with per-invocation key injection and an `api.fodda.ai`-only network allowlist. But:

- Analysts cannot call Fodda's own research tools (`deep_research_topic`, `get_earnings_intelligence`, `get_supplemental_context`) or other analysts. Tool loop is shallow (3 functions, partially on the `generateContent` fallback path only).
- Every consult is single-turn. `previous_interaction_id` (GA since I/O 2026, cheaper via server-side caching) is used only in the ingest workflow (`functions/v1/ingest/researchRouter.ts:115`).
- Offerings (`scripts/seed_offerings.ts`) are platform commodities — no expert ownership, no deliverable templates. `interaction.artifacts[]` is never extracted anywhere.
- The MCP-as-tool pattern is already prototyped: `researchRouter.ts:24–29` builds `{type: "mcp_server", name: "fodda_mcp", url: "https://mcp.fodda.ai/mcp", headers: {...}}` — but it's never attached to expert agents, and its invocation is unverified.

## Changes Required

### Phase A — Analysts orchestrate the database (MCP-as-tool)

**A1. Attach the Fodda MCP server as a tool on expert managed agents.**
In the consult invocation (`analysts.ts:1632–1643`) and registration (`scripts/register-expert-agents.ts`), add:

```typescript
tools: [{
    type: "mcp_server",
    name: "fodda_mcp",
    url: "https://mcp.fodda.ai/mcp",
    headers: { "x-api-key": userRawApiKey, "x-fodda-source": `expert-agent:${analyst_id}`, "x-fodda-billing": "mcp-orchestrated" }
}]
```

Billing rides the existing header-transform pattern — the user's key means every graph read, earnings call, or supplemental pull the agent makes bills the client at standard rates and attributes to the expert source. Verify no double-charge against the `mcp-orchestrated` billing-mode skip.

**A2. Verify MCP tool invocation actually works** before building on it. The ingest router passes the same payload but nothing confirms the agent calls MCP tools (flagged unvalidated in audit). Spike: one instrumented consult with a prompt that requires `search_statistics`; confirm the tool call in `interaction.steps[]` and in the Questions Log with `source: expert-agent:*`.

**A3. Prompt update.** Extend the per-expert `agents/{id}/AGENTS.md` with tool-selection guidance: which MCP tools to reach for by query type (mirror the CompleteResearchWorkflow sequence from MCP `src/systemPrompt.ts`). Cap tool calls per consult (see Guardrails).

**A4. Analyst-to-analyst consults.** `consult_analyst` is itself an MCP tool, so A1 gives analysts the ability to consult each other. Add a recursion guard: `x-fodda-source: expert-agent:*` callers may not trigger further nested consults (depth 1 max), enforced at the consult endpoint.

### Phase B — Multi-turn engagements (sessions)

**B1. Accept `session_id` on `POST /v1/analysts/consult` and the MCP `consult_analyst` tool.** On follow-up calls pass `previous_interaction_id` to `ai.interactions.create()`; skip re-injecting the full INTELLIGENCE CONTEXT (server-side state holds it — this is also a cost reduction via cache hits). Requires `store: true` (55-day retention on paid tier).

**B2. Session registry.** Firestore collection `analyst_sessions`: `{session_id, analyst_id, account_id, last_interaction_id, environment_id, turn_count, created, last_active}`. Reuse `environment_id` across turns so working files persist ("the analyst remembers the project"). Environment lifecycle rules (reuse vs. fork, snapshot export) are already a BACKLOG item — resolve them here.

**B3. Billing per turn.** Each turn bills as today (flat tokenCost or per-read for twins). Session storage itself is free to the user.

### Phase C — Skill-based deliverables (offerings owned by experts)

**C1. Airtable: link Offerings ↔ Analysts.** Add `offered_by` (linked record) and `deliverable_template` (long text or attachment) to the Offerings table. Seed 2–3 pilots: `marketing_plan` (marketing analyst), `deck_review` (strategy analyst), `trend_briefing` (any twin). Price per the flat stance: `typical_calls × $0.50`, with `published_price_usd` overridable.

**C2. New endpoint `POST /v1/analysts/{id}/deliver`** — `{offering_key, brief, attachments?}`:
- Launch the analyst's managed agent with `background: true`, `store: true`.
- Mount the deliverable template into the sandbox (`environment.sources` inline, same mechanism as attachments today, `analysts.ts:1599–1630`).
- Agent researches via MCP tools (Phase A), then produces the document with sandbox code execution (Bash/Python/Node available on `antigravity-preview-05-2026`).
- Poll via existing pattern (`ingest/researchRouter.ts:157–183`); extract `interaction.artifacts[]` (currently never read anywhere) and return artifact URLs.
- Note: the Antigravity agent has **no structured outputs** — the template file in the sandbox is the format contract, and the delivery prompt must instruct writing to a known path (e.g., `/workspace/deliverable.pdf`).

**C3. Billing:** charge the offering's published price up-front (SPT-compatible for anonymous agents), meter the agent's internal reads as `mcp-orchestrated` to avoid double-billing. Expert payout on the offering, not per-read.

**C4. MCP surface:** new `request_deliverable` tool + list offerings per analyst in `list_analysts` output and the A2A agent card skills (`MCP src/a2aHandler.ts:27–71`).

## Instructions & Discovery
Each phase changes what agents *can* do; these changes make sure calling agents (and the analysts themselves) *know* to do it. Rule: instruct at the moment of choice; every response teaches the next step. `tools-manifest.json` stays the single source of truth — MCP descriptions, A2A card skills, and registry metadata derive from it, never hand-edited separately.

### Phase A instructions

**A-i. `consult_analyst` tool description** (MCP `src/toolHandlers.ts` + `tools-manifest.json`) — append:

> "The analyst researches on your behalf: they can search Fodda's graphs, earnings intelligence, and supplemental data mid-consultation, and may refer or consult other analysts. Their research reads bill to you at standard rates ($0.50/call) and are itemized in `sources_used`."

**A-ii. Expert `AGENTS.md` tool-selection guidance** — the analysts are now tool users themselves and need the mirror of what client agents get. Add a standard section to every `agents/{id}/AGENTS.md` (template, filled per expert):

```
## RESEARCH TOOLKIT
You may call Fodda MCP tools while consulting. Choose by query shape:
- Client asks about YOUR domain → answer from your own knowledge first; search your graph to cite evidence.
- Needs numbers/stats → search_statistics. Public company involved → get_earnings_intelligence.
- Macro/economic backdrop → get_supplemental_context. Broad multi-graph question → deep_research_topic (expensive — only when the client's question genuinely spans domains).
- Outside your lane entirely → do NOT research your way to fake coverage; decline and refer (coverage rules above).
Budget: max {EXPERT_AGENT_TOOLCALL_CAP} tool calls per consultation. Every call costs your client money — research like it's their budget, because it is.
```

**A-iii. Response envelope** — `sources_used` already exists; extend entries with `billed: true|false` and `cost_usd` so the client agent can narrate spend ("I consulted Ben Dietz; he pulled two earnings snapshots, $1.00").

### Phase B instructions

**B-i. `session_id` parameter description**:

> "Omit for a one-off question. Pass the `session_id` from a previous response to continue that engagement — the analyst retains full context, you don't resend history, and follow-up turns cost less."

**B-ii. Envelope**: every consult response returns `session_id` plus `"session_note": "Pass session_id back to continue this engagement."` First-turn only; drop the note on turn 2+ (the agent has learned).

**B-iii. MCP server instructions** (`src/systemPrompt.ts`) — new short section:

```
### ENGAGEMENT PATTERNS
- One-off question → consult_analyst (no session_id)
- Ongoing project → keep passing the session_id; the analyst remembers prior turns and working files
- Finished document (plan, review, briefing) → request_deliverable with an offering_key
```

### Phase C instructions

**C-i. Offerings are discoverable exactly where the choosing happens**:
- `list_analysts` output gains `offerings: [{key, name, price_usd, turnaround, example_brief}]` per analyst.
- Consult responses gain `offerings_available` with a one-line pitch when the conversation topic matches an offering (e.g., marketing question → "This analyst can also produce a full Marketing Plan — $10, ~20 min. Use request_deliverable."). This is the deliverables funnel; there is no other marketing surface for it.

**C-ii. `request_deliverable` tool description carries the whole contract**:

> "Commission a finished document from an analyst. Specify offering_key (see list_analysts offerings), a brief (2–5 sentences: audience, goal, constraints), and optional attachments. Returns a job id — poll with check_deliverable_status. Price is charged on acceptance; the analyst's research is included, not billed separately. Example brief: 'Marketing plan for a DTC skincare launch targeting Gen-Z, $50k budget, 90-day horizon.'"

The `example_brief` field per offering matters most — agents imitate examples far more reliably than they follow abstract instructions.

**C-iii. A2A agent card + registry** (`MCP src/a2aHandler.ts`, `server.json`): each live offering becomes an agent-card skill with price and example prompt; registry description mentions commissioned deliverables. Derived from the Offerings table via the manifest — same discipline as the 30 tools.

### Vocabulary lock
"Engagement" (multi-turn session), "offering" (a purchasable deliverable type), "deliverable" (the produced artifact), "consult" (a Q&A turn). Same words in tool descriptions, envelopes, agent card, Airtable field names, and website copy.

## Guardrails (prerequisite for Phase C, strongly advised for A)
From the API BACKLOG (135–174), now load-bearing:
- Per-consult tool-call cap (suggest 15) and token budget (`max_thinking_tokens` currently never set; sessions unbounded).
- Kill switch: auto-disable an expert agent after 3 consecutive failures.
- `post_tool_call` audit hook routing to the JSON log pipeline — required once agents call MCP tools with user keys.

## Environment Variables Needed
- `EXPERT_AGENT_TOOLCALL_CAP` (default 15), `EXPERT_AGENT_MAX_TOKENS`
- `FODDA_MCP_URL` (default `https://mcp.fodda.ai/mcp`) — avoid hardcoding in two places

## Testing
1. Phase A spike (A2) passes: MCP tool call visible in steps + Questions Log attribution.
2. Consult on ben-dietz-sic asking a stats question → agent calls `search_statistics`, client billed once per read, no double-charge.
3. Nested consult attempt from an expert agent → blocked at depth 1.
4. Session: 3-turn consult retains context without resending history; turn 3 cost < turn 1 cost (cache hits).
5. Deliverable pilot: `marketing_plan` request returns a PDF artifact; offering price charged once; internal reads not separately billed to client.
6. Kill switch: 3 forced failures disables agent, Slack alert fires (extend existing fallback alert, `analysts.ts:1771–1778`).

## Priority
P1 — Phase A is the highest-leverage single change in the roadmap and is mostly wiring an existing pattern. Phase B is small and cheapens costs. Phase C is the new product surface; gate it on the guardrails. Depends on: Brief Expert Self-Use (ownership linkage) for expert payouts on offerings.
