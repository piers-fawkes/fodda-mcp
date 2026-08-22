# Brief — Next Moves: a fixed three-line closing block on every answer

**From:** Piers (model settled in conversation, 2026-08-22)
**Owning repo / agent:** Fodda MCP — `mcp-agent`. One small hand-off to Fodda API — `api-agent` (§ API hand-off).
**Execution handle:** `/build-from-brief "briefs/Brief - Next Moves Closing Block on Every Answer (MCP Agent, API handoff).md"`
**Status:** ready to build. Independent of tier-gating v2 and of the intent-classifier work; ships before both.

---

## Context

Analysis of the Questions table (2,858 rows, 2026-02 → 2026-08, Piers's accounts excluded) shows that of 134 external identities, 74 are active on a single day and for most of them the app's suggested prompt is the only query they ever run. Second questions came from exactly three places in the log:

1. **A live job** — every multi-question user had a brief in hand (a Medicare account, a CPG category, an airline innovation hub). One-shot users either had no job or a job Fodda couldn't finish.
2. **A brand after a topic** — the most repeated two-step in the table is topic search → Brand Intelligence on the client. Users who know the path take it; almost nobody discovers it.
3. **A drill-down on something the answer named** — "which colors for 2026?", "what's that trend called?", "not quite — from the retailer's perspective".

Users who got a genuinely good first answer *also* left (six identities ran a coherent mini-brief in one sitting and never returned). Routing precision is necessary but not sufficient; the answer has to hand the user their next move.

The expert-consult path already has a "Closing Fan-Out Options" rule in `src/systemPrompt.ts` (a 3–5 bullet block after `consult_human_agent` / `consult_analyst`). This brief generalises that idea to **every tool response**, tightens it to a fixed three-line shape, and gives the client model real material to fill it with instead of improvising.

## What to build

### 1. The closing block — fixed shape, three lines, every tool

Every tool that returns research content (`search_graph`, `search_insights`, `search_statistics`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `brand_tracker`, `get_supplemental_context`, `discover_adjacent_trends`, `brainstorm_topic`, `consult_analyst`, `consult_human_agent`, `deep_research_topic` completion) ends with exactly three lines, in this order:

1. **Pull the thread** — one specific thing this answer surfaced but did not finish. Must name the graph and either a named adjacent room or a sense of what remains — **never an exact count** (Piers, 08-22: numbers are ugly and over-commit us; say "several more" for 2–8, "many more" for 10+).
   *"There are several more GLP-1 signals in PSFK's Food & Beverage graph on snacking and protein I didn't include — pull them?"*
   *"Sports has the fan side of this — want that room?"*
   When coverage is `thin` or `empty`, this line becomes the honest version: *"That's what Fodda holds on this right now; the closest adjacent hit is [X] in [Graph] — want it?"*
2. **Go specific** — the brand / numbers / expert path, drawn from this result. Offer at most two of the three, only those with material present.
   *"Want the brand view on Campbell's or Nestlé, or the Census spend data behind this?"*
   *"Anu Lingala covers this directly — ask her?"*
3. **Scope to the job** — always present, always last, same copy every time so it becomes familiar:
   *"If you tell me the brand or brief you're working on, I'll cut this to that."*

Rules:
- Every line is **generated from the result envelope** (§2), never from the model's general knowledge. A line with no material behind it is dropped, not invented; line 3 is the only fixed-copy line.
- Names are human display names (graph name + curator, expert display name) — never slugs, never tool names, never costs or calls. Existing house rule; restated here only because this block is the most visible surface in the product.
- Three lines, no heading, no "any other questions?", no emoji, no apology. Plain sentences.
- The expert-consult "Closing Fan-Out Options" block is **replaced** by this shape (line 1 = held-open follow-up with the expert on a named signal; line 2 = brand/stat/other expert; line 3 = scope to job). Do not keep both.

### 2. `next_moves` on the response envelope (the material)

Add a machine field to every normalized research response, alongside `coverage`:

```json
"next_moves": {
  "thread": {
    "kind": "more_in_graph" | "adjacent_room" | "honest_thin",
    "graph_id": "food-beverage",
    "graph_display": "PSFK's Food & Beverage Graph",
    "remaining_count": 3,   // machine-only: drives "several"/"many" phrasing, never rendered as a digit
    "theme": "snacking and protein",
    "adjacent": { "graph_id": "sports", "graph_display": "PSFK's Sports Graph", "reason": "fan side of collectibles" }
  },
  "specific": {
    "brands": ["Campbell's", "Nestlé"],
    "statistics_source": "Census retail snapshot",
    "expert": { "analyst_id": "anu-lingala-macro", "display_name": "Anu Lingala", "reason": "covers macro consumer shifts directly" }
  },
  "scope_prompt": true
}
```

Population rules (all from data already in hand at normalization time):
- `thread.remaining_count` = rows that cleared the on-topic test (`coverageRelevance.countOnTopicRows`) minus rows rendered, per graph; pick the graph with the largest remainder. Zero remainder everywhere → `adjacent_room` from the next-best graph in `getRelevantGraphs()` that was **not** searched; none → `honest_thin` (only when coverage is thin/empty).
- `specific.brands` = top 2 brand entities present in the returned rows (brand fields already exist on rows).
- `specific.statistics_source` = the supplemental source `coverage.suggested_action` would have pointed at, or the statistics graph that scored in routing.
- `specific.expert` = first Active analyst whose graph was searched or scored ≥ threshold in routing; omit when the current tool *is* that expert's consult.
- `scope_prompt` is always `true`; it exists so the client always renders line 3.
- `next_moves` is **machine-only**: `presentation: "internal"` semantics like `coverage` — the client renders the three lines from it; it never prints the object.

### 3. Render contract

- Add the three-line rule to `buildRenderInstructions()` (`_render_instructions`) and bump `_render_spec_version`. Clients that ignore server instructions must still receive the rule on the payload.
- Add the same rule to `STATIC_BEHAVIORAL_RULES` in `src/systemPrompt.ts` and delete the expert "Closing Fan-Out Options" paragraph.
- When the user's `userContext` already names a brand/brief (MCP user-context block), line 3 becomes *"Want this cut to [brand] specifically?"* — i.e. the scope line still appears, but uses what we know.

### 4. Telemetry

Log which line the next call matches (`next_move_taken: thread | specific_brand | specific_stat | specific_expert | scope | none`) onto the Questions-table row of the **following** call in the same session (`sessionId` already present). This is the metric the brief exists for: *second substantive question within the same session / within 7 days, per identity*. Baseline from the log ≈ 40% of named users, ≈ 0% of starter-prompt users.

## API hand-off (`api-agent`, small)

- `POST /v1/graphs/:graph_id/search` and the cross-graph search path: return `on_topic_total` (count of rows clearing `RELEVANCE_THRESHOLD_LOW_COVERAGE` before the `limit` cut) so the MCP can compute `remaining_count` without a second call. One integer per graph in the response meta; no new endpoint.
- Accept and store `next_move_taken` on `logQuestionToAirtable` (new single-select on the Questions table: `thread | specific_brand | specific_stat | specific_expert | scope | none`). Typecast write, same as `interaction_type`.

## Where to register

- MCP: `src/coverageRelevance.ts` (populate `next_moves` next to `coverage` in `addCoverageAnnotation`), `src/toolHandlers.ts` (`buildRenderInstructions`, `_render_spec_version`), `src/systemPrompt.ts` (rule + removal of the expert fan-out block), `src/sessionTracker.ts` (match next call to prior `next_moves`).
- API: `functions/v1/v1Router.ts` (`on_topic_total`), `functions/tracking/airtable.ts` (`next_move_taken`).
- Bibles: `docs/bibles/product_and_system_reference.md` §"Hard-won decisions" gets one line ("Every research answer closes with the three-line Next Moves block; the expert fan-out block was folded into it 2026-08"); bump `Last updated:`.

## Definition of Done

1. Ten novel queries across five tools (including one `thin` coverage case and one expert consult) each end with exactly three lines in the specified order; every name in them resolves to a real graph/brand/expert present in the envelope. Paste the ten transcripts in the CHANGELOG entry.
2. `next_moves` is present on every research response, absent on non-research tools (`get_my_account`, `list_graphs`, onboarding, billing).
3. A thin-coverage query renders the honest line 1 and still renders lines 2–3.
4. The expert-consult response no longer carries the old 3–5 bullet fan-out; it carries the three-line block with the expert held open on a named signal.
5. `next_move_taken` lands on the following Questions-table row in a two-call session (verify on a row with `sessionId` set).
6. Costs, calls, tokens, slugs, tool names: zero occurrences in the rendered block across the ten transcripts.
7. Paid-tier and SPT responses unchanged except for the block (regression on `get_capabilities`, `brand_tracker` full run).

## Do Not

- Do NOT let the model invent a line when the envelope has no material for it — drop the line.
- Do NOT add a fourth line, a heading, or a list of tools. Three sentences.
- Do NOT surface `next_moves` as text, and do NOT surface coverage status words ("thin", "empty") — line 1's honest form is the only way thinness reaches the user.
- Do NOT gate this on tier; Base and paid get the same block (the block never mentions money).
- Do NOT keep the old expert "Closing Fan-Out Options" alongside the new block.
- Do NOT change ranking, routing, or coverage thresholds in this brief — separate work (`fodda_mcp_orchestration_brief`).

## Files-changed (expected)

- Fodda MCP: `src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/systemPrompt.ts`, `src/sessionTracker.ts`, `CHANGELOG.md`
- Fodda API: `functions/v1/v1Router.ts`, `functions/tracking/airtable.ts`, `CHANGELOG.md`
- Fodda API bibles: `docs/bibles/product_and_system_reference.md`
- Airtable: Questions table, new single-select `next_move_taken`
