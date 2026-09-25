# Brief — MCP Agent — Connection Surface Cleanup

**Owner:** mcp-agent · **Execute:** `/build-from-brief "briefs/Brief — MCP Agent — Connection Surface Cleanup (sse, server.json, docs).md"`
**Written:** 2026-09-25 by Claude Code. Every finding below was checked against `src/index.ts` @ v1.46.83 and live probes of mcp.fodda.ai.
**Related:** Website brief *Connect Pages Consolidation* and App brief *Connections Page Simplification*. Those two stop documenting everything this brief retires, so ship this one **after** the Website brief is live, or at the same time.

## Context
The server's own metadata and docs still advertise connection paths that don't work:
- **`/sse` is broken.** `GET /sse` opens a stream and tells the client to POST to `/messages`, but `POST /messages` always returns 404 "Use /mcp endpoint" (`src/index.ts:1407`, `:1419-1422`). The server cards still advertise `mcpSse` (`:415`, `:444`).
- **There is no stdio server.** It was removed in v1.8.0 (`f5bf0f7`). Yet `server.json:31-50` publishes an npm stdio package that needs `FODDA_API_KEY`, and `smithery.yaml` does the same. `npx fodda-mcp` actually starts Express on :8080. npm latest is 1.46.31; `server.json` says 1.46.35; the code is at 1.46.83; the README badge says 1.30.0.
- **`server.json:27`** `authorizationServerMetadataUrl` points at `mcp.fodda.ai/.well-known/oauth-authorization-server`, which was removed (CHANGELOG ~L953). Discovery now goes through `oauth-protected-resource` → `clerk.fodda.ai`.
- **The 401 responses are inconsistent.**
  - When no credential is sent, they return `WWW-Authenticate` (good).
  - A bad or expired OAuth bearer (`:1153-1172`) and an invalid `/c/<token>` (`:1189`) return 401 **without** `WWW-Authenticate`, and the `/c/` error isn't a JSON-RPC error. RFC 9728 clients can't recover from that and just stop.
  - For `/c/...` requests the `resource_metadata` slug comes out as `c`.
- **The legacy query-string check misses two paths.** `?api_key=` still works on `/c/:token` and `/grok-brand-context` because the legacy check (`:112-165`) doesn't cover them.
- **The docs contradict the code:**
  - `README.md:29-32,119`, `CLAUDE_CONNECTORS_README.md:120`, `Enterprise_MCP_Setup.md:77-81` and `docs/claude-tag-setup.md:57,351` all say `--transport sse …/sse`.
  - `docs/claude-tag-setup.md:73` gives a `fod_…` key example, which gets routed to the Clerk resolver and fails. `:82,353` recommend `?api_key=`.
  - `CLAUDE_CONNECTORS_README.md:110` and `Enterprise_MCP_Setup.md:72` say OAuth is "once live". It is already live.
  - `CLAUDE_CONNECTORS_README.md:112` says "All tools are read-only", but about 15 tools set `readOnlyHint:false`.
  - `docs/chatgpt-submission.md:47,82` says "401 + WWW-Authenticate on all routes". That's only true when no credential is sent, until item 3 below lands.

## What to build
1. **Retire `/sse` explicitly.** `GET /sse` and `POST /messages` return **410 Gone** with JSON `{ error: "sse_retired", message: "Use Streamable HTTP at https://mcp.fodda.ai/mcp", source: "fodda-mcp" }`. Remove `mcpSse` from both server cards. Before you do this, count requests to `/sse` over the last 30 days in Cloud Run logs (project `fodda-mcp`, us-east4) and put the number in the CHANGELOG. If there's real traffic, stop and tell Piers.
2. **Fix `server.json` and `smithery.yaml` so they describe a remote-only server.**
   - `server.json`: delete the `packages` stdio entry and `authorizationServerMetadataUrl`. Keep or add a `remotes: [{ type: "streamable-http", url: "https://mcp.fodda.ai/mcp" }]` entry. Sync `version` to the release.
   - `smithery.yaml`: switch to the remote/HTTP form, or delete it if Smithery can't do remote OAuth. Record which you chose.
   - The registry publish follows the existing manual process (see the `mcp-registry-identity` memory). **Piers runs the publish.**
3. **Make every 401 RFC 9728-consistent.** Invalid or expired bearer, invalid `/c/` token and missing credential all return 401 + `WWW-Authenticate: Bearer resource_metadata="https://mcp.fodda.ai/.well-known/oauth-protected-resource/mcp"`, plus a JSON-RPC error body with `error="invalid_token"` where applicable. `/c/` requests point at the `/mcp` metadata, not `/…/c`. Don't change the 402 (payment) or 501 (resolver missing) semantics.
4. **Close the `?api_key=` gap on `/c/:token` and `/grok-brand-context`.** First check 30 days of logs for query-key use on those two paths. **If any Grok template relies on it, stop and ask Piers.** Otherwise apply the same "outdated URL" 401.
5. **Fix the docs** (README, `CLAUDE_CONNECTORS_README.md`, `Enterprise_MCP_Setup.md`, `docs/claude-tag-setup.md`, `docs/chatgpt-submission.md`):
   - Claude Code: `claude mcp add --transport http fodda https://mcp.fodda.ai/mcp` (OAuth), or `--header "Authorization: Bearer sk_live_…"`.
   - Key format: `sk_live_…`. Delete `?api_key=`.
   - Say OAuth is live.
   - Replace "all tools are read-only" with an accurate sentence.
   - Update the README version badge.
   - Point the "setup per client" sections at `https://www.fodda.ai/connect` instead of restating them.
6. **Stale App navigation in error text.** `src/index.ts:143` tells users to go to "Account → MCP Integration". That menu no longer exists; the App calls it **Connections** (`app.fodda.ai/connections`). Grep `src/` for every "MCP Integration" string and fix it.
7. **npm package: decision for Piers, don't do it autonomously.** Recommend `npm deprecate fodda-mcp "Fodda is a hosted MCP server: use https://mcp.fodda.ai/mcp (see https://www.fodda.ai/connect)"`. This is outward-facing, so it's Piers's step. Just put the exact command in the CHANGELOG under "Manual steps for Piers".

## Where to register
`src/index.ts` (routes, 401 helper, server cards) · `server.json` · `smithery.yaml` · the docs listed above · `package.json` version · `CHANGELOG.md`.

## Definition of Done
1. `npm run build` is clean and existing tests pass. Add tests for: `GET /sse` → 410, `POST /messages` → 410, invalid `/c/x` → 401 + `WWW-Authenticate` pointing at `/mcp`, invalid bearer → 401 + `WWW-Authenticate`, `/c/<valid>?api_key=junk` → the token still wins (or 401 per item 4).
2. After deploy, live probes (paste the output):
   `curl -si -X POST https://mcp.fodda.ai/c/invalid -d '{}' -H 'content-type: application/json' | grep -i www-authenticate` returns a match. `curl -si https://mcp.fodda.ai/sse` → 410.
3. An authenticated `initialize` + `tools/list` on `/mcp` (with a Bearer test key), `/chatgpt` and one real `/c/<token>` still succeed.
4. `grep -rnE "transport sse|mcp\.fodda\.ai/sse|\?api_key=|fod_|All tools are read-only|once live" README.md *.md docs/ server.json smithery.yaml` returns zero hits (excluding CHANGELOG and briefs).
5. A CHANGELOG entry with the log counts from items 1 and 4, the probe output, the deploy revision, and "Manual steps for Piers" (registry publish, npm deprecate).

## Do Not
- Don't change tool annotations in this brief. ChatGPT freezes a snapshot of tool definitions after approval, and the Apps Directory submission is pending (see the `chatgpt-apps-directory-submission` memory). Only the README's claim about the annotations changes.
- Don't add anonymous access to any path (see the `no-anonymous-offering-access` memory).
- Don't touch the OAuth discovery delegation to `clerk.fodda.ai`.
- Don't publish to npm or the MCP Registry. That's Piers's manual step.
