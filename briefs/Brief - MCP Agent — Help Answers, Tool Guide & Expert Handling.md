# Brief: MCP help answers, tool guide and expert handling

**Owner:** MCP agent (`mcp-agent`). One hand-off note for `api-agent` at the end.
**Prepared:** 2026-10-26 · **Revised:** 2026-10-26 after review
**Priority:** High. This must land before Website Brief 09 (`~/Documents/Fodda Website/briefs/09-sidebar-and-webmcp-run-like-mcp.md`), which moves the website sidebar and WebMCP onto the MCP. Every gap here then shows on `www.fodda.ai` as well as in Claude and the app.
**Execute:** `/build-from-brief "briefs/Brief - MCP Agent — Help Answers, Tool Guide & Expert Handling.md"`

---

## Context

Whoever asks Fodda a question (Claude with Fodda connected, the app chat, the website sidebar, a browser agent over WebMCP) is talking to this MCP. Three things it should do better:

1. **Questions about Fodda itself.** "What is Fodda?", "How do I connect it to Claude?", "What does it cost?", "What can you do?" These tend to go into graph search. On 2026-10-26 the website's current consult path answered "What is Fodda?" with "Outside what I track — I'd be guessing." The app chat has the same weakness: its system prompt (`~/Documents/Fodda/server/services/mcpChatService.ts` ~line 203) tells the model to always start with `list_graphs` → `search_graph` → `get_evidence`.
2. **"What tools do you have and how would I use them?"** The MCP should be able to say: here's what you can ask, when to use each tool, and an example prompt. `get_capabilities` returns workflows, deliverables, agent classifications and recipe steps from `GET /v1/capabilities`, but not a plain guide.
3. **Experts.** Find the right expert, consult the one the user names, and be honest about which experts are real people.

**Rule from Piers:** help and tool-guide answers are **zero charge**. Research and consults are charged to the signed-in user as usual.

**Related: the Prompt Guide (Website Brief 08).** The website is replacing its Use Cases pages with one Prompt Guide (`/prompt-guide`, data in `data/promptGuide.ts`), organised in five sections: **Research, Pressure-test, Ask an expert, Make something, Track.** Brief 08 also adds it to the website's `llms.txt` generator. This brief uses the Prompt Guide as the single source of example prompts and structure, so the website, the sidebar and Claude all tell the same story.

## What to build

### 1. Help answers from the published llms text

- Add a help view to `get_capabilities` rather than a new tool (house rule: one tool with a `view` param). Suggested: `get_capabilities({ view: 'help', question })`.
- **Sources, in order:** `https://www.fodda.ai/llms.txt` first (it has the overview, the catalog structure, and the connect guides such as `/connect/claude`), then `https://www.fodda.ai/llms-full.txt` (a technical manifest: endpoints, auth, tool descriptions). Fetch each and cache for 1 hour. Supplemental-client rules apply: 10s timeout, never throw, return `{ error, message, source }` on failure.
- **Picking passages:** split each file by `##` heading. Score sections against the question (simple keyword overlap is fine) and return the top 2–3 sections, `llms.txt` sections ranked ahead of `llms-full.txt` ones. Never return the whole file.
- If the sections answer the question, return them with the page links they contain. If not, say so plainly and point to `hello@fodda.ai`. Don't make up an answer.
- **Prices** come only from the live pricing source the MCP already uses (`pricingCache.ts` / the offerings endpoint), never from the llms text and never computed. If the two disagree, use the live price and log the mismatch.
- **Counts.** `get_capabilities` reports the knowledge-graph count from the live registry (about 100 today); `llms.txt` says "300+". Help answers use the live count. Raise the mismatch with the website agent (note below) so `llms.txt` is generated from the same number.
- Update the `get_capabilities` description and the server instructions so a model reaches for `view: 'help'` on questions about Fodda, accounts, pricing, connecting, or "what can you do", **before** any graph search.

### 2. Tool guide

- Add `get_capabilities({ view: 'tools' })`. Answer "what can you do?" in the Prompt Guide's five sections: **Research, Pressure-test, Ask an expert, Make something, Track.** That is `get_capabilities`'s four workflows (research, challenge, ask_experts, track) plus deliverables as "Make something".
- Under each section, list the tools exposed on the caller's endpoint (respect offering-scoped tool subsets), each with: one plain-English line on what you get, when to use it, one example prompt, and free or charged. Free or charged comes from the pricing table (`getToolCostSummary()`), not a hand-written list.
- Build the list from the registered tools at runtime so it can't drift. Hand-write only the "what you get" and "when to use" lines, kept next to each tool's definition.
- **Example prompts:** where a tool has a matching Prompt Guide prompt, use it word for word. Read them from the website's `llms.txt` once Brief 08 has shipped; until then, take them from `sample_prompts` in `/v1/capabilities`. Don't write a new set; that would be the fourth copy.
- The `help` view mentions that `view: 'tools'` exists for "what can you do" questions.

### 3. Plain language, no internals

Help and tool-guide answers are free and go to anyone signed in, so keep them to what a user can ask and what they get back.
- No `Neo4j`, Cypher, graph traversal, or step-by-step research recipes in the `help` or `tools` views.
- Today's published tool descriptions mention Neo4j twice, and `get_capabilities` returns recipe steps. Remove Neo4j from the published tool descriptions, and keep recipe steps out of the two new views. (Piers took this kind of detail off the website's Use Case pages; don't add it back here.)

### 4. Zero charge for help and discovery

- `get_capabilities` (all views) must be zero-rated end to end. Also confirm the discovery tools a help conversation relies on: `list_graphs`, `list_analysts`, `find_expert`, `get_my_account`.
- `get_my_account` is in the pricing table at 0. The others aren't in the table, and metering happens at the API per endpoint, so confirm with a test key: record the balance, call each tool once, record it again. Paste the numbers into the CHANGELOG.
- If any of them is charged, zero-rate it at the source (the API's `metering.ts` is canonical; hand to `api-agent` if the fix is there). Don't hide the charge in the MCP.

### 5. Expert handling

Run these prompts through the MCP with a test key (in the app chat, and in Claude) and fix what fails. Record each result in the CHANGELOG.

| Prompt | Should |
|---|---|
| "Who should I ask about clean beauty formulation?" | Return experts (`find_expert`), each with its kind: active Human Agent, On-Request Human Agent, synthetic analyst, C-Suite Agent or Classic Agent. Not an answer to the beauty question itself. |
| "What would Ben Dietz say about our streetwear collab strategy?" | Resolve "Ben Dietz" and call `consult_human_agent`. |
| Context line "The user is reading the Ben Dietz expert page" + "what would he say about this?" | Same as above. The website sidebar will send this context line. |
| "Can I book Jeremy Bergstein?" | Give his real intro or booking route, not a consult. |
| "Ask an expert about premium business travel" (no name) | Find a suitable expert first, then consult, and say who was consulted. |
| A question well outside an expert's field, put to that expert | Say it's outside their field and suggest who else to ask, rather than answering in their voice. Earlier QA found the `consult_analyst` coverage gate never returns "out" because it is margin-based; check whether that is still true. |

Rules throughout: never describe synthetic, C-Suite or Classic Agents as real people; never call an On-Request Human Agent synthetic; use the expert's real intro, never a one-line tagline or a classification slug.

## Where to register

- The `get_capabilities` tool definition and handler (new `view` values), the server instructions text, per-tool "what you get" and "when to use" lines, and the published tool descriptions (Neo4j removal).
- `CHANGELOG.md` with real verification results.
- Fodda API bibles (`~/Documents/Fodda API/docs/bibles/`): add the `help` and `tools` views to the MCP tool section of `product_and_system_reference.md`. Add a gotcha to `system_clarifications.md`: prices and counts in help answers come from live sources, not the llms text.

## Hand-offs

**To `api-agent`** (app chat, `~/Documents/Fodda`): write `coordination_notes/Note_2026-10-xx_app-chat-help-and-tools.md` covering:
1. **System prompt.** `mcpChatService.ts` forces a research workflow ("First call list_graphs…"). Change it so questions about Fodda go to `get_capabilities({ view: 'help' })` and "what can you do" goes to `view: 'tools'`. Keep the research workflow for research questions.
2. **Advertised but excluded tools.** `get_capabilities` says `manage_scheduled_reports` is "available via app.fodda.ai" and lists `draft_linkedin_post` and `draft_linkedin_article` as additional services, but the app chat's `EXCLUDED_SANDBOX_TOOLS` (`mcpChatService.ts:23`) removes all three. Either expose them in the app chat or stop advertising them for that surface.
3. **Session kind.** `mcpChatService.ts` connects with `X-Fodda-Session-Kind: internal-test` for every real user chat, so the MCP tags the source `mcp-internal-test` (`Fodda MCP/src/index.ts:1267`). Nothing in the API seems to bill that differently, so it looks like a reporting problem: real user usage shows up as internal tests. Send `customer` for real users.

**To the website agent:** a short note in `~/Documents/Fodda Website/coordination_notes/` (create the folder if needed):
- `llms.txt` says "300+" knowledge graphs while `get_capabilities` reports the live count. Generate the number from the live count.
- The Perplexity and Notion "connect guides" in `llms.txt` link to the homepage, not to a guide.

## Definition of Done

- [ ] "What is Fodda?", "How do I connect Fodda to Claude?" and "What does Fodda cost?" are answered from `llms.txt` (price from the live pricing source), in the app chat and in Claude with Fodda connected. Paste the answers.
- [ ] "What can you do?" returns the five-section guide: each exposed tool, what you get, when to use it, an example prompt, free or charged.
- [ ] Neither new view contains "Neo4j", "Cypher" or recipe steps (grep the output). The published tool descriptions no longer mention Neo4j.
- [ ] Balance before and after shows zero charge for `get_capabilities` (all views), `list_graphs`, `list_analysts`, `find_expert` and `get_my_account`.
- [ ] Every row of the expert table behaves as stated, or the CHANGELOG says which didn't and why.
- [ ] Both hand-off notes written.
- [ ] Test sends, if any, only to `nathan@searchshop.ai` and `piers.fawkes@psfk.com`.

## Do Not

- Do not hardcode or compute prices, charges or counts in the MCP. Costs are canonical in the API's `metering.ts`.
- Do not add a separate help tool when a `view` on `get_capabilities` will do.
- Do not invent help answers the llms text doesn't support.
- Do not write a new set of example prompts; reuse the Prompt Guide's.
- Do not put internals (Neo4j, Cypher, research recipes) in help or tool-guide answers.
- Do not charge for help, tool-guide or discovery calls.
- Do not let the llms fetch throw or block a tool call beyond its 10s timeout.

## Files changed (expected)

The `get_capabilities` tool definition and handler, the server instructions text, the per-tool guide entries and published descriptions, `CHANGELOG.md`, the two bibles above, and the two hand-off notes.

## Later

More help-answer quality work can wait until the website sidebar runs through the MCP (Brief 09), when it can be tested there directly.
