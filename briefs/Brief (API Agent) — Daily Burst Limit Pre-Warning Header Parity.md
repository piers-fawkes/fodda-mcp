# Brief: Daily Burst Limit Pre-Warning Header Parity

> **Type:** `[x] Agent Task` | `[x] Enhancement`  
> **Priority:** `[x] P1 — High`  
> **Agent:** API Agent (`Fodda API` repo)  

---

## 1. Objective
Currently, the Base-Free daily 50-call burst cap (`functions/index.ts:1200`) provides zero warning to users on calls 1 through 49. When they hit call 50, they are abruptly blocked with HTTP 403 `DAILY_LIMIT_EXCEEDED`. This brief adds proactive pre-warning headers when daily calls reach $\ge 40$, matching the existing monthly nearing-limit header patterns (`X-Usage-Warning`).

---

## 2. Issues & Root Causes
- In `functions/index.ts:1204`:
  ```typescript
  const isBaseFree = !oidcClaims && !isAdmin && (account.isFreeTier || account.planCode === '2');
  if (isBaseFree && account.accountRecordId && !account.hasPaymentMethod) {
    const dailyCallsToday = await getDailyAccountUsage(account.accountRecordId);
    if (dailyCallsToday >= 50) {
      // 403 block
    }
  }
  ```
- If `dailyCallsToday < 50`, `dailyCallsToday` is fetched but ignored. The response never conveys how close the user is to their daily ceiling.

---

## 3. Required Changes

### In `functions/index.ts`:
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

---

## 4. Verification Step
1. Simulate an account with 45 calls today.
2. Make a request to `/v1/graphs/retail/nodes/2507.0`.
3. Check response headers:
   - `X-Usage-Warning: approaching-daily-limit`
   - `X-Usage-Daily-Calls: 45`
   - `X-Usage-Daily-Remaining: 5`
