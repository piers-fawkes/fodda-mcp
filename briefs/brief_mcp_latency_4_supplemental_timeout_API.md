# Brief — MCP Query Latency #4: Supplemental Summarize Timeout (API Agent)

Owning repo: **Fodda API** · Agent: **api-agent**
Execution handle (run from Fodda API repo root): `/build-from-brief briefs/brief_mcp_latency_4_supplemental_timeout_API.md`

> Part 4 of 5. Your file: `functions/v1/supplemental/unifiedContextHandler.ts` ONLY. Shared: `CHANGELOG.md` (append-only).

## Context

When a query hits the supplemental arm, each selected source is fetched and then AI-summarized. Verified gap on the read hot path:
- The **fetch** is time-bounded — `withTimeout(fetch…, SOURCE_TIMEOUT_MS)` at `:2038`, with `SOURCE_TIMEOUT_MS = 15000` (`:339`).
- The **summarize is not**. `summarizeSourceResult` (`:1850`) calls `gemini-flash-latest` (`:1888`) inside a bare try/catch with **no `Promise.race`/`withTimeout`**, and is awaited at `:2051`. One slow Flash call can hold the supplemental arm open indefinitely, and the supplemental arm is often the slower side of the response's outer `Promise.all`.
- Two house-rule concerns: the supplemental budget must be **≤10s** (the current 15s fetch ceiling already exceeds it), and supplemental clients must **never throw** — they return `{ error, message, source }` or usable data.

(The audit also considered a "two serial Flash calls before summarize" claim — verified as mostly **not** firing on this read path due to regex short-circuits and domain gating. Do not chase it; the summarize timeout is the real fix.)

## What to build — `functions/v1/supplemental/unifiedContextHandler.ts`

1. **Bound the summarize.** Wrap the `summarizeSourceResult(...)` call (`:2051`) — or the model call inside `summarizeSourceResult` at `:1888` — in the existing `withTimeout(...)` helper (`:1502`) with a tight ceiling (suggest ≤4000ms; tune so fetch + summarize stay within the overall ≤10s budget).
2. **Graceful fallback on summarize timeout/failure.** If the summarize times out or errors, return the **raw (un-summarized) source result** (or the existing graceful shape) rather than hanging or throwing. Preserve the existing try/catch and the `_summarized_by_ai` flag semantics (set it `false`/omit when the summary was skipped).
3. **Honor the 10s supplemental budget.** Lower `SOURCE_TIMEOUT_MS` from `15000` to `≤10000` (`:339`). Prefer an overall per-source deadline so fetch + summarize together cannot exceed 10s (e.g. derive the summarize ceiling from the time remaining after the fetch).

## Where to register
- All changes are local to `functions/v1/supplemental/unifiedContextHandler.ts` (`summarizeSourceResult`, the `:2051` call site, and the `SOURCE_TIMEOUT_MS` constant at `:339`).

## Definition of Done
- `npx tsc -p tsconfig.api.json --noEmit` → 0 errors.
- A forced-slow summarize (temporarily stub the model promise to exceed the ceiling) returns the raw source within the bound — the request does not hang and does not throw.
- `SOURCE_TIMEOUT_MS ≤ 10000`; the combined fetch + summarize path for any single source stays within the ≤10s supplemental budget.
- Supplemental still never throws (returns `{ error, message, source }` or data on every path).
- Walkthrough: before/after worst-case supplemental-arm latency on a macro query that selects ≥1 source, and confirmation the AI-summary still runs on the happy path.

## Do Not
- Do not remove the AI-summary feature — only bound it with a raw-result fallback.
- Do not let fetch + summarize exceed the 10s supplemental budget.
- Do not let any path throw out of a supplemental client.
- Do not touch pricing/SPT text or files outside `supplemental/`.
- `CHANGELOG.md` shared — append; keep all entries on conflict.

## Files Expected to Change
- `functions/v1/supplemental/unifiedContextHandler.ts`
- `CHANGELOG.md`
