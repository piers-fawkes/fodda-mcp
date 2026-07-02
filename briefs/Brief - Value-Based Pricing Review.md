# Brief: Value-Based Pricing Review

**Date:** 2026-06-20
**From:** MCP Agent (Coordinator)
**To:** Piers (Product)
**Priority:** P2 — Strategy

## 1. Thesis

Fodda is under-capturing value because it prices its most differentiated product as if it were its least differentiated one. The orchestrated MCP/A2A path is not "the raw API bundled" — it is a finished answer that silently fans out to PSFK editorial framing, analyst personas, and curated supplemental sources a direct-API agent would never know to call or be able to reassemble. That makes it a premium deliverable, yet today it is denominated in raw API-call counts anchored to the same ~$0.20 unit as the ingredient. The fix is structural, not a percentage bump: separate the *ingredient* (raw API/SPT, priced per call) from the *answer* (orchestrated task, priced per outcome), charge orchestrated work as a single per-task settlement, and — critically — extend that per-task settlement to anonymous agents via SPT-through-MCP so the buyer most willing to pay machine-speed for a finished answer can finally buy one. Value, not cost, sets the levels; this brief sets the structure and hands you the dials.

## 2. The Value Ladder

Three rungs, three jobs, three pricing logics. The error today is that rung 1 and rung 2 share a price anchor.

**Rung 1 — Raw API / SPT (the ingredients).** A direct-REST agent gets graph rows. It must already know which of the supplemental sources to call, in what combination, and assemble the result itself. This is a genuine commodity-adjacent product and should be priced *per call* — SPT at the $0.50 floor for one-shots, plan overage at ~$0.20. Its strategic job is to be a low-friction *taste*: a zero-onboarding 402 → single answer that demonstrates quality and creates a reason to upgrade. It should never be the headline.

**Rung 2 — Orchestrated MCP / A2A (the full meal).** This is the product. One task fans out to N internal calls (billed 0 under the HMAC/Option C gate) plus curated source selection, enrichment, editorial role-tagging, analyst-persona synthesis, and citation-ready attribution — then settles as *one* meter debit. A direct-API agent literally cannot assemble this deliverable; the routing logic *is* the product. It should be priced *per outcome* (a brand intelligence report, a deep research synthesis), explicitly decoupled from the per-call rate, and deliberately set *above* the cost of crudely reconstructing it from raw calls. This is where the under-capture lives and where the value-based uplift belongs.

**Rung 3 — Enterprise / Wholesale (the kitchen).** Contract-grade access with PSFK's name behind it: editorial credibility, breadth, reliability, attribution, ~$80k/yr floor. The open question here is whether the ~$0.040/call wholesale rate is an *ingredient-only* rate, with the orchestrated answer priced separately even at scale — otherwise a platform partner can resell your finished answer at retail and pocket the exact premium you created.

The principle running through all three: **price the row as an ingredient, price the answer as a deliverable, and never let them anchor to the same number.**

## 3. Why Per-Call SPT Is the Wrong Unit for Orchestrated Work

SPT today is anonymous, per-call, and direct-REST only. Two structural facts make per-call SPT actively value-destroying for orchestrated work:

- **The $0.50 floor.** SPT was raised from $0.25 to $0.50 to clear Stripe's USD minimum. There is no sub-$0.50 product on this rail — fine for premium single items, but it means per-call granularity is already coarse.
- **The per-PaymentIntent fee.** Stripe takes ~2.9% + ~$0.30 *per charge*. A 10-call brand audit billed as 10 SPT charges = $5.00 with ~$3 eaten by fixed fees. The *same* audit as ONE per-task SPT charge of [PLACEHOLDER] incurs a single ~$0.30 fee — negligible. Per-call SPT only makes economic sense for genuine one-shots.

**The fix — per-MCP-request (per-task) SPT (Input 1).** Let a cold/anonymous agent connect to the MCP with an SPT and pay *once* per orchestrated task: the meter charges the SPT instead of debiting credits. This is exactly the per-task settlement that *already exists* for subscribers — the only missing piece is letting money, not credits, settle that single meter event.

**How it works:** agent attaches SPT inbound → MCP runs the orchestrated task (internal fan-out billed 0) → meter fires one charge against the SPT at the per-task price quoted *before* spend.

**What it takes to build:** accept SPT inbound on the MCP (today the MCP requires an API key) + wire the meter to charge an SPT instead of debiting credits. Net-new, but it sits on top of the per-task settlement mechanic that's already live.

**How it coexists with subscriptions:** SPT is the anonymous, no-account, pay-per-event lane priced at a *convenience premium*; subscriptions are identified, cheaper per unit, and reward commitment. As long as per-task SPT sits clearly *above* the subscriber-equivalent per-task price, heavy users self-select into subscriptions and SPT stays the on-ramp + anonymous/spillover lane. They don't compete for the same buyer.

**One sequencing guardrail:** the MCP↔API billing identity must be settled (the MCP should auth with a trusted service key + user id, not the user's key marked "mcp-orchestrated," or the trust gate can downgrade to per-call *and* fire the meter = double-charge). Lock that correctness gate green *before* layering a new payment rail on top.

## 4. Capturing the Orchestrated Premium (Input 2)

The premium is real and confirmed in the product: orchestrated tasks carry the `includesSupplementals` flag, auto-select curated institutional sources, absorb the synthesis cost, and apply PSFK editorial framing and role-tagged, attributed citations. The problem is that none of this is *legible* at the moment an agent decides what to buy — and what isn't legible doesn't get paid for.

**Three moves to capture it:**

1. **Reframe the unit from calls to outcomes.** Stop expressing orchestrated tasks as "20 calls ≈ $4." Name the deliverable ("Brand Intelligence Report — $[PLACEHOLDER]") and quote a flat price. The call-count stays underneath for plan accounting; the agent sees the answer. Leaving the call-multiple framing in place permanently caps perceived value at N × the call rate and makes every future uplift read as "you raised the call price."

2. **Use raw-as-taste → upsell.** Keep the $0.50 single-source 402 answer as the deliberate sample, but instrument every raw response with a one-line upgrade pointer: *"This is a single-source answer. For a curated multi-source report on this topic, call the orchestrated <task> (flat price $[PLACEHOLDER])."* This converts the cheap path from a competing product into the top of the premium funnel — but the upsell path must be live *before* any price rise, or top-of-funnel trial dies with it.

3. **Make value machine-legible at the 402/discovery layer.** Today the 402 is endpoint-aware on *price* ($0.50 / $2.50 / $7.50) but says nothing about what the orchestrated path *adds*. Add a value-contrast block — *"includes auto-selected institutional sources, analyst synthesis, and citation-ready attribution — not available on raw per-call access."* 2026 agents evaluate price against budget before paying; a premium price gets auto-declined unless the differentiation is visible. Keep the framing value-oriented ("PSFK analyst synthesis") rather than a literal source list, so you don't hand competitors the recipe.

**Anti-reconstruction (keep the premium defensible):** the moat holds only if raw fan-out is genuinely a worse deal — so keep the *source-selection routing* (which sources, in what combination) server-side and off the raw API; reserve editorial role-tagging, formatted citations, and synthesis for the orchestrated path; and lean on the Stripe-fee math (orchestrated = one charge vs N raw charges each eating a fixed fee). If a determined agent can reassemble ~80% from exposed endpoints, the premium erodes — the gap must be maintained in *output quality*, not just asserted in price.

## 5. Recommended Packaging

All three options keep the existing one-charge-per-task mechanic and leave dollar levels as your dials. They trade simplicity against value capture.

**Option A — Re-tier without new build (lowest risk, fastest).**
Hold per-call SPT at $0.50. Decouple orchestrated per-task prices from the call rate and re-express them as outcome-named tiers: *Quick Answer* (evidence/statistics/supplemental), *Strategic Answer* (brand intelligence, topic research), *Deep Dive* (deep research, weekly tracker), each a flat price the agent quotes before spending. Hold current credit prices for existing subscribers (avoid churn); price the *same tasks higher* only for anonymous/SPT and platform-resale access where there's no relationship to protect.
*Levels:* Quick $[PLACEHOLDER] / Strategic $[PLACEHOLDER] / Deep $[PLACEHOLDER]. No new engineering. Captures the framing premium immediately.

**Option B — Hybrid five-rail (recommended).**
A's outcome reframe, *plus* the net-new per-task SPT lane:
1. **Free taste** — one orchestrated task or a small monthly cap, email-gated, so the cold agent experiences the *orchestrated* premium, not just a raw read.
2. **Per-call SPT** — $0.50 genuine one-shots only; orchestrated tools refuse/auto-bundle per-call payment.
3. **Per-task SPT via MCP** — anonymous orchestrated work, priced at a convenience premium over the subscriber-equivalent (placeholder multiple: subscriber task price × [PLACEHOLDER, e.g. 1.3–1.7]).
4. **Credits / subscriptions** — identified repeat users, per-task below SPT.
5. **Wholesale / enterprise** — raw-call wholesale gated to *ingredient* resale; orchestrated resale via a per-task/revenue-share construct, not the $0.040 rate.
*Why recommended:* it captures the premium (A), opens the highest-value product to the most-willing machine buyer (Input 1), protects subscriptions structurally via the convenience premium, and closes the wholesale value-leak — without depending on a single dial being perfect.

**Option C — Productized good/better/best ladder (most ambitious).**
B's structure expressed as a single clean depth ladder the agent reasons over: *Raw single-source* (taste) → *Orchestrated Task* (the hero/default in discovery) → *Deep Synthesis / full dossier* (top tier priced well above the deep-dive band, since the deliverable is a curated analyst output). Make the *middle* tier the default so the cheap call reads as "sample" and the deep dive as "when you need the full report."
*Levels:* a small menu of round, quotable numbers — Light $[PLACEHOLDER] / Standard $[PLACEHOLDER] / Heavy $[PLACEHOLDER] — not fifteen call-derived figures.

**Recommendation: Option B.** It is the coherent middle — it does everything A does, adds the one structural unlock (per-task SPT) that monetizes the segment most willing to pay, and builds the anti-cannibalization in by design. C is the right *destination* once per-task SPT is proven; A is the right *first step* if engineering bandwidth is constrained this cycle.

## 6. Decisions for Piers

These are the calls only you can make — the brief sets structure, you set strategy and numbers.

1. **Positioning.** Do you market two explicit SKUs ("Raw Access" vs "Orchestrated Reports"), or one catalog with a premium tier inside it? This shapes docs, the pricing page, and the 402.
2. **Target-segment priority.** Which buyer do you optimize for first — anonymous machine agents (argues for building per-task SPT now), prosumers-via-Claude/ChatGPT (argues for holding their prices and growing the flywheel), or enterprise (argues for the wholesale/resale construct)? You can't lead with all three.
3. **Build SPT-into-MCP? (reverses prior decision D1.)** The earlier default was "formalize the split — SPT = direct-API only." This brief argues to reverse it. Confirm the reversal *and* its sequencing relative to the billing-stability work.
4. **Price points.** The value anchors only you can supply:
   - The orchestrated per-task tier levels (the value reference is the *analyst hours displaced*, not a competitor API price).
   - The per-task SPT convenience premium — premium over credits (capture no-commitment convenience) or parity (drive adoption)?
   - How much uplift on prosumer-via-MCP tasks before it suppresses the adoption flywheel.
   - Whether the orchestrated/wholesale resale construct is flat per-task, revenue-share, or enterprise minimum-commit.
5. **Free-tier scope.** Does the free Base plan grant access to the orchestrated path at all, or is the premium answer gated to paid/SPT only? (Giving away the highest-value product for free undercuts the whole structure.)
6. **Differentiation defensibility & legibility.** Are you comfortable surfacing a machine-readable "why this costs more" block in the 402 — accepting it also tells agents/competitors roughly what the moat is — and confident the orchestrated bundle can't be cheaply reassembled from exposed endpoints?

## 7. Sequencing

**Now (correctness + comms, no new build).**
- Ship the $0.50 SPT documentation update so the discovery/402 amounts, docs, and any published rate are in lockstep (anonymous agents must see the price they'll be charged).
- Lock the MCP↔API billing-identity gate green (trusted service key + user id; no per-call downgrade + meter double-fire). *Correctness precedes monetization.*

**Next (per-task pricing clarity, mostly framing).**
- Reframe orchestrated tasks from call-counts to outcome-named tiers (Option A) in agent-facing copy, keeping the meter's call accounting underneath.
- Add the value-contrast block to the 402/discovery and the one-line raw→orchestrated upsell pointer — get the upsell funnel live *before* any price rise.
- Set the orchestrated per-task levels (hold for subscribers; price up anonymous/resale).

**The bigger bet (net-new build).**
- Build per-task SPT-through-MCP (Input 1): accept SPT inbound on the MCP + meter-charges-an-SPT once per task. Sequence *after* the anti-double-billing gate is verified, price at a convenience premium over credits, and position it as the flagship monetization of the anonymous-agent segment.
- Then, once that's proven, productize the good/better/best ladder (Option C) and close the wholesale orchestrated-resale construct.

The throughline: **fix the billing identity, reframe the unit from calls to answers, then open the answer to anonymous money.** Each step captures value on its own; together they reprice Fodda from an ingredient supplier to the premium-answer business it already is under the hood.
