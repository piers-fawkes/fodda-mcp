# Brief: Per-User Trial Token Counting in MCP Proxy

**Priority:** High — needed now  
**Agent:** MCP  
**Codebase:** `/Fodda MCP` (deployed to Cloud Run as `mcp.fodda.ai`)

---

## Problem

All trial users share a single API key (e.g. `sk_trial_all`) with a shared credit pool. When one heavy user burns through all the credits, **every** trial user gets blocked. We need per-user counting so each individual gets their own limit.

## What Already Exists (DO NOT rebuild)

The MCP already has a complete trial → Base conversion flow. You are ONLY adding the per-user counting layer that triggers it earlier.

### Existing flow (leave untouched):
1. **`appendUsageWarning()`** in `toolHandlers.ts` (line 70-97) — injects `_credit_warning` when API reports <10 tokens remaining
2. **`handleTrialCreditExhaustion()`** in `errorHandling.ts` — handles 403 from the API:
   - Trial + has email → auto-upgrade to Base via `/api/account/trial-convert`
   - Trial + no email → `TRIAL_EXHAUSTED` with `COLLECT_EMAIL` action
3. **System prompt** (line 148 in `systemPrompt.ts`) — full `TRIAL CONVERSION FLOW` instructions for Claude
4. **`sign_up_free_account` tool** (line 1699 in `toolHandlers.ts`) — creates Base accounts
5. **`sessionTracker.ts`** — per-session in-memory tracking (frustration detection, resets on reconnect)

### The gap:
The conversion flow only triggers when the **shared pool** API returns a 403. There is no per-user counting. User A can burn 49 tokens while User B uses 1, then both get blocked.

## What to Build

### Per-user token counter
A persistent counter that tracks how many API calls each trial user (identified by `userId` email from the `id=` URL param) has made **across all sessions**.

### Where `userId` comes from
Already parsed in `src/index.ts` (lines 428-433):
```typescript
const entryId = (req.query.id as string) || '';
const isEmailId = entryId.includes('@');
const userId = (req.query.user_id as string) || (isEmailId ? entryId : 'anonymous');
```
This `userId` is passed to `createServer(apiKey, userId, ...)` and is available in every tool handler.

### Where `isTrial` comes from
Already computed in `toolHandlers.ts` line 202:
```typescript
const isTrial = apiKey.startsWith('sk_trial_');
```

### Logic to add

**Before each API call** (in the tool handlers), for trial users:
1. Read the user's current count from persistent storage
2. If `count >= PER_USER_TRIAL_LIMIT` (50):
   - Do NOT make the API call
   - Return the same `TRIAL_EXHAUSTED` / `COLLECT_EMAIL` response that `handleTrialCreditExhaustion()` already returns
   - This triggers the existing conversion flow in the system prompt
3. If `count < PER_USER_TRIAL_LIMIT`:
   - Proceed with the API call
   - After success, increment the user's counter
4. When `count` approaches the limit (e.g., remaining < 10):
   - Append the same style `_credit_warning` that `appendUsageWarning()` already uses

### Where to count
The simplest approach: wrap this in a small module (`src/trialTracker.ts`) and call it in the existing `foddaRequest()` wrapper or at the top of each tool handler (search_graph, get_evidence, get_neighbors, etc.).

### Persistence
Cloud Run instances are ephemeral — in-memory counters reset on cold starts.

**Recommended: Firestore** — The Fodda API project (`fodda-api`) already uses Firebase. The MCP Cloud Run service account should already have access. Simple doc per user:
```
collection: trial-usage
document: {userId email}
fields: { count: number, firstUse: timestamp, lastUse: timestamp }
```

**Alternative: Fodda API endpoint** — Add a lightweight GET/POST `/v1/trial-usage/:userId` to the API. Keeps persistence centralized but adds a network hop.

### Monthly reset
If `firstUse` is older than 30 days, reset `count` to 0 and update `firstUse`. This prevents permanently blocking returning users.

### Anonymous users
If `userId` is `'anonymous'` (no `id=` in URL), count against a single shared "anonymous" bucket. These users hit the shared pool limit naturally — no special handling needed.

## Files to modify

| File | Change |
|------|--------|
| `src/trialTracker.ts` | **NEW** — Firestore-backed per-user counter: `getTrialUsage(userId)`, `incrementTrialUsage(userId)` |
| `src/toolHandlers.ts` | Before API calls in trial mode, check per-user limit; after success, increment |
| `src/errorHandling.ts` | No changes — reuse existing `handleTrialCreditExhaustion()` return format |
| `src/systemPrompt.ts` | No changes — existing `TRIAL CONVERSION FLOW` handles the rest |

## What NOT to change
- Do NOT rebuild the trial conversion flow — it already works
- Do NOT modify the API's shared credit pool — it remains as a backstop
- Do NOT change the `_credit_warning` message format — just trigger it earlier based on per-user count
- Do NOT write trial usage to the Token Log table
- The `sign_up_free_account` tool and `handleTrialCreditExhaustion()` stay exactly as they are

## Testing
1. Use MCP URL: `https://mcp.fodda.ai/mcp?api_key=sk_trial_all&id=test-trial-user@gmail.com`
2. Make 50+ queries
3. Verify the `TRIAL_EXHAUSTED` / `COLLECT_EMAIL` response appears on query 51
4. Verify a different `id=` email still has a fresh count of 0
5. Restart the MCP server → verify the count persists (Firestore)
6. Verify the `_credit_warning` appears when remaining < 10
