# Brief: SPT Pricing Update — $0.25 → $0.50

**Date:** 2026-06-20  
**From:** API Agent (via Coordinator)  
**To:** Website Agent  
**Priority:** P1 — Correctness. The API now charges $0.50/call for SPT (Stripe's minimum). The website's manifests and pricing page still advertise $0.25, so agents and humans see the wrong price.

---

## Context

Stripe enforces a **$0.50 USD minimum** per PaymentIntent. SPT (Shared Payment Token) creates one PaymentIntent per API call. The old $0.25 default was below this floor and caused every SPT charge to fail. The API has been updated:

- `resolveEndpointPrice()` now returns `$0.50` as the minimum (was `$0.25`)
- The 402 response is **endpoint-aware**: `/v1/graphs` → `amount=50`, `/v1/research/deep-dive` → `amount=250`, comprehensive → `amount=750`
- The `WWW-Authenticate` header reflects the per-endpoint price
- **Deployed** as revision `fodda-api-new-00387-v6m`

> [!IMPORTANT]
> **Pricing model (updated).** Prices now derive from one source: **price = typical_calls × $0.50** (the SPT rate), per `Brief - Unify SPT Pricing on typical_calls x 0.50 (API Agent).md`. So:
> - **Raw single API call → $0.50**
> - **Orchestrated tasks (per task):** deep dive fast **$10**, deep dive comprehensive **$15**, brand intelligence **$10**, topic research **$7.50**, supplemental / evidence / statistics **$2.50**
>
> These **supersede the old $2.50 / $7.50 deep-dive figures.** Update the docs to THESE numbers. **Live source of truth = `GET /v1/research/pricing`** — for `llms.txt`/machine surfaces, prefer pointing agents there over hardcoding. **Coordinate timing:** deploy the website only *after* the API unify-pricing change ships, so the page matches the live 402.

## Changes Required

### 1. `llms.txt` — Line 40

**Current:**
```
- SPT (Shared Payment Token) via MPP: Hit any endpoint without credentials → HTTP 402 with pricing → pay per-request ($0.25/API call) via Authorization: Bearer spt_xxx
```

**Change to:**
```
- SPT (Shared Payment Token) via MPP: Hit any endpoint without credentials → HTTP 402 with pricing → pay per-request ($0.50/API call) via Authorization: Bearer spt_xxx
```

### 2. `llms-full.txt` — Line 104

**Current:**
```
- Per-request pricing: $0.25/call (search, supplemental), $2.50 (deep dive fast), $7.50 (deep dive comprehensive).
```

**Change to:**
```
- Per-request pricing: raw single API calls $0.50/call. Orchestrated tasks priced per task (typical calls × $0.50): deep dive fast $10, deep dive comprehensive $15, brand intelligence $10, topic research $7.50, supplemental/evidence/statistics $2.50. Live prices: GET /v1/research/pricing.
```

### 3. `Pricing.tsx` — SPT per-call price lines

Update the SPT / per-call / anonymous agent price from `$0.25` → `$0.50` at these locations:

- **Line ~400** — SPT per-call price display
- **Line ~406** — SPT per-call price display
- **Line ~460** — SPT per-call price reference
- **Line ~565** — SPT per-call price reference

> [!CAUTION]
> **DO NOT change these — they are different pricing constructs:**
> - `Pricing.tsx:270` — `$0.20/call` is the **plan overage rate** (subscription overuse). Not SPT.
> - `Pricing.tsx:661` — `$0.040/call` is the **wholesale/enterprise rate**. Not SPT.
> - `ApiDocs.tsx:385` — uses `amount=<cents>` generically (no hardcoded number). Leave as-is.
> - A2A agent card — has no hardcoded SPT price (defers to the 402 response). Leave as-is.

### 4. `CHANGELOG.md` — Add new entry

Add a new changelog entry at the top:

```markdown
## [2026-06-20] — SPT Pricing Update

### Changed
- Updated SPT per-request pricing from $0.25 to $0.50/API call in `llms.txt`, `llms-full.txt`, and `Pricing.tsx` (Stripe enforces a $0.50 USD minimum charge per PaymentIntent).
```

## Acceptance Criteria

- [ ] `llms.txt` shows `$0.50/API call` (not `$0.25`)
- [ ] `llms-full.txt` shows `$0.50/call` for search/supplemental (not `$0.25`)
- [ ] `Pricing.tsx` SPT prices show `$0.50` (not `$0.25`) at all 4 locations
- [ ] `Pricing.tsx` overage rate (`$0.20`) and wholesale rate (`$0.040`) are **unchanged**
- [ ] Website deployed with updated files

## Out of Scope

- The API's 402 response and `GET /v1/research/pricing` are already correct — don't touch those.
- The MCP server reads pricing dynamically from the API — no changes needed there.
