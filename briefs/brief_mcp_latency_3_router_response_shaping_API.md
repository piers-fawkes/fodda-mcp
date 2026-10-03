# Brief — MCP Query Latency #3: Router Hot-Path & Response Shaping (API Agent)

Owning repo: **Fodda API** · Agent: **api-agent**
Execution handle (run from Fodda API repo root): `/build-from-brief briefs/brief_mcp_latency_3_router_response_shaping_API.md`

> Part 3 of 5. Your file: `functions/v1/v1Router.ts` (plus a read of `graphRegistry.ts` for the serializer). Do not edit `graphService.ts`/`embeddings.ts` (brief #2) or `supplemental/*` (brief #4). Shared: `CHANGELOG.md` (append-only). Brief #5 (MCP client) depends on the two new endpoints you add in P2 — land those for it to consume.

## Context

The `v1Router.ts` search handler carries a serial add-on and recomputes work the middleware already did; its payloads also ship duplicate prose and there is no slim account/routing endpoint. Verified specifics:
- `await attachEarningsCorroboration(rows, {...})` runs on **every** `search_graph` with no financial gate (`v1Router.ts:2383`) — an extra inline Neo4j round-trip even for non-financial queries (the majority).
- The scoped `search_graph` vector Cypher (the per-node `vector.similarity.cosine` scan, ~L1433-1451) **omits `CYPHER runtime=parallel`** even though its sibling keyword query (~L1470) has it.
- Handlers recompute accessible graph IDs though the middleware already cached them on the request (`req.foddaAccessibleIds`, set at `index.ts:1675`).
- Search rows duplicate the same paragraph across `label`/`description`/`summary` (`v1Router.ts:1705-1708` and `:2417-2418`).
- `get_my_account` and balance checks map to `GET /v1/graphs`, forcing a full 100+ graph catalog download (incl. website-gallery prose) just to read a few account fields; there is no slim endpoint.

Order of priority: **P1 = hot-path (earnings gate, parallel hint, reuse accessibleIds, latency log); P2 = payload/session-init (slim endpoints, prose de-dup).**

## What to build

### P1.1 — Gate / de-serialize earnings corroboration (`v1Router.ts:2383`)
- Only run `attachEarningsCorroboration` when the query is financial. Reuse the existing financial-query signal already present in the search path (e.g. the `isFinancialQuery` flag passed into evidence Cypher in `graphService.ts`, or the graph domain / financial keyword detection the handler already computes). For non-financial queries, skip it entirely.
- When it does run, prefer running it **in parallel** with the other post-processing rather than strictly serial-awaited before the response. Preserve the existing try/catch (it already logs `attachEarningsCorroboration failed` and must never fail the search).

### P1.2 — `CYPHER runtime=parallel` on the `search_graph` vector Cypher (~L1433-1451)
- Prepend `CYPHER runtime=parallel` to the scoped vector Cypher string (the one computing `vector.similarity.cosine(...)` per node), matching the sibling keyword query at ~L1470. No scope/scoring change. (Brief #2 does the equivalent for `search_insights` in `graphService.ts` — different file, no conflict.)

### P1.3 — Reuse cached accessible IDs
- Where the search/handlers call `resolveAccessibleGraphIds(...)` again, use `req.foddaAccessibleIds` if present (set by middleware at `index.ts:1675`). Fall back to computing only if the cached value is absent.

### P1.4 — Per-request latency summary log
- Emit one structured log line per search request: `{ embed_ms, neo4j_ms, supplemental_ms, corroboration_ms, total_ms, graphs_n }`. Reuse timings that already exist (Neo4j via `runLoggedQuery`; embed via the log brief #2 adds). This is the observability baseline — today only Neo4j is timed, so embedding/supplemental/total are invisible.

### P2.1 — Slim `GET /v1/account`
- Add a lightweight route returning only the `_account` block (reuse `getAccountProfile`/`formatUsage`; the block is currently built only inside `GET /v1/graphs` at ~L684-714). Target ~1KB. This is what the MCP `get_my_account` tool will point at (brief #5).

### P2.2 — `?view=mcp` projection on `GET /v1/graphs`
- Add an optional `view=mcp` (or `fields=`) query param that returns only routing fields per graph — `graph_id`, `name`, `description`, `agent_prompt`, `suitable_questions`, and the accessible/disabled flags — omitting the website-gallery prose (`what_it_does`, `key_features`, `by_the_numbers`, `for_teams_like`, `how_to_access`, `what_contains`, icon/portrait/source URLs, duplicated `derived_counts`) emitted by `serializeGraphForList` (`graphRegistry.ts` ~L1986). **Default shape unchanged** (App/Website depend on it). If an Airtable-sourced `price_per_query` display field is already present, keep it verbatim.

### P2.3 — De-dup prose in search rows (`v1Router.ts:1705-1708`, `:2417-2418`)
- Stop serializing the same paragraph 2–3× per row. Keep `title` + a single `description`; drop the redundant `summary`/`description` copies that currently duplicate the same text. Preserve any field the MCP/clients actually read (verify against the row shape before removing).

## Where to register
- New `GET /v1/account` route next to the existing `GET /v1/graphs` handler in `v1Router.ts`.
- `view=mcp` handled inside the `GET /v1/graphs` handler.
- Earnings gate, parallel hint, accessibleIds reuse, latency log, and row de-dup inside the existing search handler(s).

## Definition of Done
- `npx tsc -p tsconfig.api.json --noEmit` → 0 errors.
- A non-financial `search_graph` makes **no** earnings-corroboration query (verify via log); a financial one still enriches.
- The `search_graph` vector Cypher begins with `CYPHER runtime=parallel`.
- `GET /v1/account` returns ~1KB with the account/usage block; `GET /v1/graphs?view=mcp` omits gallery prose while default `GET /v1/graphs` is byte-identical to before.
- Search rows no longer repeat the same text across fields; no client-consumed field is dropped.
- A per-request latency line appears in logs for every search.
- Walkthrough: before/after wall-clock for a non-financial `search_graph`, and before/after body size for `/v1/graphs?view=mcp` vs default.

## Do Not
- Do not remove earnings corroboration for financial queries.
- Do not change the default `GET /v1/graphs` response shape (additive `view=mcp` only).
- Do not add "tokens"/"SPT" text; keep Airtable-sourced price display verbatim.
- Do not edit `graphService.ts`/`embeddings.ts`/`supplemental/*`.
- `CHANGELOG.md` shared — append; keep all entries on conflict.

## Files Expected to Change
- `functions/v1/v1Router.ts`
- `functions/v1/graphRegistry.ts` (only if the `view=mcp` projection is cleanest in `serializeGraphForList`)
- `CHANGELOG.md`
