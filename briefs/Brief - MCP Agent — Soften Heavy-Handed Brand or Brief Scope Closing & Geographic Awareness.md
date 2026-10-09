# Brief: Tone Calibration, Civic/Macro Guardrails & Thin-Coverage Hygiene for Closing Envelope (MCP Agent)

**To:** MCP Agent  
**From:** API Agent / Piers  
**Date:** 2026-10-08  
**Scope:** `Fodda MCP/src/coverageRelevance.ts`, `Fodda MCP/src/test_next_moves.ts`, `Fodda MCP/src/test_dynamic_next_moves.ts`  
**Status:** Ready for Execution  

---

## 1. Executive Summary & Problem Statement

In live evaluations (e.g. *"Use Fodda to pull stats that provide an insight into the quality of life in Edinburgh today"*), Claude generated this closing:

> *"There are several more signals on this topic in my graph — want me to pull those? I can also explore broader 'quality of life' trends in the United Kingdom or urban environments. If you tell me the brand or brief you're working on, I'll cut this to that."*

Piers flagged this directly:
> *"Arggg - 'If you tell me the brand or brief you're working on, I'll cut this to that.' why are we so heavy handed with this"*

### Root Cause Analysis in `Fodda MCP`
In `src/coverageRelevance.ts` (lines 1646–1649 and 2216–2229), the closing envelope unconditionally emits:
```ts
scopeSentence = `If you tell me the brand or brief you're working on, I'll cut this to that.`;
```
whenever `options.knownBrand` is absent on Turn 1.

This suffers from three structural flaws:
1. **Domain-Blindness:** When a query is civic, geographic, municipal, macroeconomic, or public-policy oriented (e.g. Edinburgh quality of life, Dublin inflation, UK river flood warnings, NHS patient wait times), prompting for a "brand or brief" sounds robotic, irrelevant, and aggressive. The user is asking about a municipality or national economy, not a consumer FMCG pitch.
2. **Thin / Empty Coverage Tone Deafness:** When retrieval found zero direct records, following a failure with a transactional *"I'll cut this to that"* pitch irritates the user. When coverage is thin or empty, the envelope should prioritize honest guidance or alternative data lenses, not sales framing.
3. **Rigid Over-Repetition:** Repeating the exact same 14-word slogan on every Turn 1 search creates noticeable AI boilerplate fatigue.

---

## 2. Required Changes in `Fodda MCP`

### 2.1 Context-Aware Scope Generation in `src/coverageRelevance.ts`

Refactor the fallback `scopeSentence` logic in `generateNextMoves()` (around lines 1646–1649 and lines 2216–2229) to detect the query context and coverage level:

1. **Civic / Geographic / Macro Detect:**
   Identify if the query or context is civic, municipal, geographic, or macroeconomic:
   ```ts
   const isCivicOrMacro = /^(quality of life|cost of living|housing|crime|floods?|weather|water|air quality|demographics?|gdp|cpi|inflation|unemployment|interest rates?|public sector|census|council|wellbeing|civic|municipal|transport|infrastructure)\b/i.test(query)
       || Boolean(options?.geo || options?.geography || options?.location);
   ```

2. **Differentiated Scope Lines:**
   - **When `knownBrand` is present:**
     Keep: `"Want this cut to ${options.knownBrand} specifically?"`
   - **When query is Civic / Geographic / Macro:**
     - If geographic (e.g. Edinburgh, Dublin, London):
       `"Want to look into specific municipal feeds like air quality, flood telemetry, or local wellbeing?"` or `"Want to focus on specific economic or demographic metrics for ${geo}?"`
     - If general civic/macro:
       `"Want to drill into specific demographic, economic, or environmental indicators?"`
   - **When Coverage is Empty (`status === 'empty'` or hits === 0):**
     Do NOT pitch cutting to a brand or brief. Instead suggest honest pivot:
     `"We can check external supplemental data or broaden the search terms."`
   - **When Standard Commercial Turn 1 (Default):**
     Soften the heavy-handed phrasing. Replace the aggressive sales pitch:
     - *Old:* `"If you tell me the brand or brief you're working on, I'll cut this to that."`
     - *New (Natural & Collaborative):*
       `"If you have a specific brand, category, or project in mind, let me know and we can tailor the analysis."`
       *(Or short conversational variant: "Let me know if there's a specific brand or angle you'd like to apply this to.")*

### 2.2 Updating Tool Description Guidance for `search_statistics` vs `get_supplemental_context`

Ensure `search_statistics` tool description clarifies its scope:
- `search_statistics`: Searches quantitative findings, consumer surveys, and whitepaper evidence across PSFK and curated industry knowledge graphs.
- For official civic, demographic, environmental, and macroeconomic metrics (ONS, Defra, CSO Ireland, Scottish Government Open Data, OpenData NI, Census, BLS, FRED), direct users and orchestrators to `get_supplemental_context`.

---

## 3. Files Expected to Change

1. `Fodda MCP/src/coverageRelevance.ts`:
   - Update `scopeSentence` generation logic for both consult envelope and general search envelopes.
   - Incorporate `isCivicOrMacro` and `coverageStatus` awareness.
   - Replace the rigid `"If you tell me the brand or brief you're working on, I'll cut this to that."` line with calibrated, context-sensitive copy.
2. `Fodda MCP/src/test_next_moves.ts` & `Fodda MCP/src/test_dynamic_next_moves.ts`:
   - Update expected assertions for the softened/calibrated scope lines.
   - Add a test verifying that civic/geographic queries (e.g. "quality of life in Edinburgh") receive a civic/macro scope line rather than "brand or brief".
   - Add a test verifying empty coverage suppresses commercial pitch copy.
3. `Fodda MCP/CHANGELOG.md`:
   - Document the calibration and test suite updates.

---

## 4. Verification Steps for MCP Agent

1. Run `npm test` in `Fodda MCP`.
2. Verify that running `generateNextMoves("quality of life in Edinburgh today", { geo: "Edinburgh" })` produces:
   - No mention of "brand or brief".
   - Contextual civic/geographic suggestion.
3. Verify that running standard brand queries (e.g. "retail packaging trends") still produces a natural tailoring prompt without the aggressive boilerplate.
