# Brief: API Call Terminology Migration — Fodda App

**Date:** 2026-04-26  
**From:** MCP Agent  
**To:** App Agent  
**Priority:** Medium — deploy after API  
**Context:** Fodda is renaming "tokens" to "API calls" across all user-facing surfaces. The MCP and API agents are handling backend changes. The App needs display-only updates.

---

## What You Need To Do

### 1. Rename All User-Facing "Token" Strings

Search the entire App codebase for "token" references in user-facing UI copy and replace with "API call" equivalents:

| Current Text | New Text |
|-------------|----------|
| "tokens" | "API calls" |
| "token" | "API call" |
| "token balance" | "API call balance" |
| "tokens remaining" | "API calls remaining" |
| "tokens used" | "API calls used" |
| "Top up tokens" | "Top up API calls" |
| "100 tokens/month" | "100 API calls/month" |
| "500 tokens/month" | "500 API calls/month" |

**Do NOT rename:**
- Internal variable names (yet) — only display strings
- API field names the App reads from the Fodda API (e.g., `tokens_remaining` — the API will send both old and new field names during transition)
- Authentication tokens (JWT, session tokens) — these are different

### 2. Update Dashboard Components

The account dashboard likely shows:
- Token balance widget → "API Calls" balance widget
- Token usage chart → "API Call" usage chart
- "Top up tokens" button → "Top up API calls"
- Plan descriptions that reference token limits

### 3. Update Upgrade/Upsell Modals

Any upgrade prompts that mention tokens should be updated:
- "You've used all your tokens" → "You've used all your API calls"
- "Get 100 more tokens for $X" → "Get 100 more API calls for $X"
- Plan comparison tables with token limits

### 4. Read Both API Field Names During Transition

The API will temporarily send both field names:
```json
{
    "tokens_remaining": 85,
    "api_calls_remaining": 85
}
```

Update the App to prefer the new field name with fallback to old:
```typescript
const remaining = data.api_calls_remaining ?? data.tokens_remaining;
```

### 5. Updated Plan Descriptions

| Plan | Old Description | New Description |
|------|---------------|-----------------|
| Trial | 50 tokens | 50 API calls |
| Base (Free) | 100 tokens/month | 100 API calls/month |
| PRO | 500 tokens/month | 500 API calls/month |
| Top-Up | 100 tokens | 100 API calls |

---

## Deploy After API

The API will send backward-compatible responses. Deploy the App after the API is live with the new field names.
