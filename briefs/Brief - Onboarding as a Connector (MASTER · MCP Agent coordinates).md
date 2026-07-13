# Brief — Onboarding-as-a-Connector (Fodda MCP)

> **For:** MCP Agent (**coordinates** this initiative) — but this is a **MASTER brief** spanning three repos. Decompose into per-agent work orders before building.
> **Target repos / slices:** Fodda API (shared onboarding endpoints — the spine) · Fodda MCP (onboarding tools) · Fodda Website (gate page + Claude connector-add page).
> **Depends-on:** prompt single-source endpoint (see `Brief Website ... Prompt Single Source`); scheduling for Step 5 — **owned by the Website repo**, `Fodda Website/briefs/Brief — Interview Scheduling via Recall.md` (ships independently; may delegate the MCP tool back here later).
> **Blocker to resolve first:** auth/trust — `user_id` is self-asserted (see §7 open questions).
> **Status hub:** this repo's `briefs/` (cross-repo coordination hub; target repo is in each brief's filename `(… Agent)`).

**Status:** Design / scoping handoff (Piers, 2026-07-09). Intended to be picked up by a fresh thread. **Not yet built.**
**One-line:** Let an expert onboard to Fodda *conversationally inside Claude* by adding the Fodda MCP connector, instead of (or alongside) the web wizard.

> **Read this first if you're the new thread.** This document is self-contained. Section 1 orients you to Fodda and the repos; Section 2 is the existing web wizard you're mirroring; Section 3 is the target flow; Section 4 maps every step to code that already exists; Sections 5–7 are the gate-page changes, dependencies ("what we'll need"), and open questions. Scheduling (Step 5 / `schedule_interview`) is specified in a **companion brief owned by the Website repo**: `Fodda Website/briefs/Brief — Interview Scheduling via Recall.md`. It ships independently; this initiative delegates the MCP `schedule_interview` tool as a later, optional wrapper over that endpoint.

---

## 1. Context — what Fodda is, and the repos involved

Fodda turns a human domain expert into a **"Human Agent"**: an AI persona grounded in that expert's own voice, expertise, and evidence, queryable by other people's LLMs via an MCP connector. Experts onboard by supplying (a) a **voice study** and (b) an **expertise map**, then doing a short **voice interview**; Fodda mines all of it into an expert "card" + knowledge graph and provisions them an MCP connector.

**Repos (all under `/Users/piersfawkes/Documents/`):**
- **`Fodda Website`** (this repo) — `server.js` is a single large Node HTTP handler holding every onboarding endpoint; `pages/JoinExperts.tsx` is the web onboarding wizard. Deploys to Cloud Run (`deploy_website.sh`); **deploys ship the working tree**, not git HEAD.
- **`Fodda MCP`** — the connector service, deployed at **`mcp.fodda.ai`**. Already exposes tools like `sign_up_free_account`, `update_user_profile`, `list_analysts`, `consult_analyst`, `get_my_account` — so **account mutation via MCP is a proven pattern here**. The new onboarding tools live in THIS repo. See its `Brief Agentic Analysts*.md` files for adjacent work — check for overlap before designing tools.
- **`Fodda API`** — `analysts.ts`, self-use billing (expert earnings live here).
- **`Fodda CE`** (`expertgraph`) — ingest pipeline that turns a finished onboarding into graph nodes.

**System of record:** Airtable base **`appXUeeWN1uD9NdCW`**, table **Analysts** (`tblvrKdn8FvbSJmSs`). Record lifecycle via the `Status` field: `Onboarding — Started / Lane Chosen / Data Uploaded / Interview` → `Pending Approval` → `Active` / `Rejected`.

**MCP connector URL shape (critical):** `https://mcp.fodda.ai/mcp?api_key=<key>&user_id=<email>`. **Both** params are required — without `user_id` the connector falls back to `anonymous` and nothing is scoped to the expert. Provisioning + URL assembly already exists server-side: `lookupExpertMcpCreds(email)` in `server.js:348` returns `{ apiKey, mcpUrl, claudeConnectorUrl }`.

**Claude one-click connector deep-link (already used):** `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Fodda&connectorUrl=<url-encoded mcpUrl>` — built in `server.js:359` and `pages/Connect.tsx:96`. Reuse verbatim for the gate page.

---

## 2. The existing web wizard you're mirroring (`pages/JoinExperts.tsx`)

The connector flow should reach the **same backend state** as this wizard, just driven conversationally:
1. **Basic info + auth** — name/role/knowledge-area, Clerk sign-up via Google or LinkedIn (`handleOAuth('oauth_google' | 'oauth_linkedin_oidc')`, `JoinExperts.tsx:4006`).
2. **Run the Prompts** — expert runs two prompts in their own LLM and pastes back JSON: `getPromptA()` (voice study, `~JoinExperts.tsx:1127`) and `getPromptB()` (expertise map, `~1269`). *This copy-paste is the friction the connector removes.*
3. **Deep Research** — `/api/deep-research` (Gemini 2.5 Flash + Google Search grounding) sweeps the public web; result persisted to `deepResearchJson`.
4. **Step 4 = Review Your Expertise** *(shipped 2026-07-09)* — detected themes shown as checkboxes; expert keeps their real strengths; `/api/generate-questions` builds an 8-question interview **focused on the confirmed themes**; stored to the `interviewQuestions` field.
5. **Voice interview** — a Recall.ai bot joins a Google Meet, asks the stored questionnaire, transcript captured; the completion webhook finalizes onboarding (`/api/recall-webhook` → internal `/api/onboard-expert`), emails the expert, provisions the connector, ingests into CE.

---

## 3. Target flow (Piers's spec, 2026-07-09)

The expert has signed up as a **Claude user** (see §5 gate page), had creds provisioned, added the Fodda connector, and typed **"Onboard me as a Fodda expert."** The connector then drives:

- **Step 1 — Basic info.** Agent asks name / role / knowledge area (wizard Step 1 equivalent). Once given → Step 2.
- **Step 2 — Expertise.** Agent asks what they're expert in. In the background this (a) **kicks off Deep Research** and (b) **generates the two probe prompts** for Step 3.
- **Step 3 — Consent to probe.** Agent says it's about to run a probe (analyze the user's own context/history) and asks if that's OK.
- **Step 4a — Probe + confirm.** Agent runs the probe, **shows what it found**, asks "is this what you'd expect?" If yes → **save as the voice-study + expertise-map JSONs**.
- **Step 4b — Theme selection.** Using those JSONs + Deep Research, present **the themes we think they're into, with checkboxes / selection**. (Same logic as web Step 4.)
- **Step 5 — Schedule.** Ask the expert to **pick a time**; confirm "we'll send an invite to <user_id email> — see you then." *(Backed by the scheduling brief — this is `schedule_interview(datetime)`.)*
- **Step 6 — Build questionnaire.** Process the agreed themes + backing data → generate the interview questionnaire (→ `interviewQuestions` field).
- **Step 7 — Interview.** Happens via **Google Meet** at the scheduled time (Recall bot already waiting).
- **Step 8 — Status & admin.** Expert can ask Claude: *"what's the status of my Fodda onboarding?"*, *"how much did I earn from Fodda this month?"*, and other expert admin (take-down request, edit profile, etc.).

**Out of scope:** no live/adaptive LLM interviewer — the interview keeps its deterministic spine. This is a **parallel path** (decided 2026-07-09): the web wizard stays for non-Claude experts.

---

## 4. Step → tool → existing backend map

**Architecture principle (Piers, 2026-07-09): one process, two UXs, all through the API.** The Claude/MCP path and the in-app wizard must drive the **same onboarding process** — one implementation, exposed as API endpoints — and differ only in their UX. **No onboarding logic lives in a front-end;** the MCP tools and the wizard both *call the same API* ("any API calls should be run thru API calls"). Canonically these endpoints belong in **Fodda API** (or a single shared route both consume); today several live in `Fodda Website/server.js` and would move/be exposed accordingly. This resolves the earlier "where do the endpoints live" question: **through the API, shared by both paths.**

Most primitives already exist in `server.js`. New MCP tools (in `Fodda MCP`) are mostly thin wrappers **over those shared API endpoints** — not reimplementations.

| Flow step | New MCP tool (Fodda MCP repo) | Backs onto (mostly exists) |
|---|---|---|
| trigger | `begin_expert_onboarding` | creates/loads Analyst record; returns the two probe prompts (see §6 "prompt delivery") |
| 1 | `submit_basic_info(name, role, knowledgeArea)` | upsert via `/api/prepare-voice-interview` or `/api/onboard-expert` slug logic |
| 2 | (same call kicks off) `run_deep_research` | `/api/deep-research` → persists `deepResearchJson` |
| 3–4a | `submit_expertise_analysis(voiceStudy, expertTopics)` | `/api/prepare-voice-interview` (writes `voiceStudyRaw`, `expertTopicsRaw`) |
| 4b | `get_detected_themes` + `confirm_themes([...])` | theme derivation (see `getReviewThemes` in `JoinExperts.tsx`) + `/api/generate-questions` (accepts `confirmedThemes`) → `interviewQuestions` ✅ |
| 5 | `schedule_interview(datetime)` | **companion scheduling brief** — `createMeetSpace()` + `createRecallBot({ joinAt })` + `.ics` |
| 6 | (runs inside `confirm_themes`) | `/api/generate-questions` → store questionnaire ✅ |
| 7 | — (out-of-band voice call) | Recall bot + Meet; `/api/voice-interview/questions`, `/api/recall-webhook`, `/api/voice-interview/complete` |
| 8 | `get_onboarding_status`, `get_my_earnings` | Analyst `Status` read; earnings from **Fodda API** self-use billing (confirm source) |

**Key existing symbols:** `lookupExpertMcpCreds` (`server.js:348`), `createRecallBot({meetingUrl,botName,metadata,joinAt,outputMediaUrl})` (`245`, `join_at` at `266`), `createMeetSpace()` (`328`), `/api/onboard-expert` (`2035`), `/api/prepare-voice-interview` (`1820`), `/api/generate-questions` (`1251`), `/api/voice-interview/questions` (`3385`), `/api/recall-webhook` (`~3446`).

---

## 5. Gate-page changes (web — `pages/JoinExperts.tsx` sign-up gate)

Push **Claude-user sign-up vs. other-systems sign-up** — likely a **toggle** with the *same* options underneath (sign up via **LinkedIn** or **Google**, reusing `handleOAuth`).

When a user signs up **as a Claude user**, after creds are provisioned (`lookupExpertMcpCreds`), route them to a **new page** with:
1. **"Add Fodda As A Connector Now"** — the `mcpUrl` (with `user_id`) + the one-click `claudeConnectorUrl` deep-link (§1). This is the exact pattern already on `pages/Connect.tsx`.
2. **"Now write in Claude: *Onboard me as a Fodda expert*"** — make that phrase a **clickable Claude deep-link** that pre-fills the prompt (Claude supports a `?q=`-style new-chat prefill — confirm current param) so one click drops them into a chat primed to start.

Non-Claude sign-ups continue into the existing web wizard.

---

## 6. What we'll need (dependencies checklist)

- [ ] **MCP tool layer** in `Fodda MCP`: the tools in §4. Thin wrappers → website endpoints / Fodda API.
- [ ] **Prompt-delivery endpoint** — today `getPromptA/getPromptB` are string literals inside the React component. Extract them to a backend endpoint (e.g. `GET /api/onboarding-prompts`) so the wizard *and* the connector serve **one source of truth**. This is the one refactor that benefits both paths; do it first. **Already briefed:** see `Brief Website Facilitator Onboarding Mode and Prompt Single Source.md` (Part B) — it flags the same duplication (prompts live in `JoinExperts.tsx` *and* CE READMEs and will drift). Coordinate with it rather than re-designing.
- [ ] **Identity / account mapping** — connector `user_id` (email) → Fodda User/Account → Analyst record, reusing the wizard dedupe (slug, then email fallback). `sign_up_free_account` / `get_my_account` in Fodda MCP show the account side already works.
- [ ] **Scheduling backend** — the companion Recall brief (`schedule_interview`).
- [ ] **Async Deep Research status** — a poll (`check_onboarding_status`) so the agent can start DR, say "I'll keep going," and resume. (Chat makes the DR delay a non-issue — this is a *feature* of the MCP path.)
- [ ] **Status + earnings read** for Step 8 — Analyst `Status`; **confirm the earnings-by-expert data source** in Fodda API (self-use billing) and whether a `get_my_earnings`-style read exists or must be added.
- [ ] **Gate-page work** (§5) + the Claude prompt-prefill deep-link param (confirm current form).
- [ ] **`interviewQuestions` Airtable field** — ✅ already added (multilineText, Analysts table).
- [ ] **Recall calendar/scheduling** — ✅ specified in the companion brief.

---

## 7. Open questions (resolve before building)

1. **Auth / trust — the sharp one.** `user_id` is **self-asserted** in the connector URL. What stops connector user A from onboarding *someone else*, or submitting garbage that reaches `Pending Approval`? Options: require the onboarding to be tied to the Clerk-authenticated account that provisioned the creds; add an email-confirm step before an Analyst can leave `Onboarding — *`. **Decide before this mutates production.**
2. **Probe mechanism.** Does `begin_expert_onboarding` return the full prompt *text* for the agent to run (tight output schema, server-controlled IP), or a thinner instruction ("analyze our history for expertise in X, then call `submit_expertise_analysis`")? **Lean: return text** — downstream parsing depends on the JSON schema.
3. **Where does onboarding state live during a chat?** The Analyst record is the natural store; each tool reads/writes it. Confirm no reliance on wizard-only `localStorage`.
4. **Granola / other context connectors.** If the user has Granola (or similar) connected in the same Claude session, the probe agent can mine it as another source — no special handling needed (the web wizard's optional Granola prompt block, shipped 2026-07-09, is the non-MCP equivalent).
5. **Overlap with `Brief Agentic Analysts` (Fodda MCP repo).** Check before designing tool names/shapes.
6. **Step 8 scope.** Just status + earnings, or also take-down / profile edits / card preview? `update_user_profile` already exists.

---

## 8. Why this is worth doing (motivation for the thread)
- **Kills the JSON copy-paste round-trip** — the exact friction that made the first cohort (Jeff Squires, Jess Graham) stumble and re-run onboarding.
- **Neutralizes the Deep Research delay** — async chat tolerates minutes gracefully.
- **Self-serve expert admin** — Step 8 answers the constant "where's my agent / what did I earn" questions inside the tool experts already use.
