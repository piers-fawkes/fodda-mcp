# Brief (MCP Agent) — Earnings Tool Parameter Binding & Payload Hygiene

> **Status:** Ready for Execution  
> **Target Agent:** `MCP Agent`  
> **Repo:** `fodda-mcp` (`~/Documents/Fodda MCP`)  
> **Handle:** `/build-from-brief "briefs/Brief MCP — Earnings Tool Parameter Binding & Payload Hygiene.md"`

---

## 1. Context & Objectives

A live QA audit on MCP `v1.46.63` / API `fodda-api-new-00661-pdk` revealed parameter mismatches, payload hygiene vulnerabilities, and inconsistent pricing display across MCP tools:

1. **`get_validated_trends` drops search terms:**
   - In `src/toolHandlers.ts` (~line 3754), `search` is set as `params.set('search', search)`. However, the API route expects `query`. As a result, search terms are dropped and return full unfiltered lists.
2. **Instruction-shaped text injected into data payloads (Prompt Injection Risk):**
   - `get_validated_trends` appends `[Fodda House Visual Recipe v2.2]` (`FODDA_HOUSE_VISUAL_RECIPE_V2_2`) to tool returns.
   - Consult responses append `--- SPEAKER NOTE: ... ---` directly to returned prose. Downstream LLMs treat these directives as prompt-injection directives rather than clean data.
3. **Pricing & Usage display inconsistency:**
   - Tool calls bill metered units while descriptions or embedded metadata quote legacy token terminology (`"1 token ($0.50)"`). Per Fodda House Rules, tokens/SPT must never be visible to humans or makers; published USD prices from Airtable must be quoted.
4. **`search_graph` response formatting:**
   - As API Agent adds inline `earnings_corroboration` to trend objects, MCP's `search_graph` tool handler must preserve and render this corroboration cleanly.

---

## 2. Changes Required in `Fodda MCP`

### A. Fix Parameter Binding in `get_validated_trends` (`src/toolHandlers.ts`)

In `src/toolHandlers.ts` (~line 3751):
```typescript
const params = new URLSearchParams();
if (ticker) params.set('ticker', ticker);
if (sector) params.set('sector', sector);
if (search) {
    params.set('search', search);
    params.set('query', search); // Ensure API route binding regardless of param alias
}
if (limit !== undefined) params.set('limit', String(Math.min(limit, 50)));
```

### B. Strip Instruction-Shaped Text from Tool Payloads (`src/toolHandlers.ts`)

1. **Remove `FODDA_HOUSE_VISUAL_RECIPE_V2_2` from `get_validated_trends`:**
   In `src/toolHandlers.ts` (~line 3766–3771):
   ```typescript
   // BEFORE:
   return {
       content: [
           { type: 'text' as const, text: JSON.stringify(data, null, 2) },
           { type: 'text' as const, text: FODDA_HOUSE_VISUAL_RECIPE_V2_2 },
       ]
   };

   // AFTER: Tool payload contains data only
   return {
       content: [
           { type: 'text' as const, text: JSON.stringify(data, null, 2) }
       ]
   };
   ```

2. **Sanitize Consult Response Text (`src/toolHandlers.ts` ~lines 4886 & 5125):**
   Remove free-text `parts.push('--- SPEAKER NOTE: ... ---')`.
   If speaker notes are required by the caller, expose them as a structured field in the response JSON or metadata object, not free-text instructions in the prose body.

### C. Reconcile Pricing Display & Billing Blocks

1. **Tool Description & Cost Hints:**
   - Confirm `get_validated_trends` tool description displays published USD pricing from Airtable ($25).
   - Ensure no human-visible string uses the words "token", "tokens", or "via SPT".
2. **Preserve Billing Blocks:**
   - In consult and search handlers, pass through the new `billing` / `usage` block from the API response so callers see their billed units.

### D. Format Inline Earnings Corroboration in `search_graph`

In `src/toolHandlers.ts` (~line 1250+):
- When formatting trends returned from the API, check for `earnings_corroboration` on each trend.
- Format inline corroboration with executive attribution (e.g. `"[Earnings Call Corroboration]: <Speaker> (<Title>): \"<Quote>\" (<Period>)"`) so consuming agents see the corroboration immediately without making extra round-trips.

---

## 3. Files Expected to Change

- `src/toolHandlers.ts` (query binding in `get_validated_trends`, strip visual recipe & speaker notes, surface inline earnings corroboration in `search_graph`, pass through billing blocks)
- `tools-manifest.json` (if descriptions or schema annotations are refreshed)
- `CHANGELOG.md` (document MCP tool hygiene and parameter alignment)

---

## 4. Verification Steps

1. **Parameter Binding Test:**
   - Call `get_validated_trends` with `search: "resale"`: verify the API returns filtered rows matching "resale" and `filters.query` echoes `"resale"`.
2. **Payload Cleanliness Test:**
   - Call `get_validated_trends`: verify output contains ONLY the data JSON, with no trailing `[Fodda House Visual Recipe v2.2]`.
   - Call `consult_analyst`: verify output contains NO `--- SPEAKER NOTE: ... ---` strings.
3. **Inline Corroboration Test:**
   - Call `search_graph` with a beauty query: verify trends display attached earnings corroboration with named executive quotes.
