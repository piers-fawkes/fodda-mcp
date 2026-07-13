# Brief — Onboarding Endpoints and Prompt Single Source (API Agent)

> **Context:** This is a sub-brief decomposed from `Brief - Onboarding as a Connector (MASTER · MCP Agent coordinates).md`.
> **Target repo:** `Fodda Website` (for in-place endpoint exposure) and `Fodda API` (for earnings integration if needed).
> **Sequencing:** Do this FIRST. The MCP tools depend on these endpoints.

**Status:** Ready for API Agent pickup.

## 1. Goal

Your objective is to expose the required backend endpoints to support the conversational "Onboarding as a Connector" flow. You are the **spine** that the MCP tools will call. 

**CRITICAL CONSTRAINT:** Do **NOT** migrate the existing live onboarding endpoints (`/api/prepare-voice-interview`, `/api/deep-research`, `/api/generate-questions`) out of the live Website `server.js`. That is too risky and out of scope. You must expose them **in-place** as the shared API, and only build what is genuinely new.

## 2. Work Required

### A. Prompt Single Source
Extract the prompt strings (`getPromptA`, `getPromptB`) from the React components in `JoinExperts.tsx` into a single backend API endpoint (e.g., `GET /api/onboarding-prompts`). 
- This ensures the web wizard and the MCP connector share one source of truth.
- This endpoint must return the **full prompt text**, not just a thin instruction. The MCP agent will run this text verbatim.
- Coordinate with `Brief Website Facilitator Onboarding Mode and Prompt Single Source.md` (Part B).

### B. In-Place API Exposure
Ensure the following endpoints in `Fodda Website/server.js` can be cleanly consumed by the MCP tools:
- `/api/prepare-voice-interview` (writes `voiceStudyRaw`, `expertTopicsRaw`)
- `/api/deep-research`
- `/api/generate-questions` (Note: the theme-selection backend and the `interviewQuestions` field were already shipped — this endpoint already accepts `confirmedThemes` and stores the questionnaire).

### C. Auth / Trust Mechanism (Phase 1 Token Architecture)
Implement the Phase 1 Token Architecture to definitively solve the identity trust blocker without friction.
- **DECISION:** Do NOT implement an Email OTP or magic link flow. It is redundant and adds friction.
- **MANDATORY READING:** Read `Brief MCP Identity and URL Scheme.md` first. It directly governs `user_id` and connector identity. 
- You must build the token store mapping an opaque connection token (`{token}`) to an `{ internal_user_id }`.
- When the MCP Connector makes a request using its token, the backend will derive the identity from the token itself, intrinsically solving the trust blocker.

### D. Status Read
Implement the read endpoint/logic for the MCP `get_onboarding_status` tool.
- **Status:** Read the `Status` field from the Analyst Airtable record.
- *Note:* Scope is strictly onboarding status. Do not expand to profile edits (use the existing `update_user_profile` tool).
- **Earnings moved out** (Piers, 2026-07-09): `/v1/analysts/me/earnings` + `get_my_earnings` are post-onboarding account admin, not onboarding — now tracked in `Brief - Expert Earnings Tool (API + MCP Agent).md`. (Heads-up: the built endpoint reads a guessed Airtable table rather than the SPT/payout ledger it was told to use — that correction belongs to the earnings brief.)

## 3. Implementation Details
- **State Store:** All state lives in the Airtable Analyst record. Ensure endpoints immediately persist data so the MCP session remains stateless.
- **Existing Work:** Step 5 (scheduling) is already built (`schedule_interview` via Recall) and owned by the Website repo. You do not need to build it.
