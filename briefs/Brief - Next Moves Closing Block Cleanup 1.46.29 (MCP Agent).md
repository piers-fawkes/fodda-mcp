# Brief — Next Moves Closing Block Cleanup, v1.46.29 (MCP Agent)

> **For**: `mcp-agent` (`/Fodda MCP`) · **Created**: 2026-08-22
> **Execute**: `/build-from-brief briefs/Brief - Next Moves Closing Block Cleanup 1.46.29 (MCP Agent).md`
> **Supersedes nothing** — this is the punch list left over from 1.46.25 → 1.46.28. The consult envelope
> brief and the brand-tracker work are done except for the items below.

## Context

1.46.26 (`fodda-mcp-00470-4zt`) shipped the consult closing envelope correctly (1.2 scope line, `shelf`
telemetry bucket, referral gating, `next_angle` token check). 1.46.27/28 reworked the `brand_tracker`
closing block. A review of the live transcripts in `CHANGELOG.md` found five leftovers.

## What to build

1. **Competitor list — filter by shared footprint.** `specific.brands` for brand reports still comes
   from raw `profile.competitive_context.co_occurring_brands` (live: "La Mer or NCR" for Lululemon,
   "Dior" for On Running). `toolHandlers.ts` ~L1750 already records which graphs each co-occurring
   brand appears in (`competitorGraphs`). Keep only brands that share ≥1 graph with the tracked
   brand's `trend_footprint`; rank by co-occurrence count; take 2. If none survive, omit the brand
   clause — never pad.
2. **Stats line — brand name, not ticker.** `coverageRelevance.ts` ~L749 renders
   `earnings and financial performance data for ${ticker}`. Use the brand/company display name:
   "Lululemon's latest earnings and financial results". Add `ROIC` and bare-ticker patterns
   (`\b[A-Z]{2,5}\b` inside the stats clause) to the banned-terms check in
   `test_next_moves_transcripts.ts`.
3. **Shelf line must name real graphs or be dropped.** Live James Colistra ending rendered
   *"Fodda also holds related research across domain and industry report graphs…"* — no graph
   named. Line 2 must use the actual `getRelevantGraphs(query)` results (≤2 display names, excluding
   the expert's own graph); if the candidate list is empty, omit sentence 2 and render two sentences.
4. **One paragraph.** The consult ending rendered as three separate lines. Spec: three plain
   sentences, one paragraph, no line breaks, no labels.
5. **Line-1 theme phrasing.** Brand-tracker line 1 pastes trend titles verbatim
   ("exploring On-Demand Retail Activations and Immersive Commerce & Creator Culture"). Lowercase
   and shorten to ≤3-word themes, as the search block does.

## Where to register

- `src/coverageRelevance.ts` (`generateNextMoves`, brand-tracker branch, shelf builder)
- `src/toolHandlers.ts` (brand_tracker competitor mapping; consult render)
- `src/test_next_moves_transcripts.ts` (banned terms, paragraph check, shelf-names-a-graph check)
- `CHANGELOG.md` → `[1.46.29]`; `package.json` bump

## Definition of Done

- `next_move_taken` single-select on the Questions table (`tblvHx1DzwuTq3TJE`) **has the `shelf`
  option** — verify via Airtable API; add it if missing, and state which in the CHANGELOG. Without it,
  every `shelf` log write is rejected silently.
- Confirm which revision is live on `mcp.fodda.ai` (1.46.27 and 1.46.28 CHANGELOG sections have no
  revision ID). If still `00470`, the brand-tracker changes are not live — say so.
- Deploy 1.46.29; record the Cloud Run revision ID and a `tools/list` probe.
- Paste three **live connector** endings (not the simulated suite) into the CHANGELOG:
  `brand_tracker("Lululemon")` — competitors are apparel/sports, stats line names Lululemon, no ticker;
  `consult_human_agent` James Colistra "podcast guest tips" — shelf names ≥1 real graph or is omitted,
  one paragraph; one `search_graph` — unchanged regression check.
- Test suite green; 0 banned terms including the two new patterns.

## Do Not

- Do not touch the scope line (1.2 copy is final) or the telemetry mapping from 1.46.26.
- Do not re-introduce any deliverable copy on line 3.
- Do not write vendor names (ROIC), tickers, tokens, or prices into user-visible text.

## Files-changed (expected)

`src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/test_next_moves_transcripts.ts`,
`CHANGELOG.md`, `package.json`, `tools-manifest.json` (only if descriptions change).
