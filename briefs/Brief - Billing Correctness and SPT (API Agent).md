# Brief: MCP Billing Trust-Gate Collision, Meter Hardening & SPT Discoverability
**Date:** 2026-06-19
**From:** MCP Agent
**To:** API Agent
**Priority:** P0 — Blocker. A normal user key routed through the hosted MCP is at risk of being **double-charged** (per-call debit + meter debit), and the agent-wallet (SPT) is built but undiscoverable. Both block correct monetization of the primary agentic surface.
**Context:** The hosted MCP forwards the *end user's own* Fodda API key outbound with `X-Fodda-Billing: mcp-orchestrated` (MCP `src/index.ts:157`, key sourced from inbound session key at `src/index.ts:519`). The API trust gate downgrades non-internal keys claiming that header to per-call billing (`functions/index.ts:594-603`), yet the MCP *also* fires a lump-sum `POST /v1/research/meter` per query (`src/pricingCache.ts:459`). For any non-internal/non-OIDC key this is a confirmed double-charge path. We need to fix the contract, harden the meter, and surface SPT.

---

## 1. Objective
Establish a single, unambiguous billing contract for MCP-orchestrated traffic so that exactly one debit occurs per user query and it is attributed to the end user — never double-charged, never mis-attributed, never silently lost. In parallel, make the already-built SPT (Shared Payment Token) agent-wallet discoverable in 402 and credit-exhaustion responses and covered by tests, and either finish or formally park the Stripe/commerce scaffolding.

## 2. What You Need To Do

### 2.1 (P0) Resolve the `mcp-orchestrated` trust-gate vs forwarded-user-key collision
**The collision (confirmed):**
- MCP outbound headers (`MCP src/index.ts:156-162`): `X-API-Key: <user's own key>`, `X-User-Id: <user>`, `X-Fodda-Billing: mcp-orchestrated`. The `apiKey` here is the per-session **inbound user key** (`MCP src/index.ts:519, 547`).
- API trust gate (`functions/index.ts:594-603`): if `billingMode === 'mcp-orchestrated'` and the account is **not** `internal_service` and does **not** start with `oidc_`, it logs `warn` (`:597`), sets `foddaMeta.billingMode = 'per-call'` (`:599`), and calls `clearMcpBillingMode(rawApiKey)` (`:601`).
- Consequence: `decrementCredits` is now invoked with per-call billing, so `effectiveBillableUnits = billableUnits` (not 0) at `functions/tracking/airtable.ts:674` → the accumulator debits the user immediately (`airtable.ts:684-720`). **Then** the MCP's per-query `POST /v1/research/meter` (`MCP src/pricingCache.ts:459`) debits the *fixed query price* again at `researchRouter.ts:653-661`. **= double-charge.**

**Required: confirm production key, then pick ONE contract.** First, API + MCP must jointly **confirm which key the MCP presents in production** (confirm) — the code path above shows the user key, but verify there is no infra-level key swap. Then adopt the dedicated-service-key contract below (recommended) and have MCP stop sending the header on the user key.

| | Option A — Dedicated MCP service key (recommended) | Option B — Trust user key + header |
|---|---|---|
| MCP outbound auth | `Authorization: Bearer <FODDA_MCP_SERVICE_KEY>` (an `internal_service`-class key) + `X-User-Id` + `X-Fodda-Billing: mcp-orchestrated` | user's key + header (status quo) |
| API trust decision | trust because the **authenticating key** is service-class; attribute & meter against the user resolved from `X-User-Id` | requires per-key allowlist of "MCP-trusted" user keys — brittle |
| Per-call debit | suppressed (`effectiveBillableUnits = 0`, `airtable.ts:673-674`) because gate passes | only suppressed if every user key is allowlisted — won't scale |
| Verdict | clean: service key = "this is MCP", `X-User-Id` = "charge this user" | rejected — defeats the trust gate's purpose |

**Contract spec (Option A):**
1. Recognize legitimate MCP traffic by the **authenticating credential** being service-class, not by the header on an arbitrary user key. Extend the gate at `functions/index.ts:594-603`: `mcp-orchestrated` is honored iff `account.accountRecordId === 'internal_service'` (the MCP service key) **OR** `oidc_*`. (Already the rule — the fix is on the MCP side to authenticate *as* the service.)
2. When honored, the **meter** (not per-call) is the sole debit. The meter must charge the account that owns `X-User-Id`, **not** the service account — see §2.2.
3. When the MCP authenticates with a real user key (fallback / direct), the gate correctly downgrades to per-call (`:599`) and the MCP **must not also** call `/v1/research/meter`. API to expose, in the per-call response, a flag (e.g. `usage.billing_mode: "per-call"`) so the MCP can suppress the redundant meter call. (confirm field name with MCP.)
4. Net invariant to assert: **for one user query, either the per-call debits sum to the cost OR the meter debits the fixed cost — never both.**

### 2.2 Add an ownership/consistency check at `/v1/research/meter`
Current handler (`researchRouter.ts:619-723`) debits `account.accountRecordId` whenever it is set and `!== 'internal_service'` (`:653`). It never verifies that the authenticated principal is *entitled* to debit that account, and under Option A the authenticated account will be the **service** account, so the debit would hit the wrong record. Required:
1. Resolve the **target billing account from `X-User-Id`** (the end user), not from the service principal. Add a `resolveAccountForUser(userId)` lookup; debit *that* account at `researchRouter.ts:653-661`.
2. Reject (`403 FORBIDDEN`) if the authenticated principal is a normal user key whose `accountRecordId` does not match the resolved target — i.e. a user key may only meter its own account; only the MCP service key may meter on behalf of an arbitrary `X-User-Id`.
3. Keep the existing server-authoritative cost (`expectedCost = calculateInteractionBillable(type)`, `:649`); continue to log but not trust `billable_units` (`:651`).

### 2.3 Make metering idempotent + retry-safe
The MCP fires the meter and on failure **swallows the error** (`MCP src/pricingCache.ts:472-475`, returns `{charged:false}`, no retry/audit), so today failures = lost charges; if the MCP later adds retries, the meter has **no dedupe** (no `X-Request-Id` / idempotency key read at `researchRouter.ts:619+`). Required:
1. Define an **idempotency key**: the MCP sends `X-Request-Id` (it already sets this header generically at `MCP src/index.ts:163`; confirm it is unique per query and propagated on the meter call). API treats `(X-Request-Id)` as the dedupe key for `/v1/research/meter`.
2. On the API: persist processed request ids (Firestore TTL doc, e.g. 24h) before debiting; on a repeat id, **return the prior result without re-debiting** (`200`, `idempotent_replay: true`). Place the check ahead of `decrementCredits` at `researchRouter.ts:653`.
3. Return a stable `meter_id` in the success body (`researchRouter.ts:700-714`) so the MCP can audit/reconcile.
4. Coordinate with MCP to add bounded retry on `5x`/network for the meter call and an audit log line on terminal failure (MCP-side fix; flagged here for the handshake).

### 2.4 Per-user attribution for enterprise `oidc_*` tenants
OIDC accounts resolve to `accountRecordId = 'oidc_' + tenant` (`functions/index.ts:518`), so all debits and Token Log rows aggregate at the **tenant** record — there is no per-user split, even though `oidcClaims.sub` is available (`:530-531`). Required:
1. At the meter (and per-call Token Log at `airtable.ts:730-770`), record the **subject** (`oidcClaims.sub` / `X-User-Id`) on the usage row even when the credit account is the tenant. Add a `userKey`/`subject` field to the Token Log payload (`airtable.ts:760-766`).
2. Provide per-subject rollups for enterprise billing exports (Airtable view or query) keyed on `subject` within `tenantId`. (confirm desired granularity with the enterprise billing owner.)
3. Credit pool stays tenant-level (correct for enterprise contracts); attribution becomes per-user.

### 2.5 SPT (Shared Payment Token) discoverability + tests
SPT is built and production-ready (`functions/index.ts:328-497`): accepts `X-Stripe-SPT` or `Authorization: Bearer spt_xxx` (`:331-335`), validates via `stripe.sharedPayment.grantedTokens.retrieve` (`:344`), charges a PaymentIntent (`:381-396`), sets `billingMode='spt-prepaid'` (skips debit at `airtable.ts:661-664`), and the 402 challenge advertises `payment_methods: ['stripe-spt']` (`:484`). Gaps:
1. **Naming:** standardize on **"SPT (Shared Payment Token)"** everywhere user/agent-facing. The 402 `accept: 'Authorization: Bearer <spt_token>'` (`:486`) and `WWW-Authenticate: stripe-spt …` (`:478-479`) are terse — add a human/agent-readable `payment_methods_detail` entry naming SPT and linking docs.
2. **Surface SPT in credit exhaustion:** the credit-exhausted / overage path must name SPT as the agent-wallet route. (Note: a literal `CREDITS_EXHAUSTED` string was **not** found in `functions/` — only a comment at `airtable.ts:274`; **confirm** the actual error code emitted on zero credits and add an `available_payment_methods: ['stripe-spt']` block plus a one-line "agents can pay per-call with a Shared Payment Token" note, mirroring the clarity of the existing PLAN_LIMIT path.)
3. **Public docs:** ensure `https://fodda.ai/llms.txt` (already referenced at `index.ts:469`) documents the SPT route by name. (Website Agent owns the file — flag for handshake.)
4. **Tests (currently none):** add integration tests for: happy path (valid SPT → PaymentIntent succeeds → response served, no credit debit); `SPT_REVOKED` (`:351`); `SPT_EXPIRED` (`:361`); `SPT_INSUFFICIENT_FUNDS` (`:374`); `SPT_REQUIRES_ACTION` 3DS (`:403`); `SPT_PAYMENT_FAILED` (`:412`); `SPT_INVALID` catch-all (`:489`). Pin/confirm the Stripe preview API version `2026-03-04.preview` (`:339`) used in tests matches prod.

### 2.6 Finish or formally park the scaffolding
1. **Commerce webhook:** `POST /api/stripe/commerce-webhook` (`functions/index.ts:2287-2311`) auto-approves **every** order (`:2298-2304`) with no fulfillment step. Either (a) implement fulfillment (credit grant / SPT provision on `order.completed`) or (b) park it explicitly with a `// PARKED:` comment + BACKBURNER entry and gate it off in prod. Decide which. (confirm intended commerce flow.)
2. **Agent-session checkout:** confirmed to live off-API at `https://app.fodda.ai/api/account/checkout/agent-session` (referenced `functions/index.ts:759`). Confirm the website/account service actually serves it and that the API only *links* to it; document the boundary so neither side assumes the other implements it. (Website/App Agent handshake.)
3. **FODDA_INTERNAL_API_KEY:** the MCP consumes it for internal/Waverunner-style calls so they skip billing (`MCP src/catalogCache.ts:102`, intent documented at `MCP src/index.ts:221`). Confirm the key (a) **is set in the MCP's production env**, and (b) authenticates as an `internal_service`-class account on the API so those calls hit the per-call-suppressed path (`airtable.ts:673-674`) rather than falling through to a billed user path. If unset in prod, internal calls currently send **no** auth (`catalogCache.ts:103`: empty headers) → confirm behavior/failure mode.

## 3. Acceptance Criteria
- [ ] Production key the MCP presents is confirmed in writing by API + MCP; documented in CHANGELOG / brief response.
- [ ] A normal user query through the hosted MCP results in **exactly one** debit equal to the fixed query price; verified there is no simultaneous per-call accumulator debit (`airtable.ts:684`) and meter debit (`researchRouter.ts:653`).
- [ ] `/v1/research/meter` debits the account resolved from `X-User-Id`, and a user key cannot meter an account it does not own (`403`).
- [ ] Replaying the same `X-Request-Id` to `/v1/research/meter` returns the prior result with `idempotent_replay: true` and does **not** debit twice.
- [ ] Enterprise `oidc_*` usage rows carry a per-subject identifier; a per-user rollup is produceable while credits stay tenant-pooled.
- [ ] 402 and credit-exhaustion responses name "SPT (Shared Payment Token)" and list `stripe-spt` as a payment method; `llms.txt` documents it (Website handshake noted).
- [ ] SPT integration tests pass for happy path + REVOKED/EXPIRED/INSUFFICIENT_FUNDS/REQUIRES_ACTION/PAYMENT_FAILED/INVALID.
- [ ] commerce-webhook is either fulfilling or explicitly parked+gated; agent-session boundary documented; `FODDA_INTERNAL_API_KEY` confirmed set in MCP prod and mapped to `internal_service`.

## 4. Testing Plan
- **Anti-double-billing:** internal calls use `FODDA_INTERNAL_API_KEY` (must authenticate as `internal_service` so `effectiveBillableUnits=0`, `airtable.ts:673-674`). Add an integration test: MCP service key + `X-User-Id` + `mcp-orchestrated` → assert per-call debit = 0 and exactly one meter debit on the user account.
- **Double-charge regression:** simulate a *normal user key* + `mcp-orchestrated` header → assert the gate downgrades (`index.ts:599`) **and** that no meter call is accepted for the same query (or that meter is short-circuited), so total debit = per-call cost only.
- **Ownership:** user key A meters account B → expect `403`. MCP service key meters arbitrary `X-User-Id` → expect success against the user's account.
- **Idempotency:** fire meter twice with same `X-Request-Id` → one debit; assert `idempotent_replay: true` on the second.
- **OIDC attribution:** two distinct `sub`s under one tenant → two usage rows with distinct subject, one tenant credit pool decremented by the sum.
- **SPT:** the six error states above + happy path; assert no credit decrement on `spt-prepaid` (`airtable.ts:661-664`); assert 402 body advertises SPT.
- **Scaffolding:** commerce-webhook unit test for chosen behavior; smoke test that an unauthenticated request to a paid endpoint returns the SPT-naming 402 (`index.ts:475-497`).

## 5. Dependencies & Coordination
- **MCP ↔ API (header contract):** API to confirm Option A (service-key auth) is acceptable; MCP to switch outbound from user key to `FODDA_MCP_SERVICE_KEY` while still sending `X-User-Id` (`MCP src/index.ts:156-162`). Until that lands, MCP must suppress the meter call when the API response indicates `billing_mode: per-call`. Agree the exact response field name.
- **MCP ↔ API (idempotency):** agree `X-Request-Id` is the dedupe key and is unique per user query end-to-end (MCP sets it at `src/index.ts:163`).
- **API ↔ Enterprise billing owner:** confirm desired per-user OIDC rollup granularity.
- **API ↔ Website Agent:** `llms.txt` SPT documentation; confirm `app.fodda.ai/api/account/checkout/agent-session` is served by the website/account service.
- **API ↔ Product owner:** decide commerce-webhook fulfill-vs-park.

## 6. CHANGELOG Entry
```
### Fixed
- Billing: closed MCP-orchestrated double-charge — a user key forwarded through the hosted MCP was downgraded to per-call (functions/index.ts:594-603) AND metered (researchRouter.ts:653), debiting twice. MCP now authenticates as a dedicated service key; meter is the sole debit per query.
- /v1/research/meter now debits the account resolved from X-User-Id and rejects (403) cross-account metering by non-service keys (researchRouter.ts:653-661).
- /v1/research/meter is now idempotent via X-Request-Id dedupe; MCP retries no longer double-debit.

### Added
- Per-subject usage attribution for enterprise oidc_* tenants (Token Log subject field) while keeping tenant-level credit pools (functions/index.ts:518, airtable.ts:760-766).
- SPT (Shared Payment Token) named explicitly in 402 and credit-exhaustion responses (functions/index.ts:475-497) and in llms.txt.
- SPT integration tests: happy path + SPT_REVOKED/EXPIRED/INSUFFICIENT_FUNDS/REQUIRES_ACTION/PAYMENT_FAILED/INVALID.

### Changed
- Stripe agentic commerce-webhook (functions/index.ts:2287-2311) [fulfilled | parked+gated]; agent-session checkout boundary documented; FODDA_INTERNAL_API_KEY confirmed set in MCP prod and mapped to internal_service.
```

### Addendum — Pricing Schedule Integrity (append to §2; ties to master §8)

1. **Declare ONE source of truth for tool→cost.** `src/metering.ts` `TOKEN_COSTS` (lines 40-63) is the server-side authority and `/v1/research/meter` already defers to it (`researchRouter.ts:645`). Make this explicit: add a header comment in `TOKEN_COSTS` stating it is the canonical schedule, and remove `TIER_CONFIG` (`researchRouter.ts:205-208`) as a parallel definition — have the deep-dive path read `TOKEN_COSTS['deep_dive_fast'|'deep_dive_comprehensive']` instead of its own copy, so fast=20 / comprehensive=30 cannot drift.
2. **Keep server recompute authoritative; never trust the client amount.** Do not change the recompute at `researchRouter.ts:645-655`: continue computing `expectedCost = calculateInteractionBillable(type)`, logging the mismatch warning (`:647`), and debiting `expectedCost` (`:655`). Add an explicit test: POST `/v1/research/meter` with `billable_units` set to a deliberately wrong value and assert the correct fixed `TOKEN_COSTS[type]` is debited and returned in `billable_units` (`:703`).
3. **Reconcile `scheduled_analyst`.** `TOKEN_COSTS['scheduled_analyst']=20` ("upgraded from 5", `metering.ts:46`) is in `VALID_METER_TYPES` (`researchRouter.ts:600`) but no handler meters it; production uses `scheduled-research:20` (`scheduledRouter.ts`, `scheduledRunner.ts`). Either delete `scheduled_analyst` from both lists, or alias it to `scheduled-research` with a comment. Net: exactly one priced name per action.
4. **Single deep-research debit path.** `/v1/research/deep-dive` pre-debits via `decrementCredits` (`researchRouter.ts:272-279`) and does NOT use the meter, while MCP `deep_research_topic` settles via the meter. Confirm in writing that for any one user query only ONE of these fires; if both can fire, this is a double-charge surface — fix and add a regression test.
5. **Publish the schedule for cold agents.** Expose the canonical `TOKEN_COSTS` map (or a read endpoint) so the MCP `describe_fodda` / `get_my_account` cost table and `llms.txt` can source prices from the API rather than hardcoding. Correct the public number: brand_intelligence = 20 (flat), not ~10.

**Acceptance additions:**
- [ ] `TOKEN_COSTS` is the sole price authority; `TIER_CONFIG` no longer independently defines deep-dive costs.
- [ ] Test proves `/v1/research/meter` ignores a tampered `billable_units` and charges the fixed cost.
- [ ] `scheduled_analyst` removed or aliased; one priced name per action.
- [ ] Written confirmation that deep-dive and meter never both debit one query.
