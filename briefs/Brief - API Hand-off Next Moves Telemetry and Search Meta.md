# Brief — API Hand-off: Next Moves Telemetry and `on_topic_total`

**Routed to:** `api-agent`  
**Execution handle:** `/build-from-brief Brief - API Hand-off Next Moves Telemetry and Search Meta.md`  
**Context:** Handoff from `mcp-agent` following implementation of the Next Moves 3-line closing block and session telemetry.

---

## 1. Objectives

1. **Telemetry**: Accept and store `next_move_taken` on `logQuestionToAirtable` (new single-select on the Questions table).
2. **Search Meta**: Return an integer `on_topic_total` on search responses across graphs (`/v1/graphs/:graphId/search`, `/v1/search/domain`, `/v1/search/expert`, `/v1/search/report`).

---

## 2. API Changes Required

### A. Questions Table Logging (`functions/v1/logging/` or `airtable.ts`)
- In `logQuestionToAirtable` (and `/v1/log/question` handler):
  - Accept `next_move_taken` / `nextMoveTaken` string parameter from the request payload.
  - Allowed single-select values: `'thread' | 'specific_brand' | 'specific_stat' | 'specific_expert' | 'scope' | 'none'`.
  - Write to Airtable Questions table field `Next Move Taken` with `typecast: true` (mirroring `interaction_type`).

### B. Search Response `on_topic_total` (`functions/v1/search/` and graph search endpoints)
- On search responses (`POST /v1/graphs/:graphId/search`, `POST /v1/search/domain`, `POST /v1/search/expert`, `POST /v1/search/report`):
  - Return the integer count of on-topic nodes matching the query across the graph before limit slicing:
    ```json
    {
      "rows": [...],
      "total": 45,
      "on_topic_total": 8
    }
    ```
  - This allows the MCP layer to compute `remaining_count = on_topic_total - returnedCount` accurately.

---

## 3. Invariants & Rules

- **AIRTABLE is the source of truth for pricing**: No price changes in this work.
- **Failure tolerance**: Logging `next_move_taken` must never throw or block main response paths.

---

## 4. Definition of Done

- [ ] `/v1/log/question` accepts `next_move_taken` and writes to Airtable `Next Move Taken` column.
- [ ] Search endpoints return `on_topic_total: number`.
- [ ] `CHANGELOG.md` in Fodda API repo updated.
