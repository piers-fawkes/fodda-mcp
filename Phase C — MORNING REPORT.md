# Phase C (Skill-Based Deliverables) — built overnight 2026-07-07

**Status: fully built, typechecked, committed. NOT deployed. C1 (Airtable) not run.**
Both repos build clean. Nothing is live yet — you deploy + verify.

---

## What shipped (code)

### API repo (`Fodda API/Fodda`, branch `main`)
- **`functions/v1/analystDeliverables.ts`** (new) — Firestore `analyst_deliverables` job store + `expert_agent_health` kill-switch store. Mirrors `analystSessions.ts`.
- **`POST /v1/analysts/:id/deliver`** — validates offering + ownership (tolerant pre-C1), launches the analyst's managed agent `background:true`, mounts `deliverable_template` at `/workspace/template.md`, attaches `fodda_mcp` (user-key transform → internal reads metered `mcp-orchestrated`), **charges the offering price server-side** (`decrementCredits`), returns a `job_id` (202).
- **`GET /v1/analysts/deliverables/:job_id`** — polls the interaction, extracts `interaction.artifacts[]` **defensively** (never read anywhere before — shape unverified, `steps[]` fallback), caches terminal state, enforces account ownership.
- **Offerings** — `getOfferings()` reads the 5 new fields tolerantly; `GET /analysts` + `/me` attach `offerings: [...]` per analyst.
- **Kill switch** — 3 consecutive managed failures → disable + Slack alert + consult routes to legacy fallback; clean run resets. Wired into both consult and deliver.

Commits: `feat(analysts): Phase C API…`, `fix(analysts): Phase C billing…`, `feat(offerings): Phase C C1…`

### MCP repo (`Fodda MCP`, branch `chore/sync-deployed-mcp-state` ← this is what deploys)
- **`request_deliverable`** + **`check_deliverable_status`** tools (35 tools, 20 billable).
- `list_analysts` surfaces the new per-analyst `offerings` automatically (API-side).
- systemPrompt ENGAGEMENT PATTERNS flipped from "coming soon" → live.
- Static `commissioned-deliverable` A2A skill.

Commit: `feat(mcp): Phase C — request_deliverable…` (+ a `chore(sync)` committing deployed-but-untracked `deepResearch.ts`/`types.ts` — see note below).

> ⚠️ **MCP branch**: the deployed state lives on `chore/sync-deployed-mcp-state`, **not `main`** (main is stale). I also found `src/deepResearch.ts` + `src/types.ts` were deployed but never git-added (imported by the A2A refactor) — committed them so the tree is consistent.

---

## Deploy order (morning)

1. **Redeploy API** — this also ships the **Phase B threading fix still owed from last night** (`previous_interaction_id` env-reuse bug). One deploy covers both B-fix and Phase C.
2. **Redeploy MCP** from `chore/sync-deployed-mcp-state`.
3. **C1 Airtable** (see [`Brief … Phase C — C1 Airtable schema + seed`](Brief%20Agentic%20Analysts%20—%20Phase%20C%20—%20C1%20Airtable%20schema%20+%20seed.md)) — add 5 fields to Offerings, then run `npx tsx scripts/seed_deliverable_offerings.ts --commit`. Until this runs, `offerings` arrays are `[]` and `request_deliverable` returns `OFFERING_NOT_FOUND` — that's expected, not a bug.

---

## Verification checklist (after deploy + C1)

- [ ] **Phase B re-test** (owed from last night): 2-turn consult, turn 2 returns `engine:antigravity_managed` + `session_id`, bare follow-up stays on-topic, turn-3 cost < turn-1.
- [ ] `GET /v1/analysts` → `ben-dietz-sic` has populated `offerings: [...]`.
- [ ] MCP `list_analysts` shows those offerings.
- [ ] `request_deliverable(ben-dietz-sic, trend_briefing, "<brief>")` → `job_id`; `check_deliverable_status` → eventually `completed` **with artifact links** (⚠️ **verify the artifact shape** — my extractor guesses field names; adjust `extractDeliverableArtifacts` once you see a real completed interaction).
- [ ] Account charged the offering price once.
- [ ] Kill switch: force 3 managed failures → agent disabled + Slack alert + consult falls back to legacy.

---

## Deferred (deliberately — flagged, not hidden)

1. **SPT deliverables** — the `/v1/research/meter` path recomputes fixed `TOKEN_COSTS` server-side and can't price a per-offering charge; I charge via `decrementCredits` in `/deliver` (credit accounts only). Anonymous SPT sessions are refused (account required). To support them, extend the meter to price `skill_deliverable` from the offering server-side (touches the Stripe SPT branch — do it with live testing, not blind).
2. **`EXPERT_AGENT_MAX_TOKENS`** (token budget) — recon confirmed `max_thinking_tokens` is never set; I would not ship an unverified SDK field that could 400 every managed consult. Verify the field name against the SDK, then add to `interactionOpts`.
3. **Per-offering A2A card skills** — one static capability skill for now; derive one skill per live offering once C1 seeds them.
4. **Artifact shape** — `interaction.artifacts[]` is read defensively; confirm against a real completed deliverable and tighten.
5. **Expert payout accounting** — offering charge is recorded (taskType `skill_deliverable`); wiring the expert-payout side of it is a follow-up.

---

## Nothing was faked
No live calls were made against Phase C (it isn't deployed). Every "verify" above is genuinely owed. The only thing I ran live was last night's Phase B test, which is what surfaced the threading bug now fixed and awaiting redeploy.
