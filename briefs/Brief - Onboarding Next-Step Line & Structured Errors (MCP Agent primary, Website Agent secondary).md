# Brief — Onboarding Next-Step Line & Structured Errors

**For:** mcp-agent (Fodda MCP), with the Website agent for `/api/onboarding-status` and error bodies in `server.js`
**From:** Piers & Claude Code (review of the Pitch Protocol onboarding research, 2026-10-02)
**Status:** Ready. It's independent of the consent brief, but if both run, run the consent brief first so the copy lands once.
**Execution:** `/build-from-brief briefs/Brief - Onboarding Next-Step Line & Structured Errors (MCP Agent primary, Website Agent secondary).md`

---

## Context

- **No next step from the status call.** `get_onboarding_status` (`src/toolHandlers.ts:7496`) passes through `{ status, analystId, displayName }` from `GET /api/onboarding-status` (Website `server.js:5109`; status derived at 5182-5193). Nothing tells the agent or the expert what to do next, so an expert who resumes depends on the agent guessing.
- **`schedule_interview` stops the chain.** It (7522) returns no `next_step`, so the chain goes quiet after scheduling.
- **Errors are plain strings.** Onboarding tool errors are `{ isError:true, content:[{ text: parseWebsiteError(err) }] }` (6993-6996). There is no machine-readable code, so the agent can't branch, and recovery advice is buried in prose. The Website already returns some codes (e.g. `credentials_missing`), but the MCP drops them.

Pitch Protocol's `get_status` returns a `nextAction` sentence and says "read it to them verbatim". **Don't copy that wording.** On 2026-09-03, Claude refused our onboarding tool output because it read like injected instructions (`briefs/Brief - Expert Onboarding Tool Output Reads as Injection…md`). The next step must read as **data about state**, not a command aimed at the model.

The research also proposes sharing this error and next-step format with the user-facing MCP tools. This brief defines the format; keep it generic so the consult tools can adopt it unchanged later.

## What to build

### Website: `GET /api/onboarding-status`

Add three fields alongside the existing `status`:

```json
{
  "status": "analysis_submitted",
  "next_tool": "get_detected_themes",
  "next_action": "Review the themes Fodda found in your work and confirm the ones that fit, so we can prepare your interview questions."
}
```

| status | next_tool | next_action (expert-facing, plain English) |
|---|---|---|
| not_started | begin_expert_onboarding | "Start onboarding to set up your Human Agent." |
| basic_info_submitted | expert_onboarding_research | "Next, Fodda researches your published work so your interview can focus on your thinking, not your CV." |
| research_complete | submit_expertise_analysis | "Share your voice study and expertise map so we can find your core themes." |
| analysis_submitted | get_detected_themes | "Review the themes Fodda found in your work and confirm the ones that fit, so we can prepare your interview questions." |
| awaiting_interview (no bot booked) | schedule_interview | "Book your 15–20 minute expertise interview, now or at a time that suits you." |
| awaiting_interview (bot booked: Recall Bot ID present) | (none) | "Your interview is booked for <Recall Join At, expert's timezone if known>. The interviewer will join your Google Meet." |
| pending_approval | (none) | "You're done. Fodda is reviewing your Human Agent and will email you before it goes live." |
| active | (none) | "Your Human Agent is live." |

- Add the "bot booked" distinction (Recall Bot ID / Recall Join At are already on the record, `server.js:7670-7787`).
- Keep the sentences short. Never mention prices, tokens or internal stage names.

### MCP

1. **`get_onboarding_status`:** render the result as prose: "**Where you are:** <status label>. **Next step for you:** <next_action>". Put `next_tool` in the JSON block for the agent.
   - Description wording: "`next_action` describes the expert's next step in plain English; relay it in your own words."
   - Don't use "read verbatim" or any imperative aimed at the model.
2. **`schedule_interview`:** on success, add `next_step: null` and the text "After the interview, Fodda reviews your Human Agent and emails you. You can check progress any time with get_onboarding_status."
3. **Structured errors for all ten onboarding tools.** Keep `isError:true` and the prose text, and add a fenced JSON block (or `structuredContent` where the SDK supports it):
   ```json
   { "error": { "code": "terms_required", "cause": "Terms not accepted yet.", "next_action": "Ask the expert to accept the Terms and Privacy Policy, then call submit_basic_info again." } }
   ```
   - Map Website error bodies to codes in `parseWebsiteError`. Fall back to `upstream_error` and keep the original message in `cause`.
   - Initial code set:

   | code | Source |
   |---|---|
   | `credentials_missing` | existing (401 on prepare-voice-interview) |
   | `terms_required` | consent brief |
   | `record_not_found` | no Analysts record for caller |
   | `research_needs_basic_info` | research requested before a record exists (see Waitable Research brief) |
   | `themes_not_ready` | onboarding-themes with no expertTopicsRaw |
   | `questions_failed` | generate-questions `success:false` (today handled in prose at 7472) |
   | `interview_slot_invalid` | outside 15 min–30 days (server.js:7595-7602) |
   | `interview_already_scheduled` | double-book guard (server.js:7623) |
   | `mcp_probe_failed` | probe-mcp timeout or bad JSON-RPC |
   | `mcp_auth_unsupported` | non-`none` auth (toolHandlers.ts:7168) |
   | `upstream_error` | fallback |

   - The Website returns `{ error: <code>, message }` consistently for these cases. Add codes where only a message exists today.

## Where to register

- Bump versions in `src/tools.ts` for any tool whose output shape changes (`get_onboarding_status`, `schedule_interview`, and all ten for errors).
- Document the error object and `next_action` convention in `MCP_AUDIT.md` or `SKILL_DEVELOPER_GUIDE.md` (whichever holds tool conventions) so the consult tools can adopt it.

## Definition of Done

- Live `get_onboarding_status` on a test expert at each reachable status returns the right `next_tool` and `next_action`.
- One forced failure per code (at least: `terms_required`, `interview_slot_invalid`, `mcp_auth_unsupported`, `upstream_error`) returns the JSON error block alongside the prose.
- In a real Claude chat, Claude relays the next step without flagging the tool output as suspicious. Paste the transcript excerpt into the CHANGELOG entry.

## Do Not

- Don't write "read this verbatim", "you must say" or other model-directed imperatives into tool output.
- Don't add new tools. Extend the existing ones.
- Don't expose internal Airtable status strings (`Onboarding — Interview`, etc.) to the expert.

## Files changed (expected)

- Fodda MCP: `src/toolHandlers.ts`, `src/tools.ts`, `CHANGELOG.md`, conventions doc
- Fodda Website: `server.js`, `CHANGELOG.md`
