# Brief — Onboarding Must Require a Connector (MCP + Website)

**Date:** 2026-07-13 · **Priority:** High (security + correct UX)
**Owner:** MCP agent (also makes the `Fodda Website` changes). API-side is a separate light verification — see the companion API/Security brief.

## Principle
Adding Fodda as a Claude connector is **step 1 of expert onboarding.** Every legitimate onboarding caller therefore carries credentials. **No genuine onboarding caller is an anonymous stranger.** Reject anonymous calls with a clear pointer to start the journey.

## ⚠️ Critical context — do NOT naïvely "reject anonymous"
The browser onboarding page **`pages/JoinExperts.tsx` (= `/join-experts`) calls these endpoints anonymously today** — only `Content-Type: application/json`, no auth (it passes the user's email in the request body). A plain "assert `mcpCheck.verified`" gate would **break the very page we redirect people to.** The fix is to make the **browser flow authenticated too**, then gate.

## The reconciled design — both flows carry credentials
- **Claude/MCP flow:** already signs each request with HMAC (`FODDA_MCP_SECRET`). No change to how it authenticates.
- **Browser flow:** cannot compute the HMAC (that needs the server-side secret). Instead it authenticates by **raw API-key possession** — send `x-api-key: sk_live_…` + `x-user-id`. The site already has this key available: `/api/mcp-credentials` returns the logged-in user's key from their **verified Clerk JWT**. So the browser fetches the key from the Clerk session at the top of onboarding — **no manual entry.** A true stranger (not signed in / no key) gets bounced to sign-up + connector, which is the intended "no strangers" behaviour.

## Website changes — `Fodda Website/`
1. **`server.js` — `verifyMcpSignatureAndExtractEmail(req, body)` (~line 949):** treat the request as **verified if EITHER** (a) a valid HMAC signature **or** (b) a valid `x-api-key` present and found in the Airtable Account/User lookup (the same key-possession/identity-binding step the HMAC path already runs). Return `{ verified: true, email }` in both cases.
2. **`server.js` — gate the endpoints** (change guard from `if (mcpCheck.isMcp && !mcpCheck.verified)` to reject whenever `!mcpCheck.verified`), returning:
   ```json
   { "error": "credentials_missing",
     "message": "Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts",
     "startUrl": "https://www.fodda.ai/join-experts" }
   ```
   Endpoints: `POST /api/generate-questions` (~1509), `POST /api/prepare-voice-interview` (~2148), `POST /api/deep-research` (~4548), `GET /api/onboarding-prompts` (~2607), `GET /api/onboarding-themes` (~2468), `GET /api/onboarding-status` (~2509). (All already call the helper.)
3. **`pages/JoinExperts.tsx` — thread creds through:** fetch the user's key once (from Clerk via `/api/mcp-credentials`) at flow start, then add `x-api-key` + `x-user-id` headers to every onboarding fetch — currently anonymous at lines ~1260 (`onboarding-prompts`), ~1428 (`deep-research`), ~1598 (`generate-questions`), ~2970/2996/3059 (`prepare-voice-interview`). If no key is available (not signed in), show the "start at /join-experts / sign up" state instead of calling the endpoint.

**Already done this session (leave in place):** per-IP rate-limiting on `/api/generate-questions` and `/api/prepare-voice-interview` (backstop); and the admin endpoints now use a constant-time `ONBOARD_SECRET` env var instead of hardcoded `'fodda'` (unrelated; needs `ONBOARD_SECRET` set + callers updated before deploy).

## MCP changes — `Fodda MCP/src/toolHandlers.ts`
- Add a pre-flight credential check to the onboarding tools (`begin_expert_onboarding` + subsequent steps): if `apiKey` is empty, short-circuit and return the `message` above verbatim (with `startUrl`) — don't call the API.
- Ensure catch blocks propagate the server's `credentials_missing` `message` verbatim as plain text so the actionable link reaches the user in Claude.
- (`get_my_earnings` is NOT an onboarding step — leave it out of this gate.)

## Verification — must exercise the REAL flow
1. **Anonymous** request (no key, no signature) to each endpoint → `401` + `credentials_missing` payload.
2. **Browser flow end-to-end:** sign in on `/join-experts`, run the actual onboarding → every step succeeds (key threaded through). **This is the test the original plan lacked — it's what catches the site breaking.**
3. **MCP flow:** signed calls succeed + write Airtable; a tool invoked with no key renders the missing-credential message verbatim in Claude.
