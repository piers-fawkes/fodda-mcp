# Brief (MCP Agent): Markdown Blockquote Formatting for Next Moves Closing Block

**Status:** Ready to build
**Prepared:** 2026-11-05
**Owner:** MCP Agent (`~/Documents/Fodda MCP`)
**Execute:** `/build-from-brief briefs/Brief (MCP Agent) — Markdown Blockquote Formatting for Next Moves Closing Block.md`

---

## Context

When host models (Claude, ChatGPT, Chrome native WebMCP) query Fodda MCP tools, they synthesize answers and offer concluding follow-up recommendations ("next moves") based on structured `next_moves` metadata.

Currently, the instructions in `systemPrompt.ts` do not mandate a distinct container format for the concluding moves, causing models to emit them as ordinary trailing paragraphs that blend into the primary answer text.

To subtly differentiate the next moves across all external clients (Claude desktop/web, ChatGPT, and Chrome native WebMCP side panel):
- Update `systemPrompt.ts` so the model wraps the closing follow-up sentences inside a markdown blockquote (`> *Where to go next:* [moves]`).
- Markdown blockquotes are natively rendered with indented, muted, or callout styling in Claude, ChatGPT, and Chrome's WebMCP side panel, matching the visual polish implemented in `www.fodda.ai` and `app.fodda.ai`.

---

## What to build

### 1. Update Next Moves Formatting in `src/systemPrompt.ts`
Under `Structured Next Moves (Follow-Up Recommendations)` (~line 62):
Add an explicit formatting rule:
- **Blockquote Wrapping**: When concluding an expert consult or research answer, wrap the three follow-up recommendations inside a single markdown blockquote:
  ```markdown
  > *Where to go next:* [1. Pull the thread sentence] [2. Explore the shelf / Go specific sentence] [3. Scope to the job sentence]
  ```
- **Rules**:
  - Keep all 3 follow-up moves within the single `>` blockquote.
  - Prefix with `*Where to go next:* ` in italics.
  - Do NOT use bullet ladders, section headers, or emojis.

---

## Where to register
- `src/systemPrompt.ts`
- `CHANGELOG.md` in `~/Documents/Fodda MCP`

---

## Definition of Done
- [ ] In `npm test` or MCP evaluation tests, prompt generation includes the blockquote instruction.
- [ ] A simulated MCP consultation produces closing next moves formatted as `> *Where to go next:* ...`.
- [ ] TypeScript build (`npm run build`) passes cleanly.

---

## Do Not
- Do not remove the three-sentence semantic logic (thread, shelf, scope).
- Do not use HTML tags; use standard markdown `>` so all MCP host clients parse it natively.

---

## Files Expected to Change
- `src/systemPrompt.ts`
- `CHANGELOG.md`
