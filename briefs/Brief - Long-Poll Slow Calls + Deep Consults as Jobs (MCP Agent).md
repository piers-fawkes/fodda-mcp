# Brief: Long-Poll Slow Calls + Deep Consults as Jobs

**Target Agent:** Fodda MCP Agent (`Fodda MCP` repo)
**Date:** 2026-10-02
**Priority:** P2 (reliability — removes client-side timeouts on deep work)
**Execution handle:** `/build-from-brief briefs/Brief - Long-Poll Slow Calls + Deep Consults as Jobs (MCP Agent).md`

---

## Context

From the Pitch Protocol UX review: the one pattern worth copying is **long-poll**. Pitch Protocol's
`get_status` holds the HTTP connection open ~30–45s and returns the instant the job changes state. The
agent just calls again — no sleeps, no "check back later." Agents can't sleep, so a blocking server-side
call IS the wait.

Fodda already returns job ids for async work (`deep_research_topic`→`check_research_status`,
`get_supplemental_context`→`check_supplemental_status`, `request_deliverable`→`check_deliverable_status`).
But those status tools return *immediately* with "still RUNNING, poll again in 10s"
(`src/toolHandlers.ts`). The agent then either hammers the tool or, worse, tells the user to come back —
and deep consults (`consult_*` with `deep:true`) run inline ~45s+ and occasionally time out on the client.

## What to build

1. **Turn the three existing status tools into long-pollers.** On a RUNNING job, hold the handler up to
   ~30s (well under the client/transport ceiling), polling internal state every ~1–2s, and return the
   moment status becomes COMPLETE/FAILED — otherwise return a short "still working" after the hold so the
   agent loops. Update each tool description to: *"This call waits server-side (~30s) and returns as soon
   as the job finishes. Keep calling until status is COMPLETE or FAILED. Do not ask the user's permission
   to keep polling; give them one short 'still working' line between calls."*

2. **Make `deep:true` consults async, reusing a status tool — do not add a new tool.** Currently
   `consult_analyst`/`consult_human_agent` with `deep:true` (or "do your homework" intent) call the API
   inline and block. Instead: return a job id immediately and resolve it through a long-poll status tool
   (extend an existing one, e.g. a shared `check_*` that routes by job-id prefix, or reuse
   `check_research_status`). **Tool count stays at 57** (v1.46.86 cap — no proliferation). Normal
   (non-deep) consults stay fully inline/instant — no change for ChatGPT, Copilot, Grok, or AgentKit
   callers who don't pass `deep`.

## Constraint — in-memory job store

`activeResearchJobs` / `activeSupplementalJobs` are in-memory `Map`s, per Cloud Run instance
(`max-instances 10`, no explicit session-affinity flag in `deploy_cloud_run.sh`). A long-poll must run on
the instance that holds the job. Streamable-HTTP session→transport affinity keeps a client on one
instance in practice, but:
- Verify a deep-consult job and its status polls stay on the same instance under normal session reuse.
- If they can split, either pin the deep-consult result into the same session's transport, or note it as
  a known limitation and keep deep consults inline until a shared job store exists. **Do not silently ship
  a long-poll that returns "job not found" when a poll lands on another instance.**

## Definition of Done

- A deep consult (server taking 60s+) completes without a client-side timeout: job id returned at once,
  status long-polls, final answer delivered — proven by a test that stubs a 60s job.
- `check_research_status` / `check_supplemental_status` / `check_deliverable_status` each hold ~30s on a
  RUNNING job and return immediately on completion.
- Tool count unchanged (57); normal consults unchanged (regression test on an inline consult).
- Same-instance job/poll affinity confirmed, or the limitation documented and deep-consult-async deferred.
- CHANGELOG updated with a real verification result.

## Do Not

- Do not add a new tool or touch the `/chatgpt` profile's 24-tool set.
- Do not change normal (non-deep) consult latency or shape.
- Do not hold a request longer than the transport/client ceiling allows (stay ~30s per hold, then let the
  agent re-call).

## Files expected to change

- `src/toolHandlers.ts` (status-tool long-poll loops; deep-consult job path)
- `src/index.ts` only if a shared job route/affinity change is needed
- a test (e.g. `src/test_longpoll_status.ts`) stubbing a slow job
- `CHANGELOG.md`
