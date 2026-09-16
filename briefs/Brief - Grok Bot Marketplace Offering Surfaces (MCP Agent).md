# Brief: Grok Bot Marketplace Offering Surfaces

**To:** Fodda MCP Agent (`mcp-agent`)
**From:** Claude (review of Fodda × Grok Bot briefing, 2026-09-15)
**Date:** 2026-09-15
**Type:** Offering surface configuration + launch verification
**Status:** Ready for Build
**Files Expected to Change:**
- `src/index.ts` (`OFFERING_SCOPED_TOOLS`)
- `src/test_grok_offering_surfaces.ts` (new)

---

## 1. Context

xAI's Grok Bot template marketplace lets a configured bot — identity, instructions, connected MCP
server, routines — be shared as a link that visitors copy into their own account. Fodda wants two
bots on it: **Fodda-Trends** (broad, general-purpose) and **Fodda-Earnings** (narrow specialist),
run as a paired conversion test of broad-vs-narrow positioning.

**The acquisition mechanism described in the source briefing is already built.** Do not build it
again. What exists in `src/index.ts` today:

- `GET /.well-known/oauth-protected-resource[/:slug]` (line 172) advertises Clerk
  (`CLERK_ISSUER`, default `https://clerk.fodda.ai`) as the authorization server.
- An anonymous `initialize` gets `401` + `WWW-Authenticate: Bearer resource_metadata="…"`
  (line 1218), which is what makes a compliant MCP client auto-start the OAuth handshake.
- Clerk JWT → Fodda API key resolution runs through `POST /v1/auth/clerk-resolve` (line 1127),
  landing the user as a real Fodda account.
- `MCP_ALLOW_ANONYMOUS` is the existing gate-everything-vs-open switch. Current production policy
  is **full gate**, which answers the source doc's "design decision still open" — it is already
  decided in code. Changing it is a Piers decision, not part of this build.
- The API side runs a daily unauthenticated live probe of the whole flow (discovery → DCR on
  `clerk.fodda.ai` → PKCE authorize handoff → consent config) in `functions/v1/oauthProbe.ts`.
  The Fodda half of the handshake is therefore already monitored; what is untested is the **Grok
  client half** (the reported `redirect_uri` failure), which is a manual test, not a code task.

`OFFERING_SCOPED_TOOLS` (line 189) already provides exactly the per-bot mechanism these two bots
need: the first path segment selects a tool allowlist, and `defaultSource` (line 1201) sets
`X-Fodda-Source` to that slug for every upstream call. So per-bot tool scoping **and** per-bot
attribution for the conversion test come for free once the slugs exist.

### What the 2026-09-15 launch session adds

From xAI's own description of how bot templates work: a shared template copies the bot's
**instructions, memories, some working context, and first-party plugins** — and deliberately does
**not** copy sensitive data, stored credentials or chat history. Recipients get their own version to
refine, not a clone.

Two consequences, one good and one dangerous:

- **Good — the acquisition thesis holds mechanically.** Credentials never travel with a template.
  Every recipient must authenticate as themselves, which is precisely what the 401 +
  `WWW-Authenticate` handshake triggers. There is no shared-credential path that would let a copied
  bot ride the template author's account.
- **Dangerous — the custom MCP connector does not travel.** Two independent write-ups of the
  template marketplace (aibuilderclub, basenor; both secondary, neither official xAI documentation)
  state it directly: templates carry identity, instructions, skills, routines, selected memories and
  **first-party** integrations, and explicitly exclude "custom MCP servers and scripts", logins, API
  keys and conversation history. `mcp.fodda.ai` is a custom connector. Both sources independently
  advise that a bot depending on an MCP server "needs to tell the recipient what to connect."

  So the copied bot arrives with instructions referencing Fodda tools it does not have — and because
  Grok bots have their own computer and are designed to "go do things on their own even without the
  perfect level of access", it will quietly browse `fodda.ai` instead. Degraded answer, no
  attribution, no billing, no OAuth prompt, and no error anyone sees.

  **Treat this as the expected outcome, not a risk.** The source briefing's Section 1 acquisition
  mechanism — copy bot → first tool call triggers OAuth → user lands as a Fodda account — does not
  work unmodified. §2C is now a confirmation step, not an open question, because the sources are
  secondary and one real template copy settles it.

This brief is therefore small on purpose: add two slugs, prove the handshake and the attribution,
and prove the template actually carries the connection.

---

## 2. What to build

### A. Add two offering slugs to `OFFERING_SCOPED_TOOLS`

**`grok-trends`** — the general-purpose bot. Despite the product name, it must not be
trends-only; it routes across whatever the question needs:

```
get_capabilities, search_graph, search_statistics, search_insights,
get_report_intelligence, get_domain_intelligence, discover_adjacent_trends,
get_validated_trends, brand_tracker, get_company_earnings,
find_expert, consult_analyst, consult_human_agent, list_analysts, request_expert_intro,
get_evidence, get_node, get_neighbors, get_label_values, list_graphs,
get_my_account, generate_visual, read_url,
get_supplemental_context, check_supplemental_status
```

**`grok-earnings`** — the specialist. Start from the existing `earnings-intelligence` list and add
the consult tools, because the source briefing scopes Executive Tracker personas into this bot and
`earnings-intelligence` does not currently carry them:

```
get_capabilities, get_earnings_intelligence, get_earnings_divergence,
get_company_earnings, get_validated_trends,
consult_analyst, list_analysts,
search_graph, get_evidence, get_node, get_neighbors, get_label_values,
list_graphs, get_my_account, generate_visual
```

Add the two slugs as **new entries**. Do not edit `earnings-intelligence`, `copilot` or any other
existing offering — they are live surfaces with their own consumers.

### B. Prove the surfaces with a live test

New `src/test_grok_offering_surfaces.ts`, following the shape of the existing
`src/test_identity_gap.ts` (it already asserts on `X-Fodda-Source` fan-out, line 195):

1. `GET /.well-known/oauth-protected-resource/grok-trends` returns
   `resource` ending `/grok-trends` and `authorization_servers: [CLERK_ISSUER]`. Same for
   `grok-earnings`.
2. An anonymous `initialize` POST to `/grok-trends` returns `401` with a `WWW-Authenticate` header
   whose `resource_metadata` points at `/.well-known/oauth-protected-resource/grok-trends`.
   Same for `grok-earnings`.
3. An authenticated `tools/list` on `/grok-earnings` returns exactly the allowlist above — assert
   both directions: every listed tool present, and a spot-check that an out-of-scope tool
   (`deep_research_topic`) is absent.
4. A fanned-out upstream call from a `/grok-trends` session carries
   `X-Fodda-Source: grok-trends`, and from `/grok-earnings` carries `X-Fodda-Source: grok-earnings`.
   This assertion is the conversion test — without it the broad-vs-narrow result is unmeasurable.

### C. Prove template portability by hand — do this before anything else ships

Not a code task; a 20-minute manual test that gates the whole channel. Run it first, because a
negative result changes the plan rather than the implementation:

1. Configure a bot on a Fodda-owned account with the `grok-trends` MCP connection and complete the
   OAuth handshake.
2. Share it as a template and add it from a **second, unrelated throwaway account**.
3. On that second account, without touching settings, ask a question that requires a Fodda tool.

Record which of these happens:

- **(c) — expected.** The connection did not carry. The template is a distribution vehicle for
  *instructions only*. The bot's own instructions must then carry the connection step, and the
  funnel gains a manual stage: install → notice Fodda is missing → add `mcp.fodda.ai/<slug>` →
  OAuth → account. Drop-off moves from "did they OAuth" to "did they bother to connect at all",
  and `X-Fodda-Source` only ever fires for people who completed it.
- **(a)** The connection carried and OAuth completed. → The sources are wrong; revert to the
  original plan and say so loudly, because it changes the go-to-market.
- **(b)** The connection carried but OAuth failed (the reported `redirect_uri` bug). → Blocked on an
  xAI fix; capture the exact error and stop.

### D. Write the bot instructions as a carried artifact

Because instructions *do* travel with a template and tool descriptions do not, the routing guidance
("which Fodda tool answers which shape of question") belongs in the **bot instructions**, not only
in tool descriptions. Produce the instruction text for both bots as part of this work.

Under outcome (c) this is not a nice-to-have — **the instructions are the entire onboarding
mechanism**, because they are the only thing that survives the copy. Both bots must open by
establishing whether the Fodda tools are present, and if they are not, say so plainly and give the
one-line setup step (add `https://mcp.fodda.ai/<slug>` as a custom MCP connector, then complete the
sign-in prompt). They must never substitute web browsing for a Fodda answer and present it as
Fodda's — that is the failure mode that makes a broken install look like a working one.

---

## 3. Where to register

- `OFFERING_SCOPED_TOOLS` in `src/index.ts` — the slug map is the only registration point; routing,
  OAuth metadata and source attribution all derive from it.
- No new tools, no new env vars, no transport changes, no schema changes.

---

## 4. Definition of Done

- [ ] `tools/list` on `/grok-trends` and `/grok-earnings` each return exactly their allowlist —
      paste both actual lists into the verification.
- [ ] Anonymous `initialize` on both slugs returns `401` + the slug-specific `WWW-Authenticate`
      header. Paste the raw header.
- [ ] Both `.well-known/oauth-protected-resource/<slug>` documents returned and pasted.
- [ ] `X-Fodda-Source` asserted as `grok-trends` / `grok-earnings` on a fanned-out upstream call.
- [ ] `earnings-intelligence`, `copilot`, `expert-consult` and `chatgpt` tool lists are byte-identical
      to before the change — show the diff is additive only.
- [ ] `npm run build` clean.

---

## 5. Do Not

- Do not build OAuth, discovery, DCR or Clerk resolution. All of it ships today — see §1.
- Do not change `MCP_ALLOW_ANONYMOUS`, and do not open an anonymous or partial-gate lane for these
  slugs. Whether to leave basic search ungated is a Piers decision and is explicitly out of scope.
- Do not enable SPT on these slugs (`ENABLE_SPT` stays as-is); the marketplace lane is OAuth +
  account credits, matching the directory connector policy already in `index.ts`.
- Do not modify existing offering slugs or their tool lists.
- Do not add `deep_research_topic` to either bot — it is a heavy multi-call operation and a
  marketplace visitor on Base tier is the wrong place to fire it by accident.
- Do not touch API endpoints or `metering.ts`. If this work appears to need them, stop and produce
  the companion API brief instead.

---

## 6. Handoff to `api-agent` — unattended routine spend

Not in scope here; flagged because this brief is what makes it reachable.

Grok bots run **routines** on schedules, webhooks and signals — daily digests, and hourly reports
during a launch. A routine calls Fodda tools unattended, with no human in the loop per call.

The Base-free 50-call daily burst cap (shipped 2026-09-05) contains this for free accounts. But that
cap is **fully bypassed when `account.hasPaymentMethod === true`**. So a carded marketplace user who
sets an hourly routine against a heavyweight tool has no ceiling at all. Nothing about that is a
marketplace bug — it is a pre-existing gap that routines make easy to hit by accident.

Whether carded accounts need a spend ceiling (and where it sits) is a Piers decision. If it becomes
one, it is an API brief, not this one.
