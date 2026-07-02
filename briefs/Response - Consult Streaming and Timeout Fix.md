# Response — Consult Streaming & Timeout Fix

**From:** MCP codebase  
**Date:** 2026-06-17  
**Re:** Response to API note on `ben-dietz-sic` consult timeouts

---

## Acknowledged — API-side parallelization

Good to see the `Promise.all` changes on Phase 1/Phase 2 of the consult pipeline. The 2-4s savings should help for simpler analysts. We independently confirmed the MCP server is clean: no caching of `/v1/analysts/consult`, stateless handler, no session bleed. The context-crossover Claude reported (Jeremy's museum answer surfacing on Ben's mobility call) is not reproducible from our code — that's either upstream API state or Claude client-side context confusion after a timeout.

---

## What we'll do — phased plan

### Phase 1: Immediate — raise timeout + surface `timing_ms` (can ship today)

The current `foddaRequest` uses a global `AXIOS_TIMEOUT_MS = 30000` for every call. Rather than raising the global ceiling (which would let slow graph searches hang too), we'll do a **per-path override** for the consult endpoint:

**`index.ts`** — `foddaRequest()`
```diff
 const url = `${API_BASE_URL}${path}`;
- // H3: 30s timeout — aligns with MCP client expectations.
- const AXIOS_TIMEOUT_MS = 30000;
+ // Base timeout: 30s. Extended for slow endpoints (analyst consult does multi-turn LLM work).
+ const AXIOS_TIMEOUT_MS = /\/analysts\/consult/.test(path) ? 60000 : 30000;
```

**`toolHandlers.ts`** — `consult_analyst` handler: surface `timing_ms`
```diff
 const parts: string[] = [reportText];
 
+ // Surface server-side timing for observability
+ if (result.timing_ms != null) {
+     parts.push(`\n--- TIMING: ${result.timing_ms}ms server-side ---`);
+ }
+
 // --- Structured envelope fields (Phase 2 Digital Twin) ---
```

**`toolHandlers.ts`** — timeout-specific error in catch block:
```diff
 } catch (err: any) {
     const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
     if (trialResult) return trialResult;
+    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
+        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
+            error: `Analyst consultation timed out (60s). The upstream API is processing a complex query with tool calls. Retry in a moment, or use search_graph / get_expert_intelligence for faster results.`,
+            analyst_id,
+            timeout: true
+        }) }] };
+    }
     const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
```

**`queryCache.ts`** — add explicit uncacheable pattern (defensive):
```diff
 const UNCACHEABLE_PATTERNS: RegExp[] = [
     /\/v1\/graphs$/,
     /\/widget\//,
     /\/register$/,
+    /\/analysts\/consult/,  // identity-sensitive, never cache
 ];
```

### Phase 2: Follow-up — SSE streaming for consult (when API ships the endpoint)

Once you ship `POST /v1/analysts/consult/stream`, here's what changes on the MCP side:

1. **New streaming caller** in `index.ts` — parallel to `foddaRequest()`, uses `fetch()` with `ReadableStream` to consume SSE chunks. No axios — it doesn't handle `text/event-stream` well.

2. **`consult_analyst` handler** switches from `foddaRequest('POST', '/v1/analysts/consult')` to the streaming caller. MCP SDK supports progressive results via `server.sendLoggingMessage()` (we already use this pattern in the Waverunner/deep-research tools), so we can push partial text to Claude as chunks arrive rather than buffering the entire response.

3. **Timeout becomes moot** — with streaming, the first chunk arrives in <5s (connection established + initial preamble), so the 30s ceiling only applies to the gap between chunks, not total response time.

4. **Fallback** — if `/consult/stream` 404s (not deployed yet), fall back to the standard `/consult` path with the 60s timeout.

> **Note:** We have no existing SSE consumer in the MCP codebase. The `SSEServerTransport` import in `index.ts` is for *serving* SSE to MCP clients, not consuming upstream SSE. Phase 2 will be the first instance of the MCP server acting as an SSE *client*.

---

## Questions for API team

1. **`/consult/stream` format** — what's the SSE event schema? We need to know:
   - Event name (e.g., `data`, `chunk`, `delta`)?
   - Is the final event a `[DONE]` sentinel or a separate event type?
   - Do envelope fields (`coverage`, `referrals`, `sources_used`, `speaker_note`) come in the final event or as separate events?
   - Does `timing_ms` come in the final event?

2. **Context bleed** — the report said a timed-out Jeremy Bergstein museum answer was served verbatim as the response to a Ben Dietz mobility call. Our side is stateless and doesn't cache consult. Is there any session or cache layer on the API side that could serve a prior result on retry? Worth checking if the consult pipeline keys on `(user_id)` rather than `(user_id, analyst_id, query)`.

3. **Phase timing in response** — will `timing_ms` be a flat total, or will you break it out into `phase1_ms` / `phase2_ms` / `llm_ms`? Granular timing would help us tune the timeout ceiling intelligently.

---

## Timeline

| Item | ETA | Blocked on |
|------|-----|------------|
| Phase 1: 60s timeout + `timing_ms` + defensive cache fix | Today | Nothing |
| Phase 2: SSE streaming consumer | After API ships `/consult/stream` | API endpoint + event schema |
