# Brief: Daily Burst Limit Pre-Warning Header Parity

> **Type:** `[x] Agent Task` | `[x] Enhancement`  
> **Priority:** `[x] P1 — High`  
> **Agent:** API Agent (`Fodda API` repo)  

---

## 1. Objective
Currently:
1. The Base-Free daily 50-call burst cap (`functions/index.ts:1200`) provides zero warning to users on calls 1 through 49. When they hit call 50, they are abruptly blocked with HTTP 403 `DAILY_LIMIT_EXCEEDED`. This brief adds proactive pre-warning headers when daily calls reach $\ge 40$, matching existing monthly nearing-limit header patterns (`X-Usage-Warning`).
2. The 403 `PLAN_LIMIT_EXCEEDED` error payload in `functions/index.ts:1456-1457` hardcodes `api_calls: 100` and mentions "100 API calls" in `agent_checkout.description`. However, Airtable Plan 7 (`Top-Up`, Stripe Price `price_1TLaiOAYuoIyU8CG2rjxhylB`) provides **200 API calls for $100** ($0.50/call). Hardcoding 100 calls in the API payload conveys an incorrect $1.00/call rate to clients and LLMs.

---

## 2. Issues & Root Causes
- **Pre-Warning Silence (`functions/index.ts:1204`)**:
  ```typescript
  const isBaseFree = !oidcClaims && !isAdmin && (account.isFreeTier || account.planCode === '2');
  if (isBaseFree && account.accountRecordId && !account.hasPaymentMethod) {
    const dailyCallsToday = await getDailyAccountUsage(account.accountRecordId);
    if (dailyCallsToday >= 50) {
      // 403 block
    }
  }
  ```
  If `dailyCallsToday < 50`, `dailyCallsToday` is fetched but ignored. The response never conveys how close the user is to their daily ceiling.

- **Outdated Top-Up Call Count in Error Payload (`functions/index.ts:1456-1457`)**:
  ```typescript
  agent_checkout: {
    url: 'https://app.fodda.ai/api/account/checkout/agent-session',
    method: 'POST',
    body: {
      email: account.accountOwner || null,
      source: foddaMeta.source || 'api',
    },
    description: 'POST to this URL to create a Stripe Checkout Session for 100 API calls. Returns { checkout_url } that the user can open in a browser to complete payment.',
    api_calls: 100,
  }
  ```
  Stripe Price `price_1TLaiOAYuoIyU8CG2rjxhylB` created by `/checkout/agent-session` credits **200 API calls** (`bonusTokens += 200`) for $100 ($0.50/call). The API payload must reflect 200 calls.

---

## 3. Required Changes

### In `functions/index.ts`:

#### A. Base-Free Burst Pre-Warning Headers:
Inside the Base-Free burst cap middleware:
```typescript
if (isBaseFree && account.accountRecordId && !account.hasPaymentMethod) {
  const dailyCallsToday = await getDailyAccountUsage(account.accountRecordId);
  if (dailyCallsToday >= 50) {
    // Existing 403 block ...
  } else if (dailyCallsToday >= 40) {
    // Pre-warning headers
    res.setHeader('X-Usage-Warning', 'approaching-daily-limit');
    res.setHeader('X-Usage-Daily-Calls', String(dailyCallsToday));
    res.setHeader('X-Usage-Daily-Remaining', String(50 - dailyCallsToday));
  }
}
```

#### B. Update `agent_checkout` Payload to 200 Calls:
In the 403 `PLAN_LIMIT_EXCEEDED` response block (~line 1456):
```typescript
agent_checkout: {
  url: 'https://app.fodda.ai/api/account/checkout/agent-session',
  method: 'POST',
  body: {
    email: account.accountOwner || null,
    source: foddaMeta.source || 'api',
  },
  description: 'POST to this URL to create a Stripe Checkout Session for 200 API calls ($100 at $0.50/call). Returns { checkout_url } that the user can open in a browser to complete payment.',
  api_calls: 200,
},
```

---

## 4. Verification Step
1. Simulate an account with 45 calls today.
2. Make a request to `/v1/graphs/retail/nodes/2507.0`.
3. Check response headers:
   - `X-Usage-Warning: approaching-daily-limit`
   - `X-Usage-Daily-Calls: 45`
   - `X-Usage-Daily-Remaining: 5`
4. Trigger a 403 `PLAN_LIMIT_EXCEEDED` error and inspect `agent_checkout`:
   - `agent_checkout.api_calls` === 200
   - `agent_checkout.description` references 200 API calls.

