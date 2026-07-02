# Brief: MCP Self-Workstream — Honest Billing Header, Trial Cleanup, Error Clarity, Tool Safety, Agent Legibility, SPT Decision

**Date:** 2026-06-19
**From:** MCP Agent
**To:** MCP Agent (self / coordinator workstream)
**Priority:** P0 — Blocker. Item 1 is a double-charge / lost-revenue risk and must land in lockstep with the API trust-gate change; items 2–6 are P1/P2 but bundled here because the coordinator owns the same files.
**Context:** Cold agents reach Fodda mostly through this MCP. The outbound billing header is sent unconditionally while we forward the *user's* key, the meter call fails silently, dead trial code contradicts "no trials," and several mutating/costly tools are unannotated. This brief is the MCP's own slice of the cross-repo cleanup.

---

## 1. Objective
Make the MCP's billing behavior honest and observable, strip retired trial logic, give cold agents legible cost/error/account affordances, and annotate or gate the mutating/costly tools — without changing the API contract beyond what API item 1 already agrees. Resolve the SPT question one of two ways (pass-through or documented split). Every change is inside this repo; the only cross-repo dependency is the `X-Fodda-Billing` trust handshake (§5).

## 2. What You Need To Do

**2.1 — Honest outbound billing header + meter retry/audit (P0).**
Today `foddaRequest` injects `X-Fodda-Billing: mcp-orchestrated` on **every** call (`src/index.ts:160`) while forwarding the user's own key as `X-API-Key` (`:157`). Per Findings A, the API trust gate downgrades a non-trusted user key sending that header to per-call billing — so the API debits per-call **and** the MCP fires the lump-sum meter ⇒ double-charge (confirm exact downgrade behavior with API §5).

- Gate the header. Only emit `mcp-orchestrated` when the presented credential is one the API actually trusts. Until the API confirms which credential that is (§5), thread a `billingTrusted: boolean` (or a credential-kind enum) through `foddaRequest`'s signature (`src/index.ts:144-150`) and set the header conditionally:

```ts
// src/index.ts ~156
const headers: Record<string,string> = {
  'X-API-Key': apiKey,
  'X-User-Id': userId,
  'X-Fodda-Timestamp': timestamp,
  'Content-Type': 'application/json',
};
if (billingTrusted) headers['X-Fodda-Billing'] = 'mcp-orchestrated';
```

- The settlement path is `chargeQuery` → `POST /v1/research/meter` (`src/pricingCache.ts:459`). It currently swallows failures: the `catch` at `src/pricingCache.ts:469-473` logs to `console.error` and returns `{ charged:false }` with no retry and no durable audit ⇒ silent revenue loss. Add: (a) bounded retry with backoff (e.g. 2 retries, jittered) on network/5xx; (b) a structured audit log line on every terminal outcome (success and final-failure) including `userId`, `queryTypeCode`, `price`, HTTP status, and `requestId`, so lost charges are reconcilable; (c) do **not** make it blocking (keep non-fatal to the user query).

**2.2 — Remove dead trial code (P1).** `isTrial` is hardcoded `false` at three init sites and gates branches that can never run:
- `src/index.ts:230` (`const isTrial = false`) — drop the constant and the dead pre-check comment block; simplify `runWaverunner`'s body that branches on it.
- `src/toolHandlers.ts:292` (`const isTrial = false`) — remove; then delete the dead branches it guards: `src/toolHandlers.ts:109-110` (trial credit-warning string in `appendUsageWarning`) and `src/toolHandlers.ts:409-419` (the `if (isTrial)` "Trial" plan block inside `get_my_account`/Check Account Status). Note `appendUsageWarning` takes `isTrial` as a param (`:78`, threshold at `:96`) and is called at `:893,:1071,:1101,:1130,:1189` — collapse the param away rather than passing a literal `false`.
- `src/systemPrompt.ts:485-489` (the `trialBlock` welcome) and `:252-253` (`### RULE: TrialConversionFlow`). `buildSystemPrompt` declares `isTrial = false` default at `:445` and branches at `:478`; remove the trial arm. Caller passes it at `src/toolHandlers.ts:322`.
- **Keep** the live trial *detection* in `src/errorHandling.ts:188-200` (`isIndividualTrial`, planCode 13) and its handler at `:254-261` — that path is real (new individual trial accounts on `sk_live_` keys), unlike the retired `sk_trial_` session flag. Do not delete those.

**2.3 — Lava PAYG narrative in CREDITS_EXHAUSTED (P2).** Two CREDITS_EXHAUSTED responses attach `payg` as a bare JSON field with a one-line `note` (`src/errorHandling.ts:150-152` and `:351-353`). The PLAN_LIMIT_EXCEEDED message (`src/errorHandling.ts:308-313`) is the gold standard: prose + price ($0.20/token) + one-click Stripe link + `action`. Mirror it: render PAYG as a prose line in `message` with price and an actionable link (not just a nested object), set an explicit `action`, and keep the structured `payg` object for machine consumers. Apply to both blocks.

**2.4 — Tool safety: annotations + gates (P1).** Current annotations (`server.tool(...)` 4th arg) for the mutating tools all carry `destructiveHint:false`:

| Tool | Reg line | Current annotation | Change |
|---|---|---|---|
| `sign_up_free_account` | `src/toolHandlers.ts:2326` | `destructiveHint:false` | `destructiveHint:true`; add a real gate (its only guard was the now-dead `isTrial`) — require explicit user-provided email confirmation before POSTing `/api/account/trial-convert` (`:2340`); drop expert-onboarding framing (out of scope) |
| `toggle_graph_preference` | `src/toolHandlers.ts:2193` | `destructiveHint:false` | `destructiveHint:true`; the `user_email` param (`:2191`) is forwarded straight to `/v1/user/preferences/toggle` (`:2197`) and could mutate **another** user's settings — require an owner/admin check (forward to API for verification, or refuse when `user_email` ≠ session user unless the session is admin-scoped) (confirm API supports this check) |
| `update_user_profile` | `src/toolHandlers.ts:2135` | `destructiveHint:false` | `destructiveHint:true` (overwrites stored profile) |
| `manage_scheduled_reports` | `src/toolHandlers.ts` ~2668 (reg `:2657`) | (verify annotation) | `destructiveHint:true` (recurring ~20-call/run jobs; `create/cancel/pause/resume` mutate) |

Costly read tools — add a machine-readable cost annotation (the prices are already in the *descriptions* but not in annotations). Either add a custom `costHint`/`_meta` field or, minimally, ensure the per-query price is in the annotation object, for: `deep_research_topic` (`:2803`, 20/30), `brand_tracker` (`:1750`+annotation), `get_supplemental_context` (`:1790`), `get_earnings_intelligence` (`:2055`, 5), `get_earnings_divergence` (`:2100`), `read_url` (`:2739`, 15), `consult_analyst` (`:3083`, 5). Keep `readOnlyHint:true` on these.

**2.5 — Agent legibility (P1).**
- Add a **"READ THIS FIRST"** ordered preamble to the top of `buildSystemPrompt` output (`src/systemPrompt.ts:445+`): (1) what Fodda is, (2) how to authenticate (own api_key via `?api_key=` / `X-API-Key` / `Bearer`), (3) how billing works (per-query fixed prices), (4) when to stop. The prompt is ~800 lines / ~174 rules with no entry point or stop condition (Findings C).
- Add an **error-recovery rule** describing the CREDITS_EXHAUSTED / PLAN_LIMIT_EXCEEDED / trial-detected responses and the expected agent action (surface the link, don't loop).
- Add a **status + per-query cost table** to the `get_my_account` / "Check Account Status" handler (`src/toolHandlers.ts:397-420`): return remaining credits, plan, and the fixed price map (topic_research 15, brand_intelligence 20, deep_research_light 20, deep_research_heavy 30, brainstorm 15, standalone_* 5, research_chat 3, expert_agent 5, visual/admin 0). Source these from `pricingCache` constants rather than hardcoding.
- Add a self-describing **`describe_fodda`** tool (readOnly): returns the same "what/auth/billing/stop" payload as a callable tool for agents that don't read the system prompt.

**2.6 — SPT decision (CONDITIONAL).** Inbound MCP auth at `src/index.ts:519-522` only extracts an api key; `/a2a` is key-only (`src/a2aHandler.ts:293-296`); outbound always sends key + (now-gated) `mcp-orchestrated`. CORS at `src/index.ts:33` does **not** currently list `X-Stripe-SPT` (ground-truth note that it does is stale — confirm).
- **If SPT pass-through is approved:** parse `Authorization: Bearer spt_xxx` inbound (extend `src/index.ts:519`), forward the SPT instead of the api key, and suppress `mcp-orchestrated` whenever an SPT is present (ties into §2.1's `billingTrusted` flag — SPT path is API-metered directly). Add `X-Stripe-SPT` to the CORS allow-list (`:33`). Optionally extend `/a2a` (`src/a2aHandler.ts:293`).
- **If NOT approved:** add a section to `README.md` documenting the MCP-vs-direct-API billing/identity split (MCP = user api key + lump-sum meter; direct API = per-call; SPT lives in the API but is not reachable via the hosted MCP) so it stops reading as a missing feature.

## 3. Acceptance Criteria
- [ ] `X-Fodda-Billing: mcp-orchestrated` is sent **only** on the credential path the API trusts; a regular user-key request no longer emits it (verified against §5 handshake).
- [ ] No code path produces both a per-call API debit and a meter charge for the same query (no double-charge).
- [ ] Meter failures retry (bounded) and every terminal outcome emits a structured audit log with `userId`/`queryTypeCode`/`price`/status/`requestId`.
- [ ] `grep -rn "const isTrial = false" src/` returns nothing; trial welcome/conversion blocks gone; live planCode-13 detection (`errorHandling.ts:188-200`) intact.
- [ ] Both CREDITS_EXHAUSTED responses surface PAYG as prose + price + link, matching PLAN_LIMIT_EXCEEDED's shape.
- [ ] `sign_up_free_account`, `toggle_graph_preference`, `update_user_profile`, `manage_scheduled_reports` carry `destructiveHint:true`.
- [ ] `sign_up_free_account` no longer creates an account without explicit email confirmation; `toggle_graph_preference` rejects/owner-checks cross-user `user_email`.
- [ ] Costly read tools carry a machine-readable cost annotation.
- [ ] System prompt opens with an ordered "READ THIS FIRST" + error-recovery rule; `get_my_account` returns status + cost table; `describe_fodda` exists.
- [ ] SPT: either inbound `spt_` parsed + forwarded + `mcp-orchestrated` suppressed + CORS updated, OR README documents the split.

## 4. Testing Plan
- Unit: `foddaRequest` emits `X-Fodda-Billing` iff `billingTrusted`; assert header absent for user-key path, present for trusted/internal path.
- **Anti-double-billing:** internal/self calls use `FODDA_INTERNAL_API_KEY` (trusted) — verify these defer per-call and settle via meter exactly once; verify untrusted user-key calls are per-call only and do **not** also fire the meter.
- Meter retry: mock 5xx then 200, assert single successful charge + audit line; mock persistent failure, assert final-failure audit line and non-blocking return.
- Trial removal: build the system prompt and account-status output, assert no trial strings; run `isIndividualTrial` against a planCode-13 fixture, assert still detected.
- Error clarity: snapshot both CREDITS_EXHAUSTED payloads, assert PAYG prose/price/link present.
- Tool safety: assert annotations; assert `sign_up_free_account` refuses without confirmation; assert `toggle_graph_preference` blocks cross-user `user_email` for a non-admin session.
- SPT (if approved): inbound `Authorization: Bearer spt_test`, assert SPT forwarded and `mcp-orchestrated` suppressed; preflight returns `X-Stripe-SPT` in allow-list.

## 5. Dependencies & Coordination
- **API Agent (item 1) — blocking handshake.** Agree the exact credential the MCP must present for the API to honor `mcp-orchestrated`: (a) MCP forwards the *user* key and the API trusts a signed `mcp-orchestrated` from any HMAC-valid MCP request, or (b) MCP swaps in `FODDA_INTERNAL_API_KEY` for the metered hop while attributing via `X-User-Id`. The `billingTrusted` flag and §2.1 header logic depend on which. Confirm the downgrade-to-per-call behavior at the API trust gate so we know when the header is ignored vs. honored.
- **API Agent** — confirm `/v1/research/meter` accepts retried/idempotent POSTs (need an idempotency key to avoid double-settlement on retry).
- **API Agent** — confirm `/v1/user/preferences/toggle` enforces owner/admin for `user_email` (else MCP must hard-block).
- **Product owner** — SPT go/no-go decision (drives §2.6 branch). Expert-onboarding is explicitly out of scope.

## 6. CHANGELOG Entry
```
### Changed
- Billing: X-Fodda-Billing: mcp-orchestrated is now sent only on the API-trusted credential path; user-key requests no longer emit it, closing a double-charge risk. (src/index.ts)
- CREDITS_EXHAUSTED responses now surface Lava PAYG as prose + price + actionable link, matching PLAN_LIMIT_EXCEEDED. (src/errorHandling.ts)
- get_my_account now returns account status plus the per-query fixed-price table. (src/toolHandlers.ts)
- System prompt opens with a "READ THIS FIRST" preamble (what/auth/billing/stop) and an error-recovery rule. (src/systemPrompt.ts)

### Added
- Bounded retry + structured audit logging for the /v1/research/meter settlement call; failures are now reconcilable instead of silent. (src/pricingCache.ts)
- destructiveHint:true on sign_up_free_account, toggle_graph_preference, update_user_profile, manage_scheduled_reports; machine-readable cost annotations on costly read tools.
- Email-confirmation gate on sign_up_free_account and owner/admin check on toggle_graph_preference's user_email.
- describe_fodda tool: self-describing what/auth/billing/stop payload for cold agents.
- [If SPT approved] Inbound Authorization: Bearer spt_xxx parsing + pass-through with mcp-orchestrated suppression; X-Stripe-SPT added to CORS. [Else] README section documenting the MCP-vs-direct-API billing/identity split.

### Removed
- Retired sk_trial_ dead code: hardcoded isTrial=false constants and the trial welcome/conversion/credit-warning branches (live planCode-13 detection retained). (src/index.ts, src/toolHandlers.ts, src/systemPrompt.ts)
```

### Addendum — Pre-Spend Cost Transparency + Price-Table Sync (append to §2.4/§2.5; ties to master §8)

1. **Surface per-tool cost to the agent BEFORE spend.** Today the agent learns cost only after the fact (`chargeQuery` logs to stderr + returns remaining balance, `src/pricingCache.ts:461-462`); only interactive skill tools mention cost in the prompt (`systemPrompt.ts:549`). Add a prompt rule (in the §2.5 "READ THIS FIRST" preamble, `systemPrompt.ts:445+`) instructing the agent to state the flat price before running any costly tool — e.g. "Running a brand intelligence audit will use ~20 API calls — proceed?" — sourced from `pricingCache` constants, NOT hardcoded. Cover at minimum: `deep_research_topic` (20/30), `brand_tracker` (20), `get_supplemental_context` (5), `read_url` (15), `get_earnings_intelligence` (5), `search_graph` (15).
2. **Correct the owner's number everywhere agent/user-facing.** brand_intelligence is a FLAT 20 API calls (`pricingCache.ts:50-60`), regardless of fan-out to Cypher + up to 8 graphs. Use 20 in `describe_fodda`, the `get_my_account` cost table (§2.5), and any copy — not ~10.
3. **Keep the MCP price table in sync with the API source of truth.** `DEFAULT_PRICING` (`pricingCache.ts:36-229`) and the Airtable override (lines 259-330) must not silently diverge from API `TOKEN_COSTS`. Add a startup/test assertion that, for every shared query type, the MCP's effective price equals the API's authoritative price (fetch from the API schedule endpoint per API addendum item 5, or pin a checked-in snapshot and fail the build on mismatch).
4. **Frame the fixed-price model honestly in the preamble.** State that each tool has a single flat price billed once per call (it does not scale with graphs searched), so agents stop assuming multi-graph queries cost more and can quote confidently.
5. **Cost annotations carry the canonical number.** The machine-readable `costHint`/`_meta` annotations from §2.4 must read from `pricingCache` (not literals), so a price change in the source propagates to annotations automatically.

**Acceptance additions:**
- [ ] System prompt instructs the agent to quote the flat per-tool cost before running costly tools; verified in a prompt snapshot test.
- [ ] brand_intelligence shows as 20 (flat) in `describe_fodda`, `get_my_account`, and copy — never ~10.
- [ ] A test fails if any shared query-type price in MCP `pricingCache.ts:36-229` disagrees with the API authoritative schedule.
- [ ] Cost annotations and the cost table source from `pricingCache` constants, not hardcoded numbers.
