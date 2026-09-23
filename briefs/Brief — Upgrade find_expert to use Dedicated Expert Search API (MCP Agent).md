# Brief: Upgrade `find_expert` to Use Dedicated Expert Search API (`Fodda MCP`)

**Target Agent:** Fodda MCP Agent (`Fodda MCP` repo)  
**Date:** 2026-09-22  
**Priority:** Medium / Follow-up to API Search Endpoint  
**Context:**  
Currently, the MCP discovery tool `find_expert` in `src/toolHandlers.ts` calls a local function `findCandidateExperts()` (`src/coverageRelevance.ts`). This local function strictly filters for `status === 'active'` (the ~20 live agents).  
When an AI client (Claude, Copilot, Gemini, Cursor) asks `find_expert` about an industry where Fodda has top-tier On-Request specialists but no Live Human Agent (e.g. *nicotine pouches*, *home health care*, *elder care*, *vaping regulations*), `find_expert` returns `0 matches` with the note: *"No active expert directly covers this domain."*  
This leaves client demand uncaptured and prevents LLMs from routing users to `request_expert_intro` or consulting via the On-Request domain fallback pipeline.

**Objective:**  
Update `find_expert` in `Fodda MCP` to query the new `GET /v1/experts/search` API endpoint. This unifies search logic across the Website and MCP, grants AI clients access to the full 4,150+ specialist roster, surfaces `why_matched` tags and dynamic action prompts, and routes On-Request candidates directly to `request_expert_intro` or domain consults.

---

## 1. Requirements

### 1.1 Route Execution in `src/toolHandlers.ts`
In the handler for `find_expert`:
1. Call `GET /v1/experts/search?q=${encodeURIComponent(query)}&limit=${effectiveLimit}` via `callFoddaAPI()` with HMAC authentication (or `foddaRequest`).
2. Map the returned candidates into the standard MCP candidate envelope.
3. Fallback: If the API request fails or times out (> 3 seconds), fall back gracefully to the existing local `findCandidateExperts()` over active analysts.

### 1.2 Differentiated Next-Steps by Candidate Status
In the formatted response returned to the LLM:
* **For Active Human Agents (`status === 'Active'`):**
  * `next_step`: `"Call consult_human_agent with analyst_id: '${analyst_id}'."`
* **For On-Request Specialists (`status === 'Unclaimed'` / `'On Request'`):**
  * Include:
    * `status`: `"on_request"`
    * `search_ask_line`: Returned from API (e.g. *"Ask Adam about market entry and compliance for nicotine pouches and vaping products."*)
    * `why_matched`: Returned from API (e.g. `["Nicotine pouches", "Vaping products"]`)
    * `next_step`: `"This verified specialist is available On Request. You can introduce the user by calling request_expert_intro(analyst_id: '${analyst_id}') or consult domain knowledge with consult_human_agent(analyst_id: '${analyst_id}')."`

### 1.3 Knowledge Graph Recommendation Surface
If `candidates.length === 0` but the API response includes `related_knowledge_graphs`:
* Include a helpful note directing the LLM:
  * `"note": "No dedicated Human Agent covers this domain yet. However, this topic is covered in Fodda Knowledge Graphs: ${graphs.map(g => g.name).join(', ')}. Query them using search_graph(graphId: '${graphs[0].id}', query: '${query}')."`

---

## 2. Files Expected to Change
* `src/toolHandlers.ts`
* `CHANGELOG.md`

---

## 3. Invariants & Fodda House Rules
* **Never Throw:** On network error, fall back silently to local active analyst matching.
* **HMAC Signing:** Outbound calls to Fodda API must route through `callFoddaAPI()` signed with `FODDA_MCP_SECRET`.
* **No SPT / Token Pricing:** Returned text must never display machine token rates or SPT pricing to makers or LLM users.
* **Strict Terminology:** Human Agents = living practitioners. Do not call synthetic or library graphs "experts".
