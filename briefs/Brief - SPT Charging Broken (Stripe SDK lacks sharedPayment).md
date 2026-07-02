# Brief: SPT Charging is Non-Functional — Stripe SDK Lacks `sharedPayment`

**Date:** 2026-06-19
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Priority:** P0 — Blocker. The 402 *discovery* works, but **no SPT can actually be charged**, so the "agent pays with no account" value prop is non-functional in prod.

---

## The bug

SPT validation calls a Stripe resource that **does not exist in the installed SDK**:

- `functions/index.ts:378` → `const grantedToken = await (stripe as any).sharedPayment.grantedTokens.retrieve(sptToken);`
- Installed SDK: **`stripe@22.1.0`** (`package.json:23`). A grep of `node_modules/stripe/` finds **zero** occurrences of `sharedPayment` — the resource isn't in this version.
- The **`as any` cast** bypassed TypeScript, so it compiled despite calling a non-existent method.

At runtime `stripe.sharedPayment` is `undefined` → `.grantedTokens` throws `TypeError: Cannot read properties of undefined (reading 'grantedTokens')` → caught → returns `SPT_INVALID` (401). This is the **only** `sharedPayment` call site, so it fires for **every** token.

**Consequence:** a *valid* SPT is rejected identically to an invalid one. The zero-onboarding loop's *payment* leg is broken even though the *discovery* (402) leg works.

### How this slipped through
- Earlier "SPT production-ready" assessments read the *code*, which looks complete.
- The acceptance probes tested **402 discovery** and **invalid-token → 401**, never a **valid SPT → 200 + charge** (no valid token was on hand).
- The `as any` cast hid the missing resource from the type checker.

## What to do

1. **Confirm the correct Stripe API for Shared Payment Tokens** in the current Stripe agentic-commerce / `2026-03-04.preview` surface — the resource name/path may differ from `sharedPayment.grantedTokens`.
2. **Upgrade the Stripe Node SDK** to a version that actually exposes that resource and supports `apiVersion: '2026-03-04.preview'`.
3. **Remove the `as any` cast** at `functions/index.ts:378` (and the same pattern in `functions/tracking/airtable.ts:574-575` if it touches SPT) so TypeScript verifies the resource exists. If it doesn't type-check without `as any`, the SDK still lacks it — don't re-cast.
4. **Clean up the error surface** (the old "follow-up #1"): on SPT failure, return a clean `SPT_INVALID` message — never echo the raw JS exception to the client.

## Acceptance criteria

- [ ] `npx tsc --noEmit` passes **without** `as any` on the `sharedPayment` call (proves the SDK has the resource).
- [ ] With a **real, valid test SPT**: `curl -H "Authorization: Bearer spt_<valid>" https://api.fodda.ai/v1/graphs` → **200**, request served, SPT charged, **no account required**. *(This is the test that was never run — it's the actual proof the value prop works.)*
- [ ] Invalid/malformed SPT → **401 `SPT_INVALID`** with a clean message (no raw exception text).
- [ ] 402 discovery unchanged (still advertises pricing + SPT).

## Out of scope

- The 402 discovery loop is already correct — don't touch it.
- A2A card spec-conformance is a separate, optional polish item (not this brief).

## CHANGELOG Entry

```
### Fixed
- SPT charging now functional: upgraded Stripe SDK to a version exposing the shared-payment-token resource (was stripe@22.1.0, which lacked it — every SPT, valid or not, failed validation). Removed the `as any` cast that masked the missing API. Cleaned SPT_INVALID error surface.
```
