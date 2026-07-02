# Brief: Complete SPT Pricing Table in Docs (Website Agent)

**Date:** 2026-06-20  
**From:** API Agent (via Coordinator)  
**To:** Website Agent  
**Priority:** P2 — Doc completeness. The API now exposes unified per-task SPT pricing (`GET /v1/research/pricing`). The website docs should enumerate all task types, not just search and deep-dive.

---

## Context

SPT pricing is now unified: `price = typical_calls × $0.50`. The API's `/v1/research/pricing` endpoint returns the full table with `spt_rate_usd` and `spt_prices_usd`. The earlier brief updated `$0.25 → $0.50` but only covered search and deep-dive. Several task types (expert consult, brand intelligence, supplemental, etc.) were missing from the docs entirely.

## Changes Required

### 1. `llms-full.txt` — Replace the per-request pricing line

**Current (line ~104):**
```
- Per-request pricing: raw single API calls $0.50/call. Orchestrated tasks priced per task (typical calls × $0.50): deep dive fast $10, deep dive comprehensive $15, brand intelligence $10, topic research $7.50, supplemental/evidence/statistics $2.50. Live prices: GET /v1/research/pricing.
```

**Replace with the full table:**
```
- Per-request SPT pricing (price = typical API calls × $0.50). Values MUST match `GET https://api.fodda.ai/v1/research/pricing` → `spt_prices_usd` verbatim — copy from there, do not hand-maintain:
  - Graph search, node lookup, URL context: $0.50 (1 call)
  - Research stream, research chat: $1.50 (3 calls)
  - Expert analyst consult (per turn), supplemental data, evidence lookup, statistics: $2.50 (5 calls)
  - Topic research, brainstorm, URL-as-prompt: $7.50 (15 calls)
  - Brand intelligence audit, deep dive (fast), weekly tracker, upload & compare: $10.00 (20 calls)
  - Deep dive (comprehensive): $15.00 (30 calls)
  - Visual, account/admin: free
  - Live source of truth: GET https://api.fodda.ai/v1/research/pricing
```

### 2. `Pricing.tsx` — Add expert consult to per-task list

The coder flagged that the pricing page lists supplemental/evidence/statistics at $2.50 but **not** expert consult (`/v1/analysts/consult`). Add it alongside the others at the $2.50 tier.

> [!CAUTION]
> **DO NOT change these — they are different pricing constructs:**
> - `$0.20/call` — plan overage rate (subscriptions)
> - `$0.040/call` — wholesale/enterprise rate
> - Deep dive prices changed: `$2.50/$7.50 → $10.00/$15.00` — update these if they appear on the page.

### 3. `CHANGELOG.md` — Add entry

```markdown
## [2026-06-20] — Complete SPT Pricing Table

### Changed
- `llms-full.txt` now lists all per-task SPT prices (was only search + deep dive). Includes expert consult, brand intelligence, supplemental, research chat/stream, and more.
- `Pricing.tsx` now includes expert analyst consult ($2.50) in the per-task SPT list.
- Deep dive repriced: fast $2.50 → $10.00, comprehensive $7.50 → $15.00 (aligned to TOKEN_COSTS × $0.50).
```

## Acceptance Criteria

- [ ] `llms-full.txt` lists all task types with correct SPT prices
- [ ] `Pricing.tsx` includes expert consult at $2.50
- [ ] `Pricing.tsx` deep dive shows $10.00/$15.00 (not old $2.50/$7.50)
- [ ] Overage ($0.20) and wholesale ($0.040) unchanged
- [ ] Website deployed

## Out of Scope

- `llms.txt` — the short version just says `$0.50/API call` (the base rate), which is fine as-is.
- API changes — already deployed with full unified pricing.
