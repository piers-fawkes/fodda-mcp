# Brief: Unified Source Routing — Research That Traverses the Whole Database

## Objective
Make research workflows (`deep_research_topic`, and by extension analyst consults) traverse the full data estate — expert graphs, supplemental/institutional data, earnings-call intelligence — instead of defaulting in practice to PSFK-heavy graph results.

## Context
Diagnosed 2026-07-01. There is **no hardcoded PSFK preference**. Graph selection (`MCP src/catalogCache.ts:766–883`, `getRelevantGraphs()`) is keyword scoring over graph metadata with a tier-diversity guarantee (`ensureTierPresent('report'/'static_expert')`, lines 860–878). PSFK wins structurally:

1. **Metadata richness** — PSFK domain graphs carry far more topics/routing_keywords than expert graphs, so they match more queries (scoring weights topics/domain/routing_keywords 2× description, lines 672–722).
2. **Index depth** — PSFK graphs have 100–500+ trend nodes vs. 20–150 for many expert graphs.
3. **Freshness bonus** — living graphs get +0.05; PSFK domain graphs are the living ones.
4. **The bigger cause: supplemental and earnings are not in the research path at all.** `deep_research_topic` (`MCP src/toolHandlers.ts` ~2530–2700) runs plan → search graphs → analyze → synthesize; only graphs are searched. `get_earnings_intelligence` and `get_supplemental_context` are separate opt-in tools; the system prompt lists supplemental as a manual later step. There is no choice point where earnings competes with graphs — it simply isn't a candidate.

## Design Constraint (Piers, 2026-07-02): PSFK stays primary
PSFK is the best data on the platform — do NOT reduce its power. All changes are **additive**: graph selection and scoring stay exactly as they are; earnings and supplemental sources are added as *extra* candidates that never displace graph slots. If a query currently returns 8 PSFK-heavy graphs, it still returns those 8 — plus an earnings snapshot when a public company is in play.

## Changes Required

### Phase 1 — Metadata enrichment: DEFERRED (per constraint above)
~~Audit routing metadata for every non-PSFK graph...~~ Raising other graphs' keyword scores would shift ranking away from PSFK — parked until there's eval evidence that specific graphs are being missed on queries they should win. Revisit per-graph, not wholesale.

### Phase 2 — `getRelevantSources()` in `MCP src/catalogCache.ts`
Extend (don't replace) `getRelevantGraphs()` with a unified selector returning mixed source types:

```typescript
type SourceCandidate =
    | { kind: 'graph'; graphId: string; score: number }
    | { kind: 'earnings'; ticker?: string; sector?: string; score: number }
    | { kind: 'supplemental'; category: string; score: number };  // macro, demographics, etc.

export function getRelevantSources(query: string, opts?): SourceCandidate[]
```

- **Earnings candidate** when the query names a public company (reuse the brand/ticker matching already built for executives in `Fodda API functions/v1/analysts.ts:748–773`), a sector, or earnings-shaped terms ("guidance", "margins", "CFO", "quarterly").
- **Supplemental candidates** from a static category → keyword map (macro/FRED, demographics, crime, air quality, etc. — mirror the supplemental catalog).
- Keep graph scoring untouched; earnings/supplemental compete on the same 0–1 scale with their own keyword lists.
- Keep tier diversity, add: if an earnings/supplemental candidate scores ≥ threshold it is always included (they're cheap single calls compared to N graph searches).

### Phase 3 — Wire into `deep_research_topic` (`MCP src/toolHandlers.ts` ~2560)
Replace the `getRelevantGraphs(query)` call with `getRelevantSources(query)`. In Phase-2 search fan-out, dispatch by kind:
- `graph` → existing `/v1/graphs/{id}/search` (unchanged)
- `earnings` → `/v1/supplemental/earnings/snapshot` (existing endpoint behind `get_earnings_intelligence`)
- `supplemental` → `get_supplemental_context` job; because it's async, fire it first and collect at synthesis time (or restrict to categories with sync endpoints in v1)

Add the results to `graphContext` as distinct blocks (`earningsResults`, `supplementalResults`) and extend `buildResearcherInstruction()` so the synthesis attributes them ("per Q1 earnings calls…", "per FRED…"). Citation phase includes source type.

### Phase 4 — System prompt & analyst reuse
- Update MCP `src/systemPrompt.ts` CompleteResearchWorkflow: supplemental is no longer a manual step — note that `deep_research_topic` now auto-includes earnings/supplemental when relevant, and standalone tools remain for targeted pulls.
- Once Brief Agentic Analysts Phase A ships, expert agents inherit this for free — their MCP `deep_research_topic` calls traverse everything.

### Out of scope (explicitly)
- Re-weighting or removing the +0.05 living-graph bonus — revisit only if Phase 1+2 don't move the mix.
- Embedding-based routing (replacing keyword scoring) — bigger lift, measure first.

## Instructions & Discovery
Unified routing fails silently if calling agents keep hand-chaining tools the old way. Two description edits and one prompt change prevent that:

### 1. Reposition the tool trio (MCP `src/toolHandlers.ts` + `tools-manifest.json`)
These three descriptions must change **together** — they define the division of labor:

- **`deep_research_topic`** — append: *"Automatically includes earnings-call intelligence and macro/supplemental data when the topic warrants it (public companies, sectors, economic conditions). You do not need to call the earnings or supplemental tools separately before or after."*
- **`get_earnings_intelligence`** / **`get_earnings_divergence`** — reframe opening: *"Targeted pull: use when you want ONLY earnings data for a known ticker/sector — not full research. For questions that mix earnings with trends, use deep_research_topic, which includes earnings automatically."*
- **`get_supplemental_context`** — same reframe: *"Targeted pull for macro/institutional data. Research workflows include this automatically; call directly only for standalone economic context."*

Without the reframes, agents trained on the old sequence will double-fetch (cost creep) or skip the new path entirely.

### 2. System prompt workflow update (`src/systemPrompt.ts`)
CompleteResearchWorkflow: delete supplemental as a manual STEP 3. Replace with:

```
Research tools now select sources automatically across graphs, earnings, and
supplemental data. Trust the routing. Reach for the standalone earnings/
supplemental tools only when the user explicitly wants that data in isolation.
```

Also update the source-attribution rules: synthesis must attribute by source *type* ("per Ulta's Q1 earnings call…", "per FRED consumer confidence data…", "per Tara James Taylor's NIQ Beauty Graph…") — the existing graph-naming rules extend to the new source kinds.

### 3. Envelope: make the routing visible
`deep_research_topic` responses gain a `source_plan` block listing what was selected and why:

```json
"source_plan": [
    {"kind": "graph", "id": "beauty-goes-digital...", "reason": "topic match: beauty, retail"},
    {"kind": "earnings", "ticker": "ULTA", "reason": "public company named in query"},
    {"kind": "supplemental", "category": "macro", "reason": "consumer-confidence angle"}
]
```

Two audiences: the calling agent learns what the router covers (so it stops redundant manual calls), and Piers/experts can audit *why* the mix looks the way it does — which is exactly the diagnostic that was missing when this felt "PSFK-heavy."

### 4. A2A card + registry
The `deep-research` skill description on the agent card (`src/a2aHandler.ts`) and the `deep_research_*` offerings in the registry gain the same one-liner: research spans expert graphs, earnings calls, and institutional data. This is a selling point — say it where agents shop.

## Billing
Earnings/supplemental calls inside deep research bill as part of the research offering's `typical_calls` budget (deep_research_heavy = 30 calls, $15). No new billing surface; verify the offering call-budget accounting counts the new call types.

## Testing
1. Query "how is Ulta positioned against beauty trends" → sources include NIQ Beauty graph AND earnings snapshot for ULTA; synthesis cites both.
2. Query "consumer confidence impact on home goods" → supplemental (FRED/macro) candidate included alongside Pinterest Home & Living + PSFK.
3. Query with no public company / macro angle → pure graph plan, zero earnings/supplemental calls (no cost creep).
4. Before/after mix report: run the 20-query eval set (MCP eval harness brief), measure share of non-PSFK sources in citations. Target: PSFK share of citations drops without relevance loss.
5. Async supplemental timeout → research completes without the block, notes the gap in output (no hang).

## Priority
P1 — Phase 1 is a content sprint anyone can start today. Phases 2–3 are the structural fix for "research doesn't traverse the great mix of data." Independent of the other two briefs, but multiplies Brief Agentic Analysts' Phase A value.
