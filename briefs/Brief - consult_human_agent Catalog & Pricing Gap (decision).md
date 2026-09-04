# Brief — `consult_human_agent` Catalog & Pricing Gap (decision needed)

> **Type:** Decision brief (pricing) · **Priority:** P2 · **Owner of decision:** Piers · **Implements after decision:** API agent + MCP agent
> **Prepared:** 2026-09-03 by Claude Code, from a live read of Airtable (`appXUeeWN1uD9NdCW`) on 2026-09-03.
> This is a *think-about* brief. Do NOT invent a price — the house rule is that Airtable is the pricing source of truth and prices are Piers's call.

## 1. Context — what's actually true today

`consult_human_agent` (consult a real expert's authorized Digital Twin) is a **live, billable MCP tool**, but it is priced **only in code** and is **absent from both Airtable pricing tables**. Its synthetic sibling `consult_analyst` is fully catalogued. Verified 2026-09-03:

| | Offerings row (`tbl93DJ627r81zKVP`) | Query Pricing row (`tblHsMfyoW39LqCv8`) | Code default (`src/pricingCache.ts` `DEFAULT_PRICING`) | Effective charge |
|---|---|---|---|---|
| `consult_analyst` (synthetic) | ✅ `$15`, `bills_as=expert_agent`, live | ✅ `expert_agent` = 5 calls | present | 5 calls / published $15 |
| `consult_human_agent` (real expert twin) | ❌ none | ❌ none | ✅ `human_agent_consult` = 1 call | **1 call, hardcoded, uncatalogued** |

Two problems fall out of this:

1. **Pricing anomaly.** Consulting a *real expert's* twin currently costs **less** (1 call) than consulting a *synthetic* analyst (5 calls / $15). That is almost certainly backwards relative to value — or at least needs a deliberate rationale. It may be intentional (the human-agent call is a lighter single API operation) or an oversight; the brief can't tell.
2. **Catalog invisibility.** Because there's no Offerings row, `consult_human_agent` does not appear in the canonical catalog the API serves at `/v1/offerings`, so the website, discovery surfaces, and any catalog consumer under-represent the human-expert offering. It also means its description is source-only (not synced from Airtable) — fine for drift-safety, but it's not in the priced catalog.

Note: this gap does **not** block the ChatGPT Apps Directory submission — ChatGPT reads the MCP `tools/list` directly, and the tool works and bills. This is a data-consistency and pricing-integrity issue, not a launch blocker.

## 2. The decision to make (Piers)

1. **What should `consult_human_agent` cost?** Set an intended `published_price_usd` and a `Query Pricing` call count. Decide the relationship to `consult_analyst` ($15 / 5 calls): should the human-expert consult be priced **higher** (real expert, higher value), **equal**, or deliberately **lower/loss-leader**? State the rationale so the code default can be aligned rather than "corrected."
2. **`bills_as` mapping.** Either keep the current `human_agent_consult` billing code and give it a Query Pricing row, or fold it into `expert_agent`. (`consult_analyst` uses `bills_as=expert_agent`.)
3. **Is the current 1-call charge a bug or intentional?** If intentional, record why; if not, the fix ships with the new price.

## 3. What to build once the price is decided

- **Airtable Offerings** (`tbl93DJ627r81zKVP`): add a `consult_human_agent` row — `key`, `display_name`, `description` (mirror the cleaned source description), `published_price_usd`, `bills_as`, `kind=tool`, `status=live`, `audience`, `typical_calls`.
- **Airtable Query Pricing** (`tblHsMfyoW39LqCv8`): add/confirm the `human_agent_consult` (or chosen `bills_as`) row with the agreed `apiCallsCharged`.
- **MCP code** (`src/pricingCache.ts` `DEFAULT_PRICING`): align the `human_agent_consult` default to the agreed call count so the hardcoded fallback matches Airtable (prod serves the code default — no `AIRTABLE_API_KEY` on the `fodda-mcp` service).
- **Verify** `/v1/offerings` (API) now lists `consult_human_agent`, and `get_my_account` `query_costs` shows the agreed charge.

## 4. Where to register / route

- Decision: **Piers**.
- Airtable + `/v1/offerings` catalog: **API agent** (pricing infra is API-owned).
- `DEFAULT_PRICING` alignment + a re-verify of `get_my_account` `query_costs`: **MCP agent**.

## 5. Definition of Done

- [ ] Price + call count + `bills_as` decided and recorded (with rationale for the human-vs-synthetic relationship).
- [ ] Offerings row present, `status=live`; Query Pricing row present; code default matches.
- [ ] `/v1/offerings` lists `consult_human_agent`; `get_my_account` `query_costs` reflects the agreed charge.
- [ ] All three sources (Offerings, Query Pricing, `DEFAULT_PRICING`) agree — no drift.

## 6. Do Not

- Do NOT invent, round, or "correct" a price from memory — wait for the decision (house rule: Airtable is the pricing source of truth).
- Do NOT change `consult_analyst` pricing as a side effect.
- Do NOT add prices, "tokens", or "SPT" wording to the tool's human-visible description.
- Do NOT treat this as a submission blocker — it is independent of the ChatGPT listing.

## 7. Files / stores touched (expected)

Airtable `tbl93DJ627r81zKVP` (Offerings), `tblHsMfyoW39LqCv8` (Query Pricing); `src/pricingCache.ts` (MCP); API `/v1/offerings` serialization if it filters by anything other than `status=live`; `CHANGELOG.md` (both repos).
