# API-side handoff — LinkedIn content tools (`draft_linkedin_post`, `draft_linkedin_article`)

**From:** MCP agent, 2026-07-05 (MCP v1.33.0)
**To:** API agent (Fodda API repo — auth/billing gateway)
**Why:** The MCP now ships two LinkedIn content tools, each metered as ONE content call via
`POST /v1/research/meter` with NEW queryTypeCodes. The MCP side is done (pricing defaults,
settleOrWithhold wiring, SPT pre-run guard). The API/Airtable side needs the entries below,
or the meter calls will be rejected/unpriced and SPT sessions won't see a price at connect time.

## 1. Interaction types / TOKEN_COSTS

Add to the API's TOKEN_COSTS (and wherever interaction types are enumerated):

| queryTypeCode / interactionType | tokens | rationale |
|---|---|---|
| `linkedin_post` | **10** | 4–8 graph queries fan-out (2–4 sub-themes × domain+expert, optional earnings snapshot) + curation |
| `linkedin_article` | **20** | 6–10 search queries + statistics pass + one analyst consult |

At the flat $0.50/call rail: linkedin_post = **$5.00**, linkedin_article = **$10.00**.

## 2. SPT mappings

Add both codes to the SPT price map returned at MCP connect time (the `prices` object keyed by
queryTypeCode) so anonymous pay-per-task agents get pre-run coverage checks:

- `linkedin_post` → 1000 cents ($5.00, if using tokens × $0.50)
- `linkedin_article` → 2000 cents ($10.00)

The MCP's `sptGuard('linkedin_post' | 'linkedin_article')` already reads these; until the codes
appear in the connect-time price map, the guard passes silently and settlement is the only gate.

## 3. Meter endpoint

`POST /v1/research/meter` will start receiving bodies:

```json
{ "type": "linkedin_post", "billable_units": 10, "query": "<topic>" }
{ "type": "linkedin_article", "billable_units": 20, "query": "<topic>" }
```

Ensure these `type` values are accepted (not rejected as unknown interaction types) and land in
the usage ledger with a distinguishable interaction type (Questions Log `interactionType` will
also carry `linkedin_post` / `linkedin_article` from the MCP's query logging).

## 4. Offerings rows (offerings catalog / registry metadata)

Two new rows, sourced from tools-manifest.json (already regenerated, count = 33):

| tool | bills_as | category | published_price |
|---|---|---|---|
| `draft_linkedin_post` | `linkedin_post` | Content | calls × $0.50 = $5.00 |
| `draft_linkedin_article` | `linkedin_article` | Content | calls × $0.50 = $10.00 |

`published_price` stays settable for future value-based review per the pricing stance.

## 5. Airtable Query Pricing table (tblHsMfyoW39LqCv8)

The MCP hardcodes defaults, but when Airtable pricing is configured it REPLACES the defaults
wholesale. Add two rows so the codes survive an Airtable refresh:

- `queryTypeCode=linkedin_post`, `queryTypeName=LinkedIn Post (Evidence Pack)`, `apiCallsCharged=10`, `researchCalls=8`, `overheadCalls=0`, `mcpToolName=draft_linkedin_post`, `meterInteractionType=linkedin_post`, `isActive=true`
- `queryTypeCode=linkedin_article`, `queryTypeName=LinkedIn Article (Evidence Pack)`, `apiCallsCharged=20`, `researchCalls=14`, `overheadCalls=0`, `mcpToolName=draft_linkedin_article`, `meterInteractionType=linkedin_article`, `isActive=true`

## Notes

- The engine's internal fan-out calls go through the normal `foddaRequest` path with the
  X-Fodda-Billing header suppressing per-call billing (same pattern as other composite tools) —
  the meter call above is the only debit.
- No API endpoint changes are needed: the engine only consumes existing endpoints
  (`/v1/search/domain`, `/v1/search/expert`, `/v1/graphs/{id}/statistics`,
  `/v1/supplemental/earnings/snapshot`, `/v1/analysts/consult`).
- Do NOT return raw Stripe strings in 402/403 bodies (already fixed platform-wide); the engine
  aborts on explicit CREDITS_EXHAUSTED / PLAN_LIMIT_EXCEEDED and refuses to emit a thin pack.
