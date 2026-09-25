# Brief — MCP Directory Remediation Plan

**Date:** July 31, 2026
**Context:** Fodda's Claude Connectors Directory submission is in escalated (verified) review. This plan closes the gaps found in the compliance audit against Anthropic's [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) and [pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria), while preserving the guided user flows and the SPT payment rail.

**Status:** All decisions resolved (Piers, July 31, 2026). ALREADY IMPLEMENTED on branch `claude/mcp-marketplace-review-09b414` (uncommitted): the `?api_key=` kill — friendly 401 in `src/index.ts` (/mcp + /sse), `/sse` header-auth fix, docs rewritten (README, CLAUDE_CONNECTORS_README, Enterprise_MCP_Setup), `src/test_analyst.ts` header auth. Do not redo Phase 4's query-string item. Everything else below is TO DO, in phase order. Phases 4 and 6 need API-repo coordination; Phase 1 is manifest edits only (the policy pages are already live on fodda.ai).

---

## Phase 1 — Privacy & metadata (small, do first)

The policy pages already exist and are live: `https://www.fodda.ai/privacy`, `/terms`, `/expert-terms` (Website repo, `pages/PrivacyPolicy.tsx`, routed in `App.tsx:249-251`, linked in `Footer.tsx:107`). Nothing new to publish — just wire them up.

1. Add to **both** `server.json` and `fodda_mcp_server.json` (and reconcile their version drift, 1.30.0 vs 1.30.1):
   - `privacyPolicyUrl: https://www.fodda.ai/privacy`
   - `termsOfServiceUrl: https://www.fodda.ai/terms`
   - `supportContact: support@fodda.ai`
2. Add the same links to the A2A agent card (`src/a2aHandler.ts`) and the server root page (`src/index.ts:719-731`).
3. Enter privacy URL + support contact in the Claude.ai submission portal listing.
4. Review the privacy policy body for one addition: explicit mention of MCP/connector data flows (queries received via Claude, logged for billing/analytics, keyed to account email). Current text likely covers it ("query logs are retained for billing and analytics") but an explicit connector sentence removes doubt.

## Phase 2 — Docs must match code (small–medium)

The reviewer's biggest credibility risk: our own docs contradict the code.

1. Rewrite `CLAUDE_CONNECTORS_README.md`, `README.md`, `MCP_AUDIT.md`:
   - Correct tool inventory (30 static tools per `tools-manifest.json`, not 6/7/8).
   - Delete every "all tools are read-only" and "stateless / no data persisted" claim — `sign_up_free_account`, `update_user_profile`, `toggle_graph_preference`, `manage_scheduled_reports`, `send_feedback` all write; `logUserQuery()` (`src/toolHandlers.ts:322-334`) logs query text.
   - Replace with the truthful story that matches the privacy policy: queries are logged for billing/analytics; here's what's stored and for how long.
   - Delete claims for features that don't exist (rate limiting, output schemas, `/.well-known/mcp.json`); either implement rate limiting or stop claiming it.
   - Fix `fk_live_` vs `sk_live_` key-prefix inconsistency.
2. Retract the "eliminates the risk of prompt injection" claim in `SECURITY_PACK.md:27` and the "no query/result text" rows in `SECURITY_PACK.md:38` / `SECURITY_SUMMARY.md:31`.
3. Add a **Troubleshooting** section and **≥3 worked example prompts** to `CLAUDE_CONNECTORS_README.md` (submission requirement).

## Phase 3 — Steering rewrite: keep the flow, change the mechanism (medium)

Principle: reviewers reject *behavioral instructions to the model* ("always do X", "never mention Y", "proactively sell Z"). They do not reject *factual data in tool results*. So we keep every helpful flow by moving it from instruction-space into data-space:

| Current rule (`src/systemPrompt.ts`) | Verdict | How we keep the flow |
|---|---|---|
| `NoWebSearch` (:44-46) + McKinsey/BCG clause (:42) | **Remove** — instructs Claude to disable an unrelated capability; named-competitor suppression | Replace with attribution guidance: "Fodda results come from named expert graphs; when blending with other sources, attribute which insights are Fodda's." Same purity goal, no capability ban |
| `SourceConfidentiality` (:295) | **Remove** — tells model to withhold info from user | Enforce at data layer: don't return confidential source lists in tool output. What the server doesn't send, the model can't leak |
| `GraphFirstRule` (:215) | **Soften** — blanket response-structure mandate | Reword as a when-to-use note in tool descriptions ("results are strongest as the lead evidence") — advisory, tool-scoped |
| 6 upsell rules — `AnalystCrossSell` (:255), `TrialConversionFlow` (:258), `CreditExhaustion` (:261), `LowCreditWarning` (:264), `DocumentUploadCompare` (:273), `ScheduledReportUpsell` (:275) | **Remove from instructions** — "promote products and services" is an explicit rejection trigger | Move to structured fields in tool *results*: `related_capabilities`, `account_status.credits_remaining`, `upgrade_options[]`. Claude relays facts when relevant; nothing instructs it to sell. Error responses on quota exhaustion already carry upgrade links — that part is legitimate error-path UX and stays |
| `PROFILE SOLICITATION` (:485-486) | **Rewrite** — covert elicitation ("do NOT present a form") is a data-collection red flag | Make it transparent and consent-first: "If the user volunteers their role/focus, you may offer to save it for personalization; call `update_user_profile` only with information the user has agreed to save" |
| COST AWARENESS block (:576) | **Keep** — cost transparency helps the review | Also add per-call price to each billable tool's description ("Costs $2.50 per call") — factual, and strengthens the consent story for Phase 5 |
| Deployed-only instructions ("answer from THIS list…") | **Remove** — scripted-answer pattern; also proves deployed instructions drift from repo | Put capability info in `get_capabilities` output; make deployed instructions build from repo source only |

Also: `stripRoutingInstruction()` (`toolHandlers.ts:172`) currently regex-strips `[ROUTING INSTRUCTION:]` blocks from one field of one tool. Fix upstream — stop putting model-directed text in Airtable/API description fields — and extend the strip defensively to all passthrough text fields.

## Phase 4 — Clerk OAuth (medium; the real engineering)

Clerk already runs Fodda's identity (walkthrough_clerk_auth_2026-05-29.md in API repo): `@clerk/clerk-react` frontend, `@clerk/express` backend, webhook that maps `clerkUserId` → Airtable user → auto-provisioned API key. Clerk ships first-class MCP OAuth: [`@clerk/mcp-tools`](https://github.com/clerk/mcp-tools) + [Express MCP guide](https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server).

1. **Clerk dashboard:** enable dynamic client registration on an OAuth application; set default scopes (`profile email`). DCR is what Claude.ai expects.
2. **MCP server (`src/index.ts`):**
   - Delete the deliberate 404s (:53-65). Mount `protectedResourceHandlerClerk` at `/.well-known/oauth-protected-resource/mcp` and `authServerMetadataHandlerClerk` at `/.well-known/oauth-authorization-server`.
   - Add `mcpAuthClerk` middleware on `/mcp`. Token → `authInfo.extra.userId` (Clerk user id).
3. **Identity resolution:** new API-repo endpoint (or reuse `/api/auth/profile`) that resolves `clerkUserId` → Fodda account, plan, API key. The MCP server calls it once per session and proceeds exactly as today with the resolved key — downstream billing/metering unchanged.
4. **Auth lanes after the change:**
   - **OAuth (Clerk)** — the directory-listed connector. What reviewers test.
   - **API key via header** — kept for CLI/enterprise/VS Code; update all docs to header-only.
   - **`?api_key=` query string — KILLED IMMEDIATELY (DECIDED + IMPLEMENTED, Piers, July 31, 2026):** no grace period, given the active Anthropic review. `/mcp` and `/sse` return 401 with a friendly message: "Your Fodda connection link uses an old format and no longer works. Get a new MCP URL at https://app.fodda.ai." `/sse` now honors `Authorization: Bearer` / `X-API-Key` headers (previously it read only the query string); the OAuth-404 message no longer recommends URL keys; README/CLAUDE_CONNECTORS_README/Enterprise_MCP_Setup rewritten around the tokenized URL + headers.
   - **Blast radius is small:** app.fodda.ai already hands out tokenized MCP URLs (`https://mcp.fodda.ai/c/<token>`, Website repo `pages/Connect.tsx:93`; token → Airtable → apiKey via the site's `/api/mcp-tokens/:token` resolver). Those keep working — only legacy `?api_key=` configs break, and they get the friendly redirect. Claude-web users on tokenized URLs are unaffected.
   - **Two follow-ups:** (i) the `/c/:token` route is LIVE (returns 401 "Invalid or expired connection token") but exists nowhere in this repo — locate where it's implemented (edge proxy / unpushed deploy drift) and bring it into source control; (ii) the tokenized URL is still a URL-borne credential (opaque + revocable, so materially better than a raw key, and Anthropic's portal supports per-user-URL custom connections — but OAuth remains the endgame; migrate tokenized-URL users to the OAuth connector once live).
   - **SPT bearer** — disabled on the directory connector via `ENABLE_SPT=false` (see Phase 5.4 and `BACKBURNER.md`).
5. **Fix auth bugs regardless of lane:** `/sse` ignores the `Authorization` header (`index.ts:686`) — honor it or retire SSE; add a real 401 path (currently empty-key sessions initialize); revisit `Access-Control-Allow-Origin: *`; implement the rate limiting the docs claim.

## Phase 5 — Payments positioning (decision + small code, big narrative)

No fund transfers exist, so the hard prohibition shouldn't apply — but agentic payments is plausibly the "category we're still finalizing policy for" in Anthropic's email. Strategy: make consent visible, and proactively explain.

1. **Consent affordances (code):**
   - Per-call price in every billable tool description (Phase 3 overlap).
   - `settleOrWithhold` and `sptGuard` stay — they're spend-cap *protections*; document them as such.
   - Keep Stripe checkout/card-setup links only in **error paths** (quota exhausted, no payment method) — remove the "present the setupUrl prominently" push language (`errorHandling.ts:317`) and the promotional framing; a link plus a factual sentence is enough. Since stripe.com can't be in our allowed-link URIs, Claude will show a confirmation prompt before opening — that's a consent feature, cite it.
2. **Recurring charges:** `manage_scheduled_reports` description must state the per-run cost and cadence explicitly before creation.
3. **One-pager for mcp-review@anthropic.com** (draft, send when they ask or proactively): what SPT is, hard spend caps (`max_amount_cents`), per-task price gating, settlement only after delivery, no stored value transfer, user-side alternative (credits with card on file), and that the directory-listed connector authenticates via OAuth with account billing — SPT is the agent-to-agent rail.
4. **DECIDED (Piers, July 31, 2026): SPT lane is OUT of the directory connector.** The listed connector is OAuth + credits only. Implementation: gate the SPT path behind an `ENABLE_SPT` env flag (default off) rather than deleting it, and strip the SPT marketing line from `server.json:5`, `fodda_mcp_server.json:5`, and the A2A card. Full re-enablement brief: see "SPT Lane" entry in `BACKBURNER.md`. The API-side SPT infrastructure stays live; a future A2A rail on a separate non-directory endpoint can use it without touching the listed connector.

## Phase 6 — Dynamic skill tools & annotation tuning (medium)

1. `src/toolHandlers.ts:361-400` — stop blanket-stamping discovered tools `readOnlyHint: true`. Extend the skills API (`/v1/skills/{id}/tools`) to return per-tool annotations; the MCP server passes them through and **defaults to `readOnlyHint: false` when absent** (fail safe, not fail open). Live tools like `schedule_interview`, `submit_basic_info`, `request_deliverable` are writes advertised as reads today.
2. Stop discarding discovered input schemas (`:377` replaces them with accept-anything `z.record`); convert the JSON schema to zod or pass it through.
3. **DECIDED (Piers, July 31, 2026): partial freeze of the dynamic surface.**
   - **KEEP in the directory build, with real per-tool metadata (annotations + schemas):** `get_company_earnings`, `get_validated_trends`, `draft_linkedin_post`, `draft_linkedin_article`, `get_capabilities`, `paralogy_divergent-thinking-tools-router`. Expected annotations: all six are `readOnlyHint: true` in behavior (the drafting tools return text, they don't post anywhere — their descriptions must say so explicitly), but each must carry honest metadata sourced from the skills API, not the blanket stamp.
   - **EXCLUDE from the directory build (11 expert-side tools):** `begin_expert_onboarding`, `expert_onboarding_research`, `get_onboarding_status`, `submit_basic_info`, `submit_expertise_analysis`, `get_detected_themes`, `confirm_themes`, `schedule_interview`, `request_deliverable`, `check_deliverable_status`, `get_my_earnings`. These serve the expert workflow, six are writes mislabeled read-only, and they're un-auditable from this repo. They remain available on non-directory connections (expert-facing surface).
   - **Mechanism:** skills API adds `directory_visible: bool` + per-tool `annotations` (+ input schema) to `GET /v1/skills/{id}/tools`; the MCP server filters on the flag when serving directory sessions and passes annotations through, defaulting to `readOnlyHint: false` when metadata is absent (fail safe).
4. Annotation tuning on static tools: `consult_analyst` → `readOnlyHint: true` (consistent with `deep_research_topic`); `openWorldHint: true` on `search_graph`, `get_supplemental_context`, `brand_tracker` (they call external data APIs); `update_user_profile`/`toggle_graph_preference` → `destructiveHint: false` (upserts, not deletes); `send_feedback` and `sign_up_free_account` keep `readOnlyHint: false` and get descriptions that state their side effects (email/Slack egress; account creation).
5. `toggle_graph_preference`: drop the `user_email` admin-impersonation param from the directory-facing tool, or enforce admin authorization server-side.
6. `sign_up_free_account`: add server-side guard (e.g., require an explicit `user_confirmed: true` param and verify the email hasn't been seen only in conversation context) so the "never sign up proactively" rule isn't purely prompt-level.
7. Add `tools-manifest.json` annotations columns if anything external ingests it (it self-describes as "source of truth").

## Phase 7 — Submission-portal package (small, last)

- Test account: fully populated, with credits, for reviewer use.
- 3–5 example prompts (reuse Phase 2 docs).
- Allowed link URIs: `https://www.fodda.ai`, `https://app.fodda.ai` (owned origins only — Stripe links intentionally excluded).
- Confirm every tool via MCP Inspector + as a custom connector in Claude before resubmitting/responding to the reviewer.

---

## Sequencing & effort

| Phase | Effort | Dependencies |
|---|---|---|
| 1 Privacy/metadata | ~1 hr | none |
| 2 Docs reconciliation | ~half day | none |
| 3 Steering rewrite | ~1 day | none (informs 5) |
| 4 Clerk OAuth | ~2–3 days incl. API-repo endpoint + testing | Clerk dashboard access |
| 5 Payments positioning | ~half day code + one-pager | decision from Piers |
| 6 Dynamic tools/annotations | ~1–2 days (skills API change) | none |
| 7 Portal package | ~half day | 1–6 |

Decisions — ALL RESOLVED (Piers, July 31, 2026): (a) **SPT out of the directory listing**, gated behind `ENABLE_SPT` flag; re-enablement brief in `BACKBURNER.md`. (b) **Partial freeze of dynamic skill tools** — keep 6 user-facing tools (`get_company_earnings`, `get_validated_trends`, `draft_linkedin_post`, `draft_linkedin_article`, `get_capabilities`, `paralogy_divergent-thinking-tools-router`) with real per-tool metadata from the skills API; exclude the 11 expert-side tools from the directory build (Phase 6.3). (c) **`?api_key=` killed immediately** — implemented on this branch; friendly 401 → "Get a new MCP URL at https://app.fodda.ai"; tokenized `/c/<token>` URLs unaffected.
