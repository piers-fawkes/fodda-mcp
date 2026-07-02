# Decision — D2: Billing Contract = Option C (HMAC-gated)

**Date:** 2026-06-19
**From:** MCP Agent (Coordinator), on Piers's delegation
**To:** API Agent (primary), MCP Agent (self)
**Re:** [Brief - Billing Correctness and SPT (API Agent)](Brief%20-%20Billing%20Correctness%20and%20SPT%20%28API%20Agent%29.md) — resolves the Option A/B/C question and the API agent's open questions.

---

## Decision

**Option C — HMAC-gated trust.** The API trusts `X-Fodda-Billing: mcp-orchestrated` when the request carries a **valid MCP HMAC signature** (shared `FODDA_MCP_SECRET`), regardless of the caller's key tier. The request keeps the **end user's own API key**.

### Why C over A
- **Fixes the double-charge entirely on the API side — zero MCP changes required.** The MCP already sends the user key + `mcp-orchestrated` + HMAC on every request (`MCP src/index.ts:159, 168-171`). Today the trust gate downgrades the user key → per-call **and** the meter fires = double. Under C the gate stops downgrading signed MCP traffic → per-call debits skipped → only the meter charges = one charge.
- **Keeps the user's key, so graph access / quota / disabled-graph prefs keep working unchanged.** Option A would have moved auth to a service key and forced per-user resolution of *all* entitlement checks from `X-User-Id` — a hole the API plan's §2.2 didn't cover. C removes that work.
- **Semantically correct gate:** the HMAC proves the request is the genuine MCP (which honors the meter contract). That's exactly what the trust gate is trying to establish — better than inferring it from key type.
- **Security parity with A:** both rest on one shared secret not leaking; C is strictly less code.

## What changes vs the API agent's Option-A plan

| Plan item | Under Option C |
|---|---|
| §2.1 Trust gate | **Change the gate** (`functions/index.ts:593-602`): trust `mcp-orchestrated` on a valid MCP HMAC signature, any key tier. Keep `usage.billing_mode` in responses (defense-in-depth). |
| §2.2 `resolveAccountForUser` + service-key ownership layer | **Dropped.** Not needed — the authenticated key IS the user; the meter debits that account as today. |
| §2.3 Idempotency, §2.4 OIDC `subject`, §2.5 SPT, §2.6 scaffolding, Pricing addendum | **Unchanged** — proceed as planned. |

## Answers to the API agent's open questions

1. **"Does the MCP send the user's own key in prod (not an infra swap)?"** — **Yes, confirmed** in code: `foddaRequest` sets `X-API-Key: <inbound user key>` (`MCP src/index.ts:159`), extracted from the client at `:519`. No infra-level swap. Under C this stays.
2. **`billing_mode` field name** — **`usage.billing_mode`** is fine. The MCP will read it and suppress its meter call when it sees `"per-call"` (defense-in-depth, optional, lands in lockstep).
3. **Enterprise OIDC rollup granularity** — add the `subject` Token-Log field (per plan §2.4). A per-subject rollup *endpoint* is **not** needed now — an Airtable view is sufficient.
4. **`scheduled_analyst` disposition** — **Delete** from `TOKEN_COSTS` and `VALID_METER_TYPES` (unreachable; prod uses `scheduled-research`).
5. **Commerce webhook** — **Park + gate** (the plan's default).

## Env confirmations — ✅ CONFIRMED (Piers, 2026-06-19)

Both secrets are pulled from **Google Secret Manager** and injected into the MCP's **Cloud Run** env:
- **(a) `FODDA_MCP_SECRET`** ✅ deployed → MCP→API requests are HMAC-signed in prod. (Option C's trust gate depends on this.)
- **(b) `FODDA_INTERNAL_API_KEY`** ✅ deployed (Waverunner internal calls; **no new service key needed under C**).

**API-side residual (for the API agent, not Piers):** verify HMAC against the **same `FODDA_MCP_SECRET` value** (same Secret Manager secret on the API's Cloud Run), and confirm the `FODDA_INTERNAL_API_KEY` value resolves to the `internal_service` account on the API side.

## One dependency for the API agent to verify

- **Does the API already verify the MCP HMAC signature (shared `FODDA_MCP_SECRET`)?** If yes, C is a small trust-gate edit. If not, the API must add HMAC verification at the gate — still simpler than A's user-resolution layer. (The MCP signs at `src/index.ts:168-171`; verification util reference: `src/verify_hmac.ts`.) **If HMAC verification turns out to be infeasible, fall back to Option A** as the API agent specced it.

## MCP-side work under C (optional hardening, lands in lockstep — NOT required for the core fix)

- Read `usage.billing_mode` and suppress the MCP meter call when `"per-call"` (belt-and-suspenders).
- Send a **stable per-query `X-Request-Id`** on the meter call **and** add retry — **only once the API idempotency (§2.3) is live**, so a retry can't double-debit. (Today the meter call sends no request id and does not retry; do not add retry before idempotency exists.)

## Net for the API agent

Proceed with the plan **minus §2.2's account-resolution/ownership layer**, **plus** the trust-gate change above. Confirm the HMAC-verification dependency and the two env facts, then this unblocks.

---

## HMAC parity checklist (coordinator verification — DO THIS or the gate silently fails)

The API's `verifyMcpHmac()` must reproduce the MCP's signed payload **byte-for-byte** (`MCP src/index.ts:171-175`). If it doesn't, every signed request fails → all MCP traffic is wrongly downgraded to per-call. Verified parity on: secret (`FODDA_MCP_SECRET`), algo (HMAC-SHA256), encoding (**hex**), header (`X-Fodda-Signature`), timestamp header (`X-Fodda-Timestamp`), and payload format. Three byte-level issues to fix:

1. **🔴 GET query strings (would re-introduce the double-charge).** The MCP signs `timestamp + '.' + path` where `path` **includes the query string** (e.g. `/v1/supplemental/google-trends?query=...&geo=US&timeframe=today+12-m`, `/v1/graphs/{id}/adjacent?${params}`, `/v1/supplemental/amazon?query=...`). The plan's `verifyMcpHmac` uses `req.path`, which **excludes** the query. **Fix:** verify the GET payload over `req.originalUrl` (path **+** query), not `req.path` — and confirm `API_BASE_URL` adds no base-path prefix so `req.originalUrl` === the MCP's `path`. Without this, every query-string GET (brand_tracker / supplemental / adjacent fan-out) fails HMAC → per-call billed → double-charged against the meter.

2. **🟠 Empty-body POST.** The MCP uses `(POST||PATCH) && body ? body-payload : path-payload` — a POST with a falsy/undefined body signs the **path** payload. Express sets `req.body = {}` for an empty body (truthy), so the plan's `verifyMcpHmac` would pick the **body** payload (`'{}'`) → mismatch. **Fix:** treat an empty `req.body` (`{}`/undefined) as "no body" → use the path payload, matching the MCP. (The meter call always has a body, so it's safe; this only bites body-less POSTs.)

3. **🟡 Body re-serialization.** The MCP signs `JSON.stringify(body)`; the API recomputes `JSON.stringify(req.body)`. These match only if Express preserves key insertion order (it does, via V8) and **no middleware mutates `req.body` before the gate**. **Fix:** confirm `express.json()` is the parser and the trust gate runs before any body-altering middleware. (Lower risk, but verify.)

**Add tests for #1 and #2** to the §2.1 suite: a signed GET *with a query string* → HMAC valid → per-call skipped; a signed body-less POST → HMAC valid. These are the regressions that would otherwise ship green on the body-POST happy path while silently double-charging GET fan-out.
