# Brief: Earnings Intelligence Gap Closures (activity_inferred, confirmed_absent, source_url, UAA ticker)

**To:** Fodda API Agent (`api-agent`), Fodda MCP Agent (`mcp-agent`)  
**From:** PSFK Ingestion Agent (`fodda-psfk`)  
**Date:** 2026-09-24  
**Type:** API & MCP Bug Fix & Response Enrichment  
**Status:** Ready for Build  
**Files Expected to Change:**
- **Fodda API:**
  - `Fodda/functions/v1/supplemental/supplementalRouter.ts`
  - `Fodda/functions/v1/supplemental/earningsCallClient.ts`
  - `Fodda/functions/v1/earnings/earningsRouter.ts`
  - `CHANGELOG.md`
- **Fodda MCP:**
  - `src/toolHandlers.ts`
  - `CHANGELOG.md`

---

## 1. Context & Feedback from End-to-End Testing

Claude tested the live fix for Tyler's test case. The core fix was verified working:
* Auto-routing works ("sustainability commitments" across apparel returns ESG activity instead of analyst margin questions).
* Confirmed absence works on per-ticker queries (Nike returns "No ESG or sustainability initiatives were discussed by management on this call.").

However, 4 specific response gaps were identified that need tightening:

1. **`activity_inferred` missing from response body:**  
   The auto-routing logic triggered correctly, but `activity_inferred: "sustainability"` was not exposed in the returned JSON (neither at top-level nor under `snapshot.filters`). Machine callers cannot tell their query was rerouted.
2. **Cross-company queries drop absences:**  
   When querying across a sector/industry (e.g. `sector=apparel&activity=sustainability`), only companies with active initiatives are returned. Confirmed absences (like Nike and Levi's) are completely omitted. For fashion forecasting, knowing *which brands went quiet* is half the value.
3. **`source_url` is null on sustainability results:**  
   On results returned by `fetchEarningsCallSnapshot`, `source_url` is currently null, even though the underlying truth record and Neo4j node carry the transcript URL. This breaks the "traceable not generated" guarantee.
4. **Sector resolution ticker alias `UAA`:**  
   In `Fodda API/Fodda/functions/v1/earnings/earningsRouter.ts`, `FASHION_TICKERS` includes `UA` but omits `UAA` (Under Armour's primary trading ticker on our DB). Also ensure `apparel` includes activewear/sportswear tickers (`ONON`, `UAA`). Note: Airtable company records for both UAA and ONON have already been updated in the database to include `Fashion & Apparel`.
5. **MCP Schema Deployment:**  
   MCP tool code was updated to `1.46.82`, but callers on Claude need the server process restarted/redeployed to pick up the updated schema.

---

## 2. What to Build

### A. Fodda API (`earningsCallClient.ts`, `supplementalRouter.ts`, `earningsRouter.ts`)

1. **Expose `activity_inferred` in Response:**
   * In `supplementalRouter.ts`: When `resolveEffectiveActivity` infers an activity (e.g. `sustainability`), ensure `activity_inferred: "sustainability"` is included in the response JSON:
     - Top-level `res.json({ ..., activity_inferred: queryParams.activityInferred ?? null, ... })`
     - Inside `snapshot.filters.activity_inferred` and `snapshot.activity_inferred`.

2. **Add `confirmed_absent` to Sector/Multi-Ticker Activity Queries:**
   * When `activity` (or inferred activity) is specified on a cross-company or sector query:
     - Check which resolved tickers in the sector query returned `"No ESG or sustainability initiatives were discussed by management on this call."` (or had no activity).
     - Include a `confirmed_absent` list in the response payload:
       ```json
       "confirmed_absent": [
         { "ticker": "NKE", "company": "Nike, Inc.", "period": "Q4 2026", "status": "No ESG or sustainability initiatives were discussed by management on this call." },
         { "ticker": "LEVI", "company": "Levi Strauss & Co.", "period": "Q2 2026", "status": "No ESG or sustainability initiatives were discussed by management on this call." }
       ]
       ```
     - This gives fashion clients full visibility into both active commitments and confirmed brand silence.

3. **Populate `source_url` on Activity Result Rows:**
   * In `earningsCallClient.ts` (both Cypher and truth-layer fallback), project the transcript URL into `source_url`:
     ```typescript
     source_url: rec.source_url || rec.transcript_url || rec.transcriptUrl || null
     ```
   * Ensure each returned corporate commitment item includes a clickable or valid `source_url`.

4. **Add `UAA` to Canonical Fashion Tickers:**
   * In `earningsRouter.ts`:
     ```typescript
     const FASHION_TICKERS = ['NKE', 'LULU', 'ONON', 'UA', 'UAA', 'RL', 'TPR', 'PVH', 'BURBY', 'HESAY', 'IDEXY', 'SCVL', 'DBI', 'URBN', 'BKE', 'SFIX'];
     ```

### B. Fodda MCP (`src/toolHandlers.ts`)

1. Ensure the `activity` parameter and updated tool description are deployed so client connectors reflect the new schema.
2. Forward `confirmed_absent` in the rendered tool output so agents and humans see both active brands and silent brands.

---

## 3. Verification Steps

1. `GET /v1/supplemental/earnings/snapshot?search=sustainability%20commitments&sector=apparel` returns:
   * `activity_inferred: "sustainability"`
   * Active commitments (e.g. Under Armour, On Holding, Hermès) with non-null `source_url`.
   * `confirmed_absent` containing Nike and Levi's with confirmed absence statements.
2. In MCP: `get_earnings_intelligence({ sector: "apparel", activity: "sustainability" })` displays both active initiatives with source URLs and confirmed absent brands.
3. Update `CHANGELOG.md` in both repositories.
