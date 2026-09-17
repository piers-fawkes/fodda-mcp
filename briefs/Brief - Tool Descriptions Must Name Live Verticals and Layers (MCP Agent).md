# Brief: Tool Descriptions Must Name the Live Verticals and the Layers (Airtable is the edit point)

**Status:** For build (Fodda MCP agent)
**Repo:** Fodda MCP (`mcp-agent`)
**Date:** 2026-09-17
**Severity:** P1 — cheap fix, high leverage. Descriptions are actively hiding live inventory from LLMs
**Execution:** `/build-from-brief "briefs/Brief - Tool Descriptions Must Name Live Verticals and Layers (MCP Agent).md"`

## Context

A newsletter agent concluded Fodda "has zero lodging or travel coverage" and stopped looking. It read
that off the tool schema. The current `get_domain_intelligence` description
(`src/toolHandlers.ts:3230`) reads:

> "Search PSFK-curated domain graphs (retail, beauty, fashion, sports, consumer electronics, F&B) for
> trend intelligence with bundled evidence..."

A live probe on 2026-09-17 shows what the tool actually searches:

```
graphs_searched: travel, sports, retail, food, beauty, fashion, tech
```

**`travel` and `tech` are live and unlisted**, and `travel` was the *top-ranked graph* for the query
that the agent believed was uncovered — returning "Agentic AI for Travel Planning and Operations"
(relevance 0.883) with case studies naming Marriott, Expedia, Booking.com and IHG. The graph's registry
name is **"PSFK Travel & Hospitality Trends"** (`Fodda API/functions/v1/graphRegistry.ts:1205`).

Two further gaps in how the surface describes itself:

1. **The schema advertises trends only.** Descriptions say "trend intelligence". The product is a layer
   cake — trends, statistics, brand case studies, executive quotes, reports, earnings exchanges. An LLM
   reading the current schemas learns that Fodda sells trends, so brand-shaped and stat-shaped questions
   never reach the right tool.
2. **`brand_tracker` is invisible at the point of need.** It already does cross-graph brand lookup
   ("Build a complete Brand Intelligence Profile by searching ALL knowledge graphs for a specific
   brand"), but nothing in the search tools' routing points to it, so agents fan out across
   trend-search tools for company questions and conclude coverage is thin.

**Critical build-order trap.** `npm run build` runs `scripts/sync-descriptions-from-airtable.mjs`
*before* `tsc`. That script fetches the Airtable Offerings table (`tbl93DJ627r81zKVP`) and rewrites the
description string in `server.tool('<name>', '...')` for **every tool that has a row with a description
field**. Editing `src/toolHandlers.ts` directly will be silently overwritten on the next build if such a
row exists. Airtable is the source of truth for published, customer-visible text.

## What to build

1. **Determine the edit point before editing anything.** For each tool in scope, check whether the
   Airtable Offerings table holds a row with a populated description (the script matches on
   `mcp_tool_name` / `key` / `offering_key` / `tool_name` / `name`).
   - **Row exists** → update the description **in Airtable**, then run the sync and confirm it lands in
     `src/toolHandlers.ts`.
   - **No row** → edit `src/toolHandlers.ts` directly.
   Report which tools fell into which branch. Do not skip this step; a TS-only edit that the sync
   reverts is the expected failure mode of this brief.

2. **`get_domain_intelligence` — name the live inventory.** Replace the six-vertical list with the
   verticals actually searched: **travel & hospitality, retail, tech, beauty, fashion, sports, food &
   beverage**. Derive the list from the live graph set rather than retyping it, and state the layer
   coverage: the tool returns expert-curated trends **with bundled evidence including brand case
   studies, statistics, executive quotes and analysis**. Keep the existing guidance on editorial
   structuring and the `get_supplemental_context` pointer for sub-national cuts.

3. **Name the layers in the sibling search tools.** `search_statistics`, `search_insights`,
   `get_report_intelligence` and `get_specialist_intelligence` should each say what layer they return
   and what they do not, so an agent can route on the shape of the question rather than guessing a silo.
   Keep the existing statistics-vs-narrative split; this is additive precision, not a rewrite.

4. **Route brand questions to `brand_tracker`.** Add a single routing line to the search tools'
   descriptions and to `ToolRoutingPreference` in `src/systemPrompt.ts`: when the query names a company
   or brand, `brand_tracker` is the entry point. One sentence each — this is a context budget purchase,
   so keep it short.

5. **Regenerate `tools-manifest.json`** via the normal build and confirm it passes the Cost Silence
   guard.

## Where to register

`src/toolHandlers.ts` (or Airtable per step 1), `src/systemPrompt.ts`, `tools-manifest.json`.
No new tools, no schema/parameter changes, no endpoint changes.

Update `docs/bibles/ecosystem_overview.md` (canonical copy in Fodda API `docs/bibles/`) if the tool
inventory description changes there, and bump its `Last updated:` in the same change.

## Definition of Done

- State, per tool touched, whether the description lives in Airtable or in TS, and show the evidence.
- Run `npm run build` and paste the `[sync-descriptions]` log line. Then `grep` the built
  `src/toolHandlers.ts` for `get_domain_intelligence` and paste the resulting description, proving the
  new text **survived** the Airtable sync.
- Live `get_domain_intelligence` call whose `graphs_searched` array is fully covered by the verticals now
  named in the description. Paste both.
- `tools-manifest.json` regenerated; Cost Silence guard passes — paste the result.
- Confirm no price figures and no "token"/"SPT" phrasing entered any human-visible description:
  `grep -nE '\$[0-9]|token|SPT' ` over the changed descriptions, output pasted.
- `CHANGELOG.md` updated with a real verification result and a version bump.

## Do Not

- **Do not add a `search_intelligence` tool or any new tool.** The unified-front-door proposal was
  assessed and rejected on evidence: `get_domain_intelligence` already fans out across all 7 domain
  graphs with no `graph_id`, and the reported failure was a consumer-side harvest bug in the newsletter
  cascade (`Fodda API/briefs/brief_api_cascade_evidence_harvest_fix.md`), not a missing front door.
  Envelope work is tracked in `Fodda API/briefs/brief_api_layer_agnostic_search_envelope.md`.
- Do not change tool parameters, defaults, `min_score`, or response handling — descriptions and routing
  text only.
- Do not hand-maintain a vertical list that will drift; derive it from the live graph set.
- Do not edit `src/toolHandlers.ts` for any tool whose description Airtable owns.

## Files changed (expected)

- Airtable Offerings table (`tbl93DJ627r81zKVP`) — for tools it owns
- `src/toolHandlers.ts` — descriptions for tools Airtable does not own
- `src/systemPrompt.ts` — `ToolRoutingPreference` brand-entry line
- `tools-manifest.json` — regenerated
- `CHANGELOG.md`
