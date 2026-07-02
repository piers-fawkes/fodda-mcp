# Brief: Unify SPT Pricing on `typical_calls × $0.50` (single source)

**Date:** 2026-06-20
**From:** MCP Agent (Coordinator), on Piers's direction
**To:** API Agent
**Priority:** P1 — Correctness / pricing model

---

## The model (decided by Piers)

**One shared unit, per-channel rates.**

- The shared unit is **"typical calls per task"** — the existing `apiCallsCharged` values in `TOKEN_COSTS` (`functions/tracking/metering.ts`). One source of truth.
- Each channel converts that unit to dollars with its **own rate**:
  - **SPT (anonymous, cash, per-request): `$0.50`/call** ← **this brief**
  - Subscription overage: `$0.20`/call (within-plan = consumes included credits) — **UNCHANGED**
  - Wholesale / enterprise: ~`$0.040`/call — **UNCHANGED**
- So for any task: **price = typical_calls × channel_rate**. The `$0.50` constant is **SPT-only** — do not apply it to credits/overage or wholesale.

## The problem

`resolveEndpointPrice()` currently returns **standalone hardcoded SPT dollar amounts** that don't equal `typical_calls × $0.50`:
- `/v1/graphs` → $0.50, deep-dive → **$2.50 / $7.50** (live 402: `amount=250 / 750`).
- But `TOKEN_COSTS` says deep_research_light = 20, heavy = 30 → which at $0.50 should be **$10 / $15**.

Two divergent numbers. The model requires deriving everything from the one unit table.

## Changes

1. **Add an SPT-only rate constant**, named so it can't leak into other rails:
   ```ts
   const SPT_RATE_CENTS = 50; // SPT anonymous per-call rate ONLY — NOT credits/overage/wholesale
   ```
2. **`resolveEndpointPrice()` (the SPT path) returns `TOKEN_COSTS[task].apiCallsCharged × SPT_RATE_CENTS`.** Remove the hardcoded per-endpoint dollar figures (the $2.50/$7.50 etc.).
3. **Resulting SPT prices** — the 402 `amount` (cents) **and** the actual SPT charge both become:

   | Task | typical calls | SPT price | `amount` (cents) |
   |---|---|---|---|
   | raw single call (e.g. `/v1/graphs`) | 1 | $0.50 | 50 |
   | `standalone_supplemental` / `evidence` / `statistics` | 5 | $2.50 | 250 |
   | `topic_research` | 15 | $7.50 | 750 |
   | `brainstorm` / `url_as_prompt` | 15 | $7.50 | 750 |
   | `brand_intelligence` | 20 | $10.00 | 1000 |
   | `deep_research_light` (deep dive fast) | 20 | $10.00 | 1000 |
   | `deep_research_heavy` (deep dive comprehensive) | 30 | $15.00 | 1500 |

   **Note the change:** deep dive moves from the old `$2.50 / $7.50` to **`$10 / $15`**. ($0.50 single-call conveniently clears Stripe's $0.50 minimum.)
4. **Do NOT touch** the subscription credit/overage path ($0.20) or the wholesale rate ($0.040). Confirm `SPT_RATE_CENTS` is referenced only on the SPT branch.
5. **`GET /v1/research/pricing`:** return the unit counts (`apiCallsCharged`) **and** make the SPT dollar price derivable — either add a `spt_price_usd = calls × 0.50` per row, or expose a top-level `spt_rate_usd: 0.50` so MCP/App/Website all derive identically. Single source; dollars computed, never separately stored.
6. **Confirm the authoritative typical-calls set** (deep comprehensive = 30 → $15, per Piers). Where an old SPT price implied a different call-count (deep-dive did), the **call-count table wins**.

## Acceptance criteria (re-probe)

- [ ] Unauth 402 `amount` = `typical_calls × 50` for every endpoint — verify live: `/v1/graphs`→50, `/v1/research/deep-dive` fast→1000, comprehensive→1500, brand→1000, topic_research→750, supplemental→250.
- [ ] The actual SPT charge == the 402 `amount` for the same endpoint.
- [ ] Subscription overage still **$0.20/call**; wholesale still **~$0.040/call** — unchanged (grep confirms `SPT_RATE_CENTS` only on the SPT branch).
- [ ] `GET /v1/research/pricing` exposes units + a derivable SPT dollar price.

## Out of scope

- **Per-task SPT-into-MCP** (letting anonymous agents pay per orchestrated task via the MCP) — separate, larger build.
- Any change to subscription or wholesale **rates**.

## CHANGELOG Entry

```
### Changed
- SPT pricing now derives from a single source: price = TOKEN_COSTS[task].apiCallsCharged × $0.50 (SPT-only rate). Removed standalone per-endpoint SPT dollar figures. Deep dive reprices $2.50/$7.50 → $10/$15. Subscription ($0.20) and wholesale ($0.040) rates unchanged.
```
