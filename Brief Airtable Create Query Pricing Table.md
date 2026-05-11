# Task: Create "Query Pricing" Table in Airtable

**Base ID:** `appXUeeWN1uD9NdCW`  
**New Table Name:** `Query Pricing`

---

## Instructions

### Step 1: Create the table

Create a new table called `Query Pricing` in base `appXUeeWN1uD9NdCW`.

### Step 2: Create these fields (in this exact order)

**Field 1 — Primary field (rename the default):**
- Name: `queryTypeCode`
- Type: Single line text
- This is the primary field. Rename the auto-created "Name" field to `queryTypeCode`.

**Field 2:**
- Name: `queryTypeName`
- Type: Single line text

**Field 3:**
- Name: `apiCallsCharged`
- Type: Number
- Format: Integer (no decimals)

**Field 4:**
- Name: `researchCalls`
- Type: Number
- Format: Integer (no decimals)

**Field 5:**
- Name: `overheadCalls`
- Type: Number
- Format: Integer (no decimals)

**Field 6:**
- Name: `totalInternalCost`
- Type: Formula
- Formula: `{researchCalls} + {overheadCalls}`

**Field 7:**
- Name: `margin`
- Type: Formula
- Formula: `{apiCallsCharged} - {totalInternalCost}`

**Field 8:**
- Name: `marginPct`
- Type: Formula
- Formula: `IF({apiCallsCharged} > 0, ROUND(({apiCallsCharged} - {totalInternalCost}) / {apiCallsCharged} * 100, 0) & "%", "free")`

**Field 9:**
- Name: `mcpToolName`
- Type: Single line text

**Field 10:**
- Name: `meterInteractionType`
- Type: Single line text

**Field 11:**
- Name: `description`
- Type: Long text

**Field 12:**
- Name: `isActive`
- Type: Checkbox

**Field 13:**
- Name: `includesSupplementals`
- Type: Checkbox

**Field 14:**
- Name: `absorbsGeminiCost`
- Type: Checkbox

**Field 15:**
- Name: `notes`
- Type: Long text

### Step 3: Add these 15 records

Add each record exactly as specified below. For checkbox fields: ✅ = checked, ❌ = unchecked. Leave blank fields empty.

---

**Record 1:**
- queryTypeCode: `topic_research`
- queryTypeName: `Topic Research`
- apiCallsCharged: `15`
- researchCalls: `8`
- overheadCalls: `3`
- mcpToolName: `search_graph`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ❌

**Record 2:**
- queryTypeCode: `brand_intelligence`
- queryTypeName: `Brand Intelligence Tracker`
- apiCallsCharged: `20`
- researchCalls: `10`
- overheadCalls: `3`
- mcpToolName: `brand_tracker`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ❌

**Record 3:**
- queryTypeCode: `weekly_tracker`
- queryTypeName: `Weekly Tracker`
- apiCallsCharged: `20`
- researchCalls: `12`
- overheadCalls: `3`
- mcpToolName: `manage_scheduled_reports`
- meterInteractionType: `scheduled_analyst`
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ❌

**Record 4:**
- queryTypeCode: `deep_research_light`
- queryTypeName: `Deep Research (Light)`
- apiCallsCharged: `20`
- researchCalls: `10`
- overheadCalls: `3`
- mcpToolName: `deep_research_topic`
- meterInteractionType: `deep_dive_fast`
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ✅

**Record 5:**
- queryTypeCode: `deep_research_heavy`
- queryTypeName: `Deep Research (Heavy)`
- apiCallsCharged: `30`
- researchCalls: `15`
- overheadCalls: `3`
- mcpToolName: `deep_research_topic`
- meterInteractionType: `deep_dive_comprehensive`
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ✅

**Record 6:**
- queryTypeCode: `brainstorm`
- queryTypeName: `Brainstorm`
- apiCallsCharged: `15`
- researchCalls: `8`
- overheadCalls: `3`
- mcpToolName: `brainstorm_topic`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 7:**
- queryTypeCode: `url_as_prompt`
- queryTypeName: `URL as Prompt`
- apiCallsCharged: `15`
- researchCalls: `10`
- overheadCalls: `3`
- mcpToolName: `read_url`
- meterInteractionType: `url_context`
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ✅

**Record 8:**
- queryTypeCode: `upload_compare`
- queryTypeName: `Upload & Compare`
- apiCallsCharged: `20`
- researchCalls: `8`
- overheadCalls: `3`
- mcpToolName: `search_graph`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ✅
- absorbsGeminiCost: ❌

**Record 9:**
- queryTypeCode: `visual`
- queryTypeName: `Visual Intelligence`
- apiCallsCharged: `0`
- researchCalls: `0`
- overheadCalls: `0`
- mcpToolName: `generate_visual`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 10:**
- queryTypeCode: `admin`
- queryTypeName: `Account / Admin`
- apiCallsCharged: `0`
- researchCalls: `0`
- overheadCalls: `0`
- mcpToolName: `get_my_account`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 11:**
- queryTypeCode: `standalone_supplemental`
- queryTypeName: `Standalone Supplemental`
- apiCallsCharged: `5`
- researchCalls: `5`
- overheadCalls: `0`
- mcpToolName: `get_supplemental_context`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 12:**
- queryTypeCode: `standalone_evidence`
- queryTypeName: `Evidence Lookup`
- apiCallsCharged: `5`
- researchCalls: `1`
- overheadCalls: `0`
- mcpToolName: `get_evidence`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 13:**
- queryTypeCode: `standalone_statistics`
- queryTypeName: `Statistics Search`
- apiCallsCharged: `5`
- researchCalls: `1`
- overheadCalls: `0`
- mcpToolName: `search_statistics`
- meterInteractionType: *(leave empty)*
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 14:**
- queryTypeCode: `research_chat`
- queryTypeName: `Research Chat`
- apiCallsCharged: `3`
- researchCalls: `2`
- overheadCalls: `1`
- mcpToolName: *(leave empty)*
- meterInteractionType: `research_chat`
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

**Record 15:**
- queryTypeCode: `expert_agent`
- queryTypeName: `Expert Agent`
- apiCallsCharged: `5`
- researchCalls: `4`
- overheadCalls: `1`
- mcpToolName: *(leave empty)*
- meterInteractionType: `expert_agent`
- isActive: ✅
- includesSupplementals: ❌
- absorbsGeminiCost: ❌

---

### Step 4: Verify

After creating all records, confirm:
1. The table has exactly 15 fields (including the primary field)
2. The table has exactly 15 records
3. The formula fields (`totalInternalCost`, `margin`, `marginPct`) compute correctly — e.g. for `topic_research`: totalInternalCost=11, margin=4, marginPct=27%
4. Return the **Table ID** (the `tbl...` value from the Airtable URL) — this is needed as an environment variable for the MCP server
