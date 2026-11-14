# Brief (MCP Agent) — Mitigate 60s Request Timeout in `search_graph` Pipeline

## Context
A live query on `fodda.ai` (`CompanionDrawer` / WebMCP consult):
> `"what are the alcoholic beverage trends when it comes to retail in the US"`

timed out with an HTTP 504. Investigation of Airtable query log record `recFKrtNHpNBdpI7x` (`tblvHx1DzwuTq3TJE`) revealed the following trace:
- **Total Duration**: 76,065 ms.
- **Tool Call 1**: `search_graph({"query": "alcoholic beverage retail trends US", "sector": "Alcoholic Drinks"})` completed in **6,712 ms**.
- **Tool Call 2**: `search_graph({"query": "alcoholic beverages retail spirits wine beer", "graphId": "food"})` hung for **60,004 ms** and was terminated by the MCP client transport with:
  `ERROR: MCP error -32001: Request timed out`.

Directly querying `POST https://api.fodda.ai/v1/graphs/food/search` with the same payload responds in **1,240 ms**.
The 60s timeout occurred inside the `Fodda MCP` tool handler for `search_graph` (`src/toolHandlers.ts`), likely due to compounding sequential fallback calls:
1. Primary graph search to `Fodda API`.
2. Auto-broadening fallback (`if (!scopedGraphs && enrichedRows.length < 3 && ...)`).
3. `addCoverageAnnotation(...)` awaiting `suggestPromise` (`fetchSupplementalSuggest`).
4. `generateNextMoves(...)` calling `fetchSupplementalSuggest`.
5. Supplemental macro data queries (`/v1/supplemental/google-trends` + `/v1/supplemental/census/retail-snapshot`).
6. Output skills execution (`callOutputSkills(...)`).
7. Server-side widget rendering (`renderSearchWidget(...)`).

Because `@modelcontextprotocol/sdk` clients enforce a strict 60,000 ms timeout per tool execution, any tool call exceeding 60s fails catastrophically with error `-32001`, leaving the synthesis loop without results and blowing past outer gateway timeouts.

## What to build
1. **Total Execution Timeout Envelope for `search_graph`**:
   - Wrap the entire `search_graph` handler in an internal race with a fail-safe deadline of **25,000 ms** (or max 28,000 ms).
   - If auxiliary enrichments (auto-broadening, supplemental census/trends, output skills, widget rendering) take too long, abort the non-essential enrichments and return the verified core graph rows immediately rather than timing out the entire MCP tool call.
2. **Cap Cascading Upstream Requests in `search_graph`**:
   - Ensure the auto-broadening fallback and supplemental suggest calls do not run sequentially when time budget is low.
   - Bound supplemental data fetches (`/v1/supplemental/google-trends`, `/v1/supplemental/census/retail-snapshot`) to 4,000 ms max.
3. **Graceful Partial Return on Timeout**:
   - If downstream enrichment hits the deadline, log `[search_graph] Enrichment deadline reached, returning core results` and return `data.rows` without error.

## Where to register
- `src/toolHandlers.ts` in the `search_graph` tool definition.

## Definition of Done
1. Calling `search_graph` with `{"query": "alcoholic beverages retail spirits wine beer", "graphId": "food"}` completes in `< 10,000 ms` and never exceeds 28,000 ms under any network condition.
2. `npm run test` or relevant test suites in `Fodda MCP` pass without regressions.
3. `CHANGELOG.md` updated in `Fodda MCP`.

## Do Not
- Do not remove the core verified graph search or evidence ranking.
- Do not alter pricing or billing modes (Option C / `mcp-orchestrated`).
- Do not expose raw internal tool names in user-facing `next_moves`.

## Files Expected to Change
- `src/toolHandlers.ts`
- `src/coverageRelevance.ts` (if suggest timeout needs bounding)
- `CHANGELOG.md`
