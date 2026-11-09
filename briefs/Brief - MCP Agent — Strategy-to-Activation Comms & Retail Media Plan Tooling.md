# Brief (MCP Agent) — Strategy-to-Activation Brand Connections Plan & Sports/Streaming Media Rights Tooling

**Target Repo:** `Fodda MCP` (`fodda-mcp`)  
**Target Files:** `src/toolHandlers.ts`, `src/toolsManifest.ts`, `CHANGELOG.md`  
**Execution Handle:** `/build-from-brief "briefs/Brief - MCP Agent — Strategy-to-Activation Comms & Retail Media Plan Tooling.md"`  
**Priority:** High (Agency Connections Planner, Media Buyer & Brand-Entertainment Workflow)  
**Date:** 2026-10-30  
**Prepared by:** API Agent  
**Related Documents:**
- Production Backend Endpoints: `POST /v1/planning/comms-plan`, `GET /v1/planning/sports-media-rights`, and `GET /v1/planning/shopper-taxonomy`
- Live Production Revision: `fodda-api-new-00794-njf` (`https://api.fodda.ai`)
- Showcase Reference Dossiers: `artifacts/comms_plans/on_running_comms_plan.md`, `olipop_comms_plan.md`, `cava_comms_plan.md`

---

## 1. Context & Business Goal

Fodda API has upgraded and deployed the **Strategy-to-Activation Brand Connections Planning Engine** (`fodda-api-new-00794-njf`).

Rather than a tactical ad-tech buy sheet, `POST /v1/planning/comms-plan` now generates an agency-grade **7-Section Brand Connections Plan** (`output_classification: "STRATEGIC CONNECTIONS PLAN"`) paired with an isolated **Appendix A** for the media buyer and producer:
1. **Section 1 — The Audience & Human Tension:** Defines who they are, backs the human tension with a named Fodda cultural insight and `[EVID-xxx]` citations, and maps Category Entry Points (CEPs).
2. **Section 2 — The Idea or Concept:** Brand-specific creative organizing platform and behavioral elaboration.
3. **Section 3 — Connection Points:** Context-first cultural rituals and moments with named partner candidates, governed by a strict runtime **Evidence Ledger Gate** (`[LIVE]` when backed by live runtime records vs. automatic downgrade to `[CAPABILITY]` or `[UNVERIFIED]` when runtime queries return 0 records or rest on static platform docs), plus an original **Signature Flagship Activation**.
4. **Section 4 — Role of Each Connection:** Behavioral job to be done (`Start the Conversation`, `Deepen the Connection`, `Drive Action`) without artificial 60/40 budget splits.
5. **Section 5 — Retail and Commerce Connections:** Category-adaptive transaction environments, ledger-governed digital shelf diagnostics (Amazon/Walmart for CPG/footwear; local delivery marketplaces & order-ahead app pickup for fast-casual dining), and shopper archetypes.
6. **Section 6 — Priorities, Trade-offs & Deliberate Omissions:** Foundational priorities, deduplicated deliberate omissions table, and `Section 6.3 Strategic Activation Hypotheses`.
7. **Section 7 — Evidence & Confidence Provenance:** Dynamic brand-scoped provenance table (`[LIVE]`, `[CAPABILITY]`/`[MODELED]`, `[UNVERIFIED]`/`[JUDGMENT]`) and the 1-to-1 **System-Issued Runtime Evidence Ledger (`EVID-xxx`)**.
8. **Appendix A — Optional Media Buyer & Producer Reference:** Isolates all IAB Content 3.0 / Audience 1.1 codes, RMN segment strings, lookback windows, pixel/duration ad specs, CPC/CPM/eCPM bid mechanics, per-connection buyer verification checklists, and **Appendix A.4 Official Live Sports & Tentpole Broadcast/Streaming Rights (`FIRST_PARTY_PUBLIC_RIGHTS_GROUND_TRUTH`)** (NFL through 2033, NBA 2025–2036, MLB through 2028, NHL through 2028, and Endurance/Olympics on NBCU/Peacock through 2032).

---

## 2. Requirements & Implementation Guidelines (Fodda MCP)

### 2.1 Tool Surface & Registration (`Consolidate, don't multiply`)
- Update `generate_comms_plan` in `src/toolsManifest.ts` and `src/toolHandlers.ts`:
  - **Tool Description:**  
    *"Generate an agency-grade 7-section Strategy-to-Activation Brand Connections Plan from cultural insights, brand objectives, and live supplemental signals. Produces (1) Audience & Human Tension, (2) The Organizing Idea, (3) Contextual Connection Points with named partners and a Signature Flagship Activation, (4) Role of Each Connection, (5) Retail & Commerce Connections, (6) Priorities & Deliberate Omissions, (7) a 1-to-1 Runtime Evidence Ledger ([LIVE] vs [CAPABILITY] vs [UNVERIFIED]), and Appendix A isolating buyer ad specs, IAB/RMN taxonomies, verification checklists, and Official US Sports & Streaming Media Rights ground-truth. Also supports `view: 'sports_media_rights'` to query verified US major league & tentpole broadcast/streaming rights directly."*
  - **Parameters:**
    - `query` (`string`, **required**): The trend, category, brand challenge, or league/sport (e.g., *"Gen Z social running clubs"*, *"prebiotic functional soda"*, *"NBA streaming rights"*).
    - `brand` (`string`, optional): Target brand name (e.g., *"On Running"*, *"Olipop"*, *"Cava"*). Defaults to `"Brand"`.
    - `budget_tier` (`string`, optional, enum: `["emerging", "growth", "scale"]`): Defaults to `"growth"`.
    - `markets` (`string[]`, optional): Focus geographic markets (e.g., `["US"]`, `["UK"]`).
    - `view` (`string`, optional, enum: `["full_plan", "sports_media_rights"]`): Defaults to `"full_plan"`. When `"sports_media_rights"`, routes to `GET /v1/planning/sports-media-rights`.

### 2.2 Outbound API Execution
- All calls must use `callFoddaAPI()` with HMAC-SHA256 signing via `FODDA_MCP_SECRET`:
  - When `view === "sports_media_rights"`: call `GET /v1/planning/sports-media-rights?query=${encodeURIComponent(query)}`.
  - Default (`view === "full_plan"`): call `POST /v1/planning/comms-plan` with `{ query, brand, budget_tier, markets }`.

### 2.3 Response Formatting
- Return the complete `markdown` Connections Plan (including Sections 1–7 and Appendix A) without truncation, accompanied by the structured JSON fields (`output_classification`, `sports_and_tentpole_media_rights`, `platform_integration_backlog`, `retail_media_shelf`, and `activation_manifest`).

### 2.4 House Rules Invariants
- **Airtable Pricing Authority:** Quote the exact published USD price from Airtable if any price appears in the tool description; never mention tokens or SPT rates.
- **No bare dollar signs in Markdown:** Preserve the API's KaTeX-safe currency formatting (`dollars` or `\$`).

---

## 3. Verification & Acceptance Tests

1. **Compilation:** Run `npm run build` in `Fodda MCP` and verify 0 TypeScript errors.
2. **Live Execution Test:**
   - Call `generate_comms_plan` with `{ query: "Gen Z social running clubs and marathon training footwear", brand: "On Running" }` and verify it returns the 7-section `STRATEGIC CONNECTIONS PLAN` markdown, `Appendix A`, `sports_and_tentpole_media_rights`, and the 10-row `evidence_ledger` (including `EVID-TRK-01`).
   - Call `generate_comms_plan` with `{ query: "NBA", view: "sports_media_rights" }` and verify it returns the 2025–2036 NBA rights ground-truth and `entertainment_and_audience_integration_backlog`.
3. **Documentation:** Update `CHANGELOG.md` in `Fodda MCP`.
