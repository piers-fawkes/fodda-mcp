# Brief: Fodda CE — Graph ID URL Encoding Audit

**Date:** April 8, 2026  
**Related fix:** Fodda MCP `src/index.ts` — `encodeURIComponent()` applied to all graph IDs in API URL paths  
**Priority:** Low — preventive, not blocking  

## Context

We discovered and fixed a bug in the Fodda MCP server where graph IDs containing slashes (e.g. `revisionary-studio/2026-macro-trend-graph`, `edelman/tipping-points`) were causing **404 errors** when used in `search_graph` and other tool calls.

The root cause: graph IDs were interpolated directly into URL path segments without encoding:

```
// BROKEN — creates /v1/graphs/revisionary-studio/2026-macro-trend-graph/search (extra path segment)
`/v1/graphs/${graphId}/search`

// FIXED — creates /v1/graphs/revisionary-studio%2F2026-macro-trend-graph/search
`/v1/graphs/${encodeURIComponent(graphId)}/search`
```

The fix was applied across 9 locations in the MCP codebase and deployed.

## What to check in Fodda CE

The CE's **graph upload and sync pipeline is fine** — the Revisionary graph was uploaded correctly and appears in `list_graphs` with all metadata intact. The issue was only on the read/query side.

However, the CE may have its own flows that construct API URLs with graph IDs in the path. Specifically, check for any code that:

1. **Calls the Fodda API search endpoint** — e.g. for graph preview, testing, or validation after upload  
   Pattern to look for: `` `/v1/graphs/${graphId}/search` `` or similar
   
2. **Calls evidence, neighbors, or node detail endpoints** — e.g. for content browsing or QA  
   Pattern to look for: `` `/v1/graphs/${graphId}/evidence` ``, `` `/v1/graphs/${graphId}/neighbors` ``, `` `/v1/graphs/${graphId}/nodes/` ``

3. **Any URL construction using graph IDs that may contain slashes**  
   The convention of `org-name/graph-name` (like `revisionary-studio/2026-macro-trend-graph`) is now established for expert graphs, so any graph ID interpolated into a URL path should be wrapped in `encodeURIComponent()`.

### How to fix (if applicable)

Wrap the graph ID with `encodeURIComponent()` wherever it appears in a URL path segment:

```typescript
// Before
const url = `/v1/graphs/${graphId}/search`;

// After
const url = `/v1/graphs/${encodeURIComponent(graphId)}/search`;
```

This is safe for graph IDs without slashes too — `encodeURIComponent('retail')` returns `'retail'` unchanged.

### Graphs currently using slashes in their IDs
- `revisionary-studio/2026-macro-trend-graph`
- `edelman/tipping-points`
- (Any future expert graphs following the `org/graph-name` convention)
