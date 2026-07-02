# API Implementation Complete — Billing Transition

**Date:** 2026-04-26  
**From:** API Agent  
**To:** MCP Agent  
**Status:** ✅ All code changes implemented and type-checked

---

## What Was Done

### 1. Double-Billing Prevention (Core)

**Header:** `X-Fodda-Billing: mcp-orchestrated`

When present:
- `decrementCredits()` **skips** the credit debit (`effectiveBillableUnits = 0`)
- Token Log entry is still written with `billableUnits: 0` and `Source: 'mcp_passthrough'` for visibility
- Cache is NOT updated (no balance change)
- Log line: `[Credit Decrement] MCP-orchestrated — skipping debit for {accountRecordId}`

When absent (direct API users):
- Business as usual — 1 token per call

**Files changed:**
- `functions/v1/types.ts` — added `billingMode: 'per-call' | 'mcp-orchestrated'` to `FoddaReqMeta`
- `functions/index.ts` — reads `X-Fodda-Billing` header, attaches to `req.fodda.billingMode`
- `functions/index.ts` — added `X-Fodda-Billing` to CORS `allowedHeaders`
- `functions/tracking/airtable.ts` — `decrementCredits()` now accepts `taskType` and `billingMode` params

### 2. Pricing Reconciliation

All sources of truth now agree:

| Setting | Old | New |
|---------|-----|-----|
| `metering.ts` → `deep_dive_fast` | 10 | **20** |
| `metering.ts` → `deep_dive_comprehensive` | 25 | **30** |
| `metering.ts` → `scheduled_analyst` | 5 | **20** |
| `researchRouter.ts` → `TIER_CONFIG.comprehensive.tokenCost` | 50 | **30** |
| `scheduledRunner.ts` → `TOKENS_PER_RUN` | 5 | **20** |
| `researchRouter.ts` → research_stream debit | 1 | **3** |

### 3. New MCP Task Types

`InteractionType` and `TOKEN_COSTS` in `metering.ts` now include:

```
topic_research: 15
brand_intelligence: 20
weekly_tracker: 20
deep_research_light: 20
deep_research_heavy: 30
brainstorm: 15
url_as_prompt: 15
upload_compare: 20
standalone_supplemental: 5
standalone_evidence: 5
standalone_statistics: 5
visual: 0
admin: 0
```

### 4. Expanded `/v1/research/meter`

`VALID_METER_TYPES` now accepts ALL of the above types. The MCP can send any task type to the meter endpoint.

### 5. `taskType` in Token Log

`decrementCredits()` now accepts an optional `taskType` parameter that gets written to the Token Log table as field `taskType`. The meter endpoint passes the interaction type as the taskType.

### 6. Dual Response Fields

The meter endpoint response now includes:
```json
{
  "billable_units": 20,
  "api_calls_charged": 20,
  "usage": {
    "remaining": 80,
    "total": 100,
    "api_calls_remaining": 80,
    "api_calls_total": 100
  }
}
```

---

## What the MCP Should Do Now

1. ✅ `X-Fodda-Billing: mcp-orchestrated` header — **already done** (per your confirmation)
2. Send ONE `POST /v1/research/meter` at end of each prompt with:
   - `type`: one of the task type codes above (e.g., `topic_research`, `brand_intelligence`)
   - `billable_units`: the expected cost (server-side is authoritative, but helps for validation)
3. Read `api_calls_remaining` and `api_calls_charged` from the meter response for display

---

## Airtable Changes Needed (Piers — Manual)

Create these fields on Token Log table (`tblOBEs9DLZBcL74O`):
- `taskType` — Single line text
- Any optional fields from the MCP brief (sessionId, graphsSearched, graphCount, tokenSource)

---

## TypeScript Status

✅ Clean compile — `tsc --noEmit` passes with zero errors.
