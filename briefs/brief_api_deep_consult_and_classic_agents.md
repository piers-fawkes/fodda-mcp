# Brief — API Agent — Deep Homework Mode on Analyst Consult & Classic Agent Depth

**For:** api-agent (Fodda API repo)  
**From:** mcp-agent (Fodda MCP repo)  
**Status:** Ready  
**Execution:** Hand off to API Agent  

---

## Context

During the Expert Layer QA session (documented in `fodda-expert-layer-briefs.md`), four briefs were defined:
1. **Brief 1 (Classic Agents: Quick Fix)**: Retired terminology cleanup (`Classic Digital Twin` / `Digital Twin` -> `Classic Agent` / `Human Agent`).
2. **Brief 2 (Classic Agents: Back Burner)**: Deferred.
3. **Brief 3 (New Tool `find_expert`)**: Built and live in Fodda MCP v1.46.63.
4. **Brief 4 (Deep "Homework" Mode)**: Added `deep?: boolean` to MCP's `consult_analyst` (matching `consult_human_agent`).

Fodda MCP v1.46.63 now sends `deep?: boolean` in the outbound JSON body to both `POST /v1/analysts/consult` and `POST /v1/human-agents/consult`.

Today on the API:
- `POST /v1/human-agents/consult` already implements the `deep` parameter and detects "do your homework" / "deep breakdown" phrases in follow-up queries.
- `POST /v1/analysts/consult` has no depth/homework path. A classic thinker like Thorstein Veblen or John Ruskin can only reason from their own graph nodes, returning `COVERAGE: PARTIAL` with a near-empty sources block ("Graph Evidence Item").
- Classic Agents have sparse native graphs — their real value is **lens × current evidence** (applying Veblen's lens to current luxury report trends or executive quotes).

---

## Requirements for API Agent

### 1. Support `deep: true` on `POST /v1/analysts/consult`
- Accept `deep?: boolean` in the consult request payload.
- Detect follow-up depth cues in the prompt ("do your homework", "go deeper", "deep breakdown").
- When `deep: true` is active for a Classic Agent:
  - Run multi-graph pre-search across relevant domain and report graphs (not just the classic's sparse individual graph).
  - Inject the retrieved evidence into the prompt as current market context.
  - Instruct the model to apply the classic thinker's historical analytical lens (e.g. pecuniary emulation, conspicuous waste) to this freshly retrieved evidence, rather than answering purely in the abstract.
  - For single-trend follow-ups, prioritize executive quote lookup; for broader queries, pull analysis layer evidence.
- Maintain consistent billing / token cost accounting for deep homework runs.

### 2. Retired Terminology Cleanup on API Roster Endpoints
- In `/v1/analysts` and `/v1/human-agents`:
  - Sanitize display names: strip `(Classic Digital Twin)`, `(Digital Twin)`, `[Classic Digital Twin]`, `(Human Twin)`.
  - Set `twin_type` to `'Classic Agent'` for classic thinkers (retiring `'Classic Digital Twin'`).
  - Set `category_label` to `'Classic Agent'` and `'Human Agent'`.

---

## Definition of Done
1. `POST /v1/analysts/consult` with `{ analyst_id: "thorstein-veblen", query: "...", deep: true }` conducts background research across report/domain graphs and returns an answer interpreting those sources in Veblen's voice.
2. `GET /v1/analysts` returns clean names without `(Classic Digital Twin)` and with `twin_type: "Classic Agent"`.
3. Existing shallow consults remain fast and unchanged.

---

## Files Expected to Change (Fodda API repo)
- `functions/v1/analysts.ts`
- `functions/v1/humanAgents.ts`
- `functions/v1/analysts/roster.ts` (or matching roster serialization file)
