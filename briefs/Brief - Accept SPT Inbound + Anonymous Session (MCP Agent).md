# Brief: Accept SPT Inbound + Anonymous Session + Forward SPT to the Charge Path

**Date:** 2026-06-20
**From:** MCP Agent (Coordinator)
**To:** MCP Agent
**Repo:** ~/Documents/Fodda MCP
**Priority:** P1

---

## 1. Objective

Let an anonymous agent connect to the hosted MCP with only a Stripe Shared Payment Token (no account, no API key), run an orchestrated task (e.g. `brand_tracker`), and be charged ONCE for the task (`typical_calls × $0.50`, e.g. brand = $10), then be served.

The per-task settlement mechanic already exists end-to-end: an orchestrated tool runs an internal fan-out of `foddaRequest` calls billed $0 (`X-Fodda-Billing: mcp-orchestrated` + HMAC), then fires exactly ONE `chargeQuery → POST /v1/research/meter`. Four isolated identity/auth changes make it work for an SPT-paying anonymous agent: (1) detect the SPT inbound and run an anonymous session; (2) swap `FODDA_INTERNAL_API_KEY` into the fan-out (the absent user key); (3) forward the SPT on the single settlement call so the API charges a PaymentIntent; (4) quote the price up front and refuse cleanly if the SPT cap is too low. Plus a CORS fix.

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
- Single source of truth: `SPT_RATE_CENTS` exported from `metering.ts` — the meter handler, `resolveEndpointPrice`, and `GET /pricing` all import it. The MCP quotes from `GET /v1/research/pricing` `spt_prices_usd` / `getToolCostSummary()`.

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

## 3. What you build (MCP side)

**3a. Detect the SPT at connect — do NOT use `spt_` as an API key.**
`src/index.ts:531-540`. Today line 533 strips `Bearer ` and uses the remainder AS an api key. Add an SPT check BEFORE that:
```ts
const rawAuth = req.headers['authorization']?.toString();
const rawSpt  = (req.query.spt as string) || (req.headers['x-stripe-spt'] as string);
const spt = rawSpt || (/^Bearer\s+spt_/i.test(rawAuth || '') ? rawAuth!.replace(/^Bearer\s+/i, '') : '');
const isSpt = !!spt;
// when isSpt: apiKey = '' (do NOT fall through to line 533), userId = 'spt_agent'
```
`apiKey` extraction at `:531-534` must not capture an `spt_` value. `userId` resolves to the synthetic `spt_agent` (`:538-540`, instead of `'anonymous'`).

**3b. Store the SPT on the session + sweep it.**
`src/index.ts:83-88` (session maps) — add `const sessionSpts = new Map<string,string>()`. `:556-563` (`onsessioninitialized`) — `if (isSpt) sessionSpts.set(sid, spt)`. `:565-573` (`transport.onclose`) and the periodic cleanup sweep at `:104-114` — `sessionSpts.delete(sid)` alongside the others. Treat presence in `sessionSpts` as the anonymous-SPT flag. *(C1: these are process-local in-memory; an anonymous session has no account fallback — keep `max-instances=1` stopgap.)*

**3c. CORS — re-add `X-Stripe-SPT`.**
`src/index.ts:35`. It is currently **absent** from `Access-Control-Allow-Headers` (the MEMORY note claiming it's allowed is stale). Without it, browser-origin agents sending the SPT via header are blocked at preflight.

**3d. Thread `isSpt`/`spt` into `createServer`.**
`src/toolHandlers.ts:215-223` — extend the signature with `isSpt = false, spt = ''` (or `sptContext?: { spt: string }`). Pass from BOTH connect sites: `src/index.ts:553` (Streamable `/mcp`) and `src/index.ts:611-628` (legacy `/sse`). The `boundFoddaRequest` wrapper (`:550-553`) is the natural seam.

**3e. Anonymous fan-out auth — swap in the internal key.**
`src/index.ts:144-176` (`foddaRequest`). For an SPT session there is no user key, so the fan-out must authenticate as MCP-trusted via the existing precedent: `X-API-Key = process.env.FODDA_INTERNAL_API_KEY` (the `sk_internal_` service key, used at `src/index.ts:235`, `src/catalogCache.ts:102`, defined in `.env.example`). When building the SPT session's bound `foddaRequest`, substitute `apiKey := FODDA_INTERNAL_API_KEY` for the fan-out (the caller-supplied apiKey is `''` for SPT). Keep `X-Fodda-Billing: mcp-orchestrated` + HMAC (`:162-175`) exactly as today — that is what zeroes per-call debits. `userId` stays `spt_agent`. **Do NOT send the SPT on fan-out calls.**

**3f. Quote before spend + cap handling.**
Before `executeBrandTracker` / the fan-out (a shared helper, or per orchestrated tool): `price = getQueryPrice(queryTypeCode)` (`src/pricingCache.ts:343-346`); `dollarCost = price × 0.5`. `getToolCostSummary()` (`:396-399`) already feeds the system-prompt COST AWARENESS block (`src/systemPrompt.ts:565-577`) — reuse it. For SPT sessions, surface the quote in the tool's text response so the agent can confirm. If the SPT `max_amount` is below `dollarCost`, refuse with a structured `{ error: 'SPT_INSUFFICIENT', required_usd: 10 }` and run NO fan-out and NO settlement. **Cap IS available:** call `POST /v1/research/spt-validate` (§2.10) ONCE at connect → store `max_amount_cents` + `currency` on the session → check `price(type)_cents ≤ max_amount_cents` before each task. This refuses over-cap tasks before any compute runs, closing the unpaid-compute hole (no longer dependent on a settle-time 402 after the work ran).

**3g. Settlement routes SPT, not credits.**
`src/pricingCache.ts:424-432` (`ChargeQueryParams`) — add optional `spt?: string`. `:452-500` (`chargeQuery`) — when `spt` is present, send it as `Authorization: Bearer <spt>` on the `/v1/research/meter` call (NOT as `X-API-Key`); keep the stable `meter_<type>_<uuid>` X-Request-Id (`:473`) and the 3-retry loop. Pass `spt` through from each call site: `src/toolHandlers.ts:1756` (`brand_tracker`) and the `search_graph` sites at `~951/973/1000`. The `foddaRequest` signature injected at `:431` will need to carry the SPT through (or `chargeQuery` calls a distinct SPT-aware path). Map the §2.8 SPT failure codes into the tool's `isError` response with a human-readable price + reason.

**3h. Ordering note (brand_tracker).**
`src/toolHandlers.ts:1753-1757` currently runs `executeBrandTracker` THEN fires `chargeQuery(...).catch(...)` fire-and-forget. For credit accounts a lost meter just under-bills. For an SPT session there is no account to claw back from, so a settle that fails after the $10 task ran is unrecoverable. For SPT sessions, **await the settlement and gate delivery on its success**: if `chargeQuery` returns a non-charged/`SPT_*` error, return `isError` and do NOT return the widget. (The §2.4 contract: a non-2xx settle = do not deliver.) Credit sessions keep the existing fire-and-forget behavior.

---

## 4. Failure modes & required behavior

- **`spt_` treated as API key (current bug):** §3a must intercept before `:533`. An `spt_` value must NEVER become `apiKey`.
- **SPT leaking onto fan-out calls:** if the SPT rides every internal `foddaRequest`, the API could charge per raw call → many PaymentIntents. The SPT attaches ONLY at the single `chargeQuery` settlement (§3e, §3g).
- **Internal-key fan-out not trusted:** if the API rejects `FODDA_INTERNAL_API_KEY` for the `mcp-orchestrated` gate, the double-charge guard at `src/index.ts:211-215` will log `DOUBLE-CHARGE RISK` (effective mode `per-call`). Confirm the API accepts the internal key for the synthetic `spt_agent` before shipping (§6).
- **Settle retry double-charge:** the stable `X-Request-Id` (`:473`) + API-side Firestore + Stripe idempotency must cover the SPT branch. Never generate a new request id on retry.
- **CORS preflight block:** header-based SPT fails preflight until `X-Stripe-SPT` is re-added (§3c).
- **`max_amount` unknown at quote time:** prefer a pre-flight; if skipped and funds are insufficient, the fan-out runs (compute spent) and settlement 402s → unpaid work. The tool MUST surface the failure and (per §3h) not deliver.
- **Session loss mid-task (C1):** process-local maps (`:83-88`, swept `:104-114`); an SPT session has no account fallback. Stopgap `max-instances=1`; bind the SPT-charge idempotency to a deterministic key so a reconnect+rerun can't double-charge.
- **`spt_agent` persona init:** `createServer` init calls `foddaRequest('GET','/v1/graphs',...)`; the `spt_agent` profile is empty → no persona framing. Acceptable, degrades gracefully via the existing 5s-timeout race.

---

## 5. Acceptance criteria

1. **Sandbox `test_SPT` brand audit → exactly one $10 charge.** Connect to the MCP with `Authorization: Bearer spt_<sandbox>` (no api key), call `brand_tracker`. The fan-out runs under `FODDA_INTERNAL_API_KEY` + HMAC (every sub-call returns `billing_mode != 'per-call'`, no DOUBLE-CHARGE log), then ONE `POST /v1/research/meter` carrying the SPT settles for $10. Stripe sandbox shows exactly ONE PaymentIntent.
2. **SPT never used as API key:** an `spt_xxx` inbound produces `userId='spt_agent'`, `apiKey=''`; no fan-out or settle call sends `X-API-Key: spt_...`.
3. **SPT only at settlement:** no internal fan-out call carries the SPT (assert on outbound headers / sandbox: one PI, not N).
4. **Quote surfaced:** `brand_tracker` text response states the $10 quote before/with the result; an SPT with `max_amount < $10` is refused with `SPT_INSUFFICIENT` and runs NO fan-out (when cap is known) or surfaces the API 402 cleanly.
5. **Idempotent retry:** forcing a settle retry (same `X-Request-Id`) yields `idempotent_replay:true` and NO second PaymentIntent.
6. **Delivery gating:** a sandbox SPT that fails at settle (revoked/insufficient) makes `brand_tracker` return `isError` and NOT return the widget.
7. **CORS:** preflight `OPTIONS` from a browser origin with `Access-Control-Request-Headers: X-Stripe-SPT` succeeds.
8. **Credit path unchanged:** an API-key session still bills via credits, fire-and-forget, byte-for-byte as today.

---

## 6. Dependencies & sequencing

**Foundation is done (verified live this session):** Option C HMAC trust gate works; direct-REST SPT charging works (`stripe@22.3.0-beta.1`); unified pricing is live (`spt_rate_usd=0.5`, `spt_prices_usd`, endpoint-aware 402); per-task settlement already fires one meter call with stable `X-Request-Id` + retry (`pricingCache.ts:473`).

- **Blocks on the API brief** for the settlement transport: the API must (a) accept `Authorization: Bearer spt_xxx` on `POST /v1/research/meter` and branch to the `spt-prepaid` PaymentIntent path (skipping `decrementCredits`), and (b) accept `FODDA_INTERNAL_API_KEY` for the `mcp-orchestrated` fan-out under the synthetic `spt_agent`. Do not ship 3e/3g until both are confirmed.
- **Independent now:** 3a–3d (inbound detect, session map, CORS, `createServer` threading) and the 3f quote helper can land and unit-test ahead of the API.
- **Open questions for the API agent:**
  - Does `POST /v1/research/meter` accept the SPT via `Authorization: Bearer` and branch on `billingMode==='spt-prepaid'`, or is settlement a separate endpoint? *(Confirmed target: extend `/meter` — keeps ONE idempotency table and ONE MCP call site.)*
  - **(confirm)** Does the `mcp-orchestrated` gate trust `FODDA_INTERNAL_API_KEY` + `X-User-Id: spt_agent` at $0 AND resolve **default graph access** for the account-less `spt_agent` (no "account not found")?
  - **RESOLVED — how the MCP learns `max_amount`:** connect-time `POST /v1/research/spt-validate` (§2.10) returns `max_amount_cents` + `currency`; the MCP checks `price(type)_cents ≤ max_amount_cents` per task.
  - **RESOLVED — validate at connect vs settlement:** validate at CONNECT (one non-charging Stripe round-trip on `initialize`, §2.10) + per-task cap check; the charge stays at settlement.
  - Should `SESSION_MAX_AGE_MS` (`src/index.ts:95`, 1h) be shorter for SPT sessions, given the SPT may expire and there's no account to re-auth against?
- **BACKBURNER C1:** anonymous SPT sessions have no account fallback on Cloud Run instance loss — strictly worse than keyed sessions. `max-instances=1` stopgap until session state is externalized; bind SPT-charge idempotency to a deterministic key so reconnect can't double-charge.

---

## 7. CHANGELOG entry

```
### Added
- Anonymous Stripe Shared Payment Token (SPT) sessions: the MCP now accepts an SPT
  inbound via Authorization: Bearer spt_xxx or X-Stripe-SPT (never as an API key),
  runs an anonymous session (userId spt_agent), quotes the per-task price up front
  (getToolCostSummary), and settles ONCE by forwarding the SPT to
  POST /v1/research/meter — the API charges a single PaymentIntent instead of
  debiting credits. Orchestrated fan-out for SPT sessions authenticates with
  FODDA_INTERNAL_API_KEY + HMAC (mcp-orchestrated, billed $0); the SPT is attached
  only at settlement. brand_tracker now awaits settlement for SPT sessions and gates
  delivery on a successful charge.

### Changed
- chargeQuery / ChargeQueryParams accept an optional spt and route the meter call
  through the SPT charge path when present.

### Fixed
- CORS: re-added X-Stripe-SPT to Access-Control-Allow-Headers (was absent; blocked
  browser-origin SPT preflight).
```
