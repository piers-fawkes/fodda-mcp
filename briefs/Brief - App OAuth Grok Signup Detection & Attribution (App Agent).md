# Brief: OAuth Grok Bot Signup Detection & Airtable Attribution

**Repo:** `Fodda` (`~/Documents/Fodda`)  
**Target Agent:** App Agent  
**Date:** 2026-09-18  

---

## 1. Objective
Ensure that when a user creates an account or signs in during OAuth connector consent for a Grok Bot (or any MCP connector), their origin is accurately detected and written to Airtable (`apiUse` and `onboardingIntent`) rather than defaulting to generic `'Mainly Claude'` or `'Self Demo'`.

---

## 2. Context & Root Cause
When Grok Bot connects to Fodda MCP, it redirects the user to:
`https://app.fodda.ai/oauth-consent?client_id=...&resource=https%3A%2F%2Fmcp.fodda.ai%2Fgrok-brand-context&redirect_uri=...`

1. **`frontend/components/AuthGate.tsx`:** Currently initializes `apiUse` by only checking `?platform=` or `?onboarding=`. If neither is present, it hardcodes the fallback to `'Mainly Claude'`. It ignores `?resource=` (which contains `grok-brand-context` or `earnings-intelligence`) and `?redirect_uri=` (which contains `x.ai`, `grok.com`, or loopback ports).
2. **`frontend/components/SsoCallbackPage.tsx`:** For Google / LinkedIn SSO signups on `/oauth-consent`, it fast-paths directly back to `/oauth-consent` to let the user click "Allow", skipping the extra fields modal. Because of this, `unsafeMetadata.apiUse` remains unset or default.
3. **`server/routers/webhookRouter.ts`:** Listens to Clerk's `user.created` webhook and syncs `meta.apiUse` into Airtable `Users` table (`tblGWh6XpdEZxw8AE`). Because `apiUse` was never set to Grok, the Airtable record is created without any connector attribution. Downstream sales cron jobs (`signup_feeder.js`) then misclassify the new signup as `🌐 Self Demo` (Web App).

---

## 3. Files Expected to Change
- `frontend/components/AuthGate.tsx`
- `frontend/components/SsoCallbackPage.tsx`
- `server/routers/webhookRouter.ts`

---

## 4. Implementation Details

### A. Detect Connector Origin in `AuthGate.tsx`
In `AuthGate.tsx`, expand the initial `apiUse` derivation and OAuth param parser:
```typescript
const derivePlatformFromUrl = (): { apiUse: string; intent: string; source: string } => {
  if (typeof window === 'undefined') return { apiUse: 'Mainly Claude', intent: 'account', source: 'webapp' };
  const params = new URLSearchParams(window.location.search);
  const resource = (params.get('resource') || '').toLowerCase();
  const redirectUri = (params.get('redirect_uri') || '').toLowerCase();
  const onboard = (params.get('platform') || params.get('onboarding') || '').toLowerCase();

  // Grok Bot / xAI detection
  if (resource.includes('grok-brand-context') || resource.includes('earnings-intelligence') || redirectUri.includes('x.ai') || redirectUri.includes('grok.com')) {
    const isEarnings = resource.includes('earnings-intelligence');
    return {
      apiUse: isEarnings ? 'Grok Bot (Earnings)' : 'Grok Bot',
      intent: 'grok',
      source: isEarnings ? 'grok_earnings' : 'grok_brand_context'
    };
  }

  // Claude detection
  if (redirectUri.includes('claude.ai') || onboard.includes('claude')) {
    return { apiUse: 'Mainly Claude', intent: 'claude', source: 'claude_connector' };
  }

  // ChatGPT detection
  if (redirectUri.includes('chatgpt.com') || onboard.includes('chatgpt') || onboard.includes('openai')) {
    return { apiUse: 'Mainly ChatGPT', intent: 'chatgpt', source: 'chatgpt_app' };
  }

  // Generic MCP
  if (resource.includes('/mcp') || onboard.includes('mcp')) {
    return { apiUse: 'Mainly MCP Use', intent: 'mcp', source: 'mcp_server' };
  }

  // Fallback to legacy onboard param or default
  return { apiUse: 'Mainly Claude', intent: 'account', source: 'webapp' };
};
```
Pass these values into `unsafeMetadata` during `signUp.create({ unsafeMetadata: { apiUse, signupIntent, signupSource, ... } })`.

### B. Preserve in `SsoCallbackPage.tsx`
When completing Google/LinkedIn SSO with a pending resume to `/oauth-consent`, extract the `resource` and `redirect_uri` from the target URL and patch `user.update({ unsafeMetadata: { apiUse, signupIntent, signupSource } })` before redirecting to `/oauth-consent`.

### C. Ensure Webhook Persists to Airtable in `server/routers/webhookRouter.ts`
Verify that `provisionUserFromClerk` persists `apiUse` and `onboardingIntent` to Airtable `Users` (`tblGWh6XpdEZxw8AE`).

---

## 5. Verification Plan
1. Open `/oauth-consent?resource=https%3A%2F%2Fmcp.fodda.ai%2Fgrok-brand-context&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback`.
2. Inspect `AuthGate` state: `apiUse` must resolve to `'Grok Bot'` and `intent` to `'grok'`.
3. Verify mock `user.created` webhook writes `apiUse: "Grok Bot"` and `onboardingIntent: "grok"` into Airtable.
4. Run `npm run preflight` and `npm run build`.
