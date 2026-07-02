# Response: Fodda MCP Brief — User ID Verification & Header Propagation

**From:** MCP Agent  
**To:** Fodda Repo Manager  
**Date:** May 20, 2026  
**Status:** ✅ Audit complete. Verification successful. Enhancements implemented and compiled clean.

---

## 1. Executive Summary

We have audited the Fodda MCP codebase to verify that `userId` is extracted cleanly from client requests and propagated down to the Fodda Core API via HTTP headers. 

The audit identified a minor gap in the `/mcp` and `/sse` endpoints where `userId` was extracted only from URL query parameters (`?user_id=...`) and not from client-supplied HTTP headers. We have resolved this by implementing header-based extraction (`X-User-Id`) for those endpoints and updating CORS headers to prevent preflight blocks. Downstream propagation is fully verified and correctly propagates resolved user identities across all tools, skills, and billing endpoints.

---

## 2. Extraction from Client Connections (Audited & Updated)

We analyzed the three entry points where clients connect to the MCP server:

### A. MCP Endpoint (`/mcp` in [src/index.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/index.ts))
* **Previous State:** Extracted `userId` solely from the `user_id` or `id` query parameters, defaulting to `'anonymous'`.
* **Issue:** Client integrations passing credentials in headers (e.g. `X-User-Id: email@domain.com`) would lose their identity.
* **Update:** Enhanced extraction logic to prioritize query parameters, then check `req.headers['x-user-id']`, and finally fall back to email detection and anonymous.
* **CORS Update:** Added `X-User-Id` to `Access-Control-Allow-Headers` CORS configuration to ensure cross-origin browsers do not block custom header transmission.

### B. SSE Endpoint (`/sse` in [src/index.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/index.ts))
* **Previous State:** Query parameter extraction only.
* **Update:** Enhanced to support `req.headers['x-user-id']` alignment with `/mcp` and `/a2a`.

### C. Agent-to-Agent Endpoint (`/a2a` in [src/a2aHandler.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/a2aHandler.ts))
* **Status:** ✅ **Already Correct**. 
* **Verification:** The A2A handler already extracts `userId` with header-first priority:
  ```typescript
  const userId = (req.headers['x-user-id'] as string)
      || (req.query.user_id as string)
      || 'a2a-agent';
  ```

---

## 3. Propagation to Core API (Audited & Verified)

We verified that once the `userId` is extracted, it is cleanly passed to the Fodda Core API inside headers for all operations:

### A. Central HTTP Client (`foddaRequest`)
The primary HTTP client (`foddaRequest` in [src/index.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/index.ts)) injects the `X-User-Id` header into all outbound requests:
```typescript
const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'X-User-Id': userId, // ← Propagated cleanly
    'X-Fodda-Timestamp': timestamp,
    'X-Fodda-Billing': 'mcp-orchestrated',
    'Content-Type': 'application/json',
};
```

### B. Tool Handlers & User ID Normalization
* Handlers in [src/toolHandlers.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/toolHandlers.ts) process queries using `resolveUserId(sessionUserId, toolProvidedUid)` to ensure the session identity (from URL/headers) always takes priority over potentially spoofed or misconfigured LLM-provided parameters.
* This resolved `userId` is consistently supplied as the 4th parameter of `foddaRequest` across all tool executions.

### C. Skill Server Client
* The output-phase skill client ([src/skillClient.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/skillClient.ts)) routes skill execution through the Core API `/v1/skills/{id}/execute` endpoint.
* Verified that `executeSkillTool` properly attaches the `X-User-Id` header using the resolved session ID.

### D. Billing & Metering
* Verified that `chargeQuery` in [src/pricingCache.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/pricingCache.ts) calls `foddaRequest` to post to `/v1/research/meter`, propagating the user ID to record usage correctly.
* Verified that `waverunnerRequest` in [src/index.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/index.ts) similarly forwards the `userId` to the metering API.

---

## 4. Code Changes Diff

Here are the precise modifications applied to [src/index.ts](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/index.ts):

```diff
@@ -32,3 +32,3 @@
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
-    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Accept');
+    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-User-Id, Mcp-Session-Id, Accept');
     res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
@@ -562,3 +562,5 @@
         const isEmailId = entryId.includes('@') && entryId.includes('.');
-        const userId = (req.query.user_id as string) || (isEmailId ? entryId : 'anonymous');
+        const userId = (req.query.user_id as string)
+            || (req.headers['x-user-id'] as string)
+            || (isEmailId ? entryId : 'anonymous');
         const source = (req.query.source as string) || '';
@@ -635,3 +637,5 @@
     const isEmailId = entryId.includes('@') && entryId.includes('.');
-    const userId = (req.query.user_id as string) || (isEmailId ? entryId : 'anonymous');
+    const userId = (req.query.user_id as string)
+        || (req.headers['x-user-id'] as string)
+        || (isEmailId ? entryId : 'anonymous');
     const sessionId = crypto.randomUUID();
```

---

## 5. Deployment Verification

| Component | Status | Action |
| --- | --- | --- |
| **Compilation** | ✅ Passed | Ran `npm run build` locally, typescript compiled with zero errors. |
| **Deployment** | ⚠️ Pending | Needs to be rebuilt and deployed to Google Cloud Run to activate the header-extraction features. |
