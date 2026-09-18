# Brief: Fix OAuth Consent Allow Button Block for Grok (CSP `form-action` Localhost & Grok Domains)

**Type:** Bug Fix · **Priority:** P0 (Blocks Grok Bot OAuth Authorization)  
**Owner:** App Agent (`Fodda` repo)  
**Repo:** `~/Documents/Fodda` · **Files:** `server/index.ts`  
**Date:** 2026-09-18  
**From:** MCP Agent (`Fodda MCP`)  
**To:** App Agent (`Fodda` repo)  

---

## 1. Defect & Root Cause

When authorizing the **Earnings Context Analyst** (or any Fodda MCP bot) in Grok:
1. Grok initiates an OAuth 2.1 authorization flow with Clerk:
   ```
   https://app.fodda.ai/oauth-consent?client_id=MuPhVBpeyvvMn6re&code_challenge=...&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&resource=https%3A%2F%2Fmcp.fodda.ai%2Fearnings-intelligence&response_type=code...
   ```
2. Notice the redirect target: **`redirect_uri=http://localhost:8787/callback`** (Grok's local loopback callback server).
3. The user arrives at `https://app.fodda.ai/oauth-consent` and clicks the **Allow** button.
4. The button hangs indefinitely. The browser console reports:
   ```
   oauth-consent:1 Sending form data to 'https://clerk.fodda.ai/v1/me/oauth/consent/MuPhVBpeyvvMn6re...' violates the following Content Security Policy directive: "form-action 'self' https: https://clerk.fodda.ai https://*.clerk.fodda.ai https://accounts.fodda.ai https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://claude.ai https://*.claude.ai https://chatgpt.com https://*.chatgpt.com https://*.oai.com https://openai.com https://*.openai.com https://polarbrowser.com https://*.polarbrowser.com". The request has been blocked.
   ```

### Why this happens:
Per the W3C Content Security Policy specification, **`form-action` governs not only the initial form POST target (`clerk.fodda.ai`), but the entire subsequent 302 redirect chain.** 
When Clerk attempts to redirect to `http://localhost:8787/callback`, the browser inspects Helmet's CSP `formAction` header. Because `formAction` only permits `https:` and specific HTTPS domains, the browser blocks the redirect. (Chrome masks this error by reporting the violation against the initial POST URL).

*(This is identical to the Polar Browser fix from 2026-09-14 and OpenAI platform fix from 2026-09-03).*

---

## 2. Required Changes in `Fodda` (App Repo)

### File: `server/index.ts`
In Helmet's CSP `formAction` configuration (~lines 56–74), add loopback addresses for desktop/CLI OAuth agents (`http://localhost:*`, `http://127.0.0.1:*`) and Grok/xAI web domains (`https://x.ai`, `https://*.x.ai`, `https://grok.com`, `https://*.grok.com`):

```typescript
      formAction: [
        "'self'",
        "https:",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "https://clerk.fodda.ai",
        "https://*.clerk.fodda.ai",
        "https://accounts.fodda.ai",
        "https://*.clerk.accounts.dev",
        "https://clerk.com",
        "https://*.clerk.com",
        "https://claude.ai",
        "https://*.claude.ai",
        "https://chatgpt.com",
        "https://*.chatgpt.com",
        "https://*.oai.com",
        "https://openai.com",
        "https://*.openai.com",
        "https://polarbrowser.com",
        "https://*.polarbrowser.com",
        "https://x.ai",
        "https://*.x.ai",
        "https://grok.com",
        "https://*.grok.com",
      ],
```

---

## 3. Verification & Deployment

1. Build & verify smoke test:
   ```bash
   npm run build
   npm run smoke:oauth
   ```
2. Deploy `Fodda` app to Cloud Run / production.
3. Verify clicking **Allow** on `https://app.fodda.ai/oauth-consent?...&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback` successfully redirects to `http://localhost:8787/callback`.
