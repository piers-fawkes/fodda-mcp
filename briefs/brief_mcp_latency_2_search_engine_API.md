# Brief — MCP Query Latency #2: Search Engine (Neo4j parallel + embed dedup) (API Agent)

Owning repo: **Fodda API** · Agent: **api-agent**
Execution handle (run from Fodda API repo root): `/build-from-brief briefs/brief_mcp_latency_2_search_engine_API.md`

> Part 2 of 5. Your files: `functions/v1/graphService.ts` and `functions/embeddings.ts` ONLY. The `v1Router.ts` search_graph Cypher is owned by brief #3 — do not edit it. Shared file: `CHANGELOG.md` (append-only).

## Context

A per-layer audit (each finding adversarially re-verified) found two real items in the search engine, and explicitly ruled out two tempting-but-wrong ones. Read this carefully — the obvious fixes are traps.

**Confirmed, do these:**
1. The scoped semantic-search Cypher in `GraphService.search` (the `search_insights` path, ~L274-291 in `graphService.ts`) does a per-node `vector.similarity.cosine(...)` scan but **omits the `CYPHER runtime=parallel` hint** that its sibling keyword/evidence queries use (e.g. `getStatistics`/`buildEvidenceCypher` at ~L1063, and the Trend fallback at ~L1150 both have it). Adding the hint parallelizes the scan across cores with no Aura constraint and no correctness change.
2. On a multi-graph fan-out, N branches call `getEmbedding(sameQuery)` concurrently. Wall-clock is already ~1 round-trip (they run in parallel), but it fires ~10–14 redundant Gemini `embedContent` calls per request and, under throttling, a 429 degrades branches to keyword or drops results. An in-flight promise cache in `embeddings.ts` collapses concurrent identical embeds into one request.

**Explicitly ruled out — do NOT do these (verified):**
- ❌ **Do not replace the brute-force cosine scan with `db.index.vector.queryNodes` (the native index).** It returns the *global* top-K; for a scoped single-graph search the in-scope nodes of a niche graph are usually not in that global top-K, so a post-filter empties the result. This is the documented reason the code scans (`graphService.ts` ~L893-897). The native-index pattern in `analystCoverage.ts:93` is a *global cross-graph* probe — a false analogy for scoped search. (A graph-size-gated index prefilter is possible but is a separate phase-2 effort, out of scope here.)
- ❌ **Do not "normalize" the embedding cache key on `extractCore`.** Verified correctness hazard: `graphService.ts:232` calls `getEmbedding(params.query)` (extractCore=false) and `:1011` calls `getEmbedding(query, true)` — these embed *different text*. Keying both on the core-extracted text would let one path serve the other's vector by race order, breaking determinism. Leave the flags and keys as they are.

## What to build

### 1. `CYPHER runtime=parallel` on the scoped vector scan — `functions/v1/graphService.ts`
- In `GraphService.search` (the `search_insights` semantic path, ~L274-291), prepend `CYPHER runtime=parallel` to the vector Cypher string that computes `vector.similarity.cosine(...)` per node — matching the style already used at ~L1063/L1150.
- Confirm (and leave intact) that the `getStatistics` evidence Cypher (`buildEvidenceCypher`, ~L1060) and the Trend fallback (~L1150) already carry the hint. Only add it where missing.
- No change to the WHERE/scope predicates, scoring, or `$minScore`.

### 2. In-flight embedding dedup — `functions/embeddings.ts`
- Add a module-level `Map<string, Promise<number[]>>` keyed on the same `cacheKey` used by the LRU (the normalized `processText`).
- In `getEmbedding`, after the LRU cache miss and before firing `embedContent`: if an in-flight promise exists for this key, `return` it; otherwise create the promise, store it, and on settle **delete the in-flight entry** (both resolve and reject paths).
- **On rejection, do not populate the LRU** (current behavior) and ensure the in-flight entry is evicted immediately so a transient Gemini 429/5xx does not block subsequent requests. Preserve the existing per-call key-presence guard and the existing error/alerting path.
- Add a one-line timing log on a real embed (cache miss): `[Embedding] embedContent took <ms>ms` — this feeds the per-request latency summary that brief #3 aggregates.

## Where to register
- `functions/v1/graphService.ts`: the `GraphService.search` semantic Cypher string.
- `functions/embeddings.ts`: in-flight map + timing log inside `getEmbedding`.

## Definition of Done
- `npx tsc -p tsconfig.api.json --noEmit` → 0 errors.
- The `search_insights` vector Cypher begins with `CYPHER runtime=parallel`; no scope/scoring change.
- Concurrent identical queries issue exactly **one** `embedContent` call (verify via the embed log count during a multi-graph fan-out); distinct queries still embed independently.
- An embedding failure still degrades the search path to keyword (unchanged) and the in-flight entry is evicted (a subsequent identical query re-attempts rather than reusing a rejected promise).
- Walkthrough states: before/after redundant-embed count for one fan-out query, and confirmation the brute-force scan + cache keys were left intact.

## Do Not
- Do not swap the scoped scan to `db.index.vector.queryNodes` (empties niche-graph results).
- Do not change `extractCore` flags or normalize the cache key (determinism hazard).
- Do not cache a rejected embed promise.
- Do not touch `v1Router.ts` (brief #3) or pricing/SPT text.
- `CHANGELOG.md` is shared — append; keep all entries on conflict.

## Files Expected to Change
- `functions/v1/graphService.ts` (`GraphService.search` semantic Cypher only)
- `functions/embeddings.ts`
- `CHANGELOG.md`
