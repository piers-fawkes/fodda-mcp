# Brief (MCP Agent) — Macro Series Precision, Retail Sales Labeling & Monthly PCE Tool Guidance

**Target Repo:** `Fodda MCP`  
**Target Files:** `src/toolHandlers.ts`, `CHANGELOG.md`  
**Execution Handle:** `/build-from-brief "briefs/Brief - MCP Agent — Macro Series Precision, Retail Sales Labeling & Monthly PCE Tool Guidance.md"`  
**Priority:** High (Foundation Model Prompt & Semantic Routing Alignment)  
**Date:** 2026-10-12  
**Prepared by:** API Agent  
**Related Documents:**
- API Source Brief: `briefs/Brief - Government Data Series Precision, Retail Sales Labeling & Monthly PCE (API Agent).md`
- Live Production Revision: `fodda-api-new-00764-zjx` (`https://api.fodda.ai`)
- API CHANGELOG: Entry for 2026-10-12 (`censusClient.ts`, `fredClient.ts`, `beaClient.ts`, `unifiedContextHandler.ts`)

---

## 1. Context & Problem

John Farrall audited Fodda's macroeconomic data outputs:
> *"Getting jobs, prices and spending in one question with series IDs saves real time. Two fixes: label the retail series correctly, and pull monthly PCE instead of a broken quarterly table."*

The Fodda API has resolved both issues in production (`fodda-api-new-00764-zjx`):
1. **Retail Sales Disambiguation:**
   - **Headline Retail Sales:** NAICS `44X72` / FRED `RSAFS` (~$737.8B in August 2026, Retail and Food Services).
   - **Retail Trade Excl. Food Services:** NAICS `44000` / FRED `RSXFS` (~$646.3B in August 2026).
   - The API now returns both objects (`headline_retail_and_food_services` and `retail_trade_ex_food_services`) with explicit definitions and series IDs.
2. **Monthly Consumer Spending (PCE):**
   - Switched from stale quarterly NIPA Table T20405 to live Monthly PCE via BEA Table `T20805` and FRED series `PCE`, `PCEDG`, `PCEND`, `PCES`, reporting through August 2026 (~$22,308.5B) with MoM (+0.9%) and YoY (+6.1%) percentage changes.

Downstream LLMs (Claude, ChatGPT, Copilot) consuming Fodda MCP tools need explicit cues in `get_supplemental_context` tool descriptions so they:
- Do not cite ex-food retail sales ($646B) as the headline retail figure.
- Cite the official headline figure ($738B, `RSAFS`) and clarify when citing ex-food ($646B, `RSXFS`).
- Leverage live monthly PCE ($22.3T, August 2026) rather than referencing lagged Q2 quarterly totals.

---

## 2. Required Changes in `Fodda MCP`

### 2.1 Update `get_supplemental_context` Description in `src/toolHandlers.ts`

Ensure the tool parameter documentation and description for `get_supplemental_context` explicitly highlights:
- `census_retail` & `fred_economic`: Disambiguates Advance Retail Sales between Headline Retail & Food Services (`RSAFS`, ~$738B) and Retail Trade Excl. Food Services (`RSXFS`, ~$646B).
- `bea_spending`: Live Monthly PCE (`PCE`, Table T20805, ~$22.3T through August) with MoM and YoY growth rates.

### 2.2 Update Response Schema Normalization (if applicable)

If `toolHandlers.ts` or response formatters unpack `census_retail` or `bea_spending`:
- Project `headline_retail_and_food_services` and `retail_trade_ex_food_services` into human-readable tables.
- Project `total_pce_billions`, `mom_change_pct`, and `yoy_change_pct` into consumer spending tables.

---

## 3. Verification & Acceptance Criteria

1. **Build Check:** Run `npm run build` in `Fodda MCP` and verify 0 TypeScript errors.
2. **Tool Output Test:** Run a test query for US retail sales and consumer spending via MCP, verifying that the returned summary quotes `$737.8B` as the headline retail figure and `$22.3T` (August 2026) as total PCE.
3. **CHANGELOG:** Update `CHANGELOG.md` in `Fodda MCP` recording macro series precision alignment.
