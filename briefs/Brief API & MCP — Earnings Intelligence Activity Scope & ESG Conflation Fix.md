# Brief: Earnings Intelligence Activity Scope & ESG Conflation Fix

**To:** Fodda API Agent (`api-agent`), Fodda MCP Agent (`mcp-agent`)  
**From:** PSFK Ingestion Agent (`fodda-psfk`)  
**Date:** 2026-09-24  
**Type:** API & MCP Feature Enhancement / Search Disambiguation  
**Status:** Ready for Build  
**Files Expected to Change:**
- **Fodda API:**
  - `Fodda/functions/v1/supplemental/supplementalRouter.ts`
  - `Fodda/functions/v1/supplemental/earningsCallClient.ts`
  - `Fodda/functions/openapi/openapi.json`
  - `Fodda/functions/openapi/openapi.yaml`
  - `CHANGELOG.md`
- **Fodda MCP:**
  - `src/toolHandlers.ts` (`get_earnings_intelligence` schema & description)
  - `tools-manifest.json`
  - `CHANGELOG.md`

---

## 1. Context & Problem Statement

Tyler / Datastreamer tested the query:  
> *"What sustainability commitments did apparel companies make this quarter?"* (with Nike as an example)

### The Issues Encountered:
1. **Search Conflation (Financial vs ESG Sustainability):**  
   In `Fodda API/Fodda/functions/v1/supplemental/earningsCallClient.ts:121-130`, a search for `"sustainability commitments"` splits words and matches:
   ```cypher
   any(w IN $queryWords WHERE toLower(coalesce(e.summary, "")) CONTAINS w OR toLower(coalesce(e.title, "")) CONTAINS w)
   ```
   Because it checks `any(...)`, it matches any `EarningsEvidence` node (analyst Q&A, CFO statements) containing the word `"sustainability"`. On earnings calls, the overwhelming majority of analyst questions use "sustainability" to probe **financial durability** (e.g. *"Is China growth sustainable?"*, *"Are 60%+ gross margins sustainable in light of tariffs?"*). The search returns analyst margin questions rather than corporate ESG commitments.

2. **Target Node Mismatch:**  
   Strategic corporate activities extracted by the quarterly pipeline are stored in Neo4j as:
   ```cypher
   (ea:EarningsActivity {activityType: 'sustainability', ticker: ..., period: ...})
   ```
   and in Airtable truth layer (`tblwSVAoulbxByYtS`) under `Sustainability Activity`.  
   However, `fetchEarningsCallSnapshot` in `earningsCallClient.ts` only queries `(e:EarningsEvidence)`. It does not query `EarningsActivity` nodes.

3. **Confirmed Absence Handling (Now Live in Airtable):**  
   The ingestion pipeline has now standardized absences: when a company did not discuss ESG on a call, the Airtable field contains:
   `"No ESG or sustainability initiatives were discussed by management on this call."`  
   Calls that *did* announce commitments (e.g. Under Armour's NEOLAST recyclable stretch fiber, On Holding's LightSpray low-CO2 technology, Hermès decarbonization) have rich substantive text.

---

## 2. What to Build

### Option 1 (Primary & Deterministic): Add `activity` parameter to API & MCP

Add an optional `activity` filter parameter across `get_earnings_intelligence` and `GET /v1/supplemental/earnings/snapshot`:
* **Type:** `'sustainability' | 'marketing' | 'retail' | 'technology'`
* **Behavior when provided:**
  * Restricts results to strategic corporate activities of that specific type.
  * In Neo4j, queries `(ea:EarningsActivity {activityType: $activity})` (and/or pulls from the canonical truth layer `Sustainability Activity` / `Marketing Activity` / etc.).
  * Skips generic Q&A analyst evidence containing financial keywords.
  * Deterministic and machine-friendly for Boolean-style pipelines (Datastreamer).

### Option 2 (Human Query Guard / Intent Routing):
If `!activity` is provided, but `search` contains unambiguous ESG markers:
* **Single words:** `"esg"`, `"circular"`, `"carbon"`, `"net zero"`.
* **Multi-word phrases ONLY:** `"climate change"`, `"climate goals"`, `"sustainability commitments"`, `"esg commitments"`, `"carbon footprint"`, `"renewable energy"`.
* *NOTE: Do NOT match standalone single-words "climate" (which collides with "promotional climate", "consumer climate", "macro climate") or "commitments" (which collides with "capital commitments", "debt commitments").*
* When an ESG marker triggers:
  * Automatically route query scope to `activity: 'sustainability'` (or prioritize `EarningsActivity`).
  * **Honesty Pattern:** Flag the inferred routing in response metadata: set `activity_inferred: "sustainability"` (e.g., in `snapshot.filters` or `_meta`), exactly like `sector_resolution` and `degraded: true` on other endpoints.

### Option 3 (Explicit Absence Signal):
When `activity: 'sustainability'` is requested and no initiatives were found for the company/ticker:
* Do NOT return an ambiguous empty array `[]` that looks like an unindexed company or broken query.
* Return an explicit `no_activity_found: true` (or `activity_status: 'absent'`) alongside the confirmed message:
  `"No ESG or sustainability initiatives were discussed by management on this call."`
* This mirrors the `no_convergence_found` pattern on `/v1/earnings/divergence` and turns executive silence into an actionable, confident signal for fashion clients.

---

## 3. Implementation Details

### A. Fodda API (`earningsCallClient.ts`, `supplementalRouter.ts`, & OpenAPI)
1. In `EarningsCallQuery` interface:
   ```typescript
   export interface EarningsCallQuery {
       ticker?: string;
       brand?: string;
       industry?: string;
       sector?: string;
       search?: string;
       activity?: 'sustainability' | 'marketing' | 'retail' | 'technology';
       activityInferred?: string;
       dateFrom?: string;
       dateTo?: string;
       limit?: number;
       // ...
   }
   ```
2. In `supplementalRouter.ts` (`GET /v1/supplemental/earnings/snapshot`):
   * Extract `req.query.activity` and forward into `queryParams`.
   * If `!req.query.activity` and `search` matches an ESG marker phrase/word, set `queryParams.activity = 'sustainability'` and record `queryParams.activityInferred = 'sustainability'`.
   * In response JSON: surface `activity_inferred: queryParams.activityInferred ?? null` and `no_activity_found: boolean`.
3. In `buildEarningsQuery` (`earningsCallClient.ts`):
   * When `activity` is set:
     ```cypher
     MATCH (ea:EarningsActivity)-[:ACTIVITY_FOR]->(b:Brand)
     WHERE ea.activityType = $activity
       AND NOT ea.theme STARTS WITH "No ESG or sustainability initiatives were discussed"
       AND ($sectorTickers IS NULL OR ea.ticker IN $sectorTickers)
       AND ($ticker IS NULL OR ea.ticker = $ticker)
       ...
     RETURN ea.theme AS summary, ea.activityType AS psfk_type, ea.ticker AS ticker, ...
     ```
4. In `Fodda/functions/openapi/openapi.json` & `openapi.yaml`:
   * Document `activity` query parameter with enum values: `sustainability`, `marketing`, `retail`, `technology`.

### B. Fodda MCP (`src/toolHandlers.ts` & `tools-manifest.json`)
1. In `get_earnings_intelligence` definition:
   ```typescript
   activity: z.enum(['sustainability', 'marketing', 'retail', 'technology']).optional().describe(
       "Scope query to a corporate strategic activity category. Use 'sustainability' for corporate ESG, circular economy, and climate initiatives (avoids conflation with analyst margin sustainability questions)."
   ),
   ```
2. Update tool description to mention `activity`:
   * Explain that `activity` scopes results to confirmed management strategic initiatives and prevents conflation with analyst financial questions.
3. Forward `activity` as a URL query param to `/v1/supplemental/earnings/snapshot`.
4. Regenerate `tools-manifest.json`.

---

## 4. Verification Steps

1. `GET /v1/supplemental/earnings/snapshot?sector=apparel&activity=sustainability` returns corporate ESG initiatives (e.g. Under Armour recyclable fibers, On Holding LightSpray) and excludes analyst questions on margin sustainability.
2. In MCP: `get_earnings_intelligence({ sector: "apparel", activity: "sustainability" })` returns corporate ESG commitments.
3. For companies that did not discuss ESG (e.g. Nike Q4 2026), returns `no_activity_found: true` with the standardized absence statement.
4. Natural language query `search: "sustainability commitments"` without `activity` triggers `activity_inferred: "sustainability"` in metadata.
5. OpenAPI spec and `tools-manifest.json` properly document `activity`.
6. Update `CHANGELOG.md` in both repositories.
