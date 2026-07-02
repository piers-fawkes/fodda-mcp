# Brief: Expert Self-Use — Free Own-Agent Usage & Ownership Linkage

## Objective
The account that created a Human Agent uses that agent for free. Billing applies only when the expert's agent reaches beyond their own knowledge — other experts' graphs, PSFK graphs, earnings intelligence, supplemental data — at the standard $0.50/call rate. Make the rule enforceable by record ID, not email.

## Context
The self-use waiver already exists at the access-gate level (`functions/v1/analysts.ts` ~940–964): `account.accountRecordId === graph.owner_account_id` bypasses the paid-tier gate for expert graphs. But two billing paths still charge the owner, and ownership is only inferred through the graph — the Analysts table has no owner field. Verified 2026-07-01:

- `functions/v1/graphService.ts:884` — `decrementCredits()` fires **unconditionally** on expert-graph reads. The `isSelfUse` flag computed at line 880 is only passed to the payout log. **Today an expert pays to read their own graph and receives no payout.**
- `functions/v1/analysts.ts` ~2014 — flat `analyst.tokenCost` consult fee is charged to everyone except `internal_service`, including the owner. (Managed Digital Twins already charge 0 flat — this affects non-managed analysts only.)
- Identity is graph-indirect: an analyst with a missing/unlinked graph silently loses the waiver; multi-graph analysts are ambiguous; an expert signing up with a different email gets a new account record and no waiver.

## Changes Required

### 1. Skip billing on self-use graph reads — `functions/v1/graphService.ts`
In `_doLogExpertRead()` (~line 880):

```typescript
const isSelfUse = requestingAccountId === graph.owner_account_id;

// 1. Bill the user — WAIVED for self-use (owner reading own graph)
if (!isSelfUse) {
    decrementCredits(
        requestingAccountId, readCost, rawKey, undefined, 'api', graphId,
        'expert_graph_read'
    ).catch(err => console.error(`[GraphService/Billing] Decrement error for ${graphId}:`, err));
}

// 2. Payout log unchanged — isSelfUse already suppresses payout (payoutLog.ts:16)
```

Keep the payout log entry with `isSelfUse: true` so the Questions Log / analytics still see the read.

### 2. Waive consult fee for owner — `functions/v1/analysts.ts`
The `isOwnerSelfUse` boolean already exists (~line 943). Thread it to the billing site (~line 2014):

```typescript
const totalCost = isOwnerSelfUse ? 0 : analyst.tokenCost * (1 + similarityRetryCount);
if (totalCost > 0 && account?.accountRecordId && account.accountRecordId !== 'internal_service') {
    decrementCredits(...);
}
```

### 3. First-class ownership on the Analyst record — Airtable + `analysts.ts`
- **Airtable**: add `ownerAccount` linked-record field (Analysts table → Accounts table, base `appXUeeWN1uD9NdCW`). Set at Human Agent creation/claim time from the creating account's record ID. Email is display metadata only — never the match key.
- **Code**: parse the field in `getAnalysts()` (add `ownerAccountId: string | null` to the `Analyst` interface, ~line 254–301). Compute the waiver analyst-first with graph fallback:

```typescript
const isOwnerSelfUse = Boolean(account?.accountRecordId) && (
    analyst.ownerAccountId === account.accountRecordId ||
    analystGraphIds.some(gId =>
        registry.find(g => g.graphId === gId)?.owner_account_id === account.accountRecordId)
);
```

### 4. `GET /v1/analysts/me` — resolve identity from API key
New endpoint: look up the caller's `accountRecordId`, return the analyst record(s) where `ownerAccountId` matches (fallback: graphs via `/v1/graphs/mine` → `ANALYST_GRAPH_MAP` reverse lookup). Returns analyst id, backing graphs, status, and a ready-to-paste MCP connector snippet. This is the API footing for any future "Your Agent" dashboard panel (website repo, out of scope here).

### 5. Soft cap on free self-use (COGS guard)
Free self-consults still cost Fodda the Antigravity turn (~$0.25–$3.25/task once preview compute pricing ends). Add a per-day counter (Firestore, keyed `selfuse_{accountRecordId}_{date}`), default cap via `SELF_USE_DAILY_CAP` env var (suggest 25). On exceed: 429 with a friendly "heavy self-use" message and upsell link. Overlaps with BACKLOG per-agent token budgets — this is the cheap interim guard.

## Instructions & Discovery
The capability is invisible unless every surface that touches an owner says so. Ship these with the code, not after:

### 1. Self-use consult envelope (`analysts.ts` response, MCP passthrough)
When `isOwnerSelfUse`, add to the consult response:

```json
"self_use": true,
"billing_note": "Self-use — no charge. When your agent reads other experts' graphs, earnings, or supplemental data, those calls bill at standard rates."
```

The MCP `consult_analyst` handler passes this through untouched. The owner is reminded of the deal on every single use — no docs page needed.

### 2. `GET /v1/analysts/me` response is an onboarding artifact, not just data
Return, alongside the analyst record:

```json
"connect": {
    "mcp_url": "https://mcp.fodda.ai/mcp",
    "instructions": "Add this URL as a custom connector in Claude, ChatGPT, or any MCP client, using your API key. Then ask for yourself by name — e.g. 'Consult <analyst name> about <topic>'. Your own agent is free to use; it pays standard rates only when it researches beyond your graph.",
    "example_prompt": "Consult <analyst name>: what are the three trends my clients should be acting on this quarter?"
}
```

This is the paste-ready "here's YOUR agent" front door until a dashboard exists.

### 3. Soft-cap 429 explains itself
Match the tone of existing credit-exhaustion errors:

```
SELF_USE_CAP_REACHED — "You've hit today's free self-use limit (25 consults). It resets at midnight UTC. Heavy workflow? Reply to this or see {upsellLink} — we'd rather raise your limit than slow you down."
```

Never a bare 429 — the expert hitting this cap is your most engaged user.

### 4. Vocabulary lock
"Self-use" is the term, everywhere — envelope fields, error codes, payout log, future dashboard copy. Not "owner mode," not "free tier." One concept, one word.

### 5. Out-of-repo checklist (hand to website/onboarding)
- Expert welcome email includes the `connect` block from /me verbatim.
- Expert page on fodda.ai: "This expert's agent is available in Claude — experts use their own agent free."

## Environment Variables Needed
- `SELF_USE_DAILY_CAP` — daily free self-consult limit (default 25)

## Testing
1. Owner (matching `ownerAccount`) calls `consult_analyst` on own analyst → 0 charge, payout log has `isSelfUse: true`, no payout row.
2. Owner's agent reads a DIFFERENT expert graph mid-consult → `expert_graph_read` charged at standard rate, other expert's payout logged.
3. Non-owner free-tier user consults the expert → 402 `EXPERT_GRAPH_PAID_ONLY` unchanged.
4. Legacy analyst with no `ownerAccount` field but owned backing graph → waiver still fires (fallback path).
5. Cap: 26th self-consult in a day → 429.
6. Regression: `internal_service` path and SPT-paid anonymous agent path unchanged.

## Priority
P0 — two of the five changes are one-line billing fixes for a promise ("your agent is free for you") we want to make publicly. Cheapest growth loop available: every expert using their own agent daily is a live demo.
