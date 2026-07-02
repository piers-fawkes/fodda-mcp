# Brief: Offerings Catalog (source of truth) + Earnings Registration + Overage→$0.50

**Date:** 2026-06-21
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda
**Priority:** Part A = **P1 (live mis-meter)**, Parts B & C = P2

---

## 0. Context

Pricing is now a **flat $0.50/call across all rails** (no customers yet → no migration risk). Subscriber discounts are deferred to a later `discount_pct` modifier on the Plan. We're standing up **one source of truth** for the offering catalog so every discovery surface (llms.txt, website pages, 402, A2A, MCP) is *generated*, never hand-copied. Canonical rate lives in code: `SPT_RATE_CENTS = 50` in `functions/tracking/metering.ts`; offering price = `TOKEN_COSTS[key] × $0.50`.

---

## Part A — Register `earnings_intelligence` (URGENT, live mis-meter)

The MCP's two earnings tools (`get_earnings_intelligence`, `get_earnings_divergence`) meter with `type: 'earnings_intelligence'`, but that is **not** a registered `InteractionType` — it's absent from `TOKEN_COSTS`/`VALID_METER_TYPES`. So earnings settlement currently either 400s (`INVALID_PARAMS`) or defaults wrong. It's billing incorrectly right now.

**Fix (3 edits, all in `functions/tracking/metering.ts` + the meter validator):**
1. Add `earnings_intelligence` to the `InteractionType` union.
2. Add `earnings_intelligence: 15` to `TOKEN_COSTS` (→ **$7.50**, leveled with `topic_research`; product decision by Piers — earnings is a multi-company/multi-source offering, not a single-call lookup).
3. Add `earnings_intelligence` to `VALID_METER_TYPES` in `functions/v1/research/researchRouter.ts:615`.

No MCP change needed — it already emits the code; once the API knows the type, both earnings tools bill $7.50 automatically.

**Verify:** `POST /v1/research/meter` with `type:'earnings_intelligence'` → charges 1500¢; `GET /v1/research/pricing` shows `earnings_intelligence: 7.5`.

---

## Part B — Move overage to $0.50

Overage (subscriber over monthly limit, card on file, `isOverage`) bills via **Stripe Meter Events**; the no-card path routes to **Lava PAYG**. The actual rate is **configured in the Stripe meter/price (dashboard)** and Lava — code only holds *display* strings.

1. **Stripe dashboard:** update the overage meter/price to **$0.50/call**. (This is the real money change.)
2. **Lava:** already updated to $0.50 by Piers — just confirm.
3. **Code display strings still saying $0.20 → $0.50:** `functions/index.ts` lines ~965, ~971, ~974, ~985, ~986, and `pricePerCall: 0.20` (~999); plus the `$0.20` references/comments in `functions/tracking/lava.ts`. (The MCP-side strings are already fixed and deployed.)

**Verify:** an overage call bills $0.50 on the Stripe meter; the 403 PLAN_LIMIT_EXCEEDED payload and all messages read $0.50.

---

## Part C — Offerings catalog as the single source of truth

### C1. Airtable `Offerings` table (new)

One row per offering/tool. (Plans table already has `Price Per Call = $0.50`; add `discount_pct` there later — out of scope now.)

| Column | Type | Notes |
|---|---|---|
| `key` | text | joins to `TOKEN_COSTS` (e.g. `brand_intelligence`) |
| `kind` | single-select | `offering` / `tool` / `addon` |
| `display_name` | text | "Brand Intelligence" |
| `description` | long text | one-liner for 402 / A2A / cards |
| `typical_calls` | number | for the parity check |
| `published_price_usd` | currency | **settable**, defaulted to `typical_calls × 0.50` (lets us go value-based later with a cell edit) |
| `composed_of` | text | endpoints/tools it orchestrates (offerings only) |
| `category` | single-select | grouping/SEO |
| `marketing_copy` / `seo_blurb` | long text | landing page + JSON-LD |
| `slug` | text | page URL (e.g. `brand-intelligence`) |
| `is_marquee` | checkbox | gets a landing page |
| `status` | single-select | `live` / `beta` / `hidden` |

### C2. Seed data (at $0.50/call)

**Marquee offerings (`is_marquee` ✓):**
| key | calls | price | slug |
|---|---|---|---|
| brand_intelligence | 20 | $10.00 | brand-intelligence |
| deep_research_heavy | 30 | $15.00 | deep-research |
| deep_research_light | 20 | $10.00 | deep-research-fast |
| topic_research | 15 | $7.50 | topic-research |
| earnings_intelligence | 15 | $7.50 | earnings-intelligence |
| expert_agent | 5 | $2.50/turn | expert-consult |

**Other offerings:** brainstorm 15→$7.50 · url_as_prompt 15→$7.50 · weekly_tracker 20→$10 · upload_compare 20→$10 · research_stream/chat 3→$1.50
**Tools:** standalone_supplemental/evidence/statistics 5→$2.50 · search/url_context 1→$0.50
**Add-ons (free):** visual 0 · admin 0

### C3. Catalog endpoint

Extend `GET /v1/research/pricing` (or add `GET /v1/offerings`) to return the full catalog read from the Airtable `Offerings` table — `key, kind, display_name, description, published_price_usd, typical_calls, slug, composed_of, category, status` — so the website, llms.txt, 402, and A2A all consume **one** endpoint. Cache it (don't read Airtable per request); the billing path keeps reading `TOKEN_COSTS`, not this.

### C4. Parity check (the weld — this is what makes drift impossible)

A test (CI) or boot-time assertion that fails on any of:
1. `published_price_usd` ≠ `TOKEN_COSTS[key] × SPT_RATE_CENTS/100` for every offering (catches a fat-fingered Airtable price).
2. Any `key` in the Airtable catalog missing from `TOKEN_COSTS`, or vice-versa.
3. **Every MCP `queryTypeCode` exists in `TOKEN_COSTS`** — this is the check that would have caught the earnings bug. (The current set: brand_intelligence, topic_research, brainstorm, url_as_prompt, standalone_supplemental, earnings_intelligence, deep_research_light/heavy.)

---

## Verify (all parts)
- earnings meters $7.50; pricing endpoint lists it.
- overage bills $0.50 (Stripe meter) and all strings read $0.50.
- `/v1/offerings` (or extended `/pricing`) returns the full catalog from Airtable.
- parity check is green and **fails** if you intentionally break a price or add an unmapped queryTypeCode.
