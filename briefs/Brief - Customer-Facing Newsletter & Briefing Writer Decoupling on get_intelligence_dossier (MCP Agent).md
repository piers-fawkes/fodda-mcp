# Brief (MCP Agent) — Customer-Facing Newsletter & Executive Briefing Writer Decoupling on `get_intelligence_dossier`

**Owner:** `mcp-agent` · **Repo:** `Fodda MCP` (`/Users/piersfawkes/Documents/Fodda MCP`)  
**Date:** 2026-11-06  
**Depends on:** `/Users/piersfawkes/Documents/Fodda API/briefs/Brief - Customer-Facing Newsletter & Briefing Writer Decoupling (API Agent).md`  
**Reference Files:**  
- `src/toolHandlers.ts` (`get_intelligence_dossier` registration & blueprint formatter)  
- `src/toolGuide.ts`  

---

## 1. Context & Why

In `fodda-mcp`, `get_intelligence_dossier` was upgraded on October 31, 2026 to support automated newsletter and editorial drafting. However, the tool registration and returned blueprint currently suffer from internal jargon leakage:
1. **Tool Description in `src/toolHandlers.ts` (lines 5392–5403):**
   > *"Use when assembling a certified multi-source evidence dossier or writing a 5-beat PSFK Weekly or Retail Innovation Week newsletter-style article / executive briefing..."*
   To an outside user, Claude Desktop user, or Copilot Studio maker, phrases like **"5-beat"**, **"PSFK Weekly"**, and **"Retail Innovation Week"** are internal jargon. When a user asks: *"Help me draft a newsletter on retail margin defense"*, they want to write *their own* publication, not a PSFK-branded newsletter.
2. **Hardcoded Brand Framing in Blueprint Output (lines 5300–5389):**
   The prompt blueprint instructs Claude/ChatGPT to output phrases like `"Under the PSFK trend *[Trend Name]* found in the Fodda graph..."` and titles like `"PSFK Weekly Executive Briefing"`.
3. **Tool Semantic Intent Routing:**
   Because the tool is named `get_intelligence_dossier`, LLM routers sometimes fail to connect user prompts like *"Draft a newsletter on X"* or *"Write an executive briefing on Y"* with this tool unless the description explicitly positions it as a drafting engine for newsletters, executive briefings, and market analysis articles.

Per our MCP house rule (**"Consolidate, don't multiply — add no new tools"**), we do NOT create a new tool. We upgrade `get_intelligence_dossier` in place to be clean, outcome-focused, and publication-neutral.

---

## 2. What to Build in `src/toolHandlers.ts` (`get_intelligence_dossier`)

### A. Clean Up Tool Description & Parameter Schemas

1. **User-Facing Tool Description:**
   Replace the internal jargon with outcome-oriented language:
   ```ts
   'Use when researching and drafting an in-depth, research-backed newsletter, executive briefing, or market analysis article on any commercial topic, sector trend, or company cohort (e.g. \'Draft a newsletter on retail margin defense\', \'Write an executive briefing on functional beverage trends\', \'Analyze autonomous checkout strategies\', \'Build an evidence dossier on sustainable luxury packaging\'). Synthesizes corporate earnings disclosures, published research reports, macro data (FRED, BLS, Census), and expert commentary into a structured editorial narrative with cited sources and interactive explore links. Set include_editorial: true (with optional editorial_mode: \'blueprint\' | \'full\' and publication_name) to generate a complete publication-ready article or blueprint + ### Query Fodda footer. Sibling routing: Use get_intelligence_dossier for instant, single-turn multi-source synthesis and newsletter-style drafting; use deep_research_topic for multi-pass background deep dives; use search_graph for individual trend lookups.'
   ```

2. **Clean Up Parameters:**
   - Keep `topic`, `sector`, `tickers`, `include_editorial`, `editorial_mode`, and `userId`.
   - Add optional:
     - `publication_name: z.string().optional().describe("Optional custom publication or newsletter name (e.g. 'The Retail Signal', 'Omnichannel Executive', 'Consumer Tech Digest'). If omitted, defaults to a neutral executive briefing title.")`
     - `editorial_style: z.enum(['market_briefing', 'industry_newsletter', 'executive_memo', 'psfk_weekly', 'retail_innovation_week']).optional().default('market_briefing').describe("Editorial tone and format: 'market_briefing' for strategic cross-category analysis, 'industry_newsletter' for category and brand trends, 'executive_memo' for concise decision-maker briefings, or 'psfk_weekly' / 'retail_innovation_week' for PSFK house style.")`
   - Keep `publication_style` as a backward-compatible alias that maps into `editorial_style`.

### B. Clean Up Returned Blueprint & Composition Contract (lines 5300–5390)

1. **Section Concept Headings Instead of "Beat" Jargon:**
   In the returned markdown blueprint for Claude/ChatGPT, update the section headers:
   - `### 1. [Section Title] (Section 1: The Market Backdrop & Numbers)`
   - `### 2. [Section Title] (Section 2: The Core Debate & Published Research)`
   - `### 3. [Section Title] (Section 3: Corporate Strategies & Executive Disclosures)`
   - `### 4. [Section Title] (Section 4: Category Trends & Expert Frameworks)`
   - `### 5. [Section Title] (Section 5: Strategic Implications & Actionable Takeaways)`

2. **Natural Category & Trend Phrasing:**
   Update the Section 4 composition rules:
   - Instead of forcing `"Under the PSFK trend *[Trend Name]* found in the Fodda graph..."`, provide clean, natural journalist templates:
     - *"In market research tracking [Trend Name], data indicates that..."*
     - *"Analyzing [Trend Name], analysts note how [Brand]..."*
     - *"Within broader category shifts toward [Trend Name], [Brand]..."*
   - Keep the mandatory 4-part Human Agent attribution arc and rule against quoting experts directly in `"..."`.

3. **Publication Title / Header:**
   - Use `publication_name` if provided (e.g., `# [Publication Name]: [Headline]`).
   - Default to `# Executive Market Briefing: [Topic]` if unprovided (rather than forcing PSFK Weekly or Retail Innovation Week).

---

## 3. Files Expected to Change

- `src/toolHandlers.ts` (`get_intelligence_dossier` description, parameters, and blueprint generator)
- `src/toolGuide.ts` (tool guide entry for `get_intelligence_dossier`)
- Test file: `test/test_intelligence_and_verifier.ts` (or matching test verifying updated schema and blueprint)
- `CHANGELOG.md`

---

## 4. Do Not

- **Do not create a new standalone tool.** Keep the tool count consolidated.
- Do not mention pricing, token counts, or SPT billing in tool descriptions.
- Do not remove the strict style invariants (no em dashes, no bare dollar signs, verbatim executive quotes).

---

## 5. Definition of Done

- [ ] `get_intelligence_dossier` description is fully user-facing and free of internal jargon.
- [ ] Accepts `publication_name` and `editorial_style`.
- [ ] Blueprint uses professional section concepts (`Section 1: The Market Backdrop & Numbers`, etc.) rather than internal "beat" speak.
- [ ] Trend phrasing in Section 4 is natural and publication-neutral.
- [ ] Tests and build (`npm test`, `npm run build`) pass cleanly.
- [ ] `CHANGELOG.md` updated.
