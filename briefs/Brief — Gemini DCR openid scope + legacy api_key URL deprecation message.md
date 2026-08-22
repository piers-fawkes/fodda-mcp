# Brief: Gemini account-linking fix (DCR `openid` scope) + legacy `?api_key=` URL deprecation message

**To:** mcp-agent (`Fodda MCP`)
**From:** Piers (via Claude Code, 2026-08-21)
**Priority:** High — Gemini users cannot connect today; legacy-URL users get a blank 404.
**Execution:** `/build-from-brief "Brief — Gemini DCR openid scope + legacy api_key URL deprecation message.md"`

---

## Context

### A. Gemini "Account linking is required" — root cause found 2026-08-21
Gemini (Spark → Connected Apps → Add a custom app) registers against Clerk via Dynamic Client
Registration, then calls `/oauth/authorize` with `scope=openid …`. Clerk grants DCR clients only
`email offline_access profile` by default, so it answers `invalid_scope` and 303s the error straight
back to Google's callback. The user never sees Fodda's sign-in; Gemini shows *"Account linking is
required to use this custom app. Try again."*

Evidence: Clerk OAuth app `47SmX0ucrQcOLck4` ("Google", dynamically registered 17:15:47Z) had scopes
`email offline_access profile`; probing `/oauth/authorize/continue` with `scope=openid …` →
`error=invalid_scope … not allowed to request scope 'openid'`. After PATCHing that app's scopes to
`openid email profile offline_access` via the Clerk Backend API, the same request 302s to the Fodda
consent flow. MCP Cloud Run logs confirm Google probed `/mcp` (HEAD/GET 404, POST 401), read
`/.well-known/oauth-protected-resource/mcp`, registered, then never returned.

Two earlier Google registrations exist (2026-08-08 `3WF4dTd2Q3EuTURk`, 2026-08-12 `POG9gFyhQmuQuVYa`,
different Google accounts) — other people already hit this wall.

Note also: Clerk silently drops `refresh_token` from `grant_types` on every DCR response even when
requested with `offline_access`. Not yet proven to matter for Gemini; verify during DoD.

### B. Legacy `?api_key=sk_live_…` URLs
`POST https://mcp.fodda.ai/sse?api_key=…&user_id=…` currently returns Express's bare
`<pre>Cannot POST /sse</pre>` 404. Claude clients of at least two real users are still retrying this
every few seconds (logs 17:21Z). Two problems: the user gets no guidance, and **live keys are written
to Cloud Run request logs in plaintext** via the URL.

---

## What to build

### 1. Permanent DCR fix — every new Gemini user registers a fresh client
Pick the first that works, in order:
1. **Clerk-side default.** Check Clerk dashboard / instance settings for a default-scopes or
   DCR-scope setting that includes `openid`. If it exists, set it and stop here.
**Simplification found 2026-08-21 18:05Z:** Clerk honours a `scope` field in the DCR request body — a registration sent with `"scope":"openid email profile offline_access"` comes back with `openid` granted. Google's DCR body omits `scope`, so it gets Clerk's default. The shim therefore only needs to **inject `scope` into the forwarded body** (add it if absent; if present, ensure `openid` is included). No Backend-API PATCH needed. Keep the PATCH as a fallback only. Also observed: repeated registrations from one IP within minutes led Gemini to report "Automatic registration with this server failed" — likely Clerk rate-limiting `/oauth/register`; the shim must pass through Clerk's 429 honestly and must not retry in a loop.

2. **Registration shim.** Change `/.well-known/oauth-authorization-server` (and the
   `authorization_servers` entry in `/.well-known/oauth-protected-resource/mcp`) so
   `registration_endpoint` points at `https://mcp.fodda.ai/oauth/register`. That handler:
   - forwards the body verbatim to `https://clerk.fodda.ai/oauth/register`;
   - on success, calls Clerk Backend API `PATCH /v1/oauth_applications/{id}` with
     `scopes: "openid email profile offline_access"` (look the `id` up via
     `GET /v1/oauth_applications?order_by=-created_at` matching `client_id`);
   - returns Clerk's original response to the caller, with `scope` rewritten to include `openid`.
   Keep `authorization_endpoint`/`token_endpoint` pointing at Clerk unchanged. Never log the
   `client_secret`.
3. Also backfill `openid` onto the two older Google apps above so those users can retry.

Keep the hot-patch on `47SmX0ucrQcOLck4` — do not revert it.

**Verified 2026-08-21 17:38Z:** after the patch Gemini authenticated and ran a full MCP session (account profile loaded, tools listed). At 17:58Z a second "Add" in Gemini ran DCR again → new client without `openid` → same failure. **Every Add/Try-again can create a new client, so §1 is blocking for launch, not a nice-to-have.**

### 2. Legacy URL handling → helpful, key-safe response
For any request to `/sse`, `/mcp`, `/messages`, `/copilot` (GET or POST) that carries `api_key` or
`user_id` in the **query string**:
- Respond `401` with JSON-RPC error body AND a plain-text-friendly message:
  `Fodda: this connection URL is outdated. Get your new MCP URL at https://app.fodda.ai (Account → MCP Integration) and update your connector.`
  Use JSON-RPC `error.code -32001`, `error.message` as above, `error.data.docs:
  "https://fodda.ai/platform-integration-anthropic-claude"`. For SSE-style GETs return the same
  message as `text/plain`.
- **Do not authenticate** with a query-string key under any circumstances (currently `/mcp?api_key=bogus`
  still answers `initialize`; that's fine because initialize is pre-auth, but confirm tool calls 401).
- **Strip `api_key` from request logging** before anything hits Cloud Run logs — middleware that
  rewrites `req.url`/log fields to `api_key=REDACTED`. Apply globally, not just on the legacy paths.
- Reply ONCE per session cheaply; the Claude clients retry in a tight loop, so no DB/Airtable lookups on
  this path.

### 3. Key rotation (operator task, note in CHANGELOG)
The two keys visible in logs at 17:21Z (`…f8ae91efff6ff` / `…790757375e`, users tbersou@gmail.com and
john@grouppartners.net) should be rotated by Piers in app.fodda.ai and the users notified to update
their connector. The new legacy-URL message (§2) does the notifying automatically once live.

---

## Where to register
- `Fodda MCP/CHANGELOG.md` — entry with real verification (see DoD).
- `Fodda MCP/README.md` — the legacy-URL note already exists; update it to describe the new message.
  Also replace the stale "Gemini CLI" snippet (`tools` array, `/sse`) with the Antigravity
  `~/.gemini/config/mcp_config.json` `serverUrl` shape.
- `Fodda API/docs/bibles/system_clarifications.md` §4 — gotcha added 2026-08-21 by Claude; update it
  when the permanent fix ships.
- Hand to Website agent: once §1 is verified end-to-end, unblock the "Add to Gemini" copy in
  `Fodda Website/briefs/add-to-gemini-one-click-brief.md` (currently must not claim it works).

## Definition of Done
- [ ] A brand-new personal Google account (AI Pro/Ultra, US) adds `https://mcp.fodda.ai/mcp` in Gemini
  Connected Apps, reaches Fodda sign-in, links, and gets a `list_graphs` answer — **without** anyone
  hand-patching scopes. Record the new Clerk app id and its scopes in the CHANGELOG.
- [ ] Confirm whether Gemini needs a refresh token (watch for a `/oauth/token` `grant_type=refresh_token`
  call after ~1h); if it fails because Clerk dropped the grant, extend the shim to PATCH grant types too.
- [ ] `curl -X POST 'https://mcp.fodda.ai/sse?api_key=x&user_id=y'` returns the 401 + message; Cloud
  Run logs show `api_key=REDACTED`.
- [ ] Normal OAuth (`/mcp` with Bearer) and `/c/<token>` paths unchanged — re-run `test_remote_mcp.ts`
  style smoke test via Claude connector.

## Do Not
- Do not log or echo `client_secret`, bearer tokens, or `api_key` values anywhere — including this brief's
  follow-ups and the CHANGELOG.
- Do not widen Clerk scopes beyond `openid email profile offline_access`.
- Do not reintroduce query-string authentication.
- Do not delete Clerk OAuth apps other than the two `MCP-Test-Client` entries with the
  `evil-attacker.example.com` redirect (2026-08-21 04:07 and 04:21) — those are from a redirect-URI
  security probe and can go; everything else belongs to real clients.

## Files-changed (expected)
`src/index.ts` (or wherever `/.well-known/*` and transport routes live), new `src/oauthRegisterShim.ts`,
logging middleware, `README.md`, `CHANGELOG.md`.

---

## Addendum 2026-08-21 18:30Z — v1.46.21 live result: scope fixed, Gemini still fails at callback

**Observed:** Gemini registered via the shim twice (18:26:38, 18:27:25) and received `openid` — scope injection works. Google never returned to `/mcp` with a token; Gemini showed "Account linking is required" again. Claude removed/re-added successfully through the same shim (18:28:46).

**Diagnosis (high confidence):** Clerk's authorize callback carries `iss=https://clerk.fodda.ai` (RFC 9207). Google's OAuth client compares it with the `issuer` from the metadata it fetched — now `https://mcp.fodda.ai` — and rejects the callback. The single success at 17:38Z happened while `issuer` was still Clerk's.

**Change (v1.46.22, one line):** in `src/index.ts` `/.well-known/oauth-authorization-server`, set `issuer: CLERK_ISSUER` (not `serviceUrl`). Keep `authorization_servers: [serviceUrl]`, `registration_endpoint: ${serviceUrl}/oauth/register`, and Clerk authorize/token/jwks. Update the test that asserts issuer == service URL to assert issuer == `CLERK_ISSUER`. Note in CHANGELOG that this is a deliberate RFC 8414 deviation (metadata host ≠ issuer) required because Clerk emits `iss` on callbacks and we cannot proxy the authorize redirect.

**DoD:** Piers does a clean Gemini Add (sign-in reached, tool call answered — check MCP logs for `Google` UA `POST /mcp 200`) AND a Claude remove/re-add with a tool call. If Claude breaks on the issuer mismatch, fall back to Plan B: proxy `authorization_endpoint` through `mcp.fodda.ai/oauth/authorize` and rewrite the `iss` on the way back is NOT possible — instead open a Clerk support ticket for configurable default DCR scopes and revert `authorization_servers` to Clerk.
