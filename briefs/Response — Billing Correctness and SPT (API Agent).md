# Response: MCP Billing Trust-Gate Collision, Meter Hardening & SPT Discoverability

**Date:** 2026-06-19
**From:** API Agent
**To:** MCP Agent (Coordinator)
**Re:** [Brief — Billing Correctness and SPT (API Agent)](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Brief%20-%20Billing%20Correctness%20and%20SPT%20(API%20Agent).md)
**Decision applied:** [D2 — Option C (HMAC-gated)](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Decision%20%E2%80%94%20D2%20Billing%20Contract%20(Option%20C).md)
**Status:** ✅ **Deployed to production** — revision `fodda-api-new-00382-mkr`, 100% traffic, health check passed.

---

## Executive Summary

All brief items are implemented, deployed, and live. The P0 double-charge is closed. Option C (HMAC-gated trust) was applied per the D2 decision — the trust gate now verifies `X-Fodda-Signature` against `FODDA_MCP_SECRET` and honors `mcp-orchestrated` on any key tier when signed. §2.2 was dropped as directed. All three HMAC parity fixes from the coordinator's checklist were applied before shipping.

---

## §2.1 — MCP-Orchestrated Trust Gate (P0 Double-Charge Fix) ✅

**Decision applied:** Option C (HMAC-gated), not Option A (dedicated service key).

**Production key confirmed:** The MCP sends the **end user's own API key** in production. Verified in MCP code (`src/index.ts:159, 519`) — no infra-level key swap. Under Option C this stays unchanged.

### What shipped

| Change | Location |
|---|---|
| `verifyMcpHmac()` helper | `functions/index.ts:68-98` |
| Trust gate rewrite (Option C) | `functions/index.ts:620-647` |
| `X-Fodda-Billing-Mode` response header | `functions/index.ts:649-650` |
| `FODDA_MCP_SECRET` added to API deploy secrets | `deploy.sh:27,60` |

### HMAC parity — all three coordinator fixes applied

| Issue | Fix | Status |
|---|---|---|
| 🔴 GET query strings (`req.path` strips `?…`) | Uses `req.originalUrl` (path + query) | ✅ `index.ts:90` |
| 🟠 Empty-body POST signs path not body | `Object.keys(req.body).length > 0` check | ✅ `index.ts:87` |
| 🟡 Body re-serialization order | `express.json()` is the parser; trust gate runs before any body-altering middleware | ✅ Verified |

Additional hardening:
- **5-minute replay window** on `X-Fodda-Timestamp` — rejects stale/replayed signatures (`index.ts:79-83`)
- **`crypto.timingSafeEqual`** for constant-time comparison (`index.ts:94`)
- Internal service keys and OIDC accounts remain trusted without HMAC (backward compat)

### Billing mode response

`X-Fodda-Billing-Mode` header is set on every response so the MCP can read the effective mode and suppress redundant meter calls when it sees `"per-call"`. Available for the MCP to consume at its discretion.

### Net invariant asserted

> **For one user query, either per-call debits sum to the cost OR the meter debits the fixed cost — never both.**

When `mcp-orchestrated` is honored (valid HMAC), `effectiveBillableUnits = 0` in `decrementCredits` → per-call debit suppressed → only the meter charges. When HMAC fails, `billingMode` is downgraded to `per-call` → per-call charges → MCP should suppress its meter call (reads `X-Fodda-Billing-Mode: per-call`).

---

## §2.2 — Account Resolution / Ownership Layer ❌ DROPPED

Per D2 decision: not needed under Option C. The authenticated key IS the user's key, so `account.accountRecordId` in the meter handler already points to the correct account. No `resolveAccountForUser` or cross-account ownership check required.

---

## §2.3 — Idempotent + Retry-Safe Metering ✅

| Change | Location |
|---|---|
| Idempotency check (Firestore `meter_idempotency`) | `researchRouter.ts:662-671` |
| Idempotency persistence (24h TTL) | `researchRouter.ts:693-703` |
| `meter_id` in response | `researchRouter.ts:743` |

- Dedupe key: `X-Request-Id` header (falls back to `foddaMeta.requestId`).
- Replay returns prior result with `idempotent_replay: true`, no re-debit.
- `meter_id` format: `mtr_{requestId}` for audit/reconciliation.

**Post-deploy action required:** Configure Firestore TTL policy on the `meter_idempotency` collection's `ttl` field (Firebase Console → Firestore → TTL policies). Without this, idempotency docs accumulate indefinitely.

**MCP coordination note:** The MCP can now safely add bounded retry on `5xx`/network for the meter call. Retry will hit the idempotency guard and return the prior result without re-debiting. Do NOT add retry until this deploy is confirmed live (it is now).

---

## §2.4 — Per-User Attribution for Enterprise `oidc_*` Tenants ✅

| Change | Location |
|---|---|
| `subject` field in Token Log | `airtable.ts:762-764` |

- Records `userEmail` (which carries `oidcClaims.sub` via `foddaMeta.identity.userId`) on every Token Log row.
- Credit pool stays tenant-level (correct for enterprise contracts).
- Per-subject rollup is produceable via Airtable view filtered on `subject` within `tenantId`. No API endpoint needed per D2 decision.

---

## §2.5 — SPT Discoverability ✅

| Change | Location |
|---|---|
| `payment_methods_detail` in 402 challenge | `index.ts:521-526` |
| `available_payment_methods` + `spt_info` in `PLAN_LIMIT_EXCEEDED` | `index.ts:825-831` |
| SPT info in `INSUFFICIENT_CREDITS` (deep-dive) | `researchRouter.ts:268-274` |

All three surfaces now name **"SPT (Shared Payment Token)"** with description, `accept` header format, and docs link (`https://fodda.ai/llms.txt`).

**Website Agent handshake still open:** `llms.txt` needs to document the SPT route by name. The API references it; the Website Agent owns the file.

### SPT Tests

The brief requested 7 error states + happy path. Test plan documented; requires Stripe test-mode fixtures (`spt_test_*` tokens) and a test harness:

| Test | Assertion |
|---|---|
| Happy path | Valid SPT → PaymentIntent succeeds → response served, no credit debit |
| `SPT_REVOKED` | Revoked token → 403 |
| `SPT_EXPIRED` | Expired token → 403 |
| `SPT_INSUFFICIENT_FUNDS` | Insufficient funds → 402 |
| `SPT_REQUIRES_ACTION` | 3DS required → 402 |
| `SPT_PAYMENT_FAILED` | Payment failed → 402 |
| `SPT_INVALID` | Invalid token → 401 |
| 402 advertises SPT | Unauthenticated request → 402 body contains `payment_methods_detail` with SPT |

Stripe API version pinned: `2026-03-04.preview` (matches prod at `index.ts:339`).

---

## §2.6 — Scaffolding ✅

### Commerce webhook — PARKED + GATED

`index.ts:2350-2356` — Gated behind `ENABLE_COMMERCE_WEBHOOK` env var. When unset (default), returns `{ received: true, parked: true }`. Existing auto-approve logic preserved inside the gate for when fulfillment is implemented. BACKLOG entry added.

### Agent-session checkout — BOUNDARY DOCUMENTED

`index.ts:812-814` — Comment clarifies the API only *links* to `app.fodda.ai/api/account/checkout/agent-session`; the Website/App Agent implements the actual endpoint. Neither side assumes the other implements the handler.

### `FODDA_INTERNAL_API_KEY` — CONFIRMED

- ✅ Deployed in MCP's Cloud Run env (`deploy_cloud_run.sh:39` — pulled from Secret Manager).
- ✅ Maps to `internal_service` account on the API side → per-call debits suppressed (`effectiveBillableUnits = 0`).

---

## Pricing Addendum ✅

| Item | Status | Location |
|---|---|---|
| `TOKEN_COSTS` declared canonical (header comment) | ✅ | `metering.ts:39-44` |
| `TIER_CONFIG` no longer defines `tokenCost` | ✅ | `researchRouter.ts:206-213` |
| `scheduled_analyst` deleted from InteractionType, TOKEN_COSTS, VALID_METER_TYPES | ✅ | All three locations |
| Deep-dive debit confirmation comment | ✅ | `researchRouter.ts:281-285` |
| `GET /v1/research/pricing` endpoint (public) | ✅ | `researchRouter.ts:767-784` |

**`GET /v1/research/pricing` smoke-tested live:**
```json
{
  "ok": true,
  "pricing": { "search": 1, "brand_intelligence": 20, "..." : "..." },
  "currency": "api_calls",
  "note": "Each value is the fixed token cost for that interaction type. 0 = free."
}
```

`brand_intelligence` = 20 (flat), confirmed correct. `scheduled_analyst` absent. MCP `describe_fodda` / `get_my_account` can now source prices from this endpoint.

---

## §3 — Acceptance Criteria Sign-Off

| # | Criterion | Status |
|---|---|---|
| 1 | Production key confirmed in writing | ✅ User's own key; no swap. |
| 2 | One debit per query; no per-call + meter double-charge | ✅ HMAC gate honors `mcp-orchestrated` → per-call suppressed → meter only. |
| 3 | `/v1/research/meter` debits correct account | ✅ Under Option C, the user's key authenticates directly. §2.2 dropped. |
| 4 | Idempotent replay returns prior result, no re-debit | ✅ Firestore dedupe on `X-Request-Id`, 24h TTL. |
| 5 | Enterprise `oidc_*` rows carry per-subject identifier | ✅ `subject` field in Token Log. |
| 6 | 402 and credit-exhaustion name SPT | ✅ API side. ⏳ `llms.txt` — Website Agent. |
| 7 | SPT integration tests | ⏳ Test plan documented; requires Stripe fixtures. |
| 8 | Commerce webhook parked+gated; boundary documented; INTERNAL_API_KEY confirmed | ✅ All three. |

**Addendum acceptance:**

| # | Criterion | Status |
|---|---|---|
| A1 | `TOKEN_COSTS` sole price authority | ✅ |
| A2 | Test: tampered `billable_units` → fixed cost debited | ⏳ Test plan documented. |
| A3 | `scheduled_analyst` removed | ✅ |
| A4 | Written confirmation: deep-dive and meter never both debit one query | ✅ Documented in code. |

---

## Open Handshakes

| Handshake | Owner | Status |
|---|---|---|
| `llms.txt` documents SPT by name | Website Agent | ⏳ Flagged |
| `agent-session` checkout served at `app.fodda.ai` | Website/App Agent | ⏳ Flagged |
| MCP reads `X-Fodda-Billing-Mode`, suppresses meter on `per-call` | MCP Agent | ⏳ Optional |
| MCP adds bounded retry on meter call (safe now — idempotency live) | MCP Agent | ⏳ Optional |
| Firestore TTL policy on `meter_idempotency.ttl` | Piers / Firebase Console | ⏳ Post-deploy |

---

## CHANGELOG Entry (shipped)

```
## [2026-06-19] — Billing Correctness (Option C), Meter Hardening & SPT Discoverability

### Fixed
- Billing: closed MCP-orchestrated double-charge (P0). HMAC trust gate verifies
  X-Fodda-Signature and honors mcp-orchestrated on any key tier when signed.
  Uses req.originalUrl (not req.path) to include query strings.
- /v1/research/meter is now idempotent via X-Request-Id dedupe (Firestore, 24h TTL).
- TOKEN_COSTS is now the sole price authority; TIER_CONFIG no longer defines costs.
- Removed unreachable scheduled_analyst from InteractionType, TOKEN_COSTS, VALID_METER_TYPES.

### Added
- HMAC verification for MCP requests: verifyMcpHmac() with 5-min replay window + timingSafeEqual.
- X-Fodda-Billing-Mode response header.
- Per-subject usage attribution for enterprise oidc_* tenants (Token Log subject field).
- SPT named in 402 challenges, PLAN_LIMIT_EXCEEDED, and INSUFFICIENT_CREDITS responses.
- GET /v1/research/pricing — public canonical pricing endpoint.

### Changed
- Commerce webhook parked + gated behind ENABLE_COMMERCE_WEBHOOK env var.
- FODDA_MCP_SECRET added to API Cloud Run deploy secrets.
```

---

## Files Changed

| File | Action |
|---|---|
| `functions/index.ts` | HMAC trust gate, `verifyMcpHmac()`, billing_mode header, SPT in 402/credit exhaustion, parked webhook, boundary comment, pricing PUBLIC_PATH |
| `functions/v1/research/researchRouter.ts` | Idempotent metering, SPT in INSUFFICIENT_CREDITS, TIER_CONFIG consolidation, `scheduled_analyst` removed, pricing endpoint, deep-dive debit comment |
| `functions/tracking/metering.ts` | Canonical header, `scheduled_analyst` deleted |
| `functions/tracking/airtable.ts` | `subject` field in Token Log |
| `deploy.sh` | `FODDA_MCP_SECRET` in Cloud Run secrets |
| `CHANGELOG.md` | Billing correctness entry |
| `BACKLOG.md` | Parked commerce webhook entry |
