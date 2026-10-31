# Brief — Purge Machine-Oriented Syntax from find_expert Payloads & Next Steps (MCP Agent)

**For:** MCP Agent  
**Repo:** Fodda MCP (`src/toolHandlers.ts`, `src/systemPrompt.ts`)  
**Priority:** High (Host Model Output Leakage / Voice Integrity)  
**Date:** 2026-10-31  

---

## 1. Context & Observed Defect
In production testing on the web sidebar and in external client chats (Claude, ChatGPT), asking expert discovery queries (e.g. *"Who's the right expert to ask about clean beauty formulation?"*) causes the host model to output leaked developer syntax and internal tool names:

> *"For expertise in clean beauty formulation, I recommend ChemCrow... You can consult ChemCrow directly using the `consultanalyst` tool with the `analyst_id: 'chemcrow-computational-chemistry-epfl'`."*
>
> *"To engage with Ericka Rodriguez or Erin Lopez, you can either use `requestexpertintro` to request an advisory introduction or `consulthumanagent` for domain fallback intelligence."*

### Root Cause
In `src/toolHandlers.ts`, the `find_expert` tool handler constructs raw machine invocation syntax inside human-readable string fields (`next_step` and `note`):

1. **Active Specialist `next_step`** (lines ~1993, ~2085):
   ```typescript
   candidateObj.next_step = `Call ${consultTool} with analyst_id: '${analystId}'.`;
   ```
2. **On-Request Specialist `next_step`** (lines ~1988, ~2081):
   ```typescript
   candidateObj.next_step = isToolCallable('request_expert_intro')
       ? `This specialist is available On Request. Use request_expert_intro(analyst_id: '${analystId}') to request an advisory introduction to this specialist, or call consult_human_agent(analyst_id: '${analystId}') for domain fallback intelligence.`
       : `This specialist is available On Request (https://www.fodda.ai/experts/${analystId}). Call consult_human_agent(analyst_id: '${analystId}') for domain fallback intelligence.`;
   ```
3. **Graph Fallback `note`** (line ~2017):
   ```typescript
   payload.note = relatedGraphs.length > 0
       ? `No dedicated Human Agent covers this domain yet. However, this topic is covered in Fodda Knowledge Graphs: ${relatedGraphs.map((g: any) => g.name).join(', ')}. Query them using search_graph(graphId: '${relatedGraphs[0].id}', query: '${query}').`
       : ...;
   ```
4. **Top-level `payload.next_step`** (lines ~2025, ~2096):
   ```typescript
   payload.next_step = results[0].next_step || "Call consult_human_agent or consult_analyst with the candidate's analyst_id to consult them.";
   ```

When an LLM host summarizes candidate matches for a human user, it treats these `next_step` strings as authoritative next-action copy and repeats the pseudo-code verbatim.

---

## 2. Files Expected to Change
* `src/toolHandlers.ts`
* `src/systemPrompt.ts` (if applicable for static behavioral rules)
* `CHANGELOG.md`

---

## 3. Requirements

### A. Clean Natural Guidance in `find_expert` (`src/toolHandlers.ts`)
Purge all function signatures (`tool_name(...)`), parameter assignments (`analyst_id: '...'`, `graphId: '...'`), and code syntax from text fields:

1. **For Active Specialists:**
   - **Replace:** `Call ${consultTool} with analyst_id: '${analystId}'.`
   - **With:** `Consult ${cleanDisplayName(r.name || analystId)} directly on this question, or explore their methodology and domain frameworks.`

2. **For On-Request Specialists:**
   - **Replace:**
     ```typescript
     `This specialist is available On Request. Use request_expert_intro(analyst_id: '${analystId}') to request an advisory introduction to this specialist, or call consult_human_agent(analyst_id: '${analystId}') for domain fallback intelligence.`
     ```
   - **With:**
     ```typescript
     `This specialist is available On Request (${profileUrl}). Request a facilitated advisory introduction, or consult broader domain intelligence.`
     ```
     *(Where `profileUrl` is `https://www.fodda.ai/experts/${analystId}`)*

3. **For Graph Fallback Notes:**
   - **Replace:**
     ```typescript
     `... Query them using search_graph(graphId: '${relatedGraphs[0].id}', query: '${query}').`
     ```
   - **With:**
     ```typescript
     `... Explore related signals across ${relatedGraphs.map((g: any) => g.name).join(', ')}.`
     ```

4. **For Top-Level Fallback `next_step`:**
   - **Replace:** `"Call consult_human_agent or consult_analyst with the candidate's analyst_id to consult them."`
   - **With:** `"Consult the recommended specialist directly on your inquiry, or request an introduction for bespoke advisory."`

> **Note on Machine Consumers:** Keep structured fields (`analyst_id`, `consult_tool`, `status`, `category`) intact on each candidate JSON object. Machine orchestrators can read the structured properties directly; human-facing text descriptions must remain clean executive prose.

### B. Static Behavioral Rule Reinforcement (`src/systemPrompt.ts`)
Ensure the static MCP behavioral rules instruct host models:
```markdown
### RULE: CleanExecutivePresentation
- Never expose internal tool names, function signatures, or parameter keys (e.g. consult_analyst, analyst_id) to human readers.
- Recommend specialists and next actions using natural conversational prose and markdown links ([Name](url)).
```

---

## 4. Verification
1. Run local MCP unit/integration tests (`npm test`).
2. Execute a test call against `find_expert` with query `"clean beauty formulation"`:
   - Verify `next_step` and `note` fields contain zero code syntax, parentheses `(...)`, or parameter labels like `analyst_id:`.
   - Verify candidate JSON objects still provide clean metadata (`analyst_id`, `consult_tool`, `status`) for structured tool-calling.
3. Update `CHANGELOG.md` documenting the hygiene cleanup for `find_expert`.
