# Brief: Pricing Profitability Proposal — Fixed-Bundle Pricing & Margin Protection

**Date:** 2026-06-19
**From:** MCP Agent
**To:** Piers (Product) — for approval
**Priority:** P1 — High
**Context:** Our MCP charges a **fixed bundle of API calls per tool call** (e.g. a brand intelligence audit = a flat 20 API calls), settled once per query via `/v1/research/meter`, which recomputes the cost server-side and ignores the client amount. The model is correct and predictable — but the price *levels* are inherited and have never been checked against the actual cost of the work, which varies a lot because several tools fan out to many graphs/sources and some absorb upstream Gemini cost. This proposal frames the profitability decision and lists exactly what I need from you to set numbers. **No price levels change until you approve.**

---

## Decision (2026-06-19) — keep the basics, don't model on cost

Piers's call for now:
- **Keep the current fixed-bundle model and bundle sizes as-is.** No tool reprice today.
- **Per-API-call rate stays $0.20** (authenticated / PAYG / plan overage) and **$0.25** (SPT, direct-API).
- **We are NOT pricing on cost.** The cost-margin modeling below (Options A–C, the §5 cost inputs, the AI Studio usage pull, the discount cliff) is **shelved** — retained only as reference.
- **Open product view:** Piers considers the current offering **underpriced / lacking value**. The next pricing move is a **value-based pricing & packaging review** (what the tiers are worth and how they're bundled), explicitly *not* a cost exercise. **Parked, to revisit.**

Everything below is background for that future value review; it does not gate any work today.

## 1. Objective

Keep the predictable fixed-bundle model (good for users and agents) while guaranteeing **every tool is priced above its worst-case cost**. Decide whether to (a) keep flat pricing and protect margin by capping fan-out, (b) add a variable surcharge for heavy queries, or (c) reprice specific tools — and give me the cost inputs to set the numbers.

## 2. Current price table & retail value

Anchor: 1 API call ≈ **$0.20** retail (Lava PAYG / plan overage); SPT direct-API = **$0.25**.

| Tool (query type) | API calls | ≈ Retail | Fans out to | Absorbs Gemini? |
|---|---|---|---|---|
| `search_graph` (topic_research) | 15 | $3.00 | N relevant graphs | no |
| `brand_tracker` (brand_intelligence) | 20 | $4.00 | Cypher + up to **8** graphs | no |
| `deep_research_topic` light / heavy | 20 / 30 | $4 / $6 | up to **8 / 15** graphs | **yes** |
| `read_url` (url_as_prompt) | 15 | $3.00 | 1 URL | **yes** |
| `get_supplemental_context` | 5 | $1.00 | up to **15** external sources | partial |
| `brainstorm` | 15 | $3.00 | — | yes |
| `upload_compare` / `weekly_tracker` | 20 | $4.00 | — / per run | mixed |
| `get_evidence` / `search_statistics` | 5 | $1.00 | — | no |
| `research_chat` / `expert_agent` / `earnings_intelligence` | 3 / 5 / 5 | $0.60 / $1 / $1 | — | no |
| `generate_visual` / admin | 0 | free | — | no |

## 3. Where the margin risk is

> ⚠️ **The Gemini cost is currently discounted — do NOT price on it.** Today's discounted rate makes every Gemini-absorbing tool look profitable; the moment the discount ends, `deep_research`, `brainstorm`, and `read_url` can flip negative at the same fixed price. **Set the margin floor on the undiscounted (list) Gemini rate** and treat the discount as temporary cushion, not the pricing basis. We also need the discount's expiry date to know when (or whether) to reprice.

The price does **not** scale with fan-out, so the highest-fan-out + Gemini-absorbing tools are the exposure:

1. **`get_supplemental_context` — 5 calls ($1.00) for up to 15 external source fetches.** If each external fetch + parse has real cost, this is the thinnest line on the board. Likely the first to go negative.
2. **`deep_research_topic` heavy — 30 calls ($6.00) for up to 15 graphs + a large Gemini generation it absorbs.** A worst-case heavy run (max graphs, long synthesis) is the biggest single-query cost; $6.00 may not cover it.
3. **`brand_tracker` — 20 calls ($4.00) for Cypher + up to 8 graphs.** No Gemini, so lower risk, but still 8× fan-out at a flat price.
4. **`read_url` / `brainstorm` — absorb Gemini at $3.00.** Bounded (1 URL / no fan-out) so lower risk, but worth a margin check.

The unknown in every case is **our actual cost per graph search and per Gemini generation** — which only you have.

## 4. Options

**Option A — Keep flat pricing, protect margin by capping cost (recommended).**
Keep every published price as-is (max predictability), and ensure cost can't exceed it:
- Cap fan-out per tool (`maxGraphs`, max supplemental sources) so worst-case cost is bounded under the fixed price.
- Set a **margin floor**: each tool's price ≥ worst-case cost ÷ (1 − target margin). Reprice only the tools that fail the floor (likely `get_supplemental_context`, possibly `deep_research_heavy`).
- *Pro:* users/agents keep a simple, quotable price. *Con:* a capped heavy query returns slightly less breadth.

**Option B — Add a variable surcharge for heavy queries.**
Flat base price + a per-graph (or per-source) surcharge above a threshold (e.g. deep research base 20, +2 calls per graph beyond 8).
- *Pro:* price tracks cost; no capping. *Con:* breaks "one flat number" — the agent can't quote an exact price before running, and metering gets more complex.

**Option C — Reprice levels only.**
Leave the model alone; just move numbers to hit target margin (e.g. supplemental 5 → 8, deep_research_heavy 30 → 40).
- *Pro:* simplest to ship. *Con:* doesn't fix worst-case blow-outs from unbounded fan-out.

**My recommendation: A, with a touch of C** — keep flat pricing, cap fan-out, and reprice only the tools that fail the margin floor. It preserves the "this audit will cost ~20 API calls" promise (which the MCP brief adds as a pre-spend quote) while closing the loss-making cases.

## 5. What I need from you to set numbers  _(shelved per Decision above — for a future value review, not today)_

I can't set prices without these — please fill in (rough is fine):

| Input | Why | Your number |
|---|---|---|
| Our cost per **graph search** (Cypher + vector) | Base unit of fan-out cost | ? |
| Gemini cost per **deep_research** run (avg + worst-case, light & heavy) — at **both** the current discounted rate **and** the list/undiscounted rate | The absorbed cost; we price on the list rate | ? |
| **Discount expiry date** (and the discount %/delta vs list) | When the margin math must switch to list cost — the "cliff" date | ? |
| Current **28-day Gemini spend** (AI Studio → Usage page) | Sanity-checks actual absorbed cost against query revenue | ? |
| Cost per **external source fetch** in `get_supplemental_context` | The thin-margin tool | ? |
| **Target gross margin %** per query | The floor everything must clear | ? |
| Current **plan price points** + included API calls | Confirms the $/API-call value (is it really $0.20?) | ? |
| Observed **avg & p95 fan-out** (#graphs) per tool, if you have telemetry | Turns "worst case" into "realistic worst case" | ? |

## 6. Proposed margin formula (once data is in)

For each tool: `min_price_in_calls = ceil( worstCaseCostUSD / (1 − targetMargin) / pricePerCallUSD )`. Any tool whose current price < `min_price_in_calls` is repriced up to it (Option A/C); any whose worst-case cost is unbounded gets a fan-out cap (Option A).

## 7. Decisions for you

- **(DP-1)** Pick the model: **A (recommended)**, B, or C.
- **(DP-2)** Confirm the $/API-call anchor ($0.20 retail / $0.25 SPT) so margin math is right.
- **(DP-3)** Provide the §5 cost inputs (or point me at where they live) so I can produce the repriced table for sign-off.
- **(DP-4)** Confirm we price on the **undiscounted** Gemini cost (discount = temporary cushion), and give the discount's **expiry date** so I can flag the margin cliff and a reprice trigger.

## 8. Downstream once approved

The actual number changes land via the existing sub-briefs (single source of truth on the API side, MCP price table synced + pre-spend cost quote) — this proposal only sets the levels and the model. No code prices change until DP-1..3 are answered.

## 9. CHANGELOG Entry (when levels are approved)

```
### Changed
- Pricing: introduced per-tool margin floor and fan-out caps to guarantee every query is priced above worst-case cost (model: [A/B/C]); repriced [tools] accordingly.
```
