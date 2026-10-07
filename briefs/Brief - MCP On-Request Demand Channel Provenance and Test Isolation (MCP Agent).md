# Brief — MCP Agent — On-Request Demand Channel Provenance and Test Isolation

**Target Agent:** MCP Agent (`Fodda MCP` repo)  
**Target Files:** `src/toolHandlers.ts`, `src/test_credibility_anchors.ts`  
**Date:** 2026-10-06  
**Priority:** P1  

---

## 1. Context & Problem

When an end-user queries an On-Request expert, `sendOnRequestDemandWebhook` dispatches an `unclaimed_expert_request` event to the Fodda Sales intent webhook (`https://fodda-sales-agent-p3uz7zw7ja-uc.a.run.app/webhooks/intent`), which triggers real-time expert recruitment and Slack notifications.

During testing, three issues were identified:
1. **Case-Sensitivity Mismatch:**
   In `src/toolHandlers.ts` (lines ~6283, ~6595):
   ```typescript
   const isUnclaimedOrOnRequest = Boolean(
       match && (
           match.status === 'Unclaimed' ||
           match.status === 'On Request' ||
           (match.status && match.status !== 'Active')
       )
   );
   ```
   Checking strictly `match.status !== 'Active'` caused mocks or catalog entries with lowercase `status: 'active'` to evaluate as On-Request/Unclaimed.
2. **Un-isolated Live Webhooks During Tests:**
   `sendOnRequestDemandWebhook` makes live HTTP POST requests even when running local test scripts or when `userId` is a synthetic test identifier (e.g. `test_user_credibility`).
3. **Hardcoded Source:**
   Calls to `sendOnRequestDemandWebhook` hardcode `source: 'mcp_claude'`, ignoring the client provenance (`declaredClientSlug`, e.g. `cursor`, `chatgpt`, `windsurf`, `claude-desktop`) captured during the initialize handshake.

---

## 2. Requirements

### A. Case-Insensitive Status Check (`src/toolHandlers.ts`)
Update all checks determining `isUnclaimedOrOnRequest` to be case-insensitive:
```typescript
const isUnclaimedOrOnRequest = Boolean(
    match && (
        match.status === 'Unclaimed' ||
        match.status === 'On Request' ||
        (match.status && match.status.toLowerCase() !== 'active')
    )
);
```

### B. Isolate Live Webhook Calls for Test Users (`src/toolHandlers.ts`)
In `sendOnRequestDemandWebhook`:
1. Check if the caller identity indicates a test environment or test user:
   ```typescript
   const isTestCaller = !effectiveUser ||
       effectiveUser.startsWith('test_') ||
       effectiveUser.startsWith('sk_test_') ||
       process.env.NODE_ENV === 'test';

   if (isTestCaller) {
       console.log(`[OnRequestWebhook] (Test Mode) Skipping live webhook for ${params.expertName} (caller: ${effectiveUser})`);
       return;
   }
   ```
2. Forward the actual client source:
   Use `params.source || sessionSource || 'mcp_claude'` rather than hardcoding `'mcp_claude'`.

### C. Update Mock Catalog in `src/test_credibility_anchors.ts`
Ensure mock analyst entries in `test_credibility_anchors.ts` use standard Airtable capitalization:
```typescript
{
    id: 'thiago-bersou-alc-bev',
    analyst_id: 'thiago-bersou-alc-bev',
    name: 'Thiago Bersou',
    graphSubType: 'Digital Twin',
    is_human_agent: true,
    status: 'Active',
    credibility_anchor: THIAGO_ANCHOR
},
{
    id: 'thorstein-veblen',
    analyst_id: 'thorstein-veblen',
    name: 'Thorstein Veblen',
    graphSubType: 'Classic Digital Twin',
    is_classic_agent: true,
    status: 'Active',
    credibility_anchor: VEBLEN_ANCHOR
}
```

---

## 3. Verification Steps
1. Run `npx tsx src/test_credibility_anchors.ts`. Verify all tests pass and NO live HTTP requests are dispatched to Cloud Run.
2. Verify that querying an active expert (case-insensitive) does not trigger `sendOnRequestDemandWebhook`.
3. Update `CHANGELOG.md` in `Fodda MCP`.
