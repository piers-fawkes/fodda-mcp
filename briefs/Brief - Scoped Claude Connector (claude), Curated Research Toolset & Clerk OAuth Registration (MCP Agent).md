# Brief: Scoped Claude Connector (/claude), Curated Research Toolset & Clerk OAuth Registration (MCP Agent)

Owning repo: **Fodda MCP** · Agent: **mcp-agent** (with Clerk/API verification)  
Date: **2026-10-12** · Priority: **High**  
Execution Handle: `/build-from-brief "briefs/Brief - Scoped Claude Connector (claude), Curated Research Toolset & Clerk OAuth Registration (MCP Agent).md"`

---

## 1. Context & Motivation

### The Anthropic Review Deadlock & John Farrall's Feedback
1. **The 55-Tool Monolith:**
   - Fodda's default `/mcp` currently exposes **55 tools** in a single server.
   - Mixed into this payload are **11 expert onboarding write tools** (`begin_expert_onboarding`, `submit_basic_info`, `schedule_interview`, etc.) and **account mutating tools** (`sign_up_free_account`, `update_user_profile`, `toggle_graph_preference`).
   - Anthropic's Software Directory Review criteria strictly red-flags:
     - Connectors that flood Claude's context window with 50+ tools.
     - Connectors that mix internal administrative/creator-onboarding actions into an informational research connector.
     - Connectors with un-scoped write permissions.
2. **User Audit (John Farrall, *Alternative Data Weekly*):**
   > *"The tool list is long for a researcher. The connector shows 55 tools: 40 reads and 15 that write or act. The write tools include the whole expert-onboarding flow, account creation, scheduled reports and the bring-your-own-MCP steps. As a researcher I turned those off. A separate connector, or a mode, for experts versus researchers would make the trust decision easier."*
3. **The Proven Precedent (`/chatgpt`):**
   - When submitting to OpenAI, we created a scoped offering endpoint: `https://mcp.fodda.ai/chatgpt`.
   - In `src/index.ts:389–421`, `OFFERING_SCOPED_TOOLS['chatgpt']` automatically **suppresses 24 tools**, exposing **only 31 clean, read-only research tools** (graphs, earnings, supplemental macro data, human agents, deep research).
   - We must apply this exact pattern for Claude by creating **`https://mcp.fodda.ai/claude`**.

---

## 2. What to Build in `Fodda MCP`

### A. Dedicated Scoped Offering: `/claude` (`src/index.ts`)

1. **Define `OFFERING_SCOPED_TOOLS['claude']`:**
   Curate a focused, read-only researcher toolset (~25 tools):
   ```typescript
   'claude': [
       'get_capabilities',
       // Core Graph Search & Evidence
       'search_graph',
       'search_statistics',
       'search_insights',
       'get_validated_trends',
       'get_evidence',
       'get_node',
       'get_neighbors',
       'get_label_values',
       'list_graphs',
       // Company & Earnings Intelligence
       'brand_tracker',
       'get_company_earnings',
       'get_earnings_intelligence',
       'get_earnings_divergence',
       // Deep Research & Autonomous Synthesis
       'deep_research_topic',
       'check_research_status',
       // Expert Consultation
       'find_expert',
       'consult_analyst',
       'consult_human_agent',
       'list_analysts',
       // Fact & Claim Verification
       'verify_claim',
       'verify_market_claim',
       // Supplemental Macro Data & Web Reading
       'get_supplemental_context',
       'check_supplemental_status',
       'read_url',
       // Account & Output
       'get_my_account',
       'generate_visual',
   ],
   ```
2. **Explicitly Excluded on `/claude`:**
   - All 11 expert onboarding tools (`begin_expert_onboarding`, `expert_onboarding_research`, `get_onboarding_status`, `submit_basic_info`, `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, `schedule_interview`, `request_deliverable`, `check_deliverable_status`, `get_my_earnings`).
   - All mutating account/admin tools (`sign_up_free_account`, `update_user_profile`, `toggle_graph_preference`, `manage_scheduled_reports`, `send_feedback`).
3. **Route Mounting (`src/index.ts`):**
   - Add `'/claude'` and `'/claude/'` to `app.all(['/mcp', ..., '/claude', '/claude/*'])`.
   - Mount offering card metadata in `OFFERING_CARD_METADATA`:
     ```typescript
     'claude': {
         name: 'ai.fodda/claude',
         title: 'Fodda Market & Earnings Intelligence for Claude',
         description: 'Expert-curated knowledge graphs, company earnings transcripts, and live macroeconomic data for Claude.',
     },
     ```

### B. RFC 9728 Discovery & OAuth Metadata (`src/index.ts`)

1. **Protected Resource Metadata:**
   Ensure `GET /.well-known/oauth-protected-resource/claude` returns:
   ```json
   {
       "resource": "https://mcp.fodda.ai/claude",
       "authorization_servers": ["https://clerk.fodda.ai"]
   }
   ```
2. **Discovery Card:**
   Ensure `GET /.well-known/claude` and `GET /.well-known/claude.json` return the clean server card with tools restricted to `OFFERING_SCOPED_TOOLS['claude']`.

---

## 3. Critical Verification: Clerk OAuth & New User Sign-Up Flow

When Anthropic reviewers test the connector, or when a brand-new user connects from Claude, they sign up through Clerk OAuth. The agent must verify the full sign-up chain:

### The 5-Step Clerk Sign-Up Audit:
1. **Dynamic Client Registration (DCR):**
   - Verify `POST https://clerk.fodda.ai/oauth/register` accepts Claude's registration without requiring pre-shared secrets.
2. **First-Factor Sign-Up Strategy:**
   - In `Fodda/frontend/components/AuthGate.tsx` and Clerk dashboard, verify that new sign-ups support standard email verification (`email_code`) and OAuth SSO (Google/LinkedIn) without requiring forced MFA or broken SMS steps.
3. **OAuth Consent Screen Handoff:**
   - Verify Clerk's `display_config.oauth_consent_url` (`https://app.fodda.ai/oauth-consent`) correctly renders the consent card, allows the user to click "Authorize", and redirects back to Claude with the authorization code.
4. **Auto-Provisioning in `POST /v1/auth/clerk-resolve` (`Fodda API`):**
   - When Claude exchanges the auth code for a Clerk JWT and sends `Bearer <token>` to `mcp.fodda.ai/claude`:
   - MCP calls `POST /v1/auth/clerk-resolve` with `{ clerk_jwt }`.
   - `resolveAirtableUser` in `Fodda API/Fodda/functions/v1/auth.ts`:
     - Must automatically create the new user record in Airtable (`tblxZP6AkFkV1LL2T` / `Users`).
     - Must create an Account with trial credits (`plan: 'free'`, `creditsRemaining: 100`).
     - Must provision a valid `sk_live_...` API key.
     - Must return `{ api_key, user_id, plan }` without failing or timing out.
5. **No 401 Loop:**
   - Verify that once resolved, subsequent tool calls on `/claude` use the resolved API key seamlessly from the in-memory token cache.

---

## 4. Files Expected to Change

- **Fodda MCP:**
  - `src/index.ts` (add `'claude'` offering slug, route handler, discovery metadata)
  - `tools-manifest.json` (sync profiles)
  - `README.md` (add Claude Connector section pointing to `https://mcp.fodda.ai/claude`)
  - `CHANGELOG.md` (document release)
- **Fodda API (Verification only):**
  - Verify `functions/v1/auth.ts` `clerk-resolve` auto-provisioning under new sign-up conditions.

---

## 5. Verification & Acceptance Criteria

1. **Unauthenticated Check:**
   - `curl -i -X POST https://mcp.fodda.ai/claude` returns `HTTP 401` with `WWW-Authenticate` pointing to `https://mcp.fodda.ai/.well-known/oauth-protected-resource/claude`.
2. **OAuth Discovery Check:**
   - `curl https://mcp.fodda.ai/.well-known/oauth-protected-resource/claude` returns:
     `{"resource":"https://mcp.fodda.ai/claude","authorization_servers":["https://clerk.fodda.ai"]}`.
3. **Scoped Tool Count Check:**
   - When authenticated via Inspector or token on `/claude`, `tools/list` returns **exactly the ~25 curated research tools**.
   - Confirm **0** onboarding tools and **0** mutating tools are listed.
4. **New User Sign-Up Simulation:**
   - Run a test script simulating a fresh Clerk JWT through `/v1/auth/clerk-resolve` to confirm auto-provisioning and trial credit allocation succeed end-to-end.
