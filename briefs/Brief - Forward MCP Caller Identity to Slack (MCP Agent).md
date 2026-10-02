# Brief — MCP Agent — Forward Caller Identity in On-Request Demand Webhooks

**Target Agent:** MCP Agent (`fodda-mcp` repo)  
**Target File:** `src/toolHandlers.ts`  
**Date:** 2026-09-30  
**Priority:** P1  

---

## 1. Context & Problem
When a Claude / MCP user queries an *On-Request* or *Unclaimed* Human Agent (e.g. Arthur Soleimanpour), `executeConsultHumanAgentCore` intercepts the call and triggers `sendOnRequestDemandWebhook()` to alert `#fodda-sales`.

Currently, `sendOnRequestDemandWebhook()` hardcodes:
```typescript
email: 'anonymous@mcp.fodda.ai'
```
This causes the resulting Slack alert to always state `*Requester:* Anonymous via MCP`, even though the user is authenticated via OAuth (where `userId` contains their verified email or Clerk ID) or via API key (`apiKey` contains `sk_live_...`).

---

## 2. Requirements

### A. Update `sendOnRequestDemandWebhook` in `src/toolHandlers.ts`
Inside `createServer(apiKey: string, userId: string, ...)` around line 5616:

1. Derive the caller's identity string without any asynchronous lookup loops:
   ```typescript
   const callerIdentity = (userId && userId !== 'anonymous')
       ? userId
       : (apiKey ? `key:${apiKey.slice(0, 11)}...` : 'anonymous@mcp.fodda.ai');
   ```

2. Pass this identity in the webhook payload dispatched to `https://fodda-sales-agent-p3uz7zw7ja-uc.a.run.app/webhooks/intent`:
   ```typescript
   const payload = {
       intent_event: 'unclaimed_expert_request',
       email: callerIdentity,
       parameters: {
           expertId: params.expertId,
           expertName: params.expertName,
           expertIn: params.expertIn,
           requestedQuestion: params.query,
           requesterId: userId || 'anonymous',
           requesterApiKey: apiKey ? `${apiKey.slice(0, 11)}...` : undefined,
           source: params.source || 'mcp_claude',
       },
   };
   ```

### B. Invariants
- **No lookup loops:** Do NOT add new Airtable or database queries to look up account records for the API key; pass the truncated key identifier `key:sk_...` directly.
- **Preserve OAuth emails:** When `userId` is an email (from Clerk OAuth or `/c/:token`), pass it directly in `email`.
- **Never throw:** Keep existing `try / catch` and timeout guards intact.

### C. Build & Deploy
1. Run `npm run build`.
2. Run `./deploy_cloud_run.sh` to update `mcp.fodda.ai`.
3. Update `CHANGELOG.md`.
