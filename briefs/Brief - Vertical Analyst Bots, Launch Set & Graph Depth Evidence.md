# Brief: Vertical Analyst Bots — Launch Set & Graph Depth Evidence

**To:** Fodda MCP Agent (`mcp-agent`) · shareable as a product decision document
**From:** Claude
**Date:** 2026-09-17
**Type:** Product definition + launch set, evidence-led
**Status:** Launch set decided on live data. Publishing order gated on the portability test.
**Companion:** `Brief - Grok Bot Marketplace Offering Surfaces (MCP Agent).md` (the technical surface),
`.agents/workflows/launch-marketplace-bot.md` (the process)

---

## 1. Decision

Publish Fodda bots as **three shapes of entry point onto one layer**, not as separate products.
Every bot below points at the same MCP slug and shares one job specification. What differs is the
door the user comes through — which is how they are already thinking when they arrive.

| Entry point | Bot | The user's trigger |
|---|---|---|
| **Company** | Fodda Brand & Account Context Analyst | "I'm meeting / pitching / deciding about X" |
| **Category** | Fodda Retail · Technology · Beauty Analyst | "What's moving in my category" |
| **Event** | Fodda Earnings Context Analyst | "They just reported" |

The company door exists because **users do not know Fodda's taxonomy.** Someone preparing for a Nike
meeting should not have to decide whether that is Sports or Fashion, and plenty of accounts genuinely
span both. Forcing that choice at the front door is the friction that kills a first run.

The category doors exist because marketplace discovery is search, because scoped memory performs
better on this platform, and because a vertical listing surfaces the **named curator** behind the
graph — which a generic listing hides.

Overlap between doors is intended, not duplication.

---

## 2. The three verticals, and why

Measured against live Neo4j on **2026-09-17**. Freshness is trends with `freshnessDays <= 90`.

| graph | trends | fresh ≤90d | avg evidence/trend | articles |
|---|---:|---:|---:|---:|
| **retail** | 200 | 68 | 23.5 | 6,304 |
| **tech** | 140 | 38 | 17.4 | 1,376 |
| **beauty** | 47 | 14 | 20.7 | 640 |
| sports | 44 | 7 | 18.6 | 869 |
| food | 16 | 4 | 19.5 | 235 |
| travel | 15 | 6 | 13.1 | 206 |
| fashion | 11 | 5 | 23.4 | 201 |

**Retail** is dominant and not close — a third of its 200 trends are fresh, over a 6,300-article
evidence base. It launches first on any ordering.

**Technology** is a clear second on every measure.

**Beauty over Sports is the non-obvious call.** On raw trend count they are near-identical (47 vs
44), so volume alone would make it a coin flip. Beauty has **double the fresh trends** — 14 against
7. Sports is the stalest graph in the top four: half its trends have not moved in 90 days. For a bot
whose whole job is "what is moving," fresh trend count is the deciding metric, not total inventory.
Beauty also carries strong curator attribution (NielsenIQ / Tara James Taylor).

**Not yet: sports, food, travel, fashion.** Fashion is worth watching — the highest evidence density
per trend in the set at 23.4 — but 11 trends cannot carry a public bot. These need graph investment
before a listing, not a listing that exposes the thinness. Re-run this measurement before adding any
of them.

*All figures are a single snapshot. Re-measure before each launch decision; the ingestion pipelines
are active and the ranking can move.*

---

## 3. Shared job specification

Written once, instantiated by every bot above. Only the scope statement changes.

> Put a company, brand or category in expert-grounded market context — the shifts affecting it, the
> competitive moves around it, the evidence for and against the story, and what to ask next.

**Finished output contract**, identical across bots:

1. The relevant market or category shifts.
2. Why those shifts matter to the question actually asked.
3. Supporting evidence with links and dates.
4. Named companies or brands as concrete examples.
5. Contradictions, tensions or evidence against the hypothesis.
6. Strategic implications.
7. Confidence boundaries — including what is missing.

Point 5 is not optional. Returning only confirming evidence is the failure mode that makes an
expert-grounded product indistinguishable from a search wrapper.

**Attribution rule:** results are attributed to the named expert graph, never to "Fodda's graph."
"PSFK's Retail Graph identifies…" reads as authority; "our knowledge base says" does not. The
vertical bots exist partly to make this attribution visible.

---

## 4. What must be true before publishing

### Blocking for all bots

**Template portability, untested.** Whether a custom MCP connection survives a template copy is
still unknown. Secondary reports say it does not; that has not been verified. Run the copy test on
the Earnings Context Analyst (zero code, live slug) before packaging anything. It changes the
onboarding design, not the launch set.

### Blocking for Technology only

**One future-dated article.** The `tech` graph contains exactly one Article with
`published_at = 2029-02-13T00:00:00.000Z` — three years ahead. It is a single bad ingest, not
systemic (no other graph has any future-dated record), but it is the `max(published_at)` for the
whole graph, so anything surfacing "the latest" in tech shows a 2029 article. That is the kind of
detail that makes a public bot look broken on someone's first question.

Two parts, and the second matters more than the first:

1. Correct or remove the record.
2. Add an ingest-time guard rejecting `published_at` beyond a small tolerance from now. One bad row
   reached production because nothing checks this; the same gap admits the next one.

This is ingestion work, not MCP work — route part 2 to the owning ingestion repo.

### Blocking for Beauty and Technology, not Retail

**Tool descriptions.** Grok selects tools from descriptions, not names. `brand_tracker` could
plausibly mean mention-tracking, health-monitoring, metric comparison or context retrieval. Note the
ownership trap: `npm run build` syncs descriptions from the Airtable Offerings table before `tsc`, so
hand-edits in `toolHandlers.ts` are silently reverted. Coordinate with the existing P1 description
brief rather than duplicating it.

---

## 5. Publishing order

1. **Earnings Context Analyst** — zero code, live slug. Its real job is answering the portability
   gate. Whitespace besides: no standalone earnings bot exists in the marketplace.
2. **Brand & Account Context Analyst** — the flagship. Largest observed demand cluster, no taxonomy
   burden on the user, and it does not depend on any single graph being deep, so it ships while the
   vertical work proceeds.
3. **Fodda Retail Analyst** — the deepest graph, and where the packaging gets solved once.
4. **Technology and Beauty** — replication of solved packaging, after the tech date fix.

Verticals 5+ only when a re-measurement supports them.

---

## 6. Do not

- Do not publish a vertical bot for a graph that has not passed a fresh depth measurement.
- Do not promise contact data, buying committees, org charts, technology stacks, sentiment scores or
  distribution footprints. No authoritative source exists for any of them; that half of account
  research belongs to other connectors.
- Do not publish all seven verticals at once. Packaging is solved once and replicated; seven
  simultaneous listings is the thin-bot mistake in a new costume.
- Do not attribute results to "the Fodda graph" — always the named expert graph.
- Do not build wrapper tools before evaluation shows better descriptions could not fix routing.
- Do not treat marketplace listing counts as demand, or quote them without a crawl date.

---

## 7. What this does not decide

Marketplace copy, starter prompts and per-bot instructions are not written here — they depend on the
portability result, which determines whether instructions must also carry the connection step.

Recurring routines are excluded from the launch set. Grok routines run unattended, and the Base-free
daily call cap is bypassed entirely for accounts with a payment method — so a carded user with a
daily routine has no ceiling. A tracker-style product is gated on that decision, not on code.
