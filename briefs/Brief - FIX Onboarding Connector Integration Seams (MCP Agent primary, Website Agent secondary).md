# Brief - FIX: Onboarding Connector Integration Seams (MCP Agent primary, Website Agent secondary)

> **For:** MCP Agent (findings 1, 2, 3-client, 4-client, 6-client, 7) + Website Agent (findings 3-server, 4-server, 5, 6-server).
> **Status:** BLOCKING — the deployed onboarding-via-connector flow **cannot complete a single step in production**. Every finding below was verified against live prod on 2026-07-10, with evidence. This is not a design review; the design matches the master brief. The integration seams were never wired or tested.
> **Context:** `Brief - Onboarding as a Connector (MASTER · MCP Agent coordinates).md` + its three sub-briefs. The Website half (gate page, Clerk-verified `/api/mcp-credentials`, mint-once token, `/api/onboarding-prompts`, `/api/onboarding-status`, Airtable fields) is built and verified working. The MCP↔backend seams are what's broken.
> **Acceptance for this brief = one scripted end-to-end run of the full tool flow against production.** "It compiles / deploys / registers" is explicitly NOT acceptance — that's how these bugs shipped.

---

## Verified findings

### F1 — FATAL: the minted connector URL is dead
`lookupExpertMcpCreds` (Website `server.js`) mints `https://mcp.fodda.ai/c/<token>` and the gate page shows it. But the MCP server has **no `/c/` route** — repo-wide grep of `Fodda MCP/src/` finds no handler, and live: `curl https://mcp.fodda.ai/c/test-token` → **404**. An expert who adds the connector fails at connect. The Website's `/api/mcp-tokens/:token` resolver is called by nothing.

**Fix (two stages):**
- **Stage 1 (unblock now, Website Agent):** make `lookupExpertMcpCreds` return the proven legacy URL — `https://mcp.fodda.ai/mcp?api_key=<apiKey>&user_id=<email>` — which the MCP already parses (`req.query.user_id`, `src/index.ts:598`). Keep minting/storing `mcpConnectionToken` for stage 2.
- **Stage 2 (MCP Agent):** add a `/c/:token` handler to the MCP HTTP layer: call Website `GET /api/mcp-tokens/:token` → `{ apiKey, email }` → enter the exact same server-creation path as the `?api_key=&user_id=` flow. Then switch the minted URL back.

### F2 — FATAL: 6 of 8 tools call the wrong host
`foddaRequest` targets `API_BASE_URL = https://api.fodda.ai` (`src/index.ts:38`). All onboarding endpoints live on **`https://www.fodda.ai`**. Live proof: `api.fodda.ai/api/onboarding-prompts` → **404**; `www.fodda.ai/api/onboarding-prompts` → **200**. Affects: `begin_expert_onboarding`, `submit_basic_info`, `run_deep_research`, `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, `get_onboarding_status`. Only `get_my_earnings` (`/v1/analysts/me/earnings`) targets the right host.

**Fix (MCP Agent):** add `WEBSITE_BASE_URL` env (default `https://www.fodda.ai`) + a `websiteRequest()` helper (or route-by-prefix inside `foddaRequest`: `/api/*` → website, `/v1/*` → API). Set the env var in the MCP Cloud Run service.

### F3 — HMAC schemes don't match, and the gate is optional
- MCP signs `timestamp + '.' + JSON.stringify(body)` (`src/index.ts:193-197`).
- Website verifies HMAC over the **raw body only** (`server.js` ~1367, ~1952, ~4263: `createHmac(secret).update(body)`).
- Result: every genuinely signed MCP POST → **401 "Invalid HMAC signature"**.
- Worse: the Website check is `if (sig) { ... }` — **no signature, no verification**. It rejects the real caller and admits everyone else.

**Fix (both):** pick ONE recipe — recommend the MCP's `timestamp.body` form (timestamp defeats replay). Website: verify `timestamp + '.' + rawBody` using `X-Fodda-Timestamp`, reject stale timestamps (>5 min), and make the signature **REQUIRED** whenever the request claims MCP origin (e.g. presence of `X-User-Id`) on these endpoints.

### F4 — identity never lands on the Website endpoints
MCP passes the user as `X-User-Id` header; Website endpoints never read it — they key off `email` in body/query:
- `submit_basic_info` POSTs `{action:'basic_info', name, role, knowledgeArea}` → endpoint requires `name` AND `email` → **400**. (Also: the endpoint has no `action` switch — that field is ignored; drop it or implement it.)
- `get_onboarding_status` sends no `?email=` → 400-path.

**Fix:** either (Website) resolve `X-User-Id` → email on HMAC-verified requests and inject it, or (MCP) pass `email` explicitly in body/query on every onboarding call — the connector identity IS the email (or resolves to it via the token). Pick one, apply consistently to all 7 tools.

### F5 — `get_detected_themes` calls a route that doesn't exist
Tool GETs `/api/generate-questions/themes`. No such handler in `server.js` (only `POST /api/generate-questions`). And the theme-derivation logic (`getReviewThemes` — expertise tiers + recurring tensions + Deep Research core areas) lives **client-side in `pages/JoinExperts.tsx`** with no server equivalent.

**Fix (Website Agent):** port `getReviewThemes` to `server.js` (inputs: the record's `expertTopicsRaw` + `deepResearchJson` — both already persisted) and expose `GET /api/onboarding-themes?email=…` (HMAC-gated per F3/F4). MCP repoints the tool.

### F6 — `confirm_themes` generates but never persists (silent core failure)
Tool POSTs only `{confirmedThemes}` to `/api/generate-questions`. Two problems:
1. The endpoint builds questions from `voiceStudy`/`expertTopics`/`name`/`knowledgeArea` in the request body — all absent → generic questions.
2. The endpoint **returns** questions without writing `interviewQuestions` to the Analyst record — in the wizard, the *client* persists them via `prepare-voice-interview`. So even a "successful" MCP call stores nothing, and the voice bot silently falls back to templates — defeating the entire theme-selection redesign.

**Fix (Website Agent, cleanest):** add a server-side path (flag on `/api/generate-questions` or a dedicated endpoint) that, given an identity (per F4): loads `voiceStudyRaw`/`expertTopicsRaw`/name/knowledgeArea **from the record**, generates with `confirmedThemes`, and **PATCHes `interviewQuestions` onto the record** before returning. MCP tool then just sends `{confirmedThemes}` + identity.

### F7 — `run_deep_research` POSTs an empty body
`/api/deep-research` needs the expert's name/links to sweep anything. Empty body → error or empty sweep.

**Fix:** same pattern as F6 — given identity, load the needed fields from the record server-side (or MCP passes them from `submit_basic_info` context).

### F8 — process: deployed from a dirty tree
`Fodda MCP` working tree has the onboarding changes uncommitted (`src/toolHandlers.ts` +156 lines, `src/index.ts`, `tools-manifest.json`). Commit before further work — deployed state must be reconstructable from git.

---

## Suggested order
1. **F1 stage 1** (legacy URL — Website, ~5 lines) → connector becomes addable immediately.
2. **F2** (host routing — MCP) → tools reach real endpoints.
3. **F3 + F4 together** (one auth/identity contract, both repos) — they're one seam.
4. **F6, F5, F7** (server-side load-from-record pattern — mostly Website, then MCP repoints).
5. **F8** commit; then the **acceptance run**.

## Acceptance (all against production)
1. Gate page → add connector in Claude → connector connects (no 404).
2. `begin_expert_onboarding` returns the two prompts.
3. `submit_basic_info` creates/updates the Analyst record (verify in Airtable).
4. `run_deep_research` kicks off a sweep; `get_onboarding_status` reflects progress.
5. `submit_expertise_analysis` persists `voiceStudyRaw`/`expertTopicsRaw` (verify in Airtable).
6. `get_detected_themes` returns real themes derived from the submitted data.
7. `confirm_themes` → **`interviewQuestions` populated on the Analyst record** (verify in Airtable — this is the one that silently no-ops today).
8. A voice interview dispatched for that record asks the confirmed questions (check `/api/voice-interview/questions?analystId=…` returns the stored set, not templates).
9. An unsigned/forged request to the HMAC-gated endpoints is rejected (401).

## What NOT to touch
- The Website gate page + `/api/mcp-credentials` Clerk verification (just shipped, verified: 401s unauthenticated/email-only callers).
- The token mint-once logic (just fixed).
- `get_my_earnings` — descoped to `Brief - Expert Earnings Tool (API + MCP Agent).md`; leave wired but out of onboarding acceptance.
- The deterministic voice-interview spine and scheduling flow (live and verified).
