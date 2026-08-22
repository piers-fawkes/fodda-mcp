# Brief: Human Agent "book a call" intent + plain-language output (no field/tool names)

> **To:** `mcp-agent` (Fodda MCP)
> **From:** Claude Code (reviewer), for Piers
> **Date:** 2026-08-22
> **Execution:** `/build-from-brief briefs/human_agent_book_a_call_and_plain_language.md`
> **Depends on:** Fodda API brief `briefs/human_agent_book_a_call.md` (adds `book_a_call: { url, rate_display } | null` to `GET /v1/human-agents` and the `/v1/human-agents/consult` envelope). Part B below can ship before the API change; Part A needs it.

---

## Context

Sample transcript (user: "how could i hire James for some consulting!"). The agent gave two good answers (commission a deliverable; multi-turn session) then said it could not see a contact route for the real person. Two problems:

1. **No "speak to the real person" path.** Airtable holds `callPrice` + `bookURL` per expert; the API is now exposing them as `book_a_call`. Nothing in `src/systemPrompt.ts` or the `consult_human_agent` tool tells the model to use it on hire/book/call/speak intent.
2. **Internal vocabulary leaks.** The output quoted `askLine`, `request_deliverable`, `session_id` verbatim. The existing rule (`systemPrompt.ts:75–78`, tool descriptions at `toolHandlers.ts:3821`, `4112`) only bans *expert ID slugs* — and that part works (it said "James", not a slug). It says nothing about field names or tool names. Root cause: `list_analysts` spreads the raw API object (`...a`, `toolHandlers.ts:~853`) so the model sees camelCase Airtable keys and repeats them.

## What to build

### Part A — Book-a-call intent

1. **`list_analysts` and `consult_human_agent` pass-through.** Preserve `book_a_call` from the API response in the tool result (do not drop it when enriching). In `consult_human_agent`, place it at top level of the returned JSON next to `analyst`.

2. **System prompt rule (`src/systemPrompt.ts`, Human Agent section).** Add:

   > HIRE / BOOK / SPEAK-TO-THE-PERSON INTENT: If the user asks to hire, book, call, meet, or speak with the *real* expert (not the Human Agent), and the expert's record carries `book_a_call`, lead with it. `rate_display` is a **complete, pre-written display sentence** maintained in Airtable (it is the same line shown on the expert's website page — e.g. "Or book 1 hour with the real Jeremy - $750 live video"). Output it verbatim as its own line, followed by the URL — do NOT wrap it in another sentence, paraphrase it, extract a number from it, or convert it into an hourly rate. Then offer the two on-platform routes (commission a deliverable; continue the conversation with their Human Agent) as alternatives. If `book_a_call` is null, say the expert isn't taking calls through Fodda right now and offer the on-platform routes. Never search the web for the expert's private contact details.

3. **`consult_human_agent` tool description (`toolHandlers.ts:4109`).** Append one sentence: "Response may include `book_a_call` (URL + a pre-written booking sentence shown verbatim) for booking time with the real person — surface it when the user wants to hire or speak to the expert."

### Part B — Plain-language output (no field names, no tool names)

1. **Extend the no-slugs rule** (`systemPrompt.ts:75` block, and the `analyst_id` descriptions at `toolHandlers.ts:3821` and `4112`) to cover internal vocabulary:

   > Never echo internal field names (`askLine`, `blindSpots`, `signatureInsights`, `exampleQueries`, `rate_display`, `book_a_call`) or tool names (`consult_human_agent`, `request_deliverable`, `list_analysts`, `session_id`) in user-facing text. Translate: `askLine` → "what {Name} offers to do for you"; `request_deliverable` → "commission {Name} to produce…"; `session_id` → "keep this conversation going"; `blindSpots` → "what {Name} says is outside their lane".

2. **Whitelist `list_analysts` output instead of spreading.** Replace `...a` with an explicit projection of the fields the model actually needs, using readable keys: `analyst_id` (keep — it is a required tool parameter), `name`, `type`, `consult_tool`, `expert_in`, `description`, `what_they_offer` (from `askLine`), `example_questions`, `outside_their_lane` (from `blindSpots`), `credentials` (roleTitle, yearsExperience, pastEmployers), `is_verified_real_person`, `price` (existing logic), `book_a_call`, `offerings`, `commissionable`, `note`. Drop `voiceProfile`, `expertCard`, `systemInstructions`, `signatureInsights` raw JSON, image/attachment fields, and dates — they cost context and invite key-name echoing. Confirm with `get_capabilities`/`brand_tracker` paths that nothing else reads `list_analysts` output keys before renaming.

3. **Deprecation-redirect strings** (`toolHandlers.ts:3855`, `3885`, `4089`) already carry "Internal guidance" — leave as is.

## Where to register

- `src/systemPrompt.ts`, `src/toolHandlers.ts` as above.
- Bump MCP version (`package.json`, `tools.ts` version map for `consult_human_agent` and `list_analysts`).
- `CHANGELOG.md` with a real verification transcript.
- API-repo bible `docs/bibles/system_clarifications.md` (MCP row): note the new rule + version; bump `Last updated:`. Hand that edit to `api-agent` if you don't own that repo in this session.

## Definition of Done

- Live test (`src/test_human_agent_live.ts` or a new `test_book_a_call_live.ts`): query "how can I hire {Name} for consulting" against an Active Human Agent with `book_a_call` set → response contains the URL and the `rate_display` string **byte-identical to the API envelope** (assert against the fetched value, never a hardcoded rate — the cell is a display sentence, not a number); against one with `book_a_call: null` → "not taking calls through Fodda right now" + on-platform routes.
- Re-run the sample prompt from this brief: output contains **no** occurrence of `askLine`, `request_deliverable`, `session_id`, `consult_human_agent`, or any expert ID slug. Grep the transcript.
- `list_analysts` result size is smaller than before (log byte count before/after in CHANGELOG).
- Existing tests `test_consult_split.ts`, `test_referral_live.ts`, `test_sources_live.ts` still pass.

## Do Not

- Do not compute, restate, or extract a call rate; `rate_display` is a verbatim display sentence from Airtable and is shown as-is.
- Do not add a new MCP tool for booking — the URL is the booking surface (one-tool-with-view rule).
- Do not rename `analyst_id` — it is the tool parameter and a breaking change for clients.
- Do not write "tokens"/"SPT" in anything user-visible.

## Files changed (expected)

- `src/systemPrompt.ts`, `src/toolHandlers.ts`, `src/tools.ts`, `package.json`
- `src/test_book_a_call_live.ts` (new)
- `CHANGELOG.md`
