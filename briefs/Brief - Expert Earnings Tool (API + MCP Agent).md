# Brief - Expert Earnings Tool (API + MCP Agent)

> **For:** API Agent (the earnings read) + MCP Agent (the `get_my_earnings` tool).
> **Split from:** the Onboarding-as-a-Connector initiative (Piers, 2026-07-09) — earnings is **post-onboarding account admin, not onboarding**. It shared the connector surface, not the lifecycle, so it was bundled into Step 8 and is now broken out so onboarding can ship without waiting on the billing-source question.
> **Status:** Partially built — needs **verification + a source correction**, not a from-scratch build.
> **Depends-on / align-with:** `Brief - 402 Zero-Onboarding for SPT`, `Brief MASTER - Agentic Access and Monetization` (the authoritative billing/payout mechanisms).

---

## 1. What this is (and isn't)
`get_my_earnings` answers, for a signed-in expert asking Claude: **"how much have I earned from Fodda?"** — i.e. **their own payout / self-use revenue-share balance**. A personal account figure.

**Do not confuse with** Fodda's *company/financial earnings research product* (`get_company_earnings`, `get_earnings_intelligence`, `get_earnings_divergence`) — that's public-company quarterly earnings as a research surface, unrelated to this.

## 2. Current state (already built, but drifted from source of truth)
- **API:** `GET /v1/analysts/me/earnings` exists (`Fodda API`, `Fodda/functions/v1/analysts.ts`, committed `1ad1b31`).
- **MCP:** `get_my_earnings` tool wired in `Fodda MCP/src/toolHandlers.ts`.
- **The problem:** the endpoint reads from Airtable table **`"Analyst Earnings"`**, falling back to **`"Token Log"`** — a *guess*. This **contradicts its own onboarding sub-brief**, which said "read from the mechanisms established in `Brief - 402 Zero-Onboarding for SPT` / `Brief MASTER - Agentic Access and Monetization` — do not invent a new earnings query." The implementation invented an Airtable read anyway.

## 3. The task
1. **Identify the authoritative source** for an expert's owed/earned balance — the SPT / self-use billing ledger (per the two monetization briefs), NOT a hand-maintained Airtable table. Confirm where expert self-use revenue-share is actually computed.
2. **Repoint `/v1/analysts/me/earnings`** at that source. Remove the `"Analyst Earnings"` / `"Token Log"` Airtable guess (or confirm one of those *is* the real, reconciled ledger — but the fallback-guessing pattern says it isn't).
3. Keep the MCP tool a thin wrapper; no logic change there beyond the endpoint contract.

## 4. Why this matters
An expert querying `get_my_earnings` and getting a **wrong** number (from an empty or unreconciled Airtable table) is worse than getting nothing — you'd be reporting an incorrect payout. Correctness of the source is the whole job here.

## 5. Acceptance
- `get_my_earnings` returns the expert's real owed balance, matching what the billing/payout system says.
- Source is the authoritative ledger, not an Airtable table that may not exist or reconcile.
- Verified for a real expert with actual self-use activity.

## 6. Open question
- **What IS the authoritative source** for expert self-use earnings today — an SPT ledger, Stripe, a computed field, or is it not yet tracked at all? Resolve this first; if earnings aren't actually being computed/persisted anywhere yet, that's a prerequisite, and `get_my_earnings` should return an honest "not yet available" rather than a fabricated zero.
