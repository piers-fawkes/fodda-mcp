# Brief — MCP Agent — Headless Guidance, Semantic Intent Descriptions & Workflow Next-Actions

**Target Agent:** MCP Agent  
**Context:** Headless Assistance & Discovery Layer (§4b)  
**Priority:** High / Discoverability & Workflow Orchestration  
**Files Expected to Change:**
- `src/toolHandlers.ts`
- `src/tools-manifest.json`
- `src/coverageRelevance.ts`
- `src/systemPrompt.ts`
- (New test) `src/test_capabilities_guidance.ts`
- `CHANGELOG.md`

---

## 1. Context & Architectural Reconciliation

A competitive review against AlphaSense, GLG, and expert platforms highlighted a critical requirement for Fodda as a headless intelligence platform:
**How does a headless Fodda teach host AI models (ChatGPT, Claude, Copilot Studio, Cursor) what Fodda is good at, when to invoke it, how to formulate high-quality research tasks, and what useful actions to take next?**

A naive Copilot proposed adding 5 brand new standalone discovery tools (`what_can_fodda_do`, `recommend_fodda_workflow`, `what_does_fodda_know_about`, `how_to_use_fodda`, `get_next_actions`).
**Under Fodda House Rules, this proposal must be intertwined with existing architecture, NOT implemented naively:**

1. **Consolidate, don't multiply (Hard Rule):** Context budget is tight. Fodda MCP already registers 55 tools! Adding 5 standalone tools pollutes the host model's context window.
   - `what_can_fodda_do`, `recommend_fodda_workflow`, `what_does_fodda_know_about`, and `how_to_use_fodda` consolidate into **`get_capabilities`** (with an optional `topic` argument).
   - `get_next_actions` is redundant: Fodda MCP **already embeds structured `next_moves` inside response payloads** via `coverageRelevance.ts`. Host models should never make an extra round-trip tool call just to ask what to do next.
2. **Canonical Discovery is API-Driven:** Fodda API has implemented canonical endpoints:
   - `GET /v1/capabilities`: Canonical self-description of Fodda's 4 core jobs (`research`, `challenge`, `ask_experts`, `track`), research recipes (prompting methodology), and live platform scale.
   - `GET /v1/capabilities/recon?q={topic}`: Topic reconnaissance ("What does Fodda know about [topic]?").
   MCP's `get_capabilities` must fetch dynamically from the API (with in-memory cache and static fallback) rather than keeping stale hardcoded strings.
3. **Specialist Classification Invariant (Crucial):** Never flatten the roster into "4,150 human experts." Fodda strictly distinguishes:
   - **Human Agents** (verified living practitioners e.g. Ben Dietz, Peter Abraham)
   - **Synthetic Domain Analysts** (AI personas grounded in domain graphs)
   - **C-Suite Agents** (corporate executive strategy personas)
   - **Classic Agents** (historical thinkers)
   The API exposes `platform_scale.specialists.breakdown`. Ensure tool outputs and prompts preserve this distinction.
4. **Money & Pricing Invariants:** Airtable is the source of truth for pricing. Standard price is $0.50 USD per call. SPT is machine-only. **NEVER use "tokens" or "via SPT" in tool descriptions or outputs.**

---

## 2. Required Changes in Fodda MCP

### A. Dynamic API-Driven `get_capabilities` (`src/toolHandlers.ts`)
1. Update `get_capabilities` schema to accept an optional `topic` argument:
   ```typescript
   {
       topic: z.string().optional().describe("Optional subject, brand, category, or problem statement to assess topic reconnaissance ('What does Fodda know about [topic]?'). If omitted, returns platform capability overview, workflow recipes, and specialist breakdown.")
   }
   ```
2. In the handler:
   - If `topic` is provided: call `foddaReq('GET', `/v1/capabilities?topic=${encodeURIComponent(topic)}`, apiKey, userId)` (fallback to local `findCandidateExperts` and hardcoded recipes if network fails).
   - If `topic` is omitted: fetch `foddaReq('GET', '/v1/capabilities', apiKey, userId)` with a 1-hour in-memory cache. Fall back to current static JSON structure if the API call fails.
3. Keep `pricing_url: "https://fodda.ai/pricing"` and published prices from Airtable.
4. Preserve the `specialists.breakdown` (`human_agents`, `synthetic_domain_analysts`, `c_suite_agents`, `classic_agents`) and its explicit `classification_guidance`.

### B. Semantic Intent Upgrades in Tool Descriptions (`src/toolHandlers.ts` & `tools-manifest.json`)
Rewrite tool descriptions to lead with **intent triggers ("Use when...")** rather than technical mechanics. Host models trigger on user intent:

- **`search_graph`**:
  *Update description to lead with:* `"Use when researching market trends, category dynamics, consumer behavior shifts, competitor intelligence, or broad topic investigation across 100+ curated knowledge graphs. Returns trends with cited evidence, lifecycle stage (emerging/building/mature), and structured next_moves. If query names a company/brand, prefer brand_tracker."*
- **`verify_market_claim` & `verify_claim`**:
  *Update description to lead with:* `"Use when evaluating a strategy, pressure-testing a client hypothesis, finding counter-evidence, or uncovering missing assumptions. Evaluates any market or strategic claim against primary evidence and divergence."*
- **`find_expert`**:
  *Update description to lead with:* `"Use when the user asks what specialists think, seeks an authoritative perspective, or needs practitioner depth ('Who should I ask about X?' or 'What would retail experts make of this?'). Returns 2–3 ranked candidate experts across 4,150+ specialist roster with action lines and why matched."*
- **`consult_human_agent`**:
  *Update description to lead with:* `"Use when consulting an authorized living expert twin for practitioner depth, proprietary frameworks, and strategic guidance. Supports deep homework mode (deep: true). Returns cited insights and next_moves."*
- **`brand_tracker`**:
  *Update description to lead with:* `"Use when auditing a brand's health, competitive footprint, trend associations, and market momentum across 100+ graphs, Google Trends, and Wikipedia pageviews."*
- **`manage_scheduled_reports`**:
  *Update description to lead with:* `"Use when establishing recurring intelligence tracking, setting up automated briefings, or monitoring category/brand shifts on a recurring schedule."*
- **`deep_research_topic`**:
  *Update description to lead with:* `"Use when the user needs an exhaustive, autonomous multi-pass briefing report synthesizing cross-graph trends, corporate disclosures, and expert perspectives."*
- **`request_deliverable`**:
  *Update description to lead with:* `"Use when commissioning a finished document from an analyst — an executive briefing, research memo, strategic assessment, or publication-ready article."*

Ensure `tools-manifest.json` is updated to match.

### C. Expand `next_moves` Engine with Executable Continuation Actions (`src/coverageRelevance.ts`)
Next actions must be **executable continuations, not mere labels**. Carry forward context so the host model can invoke the next step without inventing parameters:

1. Extend the `NextMoves` interface to include `actions`:
   ```typescript
   export interface NextMovesAction {
       action: 'pressure_test' | 'create_brief' | 'track_topic' | 'ask_expert' | 'research';
       name: string;
       description: string;
       reason: string;
       target_tool: string;
       suggested_prompt: string;
       suggested_parameters: Record<string, any>;
       available: boolean;
   }

   export interface NextMoves {
       thread?: NextMovesThread | undefined;
       specific?: NextMovesSpecific | undefined;
       shelf?: NextMovesShelfGraph[] | undefined;
       scope_prompt: boolean;
       scope?: string | undefined;
       known_brand?: string | undefined;
       presentation?: 'internal' | undefined;
       consult_envelope?: NextMovesConsultEnvelope | undefined;
       actions?: NextMovesAction[] | undefined; // ADDED: Executable strategic workflow second-steps
   }
   ```
2. In `generateNextMoves()`:
   Populate `actions` with 2–3 contextually relevant, executable second steps:
   - For general research results:
     - `pressure_test`: Target `verify_market_claim` (`suggested_parameters: { claim: "Pressure-test whether [main trend/topic] holds up..." }`, reason: "Evaluate whether findings rely on untested assumptions")
     - `ask_expert`: Target `find_expert` or `consult_human_agent` (`suggested_parameters: { q: "[topic]" }` or `{ agent_id: "[id]", question: "..." }`)
     - `create_brief`: Target `request_deliverable` (`suggested_parameters: { skill_slug: "research_brief", brief: "..." }`)
     - `track_topic`: Target `manage_scheduled_reports` (`suggested_parameters: { action: "create", topic: "[topic]", cadence: "weekly" }`)
   - For consult results:
     - `pressure_test`: Target `verify_market_claim` (verify the expert's thesis against empirical data)
     - `create_brief`: Target `request_deliverable` (commission deliverable in expert's voice)

### D. Update `systemPrompt.ts` with Research Recipes, Coverage Boundaries & Presentation
1. In `RULE: StructuredNextMoves`:
   Instruct host models that they may offer strategic next actions naturally in conversation with the executable continuations from `next_moves.actions`.
2. Add a `### RULE: ResearchMethodologyRecipes` section:
   Instruct the host model on how to frame Fodda queries:
   - For research: seek observed signals, quantitative metrics, and executive disclosures.
   - For pressure-testing: actively seek contrary evidence, management divergence, and structural risks.
   - For expert consultations: use the expert's analytical lane and respect the 3-part attribution arc for Human Agents.
3. In `RULE: ResearchHonesty`:
   When topic reconnaissance or graph coverage indicates a technical/formulation boundary (e.g. chemical formulation, clinical lab testing, patent law), communicate the boundary honestly:
   *"Fodda's knowledge graphs specialize in consumer trends and market adoption. For technical formulation depth, consulting a specialist Human Agent is recommended before drawing conclusions."*

---

## 3. Verification & Acceptance Criteria

1. **Automated Test (`src/test_capabilities_guidance.ts`)**:
   - Verify `get_capabilities` returns 4 canonical workflows and `specialists.breakdown`.
   - Verify `get_capabilities({ topic: "clean beauty" })` returns topic reconnaissance with `coverage_assessment` (flagging formulation boundary) and executable `available_next_actions`.
   - Verify simulated tool run produces `next_moves.actions` containing executable `suggested_parameters`.
2. **Headless UX Zero-Mention Prompt Probe**:
   Test that a naive host AI recognizes Fodda and routes appropriately on zero-mention prompts:
   - *"I'm preparing a strategy presentation about how Gen Z is changing luxury."* $\rightarrow$ triggers `search_graph` or `get_capabilities`.
   - *"We're recommending that the client invest heavily in TikTok Shop. I'm not sure whether we're right."* $\rightarrow$ triggers `verify_market_claim` or `challenge`.
   - *"I'd like a specialist's view on clean beauty formulation."* $\rightarrow$ triggers `find_expert` / `consult_human_agent` with boundary notice.
   - *"Can you keep an eye on this for me?"* $\rightarrow$ triggers `manage_scheduled_reports`.
3. **Context & Budget Check**:
   - Confirm total registered tools count does NOT increase by 5 (maintain consolidation).
4. **CHANGELOG**:
   - Document changes under `[2026-09-28]` in `CHANGELOG.md`.
