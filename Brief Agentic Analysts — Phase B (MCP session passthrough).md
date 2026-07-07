# Brief: Agentic Analysts — Phase B (finish MCP session passthrough)

> **✅ COMPLETED 2026-07-07** — both halves done. API: `recordSessionTurn` wired + `session_id`/`session_note` in envelope (committed in Fodda API/Fodda). MCP: `session_id` param + SESSION passthrough + ENGAGEMENT PATTERNS + manifest regen (this branch). Post-deploy check still owed: live verification that Antigravity honors `previous_interaction_id` and turn-3 cost < turn-1.
>
> Extracted from `Brief Agentic Analysts.md` §"Phase B — Multi-turn engagements". Standalone; hand to a fresh thread. Single repo (MCP), no deploy.

**Correction found during build (2026-07-07):** the "API side DONE" claim below was overstated — threading logic existed but `recordSessionTurn` was never called (sessions never persisted) and the envelope never returned `session_id`. Both fixed and committed; `analystSessions.ts` itself was untracked and is now committed too.

## Status going in (verified 2026-07-06)
Phase B is **half done**:
- ✅ **API side — DONE & committed.** `Fodda API/Fodda/functions/v1/analystSessions.ts` exists and is wired into `functions/v1/analysts.ts`: consult accepts `session_id`, persists to Firestore `analyst_sessions/{session_id}` `{session_id, analyst_id, account_id, last_interaction_id, environment_id, turn_count, created_at, last_active_at}`, threads `previous_interaction_id` + reuses `environment_id` on same-analyst/same-account follow-ups, guards cross-account/cross-analyst reuse, and returns `session_id` in the envelope (+ first-turn `session_note`). Billing per turn unchanged.
- ⬜ **MCP side — NOT STARTED.** `consult_analyst` (`Fodda MCP/src/toolHandlers.ts`) has no `session_id` param; `src/systemPrompt.ts` has no ENGAGEMENT PATTERNS section. The API can thread sessions but no MCP client can *reach* the feature yet.

**This brief = the MCP half only.** Do not re-touch the API.

## Objective
Let calling agents hold multi-turn engagements with an analyst through the MCP `consult_analyst` tool: pass a `session_id` back to continue, retain context server-side, pay less on follow-ups (cache hits).

## Ground truth (MCP repo)
- `consult_analyst` handler: `Fodda MCP/src/toolHandlers.ts` (consult handler that POSTs to `/v1/analysts/consult`). Confirm the exact path/body it sends.
- Tool schema + descriptions are mirrored in `tools-manifest.json` (single source of truth — regenerate, never hand-edit divergently).
- MCP server instructions: `src/systemPrompt.ts`.

## Build (B — MCP only)

**B-MCP-1. `session_id` param on `consult_analyst`.** Add an optional `session_id` string parameter:
> "Pass the `session_id` from a previous consult response to continue that engagement — the analyst keeps context and follow-ups cost less. Omit for a one-off question."

Thread it into the POST body to `/v1/analysts/consult`. **Surface the returned `session_id` in the tool result** so the calling model can reuse it. Update the tool description's opening line to mention multi-turn engagements. Regenerate `tools-manifest.json`.

**B-MCP-2. Envelope note.** The API already returns `session_id` (always) + `session_note` (first turn only). Make sure the MCP tool result passes these through verbatim so the model sees them.

**B-MCP-3. `systemPrompt.ts` ENGAGEMENT PATTERNS.** Add a short section:
```
### ENGAGEMENT PATTERNS
- One-off question → consult_analyst (no session_id)
- Ongoing project → keep passing the session_id; the analyst remembers prior turns and working files
- Finished document (plan, review, briefing) → request_deliverable with an offering_key  [coming — Phase C, not yet live]
```
Phrase the `request_deliverable` line as "coming" (Phase C is not live yet).

## Repo discipline
- `git status` first; if there's uncommitted work you didn't create, checkpoint-commit it before starting (MCP deploys from source — see repo CLAUDE.md).
- Do NOT edit `earnings/*`, `supplemental/*`, the v1Router type-search region, or `a2aHandler.ts`.
- `npm run build` clean + regenerate the manifest.
- Commit with a clear message. **Do NOT deploy.**

## Testing
1. `consult_analyst` with no `session_id` → returns a `session_id` + first-turn `session_note`.
2. Second `consult_analyst` passing that `session_id` → API threads it (`previous_interaction_id` set); no `session_note` on turn 2+.
3. Manifest regenerated; build clean.
4. **Post-deploy check (flag, don't fake):** live verification needs deploy + the Antigravity Interactions API honoring `previous_interaction_id`, and turn-3 cost < turn-1 cost (cache hits).

## Priority
P1, small. Cheapens follow-up costs and is the prerequisite UX for Phase C's "ongoing project → deliverable" funnel line.
