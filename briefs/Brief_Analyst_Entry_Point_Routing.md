# Brief: Analyst & Graph Entry-Point Routing

**Date:** 2026-05-26  
**Priority:** High  
**Source:** Website integration work  

---

## Problem

When users click "Query via Claude" from an Expert page or a Graph page on fodda.ai, Claude has no context about which expert or graph the user came from. The user lands in a generic Claude session with no analyst or graph pre-routing.

## What the Website Now Sends

The website now appends `&id={identifier}` to the MCP URL:

- **Expert pages:** `&id=ben-dietz-sic` (the expert/analyst ID)
- **Graph pages:** `&id=sic` (the graph ID)

This arrives in the MCP server as `entryId` (already extracted from `req.query.id` in `index.ts` line 561) and is already passed to `createServer()` and `buildSystemPrompt()`.

## What Needs to Change in `systemPrompt.ts`

### 1. Analyst Entry Routing

When `entryId` matches a known analyst ID (e.g. `ben-dietz-sic`, `piers-fawkes-psfk`), inject an instruction block into the system prompt:

```
ANALYST ENTRY POINT: The user connected from {Analyst Name}'s page. 
Route their first query through consult_analyst with analyst_id: "{entryId}".
Follow the two-step consultation workflow:
1. Search the "{graphId}" graph first
2. Call consult_analyst with the graph context
Frame the response as consulting {Analyst Name}.
For subsequent queries, follow normal routing.
```

Known analyst mappings:
| `entryId` | Analyst Name | Graph ID | Domain |
|---|---|---|---|
| `ben-dietz-sic` | Ben Dietz | `sic` | Cultural intelligence, brand strategy, hype-culture |
| `piers-fawkes-psfk` | Piers Fawkes | `psfk-retail` | Retail strategy, consumer innovation |
| `retail-strategy-innovation` | Retail Strategy Lead | `retail` | Cross-source retail intelligence |
| `marketing-media-strategy` | Marketing & Media Strategy Lead | `marketing` | Marketing, media, advertising strategy |
| `tech-innovation` | Tech Innovation Lead | `tech` | Technology innovation |
| `food-beverage-innovation` | Food & Beverage Innovation Lead | `food` | Food and beverage industry trends |

### 2. Graph Entry Routing

When `entryId` matches a graph ID (e.g. `sic`, `retail`, `beauty`) but NOT an analyst ID, inject:

```
GRAPH ENTRY POINT: The user connected from the "{Graph Name}" graph page.
Prioritize this graph in your first search. Lead with trends from "{graphId}"
before broadening to other graphs. Welcome them with a brief mention of what
this graph covers.
```

Use the catalog cache (`getCatalogGraphs()`) to resolve graph name from ID.

### 3. Implementation Location

- **File:** `src/systemPrompt.ts`, function `buildSystemPrompt()`
- `entryId` is already a parameter (line 574)
- Build the new block between `trialBlock` and `skillsBlock`
- Append to the return template string

### 4. Connector Display Name

The website already sets the Claude connector name to include context:
- Expert pages: `"Fodda Ben Dietz"` 
- Graph pages: `"Fodda SIC Graph"` (or similar)

This appears as the connector name in Claude's sidebar, reinforcing the context.

## The `consult_analyst` API Endpoint

For reference, the website's "Ask Now" tab now also calls `POST /v1/analysts/consult` directly (via `consultFoddaAnalyst()` in `utils/fodda-search.ts`). This is the same endpoint the MCP `consult_analyst` tool uses (line 2902 of `toolHandlers.ts`).

## NOTE: Draft Changes Already in This Repo

I've placed draft changes directly in `systemPrompt.ts` as a starting point. They add `ANALYST_ENTRIES` and `analystEntryBlock`. These are functional but should be reviewed — particularly:
- Whether the analyst map should come from the catalog API instead of being hardcoded
- Whether graph entry routing should also be added
- Whether the prompt wording is optimal

## Verification

After deploying:
1. Connect to Claude from Ben Dietz's expert page
2. Claude's first response should route through `consult_analyst` with `analyst_id: "ben-dietz-sic"`
3. Connect from the SIC graph page → Claude should prioritize SIC graph searches
