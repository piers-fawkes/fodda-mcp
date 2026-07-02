# Brief: Register 5 New Interaction Types + Real 30-Tool Catalog

**Date:** 2026-06-21
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda
**Priority:** P1 (gates the MCP wiring of 5 tools — same earnings trap if not done first)

---

## 0. Context

We audited all 30 callable MCP tools. **8 were charging, 3 more I just wired** (`consult_analyst`→expert_agent, `get_evidence`→standalone_evidence, `search_statistics`→standalone_statistics — all use existing types, deployed). **5 substantive tools still don't charge because their interaction type doesn't exist yet.** Piers ruled: charge them all. This brief registers the 5 new types and makes `/v1/offerings` list the *real callable tools*, not just pricing types.

Flat rate is **$0.50/call**; price = `TOKEN_COSTS[type] × 0.50`.

---

## Part A — Register 5 new interaction types (do FIRST)

The MCP will emit these queryTypeCodes once you register them. If the MCP wires them before they exist, they mis-meter exactly like earnings did — so this must land first.

Add to `InteractionType` union, `TOKEN_COSTS` (`functions/tracking/metering.ts`), and `VALID_METER_TYPES` (`functions/v1/research/researchRouter.ts`):

| New type | calls | price | MCP tool |
|---|---|---|---|
| `standalone_insights` | 5 | $2.50 | `search_insights` |
| `domain_intelligence` | 5 | $2.50 | `get_domain_intelligence` |
| `expert_intelligence` | 5 | $2.50 | `get_expert_intelligence` |
| `report_intelligence` | 5 | $2.50 | `get_report_intelligence` |
| `adjacent_trends` | 15 | $7.50 | `discover_adjacent_trends` (13-call fan-out → topic-tier) |

**When done, tell me** — I'll then wire the `chargeQuery`/`settleOrWithhold` calls into those 5 MCP handlers (the MCP half).

## Part B — Make `/v1/offerings` list the real 30 tools

Today the catalog rows are *interaction types* (~21). The website needs the actual callable tools. Add `kind:'tool'` rows for all 30 MCP tools, each with `bills_as` (the interaction type it charges, or `free`) so price derives from one place.

**Full mapping (authoritative — from the MCP tool registry):**

*Billable (16):*
| tool | bills_as | price |
|---|---|---|
| brand_tracker | brand_intelligence | $10 |
| deep_research_topic | deep_research_light/heavy | $10/$15 |
| search_graph | topic_research | $7.50 |
| brainstorm_topic | brainstorm | $7.50 |
| read_url | url_as_prompt | $7.50 |
| discover_adjacent_trends | adjacent_trends | $7.50 |
| get_earnings_intelligence | earnings_intelligence | $7.50 |
| get_earnings_divergence | earnings_intelligence | $7.50 |
| consult_analyst | expert_agent | $2.50/turn |
| get_supplemental_context | standalone_supplemental | $2.50 |
| get_evidence | standalone_evidence | $2.50 |
| search_statistics | standalone_statistics | $2.50 |
| search_insights | standalone_insights | $2.50 |
| get_domain_intelligence | domain_intelligence | $2.50 |
| get_expert_intelligence | expert_intelligence | $2.50 |
| get_report_intelligence | report_intelligence | $2.50 |

*Free (14):* get_my_account, list_graphs, list_analysts, get_node, get_neighbors, get_label_values, sign_up_free_account, update_user_profile, toggle_graph_preference, send_feedback, check_research_status, check_supplemental_status, manage_scheduled_reports, generate_visual (`visual` = $0).

**Tool names + descriptions are owned by the MCP** (`src/toolHandlers.ts` `server.tool(...)` registrations) — that's the source of truth for what tools exist. To avoid drift, seed the tool rows from there rather than hand-typing. If you'd prefer, I can generate a `tools-manifest.json` from the MCP (name, description, bills_as, free, category) for your seed to consume — say the word.

## Part C — Extend the parity check

Add to `verifyCatalogParity`:
1. Each `kind:'tool'` row's price == its `bills_as` type price (or 0 if `free`).
2. Every tool's `bills_as` exists in `TOKEN_COSTS` (or is `free`).
3. (Already have) every MCP queryTypeCode ∈ `TOKEN_COSTS`.

---

## Verify
- `/v1/research/pricing` shows the 5 new types at $2.50/$2.50/$2.50/$2.50/$7.50.
- `/v1/offerings` returns the 30 tools (`kind:'tool'`) with correct `bills_as`/price/free.
- parity green; fails if a tool price ≠ its bills_as price.
- Ping me to wire the 5 MCP handlers once the types are live.
