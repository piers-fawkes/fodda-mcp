# Brief — MCP Tool Disambiguation & TDQS Boundary Sharpening (MCP Agent)

**For:** MCP Agent (`Fodda MCP`)  
**Priority:** Medium (Raises Glama TDQS from Grade B to Grade A)  
**Date:** 2026-10-07  
**Context:** Glama TDQS Automated Audit & Fodda House Rules Disambiguation  

---

## 1. Context & Objective
A live Glama Tool Definition Quality Score (TDQS) audit evaluated `fodda-mcp` across 55 tools and scored:
* **Naming Consistency:** 4/5 (Clean `verb_noun` pattern)
* **Completeness:** 4/5 (Broad coverage across domain lifecycle)
* **Tool Count:** 2/5 (55 tools exceeds the 25+ threshold; tool consolidation parked for future discussion)
* **Disambiguation:** 2/5 (Docked due to overlapping search/intelligence descriptions without explicit disambiguation boundaries, and identical-sounding claim verification descriptions)

**Goal:** Without deleting or consolidating any tools (preserving 100% backward compatibility), sharpen the descriptions of the primary search and intelligence tools with explicit sibling-routing fences so host LLMs (Claude, GPT, Gemini) and TDQS evaluators easily pick the exact right tool.

---

## 2. Invariants & Scope Rules
* **Do NOT delete, rename, or merge any tools.** Tool count consolidation is parked.
* **Preserve all parameter schemas.** Only description strings are modified.
* **Eliminate "digital twin" phrasing** in `verify_claim` (House rule: use "Human Agent" only).
* **Source of truth:** Update both `src/toolHandlers.ts` and the Airtable Offerings table (`tbl93DJ627r81zKVP`) so descriptions persist across `npm run build`.

---

## 3. Tool Description Boundary Enhancements

### A. `search_graph` (Universal Entrypoint)
* **Current:** Focuses on general market trends across 100+ graphs.
* **Sharpened Boundary:**
  > "Primary universal entrypoint for market trends, category dynamics, and consumer shifts across 100+ curated knowledge graphs. Sibling routing: Use search_graph as the default starting tool for broad trend discovery; use search_statistics if you specifically need numerical data points and growth rates; use search_insights if you only need qualitative quotes and expert commentary; use get_domain_intelligence to search all 7 core PSFK industry verticals simultaneously; use brand_tracker if querying a specific company or brand name."

### B. `get_domain_intelligence` (Core 7 PSFK Verticals)
* **Current:** Mentions parallel search across domain graphs.
* **Sharpened Boundary:**
  > "Parallel macro trend search executing across the 7 core PSFK industry verticals (retail, beauty, tech, travel, food, sports, fashion). Sibling routing: Use get_domain_intelligence when exploring broad consumer culture across the primary retail/consumer domains without needing a graphId; use search_graph to query the broader catalog of 100+ specialist partner graphs; use get_report_intelligence for published enterprise whitepapers."

### C. `search_statistics` (Hard Numbers Only)
* **Current:** Numerical statistics and CAGR.
* **Sharpened Boundary:**
  > "Quantitative statistics and empirical metrics retrieval layer: queries knowledge graphs strictly for data points, percentages, market sizing, adoption rates, and CAGR. Sibling routing: Use search_statistics when you need numerical proof and hard numbers; use search_insights for qualitative quotes and editorial analysis; use search_graph for full narrative trend summaries. Does NOT return general narrative prose."

### D. `search_insights` (Qualitative Perspectives Only)
* **Current:** Quotes and qualitative evidence layer only.
* **Sharpened Boundary:**
  > "Qualitative perspective and expert commentary layer: returns named strategist quotes, leadership viewpoints, and editorial analysis linked to industry shifts. Sibling routing: Use search_insights when you need authoritative quotes and qualitative commentary; use search_statistics for numerical data points and market sizing; use consult_human_agent to speak interactively with an expert. Does NOT return quantitative statistics."

### E. `get_report_intelligence` (Enterprise Whitepapers & Benchmarks)
* **Current:** Searches corporate whitepapers.
* **Sharpened Boundary:**
  > "Published corporate research and market forecast layer: searches formal whitepapers and industry benchmark reports (PwC, Accenture, DHL, Unilever). Sibling routing: Use get_report_intelligence for formal corporate whitepapers and enterprise forecasts; use get_domain_intelligence for living consumer trends; use search_statistics for standalone metric citations."

### F. `get_intelligence_dossier` (Full Multi-Source Executive Brief)
* **Current:** Comprehensive dossier.
* **Sharpened Boundary:**
  > "Multi-vector executive research dossier generator: executes wide-net parallel harvesting across domain graphs, brand hops, Wall Street Q&A disclosures, and benchmark reports into an executive briefing document. Sibling routing: Use get_intelligence_dossier when you need an end-to-end composite briefing package on a strategic topic; use search_graph or search_statistics for lightweight targeted lookups."

### G. `get_evidence` (Citation Deep-Dive for a Specific Node)
* **Current:** Looks up primary evidence.
* **Sharpened Boundary:**
  > "Evidence citation and provenance lookup for a specific known trend: retrieves original reporting articles, case studies, and source URLs validating an individual node. Prerequisite: Requires a valid for_node_id from a prior search_graph or get_neighbors call. Sibling routing: Do NOT use as a discovery tool; use search_graph first to locate trends, then get_evidence to inspect the primary source citations backing that trend."

### H. `verify_market_claim` vs `verify_claim` (Empirical vs Advisory)
* **`verify_market_claim`**:
  > "Algorithmic 5-gate empirical evidence verification: evaluates a factual market claim against 100+ knowledge graphs, primary research citations, and corporate earnings divergence data through 5 sequential kill-gates (grounding, contradiction, freshness, corroboration, divergence). Sibling routing: Use verify_market_claim for objective, multi-source empirical data verification and contradiction scoring; use verify_claim for qualitative strategic debate with a living Human Agent practitioner."
* **`verify_claim`**:
  > "Qualitative advisory critique by a living Human Agent: matches the claim's topic to a vetted practitioner Human Agent to critically debate, challenge, and stress-test the strategic hypothesis from an experienced operator's viewpoint. Sibling routing: Use verify_claim for human practitioner judgment, experiential pushback, and qualitative advice; use verify_market_claim for algorithmic evidence verification and empirical contradiction scoring."

---

## 4. Verification Steps
1. Run `npm run build` in `Fodda MCP` to ensure compilation and description sync pass cleanly.
2. Verify all descriptions in `src/toolHandlers.ts` contain zero occurrences of "digital twin".
3. Verify that `verify_claim` and `verify_market_claim` have distinct prefixes ("Qualitative advisory critique by a living Human Agent" vs "Algorithmic 5-gate empirical evidence verification").
