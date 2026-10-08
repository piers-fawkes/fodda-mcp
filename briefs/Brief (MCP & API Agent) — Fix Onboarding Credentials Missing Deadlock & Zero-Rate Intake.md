# Brief: MCP & API Agents — Fix Onboarding Credentials Missing Deadlock & Zero-Rate Intake

> **Priority:** 🔴 Critical / Blocker (Fixes Claude MCP onboarding dead-end)  
> **Target Repos:** `Fodda MCP` & `Fodda API`  
> **Target Files:**
> - `Fodda MCP/src/toolHandlers.ts`
> - `Fodda MCP/src/tools.ts`
> - `Fodda API/Fodda/functions/tracking/airtable.ts`
> - `Fodda API/Fodda/functions/v1/analysts.ts`
> - `CHANGELOG.md` in both repos

---

## 1. Problem Statement

During onboarding in Claude (reported by Carlyn Bushman on October 7, 2026), experts are completely blocked from onboarding conversational flow:
> *"I couldn't do the onboarding inside of Claude... It worked for account lookups. But every onboarding call returned credentials missing. So I switched over to the web form."*

### Root Causes:
1. **The Chicken-and-Egg Credential Gate:**
   - In `Fodda MCP/src/toolHandlers.ts` (lines 8238, 8330, 8486, etc.), onboarding tools (`begin_expert_onboarding`, `submit_mcp_source`, `get_detected_themes`, `confirm_themes`, `finalize_byo_mcp_onboarding`) explicitly check:
     ```typescript
     if (!apiKey) {
       return formatOnboardingError(null, { code: 'credentials_missing' });
     }
     ```
   - A prospective expert who installs the Fodda MCP in Claude to become an expert **does not have a Fodda API key yet**.
   - Checking `if (!apiKey)` hard-blocks them before they can submit their name, email, or basic info to *receive* their key.
2. **Onboarding Calls Decrementing Credit Allowances:**
   - Onboarding profile generation and self-testing currently debit queries from the user's trial quota, quickly burning up their initial allowance (Carlyn burned 80 queries during her setup session).

---

## 2. Required Implementation Details

### A. Fodda MCP (`Fodda MCP/src/toolHandlers.ts`)

1. **Allow Pre-Credential Identity Handshake in Onboarding Tools:**
   - For all onboarding lifecycle tools (`begin_expert_onboarding`, `submit_basic_info`, `expert_onboarding_research`, `get_onboarding_status`, `get_detected_themes`, `confirm_themes`):
   - Do **NOT** hard-block if `!apiKey`.
   - Instead, accept the expert's email (`userEmail` or `userId` parameter) as the intake identity.
   - Forward the request to the API with an onboarding source tag (`intakeSource: 'mcp_conversational'`).

2. **Update `foddaRequest` for Onboarding Routes:**
   - In `foddaRequest`, allow unauthenticated or pre-auth onboarding endpoints (e.g. `/api/onboard-expert`, `/api/onboarding-status`) to pass a system onboarding header or forward the declared email when `apiKey` is empty:
   ```typescript
   // Allow pre-key onboarding tools to communicate with Fodda backend
   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
   if (apiKey) {
     headers['X-API-Key'] = apiKey;
   } else {
     headers['X-Onboarding-Session'] = 'pre_auth_mcp';
   }
   ```

3. **Auto-Provision API Key Upon Basic Info Submission:**
   - When `begin_expert_onboarding` / `submit_basic_info` runs with a valid email:
     - The backend provisions a draft expert record and returns an onboarding session token / live API key.
     - MCP stores this in session state so subsequent onboarding calls within the conversation are fully authenticated.

---

### B. Fodda API (`Fodda API`)

1. **Zero-Rate All Onboarding & Intake API Calls:**
   - In `functions/tracking/airtable.ts` and `functions/tracking/metering.ts`:
   - Any request tagged with `source: 'onboarding'` or calling `/api/onboard-expert`, `/api/onboarding-themes`, or `/api/onboarding-status` must be **zero-rated** (`billableUnits: 0`).
   - Testing one's own newly created Human Agent during the onboarding session must be comped (`billingClass: 'promo'`).

2. **Permit Pre-Auth Onboarding Intake:**
   - Ensure the onboarding intake router allows new experts to submit basic info (Name, Email, Knowledge Area) without requiring an existing `X-API-Key` in the database.

---

## 3. Verification Checklist

1. **Clean Room Claude MCP Test:**
   - Connect Fodda MCP without an active `FODDA_API_KEY` configured in the client.
   - Run `begin_expert_onboarding(name: "Test Expert", email: "test@example.com", knowledgeArea: "Retail Systems")`.
   - Verify the tool successfully creates the draft record and advances to `expert_onboarding_research` without returning `credentials_missing`.
2. **Quota Verification:**
   - Verify in Airtable (`Token Log`) that onboarding tool calls record `billableUnits: 0` and do not increment `queriesUsedThisCycle`.
3. **Changelog:**
   - Update `CHANGELOG.md` in both `Fodda MCP` and `Fodda API`.
