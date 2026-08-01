# Brief — Clerk OAuth Identity Resolution and Skills API Metadata (API Agent)

**Target Repo:** Fodda API (`piers-fawkes/fodda-api`)  
**Addressed To:** API Agent  
**Context:** Fodda MCP Directory Remediation Plan for Claude Connectors Directory.

---

## 1. Overview & Objectives

To support the directory-listed MCP connector (`fodda-mcp`), the API repo must expose two key capabilities:

1. **Clerk `userId` Identity Resolution**: An endpoint allowing the MCP server to resolve a validated Clerk `userId` into the user's corresponding Fodda API key and account status.
2. **Skills API Metadata Expansion**: Update `GET /v1/skills/{id}/tools` to include per-tool directory visibility flags (`directory_visible`), MCP behavioral annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and full JSON input schemas.

---

## 2. Requirements

### Task A: Clerk OAuth Resolution Endpoint (`POST /v1/auth/clerk-resolve`)

> **CRITICAL — the input is the raw Clerk OAuth access token, NOT a `clerkUserId`.**
> The MCP server (already implemented — `src/index.ts` ~630-655 in the MCP repo) forwards the bearer token it received from the client and does **no verification of its own**. This endpoint is the ONLY place in the chain where the token is verified. It must cryptographically verify the token with Clerk — never decode-and-trust. Accepting an unverified `clerkUserId` (or decoding the JWT without signature verification) would let anyone with a forged token resolve to a real account's API key.

- **Route:** `POST /v1/auth/clerk-resolve` (this is what the MCP server calls — match it exactly)
- **Auth:** the MCP server sends header `X-Internal-Key: <FODDA_INTERNAL_API_KEY>` — validate it (transport-level protection; does NOT replace token verification below)
- **Input:** `{ "clerk_jwt": string }` — the Clerk OAuth access token exactly as received from the MCP client (field name is `clerk_jwt` in the already-shipped MCP code; keep it even if the token turns out to be opaque)
- **Verification (required):** use the Clerk backend SDK (`@clerk/backend` / `@clerk/express` already in this repo) to verify the token — signature against Clerk's JWKS, issuer, expiry, and (if configured) audience. Do NOT hand-roll JWT decoding. Note: Clerk OAuth access tokens may be opaque rather than JWTs depending on configuration — the Clerk SDK's verification/introspection handles both; confirm actual token format against the Clerk dashboard OAuth application during testing and report back, since the MCP side currently detects OAuth tokens by the `eyJ` JWT prefix and must be corrected if tokens are opaque.
- **Response (200)** — the MCP server reads `api_key` and `user_id` (snake_case, exactly these names); the rest is optional context:
  ```json
  {
    "api_key": "sk_live_...",
    "user_id": "user@example.com",
    "clerk_user_id": "user_...",
    "plan": "pro",
    "credits_remaining": 450,
    "status": "active"
  }
  ```
  `user_id` should be the Fodda-side user identifier (email today — it's used for tracking/billing attribution downstream). A 200 without `api_key` is treated as a failed resolution (MCP returns 401 to the client).
- **Error semantics (the MCP server already handles these):** `401` invalid/expired/unverifiable token; `404`/`501` reserved — the MCP server interprets these as "endpoint not yet deployed" and surfaces a 501 to the user, so never use 404 for "user not found".
- **Behavior:** After verification, extract the Clerk userId from the verified claims and look up the Airtable record mapping `clerkUserId` -> Fodda user (mapping already maintained by the existing Clerk webhook). If no Fodda user exists yet, auto-provision a free account & API key (reuse the `user.created` webhook logic) rather than erroring. Return structured status.
- **Performance — IMPORTANT:** the MCP server currently calls this on **every HTTP request** to `/mcp` (not once per session), so this endpoint is on the hot path of every message an OAuth user sends. A server-side cache keyed by token hash (TTL ≤ 5 min, never longer than token expiry) is REQUIRED, not optional. (An MCP-side per-session cache is a known follow-up in the MCP repo; until it lands, assume full per-request traffic.)

### Task B: Skills API Metadata & Filtering (`GET /v1/skills/{id}/tools`)
- **Endpoint:** `GET /v1/skills/{id}/tools` (or equivalent skills tool catalog endpoint)
- **Response Schema Additions per Tool:**
  ```json
  {
    "name": "get_company_earnings",
    "description": "...",
    "directory_visible": true,
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "inputSchema": { ... }
  }
  ```
- **Directory Visibility Rules:**
  - `directory_visible: true`:
    1. `get_company_earnings`
    2. `get_validated_trends`
    3. `draft_linkedin_post`
    4. `draft_linkedin_article`
    5. `get_capabilities`
    6. `paralogy_divergent-thinking-tools-router`
  - `directory_visible: false` (Exclude from directory build, available on expert connections only):
    1. `begin_expert_onboarding`
    2. `expert_onboarding_research`
    3. `get_onboarding_status`
    4. `submit_basic_info`
    5. `submit_expertise_analysis`
    6. `get_detected_themes`
    7. `confirm_themes`
    8. `schedule_interview`
    9. `request_deliverable`
    10. `check_deliverable_status`
    11. `get_my_earnings`

---

## 3. Files Expected to Change (in Fodda API repo)
- `functions/v1/auth.ts` (or auth router)
- `functions/v1/skills.ts` (or skills router)
- `CHANGELOG.md`
