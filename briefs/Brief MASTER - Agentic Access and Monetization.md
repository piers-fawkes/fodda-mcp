# Brief: MASTER — Agentic Access & Monetization
**Date:** 2026-06-19
**From:** Piers (Product)
**To:** MCP Agent (Coordinator)
**Priority:** P0 — Blocker — agentic traffic is our primary access path and the billing identity is currently UNRESOLVED, with a live double-charge risk.
**Context:** Most agentic access to Fodda comes through the hosted MCP. Two things are broken at the product level: (1) a cold agent can't reliably discover how to *use* Fodda or how to *pay* for it, and (2) the MCP↔API billing contract is ambiguous enough that we cannot rule out double-charging real users. This master brief is your charter as coordinator. It does not contain the work itself — the per-agent sub-briefs are appended below this document. Your job is to split, dispatch, monitor, reconcile, and consolidate.
---
## 1. Objective
Make Fodda's agentic access — predominantly via the MCP — both **legible to a cold agent** (it can discover how to call us and how to pay, with no human in the loop and no prior context) and **correctly monetized** (exactly one charge per billable unit of work, correctly attributed, never silently dropped). You own coordination across the API, Website, App, and CE agents: you split the appended sub-briefs into files, dispatch them, monitor their response briefs, reconcile cross-agent dependencies (the billing-header contract first), and produce a consolidated `briefs/Response — Master.md`.

## 2. Current State (findings A–E)
- **A. Charging model** — MCP forwards the **user's own key** as `X-API-Key` + `X-User-Id` + `X-Fodda-Billing: mcp-orchestrated` (`src/index.ts:156-160`) and fires one settlement `POST /v1/research/meter` per query (`src/pricingCache.ts:459`). API zeroes per-call debits only for trusted callers; the **trust gate downgrades a non-internal/non-oidc key claiming `mcp-orchestrated` back to per-call** (API `functions/index.ts:593-602`; `effectiveBillableUnits` at `functions/tracking/airtable.ts:672-674`). **Which key the MCP presents in production is unresolved → live double-charge risk.** Meter failures are caught silently (`src/pricingCache.ts:459`) → lost charges, no retry/audit.
- **B. SPT (agent wallet)** — Built and production-ready in the API (`functions/index.ts:328-497`, `billingMode 'spt-prepaid'`, 402 discovery advertises `stripe-spt`) but **unreachable via the hosted MCP**: inbound requires an api key (`src/index.ts:519-522`), outbound always sends key + `mcp-orchestrated` (`src/index.ts:156-160`), A2A is key-only (`src/a2aHandler.ts:293-300`). CORS allows `X-Stripe-SPT` (`src/index.ts:105`) but nothing reads it.
- **C. Billing legibility** — Trial is retired but dead trial code remains (`isTrial=false` at `src/index.ts:230`, `src/toolHandlers.ts:292`; stale branches `src/toolHandlers.ts:109-110`, `:409-419`; trial copy `src/systemPrompt.ts:485-489`, `:252-253`). `CREDITS_EXHAUSTED` collapses PAYG into a bare field (`src/errorHandling.ts:138-152`) vs. the clear `PLAN_LIMIT_EXCEEDED` message (`src/errorHandling.ts:309-315`). Pricing is never surfaced to the agent (`src/pricingCache.ts` is server-side only). System prompt is 800+ lines / ~174 rules with no "start here", stop condition, or cost awareness (`src/systemPrompt.ts`).
- **D. Tool safety** — ~30 tools all visible, no MCP-layer auth/plan gating. Mutating tools lack `destructiveHint`/owner checks: `sign_up_free_account` (open — its trial gate is dead), `toggle_graph_preference` (`user_email` param → can alter another user's settings), `manage_scheduled_reports`, `update_user_profile`, `send_feedback`. Costly read tools lack cost annotation: `deep_research_topic`, `brand_tracker`, `get_supplemental_context`, `get_earnings_intelligence/divergence`, `read_url`, `consult_analyst`.
- **E. API scaffolding** — Stripe one-time top-up checkout referenced with no endpoint; agentic-commerce webhook `POST /api/stripe/commerce-webhook` (`functions/index.ts:2287-2311`) auto-approves every order with no fulfillment; `agent-session` checkout (`functions/index.ts:758-767`) lives in the website/account service.

## 3. Open Decisions for Piers (BLOCKERS)
These gate the workstreams below. Each has a recommended default; dispatch can proceed against the defaults but the billing items (D1, D2) must be *confirmed* before any MCP deploy.

- **(D1) SPT through the MCP, or formalize the split?**
  Should the hosted MCP pass SPT through (`spt_xxx` / `X-Stripe-SPT`) so agents can pay their own way via the MCP, or do we formalize and document a hard split: **MCP = enterprise / per-user-key lump-sum settlement**, **SPT = direct-API only**?
  *Recommended default:* **Formalize the split for this cycle.** SPT is production-ready on the API but the MCP has zero plumbing for it (B). Documenting "MCP bills your key; SPT is direct-API" is shippable now; MCP SPT pass-through is a fast-follow. Revisit if agent-wallet demand materializes.

- **(D2) Billing identity for MCP traffic — user key or trusted MCP service key?**
  Does the MCP authenticate to the API with the **end user's key + `mcp-orchestrated` header**, or with a **dedicated trusted MCP service key** while passing `X-User-Id` for attribution? This is the single decision that determines the double-charge fix.
  *Recommended default:* **Dedicated trusted MCP service key + `X-User-Id`.** Today the MCP sends the user's key with `mcp-orchestrated` (`src/index.ts:156-160`); the API trust gate (`functions/index.ts:593-602`) then *downgrades* that key to per-call AND the meter still fires → double-charge. A trusted service key passes the gate (per-call debits zeroed) and the meter settles once against the `X-User-Id` account. Requires the API meter endpoint to resolve the billable account from `X-User-Id`, not the auth key. This is the cross-cutting contract you reconcile FIRST.

- **(D3) Priority / sequencing & scope.**
  Which workstreams are in scope now vs. later?
  *Recommended default:* **In scope now:** billing-identity contract (D2), meter retry/audit, billing legibility (kill trial code, fix `CREDITS_EXHAUSTED`, surface pricing), mutating-tool gating, SPT decision documented (D1). **Later:** MCP SPT pass-through, one-time top-up endpoint, commerce-webhook fulfillment, per-user attribution inside oidc tenants. **Dropped:** expert-onboarding affordances (owner does not want agents signing up as experts).

## 4. Workstream Ownership Matrix
| Workstream | Owner Agent | Priority | Depends on | Sub-brief |
|---|---|---|---|---|
| Billing-identity contract + trust-gate fix (D2) | API | P0 | D2 | `briefs/Brief API Call Billing Transition.md` |
| Meter retry + audit log (no silent loss) | API | P0 | Billing contract | `briefs/Brief API P0 Surface Audit Fixes.md` |
| MCP outbound auth: send service key + `X-User-Id` | MCP | P0 | D2, API contract | (this coordinator + MCP sub-brief) |
| Kill dead trial code / paths | MCP | P1 | D3 | `briefs/Brief App MCP Instructions Audit.md` |
| `CREDITS_EXHAUSTED` parity + surface pricing to agent | MCP | P1 | API price table | `briefs/Brief API Call Billing Transition.md` |
| Mutating-tool gating + annotations + owner checks | MCP | P1 | — | (MCP sub-brief, scope from finding D) |
| System-prompt "start here" / cost awareness / stop conditions | MCP | P1 | Pricing surfaced | `briefs/Brief App MCP Instructions Audit.md` |
| SPT decision documented (split or pass-through) | API + MCP | P1 | D1 | `briefs/Brief API Implementation Complete.md` |
| Website billing/pricing copy aligned to MCP errors | Website | P2 | API price table | `briefs/Brief Website MCP Instructions Audit.md` |
| App: client honors new billing/error contract | App | P2 | API contract | `briefs/Brief App API Call Migration.md` |
| CE graph (ce-design) ingestion/identity, if touched | CE | P2 | — | `briefs/Brief CE Graph ID Encoding Audit.md` |
| Eval harness gates the release | MCP | P0 | All above | `briefs/Brief MCP Eval Harness.md` |
| Pricing-schedule integrity + pre-spend cost transparency (one source of truth; server recompute authoritative; agent quotes price before running) | API + MCP | P1 | API price table; D2 billing contract | `briefs/Brief - Billing Correctness and SPT (API Agent).md` + `briefs/Brief - MCP Self Changes (MCP Agent).md` |

*If an appended sub-brief's filename differs from the table, map it by subject and note the mapping in `Response — Master.md`.*

## 5. Coordination & Monitoring Protocol
Execute in order.

1. **(a) Split & file.** For each appended sub-brief, create `briefs/Brief <name>.md` (one file per sub-brief, House Style preserved). Do not edit their content; only separate them.
2. **(b) Dispatch.** Route each file to its owner agent per the matrix. Set the priority field and the explicit dependency (e.g. App/Website/MCP work all gate on the API billing contract).
3. **(c) Require responses.** Each agent replies with `briefs/Response — <name>.md` in House Style, including its filled Acceptance Criteria checkboxes and any contract deltas it needs. Track outstanding responses; an unfilled checkbox = not done.
4. **(d) Reconcile the billing-header contract FIRST.** This is the cross-cutting blocker. Lock the MCP↔API handshake before anything else merges: confirm D2; pin the exact header set the MCP sends outbound (`src/index.ts:156-160`) against what the API trust gate accepts (`functions/index.ts:593-602`); confirm the meter endpoint resolves the billable account from `X-User-Id` (`src/pricingCache.ts:459` → API `functions/v1/research/researchRouter.ts:593-723`). No other workstream merges until this is signed off by both API and MCP responses.
5. **(e) Verify with the MCP Eval Harness.** Run the harness end-to-end (`briefs/Brief MCP Eval Harness.md`). It must prove: exactly one charge per query, correct `X-User-Id` attribution, meter retry on failure, and a cold-agent discover-use-pay path.
6. **(f) Consolidate.** Write `briefs/Response — Master.md`: status per workstream, the resolved D1/D2/D3 decisions, the locked billing contract, harness results, and the deploy order.

**Deploy order:** **API first** (billing contract + meter audit must land before any caller changes), **MCP second** (switches to the service key + new error/pricing surfacing only after the API accepts the contract), **App third**, **Website in parallel** (copy-only, no runtime dependency).

**Release criterion (anti-double-billing gate):** No build deploys until the harness demonstrates a single MCP-orchestrated query produces **one** debit on the correct account — verified that per-call debits are zeroed for the trusted hop (`airtable.ts:672-674`) AND the meter fired exactly once (`pricingCache.ts:459`). Anti-double-billing: internal/coordinator calls during testing use `FODDA_INTERNAL_API_KEY`, never a real user key.

## 6. Global Acceptance Criteria
- [ ] **No double-charge:** one MCP query → exactly one debit on the correct `X-User-Id` account; trust gate (`functions/index.ts:593-602`) no longer downgrades the MCP hop.
- [ ] **D2 resolved & implemented:** MCP outbound auth identity matches the API trust model; contract signed off in both response briefs.
- [ ] **Meter is durable:** `POST /v1/research/meter` failures are retried and audited — no silent credit loss (`src/pricingCache.ts:459`).
- [ ] **Cold-agent legibility:** a fresh agent can, with no human, discover how to call Fodda and how to pay (pricing surfaced; `CREDITS_EXHAUSTED` reaches parity with `PLAN_LIMIT_EXCEEDED`).
- [ ] **Trial language gone:** all dead trial code/copy removed (`src/index.ts:230`, `src/toolHandlers.ts:109-110/:292/:409-419`, `src/systemPrompt.ts:252-253/:485-489`).
- [ ] **Mutating tools gated:** `destructiveHint` + confirm/owner checks on `sign_up_free_account`, `toggle_graph_preference`, `manage_scheduled_reports`, `update_user_profile`, `send_feedback`; costly reads carry cost annotations.
- [ ] **SPT decision resolved & documented (D1):** the split or pass-through is decided, written into the docs, and the 402 discovery path is consistent with it.
- [ ] **Harness green:** eval harness passes end-to-end and is the merge gate.
- [ ] **`briefs/Response — Master.md` exists** tying all workstream responses, decisions, and deploy order together.

## 7. CHANGELOG Entry
```
### Added
- Master coordination brief for the Agentic Access & Monetization initiative (MCP as primary agent surface).
- Coordination protocol: per-sub-brief files under briefs/, response-brief requirement, billing-contract reconciliation gate, eval-harness release gate.

### Changed
- Established MCP↔API billing-identity decision (D2) and SPT split decision (D1) as P0 blockers gating all dependent workstreams.
- Defined deploy order: API → MCP → App, Website in parallel.

### Fixed
- Anti-double-billing release criterion: one MCP query must produce exactly one correctly attributed debit before any deploy.
```

## 8. Pricing Schedule Integrity & Cost Transparency

**Why this is here (owner question):** "There was a moment when we gave certain MCP requests — like API query totals — to charge the user; e.g. a brand intelligence audit might be ~10 queries. Do you consider this in the plan?" Answer: charging is **FIXED per tool/query-type, billed once per call** — not variable per sub-query — and the master brief covered *that there is exactly one charge* (§1, §6) but **not** the integrity of the price schedule or showing the price to the agent before it spends. The owner's "~10" is also stale: a brand intelligence audit (`brand_tracker` → `brand_intelligence`) is a **flat 20 API calls**, even though it internally hits a Cypher endpoint plus up to 8 graphs (`src/toolHandlers.ts:1224-1551`, `src/pricingCache.ts:50-60`). This section closes the gap.

**Canonical price table (confirmed by both repo readers — this is the contract):**

| Tool (query type) | API calls | Fans out to |
|---|---|---|
| `search_graph` (topic_research) | 15 | N relevant graphs |
| `brand_tracker` (brand_intelligence) | 20 | Cypher + up to 8 graphs |
| `deep_research_topic` light / heavy | 20 / 30 | up to 8 / 15 graphs |
| `brainstorm_topic` | 15 | — |
| `read_url` (url_as_prompt) | 15 | — |
| `search_graph` upload_compare | 20 | — |
| `manage_scheduled_reports` (weekly_tracker) | 20 | per run |
| `get_supplemental_context` | 5 | up to 15 sources |
| `get_evidence` / `search_statistics` | 5 / 5 | — |
| `research_chat` / `expert_agent` / `get_earnings_intelligence` | 3 / 5 / 5 | — |
| `generate_visual` / `get_my_account` | 0 / 0 (free) | — |

The fan-out column is the point: price does **not** scale with graphs searched. This is deliberate (predictability for the user) but means an agent must be told the flat price up front.

**State (House Style, file:line):**
- **Two price tables, no single source of truth.** MCP: `src/pricingCache.ts` `DEFAULT_PRICING` (lines 36-229), Airtable-overridable at runtime (lines 259-330). API: `src/metering.ts` `TOKEN_COSTS` (lines 40-63), with a partial mirror in `researchRouter.ts` `TIER_CONFIG` (lines 205-208). They currently agree on shared types but nothing guards drift across repos.
- **Server recompute is already authoritative — keep it.** `/v1/research/meter` computes `expectedCost = calculateInteractionBillable(type)` (`researchRouter.ts:645`), logs a warning on mismatch (`:647`) but charges `expectedCost`, never the client-sent `billable_units` (`:655`). The MCP-sent `billable_units: price` (`src/pricingCache.ts:454`) is advisory only. Do not regress this.
- **One live inconsistency to reconcile.** `TOKEN_COSTS` has `scheduled_analyst: 20` ("upgraded from 5", `metering.ts:46`) and the type is in `VALID_METER_TYPES` (`researchRouter.ts:600`), but production scheduled runs use type `scheduled-research: 20`, defined twice (`scheduledRouter.ts`, `scheduledRunner.ts`). No handler was found that meters `scheduled_analyst` → likely dead/legacy.
- **Second debit path for deep research.** `/v1/research/deep-dive` pre-debits via `decrementCredits` using `TIER_CONFIG` (`researchRouter.ts:272-279`), bypassing the meter — a separate flow from MCP metering. Confirm only one path bills per user action.
- **Cost is never shown before spend.** `chargeQuery` logs to stderr and returns remaining balance *after* the call (`pricingCache.ts:461-462`); `systemPrompt.ts:549` surfaces cost only for interactive skill tools, never for core search tools.

**Acceptance Criteria:**
- [ ] **One source of truth named.** A single canonical tool→cost map is the authority; the other table either imports it or is generated from it, with the source documented in both repos' code comments. Drift across MCP `pricingCache.ts:36-229` and API `metering.ts:40-63` is impossible without an intentional edit to the source.
- [ ] **Drift guard exists.** A test (or CI check) fails if the MCP price table and the API `TOKEN_COSTS` disagree on any shared query type.
- [ ] **Server recompute stays authoritative.** `/v1/research/meter` charges `expectedCost` and ignores client `billable_units` (`researchRouter.ts:645-655`); a test sends a wrong `billable_units` and asserts the correct fixed cost is debited.
- [ ] **scheduled_analyst reconciled.** Either removed from `TOKEN_COSTS`/`VALID_METER_TYPES` or explicitly aliased to `scheduled-research` with a comment; no two names price the same action divergently.
- [ ] **Single deep-research debit path.** Confirmed in writing that `/v1/research/deep-dive` pre-debit (`researchRouter.ts:272-279`) and the MCP meter never both fire for one user query.
- [ ] **Agent quotes price before spend.** Costly tools (`deep_research_topic`, `brand_tracker`, `get_supplemental_context`, `read_url`, `get_earnings_intelligence`) cause the agent to state the flat cost before running, e.g. "this brand audit will use ~20 API calls" — sourced from `pricingCache` constants, not hardcoded.
- [ ] **Owner's number corrected in docs:** brand intelligence = 20 API calls (flat), recorded in `llms.txt` / `describe_fodda` / `get_my_account` cost table.
