# Brief (MCP Agent) — 5-Beat PSFK Newsletter Mode on `get_intelligence_dossier`

**Owner:** `mcp-agent` · **Repo:** `Fodda MCP` (`/Users/piersfawkes/Documents/Fodda MCP`)  
**Date:** 2026-10-31  
**Depends on:** `/Users/piersfawkes/Documents/Fodda API/briefs/Brief - 5-Beat PSFK Newsletter Blueprint and Writer Upgrade in Dossier API (API Agent).md`  
**Reference Implementation:** `/Users/piersfawkes/Documents/Fodda Newsletter/src/writer/psfkEditorialWriter.ts`

---

## 1. Context & Why

Piers wants Fodda users in Claude, ChatGPT, and Copilot to be able to ask Fodda to write a **PSFK Weekly or Retail Innovation Week newsletter-style article / 5-beat executive briefing** on any topic, sector tension, or company cohort.

Per our MCP house rule (**"Consolidate, don't multiply — add no new tools"**), `get_intelligence_dossier` (`src/toolHandlers.ts` ≈ line 4731) is already the canonical tool for this and already has an `include_editorial` parameter. However:
1. Its current formatting block in `src/toolHandlers.ts` (lines 4834–4856) still formats the old **4-beat** structure (missing Beat 4 *PSFK Knowledge Graph Fan-Out & Human Agent Frameworks* and the **`### Query Fodda`** footer).
2. Calling `POST /v1/intelligence/dossier` with full server-side Gemini drafting (`include_editorial: true`) can take 35–60s and risk MCP client timeouts in Claude/ChatGPT, whereas passing `editorial_mode: "blueprint"` returns the pre-linked **5-Beat Newsletter Blueprint + Composition Contract** in ~6–8s so the host model (Claude/ChatGPT) can compose the finished 5-beat newsletter article immediately without timeout.

**Add no new tools.** Upgrade `get_intelligence_dossier` in place.

---

## 2. What to Build in `src/toolHandlers.ts` (`get_intelligence_dossier`)

1. **Extend Parameters on `get_intelligence_dossier` (Backward-Compatible):**
   - Keep `topic`, `sector`, `tickers`, `include_editorial`, and `userId`.
   - Add optional:
     - `editorial_mode: z.enum(['blueprint', 'full', 'none']).optional().describe("Editorial output mode: 'blueprint' (default when include_editorial is true in Claude/ChatGPT) returns a fast 5-beat PSFK newsletter blueprint, pre-built www.fodda.ai hyperlinks, and composition contract so the assistant can write a full 5-beat newsletter article without timeout; 'full' runs server-side 5-beat article generation; 'none' returns raw dossier only.")`
     - `publication_style: z.enum(['psfk_weekly', 'retail_innovation_week']).optional().default('psfk_weekly').describe("Newsletter lens: 'psfk_weekly' for cross-category strategic briefings, or 'retail_innovation_week' for retail and commerce innovation.")`
   - Update the `get_intelligence_dossier` description (keeping it concise and free of any price/token/SPT language) so that prompts like *"Write a PSFK newsletter-style article on..."*, *"Create a Retail Innovation Week briefing on..."*, or *"Write a 5-beat executive briefing on..."* route directly to `get_intelligence_dossier` with `include_editorial: true`.

2. **Default to Fast `editorial_mode: "blueprint"` for Interactive LLM Clients when `include_editorial: true`:**
   - When `include_editorial` is `true` and `editorial_mode` is not explicitly set to `'full'`, pass `editorial_mode: (sessionSource === 'claude' || sessionSource === 'chatgpt') ? 'blueprint' : 'full'` to `POST /v1/intelligence/dossier`.

3. **Render the 5-Beat PSFK Newsletter Structure & Composition Contract (`src/toolHandlers.ts` ≈ lines 4834–4864):**
   - **When `data?.editorial` is returned (`editorial_mode === 'full'`):**
     - Render all **5 Beats** (`market_lede`, `core_debate`, `competing_playbooks`, `graph_fan_out`, `strategic_stakes`) plus the canonical **`### Query Fodda`** footer (`ed.bodyMarkdown` or structured 5-beat sections), escaping any bare `$` signs before digits (`/(?<!\\)\$([0-9])/g`).
   - **When `data?.newsletter_blueprint` is returned (`editorial_mode === 'blueprint'`):**
     - Append the structured **5-Beat Newsletter Blueprint & Strict Composition Contract** to the returned markdown so the host assistant writes the complete 5-beat article following every PSFK house rule:
       - **Headline, Subtitle & Executive Summary** (provocative, friction-first; name the newsletter style in the summary).
       - **Beat 1 (`### 1. [Section Title]` — Market Condition & The Numbers):** Story and consumer behavior FIRST in **2 breathable paragraphs**; cite **at most 1 sharp contrast metric per company** with its explicit 2026 financial period (never dump 4–6 stats in a single sentence).
       - **Beat 2 (`### 2. [Section Title]` — Core Tension & Published Research):** Weave published research reports (`https://www.fodda.ai/graphs/:slug?q=...`), macro data (BLS/Census/PubMed), and 3rd-party non-verbatim voices (`quotable: false`) together so physical and digital commentary set each other up naturally instead of sitting as isolated one-liners.
       - **Beat 3 (`### 3. [Section Title]` — Competing Corporate Playbooks):** Introduce each company's strategy first, hyperlink the earnings call reference (`[During <Company>'s Q3 2026 earnings call](https://www.fodda.ai/?q=...)`), and quote `quotable: true` executives verbatim inside `"..."`.
       - **Beat 4 (`### 4. [Section Title]` — Cross-Domain Case Studies & Expert Frameworks):** Anchor case studies in named PSFK Trends using varied, natural phrasing (*"Under the PSFK trend *[Trend Name]* found in the Fodda graph, ..."*, *"Within the trend *[Trend Name]*, PSFK researchers highlight how ..."*, *"Under another PSFK identified trend, *[Trend Name]*, ..."*), followed by the active Human Agent perspective using the mandatory 4-part attribution arc (never in `"..."`).
       - **Beat 5 (`### 5. [Section Title]` — Strategic Stakes & Executive Playbook):** Closing synthesis + 4 bulleted executive takeaways with inline `https://www.fodda.ai/?q=...` links.
       - **Footer (`### Query Fodda`):** Output the pre-built `query_fodda_markdown` block verbatim at the end.
       - **Strict Style Invariants:** Zero em dashes (`—`, `--`, `–`), zero bare dollar signs (`$` -> write `dollars` or `\$`), natural text hyperlinks using the exact provided `https://www.fodda.ai` URLs, zero bracketed footnote numbers (`[1]`, `[2]`).

---

## 3. Files Expected to Change

- `src/toolHandlers.ts` (`get_intelligence_dossier` schema, description, and 5-beat markdown/blueprint formatter)
- `src/toolGuide.ts` (if `get_intelligence_dossier` capability/recipe description is referenced)
- Test file verifying 5-beat rendering and blueprint pass-through on `get_intelligence_dossier`
- `CHANGELOG.md`

---

## 4. Do Not

- **Do not add a new standalone MCP tool.** Keep the tool count unchanged by upgrading `get_intelligence_dossier`.
- Do not include any price figures, `"tokens"`, or `"via SPT"` in any tool description.
- Do not render `quotable: false` voices or Human Agent `perspectives` inside quotation marks (`"..."`).
- Do not emit unescaped bare `$` signs or em dashes in formatted markdown.

---

## 5. Definition of Done

- [ ] `get_intelligence_dossier` supports `editorial_mode` (`'blueprint' | 'full' | 'none'`) and `publication_style` (`'psfk_weekly' | 'retail_innovation_week'`).
- [ ] All 5 beats (`1.` through `5.`) plus `### Query Fodda` render cleanly in both `blueprint` and `full` modes.
- [ ] Tool count in `fodda-mcp` remains unchanged.
- [ ] `npm run build` and tests pass.
- [ ] `CHANGELOG.md` updated.
