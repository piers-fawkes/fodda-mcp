# Fodda MCP — Backburner

Deferred features and tasks. Items here are designed, scoped, and in some cases code-complete but not yet active.

---

## 🚨 C1: Move Session State out of In-Memory Maps
**Status:** Not started — architectural change, deferred; stopgap in place  
**Severity:** CRITICAL (per claude-opus-4-8 review, June 2026)  
**Stopgap:** Set `max-instances=1` in Cloud Run until this is fixed. Prevents session loss from cross-instance routing.  
**Problem:** `transports`, `sessionApiKeys`, `sessionUserIds`, `sessionSources`, `sessionCreatedAt`, `widgetCache`, `activeResearchJobs`, `activeSupplementalJobs` are all process-local Maps. Cloud Run can run multiple instances. A session created on instance A is invisible to instance B. With autoscaling to 3–5 instances under load, session-resume failure rate is ~70–80%.  
**Solution:**
1. **Session key/userId mapping** → Firestore collection `mcp_sessions/{sessionId}` with TTL. The transport object itself cannot be stored (it holds an HTTP response object) — only the metadata that maps `sessionId` to `apiKey`, `userId`, `source`, `createdAt`.
2. **Widget cache** → Firestore (or Cloud Storage) with a 30-minute TTL. Widgets are already served via `/widget/:id` — just change the backing store.
3. **activeResearchJobs / activeSupplementalJobs** → These track long-running async jobs. Move to Firestore `mcp_jobs/{jobId}` with `status`, `result`, `createdAt`. The MCP polling loop reads from Firestore instead of a local Map.
4. **Transport recovery:** MCP transports are tied to HTTP connections — they cannot be migrated across instances. The fix for transport is session affinity on Cloud Run (`--session-affinity` flag) combined with storing session metadata in Firestore so lost sessions can return a meaningful error instead of a silent 404.  
**MCP constraint:** StreamableHTTPServerTransport holds a live HTTP response. If Cloud Run recycles the instance, the transport is gone regardless of where we store metadata. Session affinity (`--session-affinity`) plus Firestore metadata is the correct layered approach.  
**Firestore dependency:** Already used for trial tracking — the client is already initialized.  
**Agent:** MCP agent

---

## 🔑 C3: Remove API Keys from URL Query Params
**Status:** Not started — requires MCP client coordination; higher priority than most backburner items  
**Severity:** CRITICAL (per claude-opus-4-8 review, June 2026)  
**Problem:** `?api_key=YOUR_KEY` in URL query params means API keys appear in Cloud Run access logs, proxy logs, browser history, and referrer headers. For a paid product this is a direct credential-leak risk.  
**What's involved:**
1. **MCP Server:** Auth already reads from `Authorization: Bearer`, `X-API-Key`, AND `?api_key` query param. The header paths already work. The fix is to stop documenting/using query params as the primary method.
2. **Documentation + onboarding:** The MCP connection URL distributed to customers is `https://mcp.fodda.ai/mcp?api_key=YOUR_KEY`. This needs to change to require `Authorization: Bearer YOUR_KEY` — but not all MCP clients support custom headers.
3. **MCP client landscape:** As of mid-2026, Claude Desktop and Cursor support `Authorization` headers. Windsurf does. Some older clients (ChatGPT Connector) do not. A phased approach: move docs to headers-first, keep query-param support as a deprecated fallback, set a deprecation date.
4. **`/v1/graphs/mine` API response (v1Router.ts:320):** Currently constructs `mcp_url: \`https://mcp.fodda.ai/mcp?api_key=${trialKey}\`` — this also needs updating to use a header-based auth instruction instead.
5. **Short-lived tokens (longer-term):** Instead of distributing the primary API key directly, issue short-lived signed tokens for MCP sessions. Leaked tokens are scoped and expire.  
**Migration path:**
- Phase 1: Update docs to recommend headers. Keep query param working. Log a deprecation warning when query param is used.
- Phase 2: Issue a deprecation notice to all active users.
- Phase 3: Remove query-param support. Require header auth only.  
**Agent:** MCP agent + API agent (update /v1/graphs/mine response) + App agent (update onboarding/setup docs)  
**Superseded-by note:** This is now the first step of the broader **MCP Identity & Connection-URL Scheme** below — that brief delivers C3 (no key in URL) plus a unique-key identity model in one move. Treat C3 as Phase 1a of that plan.

---

## 🔗 Evidence Over-Linking Prune (deeper root-cause fix)
**Status:** Not started — deferred follow-up from the Round-2 audit (June 2026). **Non-urgent:** user-facing impact is already neutralized (see below).  
**Repo/agent:** PSFK Ingestor (the bad join lives in the evidence→trend linking, not the MCP/API).  
**Problem:** Trends **6779 / 6782 / 6784** carry **469 / 1286 / 1273** evidence items vs a healthy ~12–28 — an over-linking defect (a bad EVIDENCE_FOR join or too-loose similarity threshold). The June quarantine script repaired the *properties* (signal_score, dates, place tokens, graphId) but **did not prune the excess joins**. Gate 6 (evidence-count outlier) only **warns**; it doesn't prevent or prune.  
**Why it matters (and why it's non-urgent):**
- `confidenceScore` is an Airtable formula computed from **`evidenceCount`**. While the joins persist, `evidenceCount` stays inflated → `confidenceScore` stays ~**7109** in Airtable and **will not "normalize" on the next sync** (it derives from the count, not from `lastSeen`). The live Neo4j graph is protected only by `clampSignalScore()` (7109 → 0), which parks these nodes at the bottom rather than at a correct mid-rank.
- **User-facing impact is already neutralized** by the MCP evidence-ranking fix (caps the API's *relevance-ranked* top-3, so the 1286-item bloat no longer surfaces off-topic citations). So this is **latent data debt**, not a live bug.  
**The actual fix:** analyze which EVIDENCE_FOR links on these nodes are legitimate vs. bad joins; prune the bad ones at source; fix the join logic / similarity threshold that created them so it can't recur; then confidenceScore recomputes to a real value and the clamp becomes moot.  
**Refs:** `briefs/Brief Round 2 Surface Audit - Evidence Ranking and Node Identity.md` (the 7109 cluster), `briefs/Brief Ingestion Data Integrity - PSFK Cluster and Validation Gates.md`, `briefs/Brief Round 2 MCP Evidence Ranking Fix.md` (the complementary MCP fix).  
**Agent:** PSFK Ingestor

---

## ✅ Self-Use Fair-Use Cap — CONFIRMED Enforced (resolved 2026-07-02)
**Status:** Resolved. Was flagged unconfirmed earlier tonight; verified directly against Fodda API source the same night.
**Confirmed in `Fodda API/functions/v1/analysts.ts`:**
- `SELF_USE_DAILY_CAP` env var, default `25` (`analysts.ts:245`) — matches the "25/day" figure in the onboarding email exactly.
- `isOwnerSelfUse` genuinely waives billing at multiple real sites: `totalCost = isOwnerSelfUse ? 0 : ...` (lines 1918, 2224), the free-tier gate bypass (line 1091), and `graphService.ts:880-885`'s `decrementCredits()` skip on self-use graph reads. This isn't a stub — it's wired into the actual billing path.
- `GET /v1/analysts/me` (also confirmed live, `analysts.ts:924`) already returns a `self_use: { note, daily_cap }` block plus a ready-made `connect` block (`mcp_url`, `instructions`, `example_prompt`) — this is the actual source the onboarding email's copy should be calling live, not hardcoding.
**Net:** the "You're live" email's claim was accurate all along — self-use really is free, really is capped at 25/day. No further verification needed on this specific point.
**Follow-up worth doing:** have `buildExpertApprovedEmail` (Fodda Website) call `/v1/analysts/me` with the expert's real API key at send-time instead of hardcoding the connect-block copy, so it can't drift out of sync with this endpoint.

---

## 🪪 MCP Identity & Connection-URL Scheme (Unique Key, Not API Key + Email)
**Status:** Designed for consideration — not scheduled (captured June 2026)  
**Priority:** P2 — design now, build later; subsumes C3  
**Problem:** The connection URL carries both the API key and the user's email (`?api_key=…&user_id=<email>`, `index.ts:519/527`), conflating authentication, identity, and billing into two leaky values. Symptoms: secret-in-URL (C3), PII-in-URL, and email-as-identity coupling that produced `profile.name = "recZ1FemUPoLtuIuF"` in the P0 audit. Rotating an API key breaks every URL that embeds it.  
**Recommendation (two phases):**
1. **Phase 1 — opaque per-connection token in the path** (`https://mcp.fodda.ai/c/{token}`) resolving server-side to `{ internal_user_id, billing_account_id, scopes }`. The token is neither the API key nor the email; introduce a stable internal `user_id` and demote email to an attribute. Per-connection revocable. Delivers C3 as a side effect. Start opaque/DB-backed (Firestore) over JWT so revocation is free.
2. **Phase 2 — OAuth 2.1 remote-MCP auth** (Claude connector supports it natively): short-lived bearer + refresh, no static secret, real scopes. Phase 1's `internal_user_id` maps onto OAuth claims, so it's the foundation, not throwaway.  
**Migration:** dual-accept legacy `?api_key=&user_id=` during a window → mint `/c/{token}` per user, update onboarding + the `mcp_url` from `/v1/graphs/mine` → sunset the legacy form.  
**Open decisions for Piers:** token format (opaque vs JWT), OAuth now vs later, scope granularity, per-user vs per-connection tokens.  
**Full brief:** `briefs/Brief MCP Identity and URL Scheme.md`  
**Agent:** MCP agent + API agent (token issuance + identity store) + App agent (onboarding/URL distribution)

---

## 🧹 Delete Duplicate Piers Analyst Record (Airtable)
**Status:** Ready — one API call or one click, deferred 2026-07-02
**What:** Two Airtable records share Analyst ID `piers-fawkes-retail-innovation` (Analysts table `tblvrKdn8FvbSJmSs`, base `appXUeeWN1uD9NdCW`). The merge is already done: the keeper `recMTLcbD9dDgONNV` (Status "Pending Approval" — has Expert Card, System Instructions, transcript, Documents) now has the User link (`reckc1aMcHCaOtib2`), `ownerAccount` resolving, and Topic `Retail Innovation, retail`. The leftover `reczAooUcis72TIAV` (Status "Onboarding — Interview") is fully redundant.
**To do:** Delete record `reczAooUcis72TIAV`. Via API: `base('Analysts').destroy(['reczAooUcis72TIAV'])` using the key in Fodda API `.env`, or manually in Airtable (recoverable from trash either way).
**Why it matters:** If both records ever go Active, the API's `analysts.find()` picks whichever comes first — could resolve to a stale copy.
**Agent:** Manual (Airtable) or any agent with the Airtable key

---

## 📝 MCP Tool Descriptions from Airtable
**Status:** Not started — low priority, consider when descriptions stabilize  
**What:** Add an `mcp_tool_description` column to a new `MCP Tools` table in Airtable. At server startup, `catalogCache.ts` fetches these descriptions and injects them into `server.tool()` registrations, replacing the hardcoded strings in `toolHandlers.ts`. This would let the sales/marketing team iterate on tool descriptions (the text LLM routers read to decide tool selection) without code deploys.  
**Why not now:** Tool descriptions are tightly coupled to code behavior — they reference parameter names, return shapes, API call costs, and technical constraints. There are only ~23 tools and they change alongside code changes. Decoupling prematurely risks someone breaking the parameter contract. Once descriptions stabilize post-audit, this becomes safer.  
**Needs:**
- Airtable: New `MCP Tools` table with `tool_id`, `description`, `is_active` columns
- API: Expose via `/v1/tools/catalog` or add to existing `/v1/graphs/catalog` response
- MCP: `catalogCache.ts` fetches at startup, `toolHandlers.ts` reads from cache with hardcoded fallback  
**Agent:** MCP agent + API agent + Manual (Airtable schema)

---

## 🤖 Multi-Agent "Expert Panels" (Deep Research Evolution)
**Status:** Waiting on Google EAP updates  
**What:** Google is building native support for parent agents to spin up child sub-agents in separate sandboxes. Once released, transition `deep_research_topic` to use an Orchestrator Agent. The orchestrator will spin up an individual child agent for each Fodda graph (e.g., a Retail agent, an AI agent, a Logistics agent), let them research independently, and synthesize their findings. This prevents context-window dilution.  
**When:** When Google officially releases Sub-Agents for Waverunner.  
**Agent:** MCP agent

---

## ⚙️ Configuration-as-Code (CI/CD for Agents)
**Status:** Waiting on Vertex AI parity  
**What:** Graduate Fodda "Skills" (like Paralogy, Igloo) from simple system prompts into full YAML-based agent environment configurations. Use CI/CD (GitHub actions) to automatically snapshot and deploy new Base Agent environments whenever a YAML file is updated, eliminating cold-start download taxes.  
**When:** Once Waverunner achieves full parity with Vertex AI and CI/CD pipelines are documented.  
**Agent:** MCP agent

---

## 🔇 Ghost Upsell Tool (`check_premium_insights`)
**Status:** Code removed — needs reimplementation from BACKBURNER spec  
**Re-enable when:** Significant user volume warrants cross-sell  
**What:** Checks the user's graph access via API. Limited-plan users (retail-only, sic-only) see: *"I could cross-reference with graphs and datasets outside of your current subscription..."* with a list of missing graphs. Users with 'all' verticals get "you have full access."  
**Upgrade URL:** www.fodda.ai  
**To re-enable:** Reimplement based on the spec below. The original commented-out code was removed during a prior cleanup.  
**Ref:** implementation_plan.md Phase 2, item 4.2

---

## 🧠 Session Memory Injection
**Status:** Not started — needs infrastructure  
**What:** On every new MCP connection, pull the user's last 5 queries and inject into the system prompt. Claude builds on prior research without re-explanation.  
**Needs:** Query logging table (Airtable or DB) per userId. Quick-start: log to simple Airtable table, read back at session init.  
**Ref:** implementation_plan.md Phase 4, item 4.3

---

## ⚔️ Challenge Mode
**Status:** Not started — lifecycle fields now available  
**What:** `mode: 'challenge'` parameter on `search_graph`. Inverts ranking — surfaces counter-signals and fading trends first. Returns `_challengePrompt`.  
**Needs:** ~10 lines — sort inversion + prompt injection. Lifecycle enrichment is done.  
**Ref:** implementation_plan.md Phase 4, item 4.4

---

## 🆕 Differential Response / "What's New"
**Status:** Not started — needs persistent storage  
**What:** Stores result hashes per user+topic. On repeat queries, returns `_newSince` array of trends not in the previous result. Claude leads with what changed.  
**Needs:** Persistent key-value store (Airtable, Redis, or file).  
**Ref:** implementation_plan.md Phase 4, item 4.6

---

## 🧑‍💼 Persona-Aware Framing (System Prompt Injection)
**Status:** Not started — needs Airtable schema + onboarding UI  
**What:** If the user's Airtable record has `jobTitle`, `companyName`, and a new `researchesForClients` boolean, inject context into the system prompt at session init.  
**Approach:**
1. **Airtable:** Add a `researchesForClients` checkbox column to the Account table. Set at onboarding.
2. **Onboarding UI:** Add a simple question: *"Do you research on behalf of clients?"* (checkbox or toggle).
3. **MCP injection:** At session init, fetch the user profile and inject:
   - If `researchesForClients: true`: *"This user researches on behalf of clients. Adapt framing for the end-client's industry, not the user's own company. Avoid assumptions about their personal industry focus."*
   - If `researchesForClients: false`: *"The current user is a [jobTitle] at [companyName]. Prioritize implications relevant to their role and industry."*
4. **MCP code:** ~10 lines to fetch profile + inject into `buildSystemPrompt()`.  
**Why checkbox > inference:** Eliminates heuristic guessing, agency name lists, and edge cases. Single source of truth set once at onboarding.  
**Briefs needed:**
- App agent: Add onboarding question + Airtable column
- MCP agent: Read field at session init, inject into prompt  
**Ref:** implementation_plan.md Phase 3, item 3.5

---

## 📝 tools.ts Description Updates
**Status:** Not started — low priority  
**What:** Update `search_graph` tool description in `tools.ts` to document new enrichment fields (`trendLifecycle`, `momentum`, `weak_signals`, `queryTimeline`, `graphBadge`, `_broadened`, etc.). Also add `brand_tracker` tool description.  
**Why low priority:** The system prompt already instructs Claude on all these fields. Tool descriptions are mainly for non-Claude LLM clients.  
**Agent:** MCP agent (this codebase)

---

## 📊 Dynamic Prompt Splitting
**Status:** Not started — optimization  
**What:** Split `STATIC_BEHAVIORAL_RULES` into tiers to reduce token count per session:
- **Core rules** (always included): workflow, attribution, evidence citations
- **Editorial enrichment** (included when query returns 3+ results): iceberg structure, contradictions, narrative roles, steal this idea
- **Display conventions** (only in claude.ai context): card grid, chart rendering, widget layout  
**Why:** System prompt grew ~40% with Phase 1 additions. Not urgent — Claude's context window handles it — but worth optimizing if prompt costs become a concern.

---

## 🔍 Dynamic Brand Graph Filtering
**Status:** Not started — current approach uses static exclusion list  
**What:** Replace the hardcoded `NO_BRAND_GRAPHS` set with a dynamic metadata check at startup. Query each graph's Neo4j index for `Brand` node count and cache the result. Graphs with zero Brand nodes are auto-excluded.  
**Why:** The static list (`braze-2026-trends`, `ezra-eeman-wayfinder`, etc.) works but needs manual updates when new expert graphs are added. A metadata approach generalizes to any entity type lookup, not just brands.  
**When:** When the Cypher endpoint is live this becomes less critical — the database handles filtering natively. Revisit if the multi-search fallback path is used frequently.  
**Agent:** MCP agent + API agent (needs a lightweight `/v1/graphs/:id/entity-counts` endpoint)

---

## 📝 Enriched Editorial Context for One-Liner Quality
**Status:** Not started — monitor one-liner quality first  
**What:** Add richer fields to the `editorial_context` object passed to Claude for the brand widget's editorial slots:  
- `dominant_lifecycle` — which lifecycle stage has the most trends  
- `strongest_graph` — the graph with the highest evidence count  
- `unique_angle` — a pre-computed differentiator (e.g. "only brand in airport hospitality")  
- `momentum_summary` — e.g. "3 of 4 trends accelerating"  
**Why:** Claude has ~200 tokens of generation budget for editorial slots. Richer context = sharper provocation sentences without Claude needing to derive insights from raw data.  
**When:** If one-liners feel generic during testing, add these fields to `brandTemplate.ts` → `editorialContext`.  
**Agent:** MCP agent

---

## 🏷️ SVG Network Label Truncation
**Status:** Not started — cosmetic, monitor in practice  
**What:** In the competitive network SVG, long brand names (>12 chars) can overflow the 18px-radius orbit circles. Add truncation logic in `brandTemplate.ts` to cap SVG text at ~12 characters with ellipsis, or dynamically scale circle radius based on text length.  
**Why:** Most brand names are short (Nike, Coach, RH) but edge cases like "Publicis Sapient" or "Louis Vuitton" push the label beyond the circle boundary.  
**When:** When visual testing reveals clipping issues.  
**Agent:** MCP agent

---

## 🎚️ Search Widget Scrubber (Lifecycle Stage Filter)
**Status:** Removed for payload optimization — needs re-implementation  
**What:** An interactive slider/scrubber that lets users filter search results by lifecycle stage (All → Emerging → Building → Established → Plateauing). Dimmed non-matching trend cards with opacity transition.  
**Removed:** CSS (`.scr-*` classes, `.tc2.dimmed`), HTML (scrubber bar, track, handle, labels), JS (`HAS_SCRUBBER`, `initScr()`, `dimSet` logic, drag handlers).  
**Previously triggered by:** `isTemporalQuery()` — detected temporal keywords like "new", "emerging", "2025" in the search query.  
**To restore:** Re-add scrubber CSS, conditional HTML block, `HAS_SCRUBBER` JS variable, and `initScr()` function to `searchTemplate.ts`. Reference git history for the original implementation. The `STAGES` array is still in the codebase.  
**Why removed:** Payload reduction — the scrubber + dead code added ~2-3KB to every widget response, contributing to slow streaming in Claude.  
**When:** When Claude supports faster widget rendering or a CDN-based stylesheet approach becomes viable.  
**Agent:** MCP agent

---

## 🚨 Frustration-Triggered Bug Report Emails
**Status:** Not started — needs email infrastructure + sentiment detection  
**What:** When the MCP detects user frustration — either with the system itself (tool errors, bad results, latency) or with the content/data returned (stale trends, missing graphs, wrong categorization) — it proactively offers to send a bug report email.  
**Flow:**
1. **Detect frustration:** Monitor user messages for frustration signals (explicit complaints, repeated retries, negative sentiment). Can be prompt-engineered into the system prompt as a behavioral rule.
2. **Classify target:** Determine whether the frustration is about the *system* (route to Piers) or the *content/data* (route to the content/data owner if known, fallback to Piers).
3. **Offer to report:** Claude asks: *"It sounds like something isn't working right. Would you like me to send a bug report to [Piers / the data owner]? I can include a summary of what went wrong."*
4. **Ask about response:** *"Would you like them to follow up with you about this?"* — captures `wantsResponse: boolean`.
5. **Send email:** Compose and send a structured bug report email containing: user context (name, email, plan), session summary, the specific issue, and whether the user wants a response.  
**Email recipients:**
- System issues → Piers (Fodda owner, piers@fodda.ai or equivalent)
- Content/data issues → Content owner email from Airtable graph registry (if available), CC Piers  
**Needs:**
- Email sending service (SendGrid, Resend, or AWS SES via API route)
- Frustration detection prompt rules in `STATIC_BEHAVIORAL_RULES`
- New MCP tool: `send_bug_report` with params `{ issueType, summary, userWantsResponse }`
- Content owner email field in Airtable Graph Registry (if not already present)  
**Agent:** MCP agent + API agent (email endpoint)

---

## 🎛️ MCP Graph Management (Toggle On/Off)
**Status:** Not started — depends on My Graphs API + user graph preferences schema  
**What:** Let users manage their active graph subscriptions directly through Claude, mirroring the functionality planned for the My Graphs section of the app. Users can enable/disable graphs conversationally without leaving the chat.  
**Capabilities:**
1. **Toggle individual graphs:** *"Turn off the Braze graph"* / *"Re-enable the Dentsu graph"*
2. **Toggle by graph type:** *"Disable all industry reports"* / *"Only keep expert graphs active"*
3. **Toggle by date:** *"Turn off all graphs published before 2025"* / *"Only show graphs from the last 6 months"*
4. **View current state:** *"Which graphs do I have active?"* — returns a summary of enabled/disabled graphs with types and dates
5. **Bulk operations:** *"Reset to defaults"* / *"Enable everything"*  
**How it works:**
- User graph preferences stored in Airtable (or equivalent) as a per-user record of enabled/disabled graph IDs + filter rules
- MCP reads preferences at session init to scope `search_graph` and `compare_graphs` to only active graphs
- New MCP tools: `manage_graphs` (list/toggle/filter) writes back to the preferences store via API  
**Needs:**
- API endpoint: `PATCH /v1/users/:id/graph-preferences` (toggle individual, by type, by date)
- API endpoint: `GET /v1/users/:id/graph-preferences` (current state)
- Airtable schema: `GraphPreferences` table or fields on Account table (enabled graph IDs, type filters, date cutoff)
- MCP tool: `manage_graphs` with actions `list | enable | disable | filter_by_type | filter_by_date | reset`
- System prompt update: inject active graph list at session init so Claude only searches enabled graphs  
**Sync with App:** Must share the same preferences store as the My Graphs UI so changes in either channel are reflected in both.  
**Agent:** MCP agent + API agent + App agent (shared preferences schema)

---

## 💳 MCP In-Chat Purchasing (Top-Ups & Vertical Subscriptions)
**Status:** Not started — needs billing infrastructure + Stripe integration  
**What:** Let users purchase credit top-ups and subscribe to additional verticals directly through Claude, without leaving the chat. Claude acts as a conversational sales assistant when users hit limits or express interest in broader coverage.  
**Triggers:**
- User exhausts credits → Claude offers a top-up: *"You've used all your queries this month. Want me to add a top-up pack?"*
- User queries a vertical they don't have → Claude offers access: *"That trend lives in the Retail vertical, which isn't in your current plan. Want to add it?"*
- User asks directly: *"How do I get more queries?"* / *"What verticals are available?"*  
**Capabilities:**
1. **View current plan:** Show active verticals, remaining credits, billing cycle
2. **Browse available verticals:** List verticals not in the user's plan with pricing and sample graphs
3. **Buy credit top-up:** Purchase additional query credits (e.g., 50 / 200 / unlimited packs)
4. **Subscribe to a vertical:** Add a new vertical to the user's plan
5. **Confirm & receipt:** Show order summary, process payment, return confirmation  
**Flow:**
1. Claude presents options with pricing
2. User confirms selection
3. MCP tool generates a secure Stripe Checkout link (or processes via saved payment method)
4. User completes payment (redirect or in-chat confirmation)
5. Credits/verticals activate immediately — next query uses new entitlements  
**Needs:**
- Stripe integration: Checkout Sessions for new purchases, Customer Portal for management
- API endpoints: `POST /v1/billing/top-up`, `POST /v1/billing/subscribe-vertical`, `GET /v1/billing/plans`
- MCP tools: `view_plan`, `purchase_top_up`, `subscribe_vertical`
- System prompt: pricing awareness + conversational upsell guidance (non-pushy, helpful tone)
- Webhook handler: Stripe → Airtable/DB to activate entitlements in real time  
**Security:** Payment links only — MCP never handles card numbers or PII. Stripe Checkout handles all sensitive data.  
**Agent:** MCP agent + API agent (billing endpoints + Stripe webhooks)

---

## 🔌 Skills Integration (External MCP Post-Processors)
**Status:** Planned — scaffolding exists across App + Airtable, MCP execution engine not built  
**What:** Plug-and-play external MCP skills (Igloo, Paralogy, future) that transform Fodda's output before it reaches the user. Skills are toggled on/off per user/team in the App's My Graphs UI (already scaffolded). The MCP server calls skill MCP servers as a client after research is complete.  
**Current state:**
- Airtable: `graphType = 'skill'` exists for Igloo + Paralogy rows
- App: `MyGraphsPage.tsx` already renders a Skills category with toggles (pink styling, descriptions)
- App: `dataService.ts` has fallback entries for both skills
- MCP Server: **No skill support yet** — `catalogCache.ts` ignores skill entries, `toolHandlers.ts` has no post-processing hook  
**Key design decisions:**
- Skills are output-only post-processors (not research-phase) — called after graph search + evidence
- Fail-open: if a skill server is unreachable, proceed with normal Fodda output
- Adding a new skill = adding an Airtable row with `mcpUrl` — no code deployment
- New module: `src/skillClient.ts` — lightweight MCP client wrapper for calling external skill servers
- New Airtable fields: `mcpUrl`, `skillPhase`, `skillToolName`, `skillInputSchema`  
**Full plan:** See `skills_integration_plan.md` artifact  
**Agents:** MCP agent (execution engine) + App agent (UI polish) + API agent (catalog fields) + Manual (Airtable schema)

---

## 🧪 Live Test: Parallel Intelligence Tools
**Status:** Not started — needs manual verification  
**What:** Fire a query like "tequila spirits trends" through Claude to verify `get_domain_intelligence` + `get_expert_intelligence` + `get_report_intelligence` are called in parallel as the system prompt instructs. Confirm the bundled evidence shape is correct and citations flow through.  
**When:** Next time using the MCP in production.  
**Agent:** Manual test

---

## 🔀 Waverunner Auto-Routing
**Status:** Not started — design discussion needed  
**What:** Currently `deep_research_topic` (Waverunner) is only triggered when the user explicitly says "deep research" or "write me a report." Consider auto-routing certain complex queries (multi-domain, comparative, or 3+ entity queries) to Waverunner automatically.  
**Context:** Currently free via Gemini EAP. Cost optimization becomes relevant when EAP ends.  
**Agent:** MCP agent

---

## 🌐 Brainstorm as API Endpoint
**Status:** Designed, MCP version live — API endpoint is Phase 2  
**What:** Build `POST /v1/brainstorm` on the API server that replicates what `brainstorm_topic` does in the MCP: seed search → neighbor traversal → clustering → suggested prompts. Makes the brainstorm capability available to resellers and non-MCP consumers.  
**When:** After the MCP brainstorm tool is validated in production.  
**Agent:** API agent (endpoint) + MCP agent (wire up)

---

## 🧹 Tool Surface Cleanup (Deprecation Phase)
**Status:** Not started — waiting for new tools to prove out  
**What:** Once the new unified tools (`get_domain/expert/report_intelligence`, `get_supplemental_context`) are validated, consider deprecating redundant tools to reduce the tool surface the LLM has to navigate. The 21 individual supplemental tools and the granular `search_statistics`/`search_insights` are candidates. Code stays in the codebase (commented out), tools just stop registering with the MCP server.  
**When:** After 2+ weeks of production usage confirms the new tools cover all use cases.  
**Agent:** MCP agent

---

## 📋 Rethink `list_graphs` with API Agent
**Status:** Not started — discussion needed  
**What:** `list_graphs` currently returns the raw `/v1/graphs` response — a flat list of graph IDs, names, statuses, and node counts. With the new architecture (domain/expert/report intelligence tools that don't need graph IDs), the question is: what should `list_graphs` offer to be genuinely useful? Options: group by graph type, include topic coverage summaries, show last-updated dates, surface which graphs contributed to the user's recent queries, etc.  
**Why:** Resellers need a way to show customers what they're getting. The current response is developer-facing, not product-facing.  
**Agent:** API agent (endpoint redesign) + MCP agent (tool update)

---

## 📉 P0 Audit Follow-up: Hit the Response Size Targets
**Status:** Not started — P1 follow-up to the shipped P0 surface-audit fixes (June 2026). **Not a regression** — the named bloat (28.8KB brand/place strings, duplicate aliases) is already gone; this is the remaining reduction to hit the budget.  
**Measured after P0 (verified live on mcp.fodda.ai):** `list_graphs` = **170KB** (was 883KB); `search_graph` = **131KB / max 6KB per row** (was ~233KB). Target for both: **≤25KB**, search **≤2KB/row**.  
**Two pieces of work:**
1. **Tiered discovery for `list_graphs`** — the allowlist still keeps the full `description` (with the injected `[ROUTING INSTRUCTION]`), ~810 B × 210 graphs. Drop full `description` from the list; return only `graph_id, name, one_liner, curator, domain, graph_type, trend_count, evidence_count, status, last_updated` + a terse routing field. Add a new **`get_graph(graph_id)`** tool that returns the full profile on demand. (This is P1 item 7 from the audit spec; overlaps with "Rethink `list_graphs`" above.)
2. **Evidence-transport decision for `search_graph`** — `≤2KB/row` is in tension with evidence inline (item 4 ships 3 evidence items/row, which alone busts 2KB). Decide: keep evidence inline (accept larger rows) **or** move evidence to a separate content block (item 4's Option B) to hit the row target. Also trim per-row enrichment fields and response-level extras (`_render_instructions`, `suggested_next_prompts`, `queryTimeline`) that pad the payload.  
**Ref:** `briefs/Brief MCP P0 Surface Audit Fixes.md` (items 3 + 7), `briefs/Response - MCP P0 Plan Review.md`  
**Agent:** MCP agent

---

## ⚡ Waverunner Internal Call Optimization
**Status:** Not urgent — current implementation works  
**What:** `deep_research_topic` currently uses the old granular tools internally (search_graph, get_evidence, search_statistics). It could be refactored to use the new unified endpoints (get_domain_intelligence, get_expert_intelligence, get_report_intelligence) instead — getting bundled evidence in fewer hops and reducing total token count per deep research run.  
**Impact:** Potentially reduce deep research from ~10-12 tokens to ~6-8 tokens per run.  
**When:** When the new unified endpoints are fully proven and stable.  
**Agent:** MCP agent

---

## 🔀 Dual-Tier Fodda MCP Architecture (Flash vs Deep Research)
**Status:** Not started — designed in `mcp_dual_tool_plan.md`
**What:** Split Fodda's primary search capability into two distinct MCP tools, allowing client AI models (Cursor, Lovable) to choose between ultra-low latency standard searches and deep, agentic sandbox-validated searches.
- `search_graph_flash`: Sub-second, direct lookups in Fodda Knowledge Graph. Returns raw JSON node data. Best for quick fact-checking. Cost: 1 Token.
- `search_graph_deep_research`: Agentic deep research. Provisions an autonomous agent in a secure sandbox to construct, validate, and execute perfect graph traversal queries. Returns synthesized report. Cost: 5 Tokens.
**Needs:**
- Update `tools.ts` to replace generic `search_graph` with `search_graph_flash` and `search_graph_deep_research`.
- Update `toolHandlers.ts` with new Zod schemas and separate handlers (`foddaRequest` vs `waverunnerRequest` polling).
- Update `trialTracker.ts` and `index.ts` to log distinct event types for billing (1 vs 5 tokens).
**Ref:** `/Users/piersfawkes/.gemini/antigravity/brain/22ed5a8b-49cf-4dd2-bd53-c934f5a831d0/mcp_dual_tool_plan.md`
**Agent:** MCP agent

---

## 🧪 MCP Eval Harness — Continuous Behavioral Testing
**Status:** Not started — foundational for enterprise sales  
**Priority:** Medium  
**What:** A lightweight eval harness (`src/eval/`) that runs a golden set of ~50 test prompts against the live MCP server, grades responses with code-based and model-based checks, and produces a pass/fail report. Tests both **SHOULD-DO** behaviors (citations, graph attribution, epistemic hedging, Steal This Idea, lifecycle awareness) and **MUST-NOT-DO** behaviors (confidentiality leaks, fabrication, prompt injection, cross-user data access, web backfill).  
**Architecture:**  
- `golden_set.json` — test prompts + expected behaviors  
- `graders/` — code-based graders (citation, scope, refusal, confidentiality, structure) + model-based graders (provocation quality, editorial quality) using a cheap model as judge  
- `runner.ts` — orchestrates prompt → response → grade  
- `report.ts` — generates pass/fail summary with pass@1, pass@3, category pass rates, and regression flags  
**Integration:** Pre-deploy gate (`npm run eval` before `gcloud run deploy`), on-demand after prompt changes, optional nightly runs for model-side regressions.  
**Why:** Regulated enterprise buyers expect continuous evaluation evidence. Manual spot-checking doesn't scale and can't catch silent regressions from prompt tweaks or model upgrades.  
**Builds on:** `src/test_live_mcp.ts` (transport/auth pattern), `src/test_skills.ts` (TestResult pattern), `systemPrompt.ts` (source of behavioral commitments).  
**Phase 2:** Client-specific MUST-NOT-DO rules, eval dashboard in Governance tab, A/B prompt testing.  
**Full brief:** `Brief MCP Eval Harness.md`  
**Inspiration:** Wild.ai "AI in Regulated Industries" (Feb 2026), Anthropic "Demystifying evals for AI agents" (Jan 2025)  
**Agent:** MCP agent

---

## 🗂️ Extract Personas from systemPrompt.ts into .agents/personas/
**Status:** Not started — deferred from Engineering Policy adoption (May 2026)
**What:** The MCP server's system prompt currently lives entirely in `src/systemPrompt.ts`. Per the new engineering policy (§2 + agents.yaml), persona files should live in `.agents/personas/`. Extract the Waverunner agent persona and the Fodda MCP persona into:
- `.agents/personas/waverunner.md` — Waverunner deep research agent system instructions
- `.agents/personas/fodda-mcp.md` — Core Fodda MCP behavioral rules and system prompt  

`src/systemPrompt.ts` would then import from these files at build time (or read them at startup), keeping the single source of truth in the persona files.  
**Why not now:** Requires a build-step change and testing to ensure prompt integrity. Low risk but needs a focused session.  
**Agent:** MCP agent

---

## 🛑 Rollback & Kill-Switch for Waverunner (Unattended Agent)
**Status:** Not started — deferred from Engineering Policy adoption (May 2026)
**What:** Per policy §5, cron-triggered or unattended agents must have an emergency stop mechanism. Waverunner runs synchronously today (user-triggered only), but when proactive/background triggers are added, implement:
1. **Auto-disable:** If Waverunner fails N consecutive times (suggested: 3), write a `WAVERUNNER_DISABLED=true` flag to Firestore and stop accepting new requests until manually re-enabled.
2. **Rollback procedure:** Document in `.agents/workflows/` how to roll back a Waverunner config/prompt change (mirrors the Cloud Run rollback procedure in deploy.md).
3. **CHANGELOG entry required** for any prompt or config change (already policy, but needs explicit enforcement in CI).  
**Why not now:** Waverunner is user-triggered only. Priority rises when background triggers are introduced.  
**Agent:** MCP agent

---

## 🧪 Golden-Set Prompt Regression Tests
**Status:** Not started — deferred from Engineering Policy adoption (May 2026)
**What:** Per policy §4, agent config changes require golden-set testing to catch prompt regressions. This overlaps with the MCP Eval Harness (see above) but is scoped specifically to:
- A small set (~10) of canonical Waverunner + search queries with expected output shapes
- Run automatically before any deployment that touches `systemPrompt.ts`, `toolHandlers.ts`, or any `.agents/` file
- Fail the deploy if outputs deviate from expected structure  
**Relationship to MCP Eval Harness:** The Eval Harness (see above) is the full implementation. This is the minimal viable version — just enough to gate deploys. Build this first, evolve into the full Eval Harness later.  
**Agent:** MCP agent

---

## 🔌 Claude Enterprise Plugin — MCP Parity Fixes
**Status:** Not started — low priority until the plugin is our active route  
**Context:** The Claude Enterprise Plugin (`/v1/plugin/claude/*` in the Fodda API repo) has diverged from the MCP server. The plugin was last meaningfully updated at v1.1.0 (March 2026) and is missing several MCP capabilities.  
**What's missing:**
1. **Server-level formatting instructions** — MCP injects graph attribution rules, hyperlink formatting, and `suggest_next_prompts` into Claude's system prompt via the `instructions` field. Plugin has none of this, so Claude's formatting behaviour is inconsistent between the two integrations.
2. **`discover_adjacent_trends` endpoint** — MCP exposes this tool; plugin has no `/adjacent` endpoint. Needs `POST /v1/plugin/claude/adjacent` wired to `GET /v1/graphs/:graphId/adjacent`.
3. **Cross-graph fallback logic** — MCP retries against the `psfk` graph when a vertical graph (`sic`, etc.) returns empty. Plugin has no fallback, so evidence calls silently fail on vertical graphs.
4. **Stale command descriptions** in `plugin.json` — `/search` and `/evidence` don't include the presentation hints (attribution format, hyperlink formatting) that the MCP tool descriptions now carry.  
**Reference:** `Plugin_Update_Brief.md` in the Fodda Anthropic Plugin directory has the full spec with code examples.  
**Why now:** The Claude Enterprise Plugin is not our primary integration route. The MCP is. Fix when the plugin becomes a sales-critical path again.  
**Agent:** Fodda API agent (plugin code lives in `functions/v1/plugin/claude/`)

---

## 📟 SPT Pricing-Gap Alerting — durable log-based alert policy
**Status:** Not started — follow-up to the shipped Slack alert (June 2026)
**Severity:** P2 — revenue hygiene
**Context:** An unmapped billable route falls through to the $0.50 default (fail-visible). The API now logs a structured `spt_pricing_unmapped_route` ERROR to Cloud Logging AND fires a deduped Slack alert to #fodda-sales (one alert per path per process lifetime). Shipped in `fodda-api-new-00392-snv`.
**Gap:** The Slack dedup is per-process, so a *sustained* leak goes quiet after the first ping (and re-pings noisily when new instances spin up) — it signals "happened once," not "still happening / how often."
**Solution:**
1. Add a Cloud Logging **log-based metric** on `spt_pricing_unmapped_route` + an **alert policy** on its count/rate over a window. That is the authoritative monitor; Slack stays the heads-up nudge.
2. Confirm the alert reaches whoever actually *fixes* it (adds the route to `TOKEN_COSTS`) — engineering/ops, not only #fodda-sales.
3. (Optional) revisit fail-visible vs fail-closed if undercharge volume ever warrants it.
**Agent:** API agent (fodda-api)
