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

### Task A: Clerk OAuth Resolution Endpoint (`GET /v1/auth/clerk-resolve`)
- **Route:** `GET /v1/auth/clerk-resolve` or `POST /v1/auth/clerk-resolve`
- **Auth:** HMAC signed via `FODDA_MCP_SECRET` (from MCP server) or internal service token.
- **Input:** `{ clerkUserId: string }`
- **Response:**
  ```json
  {
    "clerkUserId": "user_...",
    "email": "user@example.com",
    "apiKey": "sk_live_...",
    "plan": "pro",
    "creditsRemaining": 450,
    "status": "active"
  }
  ```
- **Behavior:** Look up Airtable / Firestore record mapping `clerkUserId` -> Fodda user. If user doesn't exist yet, auto-provision a free account & API key (reusing existing onboarding/clerk webhook logic). Return structured status.

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
