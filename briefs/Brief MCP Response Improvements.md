# Brief: API Changes for Fodda MCP Response Improvements

## Problem & Context

When AI agents (such as Claude) query Fodda via MCP and synthesize results for end users, two key gaps appear in the current response payloads that reduce citation quality and limit re-query efficiency.

### Gap 1: Source URLs not surfaced on trend node fallbacks
When `search_insights` or `search_statistics` returns trend nodes instead of direct evidence (the `_fallback_note` path on the `/v1/graphs/:graphId/statistics` endpoint), those nodes carry `"source_url": null`. This leaves the AI agent with no citation link to offer. When a user asks "give me the link," the agent silently falls back to external web search instead of sticking to Fodda.

### Gap 2: No guidance on re-query behavior
When an agent wants to go deeper on a topic already retrieved, there is no signal in the response payload indicating that Fodda has more to offer. The agent defaults to web search rather than re-querying Fodda with a more specific query.

---

## Required Changes in Fodda API

### 1. [Gap 1 Fix] Attach representative `source_url` to fallback trend nodes

In the `/v1/graphs/:graphId/statistics` endpoint handler (usually in `graphService.ts` or similar), when fallback trend nodes are returned:
- For each returned trend node, look up the highest-scoring `Signal` or `Article` node associated with that trend (e.g., via `(t:Trend)<-[:EVIDENCE_FOR]-(a:Article)` or `(t:Trend)<-[:EVIDENCED_BY]-(s:Signal)`).
- Extract its `sourceUrl` and attach it as the `source_url` field of the trend object in the response.
- If no evidence can be found or resolved, attach the graph's canonical page URL (Airtable's `webpageURL` field, or default to `https://app.fodda.ai/gallery/{graphId}`).

### 2. [Gap 2 Fix] Add `suggested_followup_queries` to search payloads

Add a `suggested_followup_queries` top-level array of strings in the response payloads for search endpoints (`/v1/graphs/:graphId/search` and `/v1/graphs/:graphId/statistics`):
- Extract the top 3 trends in the result set.
- For each trend, generate 2-3 specific conversational query strings that Claude can use to drill deeper.
- Example pattern:
  - `Show me the evidence behind "{trendName}" in graph "{graphId}"`
  - `Get statistics and case studies on "{trendName}"`
  - `What are the adjacent trends to "{trendName}" in graph "{graphId}"?`

---

## Example Expected Output Shape

When statistics search falls back to trend nodes:

```json
{
  "requestId": "63187fe5e385234ccb5d62d4",
  "statistics": [
    {
      "type": "trend",
      "id": null,
      "title": "Vertically Operated Autonomous Logistics Networks",
      "summary": "Car buyers buy end-to-end delivery capacity...",
      "source_url": "https://www.retailcustomerexperience.com/articles/some-source-article", 
      "_fallback_note": "No statistics/quotes/signals found. Returning matching Trend nodes instead..."
    }
  ],
  "suggested_followup_queries": [
    "Show me the evidence behind \"Vertically Operated Autonomous Logistics Networks\" in graph \"retail\"",
    "Get statistics and case studies on \"Vertically Operated Autonomous Logistics Networks\"",
    "What are the adjacent trends to \"Vertically Operated Autonomous Logistics Networks\" in graph \"retail\"?"
  ]
}
```
