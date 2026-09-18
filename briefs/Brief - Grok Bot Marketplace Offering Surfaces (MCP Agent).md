# Brief: Grok Bot Marketplace Offering Surfaces

**To:** Fodda MCP Agent (`mcp-agent`)
**From:** Claude
**Date:** 2026-09-17 (rev 2 — supersedes the 2026-09-15 version)
**Type:** Marketplace surface configuration + launch verification
**Status:** Milestone 1 ready now (zero code). Milestone 2 blocked on the Milestone 1 result.
**Files Expected to Change:** none for Milestone 1. Milestone 2: `src/index.ts` (`OFFERING_SCOPED_TOOLS`), `src/test_grok_offering_surfaces.ts` (new).

---

## 1. What changed in rev 2

Rev 1 proposed two bots — `grok-trends` (broad) and `grok-earnings` (narrow) — run as a
broad-versus-narrow conversion test. Two research passes (a hackathon-transcript scan and a
marketplace census) plus review corrected that. **Four things in rev 1 were wrong:**

1. **The broad-vs-narrow framing is dropped.** xAI's own guidance is that scoped roles perform
   better, so the test had a foregone conclusion. Bots are positioned as colleagues with a
   recognisable job and a finished output, not as search surfaces.
2. **`Fodda-Trends` is dead as a name.** A general "trends bot" fights the platform's grain. The
   flagship is a role: **Fodda Brand & Account Context Analyst** — named for the job the census
   found most demand for, not for an abstract "market context" capability.
3. **`X-Fodda-Source` does not measure conversion.** Rev 1 claimed it did. It measures
   *post-connection usage attribution* — it fires only after someone has already connected.
   Everything upstream (listing view, template opened, bot added, OAuth started) is invisible to us.
   See §7.
4. **The `grok-trends` allowlist was far too big** — 25 tools including `get_node`,
   `get_neighbors`, `get_label_values`. That exposes Fodda's internal ontology rather than user
   jobs, and violates the standing preference for fewer tools on context-budget grounds.

**Also corrected:** rev 1 stated that a custom MCP connector does not survive a template copy, on
the strength of two secondary write-ups. That is the **leading hypothesis, not a finding.** It has
not been tested. §3 tests it.

### What rev 1 got right and is preserved

The OAuth machinery, the slug mechanism, tool scoping, source attribution and the manual portability
test all stand. None of it needs building:

- `GET /.well-known/oauth-protected-resource[/:slug]` (`src/index.ts:172`) advertises Clerk.
- An anonymous `initialize` returns `401` + `WWW-Authenticate` (`src/index.ts:1218`), which is what
  makes a compliant client start the OAuth flow.
- Clerk JWT → Fodda account resolution via `POST /v1/auth/clerk-resolve`.
- `OFFERING_SCOPED_TOOLS` (`src/index.ts:189`) scopes tools per URL slug and sets `X-Fodda-Source`.
- `functions/v1/oauthProbe.ts` (API repo) probes the Fodda half of the flow daily.

### Current state elsewhere in the estate

- **`expert-consult` is a live slug** (`src/index.ts:255`). Expert access does not need designing.
- **`verify_claim` is already briefed** (API repo, `Brief — verify_claim Verification Skill`),
  decoupled from Grok, and buildable independently. It is capability-critical here — see §5.
- **The earnings sector bug is fixed** (API `ff2b0d6`, 2026-09-16): `sector="beauty"` no longer
  returns NKE/LULU, and out-of-domain sectors fail clean instead of being web-filled. The
  live-coverage resolution path within that fix is still unverified against real Airtable data.

### The layer strategy — why a crowded category is the target, not a warning

The census's largest cluster is account and pre-call research (~21 listings, directional). An earlier
reading of this brief treated that crowding as a reason to stay out. That was wrong, and the
correction matters enough to state plainly:

**Fodda is not selling a bot into that category. It is selling the context layer those bots
consume.** Account research has two halves — *who* (contacts, org charts, buying committee, tech
stack) and *what is happening in their world* (category shifts, competitive moves, earnings signals,
supporting and contradicting evidence). Those bots already source the first half from CRM and contact
connectors. The second half is exactly what Fodda has and they do not. Twenty-one listings doing
account research are twenty-one potential MCP consumers, not twenty-one competitors.

This is the difference between the two layers:

- **The MCP** is the product. Its target is the account-research cluster and anyone else who needs
  company and category context with evidence.
- **The Fodda bot** is the demonstration — it makes the layer visible and installable, and it is how
  someone discovers the MCP in the first place.

What Fodda must not promise, in a bot or in a tool description: buying committees, contact data,
technology stacks, sentiment scores or distribution footprints. No authoritative source exists for
any of them.

### On the marketplace census

Counts are **directional supply signals, not demand**. Date-stamp every figure: an independent check
found **69 listings on 2026-09-15**; the census found **72 on 2026-09-17**. A market moving 4% in two
days is too immature to read as saturation or whitespace. Zero standalone earnings bots means
*untested*, not *unwanted*. Do not repeat the census's derived scores — several are internally
inconsistent (including one out of range) and are being re-verified separately.

---

## 2. Two milestones, deliberately separated

| | Milestone 1 — Technical pilot | Milestone 2 — Marketplace flagship |
|---|---|---|
| Bot | Earnings Context Analyst | Fodda Brand & Account Context Analyst |
| Slug | `earnings-intelligence` (live today) | `grok-brand-context` (new) |
| Code needed | **None** | One additive slug + a test |
| Purpose | Answer the portability/OAuth questions | The product people install |

Earnings is **not demoted**. It is the only surface that can run the gating test this week with zero
implementation, and it becomes a visible workflow inside the flagship — and a candidate spinout later
if usage supports one.

---

## 3. Milestone 1 — the technical pilot (do this first, no code)

Configure an Earnings Context Analyst bot on a Fodda-owned account against
`https://mcp.fodda.ai/earnings-intelligence`, complete OAuth, share it as a template, then add it
from an **unrelated throwaway account** and ask a question that requires Fodda.

Record each of these as an observed fact, not an expectation:

- Does the custom MCP connection travel with the template?
- Are credentials correctly excluded (the recipient gets their own auth prompt)?
- Does the OAuth flow begin, and does redirect handling succeed?
- Does the copied bot see the intended tools?
- Is `X-Fodda-Source: earnings-intelligence` preserved on the copy's calls?
- When Fodda is absent, does the bot say so — or does it silently substitute web browsing?

That last one is the failure that matters most, because it makes a broken install look like a
working one.

**Use the live slug exactly as it is.** Its allowlist currently includes `get_node`,
`get_neighbors` and `get_label_values`, which Milestone 2 excludes on principle. Do not strip them
to run this test: it is a live surface with its own consumers, and the pilot is about connection
behaviour, not tool curation.

**Outcomes:**

- **Connection travels + OAuth completes** → the rev 1 hypothesis was wrong. Say so loudly; the
  go-to-market simplifies considerably.
- **Connection travels, OAuth fails** (the reported `redirect_uri` bug) → blocked on an xAI fix.
  Capture the exact error and stop.
- **Connection does not travel** → the template distributes *instructions only*. The bot's own
  instructions become the entire onboarding mechanism, and the funnel gains a manual stage.

---

## 4. Milestone 2 — the flagship slug

Add **one** new entry to `OFFERING_SCOPED_TOOLS`: `grok-brand-context`.

Job, stated as an outcome: **put a company or brand in expert-grounded market context before a
meeting, a pitch or a decision** — the category shifts that affect it, the competitive moves around
it, evidence for and against the story, and what to ask next. Additive only — do not edit
`earnings-intelligence`, `expert-consult`, `copilot`, `chatgpt` or any other live offering.

### Allowlist — business capabilities only

```
get_capabilities
get_domain_intelligence
brand_tracker
discover_adjacent_trends
get_earnings_intelligence
get_evidence
find_expert
verify_claim          ← only once the API-side verdict field has shipped
```

**Explicitly excluded, and why:**

- `get_node`, `get_neighbors`, `get_label_values` — internal graph primitives, not user jobs.
- `consult_human_agent`, `request_expert_intro` — these spend money and take a real person's time.
  `find_expert` is read-only discovery; consultation is an escalation the user approves, and it
  lives on `expert-consult`, which already exists for exactly this.
- `deep_research_topic` — heavyweight multi-call operation; wrong thing for a marketplace visitor
  to trigger by accident.
- `get_my_account`, `generate_visual`, `read_url` — admin and generic utilities that add context
  cost without serving the defined output.

**`get_earnings_divergence` is deliberately absent.** It is a *cross-coverage deflection scan*
("what topics are companies dodging this quarter?"), computed over earnings-call analyst Q&A and
clustered by period/sector/industry. It is **not** a general market-divergence capability, and the
census's "market pulse" framing must not be used to stretch it into one. It stays in the earnings
surface. A general divergence capability, if wanted, is separate work.

### Do not build wrapper tools yet

An earlier draft proposed eight task-shaped wrappers (`build_market_context`,
`research_company_in_context`, …). Rejected for now: the capability already exists under different
names. `brand_tracker` *is* "put a brand in market context"; `get_domain_intelligence` *is* "build
category context". The real gap is **naming and description**, not capability — see §5. Add a
wrapper only when task-level evaluation shows Grok routing badly and better descriptions have
already failed to fix it.

---

## 5. Tool descriptions — read this before editing any string

**`npm run build` runs `scripts/sync-descriptions-from-airtable.mjs` *before* `tsc`.** It reads the
Offerings table (`tbl93DJ627r81zKVP`) and regex-rewrites the description in `server.tool('<name>',
'...')` for every tool with a row. **Hand-edits in `toolHandlers.ts` are silently reverted on the
next build.** Worse, the script exits 0 when `AIRTABLE_API_KEY` is unset, so a local build can
appear to keep an edit that CI discards.

So, for every tool on the new allowlist, step 1 is *determine who owns its description*:

- **Airtable row exists** → edit in Airtable, run the sync, confirm it landed.
- **No row** → edit in code.

This overlaps with the existing P1 brief *"Tool Descriptions Must Name the Live Verticals and the
Layers"* (filed 2026-09-17). **Coordinate with it rather than duplicating it** — that brief already
covers naming the verticals and layers and adding a `brand_tracker` routing line.

A good description states: when to use the tool, what question shape it answers, what it returns, how
it differs from a general web search, and what happens when coverage is thin. `brand_tracker` is the
clearest case — the name alone could mean mention-tracking, health-monitoring, metric comparison or
context retrieval, and Grok cannot pick correctly from the name.

Routing guidance belongs in **both** the bot instructions (overall workflow) and the tool
descriptions (per-call selection).

---

## 6. Bot instructions are a first-class deliverable

Under the leading hypothesis, instructions are the only thing that survives a template copy — which
makes them the onboarding mechanism, not documentation. Both bots need:

- The job, stated as an outcome rather than a capability list.
- The finished-output contract: relevant market shifts, why they matter to the question, evidence
  with links and dates, named companies or brands, contradicting evidence, strategic implications,
  and explicit confidence boundaries including what is missing.
- Source hierarchy and citation rules; what to do when Fodda coverage is thin.
- **A connection self-check.** If the Fodda tools are absent, say so plainly and give the one-line
  setup step. Never substitute web browsing for a Fodda answer and present it as Fodda's.
- Human escalation only on explicit user approval, never automatically.

---

## 7. Measurement — be honest about what we cannot see

The funnel is: listing view → template opened → bot added → connector instruction shown → OAuth
started → OAuth completed → first successful tool call → first completed output → second session →
routine created.

**Fodda can observe only from OAuth completion onward.** Everything before it happens inside the
marketplace. `X-Fodda-Source` tags calls *after* connection — useful for comparing usage between
surfaces, useless for measuring install-to-connect drop-off. Any claim about conversion must say
which of these stages it actually covers, and rev 1's claim that attribution measures conversion
must not be repeated.

---

## 8. Definition of Done

**Milestone 1** — a written record of all six observations in §3, each as an observed result, with
the exact error text for any failure. No code, no PR.

**Milestone 2** (only after Milestone 1 reports):
- [ ] `tools/list` on `/grok-brand-context` returns exactly the §4 allowlist — paste the real list.
- [ ] Assert both directions: every intended tool present, and `get_node` plus `deep_research_topic`
      absent.
- [ ] Anonymous `initialize` on the slug returns `401` + the slug-specific `WWW-Authenticate` header.
      Paste the raw header.
- [ ] `.well-known/oauth-protected-resource/grok-brand-context` returned and pasted.
- [ ] A fanned-out call carries `X-Fodda-Source: grok-brand-context`.
- [ ] Every other offering's tool list is byte-identical — show the diff is additive only.
- [ ] For each allowlisted tool, state whether Airtable or code owns its description.
- [ ] `npm run build` clean.

---

## 9. Do Not

- Do not build OAuth, discovery, DCR or Clerk resolution — all of it ships today.
- Do not edit any existing offering slug's tool list.
- Do not hand-edit a tool description without first establishing who owns it (§5).
- Do not add `consult_human_agent` or `request_expert_intro` to a marketplace surface.
- Do not add `get_earnings_divergence` to the market-context surface, or describe it as general
  market divergence.
- Do not build wrapper tools before evaluation shows descriptions cannot fix routing.
- Do not change `MCP_ALLOW_ANONYMOUS` or enable SPT on these slugs.
- Do not quote marketplace counts without a crawl date, or treat absence of a listing as absence of
  demand.
- Do not touch API endpoints or `metering.ts` — produce the companion API brief instead.

---

## 10. Handoff to `api-agent` — unattended routine spend

Grok routines run on schedules, webhooks and signals. A routine calls Fodda unattended, with no human
per call. The Base-free 50-call daily cap contains this for free accounts, but is **fully bypassed
when `account.hasPaymentMethod === true`** — so a carded user with an hourly routine against a
heavyweight tool has no ceiling.

This is a **launch constraint, not a follow-up**. Before any recurring Fodda workflow is promoted,
decide: account-level monthly ceiling, daily routine limits, threshold warnings, retry-loop
protection, visible usage reporting, predictable insufficient-credit behaviour, and whether
heavyweight tools may run unattended at all. It is an API brief when it becomes one.
