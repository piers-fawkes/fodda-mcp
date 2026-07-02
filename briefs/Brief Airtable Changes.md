# Brief: Airtable Changes — API Call Billing Transition

**Date:** 2026-04-26  
**For:** Piers (manual Airtable work)  
**Base:** `appXUeeWN1uD9NdCW`  
**Time estimate:** ~45 minutes total

---

## Step 1: Create "Query Pricing" Table (NEW)

Create a new table in the Fodda base called **Query Pricing**.

### Fields to Create

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | `queryTypeCode` | **Single line text** (primary field) | Machine-readable code |
| 2 | `queryTypeName` | Single line text | Human-readable name |
| 3 | `apiCallsCharged` | Number (integer) | What we charge the user |
| 4 | `researchCalls` | Number (integer) | Internal research API calls |
| 5 | `overheadCalls` | Number (integer) | Internal overhead API calls |
| 6 | `totalInternalCost` | **Formula** | `{researchCalls} + {overheadCalls}` |
| 7 | `margin` | **Formula** | `{apiCallsCharged} - {totalInternalCost}` |
| 8 | `marginPct` | **Formula** | `IF({apiCallsCharged} > 0, ROUND(({apiCallsCharged} - {totalInternalCost}) / {apiCallsCharged} * 100, 0) & "%", "free")` |
| 9 | `mcpToolName` | Single line text | Which MCP tool triggers this |
| 10 | `meterInteractionType` | Single line text | Maps to `/v1/research/meter` type |
| 11 | `description` | Long text | What this query does |
| 12 | `isActive` | Checkbox | Uncheck to disable |
| 13 | `includesSupplementals` | Checkbox | Supplementals bundled in price |
| 14 | `absorbsGeminiCost` | Checkbox | Fodda absorbs Gemini cost |
| 15 | `notes` | Long text | Internal pricing notes |

### Records to Enter

Copy these rows exactly:

| queryTypeCode | queryTypeName | apiCallsCharged | researchCalls | overheadCalls | mcpToolName | meterInteractionType | isActive | includesSupp | absorbsGemini |
|--------------|---------------|-----------------|---------------|---------------|-------------|---------------------|----------|-------------|---------------|
| topic_research | Topic Research | 15 | 8 | 3 | search_graph | | ✅ | ✅ | ❌ |
| brand_intelligence | Brand Intelligence Tracker | 20 | 10 | 3 | brand_tracker | | ✅ | ✅ | ❌ |
| weekly_tracker | Weekly Tracker | 20 | 12 | 3 | manage_scheduled_reports | scheduled_analyst | ✅ | ✅ | ❌ |
| deep_research_light | Deep Research (Light) | 20 | 10 | 3 | deep_research_topic | deep_dive_fast | ✅ | ✅ | ✅ |
| deep_research_heavy | Deep Research (Heavy) | 30 | 15 | 3 | deep_research_topic | deep_dive_comprehensive | ✅ | ✅ | ✅ |
| brainstorm | Brainstorm | 15 | 8 | 3 | brainstorm_topic | | ✅ | ❌ | ❌ |
| url_as_prompt | URL as Prompt | 15 | 10 | 3 | read_url | url_context | ✅ | ✅ | ✅ |
| upload_compare | Upload & Compare | 20 | 8 | 3 | search_graph | | ✅ | ✅ | ❌ |
| visual | Visual Intelligence | 0 | 0 | 0 | generate_visual | | ✅ | ❌ | ❌ |
| admin | Account / Admin | 0 | 0 | 0 | get_my_account | | ✅ | ❌ | ❌ |
| standalone_supplemental | Standalone Supplemental | 5 | 5 | 0 | get_supplemental_context | | ✅ | ❌ | ❌ |
| standalone_evidence | Evidence Lookup | 5 | 1 | 0 | get_evidence | | ✅ | ❌ | ❌ |
| standalone_statistics | Statistics Search | 5 | 1 | 0 | search_statistics | | ✅ | ❌ | ❌ |
| research_chat | Research Chat | 3 | 2 | 1 | | research_chat | ✅ | ❌ | ❌ |
| expert_agent | Expert Agent | 5 | 4 | 1 | | expert_agent | ✅ | ❌ | ❌ |

After creating, note the **Table ID** — the MCP needs it as the `PRICING_TABLE_ID` environment variable to fetch live pricing.

---

## Step 2: Add Fields to Token Log (`tblOBEs9DLZBcL74O`)

Add these new fields to the existing table:

| # | Field Name | Type | Notes |
|---|-----------|------|-------|
| 1 | `taskType` | Single line text | Values: `topic_research`, `brand_intelligence`, etc. The API agent's code already writes this. |
| 2 | `sessionId` | Single line text | MCP session ID — groups entries from one conversation |
| 3 | `graphsSearched` | Single line text | Comma-separated graph IDs |
| 4 | `graphCount` | Number (integer) | How many graphs were searched |
| 5 | `tokenSource` | Single select | Options: `plan_included`, `bonus_topup` |

---

## Step 3: Rename Token Log Display Name

- Table display name: **"Token Log"** → **"API Call Log"**
- Field `billableUnits` display: → **"API Calls Charged"** (keep internal field name `billableUnits`)

⚠️ **Do NOT rename the internal field name** — rollups in Accounts and Users depend on it.

---

## Step 4: Add Views to API Call Log

| View Name | Group By | Filter | Purpose |
|-----------|----------|--------|---------|
| By Query Type | `taskType` | — | Usage by feature |
| Revenue This Month | — | `billableUnits > 0` AND timestamp this month | Billing |
| Scheduled Runs | — | `Source = scheduled` | Weekly tracker monitoring |
| MCP Passthrough | — | `Source = mcp_passthrough` | Zero-cost MCP visibility rows |

---

## Step 5: Rename Account Table Display Names (`tblt6mh0XQOablFDX`)

Display-only renames — keep internal field names:

| Current Display | New Display |
|----------------|-------------|
| monthlyQueryLimit | **Monthly API Calls** |
| queriesUsedThisCycle | **API Calls Used This Cycle** |
| availableQueries | **API Calls Remaining** |
| bonusTokens | **Bonus API Calls** |

---

## Step 6: Rename Plans Table Display Names (`tblq2T5OUyrDFCda9`)

| Current Display | New Display |
|----------------|-------------|
| Monthly Token Limit (or similar) | **Monthly API Calls** |

Update plan descriptions to reference "API calls" instead of "tokens."

---

## Step 7: Connect Tables (Optional but Recommended)

Link the Query Pricing table to the API Call Log:
- In API Call Log, add a **Link to Query Pricing** field that connects via `taskType` ↔ `queryTypeCode`
- This enables rollup views like "total API calls charged by query type this month"

---

## After Airtable Changes

Once the Query Pricing table is created:
1. Copy the **Table ID** from the Airtable URL (it's the `tbl...` part)
2. Set these environment variables on the MCP server:
   - `PRICING_TABLE_ID=tblXXXXXX` (the new table ID)
   - `AIRTABLE_API_KEY=pat...` (your Airtable personal access token)
3. On next MCP deploy, it will start reading live pricing from Airtable instead of hardcoded defaults
