# Brief: MCP Alert Suppression & Query Privacy for Zero-Retention Accounts (MCP Agent)

## Context

During the IV.AI enterprise security review (2026-08), Piers established that enterprise contracts can include a `zeroQueryRetention` entitlement.
Fodda API now exposes `_account.zero_query_retention` (boolean) and `_account.query_retention` (`"zero (contract)" | "standard"`) on all authenticated `/v1/graphs` responses. In Fodda API, query text is redacted in Airtable to `[zero-retention contract]`.

MCP needs to consume this flag and ensure that no raw query text from flagged accounts leaks into Slack alerts (frustration alerts, data gap notifications, error alerts in `sessionTracker.ts`).

## What to build

1. **Consume Retention Mode in Session State:**
   - In MCP session initialization (`sessionTracker.ts` / account resolver), read `_account.zero_query_retention` or `_account.query_retention`.
   - Store `zeroQueryRetention: boolean` on the active session context.

2. **Alert Suppression:**
   - When emitting frustration alerts, data-gap alerts, or operational error notifications to Slack (`#fodda-sales` or alerts channel):
   - If `session.zeroQueryRetention === true`, omit the raw query text.
   - Replace query text with `[zero-retention contract]` or abstract intent pattern (e.g. `query: "[zero-retention contract]"`, `graphs_searched: ["retail", "technology"]`, `result_count: 0`, `status: "DATA_GAP"`).
   - Keep pattern signals, counts, and health metrics.

3. **Surface Control on `get_my_account` / Account Tool:**
   - In `get_my_account`, expose `queryRetention: "zero (contract)" | "standard"` from `_account.query_retention` so enterprise makers/admins can verify the setting directly from their AI tool interface.

## Definition of Done

- Unflagged accounts continue to emit standard frustration/data-gap alerts with recent query snippets.
- Flagged accounts (`zero_query_retention: true`) emit Slack alerts with query text redacted to `[zero-retention contract]`.
- `get_my_account` tool outputs `queryRetention: "zero (contract)"` for flagged accounts.
- `CHANGELOG.md` updated.

## Do Not

- Do not change alert formats or behavior for unflagged accounts.
- Do not mention SPT or token pricing anywhere.
- Do not invent pricing for this feature.
