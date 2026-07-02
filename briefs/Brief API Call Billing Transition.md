# Brief: API Call Billing Transition — Fodda API Changes

**Date:** 2026-04-26  
**From:** MCP Agent  
**To:** API Agent  
**Priority:** High — blocks MCP deployment  
**Context:** We are transitioning from variable per-call token billing to fixed-price-per-query billing. The MCP agent has already built `pricingCache.ts`, renamed all user-facing strings from "tokens" to "API calls", and added the `X-Fodda-Billing: mcp-orchestrated` header to all `foddaRequest()` calls.

---

## CRITICAL: Double-Billing Prevention (AGREED)

The MCP now sends `X-Fodda-Billing: mcp-orchestrated` on every `foddaRequest()` call.

**API behavior when `X-Fodda-Billing: mcp-orchestrated` is present:**
1. ✅ Authenticate the user (validate API key, check graph access)
2. ✅ Execute the request (search, evidence lookup, etc.)
3. ✅ Log to Token Log with `billableUnits: 0` and `source: 'mcp'` (visibility)
4. ✅ Log to Questions table (analytics)
5. ❌ **Skip `decrementCredits()`** — the MCP will send one `POST /v1/research/meter` at the end with the full fixed price

**API behavior when header is absent (direct API users):**
- Bill 1 token per call as today — no change

**Header name is confirmed:** `X-Fodda-Billing` (NOT `X-Fodda-Mode` — that's semantic, not billing).

## What You Need To Do

### 1. CRITICAL: Reconcile Pricing Discrepancies

The metering system has conflicting prices between `metering.ts` and `researchRouter.ts`. Fix these BEFORE proceeding:

| Interaction Type | metering.ts (`TOKEN_COSTS`) | researchRouter.ts (`TIER_CONFIG`) | **New Correct Price** |
|-----------------|---------------------------|----------------------------------|----------------------|
| `deep_dive_fast` | 10 | 20 | **20** |
| `deep_dive_comprehensive` | 25 | 50 | **30** |
| `research_stream` | 3 | 1 | **3** (keep metering.ts value) |
| `scheduled_analyst` | 5 | 5 | **20** |

**Files to update:**
- `functions/tracking/metering.ts` — `TOKEN_COSTS` record
- `functions/v1/research/researchRouter.ts` — `TIER_CONFIG` (lines ~192-195)
- `functions/v1/research/scheduledRunner.ts` — `TOKENS_PER_RUN = 5` → `20`

### 2. Update `decrementCredits()` — Header-Aware

`decrementCredits()` already accepts variable `billableUnits` (confirmed — the MCP agent didn't realize). The change needed:

**File:** `functions/tracking/airtable.ts`

```typescript
// Add header check at the top of decrementCredits:
if (req.headers['x-fodda-billing'] === 'mcp-orchestrated') {
    // Log for visibility but don't charge
    tokenLog.create({ billableUnits: 0, Source: 'mcp', taskType: queryTypeCode, ... });
    return; // Skip actual debit
}

// Existing logic for direct API users:
account.queriesUsedThisCycle += billableUnits;
tokenLog.create({ billableUnits: billableUnits, Source: source, taskType: queryTypeCode, ... });
```

The `taskType` field needs to be added to the Token Log write. This is a new field on table `tblOBEs9DLZBcL74O`.

### 3. Extend `/v1/research/meter` to Handle All Query Types

The MCP will now call `/v1/research/meter` for ALL query types, not just Waverunner interactions. The `type` field will include new values:

```typescript
// Current accepted types:
'deep_dive' | 'url_context' | 'research_chat' | 'expert_agent' | 'scheduled_analyst'

// New types to also accept:
'topic_research' | 'brand_intelligence' | 'brainstorm' | 'upload_compare' | 
'standalone_supplemental' | 'standalone_evidence' | 'standalone_statistics'
```

The `billable_units` field will carry the fixed price (e.g., 15 for topic_research, 20 for brand_intelligence). The endpoint should:
1. Call `decrementCredits(billable_units)` 
2. Write to Token Log with the `taskType` field
3. Return the updated balance

### 4. Rename API Response Fields (When Safe)

The MCP currently reads `tokens_remaining`, `tokens_total`, `tokens_used` from API responses but aliases them as `api_calls_remaining` etc. for display.

When ready (coordinate deploy timing), rename the API response fields:
- `tokens_remaining` → `api_calls_remaining`
- `tokens_total` → `api_calls_total`  
- `tokens_used` → `api_calls_used`

**Keep backward compatibility** by sending both field names during the transition period:
```json
{
    "tokens_remaining": 85,
    "api_calls_remaining": 85
}
```

### 5. Rename Airtable Display Names (Manual — Piers)

These are display-only renames. Internal field names stay the same to preserve rollups:

| Table | Current Display | New Display |
|-------|---------------|-------------|
| Token Log (`tblOBEs9DLZBcL74O`) | "Token Log" | "API Call Log" |
| Token Log | `billableUnits` | "API Calls Charged" |
| Accounts (`tblt6mh0XQOablFDX`) | `monthlyQueryLimit` | "Monthly API Calls" |
| Accounts | `queriesUsedThisCycle` | "API Calls Used This Cycle" |
| Accounts | `availableQueries` | "API Calls Remaining" |
| Accounts | `bonusTokens` | "Bonus API Calls" |

### 6. Add New Fields to Token Log (`tblOBEs9DLZBcL74O`)

Add these fields to the existing table (Manual — Piers to create, API agent to write):

| Field | Type | Values |
|-------|------|--------|
| `taskType` | Single line text | `topic_research`, `brand_intelligence`, etc. |
| `sessionId` | Single line text | MCP session ID |
| `graphsSearched` | Single line text | Comma-separated graph IDs |
| `graphCount` | Number (integer) | Count of graphs searched |
| `tokenSource` | Single select | `plan_included`, `bonus_topup` |

---

## Full New Pricing Schedule

These are the agreed prices the system should charge per query type:

| Query Type Code | Display Name | API Calls Charged |
|----------------|-------------|-------------------|
| `topic_research` | Topic Research | **15** |
| `brand_intelligence` | Brand Intelligence Tracker | **20** |
| `weekly_tracker` | Weekly Tracker (per run) | **20** |
| `deep_research_light` | Deep Research (Light) | **20** |
| `deep_research_heavy` | Deep Research (Heavy) | **30** |
| `brainstorm` | Brainstorm | **15** |
| `url_as_prompt` | URL as Prompt | **15** |
| `upload_compare` | Upload & Compare | **20** |
| `standalone_supplemental` | Standalone Supplemental | **5** |
| `standalone_evidence` | Evidence Lookup | **5** |
| `standalone_statistics` | Statistics Search | **5** |
| `research_chat` | Research Chat | **3** |
| `expert_agent` | Expert Agent | **5** |
| `visual` | Visual Intelligence | **0** |
| `admin` | Account / Admin | **0** |

---

## Deploy Order

1. API deploys first (with backward-compatible field names)
2. MCP deploys second (reads new metering behavior)
3. App deploys third (display-only label changes)

---

## Reference: What the MCP Has Already Done

- Created `src/pricingCache.ts` — hardcoded pricing with Airtable fetch support
- Added `X-Fodda-Billing: mcp-orchestrated` header to all `foddaRequest()` calls
- Updated `src/systemPrompt.ts` — all "tokens" → "API calls" in user-facing strings
- Updated `src/toolHandlers.ts` — tool descriptions, credit warnings, error messages
- Added `depth` param to `deep_research_topic` — light (20) vs heavy (30)
- Updated metering call in deep_research_topic to use `queryType` and `apiCallCost`
