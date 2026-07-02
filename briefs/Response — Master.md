# Response — Master: Agentic Access & Monetization

**Date:** 2026-06-19
**From:** MCP Agent (Coordinator)
**To:** Piers (Product)
**Status:** ✅ **Implementation complete — all 5 agents executed** (Website, API/Option C, App, CE, MCP). All §4 decisions made (D2 = Option C, parity fixes landed). CE's 3 API-confirmations resolved (§7). Only **operational deploy-gates** remain — chiefly the secret rotation.

---

## 1. Workstream status

| Workstream | Owner | Status |
|---|---|---|
| Website: trial-language purge, "tokens"→"API calls", /agents discoverability | Website | ✅ **Done** (build clean, 14 files) |
| vscode README SPT-direct-REST caveat + CHANGELOG wording | MCP | ✅ **Done** (this session) |
| MCP: "$0.20/token"→"$0.20/API call" + "tokens"→"API calls" in messages | MCP | ✅ **Done** (typecheck clean) |
| MCP: remove dead client-side trial code | MCP | ✅ **Done** (typecheck clean) |
| MCP: tool-safety `destructiveHint` ×3 + `sign_up_free_account` consent guardrail | MCP | ✅ **Done** |
| MCP: cost-awareness in system prompt + `get_my_account` cost table | MCP | ✅ **Done** (sourced from pricingCache) |
| MCP: PAYG narrative in `CREDITS_EXHAUSTED` | MCP | ✅ **Done** (PAYG now in message body, not a bare field) |
| MCP: outbound auth + meter retry + `billing_mode` suppression + stable `X-Request-Id` | MCP | 🔴 **Blocked on D2** |
| API: double-charge / trust-gate fix | API | 🟡 Plan ready — **blocked on D2** |
| API: meter ownership check + idempotency + OIDC `subject` | API | 🟡 Plan ready |
| API: SPT discoverability (402 + exhaustion) + 8-case test suite | API | 🟡 Plan ready |
| API: pricing single source (`TOKEN_COSTS`, kill `TIER_CONFIG` dup, `GET /v1/research/pricing`) | API | 🟡 Plan ready — needs `scheduled_analyst` decision |
| API: commerce-webhook | API | 🟡 Park (default) pending decision |
| App: BillingPage spend visibility, trial-UI removal, terminology, `?view=billing` | App | 🟡 Plan ready — pending decisions |
| App/`Fodda` repo: `agent-session` checkout endpoint | App | ⏳ **Confirm/build** (existence unverified) |
| CE: graphId normalization (warn → collapse to flat) + scan script | CE | 🟡 Plan ready — needs data-scan go-ahead |
| CE: delete dead `incrementGraphQueryCount` + ingest flat-slug guard | CE | 🟡 Plan ready — needs API confirm |

## 2. Resolved cross-agent items (no longer open)

- **`trial-convert` = Base provision.** App confirmed `/api/account/trial-convert` provisions a free Base account despite the legacy name → the MCP's `sign_up_free_account` path is correct as-is.
- **`agent-session` checkout is owned by the `Fodda` (App) repo** — App to confirm/build it; the API only *links* to it.
- **MCP widgets not embedded in the app** → App brief §2.5 is N/A.
- **CE is clean of metering/billing** (all greps zero-hit) → no CE metering work; CE's scope is `graphId` attribution integrity only.

## 3. The billing contract (critical path — gates API + MCP item 1)

The API plan assumes **Option A (dedicated MCP service key + `X-User-Id`)**. Coordinator review surfaced two issues:
1. **Access-control hole in A:** if the MCP authenticates per-call as the service key, the API must resolve the user's graph access / quota / disabled-graph prefs from `X-User-Id` on *every* call — the API plan only routes the *meter debit* that way. Unaddressed = wrong entitlements.
2. **`X-Request-Id` not sent on the meter call today** (`pricingCache.ts` passes none) — the API's idempotency keys on it, so the MCP retry + a stable per-query id must land together.

**Alternative — Option C (HMAC-gated):** the MCP already HMAC-signs every request (`FODDA_MCP_SECRET`). The API could trust `mcp-orchestrated` on a valid MCP signature while keeping the **user's own key** on the request — per-call debits skipped, meter settles against the user, **access control unchanged, no service-key swap, no `X-User-Id` resolution layer.** Coordinator recommendation: **Option C.**

## 4. Open decisions for Piers (consolidated)

| # | Decision | Recommendation |
|---|---|---|
| **D2** | Billing contract: Option A / C / B | ✅ **DECIDED: Option C (HMAC-gated)** — see `Decision — D2 Billing Contract (Option C).md`. Fixes double-charge API-side only, zero MCP changes; drops API plan §2.2. Depends on: API verifies MCP HMAC + env confirms `FODDA_MCP_SECRET` signed in prod. |
| D-WEBHOOK | Commerce webhook: park+gate / build fulfillment | **Park** for now |
| D-SCHED | `scheduled_analyst`: delete / alias | **Delete** (unreachable) |
| D-ENV | `FODDA_MCP_SECRET` + `FODDA_INTERNAL_API_KEY` in prod | ✅ **Confirmed** — both via Secret Manager → Cloud Run. No service key needed (Option C). API to verify same `FODDA_MCP_SECRET` value + that `FODDA_INTERNAL_API_KEY` → `internal_service`. |
| D-OIDC | Enterprise per-user attribution: `subject` Token-Log field / add rollup endpoint | **`subject` field** is enough for now |
| D-COST | App/MCP per-query cost table source: API `GET /v1/research/pricing` / hardcode | **API endpoint** (single source of truth) |
| D-ADMIN | AdminPortal "Trial MCP URL Generator" tools: keep / retire | Lean **retire** (trials gone); App leans keep — your call |
| D-NEO4J | Canonical Neo4j join key: `graphId` / `psfk_graph_slug` | **`graphId`** (CE + coordinator agree) |
| D-CESCAN | Approve CE's live-data graphId slash scan (`--dry-run` first) | **Approve** |

## 5. API confirms owed to the CE agent

1. Query-type codes are derived at API serve time, not expected from CE. (Confirm.)
2. Canonical Neo4j attribution join key = `graphId` (see D-NEO4J).
3. API does not import `incrementGraphQueryCount` cross-repo → CE may delete it. (Confirm.)

## 6. Deploy order & release gate

**API first** (billing contract + meter hardening) → **MCP second** (auth contract + `billing_mode` suppression; relabel/safety/cost work already landed) → **App third** (consumes the contract + pricing endpoint). **Website** in parallel (done). **CE** independent (attribution integrity).

**Release gate (anti-double-billing):** no deploy until the eval harness proves one MCP-orchestrated query → exactly one correctly-attributed debit. Include a **signed GET-with-query-string** case (the path that would otherwise silently double-charge).

---

## 7. Implementation complete — remaining operational gates (2026-06-19)

All five agents executed; all cross-agent confirmations resolved:
- **CE's 3 confirmations ✅** — query-type derived at API serve time (CE clean); canonical Neo4j join key = `graphId` (API uses `graphId`, no `psfk_graph_slug`); `incrementGraphQueryCount` not imported cross-repo (0 hits in API) → safe to delete. CE normalized 60 dirty records to flat slugs; post-fix scan clean.
- **`agent-session` checkout ✅ exists** (`Fodda` server `accountRouter.ts:1694`); App client wired to the matching path. The long-open cross-agent gap is closed.
- **API Option C ✅** with all HMAC parity fixes (`req.originalUrl`, empty-body POST, `timingSafeEqual`, 5-min replay); compiles clean.

**Operational gates — status (everything deployed):**
1. **Secret rotation** — ⏭️ owner electing to skip; deployed as-is. (Residual exposure of `Fodda/.env` secrets in `fodda-demo` GitHub history stands — accepted risk.)
2. **Firestore TTL on `meter_idempotency.ttl`** — ⏳ briefed to API Agent (`Brief - Firestore TTL (meter_idempotency).md`); needs gcloud auth to `fodda-api`, else owner runs the one command. Non-urgent (housekeeping).
3. **Website: SPT in `llms.txt`** — ✅ **Done** (Website agent): canonical "SPT (Shared Payment Token) via MPP", $0.25/API call inline, "Direct REST API only." Discovery loop closed: API 402 `payment_methods_detail.docs` → `fodda.ai/llms.txt`.
4. **MCP optional hardening** — ✅ **Done**: stable per-query `X-Request-Id` + retry on the meter call (closes lost-charge leak; safe via API idempotency) + central `billing_mode='per-call'` double-charge alert in `foddaRequest`. Typecheck clean.

## 8. Agent-readiness — discovery verified ✅ / charging BROKEN ⚠️ (P0)

The cold-agent zero-onboarding loop is **live and coordinator-verified** (API revision `fodda-api-new-00385-tlz`):
- Unauthenticated billable request → **402** with `WWW-Authenticate: stripe-spt amount=25 currency=usd` + full `payment_methods_detail` / `spt_info` payload + docs link.
- `/health` → 200 (now public); `/v1/research/pricing` → 200; invalid SPT → 401 `SPT_INVALID`.
- A2A agent card served at `/.well-known/agent-card.json` (200; core fields + 6 skills).
- `llms.txt` now matches live behavior.

Net: **discovery works, payment does NOT.** A cold agent gets the price + SPT instructions (402), but **cannot actually be charged** — `stripe.sharedPayment` is undefined in the installed SDK (`stripe@22.1.0`, no such resource), so every SPT (valid or invalid) fails validation and is rejected as `SPT_INVALID`. The `as any` cast at `functions/index.ts:378` hid it from the type checker. We verified 402-discovery + invalid-rejection; a **valid SPT → 200 + charge was never tested and currently cannot succeed.**

**P0 (→ API agent):** `Brief - SPT Charging Broken (Stripe SDK lacks sharedPayment).md` — upgrade the Stripe SDK to a version exposing the shared-payment-token resource, drop the `as any`, test a real SPT end-to-end.

**Optional polish (→ API agent):** A2A card spec-conformance — `securitySchemes` → OpenAPI-style object map + `security` array; transports → `additionalInterfaces`/`preferredTransport`. Validate via agent-ready.dev.
