# Brief — Next Moves Regression Fixes, v1.46.31 (MCP Agent)

> **For**: `mcp-agent` (`/Fodda MCP`) · **Created**: 2026-08-22
> **Execute**: `/build-from-brief briefs/Brief - Next Moves Regression Fixes 1.46.31 (MCP Agent).md`
> **Follows**: 1.46.30 (`efaf6e5`, book-a-call — unrelated). 1.46.29 is committed (`a619a9e`). **Status 08-22 14:xx: none of the fixes below have been started** — a plan was written but v1.46.30 was used by another brief. Start from #1.

## Context

1.46.29 fixed ticker/ROIC wording, one-paragraph consult endings, shelf-names-real-graphs, theme
phrasing, and confirmed the Airtable `shelf` option. Review of its live probes found one regression
in the flagship tool and two fixes that changed the mechanism but not the outcome. Fix in priority
order below; #1 blocks everything.

## What to build

### 0. Done — 1.46.29 is committed (`a619a9e`). Working tree must be clean before you start; if not, stop and ask.

### 1. `search_graph` closing block regressed (BLOCKER)
Live probe `search_graph("Gen Z beverage hydration trends")`:
- **1.46.23 (correct):** *"I can pull the remaining 4 signals on beverage and retail from Retail
  Strategy & Innovation. Or we can look into Liquid IV or Gatorade or pull quantitative data from
  Census retail trade and spending data. If you tell me the brand or brief…"*
- **1.46.29 (broken):** *"Or we can look into PlayStation or Hermès or consult Nathan Grotticelli.
  If you tell me the brand or brief…"*

Two faults. (a) **Thread line dropped** — `on_topic_total` from the API search envelope is not
reaching `generateNextMoves` in the multi-graph branch after the 1.46.27 server-render refactor;
`remaining_count` resolves to 0 so no `more_in_graph`, and no adjacent room is found either.
(b) **Brands come from the wrong rows** — PlayStation/Hermès are not in a beverage-hydration result
set; brand extraction is reading an unfiltered/low-coverage row set (or the rows from a different
graph in the fan-out). Restore: brands only from rows that passed the on-topic filter, ranked by
frequency. Add a regression test that pins the 1.46.23 envelope shape for this query (thread kind
`more_in_graph`, `remaining_count > 0`, brands ⊂ row brands).

### 2. Competitor filter — outcome, not mechanism
`brand_tracker("Lululemon")` still renders "La Mer or NCR". The 1.46.29 shared-≥1-graph filter is
too loose (NCR is in every retail graph). Required outcome: competitors are the same sector as the
tracked brand. Implement as: rank co-occurring brands by co-occurrence **within the tracked brand's
own top-N footprint trends** (not anywhere in the graph), then require the candidate's primary graph
type to match the tracked brand's primary footprint graph. If <1 survives, omit the clause. DoD is the
rendered output, not the code path.

### 3. Shelf relevance floor
`consult_human_agent` James Colistra "podcast guest tips" → shelf named *PSFK Retail Trends* and the
*NielsenIQ Beauty Graph*. Real graphs, irrelevant. Apply a score floor to `getRelevantGraphs(query)`
results used for the shelf (reuse the routing threshold already used to decide which graphs to search;
do not invent a new constant). Below the floor → omit sentence 2 (path exists from 1.46.29).

## Where to register
- `src/coverageRelevance.ts` — `generateNextMoves` multi-graph thread branch, brand extraction, shelf floor
- `src/toolHandlers.ts` — `search_graph` server-render call site (pass `on_topic_total` through), `brand_tracker` competitor ranking
- `src/test_next_moves.ts` — pinned `search_graph` regression envelope; Lululemon competitor assertion; shelf-floor omit test
- `src/test_next_moves_transcripts.ts` — add a banned check: brands in line 2 must appear in result rows
- `CHANGELOG.md` → `[1.46.31]`; `package.json` bump

## Definition of Done
- Live `search_graph("Gen Z beverage hydration trends")` renders a thread line with a remainder and
  beverage brands — paste the ending. Any other two `search_graph` queries also render three sentences.
- Live `brand_tracker("Lululemon")` line 2 names apparel/sports brands only, or omits the clause.
- Live `consult_human_agent` James Colistra "podcast guest tips" renders two sentences (shelf omitted)
  or names a graph that plausibly covers creator/media — paste the ending.
- All suites green; Cloud Run revision ID + `tools/list` probe in CHANGELOG; **committed** (`git log`
  shows v1.46.29 and v1.46.31).

## Do Not
- Do not touch the scope line, telemetry mapping, or consult envelope structure from 1.46.26/29.
- Do not label a probe "unchanged" without diffing it against the previous CHANGELOG transcript for
  the same query — that is how #1 was signed off.
- No vendor names, tickers, tokens, or prices in user-visible text.

## Files-changed (expected)
`src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/test_next_moves.ts`,
`src/test_next_moves_transcripts.ts`, `CHANGELOG.md`, `package.json`.
