# Brief: Suppress Internal Graph Slugs in Human Agent & Analyst Citation Prompts

**Target Repo:** Fodda API (`~/Documents/Fodda API/Fodda/`)  
**Assignee:** API Agent  
**Context:** QA testing with Claude over MCP (`https://mcp.fodda.ai/claude`) revealed that when consulting Human Agents (e.g. Thiago Bersou via `consult_human_agent`), the generated expert response text included the raw internal graph ID:
> *"Drawing from Fodda's thiago-bersou-alc-bev knowledge graph..."*

Downstream host assistants (such as Claude) explicitly flag this as a bug because Fodda MCP guidelines strictly mandate that internal database IDs, slugs, and system identifiers must never be exposed to users.

---

## 1. Root Cause Analysis

In `functions/v1/humanAgents.ts` (line 296) and `functions/v1/analysts.ts` (line 4254), the system prompt directs the LLM to cite Fodda's graph architecture using an example pattern:

### `functions/v1/humanAgents.ts`:
```ts
4. KNOWLEDGE GROUNDING & NETWORK GRAPH CITATIONS:
   - Ground your analysis directly in the verified evidence nodes of your backing knowledge graph.
   - Actively cite Fodda's underlying network graph architecture and verified evidence nodes (e.g. "Drawing from Fodda's [Domain/Topic] knowledge graph...", "Verified signals in my backing Fodda graph indicate...", "Evidence from the [Topic] graph reveals...").
   - Cite specific trends, evidence, and data points from your graph.
```

### `functions/v1/analysts.ts`:
```ts
- Your own graph (the INTELLIGENCE CONTEXT block): speak as your own work. Actively ground and cite Fodda's underlying network graph architecture (e.g. "Drawing from Fodda's [Domain/Topic] knowledge graph...", "Verified signals in my backing Fodda graph indicate...").
```

When generating responses for specialist Human Agents, the LLM substitutes `analyst.id` or `graphId` (e.g. `thiago-bersou-alc-bev`) into the `[Domain/Topic]` placeholder, causing the raw internal graph slug to appear directly in the user-facing text.

---

## 2. Required Changes in `Fodda API`

### 1. Update Citation Directives in `functions/v1/humanAgents.ts`
Replace the example pattern in section 4 of `ANTI_DEFLECTION_DIRECTIVES`:
- Explicitly forbid raw graph slugs/IDs (`e.g. thiago-bersou-alc-bev`, `ben-dietz-culture`, `psfk-retail-trends`).
- Direct the model to refer to their domain topic, professional focus, or generic backing research:
```ts
4. KNOWLEDGE GROUNDING & CITATIONS:
   - Ground your analysis directly in the verified evidence nodes of your backing knowledge graph.
   - Actively cite Fodda's underlying verified evidence nodes (e.g. "Verified signals in my backing Fodda research indicate...", "Drawing from my research on [Topic/Industry]...", "Evidence from my curated Fodda graph reveals...").
   - NEVER expose internal graph slugs, routing IDs, or hyphenated database identifiers (e.g. NEVER write "thiago-bersou-alc-bev knowledge graph" or "ben-dietz-culture graph"). Always use clean domain titles or refer to your backing research on Fodda.
   - Cite specific trends, evidence, and data points from your graph.
```

### 2. Update Research Toolkit in `functions/v1/analysts.ts`
Update `twinToolkitPrompt` (around line 4254):
```ts
- Your own graph (the INTELLIGENCE CONTEXT block): speak as your own work. Actively ground and cite Fodda's underlying research (e.g. "Verified signals in my backing Fodda research indicate...", "Drawing from my research on [Domain/Topic]..."). NEVER expose internal hyphenated graph IDs or slugs (e.g. NEVER cite "[slug] knowledge graph").
```

---

## 3. Verification & Acceptance Criteria

1. **Verify No Raw Graph Slugs:**
   - Execute a test call to `/v1/human-agents/consult` with `analyst_id: "thiago-bersou-alc-bev"`.
   - Confirm the output text does not contain `"thiago-bersou-alc-bev"` anywhere in its prose.
   - Confirm it cites verified signals and evidence cleanly (e.g. *"Drawing from my research on non-alcoholic beverages..."* or *"Verified signals in my backing Fodda research indicate..."*).
2. **Build & Test:**
   - Run `npm run build` in `Fodda API/Fodda/` to verify TypeScript compilation succeeds.
