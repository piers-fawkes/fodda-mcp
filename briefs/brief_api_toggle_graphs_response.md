# API Response Brief: Toggle Endpoint — LIVE

## Status: ✅ Implemented & Ready for Deployment

The API agent has implemented the `POST /v1/user/preferences/toggle` endpoint exactly as specified in the brief. It is type-checked and ready for the next Cloud Run deploy.

## What Was Built

### 1. Endpoint: `POST /v1/user/preferences/toggle`

**Location**: `functions/v1/v1Router.ts`

**Protected by**: Standard API-key auth middleware (same as all `/v1` routes — no additional auth needed).

**Request Body:**
```json
{
  "target_id": "paralogy",
  "enabled": true
}
```

**Admin on-behalf-of** (optional — admin keys only):
```json
{
  "target_id": "paralogy",
  "enabled": true,
  "user_email": "user@example.com"
}
```
When `user_email` is provided by an admin key, the endpoint operates on that user's preferences instead of the caller's. Non-admin keys passing `user_email` get a `403`.

**Success Response (200):**
```json
{
  "ok": true,
  "target_id": "paralogy",
  "enabled": true,
  "disabled_graphs": ["igloo"],
  "requestId": "req_abc123"
}
```

**Error Responses:**
- `400 INVALID_PARAMS` — missing/invalid `target_id` or `enabled`
- `403 FORBIDDEN` — API key not linked to a user account (no email resolvable)
- `500 UPSTREAM_ERROR` — Airtable write failure

### 2. Airtable Helper — Already Existed

The `updateUserDisabledGraphs()` function in `functions/tracking/airtable.ts` was already implemented (reads user record → writes `disabledGraphs` field → invalidates `DISABLED_GRAPHS_CACHE`). No changes needed.

### 3. Cache Invalidation — New

Added `invalidateAccessDecisionCache()` export in `functions/tracking/airtable.ts`. After a toggle, the endpoint:
1. Invalidates the per-email `DISABLED_GRAPHS_CACHE` (handled by `updateUserDisabledGraphs`)
2. Invalidates the per-API-key `ACCESS_DECISION_CACHE` (new function)

This ensures the toggle takes effect on the **very next API call** — no 5-minute cache delay.

### 4. Normalization

All `target_id` values are lowercased and trimmed before comparison/storage, matching the existing convention used by `getUserDisabledGraphs()`.

## MCP Agent Next Steps

Now that the endpoint is live (after deploy), the MCP agent should:

1. **Add tool `toggle_graph_preference`** in `src/toolHandlers.ts`:
   ```typescript
   // Call: POST https://api.fodda.ai/v1/user/preferences/toggle
   // Headers: Authorization: Bearer <user_api_key>
   // Body: { target_id: string, enabled: boolean }
   ```

2. **Update system prompt** to instruct the LLM to use this tool when the user says things like:
   - "Turn off Paralogy"
   - "Enable the economics data"
   - "Disable igloo"
   - "I don't want retail insights anymore"

3. **Use the response** `disabled_graphs[]` array to confirm to the user exactly which graphs/skills are currently disabled.

## Files Changed

| File | Change |
|------|--------|
| `functions/v1/v1Router.ts` | Added `POST /user/preferences/toggle` route + new imports |
| `functions/tracking/airtable.ts` | Added `invalidateAccessDecisionCache()` export |

## Deployment

Standard deploy flow — `deploy.sh` or Cloud Run redeploy. No new env vars, no new dependencies.
