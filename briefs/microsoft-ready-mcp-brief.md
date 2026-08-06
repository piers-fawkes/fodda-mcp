# Brief: MCP Agent — Make Fodda Microsoft-Ready (research + MCP/API code)

**To:** MCP Agent (Fodda MCP) — lead. Hand off API-auth changes to the API Agent; Website work is a
separate brief (`Fodda Website/briefs/microsoft-ready-website-brief.md`).
**From:** Piers (via Claude Code, from `Fodda_Microsoft_Ready_Coder_Brief.md`)
**Execution:** `/build-from-brief briefs/microsoft-ready-mcp-brief.md`
**Type:** Research-gated implementation. **Do Part 1 and report findings before any code change.**

---

## Context

Goal: let a Microsoft customer add Fodda to a **Copilot Studio** or **Microsoft 365 Copilot** agent as
an external **MCP tool, by URL, with clean auth**. Fodda is already an MCP server, so this is mostly
**verification + small adaptation, not new architecture.**

Mental model: the customer's agent connects Fodda as one MCP tool for *external market context*, and
connects their own **Fabric IQ** data agent as a *separate* MCP tool for internal data. **Fodda never
touches their internal data.** Fabric IQ is a peer, not a layer above/below Fodda.

The pointer URLs below are **leads, not gospel** — these Microsoft surfaces move between preview and GA,
so confirm current state against live docs before building.

### Fodda invariants you already have
- MCP endpoint: `https://mcp.fodda.ai/mcp`
- Current URL pattern passes the key as a query param: `https://mcp.fodda.ai/mcp?api_key=[key]&user_id=[email]`
- Auth chain: Clerk JWT (OIDC) → API Key → SPT Bearer → SPT Header → 402 challenge. Middleware
  distinguishes OIDC from SPT by the `spt_` prefix on the Bearer token.
- Source header: `X-Fodda-Source`, current values `mcp`, `app`, `web`, `api`.
- The OpenAI Responses API already consumes Fodda over MCP via **streamable HTTP** and auto-discovers
  30+ tools — strong signal the transport is already correct; confirm it meets Copilot Studio's specifics.

---

## Part 1 — Research first, report before coding

For each: confirm the current requirement and note anything changed since the source date.

1. **Copilot Studio MCP requirements.** Supported transport + auth for connecting an external MCP server today.
   - Start: https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent
   - Confirm: transport must be **Streamable HTTP** and **SSE is no longer supported**. Confirm the
     OAuth 2.0 options — whether **Dynamic Client Registration (DCR)** with dynamic discovery is the
     simplest onboarding path, and whether an **API key can be supplied as a header**.
   - Confirm the OpenAPI 2.0 (Swagger) markers for the custom-connector route, in particular the
     `x-ms-agentic-protocol: mcp-streamable-1.0` operation marker. Determine whether the add-by-URL
     wizard removes the need for a hand-written spec, or whether we should still ship one.
2. **M365 Copilot path.** Confirm how an external MCP server reaches M365 Copilot end users (expected:
   via a Copilot Studio agent / declarative agent published to Teams, SharePoint, or the M365 Copilot
   app). Confirm any requirement beyond the Copilot Studio connection.
   - Start: https://learn.microsoft.com/en-us/power-pages/configure/mcp-connect-clients
3. **Connector marketplace / certification.** Current process + requirements to list Fodda in the
   Copilot Studio connector marketplace. Later distribution move — capture requirements now, don't act.
4. **Fabric data agent as MCP server (forward-looking only).** Confirm a Fabric data agent can be
   published as an MCP server consumable over streamable HTTP with a Fabric bearer token. **Do NOT
   build.** Confirm feasibility + note the auth model only.
   - Start: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-mcp-server

**Gate:** deliver a short findings summary to Piers before touching code. Part 2 scope is conditional on findings.

---

## Part 2 — MCP / API code changes (conditional on Part 1)

1. **Transport.** Verify `/mcp` serves streamable HTTP in the exact shape Copilot Studio expects. If
   OpenAI already consumes it this way, document the confirmation. Fix any gap.
2. **Header-based API key auth.** Add/confirm passing the API key as an **HTTP header** on the MCP
   endpoint (not only URL query param). The chain already has an API-key mode and an SPT header mode —
   check whether header support is already partly there before adding code. **Keep the existing
   query-param path working.**
3. **OAuth 2.0 evaluation.** Assess effort to support OAuth 2.0, ideally with DCR (smoothest Copilot
   Studio onboarding). If it's a large lift, **header-key auth is an acceptable first release** and
   OAuth is a fast follow. **Recommend, do not assume.**
4. **OpenAPI 2.0 spec (if needed).** If research shows the custom-connector route still needs a Swagger
   spec, produce one for `/mcp` with the required MCP streamable markers.
5. **Tool discovery hygiene.** Copilot Studio shows tool names/descriptions/input-schemas to the maker.
   Review that exposed names/descriptions read cleanly to a non-Fodda user. Consider a **curated tool
   subset** for this channel (as we already filter tools for the OpenAI integration) to cut latency/clutter.
6. **Source header.** Add a `X-Fodda-Source` value for Microsoft-origin traffic (e.g. `copilot`),
   consistent with `mcp` / `app` / `web` / `api`.

---

## Where to register / boundaries

- **Cross-repo hand-off:** any change to the auth **middleware or metering that lives in the Fodda API
  repo is NOT yours to edit.** Produce an **API Agent brief** for those (header-key mode in middleware,
  OAuth/DCR server work, the `copilot` source value wherever the API reads it) and hand off — do not
  reach into the API repo, and do not spin up subagents to do its work.
- Website work (Part 3 of the source) is a **separate Website Agent brief** — not in scope here.
- Curated-tool-subset + tool schemas + transport + OpenAPI spec live in this repo.

## Definition of Done

- [ ] Part 1 findings summary delivered to Piers **before** any code change (what's required today, what changed).
- [ ] Transport confirmation documented (with the OpenAI-consumption evidence) or gap fixed.
- [ ] Header-based API-key auth working on `/mcp`, query-param path still works — verified with a real request.
- [ ] OAuth 2.0/DCR effort assessed with a clear recommend/defer call.
- [ ] OpenAPI 2.0 spec produced **only if** research says it's needed.
- [ ] Tool-discovery review done; curated Microsoft subset decision recorded.
- [ ] `copilot` (or agreed value) added to `X-Fodda-Source` for MCP-origin Microsoft traffic; API-side
      pieces handed to the API Agent via brief.
- [ ] Any API-repo work captured as a routed API Agent brief.
- [ ] `CHANGELOG.md` updated; each item states a real verification result.

## Do Not

- Do NOT build OneLake shortcut sync, Fabric IQ integration, or route any customer internal data through Fodda.
- Do NOT make Fodda an orchestrator over a customer's internal data.
- Do NOT build the Fabric-agent-as-MCP-client path (research task 4 is feasibility only).
- Do NOT start Part 2 before the Part 1 findings gate.
- Do NOT edit Fodda API or Fodda Website code directly — hand those off as briefs.

## Files Expected to Change

| File | Change |
|---|---|
| MCP transport / server entry for `/mcp` | Confirm/adjust streamable HTTP; header-key auth |
| MCP tool exposure / manifest | Curated Microsoft subset + description hygiene |
| `X-Fodda-Source` handling (MCP side) | Add `copilot` value |
| New OpenAPI 2.0 spec for `/mcp` | **New** — only if research requires it |
| `CHANGELOG.md` | Document changes + verification |
| `Fodda API/briefs/…` (API Agent brief) | **New** — hand-off for auth-middleware/OAuth/API-source work |

---

# CORRECTION NOTE (added 2026-07-25, after reviewing your implementation plan)

Good work on the transport finding and on handling the cross-repo boundary correctly (producing an
API Agent brief instead of editing the API repo — that is exactly right). Four corrections.

### 1. OAuth 2.0 assessment is MISSING — and it is not greenfield
Part 2 item 3 asked for an **effort assessment with an explicit recommend-or-defer call.** Your plan
researched what Copilot Studio *supports* but never assessed the Fodda side, and never made the call.

Important context you missed: **`src/index.ts` already contains partial OAuth scaffolding.** It
advertises `.well-known/oauth-protected-resource/mcp` and returns a `WWW-Authenticate: Bearer
resource_metadata=...` challenge, but token resolution is explicitly **not** implemented (there is a
hardcoded error telling callers to use header API-key auth instead). That materially changes the
effort estimate. Redo the assessment against what already exists, then **recommend or defer, explicitly.**

### 2. Tool-discovery hygiene was dropped entirely
Part 2 item 5 is absent from your plan. Copilot Studio shows **every** discovered tool's name,
description and input schema to the maker — all 30+ of ours. Required:
- Review that exposed tool names/descriptions read cleanly to a **non-Fodda** maker.
- Decide on a **curated subset for this channel** (as we already filter tools for the OpenAI
  integration) to cut latency and clutter, and record the decision either way.

If you intend to defer a brief requirement, **say so explicitly** — do not drop it silently.

### 3. Findings need citations + dates
The brief said to confirm against **live** docs and note anything changed since the source date. Your
findings carry no sources or dates, which makes them unreviewable. Add a source link + date checked
per finding. **Specifically verify this claim before we rely on it:** *"BYO MCP Server registration in
the M365 Admin Center using the Agent 365 CLI and Agent 365 Tooling Gateway."* It is unusually
specific and could not be corroborated — if it is not real, remove it.

### 4. Header auth already works — document the key-prefix dependency
Confirmed in `src/index.ts`: the auth chain already resolves **`X-API-Key` header → `Authorization:
Bearer <key>` → `?api_key=` fallback**, and CORS already allows `X-API-Key`. So Part 2 item 2 is
verification, not new code — as you framed it. **But:** an API key is distinguished from a Clerk JWT
purely by the **`sk_live_` / `sk_trial_` prefix**. A maker pasting any other token shape will get
confusing failures. Document this explicitly for makers and pass it to the Website Agent for the
setup copy.

### Nits
- `source=copilot` **query param** is beyond the brief (which asked only for an `X-Fodda-Source`
  value). Either way it is client-declared — treat that analytics as self-reported, not trusted.
- A hand-written `docs/openapi-mcp.yaml` will drift. Fodda API already has
  `scripts/generate_openapi.ts` and `scripts/verify_openapi_parity.ts` — prefer generating the spec
  and bringing it under that parity check.

---

# CORRECTION NOTE 2 (added 2026-08-06, after reviewing the v1.40.0 walkthrough)

The implementation is approved — the architecture is right, the curated `/copilot` subset is well
chosen, and you applied the earlier corrections (API brief landed correctly in `Fodda API/briefs/`,
query-param regression tested, "Agent 365" claim verified and removed as fictitious). Verified in the
repo: `/copilot` endpoint, `.well-known/copilot` card, 17-tool subset, version 1.40.0. Good work.

**Two claims in the walkthrough overstate what was actually shown. Both need re-doing and re-stating.**

### 1. The test suite does NOT prove authentication — it proves key extraction
`scratch/test_microsoft_ready.ts` used the fake key `sk_live_test` and reported 200 on all four auth
paths. But in `src/index.ts` the key at that point is **extracted, not validated** — there is no
verification against the API in the `initialize` path; validation happens downstream on the real tool
call. Those 200s therefore prove only that *the endpoint accepts a key in that header position and
issues a session*. **`sk_live_garbage` would return 200 identically.**

So "empirical verification evidence" and "Verified native support for `Authorization: Bearer`" claim
more than was demonstrated. Required:
- Re-run with a **real key**, including a `tools/call` that returns actual data (not just `initialize`).
- Add a **negative test**: an invalid key must be rejected.
- Then **restate the result honestly** — say what was proven and what was not.

Why it matters beyond bookkeeping: if a bad key is only rejected downstream, a Copilot Studio maker
who pastes the wrong key gets a confusing late failure instead of a clean error at connect time —
exactly the failure mode flagged in Correction Note 1 item 4. If that is the behaviour, say so.

### 2. The hygiene audit covered one tool, not the catalogue
The walkthrough says tool descriptions "have been audited"; the change polished **`list_graphs`**
only. 26 occurrences of internal jargon remain in `src/toolHandlers.ts`. Most are harmless (code
comments, type exports) — but at least one is **maker-visible**, because Copilot Studio renders input
schemas to the maker:

```
src/toolHandlers.ts:999
  .describe('If true, skip applying any enabled skills (Paralogy, Igloo, etc.) for this query only…')
```

"Paralogy, Igloo" is meaningless — and faintly alarming — to a Microsoft customer.

**Required:** sweep **all 17 curated tools'** names, descriptions, AND input-schema `.describe()`
strings for internal product names and jargon. Report what you changed. Code comments and type names
are out of scope; anything a maker can see is in scope.

### Standing rule (applies to every future walkthrough)
Do not write a verification claim in the past tense unless the check actually ran and you can show
its output. If a check was partial, say which part. "Audited" and "verified" are claims we act on.

---

# CORRECTION NOTE 3 (added 2026-08-06) — STOP: customer-facing prices are wrong

The E2E auth work and the connect-time 401 enforcement are **good** — that is exactly right, and the
hygiene sweep across all 17 tools is the right scope. **But the pricing rewrite in that sweep is wrong
and must be fixed before this ships.**

You replaced legacy price strings with numbers you described as "canonical pricing" — but you did not
read them from the source of truth. The rewritten values (`brand_tracker` → 1 token, `consult_analyst`
→ 1 token/turn, `deep_research_topic` → 50/100 tokens, `search_graph` → 1 token/query) match neither
the legacy strings nor the token costs in `metering.ts`. They appear to have been reconstructed from
memory. These strings render to Microsoft makers inside Copilot Studio.

**Do not take corrected figures from this note.** No dollar values are quoted here on purpose — get
them from the source below.

### Required fix
1. **AIRTABLE is the source of truth for pricing** (confirmed by Piers, 2026-08-06). Read each price
   from Airtable and quote it exactly.
2. **Offering pricing is a different rate** from the SPT per-token rate in `metering.ts` — the two are
   NOT interchangeable, and `SPT_RATE_CENTS` must not be used to compute an offering price. Confirm
   which rate applies to each tool in Airtable before writing any number.
3. **Do not invent, round, or "correct" a price from memory.** If a price looks legacy or wrong,
   **stop and ask Piers.**
4. For every price you write, **state where you read it** so it can be checked.
5. `search_graph` is **weight-based**, not a flat per-query cost. Describe it accurately or omit the
   number rather than guess.

### Root cause worth noting
The failure was confidence without a source — "canonical" was asserted, not read. (The reviewer made
the same mistake while checking this: computing offering prices from the SPT rate produced equally
wrong figures. Which is the point: **if the number wasn't read from Airtable, it isn't a price.**)

---

## AUTHORITATIVE PRICING — read from Airtable `Offerings` + `Query Pricing`, 2026-08-06

Base `appXUeeWN1uD9NdCW` · `Offerings` (tbl93DJ627r81zKVP) · `Query Pricing` (tblHsMfyoW39LqCv8).
**Copy these. Do not derive, round, or recompute anything.**

> **NEVER SAY "TOKENS."** House rule: express cost as **API calls** and the published USD price.
> Delete every "N tokens" / "via SPT" phrasing you find in maker-visible text.

| Tool (`/copilot` subset) | Published price | Typical calls | API calls charged |
|---|---|---|---|
| `get_my_account` | Free | 1 | free |
| `list_graphs` | Free | 1 | free |
| `list_analysts` | Free | 1 | free |
| `check_supplemental_status` | Free | 1 | free |
| `check_research_status` | Free | 1 | free |
| `get_evidence` | **$0.50** | 1 | 5 (`standalone_evidence`) |
| `search_statistics` | **$0.50** | 1 | 5 (`standalone_statistics`) |
| `search_insights` | **$0.50** | 1 | 5 (`standalone_insights`) |
| `consult_analyst` | **$15** | 3 | 5 (`expert_agent`) |
| `search_graph` | **$20** | 4 | 15 (`topic_research`) |
| `get_company_earnings` | **$20** | 4 | (`earnings_company`) |
| `read_url` | **$20** | 4 | 15 (`url_as_prompt`) |
| `brand_tracker` | **$30** | 6 | 20 (`brand_intelligence`) |
| `get_supplemental_context` | **$45** | 9 | 5 (`standalone_supplemental`) |
| `deep_research_topic` — light | **$55** | 11 | 20 (`deep_research_light`) |
| `deep_research_topic` — heavy | **$100** | 19 | 30 (`deep_research_heavy`) |
| `get_capabilities` | **Free** (row added 2026-08-06) | 1 | free |
| `get_validated_trends` | **$25** (`earnings_validated_trends`) | 5 | — |

Also correct these two, which are NOT in the `/copilot` 17 but were wrongly repriced in the same sweep:
`get_earnings_intelligence` = **$30** · `get_earnings_divergence` = **$20**.

**Every price you wrote was wrong**, including `read_url` (you wrote $0.50; Airtable says $20).

> **Table re-verified against live Airtable 2026-08-06 17:44**, after Piers corrected the data.
> Earlier drafts of this note showed `brand_tracker` at $10 and flagged unresolved tool/offering
> disagreements — those are **resolved**; the values above are current. Still: **re-read Airtable at
> edit time** rather than trusting this table, per the rule that started this whole correction.

### `deep_research_topic` needs BOTH modes
Its Airtable row now reads $100 (heavy) and its `bills_as` is the literal string
`"deep_research_light/heavy"`, which is **not a key** — any lookup resolves to nothing. Show both
modes in the description ($55 light / $100 heavy). Do not collapse it to one number.

### `bills_as` — DO NOT "fix" or delete it (reviewer correction)
An earlier version of this note called `deep_research_topic.bills_as = "deep_research_light/heavy"`
a broken reference. **That was wrong.** `scripts/seed_offerings.ts:508` does
`tool.bills_as.split('/')[0]` — the slash form is **by design** and resolves to `deep_research_light`.
Deleting the field is unsafe: `functions/v1/analysts.ts:1605` falls back to `offering.key`, and
`deep_research_topic` is **not** a valid `InteractionType` in `metering.ts`, so billing lookup would
break. Leave it alone.

One genuine pointer oddity remains, for Piers not the agent: `get_earnings_divergence.bills_as`
points at `earnings_intelligence` ($30) rather than the dedicated `earnings_divergence` offering
($20), though its own price is correctly $20.

---

# CORRECTION NOTE 4 (2026-08-06) — the pricing sweep still has not happened

The walkthrough re-issued after Correction Note 3 contains **the same wrong prices**, plus two new
ones. The auth work (connect-time 401, RFC 9728 challenge, positive `tools/call`, two negative
tests) is **approved** — this note is only about pricing and phrasing.

Wrong in the current walkthrough:

| Written | Correct (Airtable) |
|---|---|
| `search_graph` "1 token ($0.50 via SPT) per query" | **$20** |
| `brand_tracker` "1 token ($0.50 via SPT) per report" | **$30** |
| `consult_analyst` "1 token ($0.50 via SPT) per turn" | **$15** |
| `deep_research_topic` "light 50 tokens/$25 · heavy 100 tokens/$50" | **$55 / $100** |
| `get_earnings_intelligence` "1 token ($0.50) per query" *(newly broken)* | **$30** |
| `get_earnings_divergence` "1 token ($0.50) per query" *(newly broken)* | **$20** |

Two further points:
1. **Every one of those still says "tokens" / "via SPT" — and that phrasing must never appear.**
   **SPT pricing is machine-only** (agent-to-agent billing plumbing). A Copilot Studio maker reads
   these descriptions on screen, so they are a **human-visible surface** and must show the
   **published USD price from Airtable** — nothing else. Do not show SPT rates, token counts, or any
   figure derived from `TOKEN_COSTS × SPT_RATE_CENTS`. Example: `brand_tracker` is **$30** (Airtable
   published). It is *not* $10 (its SPT rate) and *not* $0.50 (what you wrote).
2. **"Audited and confirmed clean" is false** for at least `read_url` (*"Uses 15 tokens ($7.50 via
   SPT)"* — banned phrasing AND wrong price; actual **$20**) and `get_company_earnings` (*"Uses 0–15
   tokens depending on view"*). Both were listed as clean. Re-check every tool you marked clean.

### Also: "tokens" language exists in the Airtable descriptions themselves
These source descriptions violate the new house rule and will propagate if copied verbatim:
- `read_url`: *"Uses 15 tokens ($7.50 via SPT)"* — also contradicts its own $20 published price.
- `get_company_earnings`: *"Uses 0–15 tokens depending on view…"*
- `get_earnings_intelligence`: *"Uses 5 tokens ($2.50 via SPT)"*

Flag these to Piers for correction at source. Do **not** silently rewrite Airtable content — and do
not copy the "tokens" phrasing into the Copilot-facing descriptions.

---

# CORRECTION NOTE 5 (2026-08-06) — pricing APPROVED; one string left

**The pricing sweep is correct and verified against source.** Confirmed in `src/toolHandlers.ts`:
`via SPT` is now 0 occurrences; `read_url` reads `Price: $20 per URL lookup.` (was
*"Uses 15 tokens ($7.50 via SPT)"*); `deep_research_topic` shows both modes
(`$55 (light mode) or $100 (heavy mode)`); all 16 price strings match Airtable; `bills_as` correctly
left untouched. The remaining `token` hits are code internals (`sptCtx.token`, `overage_tokens`, a
local `nameTokens`) and are fine. Good work — this one is done properly.

### One fix: internal skill names still visible to Microsoft makers

`src/toolHandlers.ts:999` — the `skip_skills` parameter of **`search_graph`**, which IS in the
`/copilot` 17, so Copilot Studio renders it:

```
skip_skills: z.boolean().optional().describe('If true, skip applying any enabled skills
  (Paralogy, Igloo, etc.) for this query only. …')
```

**Piers's instruction: no Paralogy/Igloo in the Microsoft-facing code.** Rewrite this `.describe()`
so it names no internal skills — describe the behaviour generically (e.g. "skip applying any enabled
skills for this query only"). Do not remove the parameter or change its behaviour; this is wording
only.

**In scope: line 999 only.** `toggle_graph_preference` (line 2978) also names Paralogy/Igloo, but it
is **not** in the `/copilot` 17, so it is never shown to a Microsoft maker — leave it alone.
Line 443 is a code comment — also out of scope.

### Nit
`consult_analyst` is priced correctly at $15 but described as "per query"; it bills **per turn**.
Match your own walkthrough wording: `Price: $15 per turn.`
