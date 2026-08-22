# Brief — Close the remaining MCP identity gap in the Questions log

**From:** Piers (2026-08-22)
**Owning repo / agent:** Fodda API — `api-agent` (two items) + Fodda MCP — `mcp-agent` (two items). Small on both sides.
**Execution handle:** `/build-from-brief briefs/brief_mcp_identity_gap.md`
**Status:** ready to build. Half of this problem already shipped (see Context); this closes the rest so `next_move_taken` can be read per identity.

---

## Context

The August prompt analysis found 84% of MCP rows in the Questions table were `Anonymous`. Re-checked 2026-08-22 by day: that figure was dominated by internal testing on 08-08/10/11 (≈300 anonymous + ≈120 test-account rows in three days). Since 08-12 the picture is different — the **attribution fallback** in `functions/index.ts` (key → `Billing Email`, else `"Account Name (API)"`) is live, and most MCP rows now carry an email or an account label. What is still wrong, in order of size:

1. **The literal string `'anonymous'` defeats the fallback.** MCP `resolveUserId()` returns `'anonymous'` when a session has no resolvable email, and `foddaRequest` sends it as `X-User-Id`. The API fallback only fires on `!userId`; `'anonymous'` is truthy, so the key's `attributionLabel` is never applied. Every remaining `mcp | Anonymous` row (7 since 08-20) is this.
2. **Expert-agent fan-out rows lose the end user.** Consults run in a Waverunner sandbox whose allowlist injects `x-api-key` (the user's key) and `x-fodda-source: expert-agent:<id>` but **no `X-User-Id`**. Rows then land as the account label at best, or `internal-service` / `Anonymous` when the consult runs on the internal key (self-use, SPT, test). The user who asked is not on the row.
3. **Internal testing is indistinguishable from customers.** Test runs use real keys (`piers.fawkes@*`, `nathan@searchshop.ai`) or ad-hoc labels (`jess`, `abcemployee1`, `qa-test-agent`, `internal_service`) with `source: mcp`. Every analysis has to hand-maintain an exclusion list.
4. **33 app signups in April logged only `[SESSION_START]`** and no question. Unknown whether they bounced or the app failed to log. Not an MCP issue, but it is the other half of "who are we losing".

## What to build

### API (`api-agent`)

**A. Treat placeholder user ids as empty** (`functions/index.ts`, attribution fallback block ~L870). Before the fallback: normalise `userId` — if it is `''`, `'anonymous'`, `'Anonymous'`, `'undefined'`, `'null'`, or `'oauth_user'`, set it to `null` so the account label applies. Also apply the same normalisation in `POST /v1/log/question` before `userEmail: foddaMeta?.identity?.userId || 'Anonymous'`. Log a counter (`[Attribution] placeholder→label`) so the rate is visible.

**B. Carry the end user through expert-agent fan-out** (`functions/v1/analysts.ts` ~L1966 and ~L3494, `functions/v1/humanAgents.ts`). Add `{ "x-user-id": <requesting identity> }` to the sandbox allowlist `transform` headers alongside `x-api-key` and `x-fodda-source`, where `<requesting identity>` is `req.fodda.identity.userId` after normalisation (A). When the consult runs on the internal key (self-use / SPT), still send the original requester's id — the key decides billing, the header decides attribution; they are already separate in the auth layer.

### MCP (`mcp-agent`)

**C. Never send `'anonymous'` upstream.** In `foddaRequest` (and `skillClient`), omit the `X-User-Id` header when `resolveUserId()` would return `'anonymous'`; let the API's account-label fallback do its job. Keep `'anonymous'` internally for session-tracker keys only.

**D. Tag internal test sessions at the door.** Read an `X-Fodda-Session-Kind` header (or `?session_kind=`) at MCP connect; allowed values `customer` (default) | `internal-test`. When `internal-test`, forward `source: mcp-internal-test` on every `/v1/log/question` and `X-Fodda-Source: mcp-internal-test` on fan-out. Add the same for the deployed test scripts (`test_live_*`, probes) so they set it automatically. Analyses then filter on `source`, not on a hand-kept email list. House rule addition for `docs/bibles/product_and_system_reference.md`: **any human running a test session from a real account must connect with `session_kind=internal-test`.**

### App check (whoever owns Fodda App — one question, not a build)

**E.** For the 33 April identities with `[SESSION_START]` only: does the app log questions through `/v1/log/question` at all, or only session starts? If it does, those 33 are bounces and belong in Streak as "signed up, never asked" (the Streak brief already handles them). If it doesn't, every app question since April is missing from the table and the "one-shot user" finding is partly an artefact. One-paragraph answer in the CHANGELOG is enough.

## Where to register

- API: `functions/index.ts` (attribution block), `functions/v1/v1Router.ts` (`/log/question`), `functions/v1/analysts.ts`, `functions/v1/humanAgents.ts`.
- MCP: `src/index.ts` (connect: session kind), `src/toolHandlers.ts` (`foddaRequest` / `logUserQuery`), `src/skillClient.ts`, test scripts.
- Bibles: `product_and_system_reference.md` — one line under "Hard-won decisions": *Questions-log identity = `X-User-Id` (normalised; placeholders → null) → account `Billing Email` → `"Account Name (API)"` → `Anonymous`; expert-agent fan-out carries the requester's id; internal tests tag `source: mcp-internal-test`.* Bump `Last updated:`.

## Definition of Done

1. An MCP session connected with a bare `sk_live_` key and no email logs a question under the account's `Billing Email` or `"<Account Name> (API)"`, never `Anonymous`. Show the Airtable row.
2. A `consult_human_agent` call from a named user produces Questions rows for the consult **and** its fan-out reads all carrying that user's email with `source: expert-agent:<id>`. Show the rows.
3. A session connected with `session_kind=internal-test` logs `source: mcp-internal-test` on every row; the deployed test scripts do this without a flag.
4. Seven days after deploy: `Anonymous` share of `source: mcp*` rows < 5% (baseline since 08-20: 7 of 93 MCP rows, plus all expert-agent rows). Paste the query and number into the CHANGELOG.
5. The app question (E) answered in writing.
6. Both CHANGELOGs carry deploy revisions and the verification rows.

## Do Not

- Do NOT provision a User record from an attribution label (the existing guard stays: labels are account identifiers, not user emails).
- Do NOT change billing ownership — the key bills; the header attributes. Keep them separate.
- Do NOT delete or rewrite historical `Anonymous` rows; the baseline is the evidence.
- Do NOT add new Airtable fields; `source` and `userEmail` already carry everything needed.

## Files-changed (expected)

API: `functions/index.ts`, `functions/v1/v1Router.ts`, `functions/v1/analysts.ts`, `functions/v1/humanAgents.ts`, `docs/bibles/product_and_system_reference.md`, `CHANGELOG.md`.
MCP: `src/index.ts`, `src/toolHandlers.ts`, `src/skillClient.ts`, `src/test_live_*.ts`, `CHANGELOG.md`.
