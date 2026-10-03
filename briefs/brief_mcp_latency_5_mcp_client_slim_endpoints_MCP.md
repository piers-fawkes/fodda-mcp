# Brief — MCP Query Latency #5: Consume Slim API Endpoints (MCP Agent)

Owning repo: **Fodda MCP** · Agent: **mcp-agent**
Execution handle (run from Fodda MCP repo root): `/build-from-brief briefs/brief_mcp_latency_5_mcp_client_slim_endpoints_MCP.md`

> Part 5 of 5. This is the only MCP-repo brief; parts #1-#4 are Fodda API. **Dependency: deploy Fodda API brief #3 first** — this brief consumes the two endpoints it adds (`GET /v1/account` and `GET /v1/graphs?view=mcp`). If those endpoints are not yet live, this brief is a no-op and should wait.

## Context

Today the MCP server downloads the full 100+ graph catalog (with website-gallery prose the MCP never uses) at session init, and `get_my_account` is mapped to `GET /v1/graphs` (per `Fodda_MCP_Context.md` §3E), so any mid-session balance/status check re-downloads the entire catalog just to read a few account fields. Fodda API brief #3 adds:
- `GET /v1/account` — a ~1KB account/usage block.
- `GET /v1/graphs?view=mcp` — routing fields only (`graph_id`, `name`, `description`, `agent_prompt`, `suitable_questions`, accessible/disabled flags), no gallery prose.

Fodda API brief #1 also enables gzip, so slimmer bodies compress further.

## What to build (in the Fodda MCP server)

1. **Point `get_my_account` at `GET /v1/account`** instead of `GET /v1/graphs`. Map the returned `_account` block to the tool's existing output shape. Mirror the existing human-safe `formatUsage` presentation — do **not** surface SPT/token pricing.
2. **Request `?view=mcp` at session init / `list_available_graphs`.** Where the server calls `GET /v1/graphs` to build routing (graph list, agent prompts, suitable questions), append `view=mcp`. Keep any field the routing logic actually reads; if the slim projection is missing a field the MCP needs, note it back (do not silently fall back to the full catalog).
3. **Confirm `Accept-Encoding: gzip`** is sent on outbound calls (undici/global fetch default — usually already present). No code change if already set; just verify the API's new gzip takes effect.

## Where to register
- The MCP tool handlers for `get_my_account` and `list_available_graphs` (and any session-init routing fetch) in the Fodda MCP server.

## Definition of Done
- `get_my_account` calls `GET /v1/account` and returns the same user-facing fields as before (balance/status/usage), now ~1KB.
- Session init / `list_available_graphs` requests `view=mcp`; routing still resolves every graph the full catalog resolved (no missing graphs, agent prompts, or suitable questions).
- No SPT/token wording appears in any tool output.
- Build/typecheck clean; bump the MCP version per repo convention.
- Walkthrough: before/after payload size for session init and for a balance check, and confirmation routing parity (same graph set resolved).

## Do Not
- Do not ship before Fodda API brief #3 endpoints are live (hard dependency).
- Do not surface SPT/token pricing — mirror `formatUsage` human-safe output.
- Do not change the MCP tool schemas/descriptions' user-visible wording beyond what these endpoints require.

## Files Expected to Change
- Fodda MCP tool handlers for `get_my_account` and graph listing/session init.
- MCP `CHANGELOG` + version bump.
