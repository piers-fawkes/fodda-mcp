# Brief — MCP Query Latency #1: Infra, Cold-Start & Compression (API Agent)

Owning repo: **Fodda API** · Agent: **api-agent**
Execution handle (run from Fodda API repo root): `/build-from-brief briefs/brief_mcp_latency_1_infra_coldstart_API.md`

> Part 1 of 5 in a parallel latency workstream. Your files: `deploy.sh`, `functions/index.ts` (startup + app-level middleware only), `package.json`. You will NOT touch `v1Router.ts`, `graphService.ts`, `embeddings.ts`, or `supplemental/*` — those are owned by sibling briefs #2/#3/#4. The only shared file is `CHANGELOG.md` (append-only; keep all entries on conflict).

## Context

Fodda's MCP tools call this Express API on Cloud Run. An audit of the user-query hot path found the deploy config is the largest source of *perceived* latency for bursty, human-driven MCP traffic, and that no responses are compressed.

Three independently-confirmed facts:
1. `deploy.sh` (lines ~54-61) passes **no** `--min-instances`, so the service scales to zero. The first query after any idle period pays a full cold start (container + Node boot + eager module load of firebase-admin/neo4j-driver/stripe/express + the first Neo4j Bolt/routing handshake + the first Gemini TLS handshake) **before any search runs** — roughly 2–5s.
2. There is **no HTTP response compression** anywhere — `compression` is not a dependency and no middleware is registered. Every tool result and the heavy `GET /v1/graphs` travel uncompressed over both hops.
3. The first query on each fresh instance pays the Neo4j and Gemini handshakes serially because nothing is warmed at startup (the `app.listen` callback only runs `verifyCatalogParity`).

## What to build

### 1. Cloud Run deploy flags — `deploy.sh` (gcloud run deploy block, ~L54-61)
- Add `--min-instances=1` (keeps one warm instance; its Neo4j pool and Gemini keep-alive stay hot). This is the single biggest cold-start lever.
- Add `--cpu-boost` (startup CPU boost; near-zero cost, benefits every cold start / revision rollover).
- **Do not** add `--cpu=2`/`--memory` or lower `--concurrency` in this brief. Verified caveat: cutting concurrency below the default (80) raises instances-per-load and causes *more* cold starts on this heavy image, which can worsen p99. Leave concurrency/CPU at defaults; revisit only with measured concurrency data later.

### 2. gzip compression — `functions/index.ts` (app-level middleware)
- `npm i compression` (add to `package.json` dependencies) and `@types/compression` to devDependencies.
- `import compression from "compression";` and register `app.use(compression())` **before the routers** (near the existing `app.use(express.json(...))` at ~L354).
- **Exclude the SSE route** so streamed events are not buffered: pass a `filter` that returns `false` when the request targets `/v1/research/stream` (or when the response `Content-Type` is `text/event-stream`); otherwise fall back to `compression.filter(req, res)`.
- Undici (the MCP server's fetch) sends `Accept-Encoding: gzip` and auto-decompresses, so no MCP-side change is needed here.

### 3. Startup warm-up — `functions/index.ts` (inside the existing `app.listen(PORT, …)` callback, ~L4135)
- Fire-and-forget (do **not** await; must not delay readiness), alongside the existing `verifyCatalogParity().catch(...)`:
  - `getDriver().session(...)` → run `RETURN 1` (or `driver.getServerInfo()`) to open the pool + fetch the routing table, then close the session.
  - one `getEmbedding("warmup")` to establish the Gemini TLS session and prime the client.
- Wrap each in `.catch(() => {})` and a short log line; a warm-up failure must never crash boot.

## Where to register
- `deploy.sh`: the single `gcloud run deploy` invocation.
- `functions/index.ts`: `app.use(compression(...))` before routers; warm-up calls inside the `app.listen` callback.
- `package.json`: `compression` dependency.

## Definition of Done
- `npx tsc -p tsconfig.api.json --noEmit` → 0 errors.
- `deploy.sh` contains `--min-instances=1` and `--cpu-boost`; no `--concurrency`/`--cpu`/`--memory` added.
- `curl -H 'Accept-Encoding: gzip' <host>/v1/graphs` returns `Content-Encoding: gzip`; the SSE route `/v1/research/stream` does **not** (events still stream incrementally).
- Startup logs show the Neo4j + embedding warm-up ran (and readiness was not delayed).
- Verification note in the returned walkthrough: cold-start p50 before/after from real Cloud Run logs (project `fodda-api`), and a gzip'd vs un-gzip'd body-size figure for `/v1/graphs`.

## Do Not
- Do not gzip the SSE stream (`/v1/research/stream`).
- Do not set `--min-instances` high (idle cost) — 1 is the target.
- Do not cut `--concurrency` or raise CPU here (cold-start regression risk).
- Do not touch pricing/SPT text or any supplemental client.
- `CHANGELOG.md` is shared with the parallel latency briefs — append your entry; on conflict keep all entries (additive).

## Files Expected to Change
- `deploy.sh`
- `functions/index.ts` (middleware registration + `app.listen` callback only)
- `package.json`
- `CHANGELOG.md`
