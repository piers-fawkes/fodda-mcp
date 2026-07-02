# Brief: Return 402 (not 401) on Unauthenticated Billable Requests — Close the SPT Zero-Onboarding Loop

**Date:** 2026-06-19
**From:** MCP Agent (Coordinator), on Piers's direction
**To:** API Agent
**Priority:** P1 — High. The published agent contract advertises zero-onboarding 402 discovery; the live API 401s instead, so cold MPP/agent clients can't discover how to pay.

---

## Decision (Piers)

**SPT requires NO identity.** A cold agent — no account, no API key — must be able to (1) discover the price by hitting an endpoint and (2) pay per-request with an SPT. The current "401 first, 402 only once we know who you are" gating is **not** what we want.

## The gap (verified live, 2026-06-19)

- `GET /v1/research/pricing` → **200** ✅ (Option C revision is deployed and serving `api.fodda.ai`).
- Unauthenticated `GET /v1/graphs` → **401** ❌ (`UNAUTHORIZED`, no price, no `WWW-Authenticate`).
- `Authorization: Bearer spt_invalidtest` → **401** ❌.

But `llms.txt` and the A2A agent card both promise: *"hit any endpoint without credentials → HTTP 402 with pricing → pay via `Bearer spt_xxx`; zero-onboarding; agents discover pricing automatically via the 402."* The 402 challenge body was enhanced (Option C §2.5) but the auth middleware **falls through to a 401 catch-all** for credential-less requests, so the 402 path is never reached.

**SPT *payment* already works without identity** (an agent sending a valid `Bearer spt_xxx` is served, synthetic `spt_agent` account, no key). Only **discovery** is missing.

## What to change

In the auth middleware (`functions/index.ts`, the `UNAUTHORIZED` fallback ~`:500`), for **billable** endpoints:

- **No credentials present** → return **HTTP 402** with the existing pricing/SPT challenge payload (`payment_methods` / `payment_methods_detail` / `spt_info`) **and** a `WWW-Authenticate: stripe-spt` header. This is the MPP/x402 pattern and matches the docs.
- **Invalid/expired credentials** (bad API key, bad/expired SPT, bad JWT) → keep returning **401** (genuinely unauthorized) — or the specific `SPT_*` codes for SPT failures.
- **Valid identity but out of credits/payment** → unchanged (existing `PLAN_LIMIT_EXCEEDED` / credit-exhaustion path with SPT info).
- **Public paths** (`/v1/research/pricing`, and please also **make `/health` public** — it currently 401s) → unchanged 200.

Semantics: for a pay-per-use API, "no credentials on a billable endpoint" is **402 Payment Required**, not 401. That's the whole point — the agent isn't failing to authenticate, it just needs to pay.

Optional: if you're worried about 402-ing every stray unauthenticated hit (scanners, browsers), gate the 402 behind an MPP signal (e.g. `Accept: application/vnd.mpp+json`) and 401 otherwise — **but** the current docs imply unconditional, so if you gate it, update `llms.txt` + the agent card to match.

## Acceptance criteria (re-probe after deploy)

- [ ] `curl -i https://api.fodda.ai/v1/graphs` (no auth) → **402**, body includes the price + `spt_info` (how to pay with `Bearer spt_xxx`), and a `WWW-Authenticate` header.
- [ ] `curl -i -H "Authorization: Bearer spt_<valid>" https://api.fodda.ai/v1/graphs` → **200**, served, no account required, SPT charged.
- [ ] `curl -i -H "Authorization: Bearer spt_invalid" …` → **401/`SPT_INVALID`** (invalid creds still rejected).
- [ ] `curl -i https://api.fodda.ai/v1/research/pricing` → **200** (unchanged).
- [ ] `curl -i https://api.fodda.ai/health` → **200** (now public).
- [ ] `llms.txt` + agent card claims now match live behavior.

## Out of scope / do NOT

- Don't change the SPT payment/charge logic (it works).
- Don't require an API key for the 402 discovery path — that's the bug.

## CHANGELOG Entry

```
### Fixed
- Unauthenticated requests to billable endpoints now return HTTP 402 with pricing + SPT instructions (was 401), closing the zero-onboarding MPP discovery loop advertised in llms.txt and the A2A agent card. Invalid credentials still return 401. /health is now public.
```
