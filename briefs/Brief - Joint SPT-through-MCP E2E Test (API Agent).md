# Brief: Joint SPT-through-MCP End-to-End Test

**Date:** 2026-06-20
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda (you have the Stripe sandbox + `spt_test_*` capability)
**Priority:** P1
**Status:** MCP half is LIVE — needs the happy-path payment test you can run with a sandbox SPT.

---

## 1. Why you

You already built and live-tested the API side (`spt-prepaid` meter path, `GET /v1/spt/validate`, the endpoint-aware 402) and you hold the Stripe sandbox that can mint a `spt_test_*` token. The MCP side is now deployed. This is the **joint** test that neither side can run alone: an SPT travelling through the MCP, fanning out to the API, settling once.

## 2. What is now live (MCP)

- **Service:** `https://fodda-mcp-7mopqjzhwq-uk.a.run.app`  (Cloud Run `fodda-mcp`, us-east4, revision `fodda-mcp-00304-ztb`, server v1.30.0)
- **Inbound:** an SPT may arrive via `Authorization: Bearer spt_...`, `X-Stripe-SPT: spt_...`, or `?spt=spt_...`. Detected at connect → anonymous session (`userId='spt_agent'`, no API key).
- **Connect-time validation:** the MCP calls `GET /v1/spt/validate` (Bearer SPT) during `initialize`. Invalid/expired/revoked → the session is rejected with JSON-RPC error + **HTTP 402** before any tool runs. (I already verified this live: a junk token returns `{"error":{"code":-32002,"message":"SPT validation failed: SPT_INVALID"}}`, HTTP 402.)
- **Per-call fan-out:** inside an SPT session the MCP makes its internal API calls with `FODDA_INTERNAL_API_KEY` + `X-User-Id: spt_agent` + `X-Fodda-Billing: mcp-orchestrated` (so per-call debits are zeroed — confirmed safe on your side).
- **Settlement:** exactly one `POST /v1/research/meter` per task, carrying `Authorization: Bearer <spt>` (no `X-API-Key`), `X-Fodda-Billing: mcp-orchestrated`, and a stable `X-Request-Id`. This is the single charge point.
- **Gating (the important bit):** for SPT sessions the MCP now **awaits** that settlement and **withholds the result if the charge fails**. Pre-run, it also refuses with `SPT_INSUFFICIENT` if `spt.prices[type]` exceeds the token's `max_amount_cents`. Gated tools: `brand_tracker` ($10), `deep_research` ($10/$15, gated inside its async job), `get_earnings_intelligence` / `get_earnings_divergence` ($2.50). Cheap $0.50 tools still charge but fire-and-forget (negligible).

## 3. The test (mint a `spt_test_*` with a cap ≥ $15)

Use the MCP StreamableHTTP endpoint `POST /mcp` with headers `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `Authorization: Bearer <spt_test>`. Do `initialize` → capture `Mcp-Session-Id` → `tools/call`.

### T1 — Happy path (primary)
`brand_tracker` with `{ "brand_name": "Nike" }`.
**Assert:**
1. Exactly **ONE** PaymentIntent created (Stripe dashboard / sandbox), amount **$10.00 (1000 cents)**.
2. The `brand_tracker` result (widget HTML) **is** returned to the client.
3. **No** account / API key created for the agent.
4. `meter_idempotency` Firestore doc written with `payment_intent_id`.

### T2 — Idempotent replay
Re-issue the same task with the **same `X-Request-Id`** (or re-call within the dedup window). **Assert:** no second PaymentIntent; `idempotent_replay: true`; same `payment_intent_id`.

### T3 — Async gated tool
`deep_research_topic` (light, $10). Poll `check_research_status`. **Assert:** report only delivered after the single $10 charge succeeds; on a forced charge failure the job ends `FAILED` ("report withheld"), no report leaked.

### T4 — Under-cap refusal
Mint an SPT with `max_amount_cents` **below** $10 (e.g. 500). Call `brand_tracker`. **Assert:** `SPT_INSUFFICIENT` returned **before** any compute/fan-out; **no** PaymentIntent.

### T5 — Revoked mid-session
Revoke the SPT after `initialize` but before the task settles (or use a token that 402s at settlement). **Assert:** `SPT_SETTLEMENT_FAILED`, result withheld, no partial delivery.

### T6 — Regression
One normal API-key `brand_tracker` (credit account). **Assert:** unchanged — credit debited, no PaymentIntent, fire-and-forget settlement.

## 4. Contract reference (so assertions match exactly)

- Settlement call: `POST /v1/research/meter`, `Authorization: Bearer <spt>`, `X-Fodda-Billing: mcp-orchestrated`, `X-Request-Id: <stable>`, body `{ type: 'brand_intelligence', ... }`. Cost recomputed server-side as `TOKEN_COSTS[type] × $0.50`.
- Validate (connect): `GET /v1/spt/validate`, `Authorization: Bearer <spt>` → 200 `{ valid, max_amount_cents, prices, currency? }`. (Open follow-up on your side: include `currency` for non-USD cap correctness; scrub the raw Stripe message from `SPT_INVALID`.)

## 5. Report back

Per-case PASS/FAIL + Stripe PaymentIntent IDs + the meter idempotency doc. If T1 mis-charges (≠ $10) or T4/T5 leak a result, that's a blocker — flag it and I'll fix the MCP gating. If all green, SPT-through-MCP is production-ready end to end.
