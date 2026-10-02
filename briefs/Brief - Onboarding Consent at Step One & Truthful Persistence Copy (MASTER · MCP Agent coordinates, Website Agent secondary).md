# Brief — Onboarding Consent at Step One & Truthful Persistence Copy

**For:** mcp-agent (Fodda MCP), coordinating with the Website agent (Fodda Website `server.js`)
**From:** Piers & Claude Code (review of the Pitch Protocol onboarding research, 2026-10-02)
**Status:** ✅ Ready. Piers chose **Option A** (2026-10-02): consent moves to step one, "saved as you go". Build the Option A spec below; ignore Option B.
**Execution:** `/build-from-brief briefs/Brief - Onboarding Consent at Step One & Truthful Persistence Copy (MASTER · MCP Agent coordinates, Website Agent secondary).md`

---

## Context

On the connector path, every onboarding surface tells the expert that nothing is stored before they submit. The code does store their content before consent, so the copy is false.

**What we tell the expert (verified 2026-10-02):**
- `src/toolHandlers.ts:7067` (`begin_expert_onboarding`): "Nothing is saved to Fodda until you complete all steps and explicitly submit at the end. Your progress lives only in this conversation."
- `src/toolHandlers.ts:7131` (`submit_basic_info` result): "Progress is held in this chat session until final submit."
- `src/toolHandlers.ts:7032` and `:7223`: the BYO-MCP equivalents.
- `src/systemPrompt.ts:109-119`: "nothing gets sent to the Fodda servers without your sign off… nothing is saved to Fodda until you complete all the steps".

**What the code does (verified in Fodda Website `server.js`):**
1. **`submit_basic_info` creates an Analysts record.** It calls `POST /api/prepare-voice-interview` (`action:'basic_info'`, `server.js:4591`), which creates or patches an **Analysts record** (`Status = 'Onboarding — Interview'`, `server.js:4953/4969`). That record holds Name, expertEmail, Description, expertIn, callPrice, imageUrl and the User link.
2. **Research writes onto that record.** `expert_onboarding_research` calls `POST /api/deep-research`, whose background sweep PATCHes `deepResearchJson` onto that record (`server.js:~8785-8795`).
3. **Consent arrives only at step 4.** It is the `termsAccepted` boolean on `submit_expertise_analysis` (`toolHandlers.ts:7387-7394`), plus `finalize_byo_mcp_onboarding` on the BYO path.

So we hold profile content and research before consent while telling the expert we don't. On 2026-08-29 Piers rejected draft saving on the premise that nothing was saved. That premise doesn't match the code, so the decision needs remaking.

## Decision required (Piers)

**Option A (recommended): move consent to step one and say "saved as you go".**
- Consent moves to `submit_basic_info`, the first tool that writes.
- Everything after it is honestly "saved as you go".
- Resume works across chats from the Analysts record we already keep.
- This matches the Pitch Protocol pattern: one early commit point, editable afterwards.

**Option B: keep "nothing saved" and hold every content write until consent.**
- `submit_basic_info` stops writing content and records the funnel stage only.
- Research can't persist before consent, so the MCP must carry the research result in the chat. That requires the long-poll in `Fodda Website/briefs/Brief Website — Waitable Deep Research (Job State, Timeout, Long-Poll).md`.
- The agent then passes everything at `submit_expertise_analysis`.
- Resume stays "same chat only".
- B is substantially more work and keeps experts who stall invisible beyond their funnel stage.

The rest of this brief specifies **Option A** (the chosen path). Option B is retained above only as the rejected alternative, for context.

## What to build (Option A)

### MCP agent: `src/toolHandlers.ts`, `src/systemPrompt.ts`, `src/tools.ts`

1. **Make `submit_basic_info` the consent point.**
   - Add required `termsAccepted: boolean` and bump the version to `1.2.0`.
   - Description: this is the step where Fodda starts saving the expert's onboarding. Before calling, show the Terms (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy) links and get an explicit yes. If `termsAccepted !== true`, refuse with the same hard-refusal pattern `submit_expertise_analysis` uses today (7387-7394).
2. **Relax the later consent checks.**
   - `submit_expertise_analysis` and `finalize_byo_mcp_onboarding`: make `termsAccepted` optional. The server accepts the call when the Analysts record already has `termsAccepted = true`.
   - Don't ask the expert a second time. On BYO, `finalize` is the commit-to-review step, not consent.
3. **Replace every false persistence line** (the 7032, 7067, 7131 and 7223 strings and `systemPrompt.ts:109-119`) with copy that says exactly what is saved and when:
   - Standard flow, at the start: "Once you accept the terms, Fodda saves each step as you complete it. If you stop partway, you can pick up later, in this chat or a new one, and I'll check where you left off. Your Human Agent only goes live after your interview and Fodda's review."
   - Drafts in progress: "Anything I'm still drafting with you, like your voice study before you submit it, lives only in this chat until you submit that step."
   - BYO-MCP: "Your profile is saved once you accept the terms. Your MCP connection is only checked, not saved, until you submit at the end."
   - **Keep** the Sep 14 guard: never claim "submitted" or "under review" until `finalize_byo_mcp_onboarding` returns `submitted_for_review`.
4. **Resume on start.** When the Website reports an in-progress record (see Website step 4 below), `begin_expert_onboarding` returns `resume: { status, next_step }` and copy saying "You've already started, so let's pick up at <step>" instead of the fresh-start intro.

### Website agent: `server.js`

1. **Gate `basic_info` on consent.** In `POST /api/prepare-voice-interview`, `action:'basic_info'` (4591+) on the MCP path:
   - Reject with 400 `{ error:'terms_required', message }` unless `termsAccepted === true`.
   - Persist `termsAccepted` and `termsAcceptedAt` on Analysts and Users at this step.
2. **Stop requiring consent again.** `action:'expertise_analysis'` no longer requires `termsAccepted` in the body when the record already has it.
3. **Make research persistence check consent.** `/api/deep-research` persists `deepResearchJson` only when the target record has `termsAccepted = true`. This is defensive and should never trigger after step 1.
4. **Report an in-progress record.** `GET /api/onboarding-prompts` (5341): when the caller's email already has an in-progress Analysts record (not Active, not Pending Approval), return `inProgress: { analystId, status }` from the same derivation `/api/onboarding-status` uses (5182-5193).
5. **Don't break the web wizard.** It already sends consent before dispatch (4659-4668). Confirm it is unaffected.

## Where to register

- `src/tools.ts`: version bumps for `submit_basic_info` (→1.2.0), `submit_expertise_analysis`, `finalize_byo_mcp_onboarding` and `begin_expert_onboarding`.
- Republish the tool manifest per the normal MCP publishing flow.

## Definition of Done

- `grep -rn -i "nothing is saved\|held in this chat\|lives only in this conversation" src/` in Fodda MCP returns no false persistence claims. Only the scoped "still drafting" line remains.
- Live check with a test expert account:
  1. `submit_basic_info` without terms is refused, and no Analysts record is created.
  2. With terms, the record exists with `termsAccepted` and `termsAcceptedAt`.
  3. In a **new** chat, `begin_expert_onboarding` returns `resume` at the correct step.
  4. Funnel stages 1–7 still record as before.
- The web wizard completes one onboarding end to end, unchanged.

## Do Not

- Don't add persistence for in-chat drafts (voice study or expertise map before their submit tool runs).
- Don't change the Onboarding Funnel table's stage-only privacy invariant.
- Don't weaken the BYO "never claim submitted before finalize" guard.
- Don't change the Terms or Privacy documents themselves.

## Files changed (expected)

- Fodda MCP: `src/toolHandlers.ts`, `src/systemPrompt.ts`, `src/tools.ts`, `CHANGELOG.md`
- Fodda Website: `server.js`, `CHANGELOG.md`
