# Brief — Widget render guard + niche-query ranking

**From:** Piers (2026-08-24)
**Owning repo / agent:** Fodda MCP — `mcp-agent`. No API changes.
**Execution handle:** `/build-from-brief briefs/brief_widget_guard_and_niche_ranking.md`
**Status:** ready to build. Polish, not a blocker — Neil's link is already unblocked. Ship before his second week of use.

## Context

Live run of the Neil Carty collectibles query on `fodda-mcp-00481-b7x` (08-24): the prose closing block is clean (suggest-backed stats line, no mega-trend brands, no cost language), but the **widget** and the **row ranking** still undercut the answer:

1. Widget brand chips show `PlayStation / Hermès / Louis Vuitton / Coach` on every card — the first entries of a 734-brand mega-trend roster. The prose layer already excludes these (1.46.37 `brand_count > 30` guard); the widget does not.
2. Widget "Market" section rendered a junk stat card: **"Gasoline Stations $0.0B +0.0% MoM"** — a zero-value Census sub-category with no relevance to the query. `buildCensusHtml` (`src/searchTemplate.ts:102-121`) renders whatever it's handed, including zeros.
3. Top-3 rows are the generic retail mega-trends (*Experiential Loyalty*, *Retail as a Destination*, *Unified Commerce*, relevance 1.364 via signal_score-200 boost). The actually-on-point trend (*Mass-Market Brands Ship Premium Collector Editions with Booster/Variation Mechanics*, sector `Collectibles|Toys & Hobby`, relevance 0.644) sits at #4 and misses a `limit: 3` demo. The widget then headlines "Key signal: Experiential Loyalty".

## What to build

### 1. Widget brand-chip guard (`src/searchTemplate.ts`)
- Reuse the 1.46.37 logic (share the helper from `src/coverageRelevance.ts`; do not duplicate): for any row with `brand_count > 30` (or `brandNames.length >= 10` when absent), render NO brand chips for that card. Also apply the curator/publisher exclusion set to whatever chips remain.
- Same rule for the "Companies / Brands appearing across these trends" pill section: build it only from rows that pass the guard; if none pass, omit the whole section (no header, no empty grid).

### 2. Stat-card emission guard (`src/searchTemplate.ts:102-121`)
- Never emit a stat card whose value is 0/undefined or whose MoM is the only content. If the Census/supplemental payload has no non-zero, query-relevant series, omit the "Market" section entirely — mirror the clean-omit behaviour of the brand-tracker financial snapshot (1.46.28).
- Sources footer must list only sources that actually contributed a rendered element (no "Census Bureau" pill when the Census section was omitted).

### 3. Niche-query ranking tier (`src/toolHandlers.ts` fan-out sort, ~the 1.46.34 on-topic-above-off-topic sort; `src/coverageRelevance.ts` helpers)
- Narrow change, NOT a signal-score recalibration: add one tier above the existing sort — rows with a **direct token match** between query content tokens and the row's `trendName`/`sectorNames`/`trendSlug` (e.g. "trading cards" ↔ `Collectibles|Toys & Hobby`, "collector") rank above rows that are merely semantically adjacent, within the existing per-graph diversity caps.
- The widget's "Key signal" line and card order follow the re-sorted rows, so a niche query headlines its niche match.
- Explicitly out of scope: changing `signal_score`, relevance computation, the 0.65 floor, or any graph-side scoring.

## Where to register

`src/searchTemplate.ts`, `src/toolHandlers.ts`, `src/coverageRelevance.ts` (shared guard helper export), tests, `package.json` bump, `CHANGELOG.md` with revision + probes. One bible line (API repo `docs/bibles/system_clarifications.md`): widget renders obey the same brand/stat guards as prose; niche token matches outrank mega-trend boosts.

## Definition of Done

1. Neil's query live: top-3 includes the Booster/Variation collectibles trend; widget shows no PlayStation/Hermès chips, no zero-value stat card, and the "Key signal" line names an on-topic trend. Paste widget HTML excerpt + row order.
2. The three 1.46.29 regression probes AND a generic broad query ("retail trends 2026") render unchanged top-3 and intact widgets — the new tier must not reorder queries with no direct niche tokens. Paste.
3. Unit tests: guard helper shared (one implementation), stat-card omission case, ranking-tier case. All suites green.
4. **Commit before/with deploy** — git HEAD must match the live revision when this brief closes.

## Do Not

- Do NOT recalibrate signal_score, relevance scoring, or search floors.
- Do NOT redesign the widget or touch the Fodda widget design tokens.
- Do NOT reintroduce any cost/price element anywhere (data figures like market sizes are fine; prices are not).
- Do NOT duplicate the brand-guard logic — share it.

## Files-changed (expected)

`src/searchTemplate.ts`, `src/toolHandlers.ts`, `src/coverageRelevance.ts`, `src/test_next_moves.ts` (or a new `src/test_widget_guards.ts`), `package.json`, `CHANGELOG.md`.
