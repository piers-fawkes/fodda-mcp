# Brief: Client-App Provenance from the MCP Handshake

**Target Agent:** Fodda MCP Agent (`Fodda MCP` repo)
**Date:** 2026-10-02
**Priority:** P3 (cheap; enables channel attribution + per-client debugging)
**Execution handle:** `/build-from-brief briefs/Brief - Client-App Provenance from Handshake (MCP Agent).md`

---

## Context

Piers wants to know **which app** a query comes from (Claude, ChatGPT, Cursor, a partner agent) — not
geography. Route-based source already reaches the API as `X-Fodda-Source` on every call
(`src/index.ts` `foddaRequest` headers), and offering routes (`/chatgpt`, `/grok-brand-context`, etc.)
set it. The gap is the generic `/mcp` endpoint: Claude.ai, Claude Desktop, Cursor, and VS Code all land
there and are indistinguishable (ChatGPT is already inferred from UA).

Every MCP client sends its name + version in the `initialize` handshake (`clientInfo`). Fodda ignores it.
Capturing it fills the gap with zero work asked of the agent and no per-tool schema change.

This is the *right* way to do the review's "record the calling client" idea — the review proposed a
`client` parameter on every tool call, which would bloat every schema and depend on the agent filling it
in honestly. The handshake is authoritative and free.

## What to build

1. In the `initialize` handler (`src/index.ts`, near the session/source setup ~L1278), read
   `params.clientInfo.name` (and `.version`) from the init request. Normalize to a short slug
   (`claude`, `claude-desktop`, `cursor`, `vscode`, `chatgpt`, etc.).

2. Store it on the session alongside the existing `source` (the `sessionSources` map) — e.g. a parallel
   `sessionClients` map, or widen the stored value to `{ source, client }`.

3. Forward it to the API as a new header on `foddaRequest` (e.g. `X-Fodda-Client`), next to the existing
   `X-Fodda-Source`. **Do not overwrite `X-Fodda-Source`** — `source` is the route/offering channel;
   `client` is the host app. They answer different questions.

4. Leave offering-route behaviour unchanged: `source` still identifies the commercial channel; `client`
   just disambiguates the app within it (most useful on `/mcp`).

## Definition of Done

- An `initialize` from a client declaring `clientInfo.name` results in `X-Fodda-Client: <slug>` on
  downstream API calls for that session — shown by a local test asserting the header, and (optional)
  a Cloud Run log line showing the client slug for a real `/mcp` connect.
- No new tool parameter; no tool schema change; tool count unchanged.
- `X-Fodda-Source` values are unchanged for all offering routes (regression check).
- CHANGELOG updated.

> **Note for the API side:** to actually report Claude-vs-Cursor splits, the API must persist
> `X-Fodda-Client` on its usage/question logs. That's a separate API-agent task — flag it, don't do it
> here. This brief only gets the signal to the API.

## Do Not

- Do not add a `client` argument to any tool.
- Do not infer the app from IP (connector traffic originates from Anthropic/OpenAI servers — the IP is
  the data centre, not the user).
- Do not touch the `/chatgpt` profile.

## Files expected to change

- `src/index.ts` (capture `clientInfo`, store, forward header)
- a test asserting the forwarded header
- `CHANGELOG.md`
