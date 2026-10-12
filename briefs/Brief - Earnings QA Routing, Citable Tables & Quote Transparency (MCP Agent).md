# Brief: Earnings Q&A Routing, Citable Tables & Quote Transparency (MCP Agent)

Owning repo: **Fodda MCP** · Agent: **mcp-agent**  
Date: **2026-10-12** · Priority: **High**  
Execution Handle: `/build-from-brief "briefs/Brief - Earnings QA Routing, Citable Tables & Quote Transparency (MCP Agent).md"`

---

## 1. Context & User Feedback

John Farrall tested Fodda's earnings call intelligence via MCP/Claude:

### Test 2: Multi-Company Thematic Search
> **Query:** *"Search the earnings call intelligence for analyst concerns about AI spending."*  
> **Feedback:** *"This is the most useful output for someone who writes about markets, and the hardest to trust. There are no quarters, no quotes, no analyst names, and one catch-all source line. The theme names ('Pilot Trap,' 'AI Reality Check') are Fodda's labels, not what analysts said. Before I could put any of it in the newsletter, I'd have to check every company myself. If each company in a group came with the quarter and the line from the call, this would be a real tool."*

### Test 3: Single-Company Earnings & Analyst Q&A
> **Query:** *"What did analysts ask Walmart about AI on its latest earnings call? Give the quarter, analyst names and direct quotes."*  
> **Feedback:** *"It listed what analysts actually focused on... and said plainly that AI wasn't one of them. It also said it doesn't store analyst names or quotes, and linked the full Motley Fool transcript... Accurate and honest about its limits. The missing piece is the analyst Q&A itself. Who asked, and what exactly they said, is what a buy-side or newsletter user wants most."*

---

## 2. Root Cause in MCP Server

1. **Routing Blindspot on `get_company_earnings`:**
   - `get_company_earnings` supports `view: 'snapshot' | 'history' | 'qa' | 'compare' | 'coverage'`, defaulting to `'snapshot'`.
   - The tool description does **not** instruct Claude that `view: 'qa'` exists specifically for analyst names, firms, and verbatim questions/answers.
   - When John asked *"What did analysts ask Walmart... give analyst names and quotes"*, Claude called `get_company_earnings({ ticker: 'WMT' })` with default `view: 'snapshot'`. The snapshot returned high-level summaries (`analyst_concerns`), but no individual Q&A rows. Claude saw no quotes in the JSON and mistakenly asserted to John: *"Fodda doesn't store analyst names or quotes."*

2. **Presentation Contract on `get_earnings_intelligence`:**
   - The tool returns thematic intelligence, but does not instruct Claude to render findings as a **verifiable evidence table**. Claude collapsed the output into high-level editorial bullet points without citing the quarter, analyst name, firm, or quote for each company.

---

## 3. Architecture & What to Build

### A. Update `get_company_earnings` Tool Description & Auto-Detection (`src/toolHandlers.ts`, `tools-manifest.json`)

1. **Tool Description Guidance:**
   Update the description for `get_company_earnings` in `toolHandlers.ts` and `tools-manifest.json`:
   ```text
   The canonical per-ticker earnings source for 517 covered companies. 
   - view='snapshot' (default): Full quarterly record including headline, financial metrics, analyst sentiment, strategic activity, CEO quotes, and top Q&A entries.
   - view='qa': Itemized analyst Q&A session with verbatim analyst questions, analyst names, analyst firms, executive responses, and response directness. USE THIS VIEW whenever the user asks who asked a question, for analyst names/firms, or for verbatim call quotes.
   - view='history': Narrative quarterly timeline.
   - view='compare': Side-by-side comparison of 2-5 tickers.
   ```
2. **Intelligent View Resolution in Handler:**
   In `get_company_earnings` handler, if `view` was not explicitly passed by the caller, inspect the query or parameters:
   - If the request asks about *analyst names*, *analyst questions*, *who asked*, or *call quotes*, automatically route to `view: 'qa'` (or fetch both snapshot and Q&A).
   - Alternatively, pass the embedded `qa_entries` from the API snapshot directly to Claude.

### B. Mandate Verifiable Evidence Tables for `get_earnings_intelligence` & `get_earnings_divergence`

1. Update the description of `get_earnings_intelligence` and `get_earnings_divergence`:
   ```text
   OUTPUT REQUIREMENT: For multi-company thematic findings, present results in a structured evidence table citing:
   | Company (Ticker) | Reporting Quarter | Speaker (Analyst & Firm / Exec) | Verbatim Quote / Finding |
   Clearly distinguish Fodda's synthesized theme labels (e.g. "Pilot Trap") from what analysts or executives actually said on the call.
   ```
2. In `toolHandlers.ts`, format the returned payload to clearly label `theme_label` (synthesized theme) and `citations` (the underlying primary evidence).

### C. Eliminate "Does Not Store Quotes" Hallucination

In `src/systemPrompt.ts` (under Earnings Intelligence guidelines):
- Explicitly instruct the model: *"Fodda stores verbatim analyst Q&A, executive responses, analyst names, firms, and CEO quotes for 517 public companies. Never state that Fodda does not store analyst names or call quotes. If a user asks for specific analyst questions, consult `get_company_earnings(view='qa')` or the citations in `get_earnings_divergence`."*

---

## 4. Files Expected to Change

- `src/toolHandlers.ts` (`get_company_earnings`, `get_earnings_intelligence`, `get_earnings_divergence` descriptions & Q&A view handling)
- `tools-manifest.json` (sync updated tool descriptions)
- `src/systemPrompt.ts` (guidelines on earnings citations and Q&A availability)
- `CHANGELOG.md` (document updates)

---

## 5. Verification & Acceptance Criteria

1. **Single-Company Q&A Test:**
   - Call `get_company_earnings` with query for Walmart Q&A.
   - Verify that Claude receives `qa` data containing analyst names, firms, and questions/answers, and does **not** claim Fodda lacks quote storage.
2. **Evidence Table Formatting Test:**
   - Call `get_earnings_intelligence` for cross-company theme.
   - Verify tool output schema provides `citations` with `company`, `quarter`, `speaker_name`, `speaker_firm`, and `quote`.
3. **Build & Tests:**
   - `npm test` and `npm run build` pass cleanly in `Fodda MCP`.
