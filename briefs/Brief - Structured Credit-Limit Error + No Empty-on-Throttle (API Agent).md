# Brief: Structured Credit-Limit Error + Never Return Empty on Throttle

**Date:** 2026-06-22
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda
**Priority:** P2 (correctness + avoids feeding payment URLs to agents)

---

## Background

An agent hit credit exhaustion via `search_graph` and reported two problems. The MCP half is **fixed and deployed** (rev pushed today): credit errors now surface as structured fields with a clean message, and the fan-out no longer masks credit failures as `NO_MATCH`. This brief is the **API half**.

(Useful for tracing the original call: it was a non-trial account out of monthly credits; the response was the `403 PLAN_LIMIT_EXCEEDED` payload. The reporter can supply the approx timestamp + account email — note the `req_011C…` id they have is the Claude-side request id, not Fodda's, so correlate by time/account in Cloud Logging.)

## Issue 1 — payment details baked into the error `message` string

The `403 PLAN_LIMIT_EXCEEDED` payload (`functions/index.ts`, ~L961–996) puts a **live Stripe checkout URL, a dollar price, the overage rate, and the renewal date all inside the human-readable `message`** — e.g.:
> `"Credit limit reached. Upgrade to 'TOP UP — 200 Tokens' ($100) at https://buy.stripe.com/… Or add a card to continue at $0.50/API call overage. Your current plan will renew on 2026-07-01."`

That string is fed to the model/client verbatim. The URL is a public Stripe Payment Link (not a secret), but payment CTAs shouldn't be injected as prose — they belong in structured fields the client chooses to render.

**Fix:** keep the payload's structured fields, add the missing ones, and make `message` clean (no URLs, no prices):
- `error_code: "credit_limit"`
- `top_up_url` (the Stripe link — currently only in the prose)
- `overage_rate_usd: 0.50` (currently in `payg.pricePerCall` and the prose; expose explicitly)
- `renews_at: "2026-07-01"` (currently only in the prose; add as a field)
- `upgrade_url` (already `upgradeUrl`)
- `message`: a short, URL-free, price-free sentence (e.g. *"Monthly credit limit reached. Top up, enable pay-as-you-go, or upgrade to continue — see the structured fields."*)

The MCP already reads these structured fields (`top_up_url`, `overage_rate_usd`, `renews_at`, `upgrade_url`, `usage`, `payg`) and builds its own clean message — so once the API stops baking URLs into `message`, both API-direct and MCP callers are clean. Apply the same treatment to the **trial** exhaustion payload if it has the same prose pattern.

## Issue 2 — confirm throttle never returns empty-looking results

The MCP fan-out bug (rejections → `NO_MATCH`) is fixed MCP-side. Please confirm the **API** itself can't produce the same illusion:
- When an account is over its limit, the search endpoints (`/v1/graphs/{id}/search`, `/v1/search/*`) must return an explicit **402/403 credit error**, never a `200` with empty `rows`. Verify there's no path where quota state yields an empty result set instead of an error.
- Ensure the credit error is classifiable: a consistent status code (the MCP treats `402` and `code/PLAN_LIMIT_EXCEEDED`/messages containing "credit" as credit errors) — keep `error_code: "credit_limit"` (or the existing code) stable so the MCP routes it correctly.

## Verify
- `403 PLAN_LIMIT_EXCEEDED` body has `error_code`, `top_up_url`, `overage_rate_usd`, `renews_at`, `upgrade_url`, and a clean URL-free `message`.
- No search endpoint returns `200` + empty rows when the cause is quota — it returns the credit error.
- A `curl` of a search endpoint on an over-limit account shows the structured error, and the MCP surfaces it as `CREDITS_EXHAUSTED` with fields (no raw URL in the message).
