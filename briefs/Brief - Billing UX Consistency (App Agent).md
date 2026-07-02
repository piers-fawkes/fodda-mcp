# Brief: App Billing/Account UX Consistency — "API calls" Language, Trial Removal, Spend Visibility, Exhaustion-State Parity
**Date:** 2026-06-19
**From:** MCP Agent
**To:** App Agent
**Priority:** P1 — High. The MCP already presents billing as "API calls," has retired trials, and surfaces plan/quota/reset/per-query cost to agents. The in-product UI (app.fodda.ai) is the same user's other surface; mismatched language ("tokens"), live trial UI, and divergent top-up/upgrade flows confuse paying users and undercut the monetization story. Not a P0 blocker because billing still functions; this is correctness/consistency.
**Context:** The hosted MCP surfaces account state via `get_my_account` (MCP src/toolHandlers.ts:396-470) and renders exhaustion states via `errorHandling.ts`. App must match this contract so the dashboard a user sees agrees with what their agent sees. Trial is retired; the app must not show trial states.

---

## 1. Objective
Bring app.fodda.ai's account/billing UI into parity with the MCP's user-facing billing model: (a) call the unit "API calls" everywhere, never "tokens"; (b) remove all trial UI and states (trials are retired — users start on free Base); (c) surface plan, API calls remaining, reset date, and per-query cost so a user can see and predict spend, matching `get_my_account`; (d) make the top-up / add-payment-method / upgrade entry points match the exact actions the API returns on `PLAN_LIMIT_EXCEEDED` (add card → overage) and `CREDITS_EXHAUSTED` (Stripe top-up), so the agent and the dashboard route a user to the same place. The App Agent owns its repo; this brief specifies the contract and observable outcomes, not app file paths.

## 2. What You Need To Do

> The app repo is **not** present in this workspace, so all app file:line references below are placeholders the App Agent must fill in from its own repo. MCP citations are confirmed against `/Users/piersfawkes/Documents/Fodda MCP`.

**2.1 — "API calls" not "tokens" (UI copy + labels).**
The MCP deliberately reads API token fields but **relabels them as API calls** to the user: MCP src/toolHandlers.ts:430-431 ("API still returns tokens_remaining etc. — we read those fields but present them as 'api_calls'"), exposing `api_calls_remaining`, `api_calls_total`, `api_calls_used` (toolHandlers.ts:434-435, :443). The low-credit warning pluralizes "API call"/"API calls" (toolHandlers.ts:99).

Action: audit all account/billing strings in the app and replace user-facing "token(s)" with "API call(s)". Keep "token" only where it's a Stripe overage *price unit* the API itself emits (see 2.3 — "$0.20/token" appears in MCP copy at errorHandling.ts:307 and toolHandlers.ts:441; **confirm** whether App wants to also relabel the overage price unit to "/API call" for full consistency — flag to API Agent if so, since the price string originates server-side).

| User-facing concept | Use this label | Do NOT use |
|---|---|---|
| Monthly quota unit | "API calls" | "tokens", "credits", "queries" |
| Remaining balance | "API calls remaining" | "tokens left" |
| Consumed this cycle | "API calls used" | "tokens used" |
| Overage price (confirm) | "$0.20 / API call" *(confirm with API)* | "$0.20/token" |

**2.2 — Remove all trial UI/states.**
Trial is retired. MCP evidence the model treats `isTrial` as dead/false and that residual trial copy is being removed: `buildSystemPrompt(..., isTrial = false, ...)` default (src/systemPrompt.ts:445); trial welcome block gated on `isTrial` (src/systemPrompt.ts:484-489); `TrialConversionFlow` rule (src/systemPrompt.ts:252-253); a dead trial branch in the low-credit warning ("remaining on your trial. Upgrade to the free Base plan", src/toolHandlers.ts:109-110); a stale "Trial" plan fallback in `get_my_account` (src/toolHandlers.ts:414). New individual accounts are planCode 13, not trial keys (src/toolHandlers.ts:289). Legacy trial keys are explicitly rejected (src/errorHandling.ts:119, :231).

Action in the app:
1. Remove any "Start trial" / "Trial active" / "X days left in trial" / "Trial expired → upgrade" UI components and routes.
2. Remove any `isTrial` / `planCode === <trial>` conditional rendering; default new users to **Base (100 API calls/month)** (MCP confirms free Base = 100 API calls/month: src/toolHandlers.ts:110, :231, :2352).
3. Remove trial-conversion CTAs that point at `/api/account/trial-convert` (this endpoint is referenced by dead MCP code at src/toolHandlers.ts:2341 — **confirm** whether the app still calls it; if so, coordinate retirement with API Agent).

**2.3 — Surface plan, API calls remaining, reset date, per-query cost (parity with `get_my_account`).**
The dashboard's account/billing panel must show the same fields the MCP returns. Source-of-truth contract (MCP src/toolHandlers.ts:433-466):

```json
{
  "plan": "Base",
  "api_calls_remaining": 87,        // API: tokens_remaining ?? credits
  "api_calls_total": 100,           // API: tokens_total ?? monthlyQueryLimit
  "api_calls_used": 13,             // API: tokens_used (if present)
  "reset_date": "2026-07-01",       // API: reset_date (if present)
  "overage_active": false,          // true when api_calls_remaining < 0
  "overage_tokens": 0,              // abs(api_calls_remaining) when negative
  "upgrade_offer": { "target": "...", "price": "$...", "link": "..." },
  "manage_url": "https://app.fodda.ai/account"
}
```

Action:
1. Render **plan**, **API calls remaining / total** (e.g. "87 / 100 API calls"), **API calls used**, and **reset date** on the account/billing page. If `reset_date` is absent from the API, show "resets monthly" rather than nothing (MCP gates display on presence — toolHandlers.ts:444).
2. Render **overage state** when remaining is negative: "You're N API call(s) over your monthly limit. Overage charges apply at $0.20/token." (mirror MCP toolHandlers.ts:438-441). **Confirm** the app reads the same negative-remaining signal.
3. **Per-query cost visibility (new capability — does not exist in MCP UI either).** Show users the fixed per-query prices so they can predict spend. Authoritative price table (from Brief API Call Billing Transition; server-recomputes and does not trust client — API researchRouter.ts ~:593-723):

   | Query type | API calls |
   |---|---|
   | research_chat | 3 |
   | topic_research | 15 |
   | brainstorm | 15 |
   | brand_intelligence | 20 |
   | deep_research_light | 20 |
   | deep_research_heavy | 30 |
   | standalone_* | 5 |
   | expert_agent | 5 |
   | visual / admin | 0 |

   Render this as a "What each query costs" reference on the billing page. (**Confirm** these are the live values with the API Agent before shipping — prices are server-side and may drift; do not hard-code without a contract.)

**2.4 — Top-up / add-payment-method / upgrade flows match API actions.**
The MCP routes users to specific actions per error code. The app's billing CTAs must land users at the **same** destinations so the two surfaces agree:

- **`PLAN_LIMIT_EXCEEDED`** → action `ADD_PAYMENT_METHOD`: one-click Stripe card-add (`setupUrl` from `/api/account/setup-url`, MCP errorHandling.ts:51, :303-313), unlocking overage at **$0.20/token**. Fallback action `VISIT_BILLING` → `${APP_BASE_URL}?view=billing` (errorHandling.ts:303).
  - App: the "Add payment method" button on the billing page must hit the same `setup-url` flow and land users in the same Stripe card-add, and the `?view=billing` deep link (errorHandling.ts:303) must resolve to the billing view. **Confirm** `?view=billing` is a live route.
- **`CREDITS_EXHAUSTED`** → action `CHECKOUT_AVAILABLE`: Stripe top-up checkout ("Buy 100 more tokens", `agent_checkout`/`/api/account/checkout/agent-session`, MCP errorHandling.ts:29, :134-152, :330-353). Fallback `UPGRADE_REQUIRED`/`VISIT_APP`.
  - App: the "Top up" / "Buy more API calls" button must hit the same checkout endpoint and reflect the same pack size (currently "100"). Note the MCP copy here still says "100 more tokens" (errorHandling.ts:140) — per 2.1, the **app** copy must say "API calls"; flag the MCP/API copy mismatch back for alignment (**confirm**).
  - Note: the agentic-commerce order webhook auto-approves every order with no fulfillment (API functions/index.ts:2287-2311, per audit) — **confirm with API Agent** that a top-up purchased via the app actually credits the account before exposing the button as the primary path.

**2.5 — MCP-rendered widgets embedded in the app (if any).**
If the app embeds MCP-rendered widgets (brand widget / visuals via `show_widget`), confirm that **billing/exhaustion states render correctly** inside the embed. The MCP returns exhaustion as structured JSON with `status: 'CREDITS_EXHAUSTED' | 'PLAN_LIMIT_EXCEEDED'`, `action`, `checkout_url`/`setupUrl`, and a `message` containing markdown links (errorHandling.ts:134-160, :303-360). 
Action: (a) **confirm** whether the app actually embeds MCP widgets (the MCP renders widgets for agent clients, not necessarily the app — **unconfirmed**); (b) if it does, verify the embed surfaces the `message`/`action`/checkout link rather than rendering a blank or raw-JSON error; (c) verify the embed does not show retired trial copy.

## 3. Acceptance Criteria
- [ ] No user-facing string in the account/billing UI contains "token(s)", "credit(s)", or "queries" as the quota unit; all read "API call(s)". (Overage price unit handled per 2.1 confirm.)
- [ ] No trial UI renders anywhere: no "trial" badges, countdowns, conversion CTAs, or `isTrial` branches; new users default to Base (100 API calls/month).
- [ ] Billing page shows, for the logged-in user: plan, API calls remaining / total, API calls used, and reset date (or "resets monthly" when absent) — values match `get_my_account` for the same account.
- [ ] Overage state renders when remaining < 0, with the "$0.20/token" overage note (or relabeled unit per confirm).
- [ ] A "What each query costs" reference is visible and matches the confirmed API price table.
- [ ] "Add payment method" CTA lands at the same Stripe card-add flow as the MCP `PLAN_LIMIT_EXCEEDED` `setupUrl`; "Top up / Buy more API calls" CTA lands at the same checkout as the MCP `CREDITS_EXHAUSTED` flow.
- [ ] `${APP_BASE_URL}?view=billing` deep link resolves to the billing view (the MCP hands this URL to agents — errorHandling.ts:303).
- [ ] (If widgets embedded) MCP exhaustion/billing widget states render with a usable message + action link, no raw JSON, no trial copy.
- [ ] App Agent has filled in real app-repo file:line references for each change in the PR description.

## 4. Testing Plan
- **Language/trial audit:** grep the app repo for `token`, `trial`, `isTrial`, `credit`, `/api/account/trial-convert`; assert zero user-facing hits except the confirmed overage-price unit. Snapshot/visual test the billing page.
- **Account parity:** for a known test account, call MCP `get_my_account` and load the app billing page; assert plan / api_calls_remaining / api_calls_total / api_calls_used / reset_date match field-for-field.
- **Overage:** force a negative-remaining account; assert overage banner + note appear on both surfaces.
- **Flow parity:** trigger `PLAN_LIMIT_EXCEEDED` and `CREDITS_EXHAUSTED` against the API; assert the app's "Add payment method" and "Top up" buttons resolve to the same Stripe destinations the MCP returns (`setupUrl`, `checkout_url`).
- **Anti-double-billing:** any internal calls the app makes to the API on behalf of the user (e.g. fetching account state, initiating checkout) must use `FODDA_INTERNAL_API_KEY`, not a user key carrying `X-Fodda-Billing: mcp-orchestrated` — a regular user key sending that header is downgraded to per-call (API functions/index.ts:593-602), so internal app traffic must not impersonate the orchestration path or it risks per-call debits.
- **Widget (if applicable):** render an embedded MCP widget while the account is exhausted; assert the exhaustion message + action link display correctly.

## 5. Dependencies & Coordination
- **API Agent:** (a) confirm the live per-query price table before the app hard-codes/renders it; (b) confirm whether the overage price unit should be relabeled "/API call" in server-emitted strings (2.1); (c) confirm `?view=billing` route and the `setup-url` + `agent-session` checkout endpoints are the canonical app-side flows; (d) confirm the agentic-commerce top-up actually credits the account (auto-approve webhook with no fulfillment — API functions/index.ts:2287-2311) before the app exposes "Top up" as primary; (e) confirm `/api/account/trial-convert` can be retired.
- **MCP Agent (me):** I will remove residual trial copy/branches on my side (systemPrompt.ts:484-489, :252-253; toolHandlers.ts:109-110, :414) and align CREDITS_EXHAUSTED copy from "tokens" → "API calls" (errorHandling.ts:140) so the two surfaces use identical language. Coordinate the copy change so we ship the same wording.
- **Contract handshake:** the app's billing display must read the same account fields the MCP reads (`tokens_remaining`/`tokens_total`/`tokens_used`/`reset_date`/negative-remaining = overage). If the API renames these, both MCP and App must update together.

## 6. CHANGELOG Entry
```
### Changed
- App billing/account UI now uses "API calls" instead of "tokens" everywhere, matching MCP get_my_account labeling.
- Billing page surfaces plan, API calls remaining/total, API calls used, reset date, and a per-query cost reference for spend visibility (parity with MCP get_my_account).
- Top-up / add-payment-method / upgrade CTAs now route to the same Stripe flows the API returns for CREDITS_EXHAUSTED (checkout) and PLAN_LIMIT_EXCEEDED (add card / ?view=billing).

### Removed
- All trial UI and isTrial states; new users default to free Base (100 API calls/month). Trial-conversion CTAs removed.

### Fixed
- Embedded MCP widgets now render billing/exhaustion states with a usable action link instead of raw JSON or stale trial copy. (if applicable — confirm)
```
