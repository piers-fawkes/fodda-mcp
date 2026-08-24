# Brief — Fix OAuth discovery issuer mismatch on `mcp.fodda.ai`

**Owning repo:** Fodda MCP · **Agent:** `mcp-agent` · **Execution:** `/build-from-brief briefs/oauth-discovery-issuer-mismatch-fix.md`
**Created:** 2026-08-22 · **Priority:** P1 (blocks OAuth-based directory listings, incl. Smithery gateway)

---

## Context

A third-party MCP client (Smithery's new gateway "Publish via URL" flow) fails OAuth discovery
against `https://mcp.fodda.ai/mcp` with:

```
Failed to process discovery response: "issuer" is "https://clerk.fodda.ai"
but expected "https://mcp.fodda.ai/"
code: oauth/auth_server_discovery_process_failed  (RFC 8414)
```

**Root cause (confirmed against the live endpoints and the code):**

- `GET /.well-known/oauth-protected-resource` (RFC 9728) advertises the authorization server as
  **`mcp.fodda.ai`** — `src/index.ts:103-114`:
  ```json
  { "resource": "https://mcp.fodda.ai", "authorization_servers": ["https://mcp.fodda.ai"] }
  ```
- `GET /.well-known/oauth-authorization-server` (RFC 8414), served **at `mcp.fodda.ai`**, returns
  **`issuer: "https://clerk.fodda.ai"`** — `src/index.ts:119-155` (line 151 forces
  `issuer: CLERK_ISSUER`, and line 150 spreads Clerk's proxied metadata which also carries
  Clerk's issuer).

Per RFC 8414 §3.3 a client that treats `mcp.fodda.ai` as the AS requires the returned `issuer` to
**equal** `https://mcp.fodda.ai`. It gets `https://clerk.fodda.ai` → hard, non-retryable failure.
In short: **the resource metadata says "my auth server is `mcp.fodda.ai`", but the auth-server
metadata served there identifies as Clerk.** The two must agree.

**Why the facade exists (do not regress this):** `mcp.fodda.ai/.well-known/oauth-authorization-server`
proxies Clerk *specifically* so that `registration_endpoint` points at the local DCR shim
(`src/index.ts:152` → `src/oauthRegisterShim.ts`). The shim injects
`openid email profile offline_access` into DCR requests because Gemini/Google DCR clients omit
`scope`, after which Clerk rejects `openid` authorization with `invalid_scope`. Any fix must keep
this shim effective for those clients.

Live facts verified 2026-08-22:
- Clerk's own `https://clerk.fodda.ai/.well-known/oauth-authorization-server` has
  `issuer: https://clerk.fodda.ai`, a working `registration_endpoint`, and
  `scopes_supported` including `openid` + `offline_access`.

**IMPORTANT — why `issuer` is currently Clerk (do not naively "fix" it):** `issuer: CLERK_ISSUER`
was set **deliberately** in **v1.46.22** (commit `56f3272`; see the Addendum in
`briefs/Brief — Gemini DCR openid scope + legacy api_key URL deprecation message.md`) to make the
discovery metadata's `issuer` match Clerk's **RFC 9207** authorization-response `iss` parameter
(`iss=https://clerk.fodda.ai`) on the callback. Rewriting `issuer` to `https://mcp.fodda.ai`
(the naive Option B below) would **regress** that fix and reintroduce the Gemini callback `iss`
mismatch. Therefore **Option A is the recommended fix** — it satisfies RFC 8414 (Smithery) *and*
keeps RFC 9207 alignment (Clerk callback), because the client treats `clerk.fodda.ai` as the
issuer end-to-end. Option B is retained only as a last resort and must not be shipped without
re-verifying the Gemini/RFC-9207 path.

---

## What to build

Make resource metadata and auth-server metadata **self-consistent** so RFC 8414 issuer validation
passes, **without losing the DCR openid-injection shim.**

### Chosen direction — Option A (per product owner): delegate discovery to Clerk

Point the resource metadata at Clerk as the authorization server, so clients validate against
Clerk's own (already-consistent) metadata.

- `src/index.ts` — in both `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-protected-resource/mcp`, change
  `authorization_servers: [getServiceUrl()]` → `authorization_servers: [CLERK_ISSUER]`.
- Client then fetches `https://clerk.fodda.ai/.well-known/oauth-authorization-server`
  (issuer `clerk.fodda.ai` == host) → validation passes.

**⚠️ Conflict to resolve before shipping Option A (flagged per house rules):**
Option A makes clients use **Clerk's native `registration_endpoint`**, bypassing the local
`/oauth/register` shim. That reintroduces the exact `invalid_scope` bug the shim was built to fix
for Gemini/Google DCR clients. Two acceptable ways to keep the shim under Option A:
1. Confirm by live test that the affected clients (Gemini connector) explicitly request `openid`
   in DCR now, so the shim is no longer required — then Option A is safe as-is; **or**
2. Verify Clerk's native DCR grants `openid` by default for these clients. If neither holds,
   **do not ship Option A** — use Option B instead.

### Fallback — Option B (shim-preserving facade): fix the issuer, keep `mcp.fodda.ai` as the AS

Keep `authorization_servers: [getServiceUrl()]` and make the served AS metadata a valid,
self-identifying issuer:

- `src/index.ts:151` — set `issuer: serviceUrl` (i.e. `https://mcp.fodda.ai`) instead of
  `CLERK_ISSUER`. Do **not** spread Clerk's `issuer` over it (reorder so the explicit
  `issuer` wins, or delete `issuer` from `cachedClerkMetadata` before spreading).
- Keep `registration_endpoint: ${serviceUrl}/oauth/register` (shim preserved).
- Because `authorization_endpoint`/`token_endpoint` still point at Clerk while the advertised
  issuer is `mcp.fodda.ai`, EITHER:
  - set `authorization_response_iss_parameter_supported: false` (stop advertising RFC 9207 so
    clients don't reject Clerk's `iss=clerk.fodda.ai` on the authorize redirect); **or**
  - add thin proxy routes `GET /oauth/authorize` and `POST /oauth/token` on `mcp.fodda.ai` that
    forward to Clerk, so the entire flow stays under `mcp.fodda.ai` and `iss` is consistent
    (most spec-correct; more code).

Recommendation: try Option A first; if the DCR/`openid` test fails, ship Option B with the
`authorization_response_iss_parameter_supported: false` variant (smallest shim-preserving change).

---

## Where to register

No new routes for Option A/B-variant-1. Option B-variant-2 adds `GET /oauth/authorize` and
`POST /oauth/token` proxy handlers alongside the existing `POST /oauth/register`
(`src/index.ts:157`). Bump the server version and update `server.json`/`fodda_mcp_server.json`
per the normal release flow.

---

## Definition of Done

1. `curl https://mcp.fodda.ai/.well-known/oauth-protected-resource` and the AS metadata it points
   to are **issuer-consistent**: the AS metadata's `issuer` equals the AS URL the resource
   metadata advertises (RFC 8414 §3.3).
2. **Smithery gateway scan** of `https://mcp.fodda.ai/mcp` completes OAuth discovery with no
   `oauth/auth_server_discovery_process_failed` error and reaches the authorize step.
3. **Claude connector** OAuth connect to `https://mcp.fodda.ai/mcp` still succeeds end-to-end
   (authorize → token → authenticated tool call).
4. **DCR / Gemini path:** a DCR client that omits `scope` still ends up with `openid` (either via
   the surviving shim, or proven unnecessary). Capture the actual DCR request/response in the
   verification note.
5. `CHANGELOG.md` updated with a real, quoted verification result for each of the above.

---

## Do Not

- Do **not** ship Option A without resolving the DCR/`openid` shim conflict above.
- Do **not** change how the resource server validates tokens — `src/*` and the API's
  `jwtVerify({ issuer: CLERK_ISSUER })` must keep trusting Clerk-issued JWTs. This brief changes
  *discovery advertisement*, not token validation.
- Do **not** expose or log tokens/authorization codes in the new proxy handlers (Option B-v2).
- Do **not** hardcode `clerk.fodda.ai` — keep using `CLERK_ISSUER` (`process.env.CLERK_ISSUER_URL`).

---

## Files changed (expected)

- `src/index.ts` — resource + AS metadata handlers (`/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`);
  Option B-v2 adds `/oauth/authorize` + `/oauth/token` proxy routes.
- `src/oauthRegisterShim.ts` — only if the shim path changes under Option A.
- `server.json`, `fodda_mcp_server.json` — version bump on release.
- `CHANGELOG.md` — entry + verification.

---

## Verification note / addendum — 2026-08-22 (review of the v1.46.35 attempt)

`mcp-agent` implemented this as **Option B** in `v1.46.35` (`src/index.ts`): set
`issuer: serviceUrl` (`https://mcp.fodda.ai`) after the Clerk-metadata spread, added
`authorization_response_iss_parameter_supported: false`, and kept
`registration_endpoint: ${serviceUrl}/oauth/register` (shim) plus Clerk `authorization_endpoint`/
`token_endpoint`. **Do not deploy it on the strength of the current tests.** Review findings:

**Confirmed good:**
- Code matches the walkthrough. The RFC 8414 §3.3 *discovery* check now passes (protected-resource
  advertises AS `mcp.fodda.ai`; AS metadata now returns `issuer: mcp.fodda.ai`). Smithery's
  *discovery* scan should get past `oauth/auth_server_discovery_process_failed`.
- The DCR `openid` shim is preserved; the agent hit **real** Clerk `/oauth/register` and confirmed
  Clerk omits `openid` by default (so the shim is still needed).

**Unverified / high regression risk (the tests do NOT cover this):**
- `src/test_dcr_and_legacy_deprecation.ts` uses a **mock Clerk on `localhost:8990`** and only
  *statically* asserts our metadata (`issuer == serviceUrl`, `iss_param == false`). It never
  exercises a real authorize → callback, so it cannot catch the issue below. Green tests here do
  **not** mean the real OAuth connection works.
- **Live Clerk** (`https://clerk.fodda.ai/.well-known/oauth-authorization-server`, checked
  2026-08-22) advertises **`authorization_response_iss_parameter_supported: true`** and
  **`issuer: https://clerk.fodda.ai`**. Clerk therefore **emits `iss=https://clerk.fodda.ai`** on
  the authorization-response redirect regardless of our metadata flag.
- Under Option B the client discovers `issuer = mcp.fodda.ai` but the callback carries
  `iss = clerk.fodda.ai`. Per RFC 9207 §2.4 a client that receives `iss` **MUST** validate it →
  mismatch → reject. This is the **exact** failure `v1.46.22` (commit `56f3272`) fixed by aligning
  the discovery `issuer` to Clerk. Option B reverts that alignment, so it likely **moves Smithery's
  failure from discovery to the authorize callback** and **regresses the Gemini connector**.
- Setting `authorization_response_iss_parameter_supported: false` in *our* metadata does not stop
  Clerk from sending `iss`, and does not stop a strict client from validating it when present.

**Required before any deploy (DoD item 2/3/4 must be LIVE, not mock):**
1. Complete a **real** end-to-end OAuth connect against **live Clerk** — authorize → callback →
   token → one authenticated tool call — from a client that validates RFC 9207 `iss`
   (Smithery gateway completing the flow, and/or the Gemini/Claude connector). Capture the callback
   `iss` and whether the client accepted it.
2. If it rejects (expected), Option B is not viable as written. Resolve the underlying tension —
   the fix must satisfy **all three** simultaneously:
   - RFC 8414 discovery issuer match (Smithery), **and**
   - RFC 9207 callback `iss` match (Gemini/`v1.46.22`), **and**
   - DCR `openid` injection (Clerk omits it by default).
   Only two viable shapes do this:
   - **Option A** — `authorization_servers: [CLERK_ISSUER]` so everything is `clerk.fodda.ai`
     end-to-end (fixes discovery + callback), and solve `openid` at the Clerk layer (configure
     Clerk to grant `openid` by default, or have clients request it) since Clerk's native
     `registration_endpoint` bypasses our shim; **or**
   - **True AS facade** — proxy `/oauth/authorize` + `/oauth/token` (+ `jwks`) through
     `mcp.fodda.ai` and rewrite the callback `iss` to `mcp.fodda.ai`, so `issuer: mcp.fodda.ai`
     is honest end-to-end (note: any OIDC `id_token` remains Clerk-signed with `iss=clerk`, so
     verify clients that request `openid` don't reject the `id_token`).

**Do not** treat the mock-Clerk test pass or the health check as sufficient verification for this
change — the risk lives entirely in the live authorize callback.

---

## Addendum 2 — 2026-08-22 (review of the Option A re-implementation + LIVE Clerk probes)

`mcp-agent` switched to **Option A** in `v1.46.35`: `authorization_servers: [CLERK_ISSUER]` in both
`/.well-known/oauth-protected-resource` handlers (`src/index.ts`). **This is the correct direction**
and resolves the primary blocker:
- RFC 8414 (Smithery discovery): client fetches Clerk's own metadata; issuer `clerk.fodda.ai`
  matches the host. ✓
- RFC 9207 (callback): Clerk's callback `iss=clerk.fodda.ai` matches the discovered issuer. ✓
  (No regression of the `v1.46.22` fix.)

**But the DCR `openid` shim is now bypassed — verified, not theoretical.** Live Clerk metadata
advertises `registration_endpoint: https://clerk.fodda.ai/oauth/register`, so clients register at
Clerk directly; the shim at `mcp.fodda.ai/oauth/register` is off the discovery path (the
walkthrough's "shim retained" is misleading, and Test 5 POSTs the shim endpoint directly so it
cannot catch the bypass). Two **live DCR probes against real Clerk** (2026-08-22):

| DCR request | Clerk-granted scope | `openid`? |
|---|---|---|
| no `scope` (Google/Gemini style) | `email offline_access profile` | ❌ No |
| explicit `scope: "openid email profile offline_access"` | `email offline_access openid profile` | ✅ Yes |

Conclusion: Clerk grants `openid` only when the client asks. Under Option A, any client that omits
`scope` in DCR (the Google/Gemini case the shim was built for) loses `openid` and will fail authorize
with `invalid_scope`. Impact is scoped to those clients; Smithery/Claude that request `openid` (or
don't need it) are fine.

**Resolution (recommended) — fix `openid` in Clerk, retire the shim:**
1. In the Clerk OAuth application config, set the **default DCR / application scopes to include
   `openid`** (Clerk dashboard). This is the proper home for the behavior the shim was faking.
2. Re-run the no-scope probe:
   `curl -sX POST https://clerk.fodda.ai/oauth/register -H 'Content-Type: application/json' -d '{"client_name":"probe","redirect_uris":["https://example.com/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'`
   — confirm the returned `scope` now contains `openid`.
3. Once confirmed, Option A is complete; the `mcp.fodda.ai/oauth/register` shim and the orphaned
   `mcp.fodda.ai/.well-known/oauth-authorization-server` handler can be removed as dead code.

**Deploy gate:** Option A is safe to deploy for the Smithery/Claude goal now. If the Gemini/Google
connector (which omits `scope`) is a priority, do step 1 first. If Clerk cannot default `openid`,
the shim must stay in the discovery path — which is incompatible with Option A's Smithery fix and
would require the true AS facade + authorize/token proxy (Addendum 1, Option B-variant-2).
