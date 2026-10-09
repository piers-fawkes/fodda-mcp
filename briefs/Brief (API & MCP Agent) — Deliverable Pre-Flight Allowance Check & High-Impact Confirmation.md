# Brief: API & MCP Agents — Deliverable Pre-Flight Allowance Check & High-Impact Confirmation

> **Priority:** 🔴 Critical / Billing & UX Guardrail  
> **Target Repos:** `Fodda API` & `Fodda MCP`  
> **Target Files:**
> - `Fodda API/Fodda/functions/v1/analysts.ts` (and/or `v1/humanAgents.ts`)
> - `Fodda API/Fodda/functions/tracking/airtable.ts`
> - `Fodda MCP/src/toolHandlers.ts`
> - `CHANGELOG.md` in both repos

---

## 1. Context & Problem Statement

During live testing in Claude on October 7, 2026, an expert user (Carlyn Bushman) commissioned a **Trend Briefing** from Anu Lingala using `request_deliverable`.

### What Went Wrong:
1. **Sudden Allowance Depletion:**
   The deliverable request was executed immediately and billed **80 billable units in a single shot** (logged as `taskType: "skill_deliverable"` in Airtable `Token Log`).
2. **Unexpected Paywall Lockout:**
   The user was on a 100-query daily beta tier. That single 80-unit deliverable consumed 80% of her allowance, instantly locking her account behind the daily limit paywall (*"Add a card to remove the daily limit"*).
3. **Lack of Upfront Visibility & Confirmation:**
   The user had no idea commissioning a deliverable would wipe out nearly their entire daily allowance. There was no pre-flight check to see if they had enough headroom, and no confirmation prompt before debiting 80 units.

---

## 2. Required Architecture & Implementation Details

We are implementing a **Two-Tier Pre-Flight Check** for deliverables:
* **Tier 1 (Hard Block):** If remaining credits/allowance < required units, block immediately with a clear upgrade path.
* **Tier 2 (Confirmation Prompt):** If the user has enough credits, but the deliverable consumes **> 50% of their remaining daily allowance**, pause and require explicit user confirmation before charging.

---

### Part A: Fodda API (`Fodda API/Fodda/functions/v1/analysts.ts` & `humanAgents.ts`)

In `POST /v1/human-agents/:analystId/deliver`:

1. **Calculate Required Units Upfront:**
   Resolve the required billable units for the requested `offering_key` (e.g., Trend Briefing = 80 units, Marketing Plan = 5 units, Deck Review = 20 units).

2. **Inspect User's Remaining Daily Allowance:**
   Fetch the user's `dailyQueriesRemaining` and `availableCredits` from the account cache/Airtable before creating the job or calling `decrementCredits()`.

3. **Check Scenario 1: Insufficient Allowance (`402 Payment Required`)**
   If `requiredUnits > availableUnits` or `requiredUnits > dailyQueriesRemaining`:
   Return HTTP 402:
   ```json
   {
     "error": "insufficient_allowance",
     "code": "INSUFFICIENT_CREDITS",
     "required_units": 80,
     "remaining_units": 50,
     "message": "Commissioning this deliverable requires 80 queries, but you have 50 queries remaining in your daily allowance. Add a card to unlock full access or top up at https://www.fodda.ai/pricing."
   }
   ```

4. **Check Scenario 2: High-Consumption Confirmation (`409 Conflict` / `confirmation_required`)**
   If the user has enough credits, but `requiredUnits >= 40` OR `requiredUnits > (dailyQueriesRemaining * 0.5)`:
   - Check if `req.body.confirm === true`.
   - If `!req.body.confirm`:
     Return HTTP 409 (or HTTP 200 with status flag):
     ```json
     {
       "status": "confirmation_required",
       "code": "HIGH_ALLOWANCE_CONSUMPTION",
       "required_units": 80,
       "remaining_units": 100,
       "offering_name": "Trend Briefing",
       "analyst_name": "Anu Lingala",
       "message": "Commissioning this Trend Briefing from Anu Lingala requires 80 queries, which will use the majority of your remaining daily allowance for today. We're ready to produce it—please confirm to proceed."
     }
     ```
   - If `req.body.confirm === true`:
     Proceed to enqueue the deliverable job and call `decrementCredits(...)`.

---

### Part B: Fodda MCP (`Fodda MCP/src/toolHandlers.ts`)

In the `request_deliverable` tool:

1. **Add `confirm` Parameter to Tool Schema:**
   ```typescript
   // In request_deliverable parameters:
   confirm: z.boolean().optional().describe(
     "Set to true to confirm execution after receiving an allowance consumption warning."
   )
   ```

2. **Handle `confirmation_required` Response in Tool Execution:**
   When calling `/v1/human-agents/:analystId/deliver`:
   - If the API returns `status === 'confirmation_required'` or error `HIGH_ALLOWANCE_CONSUMPTION`:
   - Return clean, natural conversational text so Claude prompts the user:
     ```typescript
     const msg = [
       `⚠️ **Confirmation Required Before Producing Deliverable**`,
       ``,
       `Commissioning the **${result.offering_name || offering_key}** from **${result.analyst_name || analyst_id}** requires **${result.required_units} queries**, which will consume most of your remaining daily allowance (${result.remaining_units} queries remaining today).`,
       ``,
       `We're ready to produce this deliverable. Would you like to proceed? (Reply "yes" or "confirm" to run it).`
     ].join('\n');

     return {
       content: [{ type: 'text' as const, text: msg }]
     };
     ```
   - When the user confirms in chat, Claude re-calls `request_deliverable` with `confirm: true`.

3. **House Rules Adherence:**
   - In all user-facing strings, state natural query counts and published USD rates from Airtable.
   - **Never** expose machine terms like "tokens" or "SPT" to the user.

---

## 3. Verification Checklist

1. **Insufficient Quota Test:**
   - Set a test user's daily allowance to 20 queries.
   - Attempt to commission an 80-unit deliverable.
   - Verify the request is rejected with the 402 `insufficient_allowance` message and no credits are decremented.
2. **High-Consumption Confirmation Test:**
   - With 100 queries remaining, request an 80-unit deliverable without `confirm: true`.
   - Verify it pauses with `confirmation_required` and prompts the user without debiting.
   - Re-request with `confirm: true`.
   - Verify the job runs and credits decrement appropriately.
3. **Changelog:**
   - Document changes in `CHANGELOG.md` in both `Fodda API` and `Fodda MCP`.
