# Brief: Unified Limit Error + Upsell Parity + ChatGPT Commerce-Silence Fix

**Target Agent:** Fodda MCP Agent (`Fodda MCP` repo)
**Date:** 2026-10-02
**Priority:** P1 (one real bug — ChatGPT commerce leak; plus upsell consistency)
**Execution handle:** `/build-from-brief briefs/Brief - Unified Limit Error + Upsell Parity + ChatGPT Commerce-Silence Fix (MCP Agent).md`

---

## Context

Prompted by a UX review of a competitor MCP (Pitch Protocol) and Piers's follow-up: *we should still
show cost and upsell when a user runs out of credits — just not to ChatGPT.* Audit of
`src/errorHandling.ts` found the upsell mostly works but is inconsistent across the five
out-of-credits paths, and one real bug: **ChatGPT users who run out of credits still get Stripe links
and prices**, violating the `/chatgpt` commerce-silence contract (`.agents/rules/chatgpt-listing.md`).

The decision is: **keep the full upsell on every normal client; fix the ChatGPT leak; make every path
show the price + link the same way, sourced from the API payment fields (which trace to Airtable/Stripe),
not hardcoded in MCP copy.**

### The five limit paths today (`src/errorHandling.ts`)
| Path | Price shown | Link | Issue |
|---|---|---|---|
| `PLAN_LIMIT_EXCEEDED` (monthly) | $0.50/call | card setup_url | price + link baked into `message` string, not clean fields |
| `DAILY_LIMIT_EXCEEDED` (50/day) | — | card setup_url | never says what adding a card costs |
| `TRIAL_EXHAUSTED` | — | `fodda.ai/account/billing` | wrong domain (everything else is `app.fodda.ai`); "top up" copy while note says Base is free |
| legacy `CREDITS_EXHAUSTED` | $100/200 calls | checkout | returned as `isError:false` (a normal result), so agents read it as data not an action |
| low-balance warning (`appendUsageWarning`, `toolHandlers.ts`) | $X (fallback $50) | link | "**100** more API calls for $X" — 100 hardcoded, price fallback $50 → can read "100 for $100" |

## The bug — ChatGPT commerce leak

Every tool's catch block runs `handleTrialCreditExhaustion()` **before** `handleAccessError()`.
`handleAccessError()` has the ChatGPT guard (returns clean `{ error: 'QUOTA_EXHAUSTED', manage_url }`
with no Stripe/price). But `handleTrialCreditExhaustion()` fires first on every credit error, has no
`source` argument, and returns the Stripe/price payload — so the guard never runs for credit
exhaustion on `/chatgpt`. (`appendUsageWarning` IS correctly gated on `chatgpt`, so only the hard-stop
exhaustion leaks.)

## What to build

1. **Pass `sessionSource` into `handleTrialCreditExhaustion()`** (new optional 4th arg). When
   `sessionSource === 'chatgpt'`, return the same clean `QUOTA_EXHAUSTED` payload `handleAccessError`
   uses — no Stripe URL, no price, no top-up, just `manage_url: https://app.fodda.ai/account`. Update all
   call sites (they already have `sessionSource` in scope where they call `handleAccessError`).

2. **One error builder for all non-ChatGPT limit paths.** Emit a stable shape on every limit/credit
   failure:
   ```
   { code, cause, next_action, action, setup_url?, top_up_url?, overage_rate_usd?, upgrade_url?, renews_at?, usage?, status }
   ```
   - `code` ∈ { `DAILY_LIMIT_EXCEEDED`, `PLAN_LIMIT_EXCEEDED`, `CREDITS_EXHAUSTED`, `TRIAL_EXHAUSTED` }.
   - `status` keeps the current value as an alias so existing clients don't break.
   - `next_action` = **one plain sentence the agent reads verbatim**, built from the API's own figures,
     e.g. *"You're out of monthly calls. Add a card to keep going at $0.50 per call: {setup_url}"* or
     *"Top up 200 calls for $100: {top_up_url}"*. This is the line that makes the CostSilence exception
     work (see Brief dependency below).
   - **All money/links come from the API payload** (`overage_rate_usd: 0.50`, `top_up_url`,
     `agent_checkout.{url, api_calls:200}`, `setupUrl`, `renews_at`, `DAILY_LIMIT_EXCEEDED` /
     `PLAN_LIMIT_EXCEEDED` codes — **confirmed live 2026-10-02** by the API agent, `functions/index.ts`
     ~L1525–1598). Remove hardcoded `$0.50`, `$100`, `200`, `100` literals from MCP copy — read them from
     the payload; if a field is absent, omit it rather than inventing a number.

   - **OPEN ITEM — top-up bundle dollar price.** The confirmed payload carries `agent_checkout.api_calls`
     (200) and `overage_rate_usd` (0.50) but **no explicit bundle total ($100)**. Do NOT compute it
     (200 × 0.50) — that's the forbidden metering-math per house rules, and the top-up is a fixed Stripe
     price, not a derived one. Two options, pick one with Piers:
     (a) **No API change** — the `next_action` says *"Top up 200 calls: {agent_checkout.url}"* and lets
         the Stripe page show the price. Safe, ships now.
     (b) **Small API add** — API agent adds `agent_checkout.price_usd` (from Airtable/Stripe, not
         computed) so the line can read *"Top up 200 calls for $100: {url}"*. Stronger upsell; needs a
         one-field API change first. **Recommended** if we want the price in the spoken line.

3. **Fix the three path-specific defects:**
   - `DAILY_LIMIT_EXCEEDED`: add the overage rate to `next_action` so the user knows a card costs
     $0.50/call after the free tier (rate from payload).
   - `TRIAL_EXHAUSTED`: use `app.fodda.ai`, not `fodda.ai/account/billing`; drop "top up" framing — a
     trial converts to **free Base (100 calls/mo after email verify)**, so the CTA is sign up / verify,
     not pay.
   - Low-balance warning: read the top-up call count and price from the payload (currently "100" and
     "$50" are literals); fall back to the structured `top_up_url` with no invented count/price.

4. **Make legacy `CREDITS_EXHAUSTED` an action, not data:** return it as `isError: true` like the other
   limit paths so agents treat it as a stop-and-upsell, not a row of content.

## Dependency — CostSilence exception (owner: system prompt)

`src/systemPrompt.ts` RULE: CostSilence currently forbids the agent from printing any price or "API
calls" except for booking human time. Add a **second exception**: *when a tool returns a limit/credit
error (any `*_EXHAUSTED` / `*_LIMIT_EXCEEDED` code), the agent relays the offer and the price exactly as
given in that response's `next_action`/fields.* Without this, compliant agents will strip the upsell at
the moment it matters. (Do this in the same PR — it's two lines and the error change is useless without
it.)

## Definition of Done

- A ChatGPT-source session hitting each credit code returns the clean `QUOTA_EXHAUSTED` payload — zero
  Stripe URLs, prices, or "API calls" text. Verified by extending `scripts/test_chatgpt_live.mjs` /
  `src/test_limit_and_credit_card_capture.ts` with a ChatGPT-source exhaustion case per code.
- A normal-source session hitting each code returns `code` + a verbatim `next_action` containing the
  live price and link from the API payload (no hardcoded figures).
- `grep` shows no `$0.50`, `$100`, `200 API calls`, or `100 more` string literals in the limit/warning
  copy in `errorHandling.ts` / `toolHandlers.ts` (all sourced from payload).
- `TRIAL_EXHAUSTED` points at `app.fodda.ai` and uses free-Base framing.
- CHANGELOG updated with a real verification result.

## Do Not

- Do not change the `/chatgpt` tool set, schemas, or annotations (listing freeze — `.agents/rules/chatgpt-listing.md`).
- Do not add a pre-call "this will cost X, continue?" prompt — CostSilence still forbids pre-spend cost
  prompts; the exception is for **limit responses only**.
- Do not hardcode prices/bundle sizes — Airtable/Stripe via the API payload is the source of truth.

## Files expected to change

- `src/errorHandling.ts` (unify builder, source-gate the trial handler, de-hardcode figures)
- `src/toolHandlers.ts` (`appendUsageWarning` de-hardcode; pass `sessionSource` to the trial handler at call sites)
- `src/systemPrompt.ts` (CostSilence limit-response exception)
- `src/test_limit_and_credit_card_capture.ts`, `scripts/test_chatgpt_live.mjs` (coverage)
- `CHANGELOG.md`
