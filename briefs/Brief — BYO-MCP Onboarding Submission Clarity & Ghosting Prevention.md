# Brief — BYO-MCP Onboarding Submission Clarity & Ghosting Prevention

**For:** mcp-agent (Fodda MCP repo)  
**From:** Piers & Antigravity (post-incident investigation: Steve Bryant BYO-MCP onboarding, Sep 14, 2026)  
**Status:** Ready  
**Execution:** `/build-from-brief briefs/Brief — BYO-MCP Onboarding Submission Clarity & Ghosting Prevention.md`  

---

## Context

An expert (Steve Bryant, `steve@thisisdelightful.com`) attempted to onboard his Bring-Your-Own-MCP endpoint (`https://games.thisisdelightful.com/mcp`) via Claude Desktop / Claude MCP. Steve reported that he had completed onboarding and submitted his expert.

Investigation across Cloud Run logs and Airtable confirmed:
1. **User Account Created:** Steve logged into `app.fodda.ai` on 2026-09-14 at 17:05:44 UTC (`rect8lKC94Xxcebdx`).
2. **Onboarding Funnel Stalled at Stage 1:** A record was created in Airtable's `Onboarding Funnel` table (`tblLm9DApWgu8xFls`, `recHFaWIZSrDIvQuN`) at 17:16:13 UTC via channel `claude-mcp`, but its stage remains **`1. Started onboarding`**.
3. **No Downstream Tools Ever Executed:** Neither `submit_basic_info`, `submit_mcp_source`, nor `finalize_byo_mcp_onboarding` were ever executed. No record was created in the `Analysts` table (`tblvrKdn8FvbSJmSs`).
4. **False Sense of Completion:** Steve was under the impression that he was finished because Claude informed him that his URL was recorded and his profile was submitted for review.

### Root Causes in `fodda-mcp`

1. **Misleading "Saved As You Go" Prompt Copy:**
   - In `src/systemPrompt.ts:103`:
     > *`BYO-MCP branch: Accurately inform the expert: "Each step is saved as you go. Your MCP URL is recorded when you connect it, and your Human Agent profile will go live after administrative review."`*
   - In `src/systemPrompt.ts:112`:
     > *`BYO-MCP branch: Remind them: "No problem — your basic info and connected MCP endpoint are saved as you go. You can return to this conversation at any time to confirm your topics and submit."`*
   - In `src/toolHandlers.ts:5558` (`begin_expert_onboarding`):
     > *`Each step is saved as you go; your MCP URL is recorded when you connect it, and your Human Agent goes live after review.`*
   - **Reality:** Nothing in BYO-MCP is saved to Airtable or Fodda's database until the final tool `finalize_byo_mcp_onboarding` executes (posting to `/api/onboard-expert`). `submit_mcp_source` only performs a transient probe against `/api/probe-mcp`. Telling the expert *"Your MCP URL is recorded when you connect it"* leads both the LLM and the user to believe the submission is complete the moment the URL is shared.

2. **No Guard Against LLM Premature Completion Hallucination:**
   - When users provide their name, role, and MCP URL in chat, Claude conversationalizes the response (*"Great, I've recorded your URL and your profile has been submitted for review!"*) instead of executing the required tool chain.
   - Claude's UI only shows Claude's markdown text to the user, masking whether tool calls actually ran.

3. **Silent Drop at the `termsAccepted` Gate:**
   - `finalize_byo_mcp_onboarding` requires `termsAccepted: true`. Unless Claude explicitly pauses to ask the user to accept the Terms of Service (`https://www.fodda.ai/terms`) and Privacy Policy (`https://www.fodda.ai/privacy`), it cannot call the finalization tool, and often chooses to summarize rather than ask.

---

## What to Build

### 1. Eliminate "Saved As You Go" Copy
- In `src/systemPrompt.ts` (lines ~103, ~112) and `src/toolHandlers.ts` (lines ~5558, ~5750):
  - **Remove all text claiming "saved as you go" or "your MCP URL is recorded when you connect it".**
  - Replace with clear, honest persistence copy matching the reality:
    > *"Nothing is saved to Fodda until you complete all steps and explicitly submit at the end. Your MCP URL and profile live only in this conversation until final submission."*
  - For pause/resume in BYO-MCP:
    > *"No problem — if you need to pause, please return to this same conversation to finish connecting your MCP and submit. Nothing is saved on Fodda's servers until the final submission step."*

### 2. Strict Negative Constraint Against Premature Completion Claims
- In `src/systemPrompt.ts` under `BYO-MCP SAFEGUARDS`:
  - Add a hard guardrail:
    > **NEVER CLAIM SUBMISSION OR REVIEW STATUS WITHOUT TOOL EXECUTION:** The agent MUST NEVER inform the expert that their profile has been submitted, recorded, or sent for administrative review unless and until `finalize_byo_mcp_onboarding` has actually returned `{ status: "submitted_for_review" }`. If the tool has not been called or returned an error, the agent MUST state what step is still required (e.g. probing the URL, confirming topics, or accepting terms).

### 3. Streamlined BYO-MCP Execution Path
- Update `src/systemPrompt.ts` and tool next-step instructions:
  - When the user provides an MCP URL and basic info, instruct Claude to:
    1. Call `submit_basic_info` and `submit_mcp_source` immediately.
    2. Display the discovered tools and derived topics.
    3. Explicitly ask for Terms acceptance: *"To complete submission, please confirm that you accept the Fodda Terms of Service (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy)."*
    4. Call `finalize_byo_mcp_onboarding` with `termsAccepted: true`.

---

## Definition of Done

1. Grep verification: Zero occurrences of `"saved as you go"` or `"is recorded when you connect it"` in `src/systemPrompt.ts` and `src/toolHandlers.ts`.
2. Unit / transcript test: Add a test scenario verifying that when an expert provides an MCP endpoint, the agent:
   - Does NOT tell the user their URL is saved before `finalize_byo_mcp_onboarding`.
   - Prompts for explicit `termsAccepted` consent.
   - Refuses to declare "submitted for review" unless `finalize_byo_mcp_onboarding` has executed and returned `status: "submitted_for_review"`.
3. `CHANGELOG.md` updated in `Fodda MCP`.
4. `npm run build` cleanly passes.

---

## Files Expected to Change

- `src/systemPrompt.ts` (remove false persistence copy; add negative constraint on completion claims; clarify terms gate)
- `src/toolHandlers.ts` (update `begin_expert_onboarding`, `submit_mcp_source`, and `finalize_byo_mcp_onboarding` copy and guidance)
- `CHANGELOG.md`
