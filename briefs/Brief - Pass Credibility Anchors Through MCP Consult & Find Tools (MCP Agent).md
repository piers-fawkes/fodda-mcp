# Brief: Pass Credibility Anchors Through MCP Consult & Find Tools

**Target Repo:** `Fodda MCP` (`/Users/piersfawkes/Documents/Fodda MCP`)  
**Target Agent:** MCP Agent  
**Context:** When a user queries a Human Agent or Analyst via Claude Desktop, Claude Web, or ChatGPT using `fodda-mcp`, the LLM is not receiving the expert's official **Credibility Anchor**. The upstream Fodda API (`POST /v1/human-agents/consult`, `POST /v1/analysts/consult`, `GET /v1/experts/search`) now returns `credibility_anchor` on both the root and `analyst` objects, but `toolHandlers.ts` currently strips it before sending the payload to the LLM. As a result, Claude falls back to generic conversation memory (e.g. `"(founder of Panama Red, alc-bev specialist)"`) instead of delivering the authoritative 2–3 sentence pedigree.

---

## 1. Root Cause Analysis
In `src/toolHandlers.ts`:
1. **`consult_human_agent` (lines ~6823–6974)**:
   - Calls `foddaRequest('POST', '/v1/human-agents/consult', ...)`.
   - Upstream API returns:
     ```json
     {
       "credibility_anchor": "Thiago Bersou's Human Agent on Fodda is an expert in alcoholic beverages. Thiago is a Founder — Panama Red. Their Human Agent expertise is grounded in their curated graph tracking food & beverage, retail.",
       "analyst": {
         "id": "thiago-bersou-alc-bev",
         "name": "Thiago Bersou",
         "credibility_anchor": "..."
       }
     }
     ```
   - However, `payload` only extracts:
     `{ verdict, confidence, one_line, rationale, sources, expert, book_a_call }`
   - `result.credibility_anchor` is discarded completely.
2. **`consult_analyst` (lines ~6419–6533)**:
   - `parts` begins with `[reportText]`. It never includes `result.credibility_anchor`.
3. **`find_expert` (lines ~1669–1693)**:
   - `formatCandidate` maps `displayName`, `category`, `reason`, etc., but omits `credibility_anchor`.
4. **Missing LLM Instruction**:
   - Claude and ChatGPT need an explicit directive in the tool response telling them to introduce the expert with their official credibility anchor on first touch.

---

## 2. Changes Required in `Fodda MCP`

### File: `src/toolHandlers.ts`

#### A. Update `consult_human_agent`
1. Extract `credibility_anchor`:
   ```typescript
   const credibility_anchor = result?.credibility_anchor || result?.analyst?.credibility_anchor || match?.credibility_anchor || null;
   ```
2. Include in `payload`:
   ```typescript
   const payload = {
       verdict,
       confidence,
       one_line,
       credibility_anchor,
       rationale: narrative,
       sources,
       expert: resolvedExpertName,
       book_a_call
   };
   ```
3. Format `content` text with an explicit directive for the LLM:
   ```typescript
   const formattedSections: string[] = [];
   if (credibility_anchor) {
       formattedSections.push(`--- EXPERT CREDIBILITY ANCHOR ---\n${credibility_anchor}\n(GUIDANCE FOR ASSISTANT:\n- FIRST TOUCH ONLY: If introducing this expert to the user for the first time in this conversation, frame their response using their official credibility anchor above.\n- FOLLOW-UP TURNS IN SAME SESSION: If this is an ongoing conversation or follow-up question with this expert, DO NOT repeat the pedigree or credibility anchor. Answer directly from their perspective.)`);
   }
   formattedSections.push(JSON.stringify(payload, null, 2));

   return {
       ...payload,
       content: [{
           type: 'text' as const,
           text: formattedSections.join('\n\n')
       }]
   };
   ```

#### B. Update `consult_analyst`
1. Extract `credibility_anchor`:
   ```typescript
   const credibility_anchor = result?.credibility_anchor || result?.analyst?.credibility_anchor || null;
   ```
2. Prepend to `parts` array:
   ```typescript
   const parts: string[] = [];
   if (credibility_anchor) {
       parts.push(`--- EXPERT CREDIBILITY ANCHOR ---\n${credibility_anchor}\n(GUIDANCE FOR ASSISTANT:\n- FIRST TOUCH ONLY: If introducing this expert to the user for the first time in this conversation, frame their response using their official credibility anchor above.\n- FOLLOW-UP TURNS IN SAME SESSION: DO NOT repeat the pedigree or credibility anchor. Answer directly.)`);
   }
   parts.push(reportText);
   ```
3. Return `credibility_anchor` in the tool result object alongside `coverage`, `next_moves`, etc.

#### C. Update `find_expert`
1. In `formatCandidate`:
   ```typescript
   const candidateObj: any = {
       analyst_id: analystId,
       display_name: displayName,
       category,
       consult_tool: consultTool,
       credibility_anchor: r.credibility_anchor || r.credibilityAnchor || null,
       reason: Array.isArray(r.why_matched) && r.why_matched.length > 0
           ? `covers ${r.why_matched.join(', ')} directly`
           : (r.role_title || 'covers this domain directly'),
       out_of_lane: false
   };
   ```

---

## 3. Verification
1. Run local MCP test querying Thiago Bersou (`thiago-bersou-alc-bev`):
   - Assert `consult_human_agent` returns `credibility_anchor` in both the structured payload and the text section.
2. Run local MCP test querying a Classic Agent (e.g. `thorstein-veblen`) or synthetic analyst:
   - Assert `consult_analyst` returns the leisure class / institutional critique credibility anchor.
3. Assert that Claude receives the explicit `GUIDANCE FOR ASSISTANT` block.
4. Bump `package.json` version and publish.
