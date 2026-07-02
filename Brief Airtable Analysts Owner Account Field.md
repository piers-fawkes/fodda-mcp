# Brief: Surface `ownerAccount` on the Analysts Table (Lookup)

## Objective
The Analysts table already links each analyst to its owner via the existing `user` field (with email looked up from User). The Fodda API, however, identifies callers by their **Account record ID** and reads a field named exactly **`ownerAccount`** on the Analysts table. Add a lookup field that surfaces the owner's Account record ID under that exact name. No manual linking of owners is required — the existing `user` links drive everything.

This mirrors the Graph List table's existing pattern (`ownerId → User → Account`, surfaced as an `ownerAccount` lookup).

## Where
- **Base**: main Fodda base (`appXUeeWN1uD9NdCW`)
- **Table**: `Analysts` (sometimes named `Analysis`; it's the table with `Analyst ID`, `Status`, `System Instructions`, and the existing `user` field)

## Field Spec
Create a field named exactly **`ownerAccount`** (camelCase, no space — the API reads it by this literal name).

**Case A — `user` links to a Users table, and Users links to Accounts:**
- Type: Lookup, through the `user` field, returning the Users table's link-to-Accounts field.
- A lookup of a linked-record field returns the Account record ID(s) via the API — which is what the code expects.

**Case B — `user` links directly to the Accounts table:**
- On the Accounts table, ensure a formula field exists with formula `RECORD_ID()` (create one named `accountRecordId` if absent).
- On Analysts, create `ownerAccount` as a Lookup through `user` returning that formula field.

## Verification
1. For a real expert (e.g. Ben Dietz), `ownerAccount` shows a value beginning `rec…` matching their Account record.
2. Cross-check 2–3 experts against the Graph List table (`tblf8OPpi0F16ofAX`): the analyst's `ownerAccount` should equal their backing graph's `ownerAccount`.
3. Synthetic personas (`retail-strategy-innovation`, `marketing-media-strategy`, `tech-innovation`, `food-beverage-innovation`, `sustainability-impact`, `brand-ceo/cfo/cmo/analyst`) should be blank — their `user` field should be empty. If any synthetic persona has a `user` link, flag it; do not clear it yourself.

## Do NOT
- Do not rename, retype, or clear the existing `user` field or any other field.
- Do not hand-populate `ownerAccount` — it's a lookup; fix the `user` link instead if a value is wrong, and flag rather than guess.

## Report Back
Field created (exact name, lookup path used), spot-check results vs Graph List, list of analysts with empty `ownerAccount`, and any synthetic personas that unexpectedly have owners.
