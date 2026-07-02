# Brief: Charge an SPT Once at Per-Task Settlement (`spt-prepaid` meter path)

**Date:** 2026-06-20
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda
**Priority:** P1

---

## 1. Objective

Let an anonymous agent (no account, no API key — just a Stripe Shared Payment Token) pay for ONE orchestrated MCP task with ONE Stripe PaymentIntent, charged at the existing unified rate (`TOKEN_COSTS[type] × $0.50`, e.g. `brand_intelligence` = 20 → $10.00).

The per-task settlement mechanic already exists: the MCP fires exactly one `POST /v1/research/meter` per task (idempotent on `X-Request-Id`, server-recomputed cost). Your job is to add a **parallel settlement payer**: when that single meter call carries an SPT instead of an API key, charge a PaymentIntent against the SPT instead of `decrementCredits`. The credit-account path stays byte-for-byte unchanged.

Do **not** add a new charge endpoint and do **not** let SPT settlement flow through the per-call `authMiddleware` SPT block (it prices by `req.path`, which maps `/meter` to `search` = $0.50 and ignores `body.type` — every task would mis-price to $0.50). The price MUST come from `body.type` via `TOKEN_COSTS`, which only the meter handler knows.

---

## 2. The Contract (MCP↔API handshake)

> **This section is IDENTICAL in the API brief and the MCP brief. Do not edit one side without the other.**

### 2.1 Inbound (agent → MCP)
The agent presents the SPT to the MCP as `Authorization: Bearer spt_xxx` OR `X-Stripe-SPT: spt_xxx`. The MCP never treats `spt_` as an API key. The session runs anonymous with synthetic `userId = spt_agent`, `apiKey = ''`.

### 2.2 Fan-out (MCP → API, internal sub-calls, billed $0)
Unchanged Option-C path, but with the internal service key swapped in for the absent user key:
- `X-API-Key: <FODDA_INTERNAL_API_KEY>` (the `sk_internal_` service key)
- `X-User-Id: spt_agent`
- `X-Fodda-Billing: mcp-orchestrated`
- `X-Fodda-Timestamp: <ms>` + `X-Fodda-Signature: <HMAC sha256 over timestamp+'.'+JSON.stringify(body) for POST, timestamp+'.'+path for GET; secret FODDA_MCP_SECRET>`
- **NO SPT on fan-out calls.** The SPT is spent ONCE, at settlement only.

The API must accept the internal service key under the `mcp-orchestrated` trust gate and bill these calls $0 (same gate as today).

### 2.3 Settlement (MCP → API, ONE charge per task)
`POST https://api.fodda.ai/v1/research/meter`
Headers:
- `Authorization: Bearer spt_xxx` (or `X-Stripe-SPT: spt_xxx`) — **the SPT is the payer; there is no X-API-Key on this call**
- `X-Request-Id: meter_<type>_<uuid>` — **REQUIRED for SPT**; stable across all retries; drives both Firestore idempotency AND the Stripe idempotency key
- `X-Fodda-Billing: mcp-orchestrated` + `X-Fodda-Timestamp` + `X-Fodda-Signature` (HMAC as above)
- `Content-Type: application/json`

Body:
```json
{ "type": "brand_intelligence", "billable_units": 20, "query": "...", "graphs_searched": ["..."] }
```
`billable_units` is **advisory only** — the API recomputes the charge from `TOKEN_COSTS[type]` and ignores the client number for the amount (logs a mismatch warning, same as today).

### 2.4 Ordering (the lifecycle)
`quote (free, MCP-local)` → `coverage check (MCP reads SPT cap or relies on settle-time 402)` → `run task` → `settle ONCE (idempotent)` → `serve result`.
Settlement happens at the single meter call. A non-2xx settle means **do not deliver the task result**.

### 2.5 Success response (200)
```json
{
  "ok": true,
  "requestId": "...",
  "meter_id": "mtr_meter_brand_intelligence_<uuid>",
  "type": "brand_intelligence",
  "billable_units": 20,
  "billing_mode": "spt-prepaid",
  "api_calls_remaining": null,
  "payment": {
    "provider": "stripe",
    "payment_intent_id": "pi_...",
    "amount_charged_usd": 10.00,
    "amount_charged_cents": 1000,
    "currency": "usd",
    "status": "succeeded"
  }
}
```
Header: `X-Fodda-Payment: spt:<pi_id>:$<amount_usd>`. Header: `X-Fodda-Billing-Mode: spt-prepaid`.

### 2.6 Idempotent replay (200)
Same body as the original success PLUS `idempotent_replay: true` and the **ORIGINAL** `payment_intent_id`. The same `X-Request-Id` MUST always yield the same PaymentIntent — never a second charge.

### 2.7 Zero-cost types
`visual` and `admin` = 0 → API returns `{ ok: true, payment: null }`, makes no Stripe call. The MCP must not expect a `payment_intent_id`.

### 2.8 Error contract (identical codes/shapes to the existing per-call SPT path)
- `SPT_REVOKED` → 401
- `SPT_EXPIRED` → 401
- `SPT_INVALID` → 401 (scrubbed message)
- `SPT_INSUFFICIENT_FUNDS` → 402 (+ `required_amount` in cents, + `currency`)
- `SPT_REQUIRES_ACTION` → 402 (+ `next_action` for 3DS)
- `SPT_PAYMENT_FAILED` → 402 (+ `payment_status`)
- `INVALID_PARAMS` → 400 (bad/missing `type`, OR missing `X-Request-Id` on an SPT settle)

### 2.9 Pricing & currency authority
- Amount = `TOKEN_COSTS[type] × $0.50`, server-computed, never trusted from the client. `brand_intelligence`=20→$10, `deep_research_heavy`=30→$15, `standalone_supplemental`/`evidence`/`statistics`=5→$2.50, `topic_research`/`brainstorm`/`url_as_prompt`=15→$7.50, `visual`/`admin`=0.
- Charge currency follows the SPT's `usage_limits.currency` (defaults `usd`). `amount_charged_cents` is authoritative for non-usd tokens.
- Single source of truth: `SPT_RATE_CENTS` exported from `metering.ts` — the meter handler, `resolveEndpointPrice`, and `GET /pricing` all import it.

### 2.10 Connect-time SPT validation (pre-run coverage) — DEPLOYED CONTRACT (fodda-api-new-00393, verified live)
Settlement (§2.3) is post-run, so an under-funded SPT would otherwise only surface a 402 *after* the task ran. The MCP validates the SPT ONCE at connect (non-charging) and refuses any task it can't cover *before* running.

`GET https://api.fodda.ai/v1/spt/validate` — **GET**, path is **`/v1/spt/validate`** (NOT `/v1/research/spt-validate` — that path 402s and trips the unmapped-route alert).
- SPT via `Authorization: Bearer spt_xxx` OR `X-Stripe-SPT`. No `X-API-Key`. HMAC is **not** required by the deployed endpoint (read-only, never charges).
- No SPT → `400 { ok:false, error:'MISSING_SPT' }`
- Bad/expired/revoked → `401 { ok:false, valid:false, error:'SPT_INVALID'|'SPT_EXPIRED'|'SPT_REVOKED' }`
- Valid → `200 { valid:true, max_amount_cents, spt_prices_usd, ... }` — `spt_prices_usd` is the full per-type price map, so ONE validate call yields BOTH the cap and the prices (no separate `/v1/research/pricing` needed at connect).

The MCP stores `max_amount_cents` on the session; before each task it checks `spt_prices_usd[type]_cents ≤ max_amount_cents` and refuses with `SPT_INSUFFICIENT` (no fan-out, no settlement) if not. Validate is advisory — §2.3 settlement is the authoritative charge; a settle-time 402 is the backstop. Cumulative multi-task spend in one session is out of scope for v1 (check each task against `max_amount_cents`).
**CONFIRM (API):** (1) does the 200 include `currency`? Needed for a correct cap check on non-USD SPTs (`max_amount_cents` is in the SPT's currency; prices are USD). (2) Scrub the raw Stripe message from `SPT_INVALID` (it currently echoes "No such shared_payment_token: ...").

---

## 3. What you build (API side)

**3a. Middleware guard — do NOT charge `/meter` in the per-call SPT block.**
`functions/index.ts:432-572` (authMiddleware step-4 SPT block). Add a guard at the top of the block: if `req.path === '/v1/research/meter'`, **validate-only** (run `stripe.sharedPayment.grantedTokens.retrieve` to confirm exists/not-revoked/not-expired), set the synthetic account + `foddaMeta.billingMode = 'spt-prepaid'` (reuse `index.ts:516-554` minus the `paymentIntents.create`), then `next()`. The actual charge happens in the handler where `body.type` is known. `express.json` runs before authMiddleware (`index.ts:204` vs `996`), so `req.body.type` is available here if you ever need it — but the charge belongs in the handler.

> Why: `resolveEndpointPrice('/v1/research/meter')` is unmapped → falls through `resolveInteractionType` (`index.ts:64-93`) to `search` = $0.50 and fires a Slack "unmapped route" alert. The middleware path would charge $0.50 for a $10 task.

**3b. Unify the rate constant.**
Export `SPT_RATE_CENTS` from `functions/tracking/metering.ts`; replace the duplicates at `index.ts:56` (=50) and `researchRouter.ts:778` (=0.50) with imports. Do this in-scope to prevent drift.

**3c. Meter handler — add the `spt-prepaid` branch.**
`functions/v1/research/researchRouter.ts:634` (handler), `:662-671` (Firestore idempotency), `:673-691` (cost + decrementCredits), `:740-754` (response).

Order inside the handler:
1. Keep `VALID_METER_TYPES` allowlist check (`:652`) and required-params check.
2. **Require `X-Request-Id`** when `billingMode === 'spt-prepaid'` — reject with `INVALID_PARAMS` (400) if absent. Do NOT fall back to `foddaMeta.requestId` (that is per-HTTP-request and would break dedupe → double charge).
3. **Layer-1 idempotency:** `meter_idempotency.doc(X-Request-Id)` — if it exists, return the stored response (including `payment_intent_id`) with `idempotent_replay: true` BEFORE any Stripe call (`:662-671`).
4. Compute `amountUSD = calculateInteractionBillable(type) × SPT_RATE_CENTS/100` (`metering.ts:74`); `amountCents = Math.round(amountUSD × 100)`.
5. **Zero-cost short-circuit:** if `amountCents === 0` (visual/admin), return `{ ok:true, payment:null }`, no Stripe call.
6. Branch on `foddaMeta.billingMode`:
   - `'spt-prepaid'` → SPT charge (below). **Skip `decrementCredits` entirely** — branch on `billingMode === 'spt-prepaid'`, not on `accountRecordId`, because the synthetic account has a `credits:1` placeholder and the existing skip only covers `internal_service` (`:680`).
   - else → existing `decrementCredits` path unchanged (`:680-691`).
7. SPT validation (mirror `index.ts:438-470` exactly): `grantedToken.deactivated_at` → `SPT_REVOKED` (401); `usage_limits.expires_at < now` → `SPT_EXPIRED` (401); `usage_limits.max_amount && amountCents > max_amount` → `SPT_INSUFFICIENT_FUNDS` (402, + `required_amount=amountCents`, + `currency`).
8. **Charge** (reuse the exact `payment_method_data` cast + eslint-disable comment from `index.ts:476-491`):
   ```ts
   stripe.paymentIntents.create({
     amount: amountCents,
     currency: limits?.currency || 'usd',
     payment_method_data: { shared_payment_granted_token: sptToken } as any,
     confirm: true,
     metadata: { source:'spt_meter', interaction_type:type, fodda_request_id:foddaMeta.requestId, mcp_orchestrated:'true' }
   }, { idempotencyKey: `meter_${xRequestId}` });
   ```
   Map: `requires_action` → `SPT_REQUIRES_ACTION` (402, return `next_action`); `status !== 'succeeded'` → `SPT_PAYMENT_FAILED` (402, return `payment_status`); thrown Stripe error → `SPT_INVALID` (401, scrub the raw message like `index.ts:560-571`).
9. **Layer-2 idempotency:** the Stripe `idempotencyKey = meter_${X-Request-Id}` guarantees that a crash between `paymentIntents.create` (succeeded) and the Firestore write does NOT re-charge on retry — Stripe returns the same PI.
10. **Order fix:** write the `meter_idempotency` doc AFTER the PaymentIntent succeeds (today it's written after `decrementCredits` at `:693-703`). Persist `payment_intent_id` + `amount_charged_usd` + `amount_charged_cents` + `currency` into the doc so replays can echo them.
11. Build the response (§2.5) + set `X-Fodda-Payment` (`index.ts:557`) + `X-Fodda-Billing-Mode: spt-prepaid` (`index.ts:735`). Call `logSptPayment` (`index.ts:548`). Omit the usage block or set `api_calls_remaining: null`.

**3d. Confirm `GET /v1/research/pricing` needs no second surface.** `spt_prices_usd` is already derived from `TOKEN_COSTS × 0.50` (`:777-789`). After 3b it reads the shared constant. The agent quotes from here — confirm no other pricing surface exists.

**3e. Add the non-charging `spt-validate` path (§2.10 — lets the MCP refuse over-cap tasks before any compute).**
`POST /v1/research/spt-validate`: in `authMiddleware`, recognize this path like `/meter` — **validate-only** (`grantedTokens.retrieve`, set the synthetic account + `billingMode='spt-prepaid'`, store the token), then a tiny handler returns `{ valid: true, max_amount_cents: usage_limits.max_amount ?? null, currency: usage_limits.currency ?? 'usd', expires_at, status }` from the retrieved token — **no `paymentIntents.create`**. Bad token → the §2.8 SPT_* error (401). This is the connect-time check the MCP relies on; without it the only signal is a settle-time 402 *after* the work ran.

---

## 4. Failure modes & required behavior

- **Mis-pricing via the wrong path:** an SPT `/meter` request must NOT enter the per-call SPT block charge (`index.ts:432`). Middleware skips the charge for `/meter` and defers to the handler. *(3a)*
- **Double-charge on retry:** both layers required — Firestore check first AND Stripe `idempotencyKey = meter_${X-Request-Id}`. A crash between charge and the Firestore write must return the SAME PI on retry, never a second charge.
- **Missing X-Request-Id:** reject with `INVALID_PARAMS` (400) for SPT; never silently fall back to `foddaMeta.requestId` (newly generated per HTTP request → two retries = two charges).
- **$0 PaymentIntent:** Stripe rejects $0. Short-circuit visual/admin to `payment:null` before any Stripe call.
- **Skip `decrementCredits` on the right signal:** branch on `billingMode === 'spt-prepaid'`, not on `accountRecordId` (synthetic account has `credits:1`; debiting is meaningless).
- **Charge fails after middleware validated:** middleware retrieve() may pass but the handler's `paymentIntents.create` can still fail (funds, revoked between calls). The handler MUST return the `SPT_*` 402/401 itself — never 200 a task whose settlement failed. For anonymous SPT the settlement IS the gate; a failed charge means the MCP must not deliver the result.
- **Stripe SDK cast:** `payment_method_data` requires `as any` (Stripe rejects a `type` field for SPT). Reuse the exact pattern + comment from `index.ts:476-491` or the build/charge fails.
- **Rate limiter:** `authenticatedKeyLimiter` skips `accountRecordId` starting with `spt_` (`index.ts:333`); the synthetic account/billingMode are set in middleware before the limiter runs, so the skip still applies.

---

## 5. Acceptance criteria

1. **Sandbox `test_SPT` brand audit → exactly one $10 charge.** A `POST /v1/research/meter` with `Authorization: Bearer spt_<sandbox>`, `X-Request-Id: meter_brand_intelligence_<uuid>`, body `{type:'brand_intelligence', billable_units:20}` creates exactly ONE Stripe PaymentIntent for `amount=1000, currency=usd`, returns `payment.payment_intent_id` + `status:'succeeded'` + `X-Fodda-Payment: spt:<pi>:$10.00`. **No `decrementCredits` runs.**
2. **Idempotent replay:** re-sending the SAME `X-Request-Id` returns `idempotent_replay:true` with the ORIGINAL `payment_intent_id` and creates NO second PaymentIntent (verify in the Stripe sandbox dashboard: one PI for the request id).
3. **Crash-between simulation:** with the Firestore doc absent but the PI already created (same idempotency key), a retry returns the same PI (Stripe-level dedupe), then writes the doc.
4. **Pricing matrix:** `deep_research_heavy`→$15, `standalone_supplemental`→$2.50, `topic_research`→$7.50 charge the right cents server-side; `billable_units` tampering is logged and ignored.
5. **Zero-cost:** `type:'visual'` returns `{ok:true, payment:null}`, no Stripe call.
6. **Error codes:** revoked/expired/insufficient/requires_action/failed sandbox tokens return the exact §2.8 codes/HTTP statuses, identical to the per-call path.
7. **Missing `X-Request-Id`** on an SPT settle → 400 `INVALID_PARAMS`.
8. **No mis-pricing:** an SPT `/meter` request never produces a $0.50 charge and never fires the unmapped-route Slack alert.
9. **Credit path unchanged:** existing API-key `/meter` regression suite passes byte-for-byte.

---

## 6. Dependencies & sequencing

**Foundation is done (verified live this session):** Option C HMAC trust gate works; direct-REST SPT charging works (`stripe@22.3.0-beta.1`, `grantedTokens.retrieve` + `paymentIntents.create` confirmed); unified pricing is live (`spt_rate_usd=0.5`, `spt_prices_usd`, endpoint-aware 402).

- **Independent of the MCP side** for build — you can implement and unit/sandbox-test 3a–3d against raw `curl` before the MCP forwards anything. Ship behind the existing `billingMode` branch so it's inert until an SPT arrives.
- **Joint integration** requires the MCP forwarding `Authorization: Bearer spt_xxx` (not `X-API-Key`) on the settle call and `FODDA_INTERNAL_API_KEY` on fan-out — coordinate the end-to-end `test_SPT` run after both sides land.
- **MUST CONFIRM (cross-cutting, not MCP-only):** the `mcp-orchestrated` trust gate must accept `FODDA_INTERNAL_API_KEY` + `X-User-Id: spt_agent` at **$0**, AND the downstream per-call entitlement lookup must resolve **default graph access** for the account-less `spt_agent` (not an "account not found" error). If entitlement resolution needs a real account row, the SPT fan-out breaks — handle the synthetic `spt_agent` as default/public access. Verify before the end-to-end run.
- **Charge timing — DECIDED:** charge stays **post-run at settlement** (no pre-auth / `capture_method:'manual'` hold). The unpaid-compute / abuse hole is closed instead by the **connect-time validate (§2.10 / §3e)** the MCP calls before running. So the only new surface this adds is the non-charging validate path — no capture lifecycle.
- **BACKBURNER C1:** anonymous SPT sessions have no account fallback on Cloud Run instance loss. The Stripe idempotency key bounds double-charge risk on reconnect+retry, but persistent session state is still deferred (`max-instances=1` stopgap on the MCP side). No API change required for C1 in this build.

---

## 7. CHANGELOG entry

```
### Added
- SPT per-task settlement: POST /v1/research/meter now accepts a Stripe Shared
  Payment Token (Authorization: Bearer spt_xxx / X-Stripe-SPT) and charges ONE
  PaymentIntent (TOKEN_COSTS[type] × $0.50) for spt-prepaid sessions instead of
  decrementing credits. Two-layer idempotency (Firestore meter_idempotency +
  Stripe idempotencyKey=meter_<X-Request-Id>) guarantees no double-charge on retry.
  Zero-cost types return payment:null. authMiddleware now skips charging SPT /meter
  requests (defers to the handler so the price comes from body.type, not the path).

### Changed
- SPT_RATE_CENTS exported from tracking/metering.ts; index.ts and researchRouter.ts
  now import the single constant (was duplicated 50 / 0.50).
- meter_idempotency record now written AFTER PaymentIntent success for SPT and
  persists payment_intent_id + amount_charged for replay echo.
```
