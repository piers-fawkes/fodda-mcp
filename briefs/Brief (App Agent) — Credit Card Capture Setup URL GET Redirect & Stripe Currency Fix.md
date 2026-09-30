# Brief: Credit Card Capture Setup URL GET Redirect & Stripe Currency Fix

> **Type:** `[x] Bug Fix` | `[x] Cross-Cutting Issue`  
> **Priority:** `[x] P0 — Blocker`  
> **Agent:** App Agent (`Fodda` repo / `app.fodda.ai`)  

---

## 1. Objective
When users on the free Base tier hit the 50-call/day burst limit or exhaust their 100-call monthly allowance without a payment card, the API and MCP emit a one-click setup link: `https://app.fodda.ai/api/account/setup-url?email=...`. Currently, clicking this link fails with **HTTP 404** because only `POST /setup-url` is implemented. Furthermore, POSTing to `/setup-url` fails inside Stripe with `Missing required param: currency.` because `mode: 'setup'` requires `currency: 'usd'`. This brief fixes both blockers so users can click a single link and land directly on Stripe's card capture form.

---

## 2. Issues & Root Causes

1. **Missing GET Handler (`server/routers/accountRouter.ts`)**:
   - `accountRouter.ts:2905` defines `router.post("/setup-url", ...)`.
   - Users and LLM interfaces (Claude Desktop, ChatGPT, cursor) click links using HTTP `GET`.
   - Result: `GET /api/account/setup-url?email=...` returns `404 {"error":"Not found"}`.

2. **Stripe Checkout Setup Mode Missing Currency (`server/services/stripeOverageService.ts`)**:
   - In `generateSetupUrl()`, `sessionParams` defines `{ mode: 'setup', success_url: '...', cancel_url: '...' }`.
   - In modern Stripe API versions, `mode: 'setup'` requires `currency: 'usd'`.
   - Live GCP Cloud Run logs confirm:
     ```
     [Overage] Failed to generate setup URL: Missing required param: currency.
     ```
   - The catch block falls back to `https://app.fodda.ai?view=billing`, where unauthenticated external users arrive signed out in Clerk (`x-clerk-auth-status: signed-out`).

---

## 3. Required Changes

### A. Add `currency: 'usd'` in `server/services/stripeOverageService.ts`
In `generateSetupUrl(accountId: string, email?: string)`:
```typescript
const sessionParams: any = {
  mode: 'setup',
  currency: 'usd', // REQUIRED by Stripe for setup mode Checkout Sessions
  success_url: `${process.env.APP_URL || 'https://app.fodda.ai'}?setup=success`,
  cancel_url: `${process.env.APP_URL || 'https://app.fodda.ai'}?setup=cancelled`,
  metadata: {
    fodda_account_id: accountId,
    source: 'overage_setup_url',
  },
};
```

### B. Add GET Handler in `server/routers/accountRouter.ts`
Add a GET route right above or below `router.post("/setup-url")`:
```typescript
router.get("/setup-url", async (req, res) => {
  try {
    const email = (req.query.email as string)?.trim();
    const accountId = (req.query.accountId as string)?.trim();

    if (!accountId && !email) {
      return res.status(400).json({ ok: false, error: 'accountId or email query param required' });
    }

    let resolvedAccountId = accountId;
    if (!resolvedAccountId && email) {
      const userQuery = await queryAirtable(USERS_TABLE, `LOWER({email}) = '${escapeAirtableString(email.toLowerCase())}'`);
      const userRec = userQuery.records?.[0];
      resolvedAccountId = userRec?.fields?.Account?.[0];
    }

    if (!resolvedAccountId) {
      return res.redirect(`${process.env.APP_URL || 'https://app.fodda.ai'}/billing?error=account_not_found`);
    }

    const setupUrl = await generateSetupUrl(resolvedAccountId, email);
    // Redirect directly into Stripe Checkout
    return res.redirect(302, setupUrl);
  } catch (err: any) {
    console.error('[Setup URL GET] Error:', err);
    return res.redirect(`${process.env.APP_URL || 'https://app.fodda.ai'}?view=billing`);
  }
});
```

---

## 4. Verification Step
1. Run `curl -I "http://localhost:8080/api/account/setup-url?email=piers.fawkes@psfk.com"`:
   - Must return `HTTP/1.1 302 Found` with `Location: https://checkout.stripe.com/c/pay/cs_...`.
2. Inspect Stripe logs: verify no `Missing required param: currency.` occurs.
