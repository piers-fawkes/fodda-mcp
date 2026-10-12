# Brief — Align Pricing Cache Tool Costs with Authoritative API Rates (MCP Agent)

**For:** MCP Agent (`Fodda MCP`)  
**Priority:** High (Customer-facing pricing mismatch & quota scare bug)  
**Date:** 2026-10-12  
**Context:** Live User Testing Feedback & Billing Discrepancy  

---

## 1. Context & Problem Statement

During live testing by user John Farrall (`farrall.john@gmail.com`), an alarming pricing discrepancy was identified:
> *"The price list didn't match what I was charged. When I asked for my account status, it quoted 10 calls for a one-company earnings snapshot, 30 for deep research and 40 for divergence analysis. The Walmart test cost about 1. A new user who sees '40 calls' will get cautious and stop exploring. I'd show the cost before a big call runs, and make the quoted prices match the meter."*

### Root Cause
In `Fodda MCP/src/pricingCache.ts`, the hardcoded `DEFAULT_PRICING` fallback table contains legacy, highly inflated token costs that do not match the live API billing meter:
* `earnings_divergence`: configured with `apiCallsCharged: 40` (Server meter in `metering.ts` charges **1**)
* `deep_research_heavy`: configured with `apiCallsCharged: 30` (Server meter in `metering.ts` charges **10**)
* `earnings_company`: configured with `apiCallsCharged: 10` (Server meter in `metering.ts` charges **1**)
* `earnings_history`: configured with `apiCallsCharged: 10` (Server meter in `metering.ts` charges **1**)
* `brand_intelligence`: configured with `apiCallsCharged: 20` (Server meter in `metering.ts` charges **4**)
* `weekly_tracker`: configured with `apiCallsCharged: 20` (Server meter in `metering.ts` charges **4**)
* `brainstorm`: configured with `apiCallsCharged: 15` (Server meter in `metering.ts` charges **4**)
* `url_as_prompt`: configured with `apiCallsCharged: 15` (Server meter in `metering.ts` charges **1**)
* `upload_compare`: configured with `apiCallsCharged: 20` (Server meter in `metering.ts` charges **4**)

When Claude or another MCP client runs `get_my_account`, the handler calls `getToolCostSummary()`, which surfaces these 40-call and 10-call quotes. The host LLM warns the user that running a divergence query will burn 40 of their 100 monthly calls, chilling usage. Yet when the query actually executes, `/v1/research/meter` on the API debits only 1 call.

---

## 2. Canonical Source of Truth

Per Fodda House Rules, `Fodda API/functions/tracking/metering.ts` (`TOKEN_COSTS`) is the authoritative source for fixed token costs:

| Query Type Code | MCP Tool | API Canonical `TOKEN_COSTS` | Legacy MCP `DEFAULT_PRICING` (Buggy) |
| :--- | :--- | :---: | :---: |
| `earnings_divergence` | `get_earnings_divergence` | **1** | ~~40~~ |
| `earnings_company` | `get_company_earnings` (mode: snapshot) | **1** | ~~10~~ |
| `earnings_history` | `get_company_earnings` (mode: history) | **1** | ~~10~~ |
| `earnings_qa` | `get_company_earnings` (mode: qa) | **1** | 5 |
| `earnings_compare` | `get_company_earnings` (mode: compare) | **2** | 20 |
| `earnings_intelligence` | `get_earnings_intelligence` | **1** | 5 |
| `deep_research_light` | `deep_research_topic` (mode: light) | **5** | 20 |
| `deep_research_heavy` | `deep_research_topic` (mode: heavy) | **10** | ~~30~~ |
| `brand_intelligence` | `brand_tracker` | **4** | ~~20~~ |
| `weekly_tracker` | `manage_scheduled_reports` | **4** | ~~20~~ |
| `brainstorm` | `brainstorm_topic` | **4** | ~~15~~ |
| `url_as_prompt` | `read_url` | **1** | ~~15~~ |
| `upload_compare` | `search_graph` (mode: compare) | **4** | ~~20~~ |
| `human_agent_consult` | `consult_human_agent` | **1** | 1 |
| `standalone_supplemental` | `get_supplemental_context` | **2** | 5 |
| `standalone_evidence` | `get_evidence` | **1** | 5 |
| `standalone_statistics` | `search_statistics` | **1** | 5 |
| `topic_research` | `search_graph` | **1** | 1 |

---

## 3. Scope of Work (MCP Agent)

### A. Update `src/pricingCache.ts`
1. Update `DEFAULT_PRICING` in `Fodda MCP/src/pricingCache.ts` to match the canonical `TOKEN_COSTS` figures above.
2. In `fetchFromAirtable()` (if active), ensure fallback values and record mappings align.
3. Verify that `getToolCostSummary()` returns these corrected numbers.

### B. Verify `get_my_account` Output
* Run tests to ensure `get_my_account` returns `query_costs` where:
  * `Earnings Divergence & Deflection` = 1 API call
  * `Per-Ticker Earnings Snapshot` = 1 API call
  * `Deep Research (Heavy)` = 10 API calls
  * `Brand Intelligence Tracker` = 4 API calls

### C. Run Verification Tests & Update Changelog
* Run `npm test` in `Fodda MCP`.
* Update `CHANGELOG.md` in `Fodda MCP` documenting the alignment with API `metering.ts`.

---

## 4. Definition of Done
* [ ] `Fodda MCP/src/pricingCache.ts` updated to match `TOKEN_COSTS` from `Fodda API/functions/tracking/metering.ts`.
* [ ] Zero occurrences of inflated 40-call or 10-call quotes for 1-call tools in `pricingCache.ts`.
* [ ] `npm test` in `Fodda MCP` passes cleanly.
* [ ] `CHANGELOG.md` updated with verification evidence.
