# Brief: Clarify Audio Interview Substantive Framing (MCP Agent)

> **Execution handle:** `/build-from-brief briefs/Brief MCP Agent — Clarify Audio Interview Substantive Framing.md`  
> **Target repo:** `Fodda MCP` (`/Users/piersfawkes/Documents/Fodda MCP`)

---

## Context

When onboarding an expert through Claude via the Fodda MCP connector, the introductory messaging and tool descriptions phrase the upcoming audio interview as a brief tone/audio check rather than a substantive interview (e.g., `begin_expert_onboarding` says: *"...then we run an AI probe of your expertise and tone of voice, and later run a short AI audio interview"*).

Experts (such as James Colistra) have reported entering the process believing the interview is only to capture their voice/accent, rather than to test working theories, explore forward predictions, and fill gaps in their knowledge profile.

We need to align all MCP tool descriptions, introductory warnings, and stepper stage names with the substantive "Expertise Deep-Dive" framing.

---

## What to Build

### 1. `src/toolHandlers.ts` — Flow Intro & Stepper Stage Names
- **`begin_expert_onboarding` Introductory Text (`identityWarning` string):**
  - **Change from:**  
    `"...then we run an AI probe of your expertise and tone of voice, and later run a short AI audio interview. You'll get to review everything before anything is submitted."`  
  - **Change to:**  
    `"...then we run an AI probe of your expertise and reasoning style, and finally schedule a 15–20 minute audio interview to explore your forward-looking predictions, contrarian views, and practical problem-solving — filling the gaps that chat history alone cannot capture. You'll get to review everything before anything is submitted."`
- **Flow Stepper Stage 6 Labels:**
  - Across `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, and `schedule_interview`, update instructions where Stage 6 is rendered.
  - Change stage 6 name from `"Audio interview"` / `"Audio interview (join now)"` → `"Expertise Deep-Dive (Audio)"`.

### 2. `src/toolHandlers.ts` — Tool Descriptions
- **`confirm_themes` Description:**
  - Clarify that confirming themes generates a questionnaire tailored to probe forward predictions, contrarian industry stances, and practical methodology edge cases for their live deep-dive interview.
- **`schedule_interview` Description & Prompts:**
  - Update description to clarify that scheduling books their ~15–20 minute expertise deep-dive interview with the Fodda AI interviewer.

---

## Where to Register

- MCP tool descriptions and handlers in `src/toolHandlers.ts`.

---

## Definition of Done

- `npm run build` (or `npm test`) passes in `Fodda MCP`.
- `begin_expert_onboarding` presents the updated flow description highlighting the substantive nature of the audio interview.
- Stepper stage 6 and tool descriptions consistently refer to the session as `"Expertise Deep-Dive (Audio)"`.
- `CHANGELOG.md` in `Fodda MCP` updated with the change.

---

## Do Not

- Do not modify tool names (`begin_expert_onboarding`, `submit_basic_info`, `expert_onboarding_research`, `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, `get_onboarding_status`, `schedule_interview`).
- Do not alter tool schema input parameter names or types (breaking changes to MCP clients).
- Do not modify HMAC signature verification or billing logic.

---

## Files Expected to Change

- `src/toolHandlers.ts`
- `CHANGELOG.md`
