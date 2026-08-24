# Brief — Neil demo readiness: suggest timeout, mega-trend brands, and verification debt

**From:** Piers (2026-08-22)
**Owning repo / agent:** Fodda MCP — `mcp-agent`. No API changes.
**Execution handle:** `/build-from-brief briefs/brief_neil_demo_readiness.md`
**Status:** ready to build. Small. Blocks sending Neil Carty (first real prospect tester) his connect link.

## Context

1.46.33 (cost silence + suggest stats line) and 1.46.34 (thin-niche hygiene) are live via `fodda-mcp-00480-pmq` and mostly verified by live probes. Two defects survive, both visible on Neil's exact demo query run live 08-22 (`search_graph("what are the trends in the collectible space, particularly trading cards, like baseball trading cards")`):

- `next_moves.specific.statistics_source` came back `"Census and FRED market statistics"` — the regex fallback. **Root cause:** `fetchSupplementalSuggest` time-boxes at 1500ms (`src/coverageRelevance.ts:539`) while the API's `/v1/supplemental/suggest` classifier itself allows a 1500ms Gemini fallback (`unifiedContextHandler.ts:459`) — so any query the API's regex classifier misses takes ≥1.5s + network and the MCP times out on precisely the queries that need dynamic routing. (Contrast: the "creative effectiveness" probe stayed on the API's regex path and returned a real public source name.)
- `next_moves.specific.brands` came back `["PlayStation", "Hermès"]` — those are the first 10 of **734** brands on the *Experiential Loyalty* mega-trend, not signals for the query. Rows carry `brand_count`; big numbers mean the brand list is a truncated roster, not evidence.

Also: the deployed 1.46.35 OAuth work is **uncommitted** in this repo's working tree, and 1.46.33/34 shipped with unit tests only — no revisions or live transcripts in the CHANGELOG, which their briefs' DoDs require.

## What to build

0. **First, commit the deployed 1.46.35 working tree as its own commit** (`src/index.ts`, deleted `src/oauthRegisterShim.ts`, `server.json`, `fodda_mcp_server.json`, `package.json`, `CHANGELOG.md`, `src/test_dcr_and_legacy_deprecation.ts`). It is already live as `fodda-mcp-00480-pmq`; do not mix it with this brief's changes.
1. **Suggest must not race the classifier it depends on** (`src/coverageRelevance.ts`, `src/toolHandlers.ts`):
   - Raise the suggest time-box 1500ms → 3000ms.
   - Start the suggest fetch **in parallel with the main search**, not after it: in handlers where the query is stat/market-shaped, kick off `fetchSupplementalSuggest(query, options)` before awaiting the API search, and pass the in-flight promise through `options` so `generateNextMoves` awaits an already-running (usually already-resolved) call. Net added latency ≈ 0 even at 3s.
   - Keep the existing cache, eviction, and `regex-fallback` path telemetry unchanged.
2. **Mega-trend brand guard** (`src/coverageRelevance.ts`, brand extraction in `generateNextMoves`): exclude rows with `brand_count > 30` (or `brandNames.length >= 10` when `brand_count` is absent) from brand extraction for Line 2. If no rows survive, leave `specific.brands` undefined (the renderer already omits the clause).
3. **Pay the verification debt** — run against live production and paste into `CHANGELOG.md` under a single entry with the new Cloud Run revision:
   - Neil's query above: closing block must show a suggest-derived public source name (expect Google Trends / product-pricing names, NOT "Census and FRED"), no PlayStation/Hermès, 0 currency/"API calls" mentions.
   - "what does this cost?" follow-up → fodda.ai/pricing link, no figures.
   - "can I book Jeremy Bergstein?" → `rate_display` verbatim + URL.
   - Patrick's query (`creative effectiveness`, graphs `["dentsu-creative-marketing"]`) → thin path, no "several more trends" offer, no `dentsu*` brands.
   - The three 1.46.29 regression probes (Lululemon `brand_tracker`, James Colistra consult, Gen Z beverage search) → closing blocks unchanged.

## Where to register

`src/coverageRelevance.ts`, `src/toolHandlers.ts`, tests (`src/test_next_moves.ts` — parallel-start and brand_count cases), `package.json` bump, `CHANGELOG.md`. Bible note (one line, API repo `docs/bibles/system_clarifications.md`): suggest runs in parallel with search, 3s box, because the API classifier itself may take 1.5s.

## Definition of Done

All five transcripts in item 3 pasted with the revision id; suggest path telemetry shows `network_fresh`/`cache_hit` (not `timeout_fallback`) on Neil's query; unit suites green.

## Do Not

- Do NOT change closing-block copy, Render Spec, or any pricing/cost behaviour — those are closed briefs.
- Do NOT drop the regex fallback; it remains the safety net.
- Do NOT send anything to Neil — Piers sends the link himself once this is verified.

## Files-changed (expected)

`src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/test_next_moves.ts`, `package.json`, `CHANGELOG.md` (+ the pre-existing 1.46.35 files in commit 0).
