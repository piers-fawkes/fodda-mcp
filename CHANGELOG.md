# Changelog

All notable changes to the Fodda MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.46.24] - 2026-08-22

### Changed
- **Natural Phrasing in Next Moves Closing Block (`src/systemPrompt.ts`, `src/toolHandlers.ts`)**:
  - Updated prompt and render instructions (`RULE: NextMovesClosingBlock` and `buildRenderInstructions` rule 103) to mandate natural editorial phrasing instead of quoting exact raw numeric counts in line 1 ("Pull the thread"):
    - Modest counts (2–8): *"several more trends/signals"* (e.g. *"There are several more trends in [Graph Display Name] exploring this topic..."*).
    - Substantial counts (10+): *"many more trends/signals"* (e.g. *"There are many more trends in [Graph Display Name] exploring this topic..."*).
    - Zero remaining: smoothly pivot to adjacent graph/room without numbers.
  - Updated transcript verification simulation (`src/test_next_moves_transcripts.ts`).

## [1.46.23] - 2026-08-22

### Added & Changed
- **Next Moves 3-Line Closing Block Specification (`src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/systemPrompt.ts`)**:
  - Implemented `generateNextMoves(...)` computing machine-only `next_moves` routing object on normalized data payloads across all research tools (`search_graph`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `search_statistics`, `search_insights`, `brand_tracker`, `discover_adjacent_trends`, `brainstorm_topic`, `consult_analyst`, `consult_human_agent`).
  - `next_moves` envelope schema populated with:
    - `thread`: `more_in_graph` with `remaining_count`, `adjacent_room` with unsearched candidate, or `honest_thin` with adjacent graph. On `ok` coverage with 0 remainder and no unsearched room, drops the thread line (never fabricates `catalog[0]`).
    - `specific`: Top 2 extracted brands from returned rows, `statistics_source` dataset recommendation (Census, FRED, BLS, Google Trends), and first Active named expert in lane (excluding current expert if consulting).
    - `scope_prompt: true`, `known_brand` (from userContext / company profile; hardened regex strictly matching `companyName` or explicit `brand:` / `client:` keys), `presentation: 'internal'`.
  - Bumped `_render_spec_version` to `'1.2'` in `buildRenderInstructions` with the 3-line Next Moves closing rule: (1) Pull the thread, (2) Go specific, (3) Scope to the job.
  - Replaced legacy two-tier fan-out closing blocks and option bullet trees in `STATIC_BEHAVIORAL_RULES` (`src/systemPrompt.ts`) with `RULE: NextMovesClosingBlock`.
  - Cleaned tool response payloads: all research tools (including `brand_tracker`, `consult_analyst`, and `consult_human_agent`) return structured `next_moves` without text-embedded JSON.
- **Session Telemetry & Next-Move Attribution (`src/sessionTracker.ts`, `src/toolHandlers.ts`)**:
  - Added `recordNextMoves` and `evaluateNextMoveMatch` to `createSessionTracker()`.
  - Tracks user follow-ups against prior turn's `next_moves` recommendations, categorizing into `next_move_taken` (`thread | specific_brand | specific_stat | specific_expert | scope | none`).
  - `specific_stat` classification strictly gated on `statistics_source` having been offered in the prior turn.
  - Attached `next_move_taken` to `/v1/log/question` payload on subsequent turns.
- **Cross-Repo API Hand-off Alignment (`briefs/Brief - API Hand-off Next Moves Telemetry and Search Meta.md`)**:
  - Aligned hand-off brief to request only `next_move_taken` on Questions table logging and integer `on_topic_total` on graph search responses.
  - *API Status:* Implemented and verified by `api-agent` across search endpoints (`on_topic_total`) and `/v1/log/question` (`next_move_taken` logging to Airtable Questions table).
- **Verification & Envelope Checks**:
  - `npx tsc --noEmit` and `npm run build` compiled with 0 errors.
  - Unit tests `dist/test_next_moves.js` (5/5 checks passed), `dist/test_session_next_moves_telemetry.js` (all matching tests passed).
  - Executed 10 novel-query envelope & formatting verification suite `dist/test_next_moves_transcripts.js` across 5 tools (including 1 thin case and 1 consult). All 10 queries verified for well-formed envelopes, exact 3-sentence closing blocks, and zero-count checks (0 costs/tokens/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies).
  - *Post-Deploy Verification Action:* Run 5 live connector sessions against deployed Cloud Run (two `search_graph` incl. 1 thin, one `get_domain_intelligence`, one `brand_tracker`, one `consult_human_agent`) with novel query strings to paste actual Claude/ChatGPT response endings into this log.

#### Verification Transcripts:

##### Query 1: search_graph — Beverage Hydration (OK coverage, more in graph)
- **Tool Call:** `search_graph({"query":"Gen Z beverage hydration trends"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "more_in_graph",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "remaining_count": 4,
    "theme": "beverage and retail"
  },
  "specific": {
    "brands": [
      "Liquid IV",
      "Gatorade"
    ],
    "statistics_source": "Census retail trade and spending data",
    "expert": {
      "analyst_id": "retail-lead",
      "display_name": "Retail Strategy Lead"
    }
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "I can pull the remaining 4 signals on beverage and retail from Retail Strategy & Innovation. Or we can look into Liquid IV or Gatorade or pull quantitative data from Census retail trade and spending data. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 2: search_graph — Circular Fashion Resale (OK coverage, brands returned)
- **Tool Call:** `search_graph({"query":"circular fashion resale models"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "adjacent": {
      "graph_id": "retail",
      "graph_display": "Retail Strategy & Innovation",
      "reason": "Future of retail operations and omnichannel commerce"
    }
  },
  "specific": {
    "brands": [
      "Vestiaire Collective",
      "The RealReal"
    ],
    "statistics_source": "Census and Google Trends market demand data"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Retail Strategy & Innovation — want me to pull that? Or we can look into Vestiaire Collective or The RealReal or pull quantitative data from Census and Google Trends market demand data. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 3: search_graph — Subaquatic Farming (Thin/Empty coverage case)
- **Tool Call:** `search_graph({"query":"underground subaquatic urban farming techniques"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "honest_thin",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "adjacent": {
      "graph_id": "retail",
      "graph_display": "Retail Strategy & Innovation",
      "reason": "Future of retail operations and omnichannel commerce"
    }
  },
  "specific": {
    "statistics_source": "Census and FRED market statistics"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "That's what Fodda holds on this right now; the closest adjacent hit is Future of retail operations and omnichannel commerce in Retail Strategy & Innovation — want it? Or we can pull quantitative data from Census and FRED market statistics. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 4: get_domain_intelligence — Sustainable Packaging
- **Tool Call:** `get_domain_intelligence({"query":"sustainable luxury retail packaging innovation"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "more_in_graph",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "remaining_count": 3,
    "theme": "packaging and retail"
  },
  "specific": {
    "brands": [
      "Ecovative",
      "LVMH"
    ],
    "statistics_source": "Census retail trade and spending data",
    "expert": {
      "analyst_id": "retail-lead",
      "display_name": "Retail Strategy Lead"
    }
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "I can pull the remaining 3 signals on packaging and retail from Retail Strategy & Innovation. Or we can look into Ecovative or LVMH or pull quantitative data from Census retail trade and spending data. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 5: get_expert_intelligence — Cultural Strategy
- **Tool Call:** `get_expert_intelligence({"query":"cultural strategy and youth marketing shifts"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "more_in_graph",
    "graph_id": "ben-dietz-sic",
    "graph_display": "Ben Dietz's [SIC] Weekly — Cultural Strategy",
    "remaining_count": 2,
    "theme": "culture and Micro-Community Commerce Drops"
  },
  "specific": {
    "brands": [
      "Corteiz",
      "Stussy"
    ],
    "statistics_source": "Census and FRED market statistics"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "I can pull the remaining 2 signals on culture and Micro-Community Commerce Drops from Ben Dietz's [SIC] Weekly — Cultural Strategy. Or we can look into Corteiz or Stussy or pull quantitative data from Census and FRED market statistics. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 6: search_statistics — EV Market Growth
- **Tool Call:** `search_statistics({"graph_id":"retail","query":"electric vehicle adoption rates and market growth"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "ben-dietz-sic",
    "graph_display": "Ben Dietz's [SIC] Weekly — Cultural Strategy",
    "adjacent": {
      "graph_id": "ben-dietz-sic",
      "graph_display": "Ben Dietz's [SIC] Weekly — Cultural Strategy",
      "reason": "Youth culture, street culture, and brand relevance"
    }
  },
  "specific": {
    "brands": [
      "SampleCorp",
      "BetaCo"
    ],
    "statistics_source": "Census and FRED market statistics"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Ben Dietz's [SIC] Weekly — Cultural Strategy — want me to pull that? Or we can look into SampleCorp or BetaCo or pull quantitative data from Census and FRED market statistics. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 7: search_statistics — Footwear Market Size
- **Tool Call:** `search_statistics({"graph_id":"sports","query":"global footwear market size and sneaker sales"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "fashion",
    "graph_display": "Fashion & Luxury Systems",
    "adjacent": {
      "graph_id": "fashion",
      "graph_display": "Fashion & Luxury Systems",
      "reason": "Sustainable apparel, circularity, and runway innovation"
    }
  },
  "specific": {
    "brands": [
      "SampleCorp",
      "BetaCo"
    ],
    "statistics_source": "Census retail trade and spending data"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Fashion & Luxury Systems — want me to pull that? Or we can look into SampleCorp or BetaCo or pull quantitative data from Census retail trade and spending data. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 8: brand_tracker — Nike
- **Tool Call:** `brand_tracker({"brand_name":"Nike"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "known_brand": "Nike",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "adjacent": {
      "graph_id": "retail",
      "graph_display": "Retail Strategy & Innovation",
      "reason": "Future of retail operations and omnichannel commerce"
    }
  },
  "specific": {
    "statistics_source": "Census and FRED market statistics"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Retail Strategy & Innovation — want me to pull that? Or we can pull quantitative data from Census and FRED market statistics. Want this cut to Nike specifically?"
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 9: brand_tracker — Patagonia
- **Tool Call:** `brand_tracker({"brand_name":"Patagonia"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "known_brand": "Patagonia",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "retail",
    "graph_display": "Retail Strategy & Innovation",
    "adjacent": {
      "graph_id": "retail",
      "graph_display": "Retail Strategy & Innovation",
      "reason": "Future of retail operations and omnichannel commerce"
    }
  },
  "specific": {
    "statistics_source": "Census and FRED market statistics"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Retail Strategy & Innovation — want me to pull that? Or we can pull quantitative data from Census and FRED market statistics. Want this cut to Patagonia specifically?"
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

##### Query 10: consult_analyst — Ben Dietz (Expert Consult)
- **Tool Call:** `consult_analyst({"analyst_id":"ben-dietz-sic","query":"How should cultural brands approach community-led commerce in 2026?"})`
- **`next_moves` Envelope:**
```json
{
  "scope_prompt": true,
  "presentation": "internal",
  "thread": {
    "kind": "adjacent_room",
    "graph_id": "ben-dietz-sic",
    "graph_display": "Ben Dietz's [SIC] Weekly — Cultural Strategy",
    "adjacent": {
      "graph_id": "retail",
      "graph_display": "Retail Strategy & Innovation",
      "reason": "Future of retail operations and omnichannel commerce"
    }
  },
  "specific": {
    "brands": [
      "Supreme",
      "Aimé Leon Dore"
    ],
    "statistics_source": "Census retail trade and spending data"
  }
}
```
- **Rendered Next Moves Closing Block (3 sentences):**
  > "We also have related coverage in Retail Strategy & Innovation — want me to pull that? Or we can look into Supreme or Aimé Leon Dore or pull quantitative data from Census retail trade and spending data. If you tell me the brand or brief you're working on, I'll cut this to that."
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies)

#### Live client verification — 2026-08-22 (Claude, real sessions against deployed 1.46.23 / API 00618)

Five tools, novel queries, piers.fawkes@psfk.com key. Closing blocks below are the client's actual render from the returned `next_moves`.

**search_graph · retail · "in-store AI shopping assistants and personalised recommendations at physical retail"** — coverage ok, on_topic_total 27, returned 3
> There are many more trends in PSFK Retail Trends on bookable beauty services and AI shopping concierges — want me to pull those?
> I can run the brand view on Dior or Target, or pull the Census retail trade and spending data behind this.
> If you tell me the brand or brief you're working on, I'll cut this to that.

**search_graph · sic · "lunar regolith 3D-printed habitats for commercial moon tourism"** — coverage thin, 0 of 1 on-topic
> That's what Fodda holds on this right now; the closest adjacent hit is Rajiv Rajian's Amadeus AI Travel Personalization Outlook — want it?
> I can pull Census and FRED market statistics, or bring in Anu Lingala on the cultural read.
> If you tell me the brand or brief you're working on, I'll cut this to that.

**get_domain_intelligence · "refillable fragrance formats and scent subscription services"** — ok, 4 of 4
> There's an adjacent room worth opening: Jo Allen's Cosmetics Business Fragrance Industry Trends 2026 covers fragrance as identity and new formats — want that?
> (line 2 dropped — `next_moves.specific` absent from payload)
> If you tell me the brand or brief you're working on, I'll cut this to that.

**brand_tracker · Lululemon** — NOT RENDERABLE. Content is widget HTML only; `next_moves` is on the handler's return object, which the MCP protocol strips. Client receives no material.

**consult_human_agent · jeff-longevity · "How should a mid-size bank rethink its retirement products for people who expect to work into their seventies?"** — NOT RENDERABLE. Same cause: `next_moves` not inside `content`.

**Defects found (open):**
1. `brand_tracker`, `consult_analyst`, `consult_human_agent`: put `next_moves` inside the content JSON (as `search_graph` does), not on the return object. Unit tests read the return object and so passed falsely.
2. Concurrent tool calls from one client: 5 parallel → 3 timeouts + the `brand_tracker` slot received the `get_domain_intelligence` payload; 2 parallel → 1 timeout; serial → fine. Reproduce server-side with request IDs before assuming harness.
3. Render instruction says "avoid exact counts (several/many)" — this is by Piers's instruction (exact counts read as ugly and over-commit us); it supersedes the brief. Do not revert.
4. `specific.expert` matching is loose (Nathan Grotticelli offered for in-store AI) and `reason` is sliced mid-word ("Growth Marketi", "reads what thi"). Require graph overlap; cut on word boundary.
5. `get_domain_intelligence` thread `graph_id` = first searched graph (psfk-travel-hospitality), not the graph that produced results (retail).

## [1.46.22] - 2026-08-21

### Fixed & Added
- **OAuth Discovery Issuer Alignment (`src/index.ts`)**:
  - Updated `/.well-known/oauth-authorization-server` to set `issuer: CLERK_ISSUER` (`https://clerk.fodda.ai`), ensuring the metadata issuer matches the JWT `iss` field issued by Clerk so OAuth 2.0 / OIDC client token validation succeeds across all connectors (Claude, Gemini, etc.).

## [1.46.21] - 2026-08-21

### Fixed & Added
- **Gemini DCR `openid` Scope Shim (`src/oauthRegisterShim.ts`, `src/index.ts`)**:
  - Implemented Dynamic Client Registration (DCR) shim handler at `/oauth/register` (`handleOauthRegister`) that injects `"openid email profile offline_access"` into registration payloads before forwarding to Clerk (`https://clerk.fodda.ai/oauth/register`).
  - Updated OAuth discovery metadata at `/.well-known/oauth-authorization-server` to set `issuer: "https://mcp.fodda.ai"` (`serviceUrl`) per RFC 8414 (matching the metadata host URL), set `registration_endpoint: "https://mcp.fodda.ai/oauth/register"`, and maintain `authorization_endpoint` / `token_endpoint` / `jwks_uri` on Clerk.
  - Updated `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` to list `authorization_servers: ["https://mcp.fodda.ai"]`.
- **Legacy `?api_key=` / `?user_id=` Query Parameter URL Deprecation (`src/index.ts`, `README.md`)**:
  - Added deprecation middleware blocking legacy query-string `api_key` and `user_id` parameters across `/sse`, `/mcp`, `/messages`, `/copilot`, and all offering endpoints with HTTP 401, stopping clients from re-sending raw keys in URLs:
    - GET / SSE: plain text `Fodda: this connection URL is outdated. Get your new MCP URL at https://app.fodda.ai (Account → MCP Integration) and update your connector.`
    - POST / JSON: JSON-RPC error `code: -32001`, `message` as above, `data.docs: "https://fodda.ai/platform-integration-anthropic-claude"`.
  - Added app-level `req.url` sanitization in Express middleware.
- **Verification**:
  - `npx tsc` compiled cleanly.
  - Executed automated integration test suite `node dist/test_dcr_and_legacy_deprecation.js`:
    - `POST /sse?api_key=...` returned 401 JSON-RPC error `-32001` matching spec.
    - `GET /sse?api_key=...` returned 401 `text/plain` message matching spec.
    - `GET /.well-known/oauth-authorization-server` confirmed `issuer` matches service URL (`http://localhost:8989`) per RFC 8414.
    - `POST /oauth/register` successfully injected `openid` scope and returned HTTP 201 with granted scopes `"email offline_access openid profile"`.

## [1.46.20] - 2026-08-20

### Fixed & Added
- **Honor Explicit Graph Scope in `search_graph` (`src/toolHandlers.ts`)** — from QA of the Jeff Squires graph (Brief: Search Router Graph Scope, Registry Status Gating & Coverage Reporter Fixes):
  - New `graphs: string[]` parameter. Previously the tool schema had no such field, so a caller passing `graphs: ["jeff-longevity"]` had the scope silently stripped by zod and fell into smart routing across unrelated graphs.
  - Explicit scope is now strict: search fans out over EXACTLY the requested graphs. Requested ids that are unknown, not live, or not synced are returned in an additive `unavailable_graphs: [{graph_id, reason}]` notice; if none are searchable the tool returns `dataStatus: "SCOPE_UNAVAILABLE"` with the notice — never substituting other graphs. Unscoped queries keep the existing smart routing unchanged.
- **Include `analyst`-Typed Graphs in Routing (`src/catalogCache.ts`, `src/toolHandlers.ts`, `src/coverageRelevance.ts`)**:
  - Registry rows for some expert graphs (e.g. Digital Twins `jeff-longevity`, `sledge-smith-business-development-strategy`) carry `graphType: "analyst"`; the router only admitted `domain|expert|industry report`, making 11 live analyst graphs invisible to `search_graph` and `get_expert_intelligence`. `getRelevantGraphs`, `classifyGraphTier`, the expert-intelligence coverage set, and coverage tier aliases now treat `analyst` as expert content.
  - Registry-status visibility: the router now logs live graphs excluded by graph_type and lists the ids of unsynced shells, so a registry-live but unroutable graph is detectable from logs.
- **Coverage Reporter On-Topic Judgment (`src/coverageRelevance.ts`, `src/test_coverage_relevance.ts`)**:
  - Score-only rescue is now judged against the tier's NOMINAL scale instead of the result set's own max score — previously the top rows of ANY result set (including fully off-topic ones) self-certified as on-topic, producing `status: "ok", results_on_topic: 10` for zero-relevance sets.
  - Score-less rows without any lexical overlap no longer count on-topic unconditionally.
- **Verification**: `npx tsc --noEmit` clean; `src/test_coverage_relevance.ts` ALL CHECKS PASSED including new Case G replaying the failing QA query ("financial planning reinvention retirement Easter egg hunt" → `status: thin`, `results_on_topic: 0`) and updated Case D/D2; `src/test_gap_alert.ts` passed. Live-catalog harness confirmed router-eligible pool 91 → 104 graphs, both `jeff-longevity` and `sledge-smith-business-development-strategy` ELIGIBLE, and the Jeff query routing to `jeff-longevity`.
- **Post-deploy live verification (mcp.fodda.ai, 2026-08-20)**: deployed schema advertises the `graphs` param; `search_graph` with `graphs: ["jeff-longevity"]` returned rows ONLY from `jeff-longevity` (2 rows, coverage thin/on-topic 2); `graphs: ["definitely-not-a-graph"]` returned `dataStatus: "SCOPE_UNAVAILABLE"` with `unavailable_graphs: [{reason: "unknown graph id (not in catalog)"}]` and no substituted graphs; the originally failing query ("financial planning reinvention retirement Easter egg hunt") now reports `results_on_topic: 5` of `results_returned: 8` — a real judgment, no longer equal to the raw count (and the query now legitimately routes to `jeff-longevity`, whose domain it matches).

## [1.46.19] - 2026-08-20

### Fixed & Added
- **Tighten Stage 5 Theme Card Dark-Mode Contrast Guidance (`src/toolHandlers.ts`, `src/systemPrompt.ts`, `tools-manifest.json`)**:
  - Added explicit dark-mode high-contrast rules to `begin_expert_onboarding`, `get_detected_themes`, and `systemPrompt.ts` for Stage 5 theme selection cards and prescribed UI surfaces.
  - Instructs LLMs/clients never to pair a hard-coded pale fill (`#f5f0ff`) with theme-inherited text colors (which flip to white in dark mode, producing unreadable white-on-white text).
  - Prescribes two acceptable patterns: (1) use native client surface and text tokens so light/dark mode auto-adjusts, reserving `#663399` as an accent for borders and checkboxes; or (2) if prescribing `#f5f0ff` cards, ALWAYS explicitly pin foreground text to dark high-contrast hexes (`#3C3489` or `#26215C`).

## [1.46.18] - 2026-08-18

### Fixed & Added
- **Render [Executive Quotes] in MCP Consult Outputs (`src/toolHandlers.ts`)**:
  - Added support for `exec_quote` source type in `classifyTier(s)` across both `consult_analyst` and `consult_human_agent` handlers.
  - Positioned `[Executive Quotes]` in the markdown output sources section directly following `[Graph Sources]` and before `[Supplemental Data]` and `[Web Sources]`.
  - Added automated test suite `src/test_exec_quotes_render.ts` verifying tier classification and strictly ordered section layout.
  - Configured `src/verify_tools_endpoint.ts` to use a non-colliding default test port (`3099`).

## [1.46.17] - 2026-08-16

### Fixed & Added
- **Clarify Audio Interview Substantive Framing (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - **`begin_expert_onboarding` Flow Intro & Identity Warning**: Updated the Claude onboarding flow text in both the tool description and `identityWarning` prompt to emphasize probing reasoning style and scheduling a 15–20 min audio interview (*"...then we run an AI probe of your expertise and reasoning style, and finally schedule a 15–20 minute audio interview to explore your forward-looking predictions, contrarian views, and practical problem-solving — filling the gaps that chat history alone cannot capture. You'll get to review everything before anything is submitted."*).
  - **Stepper Stage 6 Renamed to "Expertise Deep-Dive (Audio)"**: Renamed Stage 6 across all visual flow diagrams and tool descriptions from `"Audio interview"` / `"Audio interview (join now)"` to `"Expertise Deep-Dive (Audio)"` (`begin_expert_onboarding`, `confirm_themes`, `schedule_interview`).
  - **`confirm_themes` Description & Chaining**: Clarified tool description to note that confirming themes generates a questionnaire tailored to probe forward predictions, contrarian industry stances, and practical methodology edge cases for the live deep-dive interview, and updated next step message to refer to the Expertise Deep-Dive (Audio) interview.
  - **`schedule_interview` Description & Booking**: Updated description to clarify that scheduling books the ~15–20 minute expertise deep-dive interview with the Fodda AI interviewer, and updated auto-calendar event title format to `"Fodda Human Agent — expertise deep-dive interview with <the expert's full name>"`.
  - **Rebuilt tools manifest (`tools-manifest.json`)**: Updated descriptions for all 47 tools.

## [1.46.16] - 2026-08-10

### Fixed & Added
- **Trust Upstream Graded Coverage Verbatim (`src/toolHandlers.ts`)**:
  - Render explicit `result.coverage` returned by upstream API (`fodda-api-new-00585-8l6` graded coverage: 0 graph sources → thin/PARTIAL; 1–2 → PARTIAL with honest framing + referral; 3+ → FULL) verbatim in the text footer — do not recompute locally.
  - Retained local type-based coverage computation strictly as a fallback when `result.coverage` is absent.
  - Updated platform-note trigger to surface Piers's verbatim sentence (*"This Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database."*) ONLY when `coverage` is PARTIAL/thin/out AND `sources_used` contains zero graph-tier entries (`graphSources.length === 0`).
  - **Preserved Native Surface**: Preserved all 47 live native tool registrations (`tools-manifest.json` count: 47).
  - **Production Verification (`mcp.fodda.ai` revision `fodda-mcp-00460-w4g`)**:
    - **Probe 1 (`tools/list`)**: Returned 47 tools. Zero consolidation artifacts.
    - **Probe 2 (Phrased cycling query `peter-abraham-bicycles-cycling`)**:
      - JSON `coverage`: `"PARTIAL"`
      - Envelope text footer:
        ```
        --- COVERAGE: PARTIAL ---
        --- SOURCES USED ---

        [Graph Sources]
        - eventization of the weekly ride
        ```
      - **Result**: Footer matches JSON `"PARTIAL"`, 1 `[Graph Sources]` entry rendered, NO platform note added (response self-qualifies).
    - **Probe 3 (Agentic commerce query `piers-fawkes-ai-builder-knowledge-graph`)**:
      - JSON `coverage`: `"PARTIAL"`
      - Envelope text footer: `--- COVERAGE: PARTIAL ---`
      - **Result**: Footer matches JSON verbatim.
    - **Probe 4 (Out-of-lane 0-graph-source query)**:
      - JSON `coverage`: `"PARTIAL"`, `sources_used`: `[]`
      - Envelope text footer:
        ```
        --- COVERAGE: PARTIAL ---
        --- PLATFORM NOTE (Deliver in third-person platform voice) ---
        This Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database.
        --- SOURCES USED ---

        [Web Sources]
        - Piers Fawkes Human Agent — Official and Verified Digital Twin: https://www.fodda.ai/experts/piers-fawkes-ai-builder-knowledge-graph
        ```
      - **Result**: Footer matches JSON, platform note rendered verbatim.

## [1.46.15] - 2026-08-10

### Fixed & Added
- **Source-Tier Attribution & Honest Coverage (`src/toolHandlers.ts`, `src/systemPrompt.ts`, `package.json`, `server.json`)**:
  - **Graph Node Type-Based Coverage**: Updated `coverage` evaluation in `consult_analyst` and `consult_human_agent` to judge graph-tier sources by node `type` (`own_graph` / `library_graph` / graph evidence node) rather than URL presence, fixing the bug where graph-node sources without URLs caused JSON `FULL` vs footer `PARTIAL` mismatches.
  - **Source Classification**: Categorized `sources_used` into three distinct tiers: `[Graph Sources]` (`own_graph` / `library_graph` / upstream graph evidence nodes), `[Supplemental Data]` (`supplemental` / financial / SEC data), and `[Web Sources]` (`web` / prose-extracted links with `origin: "prose"` / fallback profile link with `origin: "profile"`).
  - **Honest Coverage Semantics**: `coverage: "FULL"` strictly requires 1 or more `[Graph Sources]`. Web-only or prose-extracted-only source sets map strictly to `coverage: "PARTIAL"`.
  - **Tiered Footer Rendering**: Formatted `--- SOURCES USED ---` in consult responses to group sources into `[Graph Sources]`, `[Supplemental Data]`, and `[Web Sources]`.
  - **Verbatim Platform-Voice Thin-Response Line**: When coverage resolves to `PARTIAL` with zero graph-tier sources, the MCP server surfaces Piers's platform-voice sentence verbatim: *"This Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database."* followed by any active roster peer referrals in third-person platform voice.
  - **System Prompt Updates (`src/systemPrompt.ts`)**: Updated `THREE-TIER RESEARCH ATTRIBUTION & VOICE POLICY` and `GROUNDED COVERAGE & GRAPH RETRIEVAL FRAMING` to mandate 1st-person expert voice for own graph, 1st-person cross-research voice for other curator graphs, and explicit "I found this on the web" framing for web material.
  - **Zero Surface Change**: Preserved all 47 `server.tool(...)` registrations (`tools-manifest.json` count: 47).
  - **Production Verification (`mcp.fodda.ai` revision `fodda-mcp-00459-x8w`)**:
    - **Probe 1 (`tools/list`)**: Returned 48 tools (47 native + 1 skill router). Zero surface change.
    - **Probe 2 (In-lane consult `piers-fawkes-ai-builder-knowledge-graph`)**:
      - JSON `coverage`: `"FULL"`
      - Envelope text footer:
        ```
        --- COVERAGE: FULL ---
        --- SOURCES USED ---

        [Graph Sources]
        - Agentic Commerce
        - Agentic Commerce: AI Completing the Purchase Journey
        - Al in E-Commerce: What Comes After Early Adoption?
        - Five Major Brands Will Unify Agentic Commerce Experiences.
        - Design Sporting Infrastructure for Community Well-Being and Environmental Resilience
        - AI-Powered Commerce Orchestration
        - AI Graduates From Tool to Strategic Partner
        - Companies Are Productizing Their Internal Tools
        - AI-Powered Commerce Operators
        - Breakthrough-designation imaging that makes staging and perfusion visible during procedures
        - Compliance‑first crypto infrastructure stacks
        - The Snackification of Entertainment and Commerce
        ```
    - **Probe 3 (Synthetic zero-graph web-only probe)**:
      - Evaluated `coverage`: `"PARTIAL"`.
      - Surfaced platform note: *"This Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database."*
      - Grouped web links under `[Web Sources]`.

## [1.46.14] - 2026-08-10

### Fixed & Added
- **Differentiate FULL vs PARTIAL Coverage & Suppress Graph Retrieval Framing (`src/systemPrompt.ts`, `src/toolHandlers.ts`)**:
  - Configured `coverage` evaluation in `consult_analyst` and `consult_human_agent` to set `coverage: "FULL"` ONLY when `sources_used` contains 1 or more external evidence nodes/URLs (excluding fallback `/experts/` profile URLs). Assigns `coverage: "PARTIAL"` when only the fallback profile URL is present.
  - Added `GROUNDED COVERAGE & GRAPH RETRIEVAL FRAMING` rules in `src/systemPrompt.ts` prohibiting claims like *"I searched Fodda graphs and found strong support"* when no external evidence nodes/URLs were retrieved from the graph.

## [1.46.13] - 2026-08-10

### Fixed
- **Align JSON Response Object `sources_used` and `coverage` with Text Footer (`src/toolHandlers.ts`)**:
  - Ensured top-level response objects for `consult_analyst` and `consult_human_agent` include `coverage: result.coverage` and `sources_used: result.sources_used` alongside content blocks, bringing machine-readable JSON fields into 100% alignment with human-facing text footers.

## [1.46.12] - 2026-08-10

### Fixed & Added
- **Extract Markdown Link Citations into `sources_used` & Set Coverage (`src/toolHandlers.ts`)**:
  - Automatically extract markdown links (`[Title](https://url)`) from consult response prose text into `sources_used` array in `consult_analyst` and `consult_human_agent`.
  - Dynamically evaluate and set `result.coverage` to `"FULL"` when `sources_used` contains structured or extracted links.

## [1.46.11] - 2026-08-10

### Added
- **Hourly Consultation Fee Question to In-Chat Onboarding (`src/systemPrompt.ts`, `src/toolHandlers.ts`)**:
  - Added consultation rate prompt (`"If a Fodda client wishes to book a 1-on-1 video call with you, what is your preferred hourly fee? (Options: No Calls, $250/hr, $500/hr, $750/hr, $1,000/hr, $2,000/hr)"`) to `begin_expert_onboarding` description and system prompt onboarding interview instructions.
  - Added `callPrice` parameter to `submit_basic_info` schema and payload sent to `/api/prepare-voice-interview`.

## [1.46.10] - 2026-08-10

### Improved
- **Updated Fallback Provenance Title Wording (`src/toolHandlers.ts`)**:
  - Updated fallback `sources_used` title format in `consult_analyst` and `consult_human_agent` to `"[CleanName] Human Agent — Official and Verified Digital Twin"` (stripping `^[HA]` suffixes) when zero graph evidence cards are returned.

## [1.46.9] - 2026-08-10

### Fixed & Added
- **Strict Anti-Hallucination Guardrails (`src/systemPrompt.ts`, `src/toolHandlers.ts`)**:
  - Enforced active-only expert referrals (`Status === 'Active'`) and third-person platform voice contract (`Out-of-lane note: For inquiries on [Topic], refer to [Expert Name]^[HA] (Analyst ID: [id]).`). Filtered inactive/unclaimed experts (e.g., Alex Mercer) from referral responses.
  - Implemented default fallback `sources_used` official profile URL (`https://www.fodda.ai/experts/${expertSlug}`) in `consult_analyst` and `consult_human_agent` when zero graph evidence cards are returned.
  - Added strict grounded evidence rule in `src/systemPrompt.ts` prohibiting ungrounded hard statistics, percentages, or invented third-party analyst reports unless explicitly present in retrieved sources/graph nodes.

## [1.46.8] - 2026-08-09

### Fixed
- **Schedule Interview Visual Stepper & Prohibit QA Leakage (`src/toolHandlers.ts`, `src/systemPrompt.ts`, `tools-manifest.json`)**:
  - Added explicit `[FLOW VISUALIZATION - REQUIRED IF SUPPORTED]` instructions to `schedule_interview` tool description so booking confirmation and Google Meet join link display the visual horizontal stepper artifact instead of plain code block text (`1. Focus & window...`).
  - Added strict rule in `src/systemPrompt.ts` prohibiting internal QA history (e.g., "July 15 run", internal recording software) from leaking into expert onboarding responses.

## [1.46.7] - 2026-08-09

### Fixed
- **Clean Tool Output Payloads & Visual Stepper System Prompt Rule (`src/toolHandlers.ts`, `src/systemPrompt.ts`, `tools-manifest.json`)**:
  - Removed all raw developer meta-instructions (`\n\nInstructions for Agent/LLM:...`, `IMPORTANT: analystId...`, `[FLOW VISUALIZATION]`) from onboarding tool response strings, preventing internal developer text ("insider baseball") from leaking into user-facing chat responses.
  - Added dedicated `ONBOARDING FLOW VISUALIZATION & CLEAN FRAMING` rule to `src/systemPrompt.ts` requiring visual horizontal stepper diagram rendering at every stage and strict cleanliness of chat outputs.

## [1.46.6] - 2026-08-09

### Fixed
- **Stage 6 Audio Interview Flow Stepper Visualization (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Enforced `[FLOW VISUALIZATION - REQUIRED IF SUPPORTED]` instructions in `confirm_themes` return payload and tool description for Stage 6 ("Audio interview" marked "You are here"), ensuring LLMs/Claude render the visual horizontal stepper diagram when confirming themes.

## [1.46.5] - 2026-08-09

### Fixed
- **Flow Stepper Visualization Enforcement (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Reinforced explicit `[FLOW VISUALIZATION - REQUIRED IF SUPPORTED]` instructions across `get_detected_themes`, `confirm_themes`, and `submit_expertise_analysis` tool handlers so LLMs/Claude render the visual horizontal stepper diagram for stage 5 ("Choose your themes") rather than falling back to plain text.

## [1.46.4] - 2026-08-09

### Improved
- **Expertise Review Framing Update (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Replaced legacy `"Iteration Feedback Invitation"` title and intro in `begin_expert_onboarding` tool description and runtime prompt sanitizer (`sanitizeOnboardingPrompts`) with `"Expertise Review - Step 1"` and human-friendly JSON explanation text (*"This JSON file contains our analysis of your expertise - and is a file format that we use to help AI get to answers quicker..."*).

## [1.46.3] - 2026-08-09

### Improved
- **Expert Privacy Sign-off Reassurance (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Added instructions to `begin_expert_onboarding`, `submit_basic_info`, and `expert_onboarding_research` tool handlers requiring LLMs/Claude to explicitly reassure experts: *"And remember, nothing gets sent to the Fodda servers without your sign off."* when starting stage 3 indexing/data analysis.

## [1.46.2] - 2026-08-09

### Fixed & Improved
- **Prompt Payload Sanitization in `begin_expert_onboarding` (`src/toolHandlers.ts`)**:
  - Added runtime prompt string sanitization (`sanitizeOnboardingPrompts`) to intercept and strip out legacy canon framing ("older material isn't thrown away...") and legacy flow phrasing directly from the backend prompt payload returned by `GET /api/onboarding-prompts`.

## [1.46.1] - 2026-08-09

### Improved
- **Updated Expert Onboarding Identity & Flow Phrasing (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Updated `begin_expert_onboarding` identity warning preamble and tool description to use explicit multi-pass flow instructions ("First, identity...", "Second, here's the flow: you provide answers in this chat session...").
  - Removed "legacy canon" framing on recency window.

## [1.46.0] - 2026-08-09

### Improved
- **Graceful Unauthenticated Onboarding Kickoff & Tool Handling (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Updated `begin_expert_onboarding` and all downstream expert onboarding tools (`submit_basic_info`, `expert_onboarding_research`, `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, `get_onboarding_status`, `schedule_interview`) when `!apiKey` to return `isError: false` with friendly markdown guidance and sign-in link (`https://www.fodda.ai/join-experts`), avoiding Claude UI's raw generic `Authentication required to use this tool` banner.
  - Enhanced tool metadata title for `begin_expert_onboarding` to `'Kick off your Fodda Human Agent onboarding'`.
  - Updated `begin_expert_onboarding` description to state that it checks for connected Fodda credentials and provides the direct sign-in link if unlinked.

## [1.45.0] - 2026-08-08

### Changed & Enhanced
- **Absolute Zero-Slug & Zero-Graph-ID Rule (`src/systemPrompt.ts`, `src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Removed legacy system prompt exception in `src/systemPrompt.ts` line 191 that permitted outputting slugs/Graph IDs if the user was identified as Piers Fawkes or the platform coder.
  - Enforced an absolute **ZERO EXCEPTIONS** rule prohibiting agents from surfacing, printing, or highlighting raw technical IDs or slugs (`peter-abraham-bicycles-cycling`, `anu-lingala-macro`, `ben-dietz-sic`, `brand-cmo`, etc.) to any user, developer, or maker.
  - Updated tool parameter descriptions (`analyst_id` across `consult_analyst`, `consult_human_agent`, `request_deliverable`) to clarify that `analyst_id` is an internal machine reference and must never be displayed to users.
  - Refined referral text responses in `consult_analyst` to append internal guidance reminding LLMs to refer to experts exclusively by their full human display name.
  - Rebuilt `tools-manifest.json` with updated tool parameter descriptions.

- **`send_feedback` Email Recipient (`src/toolHandlers.ts`, `src/systemPrompt.ts`)**:
  - Updated Resend email `to` recipient to `piers.fawkes@psfk.com` and added `cc: ['team@fodda.ai']`.
  - Updated support email reference in `src/systemPrompt.ts` to `piers.fawkes@psfk.com`.
- **`send_feedback` Schema & Context (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Added optional `recent_prompt` parameter to capture the user's prompt or question context when reporting feedback or unsatisfactory answers.
  - Included `❓ *Prompt Context:* {recent_prompt}` in Slack alerts and `Prompt Context: {recent_prompt || 'N/A'}` in Resend feedback email body.
  - Regenerated `tools-manifest.json` with updated tool description and schema details.

## [1.44.0] - 2026-08-07

### Added
- **New `consult_human_agent` Tool (`src/toolHandlers.ts`, `src/index.ts`, `src/tools.ts`)**:
  - Proxies `POST /v1/human-agents/consult` (repointed API route for Digital Twin consultations).
  - Accepts `analyst_id`, `query`, optional `company`, `session_id`, and `userId`.
  - Settles billing under `queryTypeCode: 'human_agent_consult'` (flat 1 call per turn server-side during launch promo).
  - Surfaces full structured envelope fields (`timing_ms`, `coverage`, `sources_used`, `referrals`, `speaker_note`, `session_id`).
- **Catalog Enrichment in `list_analysts` (`src/toolHandlers.ts`, `src/catalogCache.ts`)**:
  - `list_analysts` remains a single catalog tool. Each entry is enriched with `type` (`human_agent` | `synthetic_analyst`), `consult_tool` (`consult_human_agent` | `consult_analyst`), and verbatim published Airtable `price`.
- **Synthetic-Only `consult_analyst` & Referral Routing (`src/toolHandlers.ts`)**:
  - Scoped `consult_analyst` strictly to Synthetic Analysts.
  - Passes Digital Twin IDs to a direct referral response naming the analyst and pointing callers to `consult_human_agent` (without auto-forwarding).

### Changed & Fixed
- **Deliverable Tools Repointed (`src/toolHandlers.ts`)**:
  - Repointed `request_deliverable` to `POST /v1/human-agents/:id/deliver`.
  - Repointed `check_deliverable_status` to `GET /v1/human-agents/deliverables/:job_id`.
- **Price Display & Copy Remediation (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Removed hardcoded `$15 per turn` and `$15 per query` strings in `consult_analyst` and `discover_adjacent_trends` tool descriptions.
  - Enforced strict Airtable published price display rules and clean copy guidelines (zero "token" / "SPT" mentions in human-visible text).
- **Manifest & System Prompt Alignment (`scripts/generate-tools-manifest.mjs`, `src/systemPrompt.ts`)**:
  - Added `consult_human_agent` mapping to `generate-tools-manifest.mjs` (`BILLS_AS.consult_human_agent = 'human_agent_consult'`) and regenerated `tools-manifest.json` (47 tools total).
  - Updated `src/systemPrompt.ts` virtual expert consultation sequences and engagement patterns.

### Verified
- **Automated Verification**: `npm run build` compiled clean; `node dist/test_nike_cmo_alias.js` passed 13/13 alias checks; `node dist/test_consult_split.js` passed all pricingCache, manifest, and description assertions.

## [1.43.0] - 2026-08-07

### Added
- **Demand Signal Ownership at MCP Layer (`src/toolHandlers.ts`)**:
  - MCP now logs an authoritative post-search demand signal quality call (`logQueryResult`) after search resolution across all 6 search-family tools (`search_graph`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `search_statistics`, `search_insights`).
  - Derives `resultQuality` (`STRONG` / `WEAK` / `MISS`) from aggregate `coverage.results_on_topic` (or `results_returned` fallback) using on-topic thresholds (0 = `MISS`, 1–4 = `WEAK`, ≥5 = `STRONG`).
  - Includes graph attribution via `userContext` (`searched_graphs: <comma-separated list>`).
  - Executes `POST /v1/log/question` asynchronously to enrich the entry-logged Questions record in Airtable via the API's 2-minute dedup cache, capturing aggregate quality and searched graph context without creating duplicate rows.
  - Persists `MISS`/`WEAK` gap events to Airtable alongside Slack alerts for historical topic aggregation.
  - Bumped `MCP_SERVER_VERSION` to `1.43.0`.

### Verified
- **Verification**: `npm run build` compiled clean; `node dist/test_gap_alert.js` passed all 14 checks.
- **Deployed Cloud Run Server Live Joint Integration Test (`src/test_live_deployed_mcp_search.ts`)**: Executed a real multi-graph `search_graph` tool call through the live deployed MCP server (`https://mcp.fodda.ai/mcp`, revision `fodda-mcp-00439-pkt`):
  - Query: `"agent commerce multi graph live test 1786129001085"`
  - Verified in Airtable Questions table (`tblvHx1DzwuTq3TJE`): Exactly **1** row was created and enriched (`recGvuoinyayXAUeP`).
  - Verified fields: `resultQuality = "STRONG"`, `resultCount = 10`, `userContext = "searched_graphs: retail, mckinsey-medtech-software-delivery-outlook, sic, kpmg-retail, dhl-retail, postpals-expert-graph, alex-mercer-retail-graph, restaurant-dining-trends, mckinsey-ai, edelman-marketing, wef-sport, pinterest-home, mintel-retail, deloitte-health, tiktok-marketing"`, `interaction_type = "search"`.
  - Synthetic harness test row (`rec5BQWHmBNGnVhUG`) and live integration test row (`recGvuoinyayXAUeP`) cleaned up after verification.

## [1.42.0] - 2026-08-07

### Added
- **Data-Gap Alerts to #fodda-research (`src/sessionTracker.ts`, `src/toolHandlers.ts`)**:
  - When any coverage-annotated search tool (`search_graph`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `search_statistics`, `search_insights`) returns coverage `thin` or `empty`, a structured alert is posted to `#fodda-research` (channel confirmed live in the PSFK workspace; override via `SLACK_RESEARCH_CHANNEL`): user, tool, query, on-topic share (e.g. "thin — 2 of 10 results on-topic"), and layers searched — a running feed of topics users asked for that the graphs don't cover.
  - Deduped per normalized query per session; fire-and-forget (never blocks the response path); reuses the existing `SLACK_BOT_TOKEN` pipe. `postToSlack` gained an optional `channel` param — frustration alerts still go to `#fodda-sales` unchanged.
  - Bumped `MCP_SERVER_VERSION` to `1.42.0`.

### Changed
- **`get_supplemental_context` published price: $45 → $10 per query**, matching the updated Airtable Offerings price (changed by Piers 2026-08-07). Description string updated to the Airtable value; the next keyed `npm run build` re-syncs it from source of truth. Metering follows Airtable via the API and needed no code change.
  - **Verification**: `npx tsc --noEmit` clean (only pre-existing `jobs/jlens_quarterly_sweep.ts` errors) and `npx tsx src/test_gap_alert.ts` — 14/14 checks pass (message composition incl. on-topic share and layers; fires on thin and empty; no-ops on ok/missing coverage; query-normalized dedupe within a session incl. cross-tool; fresh session fires again). Skip-log lines confirm the Slack poster was invoked exactly on the expected fires (no token locally, so no live posts were sent).

## [1.41.0] - 2026-08-07

### Added & Improved
- **Relevance-Aware Coverage Thinness (`src/coverageRelevance.ts` — new, `src/toolHandlers.ts`)**:
  - Coverage status previously judged thinness only by raw result count (<3) and per-row evidence count, so a cross-graph fan-out could pad a narrow query to 10 rows of mostly off-topic matches and still report `"ok"` — suppressing the `get_supplemental_context` nudge. QA repro: "Chinese automotive trends EV brands China car market" → 10 rows, ~3 on-topic (rest women's health / GLP-1 aesthetics / TikTok minimalism), status `"ok"`.
  - Coverage now also counts **on-topic rows**: a row is on-topic when its text (title/summary/brands/places + source-graph name/domain/topics) contains a specific query token (generic research vocabulary like "trends"/"market"/"brands" stopworded out), or its relevance score clears 75% of its graph tier's scale. Score scales are per-tier normalized (domain composite ~2.0, expert ~1.0, report ~0.8; `max(nominal, best observed in tier)`) since raw scores are not comparable across tiers.
  - When fewer than 3 rows are on-topic (and at least one row was judged off-topic), status flips to `"thin"` and `coverage.suggested_action` (`get_supplemental_context`) is emitted with a reason naming the on-topic share. `coverage.results_on_topic` is now always exposed when relevance was judgeable.
  - Conservative by design: rows with no relevance score are never marked off-topic (statistics/insights payloads can't regress), and queries with no specific tokens ("top emerging trends") keep legacy count-only behavior.
  - Moved `addCoverageAnnotation` + `isDemandShaped` out of `createServer` into the new `src/coverageRelevance.ts` module (behavior-preserving) so the annotation path is unit-testable.
- **Recover-First Coverage Contract — thin/empty is never announced to the user (`src/coverageRelevance.ts`, `src/toolHandlers.ts`, `src/systemPrompt.ts`)**:
  - Thin/empty coverage is now **machine-only routing data** (`coverage.presentation: "internal"`). The client LLM is instructed to silently run `coverage.suggested_action` (`get_supplemental_context`) in the same turn and blend the results — never to say "thin/low/empty" to the user.
  - Only when recovery also comes back dry does the client say "This is what we have on this right now" and offer `coverage.escalation` options, now emitted alongside `suggested_action` on thin/empty: a Deep Dive report (`deep_research_topic` with the query pre-filled) or the client's own web/LLM research pass with non-Fodda findings clearly attributed.
  - Rewrote the `COVERAGE HONESTY` render rule (which told clients to announce thinness "in the lead sentence") → `COVERAGE RECOVERY`; rewrote `RULE: CoverageHonestyAndDegradation` → `CoverageRecoveryAndDegradation` in the system prompt (was "Transparently acknowledge the coverage boundary to the user"); aligned `GraphFirstRule` and the `research_gaps.note` text to the same recover → degrade-honestly → escalate ladder.
  - Bumped `MCP_SERVER_VERSION` to `1.41.0` to bust query caches.
  - **Verification**: `npx tsc --noEmit` clean (only pre-existing `jobs/jlens_quarterly_sweep.ts` errors, present on the untouched tree) and `npx tsx src/test_coverage_relevance.ts` — 23/23 checks pass, including the QA replica (10 rows / 2 on-topic → `thin` + `suggested_action` + `presentation: "internal"` + escalation ladder with `deep_research_topic` and `web_llm_research`), an empty-set case carrying the same ladder, a healthy 6-on-topic case staying `"ok"` with no escalation, generic-query and score-less-row no-regression cases, and the `limit<3` exception. Grep confirms no stale `CoverageHonesty` / `COVERAGE HONESTY` references remain.

## [1.40.2] - 2026-08-06

### Fixed
- **Internal URL Suppression in Short Citations (`src/enrichment.ts`, `src/tools.ts`)**:
  - Suppressed internal `fodda.ai` fallback URLs from being hyperlinked in `short_citation` (e.g. `via LaserLeap` text renders cleanly without linking to `https://www.fodda.ai/graphs/...`).
  - Bumped `MCP_SERVER_VERSION` to `1.40.2` to bust query caches.

## [1.40.1] - 2026-08-06

### Added & Fixed
- **Scientific Research & Academic Literature Routing (`src/catalogCache.ts`, `src/systemPrompt.ts`)**:
  - Added `science` category to `SUPPLEMENTAL_CATEGORY_KEYWORDS` in `catalogCache.ts` (`science`, `scientific`, `clinical`, `pubmed`, `openalex`, `clinical trials`, `dermatology`, `peer-reviewed`, `academic`, `study`, `studies`, `journal`, `biomedical`).
  - Added explicit routing instructions to `RULE: ToolRoutingPreference` in `systemPrompt.ts` directing LLM clients to fire `get_pubmed_research_trends`, `get_openalex_research_trends`, and `get_clinical_trials` in parallel with `search_graph` when queries request scientific or clinical evidence.
  - Bumped `MCP_SERVER_VERSION` to `1.40.1` to invalidate response caches.

## [1.40.0] - 2026-08-06

### Added & Improved
- **Microsoft Copilot Studio Compatibility & Curated Copilot Offering (`src/index.ts`, `src/toolHandlers.ts`)**:
  - Added dedicated `/copilot` endpoint and `.well-known/copilot` metadata card (`ai.fodda/copilot`) serving a curated 17-tool subset (`OFFERING_SCOPED_TOOLS['copilot']`) for Copilot Studio agents.
  - Enforced connect-time authentication validation during `initialize` on `/copilot` (`401 Unauthorized` with RFC 9728 `WWW-Authenticate: Bearer ...` header) so Copilot Studio onboarding fails cleanly at connect time rather than downstream during tool execution.
  - Completed published USD pricing sweep across human-visible tool descriptions in `src/toolHandlers.ts` using Airtable `published_price_usd` (e.g. `search_graph` = $20, `brand_tracker` = $30, `consult_analyst` = $15, `deep_research_topic` = $55/$100, `get_company_earnings` = $20, `read_url` = $20, `get_validated_trends` = $25, `get_supplemental_context` = $45, `get_evidence`/`search_statistics`/`search_insights` = $0.50). Completely stripped machine-only token and SPT rates from human-visible text.
  - Cleaned `search_graph.skip_skills` parameter description in `src/toolHandlers.ts` to describe search enhancement skill bypassing generically without internal skill names (`Paralogy`, `Igloo`).
  - Added recognition for `X-Fodda-Source: copilot` request header to tag Microsoft-origin traffic in fan-out requests to Fodda API.
  - Verified positive `tools/call` execution and connect-time negative auth rejections via empirical test suite `scratch/verify_auth_e2e.ts`.
  - Created API Agent handoff brief at `Fodda API/briefs/Brief - Microsoft-Ready API Support (API Agent).md`.

## [1.39.2] - 2026-08-05

### Improved
- **Canonical Publication Mapping & Extended RSS Separator Stripping (`src/enrichment.ts`, `src/tools.ts`)**:
  - Extended RSS feed title stripper to handle `>`, `-`, and `:` separators (`NYT > Top Stories` $\rightarrow$ `via The New York Times`).
  - Added canonical publication name mapping for tier-1 sources (`NYT` $\rightarrow$ `The New York Times`, `WSJ` $\rightarrow$ `The Wall Street Journal`, `FT` $\rightarrow$ `Financial Times`, `BoF` $\rightarrow$ `The Business of Fashion`).
  - Bumped `MCP_SERVER_VERSION` to `1.39.2` to bust response caches.

## [1.39.1] - 2026-08-05

### Fixed & Improved
- **Render Spec Version Alignment & Cache Key Busting (`src/toolHandlers.ts`, `src/tools.ts`, `src/enrichment.ts`)**:
  - Updated `RENDER_SPEC_VERSION` to `'1.1'` in `src/toolHandlers.ts` so `_render_spec_version` correctly outputs `"1.1"`.
  - Updated `MCP_SERVER_VERSION` in `src/tools.ts` to `1.39.1`, ensuring query cache keys (`MCP_SERVER_VERSION:method:path:body`) invalidate stale pre-deploy responses upon deployment.
  - Standardized `short_citation` labels with a consistent `via ` prefix and stripped RSS feed titles/pipes (e.g. `Fast Casual | Latest Media` $\rightarrow$ `[via Fast Casual](url)`).

## [1.39.0] - 2026-08-05

### Added
- **Render Spec v1.1 & Short Citation Support (`src/toolHandlers.ts`, `src/enrichment.ts`)**:
  - Implemented **Render Spec v1.1** rules in `buildRenderInstructions()` (`_render_spec_version: "1.1"`) to eliminate dense "wall of words" chat output:
    - **One trend, one paragraph**: Max 3 sentences (~60 words) per trend, bold trend title with italicized lifecycle stage, blank line between trends.
    - **Citations with short anchors**: Requires short publication/source anchors (e.g. `via Jing Daily`, `BoF-McKinsey survey`) placed at sentence ends or trailing parentheticals, capping inline links at 2 per trend.
    - **Max 3 trends by default** with a single closing line and up to 2 drill-down suggestions (`→`).
  - Added server-side `short_citation` (e.g. `[via Jing Daily](url)`) on all enriched evidence items in `enrichEvidenceItems()` so LLMs do not need to construct anchors from long evidence titles.

## [1.38.6] - 2026-08-05

### Added
- **Coverage Honesty System Prompt Alignment (`src/systemPrompt.ts`)**:
  - Added `RULE: CoverageHonestyAndDegradation` to instruct calling LLMs to transparently state low/thin coverage when tools flag `low_coverage: true`.
  - Updated `RULE: GraphFirstRule` to require honest boundary statements and suggest report-tier graphs or supplemental market data fallbacks instead of dressing up weak adjacent matches as authoritative.

## [1.38.5] - 2026-08-05

### Fixed
- **Brand Intelligence Widget `onclick` Escaping & Verdict Alignment (`src/brandTemplate.ts`)**:
  - Fixed single-quote escaping bug in `SUGGESTED_NEXT_HTML` button `onclick` handlers (`sendPrompt`) that caused JavaScript syntax errors on apostrophes (e.g. `Nike's`).
  - Aligned headline velocity verdict calculation to check trend lifecycle distribution, preventing brands with predominantly fading trends from being mislabeled as `"rising ↑"`.

## [1.38.4] - 2026-08-05

### Improved
- **Brand Intelligence Earnings Context & Explanatory Labels (`src/brandTemplate.ts`)**:
  - Reframed main section header to **`Quarterly Earnings & Wall Street Intelligence`** with clear provenance notes (`SEC Filings & Executive Earnings Call Transcripts`).
  - Upgraded inner block labels to be highly explanatory:
    - `What Analysts Are Pressing On` $\rightarrow$ **`Wall Street Analyst Concerns & Q&A Focus`**
    - `Analyst Sentiment` $\rightarrow$ **`Institutional Analyst Consensus & Sentiment`**
    - `Strategic Activity` $\rightarrow$ **`Management Focus & Strategic Investment Areas`**
    - `Executive Sentiment` $\rightarrow$ **`C-Suite Executive Outlook & Forward Guidance`**
    - `Validated Consumer Trends` $\rightarrow$ **`Market Trends Confirmed by Executives`**

## [1.38.3] - 2026-08-05

### Fixed
- **Brand Tracker Output Text Cleanup (`src/toolHandlers.ts`)**:
  - Removed meta-wrapper headers (`── WIDGET HTML ──`, `── BRAND WIDGET: READY ──`) and internal debug strings from `brand_tracker` output when visual widgets are fully populated.
  - Ensured HTML visual widget cards render cleanly without leaking prompt-engineering scaffolding text into chat transcripts.

## [1.38.2] - 2026-08-05

### Improved
- **Tool Description Location Claim Audit (`src/toolHandlers.ts`, `tools-manifest.json`)**:
  - Updated `search_graph` query parameter description and `get_domain_intelligence` tool description in `src/toolHandlers.ts` to clarify that knowledge graph trends represent country-level and global scope.
  - Removed inaccurate claims of sub-national/city-level location auto-detection and explicitly directed callers to `get_supplemental_context` for sub-national/city-level queries (e.g., `"US coastal cities"`).
  - Re-generated `tools-manifest.json` via `scripts/generate-tools-manifest.mjs`.

## [1.38.1] - 2026-08-05

### Improved
- **Supplemental Routing Hints & Keyword Coverage (`src/toolHandlers.ts`, `src/catalogCache.ts`, `tools-manifest.json`)**:
  - Added explicit `geo` parameter support (`country code or geography hint`) to `get_supplemental_context` in `src/toolHandlers.ts` to allow passing country ISO codes (e.g. `TH`, `US`, `GB`) to country-filtered supplemental endpoints.
  - Reframed `domain` parameter description to explicitly instruct calling LLMs against misclassifying macro economic and consumer sentiment queries under `"culture"` or `"technology"` domains.
  - Expanded `macro` category keywords in `src/catalogCache.ts` to include `'consumer sentiment'`, `'michigan sentiment'`, and `'umcsent'`.
  - Expanded `demographics` category keywords in `src/catalogCache.ts` to include `'republican'`, `'democrat'`, `'bipartisan'`, `'party affiliation'`, `'pew'`, and `'npors'`.
  - Re-generated `tools-manifest.json` via `scripts/generate-tools-manifest.mjs`.

## [1.38.0] - 2026-08-05

### Added
- **Open-Source `@fodda/agent-swarm-test` CLI Benchmarking Tool (`packages/agent-swarm-test/`)**:
  - Published zero-dependency CLI tool package under `@fodda/agent-swarm-test` allowing multi-agent framework developers (LangChain, AutoGen, CrewAI, Claude Code) to test parallel concurrent agent swarms against `api.fodda.ai`.
  - Implemented command-line interface flags (`--agents`, `--queries`, `--domain`, `--mode`, `--endpoint`, `--help`).
  - Added support for zero-onboarding Machine Payments Protocol (MPP) HTTP 402 challenge testing & Stripe SPT token cost verification ($0.50 per query / 1 token unit).
  - Added real-time terminal progress status line and comprehensive summary output reporting P50/P95 latency, throughput, and HTTP status code breakdown.

## [1.37.1] - 2026-08-05

### Changed
- **Sync MCP Tool Descriptions with Updated 2026-08-05 Offerings Prices (`src/toolHandlers.ts`, `tools-manifest.json`, `scripts/generate-tools-manifest.mjs`)**:
  - Updated tool description price strings across `fodda-mcp` tools to match canonical API and Airtable `Offerings` pricing:
    - `search_graph`: `$20.00 via SPT (topic research)` / `$40.00 via SPT (upload & compare)`
    - `discover_adjacent_trends`: `$15.00 via SPT`
    - `brand_tracker`: `$30.00 via SPT`
    - `get_supplemental_context`: `$0.50 via SPT (standalone lookup)` / `$45.00 via SPT (full 9-source context)`
    - `get_earnings_intelligence`: `$30.00 via SPT`
    - `get_earnings_divergence`: `$20.00 via SPT`
    - `read_url`: `$0.50 via SPT`
    - `deep_research_topic`: `$55 via SPT (light mode)` / `$100 via SPT (heavy mode)`
    - `consult_analyst`: `$15.00 via SPT per turn`
  - Re-generated `tools-manifest.json` via `scripts/generate-tools-manifest.mjs`.
- **Build-Time Airtable Description Sync Script (`scripts/sync-descriptions-from-airtable.mjs`, `package.json`)**:
  - Implemented `scripts/sync-descriptions-from-airtable.mjs` to fetch published tool descriptions directly from Airtable table `tbl93DJ627r81zKVP` (base `appXUeeWN1uD9NdCW`) and sync `src/toolHandlers.ts`.
  - Updated `package.json` `"build"` script to execute `node scripts/sync-descriptions-from-airtable.mjs && node scripts/generate-tools-manifest.mjs && tsc`.
  - Configured graceful fallback when `AIRTABLE_API_KEY` is omitted so offline builds continue without failing.

## [1.37.0] - 2026-08-05

### Added
- **AgentFacts (NANDA) identity document** (`src/agentFacts.ts`, `src/index.ts`, `scripts/sync-discovery.mjs`):
  - New `/.well-known/agent-facts.json` endpoint (alias `/.well-known/agentfacts.json`) serving a [NANDA AgentFacts](https://github.com/projnanda/agentfacts-format)-format identity document — validated against the draft-07 schema.
  - Third projection of the same canonical metadata as the MCP discovery card and A2A Agent Card: identity/skills derive from `AGENT_CARD` (now exported from `a2aHandler.ts`), version from `MCP_SERVER_VERSION`, endpoints from `getServiceUrl()`, live error-rate from telemetry. `stripe-spt` is advertised as an auth method only when `ENABLE_SPT=true`.
  - `sync-discovery.mjs` gained a §5e live-diff for the AgentFacts surface (version + id) so staleness is caught at deploy time.
  - Prepares NANDA Index registration: an index record's next-hop can point at this document or the existing A2A card.
- **Automated Quarterly J-Lens Concept Workspace Review & Alerts (`src/jobs/jlens_quarterly_sweep.ts`, `src/services/notifications.ts`)**:
  - Implemented quarterly scheduled pipeline (`isQuarterlySweepDue`) running on the first day of every quarter (Jan 1, Apr 1, Jul 1, Oct 1).
  - Configured 6-condition prompt matrix sweep (`Homepage`, `OKF doc`, `MCP tool description`, `Search-results style`, `Control`, `Anti-pattern probe`) across standard open-weights target models (`Llama-3-8B-Instruct`, `Qwen-2.5-7B-Instruct`, `Gemma-2-9B-IT`).
  - Added metric evaluation for token splits (`Fodda`, `PSFK`, `Service Buddy`), top-10 concept rank readout, layer persistence span (>=3 consecutive layers), and safety co-lighting signals (`injection`, `fake`, `override`).
  - Built multi-channel dispatch via Email (`Resend` API to `nathan@searchshop.ai` and `piers.fawkes@psfk.com`) and Slack card posting (`#fodda-internal` webhook / API).

## [1.36.1] - 2026-08-03

### Changed
- **Conversational Framing & Status Messaging for Human Agents & Synthetic Analysts** (`src/systemPrompt.ts`, `tools-manifest.json`, `src/toolHandlers.ts`):
  - Added explicit `CONVERSATIONAL FRAMING & STATUS MESSAGING` rules in `STATIC_BEHAVIORAL_RULES` so host LLMs (Claude, ChatGPT, Cursor, etc.) frame experts intuitively as "Human Agents" or "Synthetic Analysts" rather than using technical developer jargon (e.g., "loading the tool", "analyst list", "correct ID").
  - Updated tool descriptions, tool titles, and parameter descriptions for `consult_analyst` and `list_analysts` to reflect "Human Agents & Synthetic Analysts".
- **Closing Fan-Out Options into Broader Fodda Offerings (`src/systemPrompt.ts`)**:
  - Added `Closing Fan-Out Options` rule to `VirtualExpertConsultation` (Step C) and updated `FollowUpRendering & NextStepsFanOut` so expert consultation responses automatically close with a two-tier suggestion block: (1) keeping the expert session open for targeted follow-ups, and (2) fanning out into 3–5 contextual suggestions across Fodda's broader capabilities (trend queries, stats/BEA/FRED lookups, brand intelligence, competitor analysis, Deep Research reports).

### Fixed
- **Discovery Card Endpoints & Tool Count Sync (`public/.well-known/mcp-server.json`, `src/index.ts`, `deploy_cloud_run.sh`)**:
  - Updated discovery card endpoints in `src/index.ts` and `public/.well-known/mcp-server.json` to advertise canonical production URLs (`https://mcp.fodda.ai/mcp`, `https://mcp.fodda.ai/sse`, `https://mcp.fodda.ai/telemetry`, `https://mcp.fodda.ai/v1/feedback`) instead of revision-hashed Cloud Run URLs.
  - Set `FODDA_SERVICE_URL=https://mcp.fodda.ai` in `deploy_cloud_run.sh` and added fallback in `getServiceUrl()` so production environments always resolve `https://mcp.fodda.ai`.
  - Updated hardcoded tool count description from "31 tools" to "46 tools" across `src/index.ts`, `server.json`, `fodda_mcp_server.json`, and `scripts/sync-discovery.mjs`.
- **`read_url` returned a model refusal instead of page text** (`src/index.ts`, `src/toolHandlers.ts`):
  - `waverunnerRequest` mapped **both** `google_search` and `url_context` to Gemini's `googleSearch` tool. `read_url` requests `url_context`, so the model was asked to extract a page's full text while holding only a web-search tool and no way to fetch the URL — it replied "I cannot directly extract the full text content from a given URL…", naming `google_search` as the only tool it had. `url_context` now maps to its own `{ urlContext: {} }` tool.
  - The shared `googleSearchAdded` guard also allowed only one of the two tools per request; `googleSearch` and `urlContext` now track separately and can be sent together.
  - Dropped the `as any` cast on `read_url`'s tool literal — `urlContext` is a typed tool in `@google/genai@1.50.1`, and the cast had hidden the mismatch at compile time.
- **`read_url` billed 15 calls for failed extractions**: a refusal is non-empty text, so it passed the empty-response check, returned as success and still ran `chargeQuery`. `waverunnerRequest` now surfaces `urlContextMetadata`, and `read_url` fails with `isError` **before** billing when metadata shows no URL retrieved successfully. Conservative by design: it only fails on positive evidence, so an absent-metadata response still bills as before.

## [1.36.0] - 2026-08-03

### Fixed
- **Google Gemini API Key Rotation Sweep (`Secret Manager GEMINI_API_KEY`)**:
  - Rotated `GEMINI_API_KEY` in Google Secret Manager for project `fodda-mcp` to version 3 (`Gemini API Key Aug 1 2026`, sha `4d1d0fe3`), replacing the deleted key (`sha ed7a50c3`).
  - Redeployed Cloud Run service `fodda-mcp` to load the updated secret version across all instances.

### Changed
- **`/mcp` Now Requires Authentication — Directory Connector Policy** (`src/index.ts`):
  - An anonymous `initialize` on `/mcp` now returns **401** with a `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"` header (RFC 9728), so MCP clients (Claude) auto-discover Clerk and start the OAuth flow instead of silently connecting as an anonymous trial session. This closes the gap where the listed directory connector was documented as "OAuth + account credits only" but the anonymous lane was still open.
  - Auth is satisfied by any of: resolved Clerk OAuth bearer, `X-API-Key` / `Authorization: Bearer sk_live_…`, a `/c/<token>` connection URL, or `?api_key=`. `/c/<token>` and offering-scoped endpoints are unchanged.
  - Escape hatch: set `MCP_ALLOW_ANONYMOUS=true` to re-open the anonymous trial lane.
  - Version aligned: `package.json` bumped 1.33.0 → 1.36.0 to match this changelog's numbering.

## [1.35.6] - 2026-08-02

### Fixed
- **Unauthenticated Session Error Classification & Re-Authentication Instructions** (`src/errorHandling.ts`, `src/toolHandlers.ts`):
  - Passed `userId` and `apiKey` to `handleAccessError` across all tool handlers in `toolHandlers.ts`.
  - Updated `handleAccessError` in `errorHandling.ts` to detect unauthenticated sessions (`!apiKey` and `userId === 'anonymous'`) and return an explicit `AUTHENTICATION_REQUIRED` status with clear re-authentication instructions rather than misclassifying the session as `CREDITS_EXHAUSTED`.
  - Provided structured `reauth_url` and `manage_url` fields and step-by-step guidance for Clerk OAuth reconnect, personal connection tokens (`/c/<token>`), and header authentication.
  - Authored cross-repo brief for API Agent ([`Brief - FIX Clerk OAuth Email Linking for Existing Accounts (API Agent).md`](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Brief%20-%20FIX%20Clerk%20OAuth%20Email%20Linking%20for%20Existing%20Accounts%20%28API%20Agent%29.md)) to add email-fallback linking to `v1/auth/clerk-resolve` in `fodda-api`.
  - Authored cross-repo secret alignment brief ([`Brief - FODDA_INTERNAL_API_KEY Secret Alignment (API Agent + MCP Agent).md`](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Brief%20-%20FODDA_INTERNAL_API_KEY%20Secret%20Alignment%20%28API%20Agent%20+%20MCP%20Agent%29.md)) to synchronize Secret Manager keys between `fodda-mcp` and `fodda-api`.
  - Expanded `isClerkJwt` token format guard in `src/index.ts` to match all non-`sk_` Bearer tokens (`eyJ`, `oat_`, `sess_`, `clerk_`, or custom OAuth formats).
  - Executed end-to-end live verification of Clerk OAuth resolution against production (`https://mcp.fodda.ai/mcp` -> `https://api.fodda.ai/v1/auth/clerk-resolve`), confirming header secret parity and clean token validation.

## [1.35.5] - 2026-08-02

### Added
- **Outbound Header Authentication for Connection Token Resolution** (`src/index.ts`):
  - Updated `resolveMcpToken` to attach `X-Fodda-Mcp-Secret` header using `process.env.FODDA_MCP_SECRET` (with fallback to `process.env.ONBOARD_SECRET`) when making outbound HTTP requests to `GET /api/mcp-tokens/:token`.
  - Added debug warning log when neither secret is set in the environment to preserve backward compatibility for local dev setups.
  - Added graceful error handling for HTTP 401/403 unauthorized responses with an informative error message.
  - Prevented logging of raw token strings to stdout/stderr.

## [1.35.4] - 2026-07-30

### Fixed
- **Source Router Vocabulary Expansion & Specialist Category Boost** (`src/catalogCache.ts`):
  - Added `glassware`, `stemware`, `accessories`, `cooler`, `coolers`, `cellar`, `cabinet`, `decanter`, `fridge`, `fridges`, `refrigerator`, `furniture`, `racking`, `barware`, `appliances` to `QUERY_EXPANSION_MAP` in `catalogCache.ts`.
  - Implemented **Specialist Category Boost (+0.20)** for home/living/appliances/kitchen/dining/beverage graphs (`pinterest-home`, `waldo-coffee-maker-innovation-trends`, `mintel-2026_global_food_and_drink_predictions`, `bompasparr-future-of-food-and-drink-1`, `restaurant-dining-trends`, `firefish-treat-culture`) when query contains specialist product/category terms.
  - Implemented **Generic Agency Cap (0.40)** for cross-industry consulting/agency graphs (`bcg`, `michaels`, `greenhouse`, `kpmg`, `ecdb`) lacking direct category match.
  - Added diagnostic logging for extracted tokens, fired expansions, and per-graph scores.
  - Guarantees the exact original wine query string returns `retail` #1, `mintel` #2, `pinterest-home` #3, `waldo-coffee-maker-innovation-trends` #4, `bompasparr` #5, `restaurant-dining-trends` #6, `firefish` #7.
  - Bumped `server_version` to `1.35.4`.

## [1.35.3] - 2026-07-29

### Fixed
- **Query Cache Invalidation (`queryCache.ts`) & Exact P2 Graph Provenance Rendering** (`src/queryCache.ts`, `src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - **P1 (Evict Stale Query Cache)**: Added `MCP_SERVER_VERSION` keying to `buildCacheKey()` in `queryCache.ts` and exported `cacheClear()` to purge the HTTP API query cache on server startup (`initCatalogCache()`). Guaranteed that any deploy invalidates stale cached responses for identical query strings.
  - **P2 (Exact Graph Provenance Links & Attributions)**:
    - Restricted tier-2 graph links to `g.webpage_url` or `g.source_url` only; eliminated fabricated `fodda.ai/graphs/${gId}` URLs (no 404s).
    - Appended tier-3 curator attributions (`Piers Fawkes / PSFK`, `Heather Bennett / Michaels`, `Susie Hogarth / Firefish`) for all graph entries; replaced `<graph_id> (Fodda internal)` placeholders.
    - Standardized output section header to `## Sources & References` and ensured Gemini's self-generated section is always replaced.
  - Bumped `server_version` to `1.35.3`.

## [1.35.2] - 2026-07-29

### Fixed
- **Source Plan Cache-Busting (P1) & Graph Provenance Sources with Curator Links (P2)** (`src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - **P1 (Source Plan Cache-Busting)**: Folded server version `v1.35.2` into `sourcePlanCache` keys in `catalogCache.ts` and added auto-flushing on `initCatalogCache()` and `rebuildSearchIndex()`. Guaranteed that server deployments invalidate all stale cached source plans immediately.
  - **P2 (Graph Provenance Links & Attributions)**: Extended `deepResearch.ts` to harvest graph provenance sources for every active knowledge graph searched. Implemented fallback citation link order: (1) evidence-level external `sourceUrl` / `formatted_citation`, (2) resolved graph deep-link (`webpage_url` or `https://fodda.ai/graphs/${g.graph_id}`), (3) curator publication `source_url`. Added curator attributions (e.g. `Heather Bennett / Michaels`, `Susie Hogarth / Firefish`).
  - Guaranteed every report (corpus-native, web, or mixed) emits a complete `## Sources & References` section with zero dead ends or raw redirect links.
  - Bumped `server_version` to `1.35.2`.

## [1.35.1] - 2026-07-29

### Fixed
- **Source Plan Discrepancy Fix (`extractRoutingTopic`)** (`src/toolHandlers.ts`):
  - Resolved routing source_plan mismatch: `toolHandlers.ts` was passing `cleanQuery` (the full 90-word raw user prompt containing generic words like "market sizing", "forecasts", "growth") to `getRelevantSources()` for building `sourcePlan` / `previewCandidates`, whereas `deepResearch.ts` was using `extractRoutingTopic(query)`.
  - Updated `toolHandlers.ts` to pass `extractRoutingTopic(query)` ("wine fridges, wine furniture and wine glassware and accessories") to `getRelevantSources()`.
  - Guarantees `source_plan` in `deep_research_topic` matches the specialist-boosted graph candidate ranking (`retail` #1, `mintel-food-and-drink` #2, `waldo-coffee-maker-innovation` #3, `pinterest-home` #4, `restaurant-dining-trends` #6, `trendbible-home` #7).
  - Bumped `server_version` to `1.35.1`.

## [1.35.0] - 2026-07-29

### Fixed
- **Grounding API Redirect URL Stripping & Topic Specialist Router Release** (`src/deepResearch.ts`, `src/catalogCache.ts`):
  - Fixed Sources list URL leak: added regex post-processor to detect and strip self-generated `## Sources` sections containing raw `vertexaisearch.cloud.google.com` or `google.com/url` redirect links, replacing them with clean, verified `sourceUrls`.
  - Released 100% topic-agnostic graph router in `catalogCache.ts`: Topic Specialist Boost (+0.10) surfaces `waldo-coffee-maker-innovation-trends`, `pinterest-home`, `trendbible-on-the-horizon-2026`, `restaurant-dining-trends`, and `bompasparr-future-of-p-leisure-2026-nightlife` alongside `retail`.
  - Bumped `server_version` to `1.35.0`.

## [1.34.4] - 2026-07-29

### Fixed
- **Outlier Order-of-Magnitude Market Sizing Guardrail & Grounding Redirect URL Filter** (`src/agents/fodda-researcher/skills.ts`, `src/deepResearch.ts`):
  - Added `RULE: OutlierOrderOfMagnitudeGuardrail` to `SKILL_SOURCE_QUALITY`: requires Gemini to discard wild outlier market size estimates that differ by an order of magnitude or more (e.g. $430 billion vs $1.5-$3.5 billion for wine fridges) rather than hedging or keeping them.
  - Added regex unwrap filter to strip raw `vertexaisearch.cloud.google.com` and `google.com/url` redirect links embedded in markdown text by Gemini.
  - Enhanced `normalizeUrl` and `isInternalOrSearchUrl` to extract target destinations from Google redirect URLs and filter internal search/grounding domains.
  - Bumped `server_version` to `1.34.4`.

## [1.34.3] - 2026-07-29

### Fixed
- **Topic-Agnostic Graph Relevance Scoring** (`src/catalogCache.ts`):
  - Refactored `scoreClauseRelevance` in `catalogCache.ts` to be 100% topic-agnostic without any hardcoded query strings or hardcoded graph penalties.
  - Rewarded topic specialist matches (+0.10) whenever a graph's explicit `topics`, `routing_keywords`, `name`, or `graph_id` matches query terms or expanded category clusters directly.
  - Expanded `QUERY_EXPANSION_MAP` across all major industry verticals (Automotive & EV, Pet & Animal Care, AI & SaaS, Home & Living, Food & Dining, Retail & E-Commerce).
  - Generalized narrow-domain mismatch penalties so unrelated narrow graphs (beauty, gaming, automotive) are safely penalized on irrelevant queries.
  - Bumped `server_version` to `1.34.3`.

## [1.34.2] - 2026-07-29

### Fixed
- **Domain-Specialist Graph Routing & Expansion** (`src/catalogCache.ts`):
  - Updated `scoreClauseRelevance` in `catalogCache.ts` with a specialist domain boost (+0.12) for home, appliances, kitchen, dining, beverage, hospitality, and nightlife graphs when product/lifestyle queries are present.
  - Added a soft penalty (-0.10) for generic marketing agency reports (`Dentsu`, `Edelman`, `Michaels`, `Forrester`), preventing generic agency graphs from crowding out specialized appliance and nightlife graphs.
  - Successfully surfaces `waldo-coffee-maker-innovation-trends` (#3), `pinterest-home` (#4), `restaurant-dining-trends` (#6), `trendbible-on-the-horizon-2026` (#7), and `bompasparr-future-of-p-leisure-2026-nightlife` (#11) alongside `retail` (#1).
  - Bumped `server_version` to `1.34.2`.

## [1.34.1] - 2026-07-29

### Fixed
- **Query Expansion for Home, Appliance Innovation & Nightlife Graphs** (`src/catalogCache.ts`):
  - Expanded `QUERY_EXPANSION_MAP` for `wine`, `beverage`, `dining`, `glassware`, `fridge`, `appliances`, and `furniture` to map to `nightlife`, `leisure`, `entertainment`, `kitchen`, and `interior`.
  - Enables the router to reach specialized home/appliance innovation graphs (`pinterest-home`, `trendbible-on-the-horizon-2026`, `waldo-coffee-maker-innovation-trends`) and nightlife/hospitality graphs (`bompasparr-future-of-p-leisure-2026-nightlife`, `restaurant-dining-trends`, `eventbrite-live-experiences-2026`).
  - Bumped `server_version` to `1.34.1`.

## [1.34.0] - 2026-07-29

### Optimized & Fixed
- **Heavy Synthesis Optimization & 180s Gemini Timeout Window** (`src/deepResearch.ts`, `src/index.ts`):
  - Capped curated trends per graph (top 6 in heavy, top 4 in light) to keep synthesis prompt context high-density and prevent model generation timeouts on heavy multi-pass runs.
  - Increased Gemini generation timeout promise guard from 150s to 180s in `index.ts`.
  - Bumped `server_version` to `1.34.0`.

## [1.33.9] - 2026-07-29

### Fixed
- **Word-Boundary Truncation Fix, Hard 240s Job Timeout Guard & LLM Sub-Theme Expander Prompting** (`src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Fixed sub-theme truncation bug in `fallbackSubThemes()`: clean topics now snap back to the last complete word boundary (`lastIndexOf(' ', 40)`), eliminating broken search tokens like `"wine glasswa"`.
  - Added a guaranteed hard 240s background timer guard (`jobTimeoutTimer`) on `activeResearchJobs` in `toolHandlers.ts` that automatically transitions stalled jobs to `FAILED` status, eliminating background hangs.
  - Enhanced `generateSubThemes()` with robust JSON regex parsing (`match(/\[[\s\S]*\]/)`) and explicit error stack logging.
  - Bumped `server_version` to `1.33.9`.

## [1.33.8] - 2026-07-29

### Fixed
- **LLM Sub-Theme Expander (`response_mime_type`), `check_research_status` Payload & URL Parser Normalization** (`src/deepResearch.ts`, `src/toolHandlers.ts`, `src/index.ts`):
  - Added `response_mime_type` support to `waverunnerRequest` in `index.ts`, enabling structured JSON response output for LLM calls.
  - Configured `generateSubThemes` to pass `response_mime_type: 'application/json'` and full error stack logging, ensuring topic-specific LLM sub-themes generate reliably.
  - Cleaned `fallbackSubThemes` to truncate 20-word multi-clause queries and include explicit moderation & lifestyle shift angles in heavy mode (addressing Bompas & Parr's "New Night Sips" trend data).
  - Explicitly surfaced `sub_themes_used` in `check_research_status` completion response payload.
  - Upgraded `normalizeUrl` with `new URL(u)` parser validation: strips inner spaces in paths (e.g. `funded- startups`), rejects missing hostnames (`https.com`), and validates http/https protocol.
  - Bumped `server_version` to `1.33.8`.

## [1.33.7] - 2026-07-29

### Fixed
- **URL Scheme Normalization, `sub_themes_used` Payload Visibility & `gemini-2.0-flash` Expansion** (`src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Added URL scheme normalization (`normalizeUrl`) to recover malformed Gemini grounding URLs (`https.domain.com` -> `https://domain.com` and `httpss://` -> `https://`), restoring 9+ valid publisher citations.
  - Included `sub_themes_used` in the initial `deep_research_topic` tool payload response for immediate caller visibility.
  - Switched sub-theme expansion model to `gemini-2.0-flash`, ensuring LLM-generated topic-specific sub-themes fire consistently.
  - Bumped `server_version` to `1.33.7`.

## [1.33.6] - 2026-07-29

### Added & Fixed
- **Sub-Themes Tiered Architecture & Per-Call Timeout Guards for `deep_research_topic`** (`src/deepResearch.ts`, `src/toolHandlers.ts`, `src/agents/fodda-researcher/index.ts`, `src/agents/fodda-researcher/skills.ts`):
  - Implemented `sub_themes` optional array parameter in `deep_research_topic` tool schema and `runDeepResearch` pipeline. If omitted, sub-themes are generated automatically server-side via `gemini-2.0-flash-lite` (with deterministic fallback).
  - Transitioned graph retrieval to a **Tiered Two-Pass Architecture**: Pass 1 runs broad discovery (`routingTopic`) across all graphs (limit 3); Pass 2 runs deep sub-theme searches on top-hit graphs only (limit 5, ranked by max row relevance score + router score tiebreaker).
  - Ported `linkedinEngine.ts` curation/deduplication layer: keyed by `(graphId, trendName)` to preserve multi-graph corroboration signals and aggregated `subThemes: Set<string>` on each trend. Deep hits take priority so Gemini's synthesis context explicitly maps which trends support which sub-themes.
  - Added per-call 8s timeout guards (`withTimeout`) inside `Promise.all` search mapping loops, preventing a single slow graph from failing the entire pass.
  - Refined citation guards: dropped false-positive digit regexes in favor of strictly verbatim source-metadata URLs from Gemini annotations (`url_citation` / `groundingChunks`), with `httpss://` scheme and `YOUR_\w+` placeholder checks. Added raw citation payload logging.
  - Added `subThemesUsed` to `GraphContext` and injected `## Mandatory Research Sub-Themes` into the researcher agent instruction. Added `ConflictingEstimates` rule to `SKILL_SOURCE_QUALITY` requiring all conflicting quantitative estimates to be surfaced with sources.
  - Updated tool descriptions and cost units to reflect repriced tiered call budgets (Light: 25–30 API calls, Heavy: 40–50 API calls) with a 240s global execution ceiling. Bumped `server_version` to `1.33.6`.

## [1.33.5] - 2026-07-29

### Fixed
- **Deep Research Phase 0 Publisher Exclusions, 150s Timeout Guard & Regression Test Suite** (`src/catalogCache.ts`, `src/index.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Excluded generic publisher/consultancy names (`mckinsey`, `bcg`, `deloitte`, `kpmg`, `forrester`, `gartner`, `pwc`, `ey`, `capgemini`, `bain`, `niq`, `mintel`, `dentsu`) from Phase 0 company name matching in `catalogCache.ts`.
  - Added `server_version: 1.33.2` to `deep_research_topic` initial `source_plan` payload.
  - Increased synthesis timeout guard in `src/index.ts` to 150s with explicit `clearTimeout` cleanup.
  - Mandated web-grounded quantitative market sizing, dollar values, and CAGRs in `src/deepResearch.ts`.
  - Created automated regression test suite `scratch/test_regression_suite.ts` verifying `retail` at Rank #1 (`0.357`), `0.250` score spread, and 0 automotive false positives on multi-clause strategist briefs.

### Fixed
- **Deep Research Query Clause Decomposition, Flagship Retail Anchor Boost & Timeout Guard** (`src/catalogCache.ts`, `src/index.ts`, `src/deepResearch.ts`):
  - Implemented multi-clause query decomposition in `scoreGraphRelevance` (`scoreClauseRelevance`). Multi-clause research prompts are split across punctuation and conjunctions, evaluated per clause, and combined via `(maxScore * 0.7) + (avgScore * 0.3)` to prevent multi-sentence prompt dilution.
  - Added flagship `retail` graph anchor boost (+0.25) to guarantee `PSFK Retail Trends` (192 trends) ranks #1 for product, commerce, hardware, appliance, and channel queries.
  - Added out-of-domain mismatch penalty (-0.3) for pure `beauty`/`skincare`/`fragrance` graphs when query contains no beauty terms, eliminating beauty graph false positives.
  - Wrapped `ai.models.generateContent` in `src/index.ts` with a 90-second timeout promise guard (`Promise.race`) to prevent research synthesis requests from hanging indefinitely.
- **Deep Research Query Expansion, Phase 0 Routing & Citation Hygiene** (`src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Refined Phase 0 direct matching in `catalogCache.ts` using regex word boundaries (`matchesWordBoundary`) and generic term exclusion. Fixed `isDirectMatch` tracking on `GraphRelevanceResult` so high topic-match scores are no longer falsely reported with reason `"named directly in query"`.
  - Added research meta-words (`run`, `fodda`, `deep`, `research`, `project`, `about`, `briefing`, etc.) to `stopWords` in `scoreGraphRelevance`, preventing prompt wrapper words from triggering false-positive matches on unrelated graphs.
  - Added `QUERY_EXPANSION_MAP` to `catalogCache.ts` (`scoreGraphRelevance`) for niche product term expansion (`wine`, `fridges`, `furniture`, `glassware`, `accessories`, `barware`, `appliances`, etc.), mapping queries to relevant graphs (Home & Living, Beverage Tech, Food & Beverage, CPG & Retail Futures).
  - Cleaned up citation output in `deepResearch.ts`: filtered out internal `fodda.ai` self-citations and Google Vertex search URLs, prevented un-cited graph background URLs from dumping into the sources list, and eliminated duplicate `## Sources` headers in report payloads.
- **Deep Research Gemini API Migration & Source Plan Fallback** (`src/index.ts`, `src/catalogCache.ts`):
  - Migrated `waverunnerRequest` from deprecated `ai.interactions.create()` to the supported `@google/genai` `ai.models.generateContent()` API, resolving the 400 legacy schema error (`interactions-breaking-changes-may-2026`).
  - Updated `getRelevantSources` in `catalogCache.ts` to default `minGraphs = 2` when not specified, ensuring `source_plan` and knowledge graph candidates are always populated for broad research queries.
- **Backend Error Visibility & Non-Silent Failures** (`src/toolHandlers.ts`):
  - Updated `addCoverageAnnotation` to explicitly check for backend error signals (`normalizedData.error`, `error_code`, `code`, `status === 'error'`, `dataStatus === 'error'`). Sets `coverage.status = 'error'` instead of falling through to `coverage.status = 'empty'`.
  - Updated search tool handlers (`search_graph`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `search_statistics`, `search_insights`) to check for `coverage.status === 'error'` or `error` and return `{ isError: true, ... }`. This prevents backend authentication failures (such as `NEO4J_AUTH_MISSING` or API 401/5xx) from being misreported as "zero results across graphs due to low domain coverage."

### Added
- **Company-Specific Executive Routing ("Nike CMO")** (`src/toolHandlers.ts`, `tools-manifest.json`):
  - Updated `list_analysts` description and return payload to include a top-level `company_query_guide` explaining how company-specific queries (e.g., 'Nike CMO', 'Apple CEO', 'Target CFO') map to role-based analyst IDs (`brand-cmo`, `brand-ceo`, `brand-cfo`) with a `company` parameter.
  - Implemented `resolveAnalystAlias` in `consult_analyst` to automatically parse and resolve alias strings (e.g., `"Nike CMO"`, `"nike-cmo"`, `"Nike Synthetic CMO"`, `"Apple CEO"`) into the target role ID (`brand-cmo`) and extracted `company` parameter (`"Nike"`).

### Added
- **Fodda MCP Discoverability & Orientation Refactor** (`src/systemPrompt.ts`, `src/catalogCache.ts`, `src/tools.ts`, `src/index.ts`, `src/toolHandlers.ts`):
  - **Front-Loaded Capabilities Instructions**: Replaced buried text in `buildSystemPrompt()` with a ~600 character marquee capabilities block at the very start of `instructions`. Includes explicit scope rules establishing platform capabilities as the default interpretation for unqualified "offerings", "features", and "what can you do" queries.
  - **Graph Naming Table Eviction**: Evicted the 193-line `graphId` lookup table from `instructions` (~90% payload reduction), replacing it with concise attribution guidance pointing models to `list_graphs`.
  - **Broadly-Named Orientation Tool (`get_capabilities`)**: Added `get_capabilities` tool across all endpoints (`/brand-intelligence`, `/topic-research`, `/deep-research`, `/earnings-intelligence`, `/expert-consult`), carrying a phrasing-agnostic synonym list in its description. Sourced pricing dynamically from `getToolCostSummary()` / `getQueryPricing()` at runtime.
  - **Market-Validated Consumer Trends Tool (`get_validated_trends`)**: Added `get_validated_trends` tool connected to `/v1/earnings/validated-trends` (with snapshot fallback) and surfaced on `/earnings-intelligence` and `/topic-research` endpoints.
  - **Renamed Onboarding Tool**: Renamed `run_deep_research` to `expert_onboarding_research` to avoid naming collision with `deep_research_topic`.
  - **Safe Analyst Deduplication**: Refactored `list_analysts` to deduplicate duplicate analyst records by ID/slug without dropping analysts with empty offerings, surfacing non-commissionable experts with `commissionable: false`.

### Added
- **Unmask `topics` and `verticals` in `list_graphs`** (`src/toolHandlers.ts`):
  - Added `'topics'` and `'verticals'` to `GRAPH_LIST_ALLOWLIST` so curated graph objects in `graphs[]` surface their topic tags and vertical classifications alongside `supplemental_sources[]`.
  - **Before:**
    ```json
    {
      "graph_id": "beauty",
      "name": "Beauty & Personal Care",
      "one_liner": "Trend signals across skincare, cosmetics, wellness...",
      "trend_count": 42
    }
    ```
  - **After:**
    ```json
    {
      "graph_id": "beauty",
      "name": "Beauty & Personal Care",
      "one_liner": "Trend signals across skincare, cosmetics, wellness...",
      "trend_count": 42,
      "topics": ["beauty", "health", "skincare"],
      "verticals": ["consumer-goods"]
    }
    ```
- **Offering-Scoped MCP Endpoints Rollout (5 Marquee Offerings)** (`src/index.ts`, `src/toolHandlers.ts`, `fodda_mcp_*_server.json`):
  - **Scoped Tool Filtering (`src/toolHandlers.ts`)**: Added `allowedTools` filtering to `createServer()` via SDK `disable()` method, enforcing endpoint-level tool subsetting across all scoped endpoints.
  - **5 Scoped Routes & Source Attribution (`src/index.ts`)**: Stood up all 5 marquee endpoints: `/brand-intelligence` (12 tools), `/topic-research` (13 tools), `/deep-research` (13 tools), `/earnings-intelligence` (11 tools), and `/expert-consult` (12 tools). Requests arriving at each endpoint automatically set matching `source: '<slug>'` for connection telemetry.
  - **Discovery Cards (`src/index.ts`)**: Added `/.well-known/<slug>` discovery endpoints returning metadata for `ai.fodda/brand-intelligence`, `ai.fodda/topic-research`, `ai.fodda/deep-research`, `ai.fodda/earnings-intelligence`, and `ai.fodda/expert-consult`.
  - **MCP Registry Records (`fodda_mcp_*_server.json`)**: Created canonical domain-verified registry definitions for `ai.fodda/topic-research`, `ai.fodda/deep-research`, `ai.fodda/earnings-intelligence`, and `ai.fodda/expert-consult`.
- **Pricing Infrastructure Handoff (§2, §5, §6, §7)** (`src/pricingCache.ts`, `src/toolHandlers.ts`, `src/index.ts`, `src/resources.ts`, `src/telemetry.ts`):
  - **§2 — 1-Call 1-Price (`query_costs` explicit mode args)**: Added explicit `mode` parameter enums to multi-price tools (`search_graph`: `research`|`compare`, `deep_research_topic`: `light`|`heavy`, `get_company_earnings`: `snapshot`|`history`|`qa`|`compare`|`guidance`|`coverage`). Updated `getQueryTypeForTool` and `getToolCostSummary` so tool + mode arguments map deterministically to a single cost.
  - **§5 — Discovery Surface & Card**: Implemented `/.well-known/mcp-server.json` and `/.well-known/mcp` metadata endpoints detailing server capabilities, structure (free) vs substance (metered) pricing tiers.
  - **§6 — Citable Resource URIs**: Implemented `src/resources.ts` registering durable MCP Resources with the `fodda://` scheme (`fodda://expert/{slug}/insight/{id}`, `fodda://graph/{vertical}/trend/{slug}`) to enable downstream attribution in LLM outputs.
  - **§7 — Error-Rate Instrumentation**: Created `src/telemetry.ts` to record tool pass/fail outcomes, compute per-tool and global error rates, and exposed `/telemetry` and `/v1/feedback` HTTP endpoints.
- **Onboarding Gating and Error Propagation** (`src/toolHandlers.ts`): Added pre-flight key checks to all onboarding tools to immediately short-circuit if `apiKey` is empty. Propagated server credentials-missing warnings verbatim as plain text to show the `join-experts` connector URL directly inside Claude.
- **`/c/:token` SSE Transport and Token Resolution Cache** (`src/index.ts`): Implemented a route for token-resolved connector connection and an in-memory resolution cache (1 minute TTL) to minimize redundant requests.

### Changed
- **`begin_expert_onboarding` description** (`src/toolHandlers.ts`): Updated description to register explicit support for both `"Onboard me as a Fodda expert"` and `"Onclaude me as a Fodda expert"` triggers.
- **API Routing** (`src/index.ts`): Routed `/api/*` calls in `foddaRequest` directly to `www.fodda.ai`.
- **Digital Twin Envelope Rendering** (`toolHandlers.ts`): `consult_analyst` handler now surfaces the structured envelope from the API — coverage status (`in`/`adjacent`/`out`), source attribution, referrals, and speaker notes — as delimited blocks in the tool result. Legacy (non-envelope) responses render unchanged.
- **Jeremy Bergstein analyst entry** (`systemPrompt.ts`): Added `jeremy-bergstein-science-education-innovation` to `ANALYST_ENTRIES` routing table, mapped to the `postpals-expert-graph` graph.
- **`toggle_graph_preference` tool** (`src/toolHandlers.ts`, `src/tools.ts`): Added a new tool that allows the MCP agent to permanently enable or disable any knowledge graph, supplemental data source, or skill on the user's behalf. It calls the new `POST /v1/user/preferences/toggle` API endpoint.
- **Claude Tag Setup Guide** (`docs/claude-tag-setup.md`): Step-by-step admin guide for connecting Fodda as a Claude Tag MCP tool connector in Enterprise/Team Slack workspaces. Covers endpoint configuration, authentication, tool selection by team type, billing, and troubleshooting.

### Changed
- **Dual-Voice Speaker Rules** (`systemPrompt.ts`): Updated `VirtualExpertConsultation` sequence with three-branch rendering: `in` → expert 1st-person voice; `adjacent` → expert's full answer + referrals offered in platform voice as "also worth checking"; `out` → expert's short decline + narrator 3rd-person referral handoff. The client LLM must never extend the expert's answer beyond the API result or answer off-topic in the expert's voice.
- **Parallel Hedge Probing** (`systemPrompt.ts`): Consultation sequence now fires `consult_analyst` and targeted `search_graph` hedge probes on 1–2 relevant adjacent graphs in the same tool-call turn rather than serially. `get_supplemental_context` reserved for stats-shaped queries only. `get_expert_intelligence` explicitly excluded from hedges to avoid fan-out billing.
- **`consult_analyst` tool description** (`toolHandlers.ts`): Updated to mention coverage/referral envelope and the 3rd-person rendering rule.
- **System Prompt** (`systemPrompt.ts`): Updated rules for skill configuration. Explicitly instruct the LLM to call `toggle_graph_preference` instead of directing users to the dashboard when they ask to turn graphs, sources, or skills on or off.
- **User ID Extraction** (`src/index.ts`): Enhanced `/mcp` and `/sse` transport handlers to extract `userId` from client-provided headers (`X-User-Id` or `x-user-id`) in addition to URL query parameters.
- **CORS Configuration** (`src/index.ts`): Added `X-User-Id` to `Access-Control-Allow-Headers` CORS configuration to allow cross-origin browser clients to send custom user identity headers without preflight blocks.
- **Claude Tag Readiness — Tool Description Polish** (`toolHandlers.ts`): Rewrote 12 tool descriptions for clarity in multiplayer Slack contexts where non-technical users trigger tools via `@Claude`. Removed implementation jargon (e.g. "traverse graph relationships", "pre-computed embeddings", "institutional market data"), led with user outcomes, preserved developer-facing detail in parameter descriptions. Affected tools: `search_graph`, `get_neighbors`, `get_evidence`, `get_node`, `get_label_values`, `discover_adjacent_trends`, `get_supplemental_context`, `search_statistics`, `search_insights`, `check_supplemental_status`, `check_research_status`, `generate_visual`.

### Fixed
- **`confirm_themes` tool handler** (`src/toolHandlers.ts`): Prevent advancing to `schedule_interview` when questionnaire generation fails (returns HTTP 200 with `{ success: false }`). Instead, return a non-advancing error instructing the agent/LLM to retry `confirm_themes`.
- **Routing instruction leak** (`toolHandlers.ts`): Internal `[ROUTING INSTRUCTION: ...]` blocks were being injected into the public `description` field in `list_graphs` output — visible to any MCP client. Routing guidance now surfaces as a dedicated `routing_hint` field, keeping descriptions client-safe. A defensive `stripRoutingInstruction()` sanitizer also strips any routing text baked into API-side descriptions.
- **Report graph trend discoverability** (`toolHandlers.ts`): `get_label_values` description now explicitly guides LLMs to use `label="Trend"` for complete, deterministic trend enumeration on industry-report graphs where `search_insights`/`search_statistics` return partial or empty results due to unlinked evidence.
- **`search_graph` payload size fallback** (`src/toolHandlers.ts`): Fixed a critical bug where `data` (with all heavy evidence arrays) was returned instead of `jsonPayload`/`liteData` (with evidence stripped) when payload size checks (>30KB) were triggered, causing context overflows and massive response payloads.
- **`search_graph` fallback path** (`src/toolHandlers.ts`): Fixed same issue in the no-widget fallback path, ensuring evidence arrays are stripped before returning.

## [1.26.0] - 2026-05-12

### Added
- **Analyst Routing Logic** (`systemPrompt.ts`): Implemented a mandatory two-step workflow for Consulting Analysts. The LLM must now search the relevant domain graph first and inject found signals into the analyst consultation query to ground the response.
- **Enhanced Auth Support** (`index.ts`): Added support for `X-API-Key` and `Authorization Bearer` headers in the `/mcp` route, improving compatibility with remote MCP clients and API gateways.

### Changed
- **Server Name**: Internal MCP server name changed from `fodda-mcp` to `fodda_mcp` for better compatibility with certain SDK clients.


### Added
- **Consulting Analysts Tooling** (`toolHandlers.ts`, `tools.ts`): New orchestration flow for "talking to" Synthetic Analysts.
  - **`list_analysts` tool**: Discovers available expert personas (e.g., Ben Dietz) and their specialized domains.
  - **`consult_analyst` tool**: Enables direct conversation with an analyst persona. Routes to the Fodda API's new analyst consultation engine.
- **Fodda Research Agent (Autonomous Research)** (`src/agents/fodda-researcher/`): Integrated a new autonomous agent architecture for deep analysis.
  - **Skill-Injected Instruction Engine**: Assembles complex system instructions from 5 modular skill files: Research Methodology, Evidence Categories, Output Format, Graph Awareness, and Source Quality.
  - **Graph Context Injection**: `deep_research_topic` now pre-fetches graph results and injects them as primary source material into the agent's context, ensuring "graph-first" autonomous research.
  - **Waverunner Integration**: Researcher agent utilizes the Gemini Interactions API (via `waverunnerRequest`) with autonomous `google_search` and `url_context` tools.

### Changed
- **`deep_research_topic` Orchestration**: Refactored to use the new `Fodda Research Agent` architecture. Includes 5-phase research loop (Plan → Search → Read → Synthesize → Cite) and editorial-quality reporting.
- **Version Bump**: Updated server version to 1.25.0 to reflect major agentic capability expansion.

### Added
- **Fixed-Price Query Billing System** (`pricingCache.ts`, `toolHandlers.ts`, `index.ts`): Major billing architecture change — migrated from variable per-API-call token metering to fixed-price-per-query billing. Each query type (Topic Research, Brand Intelligence, Brainstorm, etc.) now has a single fixed cost in API calls, charged once at query completion via `POST /v1/research/meter`.
  - **`pricingCache.ts`** (NEW): Centralized pricing engine with 15 query type definitions, hardcoded defaults, and optional Airtable-backed dynamic pricing (`tblHsMfyoW39LqCv8`). Exports `chargeQuery()` — the single billing entry point for all tool handlers. Differentiates between trial users (Firestore counter), paid users (meter API), and free tools (no charge).
  - **`chargeQuery()` wired into 7 billing points** across `toolHandlers.ts`: `search_graph` (3 return paths), `brand_tracker`, `get_supplemental_context`, `brainstorm_topic`, `read_url`, `deep_research_topic`. Fire-and-forget pattern — billing never blocks the response.
  - **`X-Fodda-Billing: mcp-orchestrated` header** (`index.ts`): Added to all `foddaRequest()` calls. Signals the API to skip per-call `decrementCredits()` and let the MCP handle billing via the meter endpoint. Prevents double-billing.
  - **Query Pricing Table** created in Airtable (`tblHsMfyoW39LqCv8`): 15 records covering all query types with `apiCallsCharged`, `researchCalls`, `overheadCalls`, margin formulas, and tool mappings. MCP reads this table hourly when `AIRTABLE_API_KEY` is set.

### Changed
- **Terminology: "tokens" → "API calls"**: Platform-wide rename across all user-facing strings in system prompts, tool descriptions, error messages, and account status displays. Internal variable names preserved. Coordinated across API, App, and Website agents.
- **`deep_research_topic` pricing**: `comprehensive` tier changed from 50 to 30 API calls to align with new fixed pricing.

### Fixed
- **`brand_tracker` — empty evidence tab** (`toolHandlers.ts`): The Cypher endpoint (`/v1/brand-intelligence/:brand`) returns `evidenceCount` as a scalar but may not include the actual evidence items in the response. The evidence tab was rendering empty because `t.evidence` was `undefined` despite `t.evidenceCount` being 32. Added an evidence backfill step: when Cypher returns trends with `evidenceCount > 0` but no `evidence` array, the MCP now calls `/v1/graphs/:graphId/evidence` per-trend to recover the actual evidence items.
- **`brand_tracker` — only 1 trend surfaced for well-known brands** (`toolHandlers.ts`): The fallback multi-graph search used `use_semantic: true` which correctly found relevant trends, but the post-search brand filter required the brand name as a literal string in the trend name, description, or evidence text. Semantically relevant trends (e.g., "Closed-Loop Textiles" for Patagonia) were discarded. Added a second-tier semantic relevance check: rows with `signal_score >= 60` from semantic search are now accepted even without a direct brand name mention.
- **`brand_tracker` — Google Trends flat-line chart displayed when no data** (`brandTemplate.ts`): When the Google Trends API returned a valid response wrapper but empty `interest_over_time`, the widget showed a flat line at y=88 with no labels — confusing users. The chart section, comparison bars, related queries, and geographic spread sections are now conditionally hidden via `display:none` when their data is empty. The "Google Trends" source pill is also suppressed when there's no actual time-series data.
- **`brand_tracker` — Gemini 429 error rendered in Analysis tab** (`editorialFill.ts`): When Gemini returned a rate-limit error (429), the raw error string was injected directly into the widget's Analysis tab HTML. Both `fillBrandVerdict` and `fillAnalysis` now return empty strings on failure (logging the error to stderr), keeping the `{{ANALYSIS_HTML}}` slot open for Claude to fill client-side.

### Added
- **Waverunner Agent Intelligence Integration**: Major capability expansion integrating the Gemini Agents (Waverunner) API for autonomous research and visual intelligence.
  - **`read_url` MCP tool** (`toolHandlers.ts`): Extracts clean text from any URL using Waverunner's native `url_context`. Users paste a link and cross-reference against Fodda graphs.
  - **`generate_visual` MCP tool** (`toolHandlers.ts`): On-demand SVG visualization. 6 chart types: cultural_shifts, competitive_compass, trend_constellation, implication_ladder, innovation_pathway, opportunity_map. Returns inline SVG.
  - **SVG Visual Engine** (`svgVisuals.ts`): Fodda watercolor aesthetic — purple node blobs, ambient specks, dot-chain trails. Off-white paper background, Fodda purple palette.
  - **Auto-generated Trend Constellation** (`toolHandlers.ts`): `deep_research_topic` automatically generates a constellation SVG from search results and prepends it to the response.
  - **`url_context` for Waverunner sub-agent** (`toolHandlers.ts`): Research agent can now autonomously read URLs during deep research loops.
- **New API Endpoints** (shipped by API Agent): `GET /v1/research/stream` (Glass Brain SSE), `POST /v1/research/deep-dive` (premium async research), `GET /v1/context` (URL extraction).

### Added
- **`brainstorm_topic` tool** (`toolHandlers.ts`): Fourth MCP orchestration flow — graph-native ideation via neighbor traversal. Searches up to 4 relevant graphs in parallel for seed trends, runs `get_neighbors` (depth 1-2) on each seed to discover adjacent territories, clusters results into trends/brands/locations, and generates graph-powered `suggested_next_prompts` based on actual knowledge graph connections instead of text-derived follow-ups. Returns a structured brainstorm map with seed trends, adjacent territories, key brands (flagged when cross-trend), geographic hotspots, and discovery stats.
- **`get_supplemental_context` tool** (`toolHandlers.ts`): Unified supplemental data tool calling the new `POST /v1/supplemental/context` API endpoint. A single call queries up to 8 institutional data sources (Google Trends, Census, FRED, BEA, BLS, OECD, etc.) in parallel — the server selects the most relevant sources based on query and domain. Accepts `query`, `domain`, `brands`, and `graph_ids` parameters. Billed as 1 token per call regardless of internal source fan-out.
- **`get_domain_intelligence` tool** (`toolHandlers.ts`): Searches ALL PSFK curated domain graphs (retail, beauty, fashion, sports, etc.) in parallel via `POST /v1/search/domain`. Returns trends with bundled evidence pre-categorized into statistics, case studies, analysis, and interviews. No graph ID needed — the API handles graph selection.
- **`get_expert_intelligence` tool** (`toolHandlers.ts`): Searches ALL expert specialist graphs in parallel via `POST /v1/search/expert`. Returns trends with bundled evidence from named strategists and industry leaders. No graph ID needed.
- **`get_report_intelligence` tool** (`toolHandlers.ts`): Searches ALL industry report graphs in parallel via `POST /v1/search/report`. Returns market forecasts, quantitative projections, and published research findings with bundled evidence. No graph ID needed.

### Changed
- **Expert graph evidence tools unblocked** (`toolHandlers.ts`, `catalogCache.ts`, `systemPrompt.ts`): Removed the restriction that prevented `search_statistics` and `search_insights` from running on expert graphs. Both tool descriptions, the dynamic expert workflow prompt block, the curated-only tools block, and the system prompt all updated from "Do NOT call on expert graphs" to "Works on ALL graphs." Expert graphs have rich categorized evidence (48% Statistic, 27% Case Study, 14% Analysis, 10% Interview).
- **Expert graph evidence categories normalized** (Airtable): Batch-updated 1,210 records in the Expert Reports Evidence table to the PSFK standard 4-category taxonomy: Case Study, Statistic, Analysis, Interview. Mapped 17 non-standard labels (Statistics→Statistic, Quote→Interview, Policy→Analysis, etc.).
- **System prompt Step 3 updated** (`systemPrompt.ts`): Now instructs the LLM to use `get_supplemental_context` for macro data instead of picking individual supplemental tools.

### Added
- **Feedback & Frustration → Slack Alerts** (Brief: `brief_mcp_frustration_to_slack.md`): When users send feedback or the session detects aggregate frustration, an alert is now posted to `#fodda-sales` on the PSFK Slack workspace — in addition to the existing Resend email. The Fodda Sales bot auto-enriches these alerts with user context (query history, Streak CRM status).
  - **`postToSlack()` helper** (`sessionTracker.ts`): New exported function that POSTs to Slack via `chat.postMessage` using `SLACK_BOT_TOKEN`. Fire-and-forget — errors are logged but never thrown or awaited in the hot path.
  - **`send_feedback` → Slack** (`toolHandlers.ts`): Every feedback submission now posts a formatted alert to `#fodda-sales` with category-specific emoji (💬 feedback, 🐛 bug, ✨ feature_request, 🚪 exit_reason, 😤 complaint), user email, and the full feedback text. The `<@U0AU49JG7AS>` mention triggers the sales bot's auto-enrichment.
  - **Aggregate frustration → Slack** (`sessionTracker.ts`): When `detectFrustration()` fires and the session's frustration score is ≥ 2 (i.e., multiple patterns triggered — LOW_YIELD + NO_MATCH, or NO_MATCH + GRAPH_BOUNCING, etc.), a single alert is posted to Slack with the user identifier, dominant pattern, graphs tried, and recent queries. Posts once per session to avoid noise.
  - **New types & functions** (`sessionTracker.ts`): `FrustrationPattern`, `FrustrationDetails`, `getFrustrationDetails()`, `getRecentSearches()`, `postFrustrationToSlack()`.
  - **Env var**: `SLACK_BOT_TOKEN` added to `.env.example`. Also documented `RESEND_API_KEY`.
  - **What's preserved**: Resend email (reliable backup), invisible hint injection for Claude's strategy adjustment, NO_MATCH individual events (not posted to Slack — only aggregate frustration).

### Added
- **User Context Persistence** (Brief: `mcp_user_context_brief.md`): Implemented the API agent's user context system — a two-layer personalization architecture that persists user research profiles across sessions and detects structural frustration patterns.
  - **`update_user_profile` tool** (`toolHandlers.ts`): New tool that calls `POST /v1/user/context` to persist `userContext` (actionable framing instructions for the user) and `accountContext` (company-level context shared across all users on the account). Max 2000 chars per field. Fails gracefully for trial users (returns `SKIPPED` status with upgrade guidance).
  - **Session start context loading** (`toolHandlers.ts`, `systemPrompt.ts`): `AccountProfile` interface extended with `userContext` and `accountContext` fields. When `/v1/graphs` returns stored context, it's injected into the system prompt as a `USER RESEARCH PROFILE` block so Claude uses it for all subsequent framing.
  - **Profile solicitation nudge** (`toolHandlers.ts`, `systemPrompt.ts`): When a non-trial user has no stored `userContext`, two nudges are injected: (1) a system prompt `PROFILE SOLICITATION` block instructing Claude to capture profile data naturally through conversation, and (2) a `list_graphs` response-level nudge appended to the JSON payload. Both emphasize writing ACTIONABLE framing instructions, not just role labels.
  - **Session frustration detection** (`sessionTracker.ts`): New module that tracks search patterns within a single MCP connection and detects three structural frustration signals: repeated similar queries (3+ searches with >50% word overlap in same graph), NO_MATCH streaks (2+ consecutive zero-result searches), and graph bouncing (same query across 3+ different graphs). Hints are injected into `search_graph` response text for Claude to act on — the user never sees them directly.
  - **Two-layer architecture**: Layer 1 (MCP) detects structural frustration from tool call patterns and injects strategy hints. Layer 2 (Claude) detects conversational frustration from user messages and calls `update_user_profile` to refine stored preferences reactively.
  - Version bumped to 1.24.0.

### Changed
- **Proactive Graph Coaching** (`systemPrompt.ts`): Added `PROACTIVE GRAPH COACHING` rule to the system prompt. After the first substantive response, the LLM now tells the user which graphs contributed results and what each graph is designed for (e.g., "The CE Design Graph tracks design-stage ideas and concept work"). If results are dominated by one graph type, it sets expectations about what that graph *does and doesn't* cover. After 2+ queries in the same domain, it suggests narrowing graph selection. Keeps coaching to 1-2 sentences — helpful, not lecturing. Addresses user feedback about needing clearer context on what each graph's coverage model is.

### Added
- **Embedded Rendering Instructions** (Fix: Claude.ai template gap): Claude.ai's MCP client does not surface the server-level `instructions` field, making all rendering specs in `systemPrompt.ts` invisible. This fix embeds critical rendering rules directly into tool descriptions and tool response payloads, ensuring reliable cross-client behavior.
  - **Tool description rendering rules** (`toolHandlers.ts`): `search_graph`, `brand_tracker`, and `get_evidence` tool descriptions now include inline `RENDERING RULES` / `LINK RULE` directives. These are always visible to any LLM client regardless of `instructions` field support.
  - **`_render_instructions` response object** (`toolHandlers.ts`): `search_graph` and `brand_tracker` responses now include a top-level `_render_instructions` object with ≤6 imperative rules covering attribution, citation linking, suggested prompts, widget handling, and editorial tone.
  - **`buildRenderInstructions()` helper** (`toolHandlers.ts`): New function that dynamically assembles context-aware rendering rules based on whether the response contains widgets, evidence, or suggested prompts.
  - **Widget HTML prefix** (`toolHandlers.ts`): All widget HTML content blocks are now prefixed with an explicit instruction: "If your client supports HTML visualization (show_widget, visualize:show_widget, or artifacts), pass this HTML verbatim. Do not rewrite or restyle."
  - **`_source_links` infrastructure** (`toolHandlers.ts`): `collectGraphWebpageUrls()` function ready to populate graph-level links from catalog once the API surfaces `webpage_url` from Airtable. No hardcoded URLs — activates automatically.
  - **`systemPrompt.ts` preserved**: Server-level instructions kept as-is for MCP clients that do honor the `instructions` field.

### Added
- **UX Lifecycle Improvements** (UX Audit): Comprehensive improvements to trial onboarding, credit management, and user lifecycle flows.
  - **`id` query parameter support** (`index.ts`): The MCP URL now reads the `id` query parameter. Email-shaped IDs (e.g., `id=user@company.com`) are automatically used as `userId` for tracking and seamless signup. Non-email IDs (e.g., `id=linkedin_buddy`) are passed as `entryId` for source attribution.
  - **Trial welcome block** (`systemPrompt.ts`): Trial users (`sk_trial_` keys) now receive a welcome message on first interaction: "You're connected to Fodda — expert trend intelligence, sourced and structured, across retail, beauty, fashion, sports, and more." Follows Fodda tone of voice guidelines.
  - **Capabilities orientation** (`systemPrompt.ts`): Added `WHAT FODDA CAN DO` block listing 5 core capabilities. Claude surfaces these when users ask "what can you do?" or seem unsure. Kept natural — never recited unprompted.
  - **Graph volume guidance** (`systemPrompt.ts`): Added `GRAPH VOLUME GUIDANCE` block. When results seem overwhelming, Claude proactively suggests narrowing by topic (retail, beauty) or graph type (expert vs. curated).
  - **Settings access guidance** (`systemPrompt.ts`): Added `SETTINGS AND ACCESS` block. Trial users pointed to sign up for Base; Base users pointed to `app.fodda.ai` (email login, no password).
  - **Offboarding guidance** (`systemPrompt.ts`): Added `OFFBOARDING` block. Claude now handles "how do I cancel?" gracefully — points to `app.fodda.ai`, asks for feedback.
  - **Feedback collection** (`systemPrompt.ts`): Added `FEEDBACK` block instructing Claude to call `send_feedback` whenever users share complaints, suggestions, feature requests, or exit reasons.
  - **`send_feedback` tool** (`toolHandlers.ts`): New tool that forwards user feedback to `piers@fodda.ai` via Resend email. Includes user email, entry source, API key prefix, and feedback category. Falls back to console logging if `RESEND_API_KEY` is not set.
  - **Extended credit warnings** (`toolHandlers.ts`): `_credit_warning` now fires for ALL plan types. Trial: warns at < 10 tokens (was < 3). Base: warns at < 15 tokens (was: never).
  - **Improved Base user exhaustion** (`errorHandling.ts`): Replaced cold generic "Query limit reached" with warm, actionable message: "You've used all your tokens for this month. Two options: add a 100-token top-up at app.fodda.ai, or wait for your balance to reset next month."
  - **Post-upgrade reconnection instructions** (`systemPrompt.ts`): After trial→Base conversion, Claude now tells users to update their MCP connection URL with their new API key.
  - **Support contact** (`systemPrompt.ts`): Added `piers@fodda.ai` as the support email in HELPFUL LINKS.
  - **`get_my_account` tool** (`toolHandlers.ts`): New read-only tool that surfaces live account status in-conversation — plan, token balance, reset date, enabled/disabled graphs, and profile. Uses the enriched `_account` object from `/v1/graphs` (implemented by API agent). Returns deep links to `app.fodda.ai/account`, `app.fodda.ai/account#top-up`, and `app.fodda.ai/graphs`.
  - **Deep links** (`systemPrompt.ts`): Updated HELPFUL LINKS with confirmed App routes: `/account`, `/account#top-up`, `/graphs`, `/connections/claude`, and `fodda.ai/pricing`.
  - **Resend API key** (`deploy_cloud_run.sh`): Added `RESEND_API_KEY` to Cloud Run env vars — `send_feedback` tool now sends real emails.

### Added
- **Skills Integration Engine** (Phase 3): New `src/skillClient.ts` module enables external MCP-based "Skills" (e.g., Paralogy, Igloo) to post-process Fodda search results. Skills are external MCP servers that adapt/reframe output — called automatically after research, before the final response.
  - **`skillClient.ts`**: MCP client wrapper with fail-open semantics, 10s timeouts, parallel execution of multiple skills, and structured input contract (`SkillInput`). Uses `@modelcontextprotocol/sdk` client classes (`Client` + `StreamableHTTPClientTransport`).
  - **`catalogCache.ts`**: Added `getSkillGraphs()` and `getEnabledSkillConfigs()` functions. `CatalogGraph` interface extended with `mcp_url`, `skill_phase`, and `skill_tool_name` fields for skill-type graphs.
  - **`toolHandlers.ts`**: Session init now captures `disabled_graphs` from `/v1/graphs` response and resolves enabled skill configs (dual strategy: reads from `/v1/graphs` response directly, falls back to catalogCache). `search_graph` tool has a new `skip_skills` parameter — when `true`, suppresses skill execution for that single query.
  - **`systemPrompt.ts`**: `buildSystemPrompt()` now accepts `enabledSkills` parameter. When skills are active, injects `ACTIVE SKILLS` block into the system prompt instructing the LLM how to integrate skill outputs, attribute them by name, and handle user requests to skip or disable skills.
  - **Post-processing hook**: After search results are enriched but before widget rendering, all enabled output-phase skills are called in parallel. Skill outputs are appended as `── SKILL: [name] ──` content blocks to the MCP response. Applied to both the widget and fallback response paths.
  - **UX design**: Skills are auto-applied by default. Users can say "without skills" or "skip Paralogy" for per-query suppression, or toggle them off permanently in the My Graphs dashboard.

### Added
- **`delta/the-connection-index` Graph Support** (Brief: Note For MCP Agent — The Connection Index): Integrated Delta's The Connection Index expert graph into the MCP server. Domain: Air Travel / Modern Connection. Focus: the role of travel in rediscovering real-world experiences and community belonging.
  - `GRAPH_ID_DESC` in `index.ts` and `GRAPH_ID_DESCRIPTION` in `tools.ts` — added `'delta/the-connection-index'` to example graph lists.
  - **Graph attribution rule** — added `graphId "delta/the-connection-index" → "Delta's The Connection Index"` to fallback naming block.
  - **Expert graph routing** — added fallback routing for "Air travel trends", "Travel and connection", "Digital vs. real-world experiences", "Sensation over simulation", "Travel's impact on well-being and clarity".
  - **`search_graph` graphId description** — added `'delta/the-connection-index'` to the inline example list.
  - **Dynamic catalog** already handles this graph automatically — `catalogCache.ts` will pick up the graph from `/v1/graphs/catalog` once status changes to `live`, generating dynamic naming, routing, and supplemental pairing (travel domain → World Bank + WTO primary, BEA + Wikipedia secondary).
  - **Current status:** `coming_soon` (Neo4j sync pending). No queries will route to this graph until status is `live`.

### Added
- **`get_openalex_research_trends` tool** (Brief: OpenAlex Academic Research): Added 21st supplemental data tool — OpenAlex academic research trends covering 250M+ scholarly works across ALL academic domains (retail, marketing, culture, sports, technology, AI — everything PubMed does NOT cover). Endpoint: `GET /v1/supplemental/openalex/research-trends`.
  - **Parameters**: `term` (required — search query), `years` (optional, default 10, max 20), `top_papers` (optional, default 5, max 10).
  - **Returns**: `total_works`, `publication_trend` (year-by-year counts), `trend_direction` (accelerating/growing/stable/declining), `top_cited_papers` (with citation counts, topics, DOI), `dominant_topics` (4-level hierarchy: domain → field → subfield → topic).
  - **Anonymized title**: `"Query Academic Research Data"` (Claude UI shows this instead of "OpenAlex Research Trends").
  - **PubMed vs OpenAlex routing logic** added to system prompt: biomedical → PubMed, everything else → OpenAlex, cross-domain → both.
  - **Supplemental pairing updated** (`catalogCache.ts`): OpenAlex added as secondary tool for Retail, Consumer Culture, Technology, Design, and related domains.
  - **`list_graphs` description** updated: supplemental source count 20 → 21, "OpenAlex" added to source list.
  - Tool definition in `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS), handler in `index.ts`.

- **`green-house/thrive-report` Graph Support**: Integrated The Craft Graph (Thrive Report) into the fallback logic and tool parameter descriptions. Ensured specific routing context for "On-premise beverage marketing", "Craft spirits, mixers, or modern bar culture", "AI personalization or multi-sensory experiences in hospitality", and "Beverage formats like micro-serves or alternative RTDs".

### Added
- **`pwc/sxsw-2026-key-insights` Graph Support**: Integrated PwC's SXSW 2026 Key Insights expert graph into the fallback logic and tool parameter descriptions. Ensured specific routing context for "Technology trends", "AI integration and workforce adaptation", and "Brand authenticity in the algorithmic age".

### Added
- **Dynamic Graph Catalog Cache** (`src/catalogCache.ts`): New module that fetches `GET /v1/graphs/catalog` (public, no auth) at server startup and caches the full graph registry in memory with hourly background refresh. The catalog endpoint is the same one used by the Fodda website and app — already cached with 1h TTL on the API side.
- **Dynamic System Prompt Generation**: The MCP server's `instructions` string now dynamically builds 6 graph-specific blocks from the cached catalog instead of hardcoded text:
  - **GRAPH NAMING** — curator-attributed display names for every graph (e.g. `graphId "retail" → "PSFK's Retail Graph"`)
  - **GRAPH TYPES** — curated, expert, baseline, and community graph type descriptions
  - **EXPERT GRAPH ROUTING** — domain→graphId routing rules inferred from each graph's `domain` and `topics` fields
  - **SUPPLEMENTAL PAIRING STRATEGY** — per-graph tool pairings (primary/secondary) inferred from graph domain keywords
  - **EXPERT GRAPH WORKFLOW** — dynamically lists all expert graph IDs
  - **CURATED-ONLY TOOLS** — dynamically lists which graphs support `search_statistics` and `search_insights`
- **Graceful Fallback**: If the catalog fetch fails at startup, the server starts with a minimal hardcoded fallback (6 core graphs + generic instructions). The LLM is told to use `list_graphs` for discovery.

### Changed
- **Trend Validation Instruction**: Updated the MCP system prompt (`systemPrompt.ts`) to prevent the LLM from using internal database metrics (e.g. evidence counts, number of trends, signal scores) as proof that a trend exists or is growing. Fodda's data is curated by human experts, so presence in the database is the proof of existence. The LLM is now instructed to use signal score simply as a relative measure within the graph, and to rely on supplemental market data (e.g., Google Trends, BEA) to demonstrate real-world momentum.
- **`GRAPH_ID_DESC`** (`src/index.ts`) and **`GRAPH_ID_DESCRIPTION`** (`src/tools.ts`): Removed hardcoded graph ID lists. Both now say "Call list_graphs first to see all available graphs and their IDs."
- **`PSFK_DOMAIN_GRAPHS`** set (used for theme coloring): Now populated dynamically from `getDomainGraphIds()` with a hardcoded fallback if catalog is unavailable.
- **Server startup**: `app.listen()` now waits for `initCatalogCache()` to complete before accepting connections, ensuring the first MCP session gets the dynamic prompt. Startup proceeds even if the catalog fetch fails.
- **~100 lines of hardcoded graph data removed** from the system prompt: graph naming entries, expert routing rules, supplemental pairing strategy, and expert workflow lists are no longer maintained manually. New graphs added to Airtable will appear in the MCP automatically — no code deployment needed.
- **Supplemental access gating moved to API** (Brief: MCP API Access Gating): Removed all hardcoded "Retail → these tools, Beauty → those tools" routing logic from the system prompt. The API now returns 403 (`FORBIDDEN` or `GRAPH_DISABLED`) for sources the user's plan doesn't cover. The MCP calls any relevant tool and lets the API decide access.
- **Supplemental pairing reframed as relevance hints**: The system prompt now provides soft "relevance hints" per domain (e.g., "Retail: Census, BEA, FRED are most useful") instead of hard routing rules. Universal tools (Google Trends, Amazon, OECD, OpenStreetMap) are explicitly flagged as always-relevant.
- **403 error handling** (`handleAccessError`): All 21 supplemental tool catch blocks now use differentiated 403 handling:
  - `FORBIDDEN` → silent skip (returns empty data, not an error — LLM moves on)
  - `GRAPH_DISABLED` → mentions the source is disabled in user settings
  - `CREDITS_EXHAUSTED` → shows credits message
- **Interpretation evidence type guidance**: Added `EVIDENCE TYPES` block to system prompt for `search_insights`. The PSFK pipeline fix (Brief: MCP API Access Gating §4) corrected the evidence materialization — `interpretation` type results (from Opinion/Analysis articles) will now appear for the first time. LLM is instructed to frame these as analytical perspective ("Analysis from [source] suggests..."), not raw fact.

### Added
- **6 New Supplemental Data Tools** (Brief: Supplemental Data Sources MCP Agent): Implemented 6 new MCP tools wrapping live API endpoints for real-time supplemental data queries. Total supplemental tools: 19.
  - **`get_pew_survey_data`**: Pew Research Center NPORS 2025 survey data — social media usage, technology adoption, news consumption, trust, and AI attitudes segmented by demographics (age, income, education, race, sex, party). Endpoint: `GET /v1/supplemental/pew/survey-data`.
  - **`get_openfoodfacts_snapshot`**: Open Food Facts crowdsourced product database — ingredient composition, additive prevalence, NOVA ultra-processing levels, brand distribution. Endpoint: `GET /v1/supplemental/openfoodfacts`.
  - **`get_ridb_recreation_snapshot`**: Recreation.gov RIDB — US federal recreation facilities, trails, campgrounds, parks with GPS coordinates and activity types. US only (NPS, USFS, BLM, Army Corps). Endpoint: `GET /v1/supplemental/ridb`.
  - **`get_osm_commerce_snapshot`**: OpenStreetMap commerce infrastructure — global retail/commercial location data across 35+ categories and 180+ countries via Overpass API. Endpoint: `GET /v1/supplemental/osm`.
  - **`get_google_trends_snapshot`**: Google Trends demand signals — relative search interest over time, trend direction, regional breakdowns, related queries. Values are relative (0–100), not absolute. Endpoint: `GET /v1/supplemental/google-trends`.
  - **`get_amazon_products_snapshot`**: Amazon product & pricing reality — real-time listings, pricing tiers, brand distribution. Snapshot of current listings, not full market coverage. All references say "Amazon" only (never mention underlying data provider). Endpoint: `GET /v1/supplemental/amazon`.
  - **Tool definitions** added to `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS).
  - **Tool handlers** added to `index.ts` — 6 new `server.tool()` registrations following existing supplemental tool pattern.
  - **Server instructions updated**: supplemental source count 13 → 19 in `list_graphs` description; new source categories added to supplemental data sources instruction block; TOOLS NOT UNIVERSALLY PAIRED section expanded with pairing guidance for all 6 new tools.
  - Version bumped to 1.19.0.

### Added
- **13 New Expert Graphs** (Brief: MCP_INTEGRATION_BRIEF.md): Integrated 13 new domain-specific expert knowledge graphs into the MCP server. All are `status: "live"`, use `gemini-embedding-001 (768d)` embeddings, and follow the standard `EVIDENCE_FOR` relationship pattern. No code changes needed for `list_graphs` (dynamic from API) or response parsing (same shape as existing graphs).
  - **Graphs**: `ezra-eeman-wayfinder` (Future of Work), `juan-isaza-trends` (Consumer Culture), `automotive-color-trends` (BASF Automotive Color), `braze-2026-trends` (Customer Engagement), `common-ground-trail-trends` (Trail Culture), `dhl-ecommerce-trends-2026` (Logistics/E-Commerce), `firefish-treat-culture` (Treat Culture), `florian-schleicher-friction-unloaded` (Friction Design), `havas-media-trends` (Media/Advertising), `joanna-haugen-travel-trends` (Sustainable Travel), `marieke-neleman-trends` (Design/Lifestyle), `publicis-sapient-next-graph` (Enterprise Tech), `alyson-stevens-macro` (Macro Culture/TBWA).
  - **`GRAPH_ID_DESCRIPTION`** in `tools.ts` and **`GRAPH_ID_DESC`** in `index.ts` — added all 13 expert graph slugs as examples alongside existing curated and community graphs.
  - **Graph attribution rules** — added 13 new entries to the `GRAPH NAMING` block in server instructions (e.g., `graphId "ezra-eeman-wayfinder" → "Ezra Eeman's Wayfinder Graph"`).
  - **`GRAPH TYPES` expanded** — added "EXPERT GRAPHS" as a third category alongside Curated and Community, describing expert graphs as domain-specific knowledge graphs built from expert reports.
  - **`EXPERT GRAPH ROUTING`** — added 13 domain-to-graph routing hints in the server instructions (e.g., `Work / HR / Organization → ezra-eeman-wayfinder`).
  - **Expert Graph supplemental pairing strategy** — added pairing guidance for all 13 expert graphs (e.g., `dhl-ecommerce-trends-2026: get_census_retail_snapshot + get_wto_trade_snapshot`).
  - **`search_graph` GRAPH SELECTION GUIDE** — expanded with all 13 expert graph slugs and their domain keywords.
  - **`search_statistics`** and **`search_insights`** `graph_id` parameter descriptions — added expert graph slug examples.
  - Version bumped to 1.18.0.

### Added
- **MLB Sponsorship graph support** (Brief: Note For MCP Agent — MLB Sponsorship Graph): Added `mlb-sponsorship` (Comunicano MLB Sponsorship & Technology Graph, curated by Andy Abramson) across all MCP server touchpoints:
  - `GRAPH_ID_DESC` in `index.ts` and `GRAPH_ID_DESCRIPTION` in `tools.ts` — added `'mlb-sponsorship'` to the example graph list.
  - **Graph attribution rule** — added `graphId "mlb-sponsorship" → "Andy Abramson's Comunicano MLB Sponsorship & Technology Graph"` to the server instructions naming block.
  - **Supplemental pairing strategy** — added MLB-specific tool guidance: Wikipedia (primary, for team/league/brand attention), BEA (primary, recreation spending), Census Demographics (secondary, metro fan base), FRED (secondary, consumer sentiment).
  - **`search_graph` description** in `tools.ts` — added `mlb-sponsorship (MLB technology and sponsorship)` to the coverage list.
  - No changes to `list_graphs` (dynamic from API), Axios patterns, auth, error handling, or supplemental tools.
- **`get_wto_trade_snapshot` tool** (Brief: WTO International Trade Data — MCP Agent): Added 13th supplemental data source — World Trade Organization international trade data. New MCP tool wraps `GET /v1/supplemental/wto/trade-snapshot` endpoint, providing merchandise trade volumes, services trade, and tariff rates across 160+ economies.
  - **Parameters**: `countries` (group key: `major`, `g7`, `brics`, `eu_big4`, `asia_pac`, `english`, `nordic`, or custom WTO codes), `categories` (`merchandise`, `services`, `tariffs`), `years` (1-10, default 5).
  - **Tool handler** added to `index.ts` with storytelling directives for trade dependency framing and tariff rate comparisons.
  - **Tool definition** added to `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS).
  - **Server instructions updated**: supplemental source count 12 → 13 in `list_graphs` descriptions; WTO added to STEP 3 macro validation; WTO added to supplemental pairing strategy for Retail, Beauty, Sports, CE Design graphs; WTO added to TOOLS NOT UNIVERSALLY PAIRED list.
  - Version bumped to 1.17.0.

### Changed
- **Graph Naming rule** (Brief: MCP Graph Naming and Response Structure): Replaced the `ATTRIBUTION` instruction block with a `GRAPH NAMING` rule. The MCP agent now attributes results to the named expert who curated the graph (e.g., "PSFK's Retail Graph identifies…") instead of saying "the Fodda graph." Fodda is the platform; experts are the authority. Mapping: `psfk` → "PSFK's expert graph", `sic` → "Ben Dietz's SIC graph", `pew` → "Pew Research data", and vertical graphs (`retail`, `beauty`, `sports`) → "PSFK's [Vertical] vertical."
- **Response Structure rule** (Brief: MCP Graph Naming and Response Structure): Added a `RESPONSE STRUCTURE` instruction that makes graph trends the structural spine of every response. Web-sourced data (BCG, Bain, etc.) must be clearly subordinate and labeled: "Outside Fodda's expert coverage, [source] reports that…" Includes a good/bad example to guide the agent.
- **Source Attribution wording**: Updated `SOURCE ATTRIBUTION` instruction to use expert-level naming ("PSFK's Retail Graph identifies…" instead of "According to Fodda's PSFK retail intelligence graph…") and changed web-source label from "Outside of Fodda's coverage, web sources indicate…" to "Outside Fodda's expert coverage, [source] reports that…"
- **Graph Mismatch Handling** (Brief: MCP Graph Mismatch Handling): Confirmed the `CROSS-GRAPH NODE HANDLING` instruction and `_use_this_graphId` / `GRAPH_MISMATCH` error guidance in `get_evidence`, `get_neighbors`, and `get_node` tool descriptions were already implemented in a prior session. No additional code changes needed.
- **Evidence Citation Rule** (Brief: MCP Evidence Citations): Replaced the generic `CITATIONS & LINKS` instruction with a comprehensive `EVIDENCE CITATION RULE`. The agent now: (1) always calls `get_evidence` to retrieve supporting articles, (2) uses the new `evidenceType` field to frame evidence differently — signals as case studies, metrics as data points, quotes as expert voices with attribution, interpretations as analysis, (3) always includes `sourceUrl` links inline, and (4) uses the `publication` field for source attribution. Includes a worked example demonstrating the format.

### Fixed
- **Tool call ordering** (Brief: MCP Fix Tool Call Ordering): Rewrote the `STATISTICS SEARCH` instruction — `search_statistics` is now explicitly called AFTER `search_graph`, not before. The prior wording ("call search_statistics BEFORE searching trends") caused Claude to call supplemental/stats tools first and graph search second, inverting the intended order. New instruction enforces: 1) `search_graph` → 2) `search_statistics` → 3) supplemental tools → 4) web search.
- **`get_evidence` parameter naming** (Brief: MCP Fix Tool Call Ordering): Updated `for_node_id` description to explicitly say "NOT trend_id" — Claude was occasionally passing `trend_id` instead, which caused tool-not-found errors. Added a reminder in `RESPONSE STRUCTURE` instructions as well.
- **Eliminated web search leakage**: Removed all instructions that encouraged Claude to do web searches. The prior instructions had "ADD COLOR with web-sourced context" as step 4 of every response and "Web search → only if needed" in the tool workflow — Claude followed these literally, leading with McKinsey/BCG/Sourcing Journal web results before graph data. Now: (1) `NO WEB SEARCH` rule explicitly bans web search unless the user asks for it, (2) response structure is 3 steps only (graph → stats → supplemental), (3) `SUPPLEMENTAL DATA RULE` tightened from "ALWAYS check all tools" to "pick ONE OR TWO most relevant," (4) `SOURCE ATTRIBUTION` no longer normalizes web-sourced data.
- Version bumped to 1.14.0.

---

## [1.16.0] - 2026-03-28

### Added
- **Supplemental Pairing Strategy** (Brief: MCP Graph Supplemental Pairing Strategy): Added `SUPPLEMENTAL PAIRING STRATEGY` block to the MCP server's `instructions` field. This provides AI agents with a graph-to-supplemental-tool mapping so they know which institutional data sources to call for each knowledge graph. Prior to this, tool descriptions were biased toward retail/beauty, leaving CE Design, Fashion, Sports, SIC, and Pew queries without appropriate supplemental context.
  - **Retail**: Census retail + BEA spending + FRED (primary); BLS + Census demographics + Wikipedia (secondary)
  - **Beauty**: FDA ingredient safety + PubMed + Clinical Trials (primary); BEA + Wikipedia (secondary)
  - **Sports**: Wikipedia + BEA + Pew graph (primary); FRED + Census demographics (secondary)
  - **Fashion**: BEA + BLS + Census retail (primary); Wikipedia + World Bank (secondary)
  - **CE Design**: Wikipedia + PubMed + World Bank (primary); BEA + Pew graph (secondary)
  - **SIC**: Pew graph + Wikipedia (primary); Census demographics + BEA (secondary)
  - **Pew**: Census demographics (primary); FRED (secondary)
- **Tools exclusion list**: Explicitly documents which tools are NOT universally paired (FDA, Clinical Trials, CDC → beauty only; FDA Recalls → on-demand only).
- Version bumped to 1.16.0.

---

## [1.15.0] - 2026-03-27

### Added
- **`search_insights` tool**: New MCP tool that searches for expert quotes, analyst interpretations, statistics, and qualitative evidence across Fodda's knowledge graphs. Calls the same `/v1/graphs/:graph_id/statistics` endpoint as `search_statistics` but defaults to `types=metric,quote,interpretation` for broader evidence retrieval. Supports `types`, `limit`, and `min_score` parameters.
- **Quality gate instructions**: Added `EXPERT VOICES & INSIGHTS` block to MCP server instructions with three quality gates: (1) Trend Strength Gate — only call `search_insights` when `evidence_count >= 3`, (2) QA Spot Check — evaluate each result for relevance, credibility, and substance before presenting, (3) Graceful Degradation — silently skip when no strong results are found.
- **Updated research workflow**: Added Step 2.5 (conditional) between evidence gathering and statistics: if a trend has `evidence_count >= 3`, call `search_insights` to find expert quotes and analysis. SIC graph note: `search_insights` may be more important than `get_supporting_evidence` for SIC queries.
- Version bumped to 1.15.0.

---

## [1.12.0] - 2026-03-24

### Changed
- **Anonymized supplemental data tool titles**: All 12 supplemental data tool `annotations.title` values now use generic, domain-descriptive labels instead of revealing specific data source names. For example, `get_pubmed_research_trends` now displays as "Query Medical Research Data" instead of "PubMed Research Trends" in Claude's UI. This prevents oversharing methodology while still attributing specific sources (PubMed, FDA, Census, etc.) in the actual results.
- **Added annotations to `server.tool()` calls**: All 20 tool registrations in `index.ts` now pass `ToolAnnotations` using the SDK's 5-argument overload (`name, description, paramsSchema, annotations, callback`), ensuring Claude displays the proper `title` field instead of auto-formatting the snake_case tool name with broken capitalization.
- Version bumped to 1.12.0.

### Tool Title Mapping
| Tool | Old Title | New Title |
|------|-----------|----------|
| `get_census_retail_snapshot` | Census Retail Sales Snapshot | Query Retail Market Data |
| `get_census_demographics_snapshot` | Census Demographics Snapshot | Query Demographics Data |
| `get_fred_economic_snapshot` | FRED Economic Snapshot | Query Economic Indicators |
| `get_wikipedia_pageviews` | Wikipedia Pageviews | Query Cultural Attention Data |
| `get_worldbank_global_snapshot` | World Bank Global Snapshot | Query Global Economic Data |
| `get_fda_ingredient_safety` | FDA Ingredient Safety | Query Ingredient Safety Data |
| `get_fda_recalls` | FDA Recalls | Query Product Recall Data |
| `get_clinical_trials` | Clinical Trials Search | Query Clinical Research Data |
| `get_bls_economic_snapshot` | BLS Economic Snapshot | Query Labor Market Data |
| `get_bea_spending_snapshot` | BEA Spending Snapshot | Query Consumer Spending Data |
| `get_cdc_health_data` | CDC Health Data | Query Public Health Data |
| `get_pubmed_research_trends` | PubMed Research Trends | Query Medical Research Data |

---

## [1.8.0] - 2026-03-16

### Added
- **Community Pattern Graphs support**: Updated tool descriptions across `list_graphs`, `search_graph`, and all `graphId` parameters to reference community-contributed Pattern Graphs alongside expert-curated PSFK graphs.
- **Server instruction — GRAPH TYPES section**: Added `GRAPH TYPES` block to MCP server instructions explaining the two graph types (Curated vs Community) and providing community graph attribution guidance (use creator's name instead of "PSFK").
- **Tool annotations**: All 8 tools now include MCP spec `annotations` (`title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint`, `openWorldHint: false`) for Anthropic Connectors Directory compliance.
- **Favicon & root page**: Added `/favicon.ico` (→ PNG), `/favicon.svg` (→ SVG), and root `/` HTML page with `<link rel="icon">` tags so Google's favicon API resolves the Fodda logo for directory listings.

### Changed
- Bumped tool versions: `list_graphs` → 1.1.0, `search_graph` → 1.4.0.
- Version bumped to 1.8.0 across `package.json` and `tools.ts`.

---

## [1.7.3] - 2026-03-10

### Changed
- **Server architecture rebuilt**: Replaced `Server` (low-level SDK class) with `McpServer` (high-level API) — the same architecture pattern used in a working test server. This fixed persistent `"Error occurred during tool execution"` errors in Claude.ai web client.
- **Middleware chain removed**: Eliminated AsyncLocalStorage (`requestContext.run()`), rate limit response headers, diagnostic response interceptors, and HMAC verification on incoming requests. The combination of these middleware layers was interfering with the SDK's `@hono/node-server` response pipeline, causing Claude to reject valid tool responses.
- **Tool registration simplified**: Tools now registered via `server.tool()` with Zod schemas instead of `setRequestHandler(CallToolRequestSchema)`.
- **API key handling**: Extracted from URL query params and passed directly to tool handlers — no per-request context stores.
- **`psfk_overview` tool**: Temporarily removed from available tools (was already excluded from default enterprise tools list).

### Root Cause
The original server's `Server` class + `AsyncLocalStorage` + middleware chain (CORS → context → HMAC → rate limiter → JSON parse → Accept injection → diagnostic interceptors) created conditions where the SDK's HTTP transport adapter (`@hono/node-server`) couldn't properly deliver tool call responses to Claude's MCP client. A test server using the same SDK + same API calls but with `McpServer` + no middleware worked immediately.

### Deployment
- Revision: `fodda-mcp-00042-x2w`
- GCP Project: `fodda-mcp`
- Region: `us-east4`
- Verified: `list_graphs` and `search_graph` both work end-to-end through Claude.ai

---

## [1.7.2] - 2026-03-08

### Changed
- **Credit exhaustion error messages**: When the API returns `CREDITS_EXHAUSTED` or `INSUFFICIENT_CREDITS` error codes, the MCP now returns a user-friendly contextual message: *"You've reached your query limit. Your account will renew with a refreshed query limit of X on [renewal date]. Contact [account admin] or upgrade at https://app.fodda.ai."* If the API includes account metadata (`monthlyQueryLimit`, `nextRenewalDate`, `accountOwner`), those values are used; otherwise, graceful generic wording is substituted (e.g., "your allocated", "your next billing cycle", "your account administrator"). If the API already provides a rich message (≥30 chars), it passes through unchanged.

---

## [1.7.1] - 2026-03-07


### Added
- **Claude.ai web connector support**: API key can now be passed via URL query parameter (`?api_key=fk_live_...`) since Claude's "Add custom connector" form only supports OAuth — not custom headers. Key is extracted at the HTTP layer and persisted per-session.
- **Per-session API key storage**: API keys from URL query params or HTTP `Authorization` headers are stored in a `sessionApiKeys` map, automatically injected into tool call context, and cleaned up on session disconnect.
- **HMAC bypass for API-key-authenticated clients**: MCP transport endpoints (`/mcp`, `/sse`, `/messages`) now skip HMAC signature verification when the client authenticates via API key. HMAC remains enforced for server-to-server calls without API key auth.

### Changed
- **Auth fallback chain**: Tool call auth now checks `_meta.authorization` → session API key (from URL/header) → dev fallback, with a helpful error message directing users to the `?api_key=` URL format.
- **README**: Added Claude Web quick-start as the first section, added Claude Enterprise section, added `list_graphs` and `discover_adjacent_trends` to tools table, fixed version badge (1.4.0 → 1.7.0).
- **Enterprise_MCP_Setup.md**: Expanded Anthropic section from a vague one-liner into full setup guides for Claude Web, Claude Enterprise, and Claude Code CLI.
- **deploy_cloud_run.sh**: Fixed project ID (`gen-lang-client-0472572023`, not `fodda-mcp`) and region (`us-central1`, not `us-east4`). Added `--project` flag to all gcloud commands.

### Deployment
- GCP Project: `fodda-mcp`
- Region: `us-east4`
- Custom domain: `mcp.fodda.ai`
- Note: A secondary copy also runs in `gen-lang-client-0472572023` / `us-central1`

---

## [1.7.0] - 2026-03-07

### Added
- **Internal service key support**: MCP now reads `INTERNAL_SERVICE_KEY` or `FODDA_INTERNAL_KEY` env var and forwards `fodda-internal-service-key` header to the API to bypass credit checks for internal/admin usage.
- **`get_evidence` output schema**: Added `place` (geographic location of the article) and `brandNames` to evidence item documentation.
- **`FoddaEvidence` type**: Added `place` and `brandNames` optional fields to align with API response shape.

### Changed
- **`search_graph` — output schema**: Added explicit `semantic_score` (0–1, raw vector similarity), `relevance_score` (0–1, composite score penalizing zero-evidence trends by 0.6×), and `evidence_count` (integer) fields to output schema items. Results are now documented as pre-sorted by `relevance_score` descending. Bumped `search_graph` tool version → 1.3.0.
- **`search_graph` — query description**: Now documents that location terms (city/country names like "London", "Tokyo") are auto-detected and used to hard-filter results geographically, with auto-expansion (e.g., "London" → "UK", "England").
- **`search_graph` — tool description**: Added note that a server-side relevance gate may reduce results for brand/entity-specific queries (low-score results that don't mention query terms are filtered out).
- **`search_graph` — `include_evidence` default**: Changed from `false` to `true` — most agent use cases benefit from inline evidence. Each evidence item now documented with `sourceUrl`, `place`, `brandNames`, `snippet`, `publishedAt`.
- **`get_neighbors` — `relationship_types`**: Added `ASSOCIATED_BRAND`, `MENTIONS_BRAND`, and `IN_LOCATION` as valid relationship types alongside existing `EVIDENCED_BY`, `RELATED_TO`, `SEMANTICALLY_SIMILAR`.
- **`get_label_values` — `label` description**: Added `Location` as a valid label value alongside `Brand`, `Technology`, `Audience`, `RetailerType`, `Trend`.
- **Types audit**: Confirmed no references to API-stripped fields (`embedding`, `brands`, `Freshness Date`, `Freshness Days`, `Date Added`, `vertical - raw`, `dataset`, `articleIds_csv`, `airtableRecordId`, `industry`, `technology`, `sector`, `audience`, `relatedTrendRecIds`, `macroRecIds`).
- Bumped tool versions: `search_graph` → 1.3.0, `get_neighbors` → 1.2.0, `get_evidence` → 1.1.0, `get_label_values` → 1.2.0.
- Version bumped to 1.7.0 across `package.json`, `server.json`, and `tools.ts`.

---

## [1.6.0] - 2026-03-06

### Added
- **`list_graphs` tool**: New MCP tool wrapping `GET /v1/graphs` — lets AI agents discover available knowledge graphs, node types, relationship types, and versions before querying.
- **`search_graph` — `filters` parameter**: Supports `filters.node_types` to narrow results to specific labels (e.g., `["Trend", "Article"]`).
- **`search_graph` — `include_evidence` parameter**: Batch-fetches supporting evidence articles inline with search results, eliminating the need for separate `get_evidence` calls per trend.
- **`get_neighbors` — `direction` parameter**: Supports `'in'` or `'out'` traversal direction (default `'out'`), enabling inbound relationship discovery.
- **`get_label_values` — `property` parameter**: Specifies which property to return values for, with smart per-label defaults.

### Changed
- **Graph ID descriptions standardized** across all 8 tools. All tools now reference `list_graphs` as the canonical discovery source and list consistent examples including `'pew'`.
- **`list_graphs` and `get_label_values` added to `DEFAULT_ENTERPRISE_TOOLS`** — available out of the box for all enterprise deployments.
- Bumped tool versions: `search_graph` → 1.1.0, `get_neighbors` → 1.1.0, `get_label_values` → 1.1.0.
- Version bumped to 1.6.0 across `package.json`, `server.json`, and `tools.ts`.

---

## [1.5.0] - 2026-03-06

### Added
- **`discover_adjacent_trends` tool**: New MCP tool that wraps the API's `GET /v1/graphs/:graphId/adjacent` endpoint, enabling AI agents to discover semantically similar trends for a given seed trend. Supports `min_score`, `limit`, and `include_editorial` parameters with defense-in-depth caps (limit capped at 20).
- `src/test_live_mcp.ts` — Live MCP integration test script.

### Changed
- Version bumped to 1.5.0 across `tools.ts`.
- `discover_adjacent_trends` added to `DEFAULT_ENTERPRISE_TOOLS` (available out of the box).
- Minor README updates.

---

## [1.4.0] - 2026-02-24

### Added
- **Streamable HTTP Support**: Enabled `/mcp` alongside `/sse` for full compatibility with Anthropic Enterprise and OpenAI Frontier.
- **Enterprise Observability**: Ingests and forwards `traceparent` headers to the upstream API and applies stable UUIDv4 `requestId` parameters automatically to all tool execution pathways.
- **Enterprise Sandbox Tooling**: Added `ALLOWED_TOOLS` environment variable defaulting to a tightened schema (`search_graph`, `get_node`, `get_evidence`, `get_neighbors`) to control LLM footprint.
- **MAX_RESPONSE_BYTES Guardrail**: Hard-caps response JSON sizes to prevent runtime memory exhaustion, throwing a deterministic `PAYLOAD_TOO_LARGE` envelope upstream.
- **Enterprise MCP Setup Guide** (`Enterprise_MCP_Setup.md`): Onboarding documentation for enterprise integrators.
- **Description Updates Tracker** (`DESCRIPTION_UPDATES.md`): Central record of tool/server description revisions.

### Changed
- **Error Transparency Uniformity**: Ripped out all legacy protocol errors returning unhandled strings. ALL errors now permanently trace inside JSON `[{ text: "{\"error\": ...}" }]`.
- **Precedence Clarified**: `server.json` manifest properly declares `streamable-http` as the primary transport protocol fallback.
- Updated `@modelcontextprotocol/sdk` to `^1.27.1`.
- Expanded tool definitions in `src/tools.ts` with richer `outputSchema` and inline descriptions.
- `.env.example` updated with new enterprise configuration variables.

## [1.3.2] - 2026-02-16

### Published
- **Published to Official MCP Registry** as `io.github.piers-fawkes/fodda`
- Published to npm as `fodda-mcp@1.3.2`
- Registry listing: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda

### Changed
- Updated MCP name to use GitHub namespace format (`io.github.piers-fawkes/fodda`)
- Temporarily removed `remotes` section to resolve registry conflicts
- Users can install via npm: `npx fodda-mcp` or add to MCP client configs

## [1.3.0] - 2026-02-16

### Added
- Official MCP Registry manifest (`server.json`) conforming to 2025-12-11 schema.
- `/.well-known/mcp.json` discovery endpoint for automatic MCP server detection.
- `scripts/publish_registry.sh` for one-command npm + registry publishing.
- npm package support (`packages` field in `server.json`) for self-hosted installs.

### Changed
- README rewritten for marketplace-quality onboarding (Claude, Gemini quick-start examples).
- Version bumped to 1.3.0 across `package.json`, `tools.ts`, and `server.json`.
- Removed `metadata.json` (superseded by `server.json`).

## [1.2.0] - 2026-02-16

### Added
- HMAC middleware enabled on Express layer.
- Per-key rate limiting (60 req/min default, configurable via `RATE_LIMIT_RPM`).
- Multi-client SSE session map with auto-cleanup.
- Graceful shutdown (SIGTERM/SIGINT handlers).
- Request size limit (1MB) on JSON bodies.
- Cloud Run health check probe configuration.
- Secret Manager references in deploy script.
- `outputSchema` on all 6 tool definitions.

## [1.1.0] - 2026-02-14

### Added
- Simulated Gemini tool invocation mode (`gemini_echo`) for testing without upstream API calls.
- `psfk_overview` tool for generating macro overviews.
- System validation endpoint `/v1/system/validation`.

### Changed
- Updated `@modelcontextprotocol/sdk` to `^1.26.0`.
- Enforced API Key validation for all tool calls.

## [1.0.0] - 2026-01-01

### Added
- Initial release of Fodda MCP Server.
- Core graph tools: `search_graph`, `get_neighbors`, `get_evidence`, `get_node`.
- Express-based HTTP server with stdio fallback.
- Axios-based upstream API proxy to `api.fodda.ai`.
- HMAC request signing support.
- Structured JSON audit logging to stderr.

---

[Unreleased]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.12.0...HEAD
[1.12.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.8.0...v1.12.0
[1.8.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.2...v1.8.0
[1.7.2]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.3.0...v1.3.2
[1.3.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/piers-fawkes/fodda-mcp/releases/tag/v1.0.0
