# Brief: Fix the Noisy "SPT Pricing Gap" Slack Alert

**Date:** 2026-06-21
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Repo:** ~/Documents/Fodda API/Fodda
**Priority:** P2 (no money at risk — pure alert noise + minor route hygiene)

---

## 1. Symptom

`#fodda-sales` is getting flooded with `🚨 SPT Pricing Gap: unmapped route <path> defaulting to $0.50` for paths that are obviously not billable SPT traffic: `/`, `/robots.txt`, `/docs`, `/.env`, `/.env.local`, `/.env.prod`, `/.env.dev`, `/.aws/credentials`, `/v1/blog/recent`, `/v1/skills/paralogy/tools`, plus test probes (`/v1/this-route-does-not-exist-spt-test`, `/v1/research/meter`, `/v1/research/spt-validate`).

## 2. Root cause (confirmed)

The alert fires as a side effect inside `resolveInteractionType()` ([functions/index.ts:77-85](file:///Users/piersfawkes/Documents/Fodda%20API/Fodda/functions/index.ts)). That function is called by `resolveEndpointPrice()`, which runs in **two** places:

1. **L507** — a genuine per-call SPT charge on a non-`/meter` route. This is the *only* path where "unmapped route" means a real undercharge risk. **The legit alert case.**
2. **L632 — the anonymous MPP 402 "Payment Required" challenge.** This runs for **every unauthenticated request to any path**, just to compute the price advertised in the 402 body. Browsers (`/`), crawlers (`/robots.txt`), credential scanners (`/.env`, `/.aws/credentials`), and probes all flow through here → unmapped path → alert fires. **Nothing is charged here** — the price is only quoted in the 402.

So the firehose is path #2. No SPT agent was undercharged (the `/meter` guard at L477 `return next()`s before any charge; verified $10 in E2E). The repeats are because `_alertedPaths` is an in-memory `Set` that resets on instance restart/scale.

## 3. Fix

**3a. Make `resolveInteractionType()` pure — no alert side effect.** Move `alertUnmappedRoute(path)` + the `console.error` OUT of it. Have it just return `'search'` (still the safe default) when unmapped, optionally returning a flag so callers know it defaulted, e.g. return `{ type, mapped }` or keep returning the type and let the caller check.

**3b. Alert ONLY from the real-charge path (L507), never from the 402 challenge (L632).** Only at L507, when an actual SPT is being charged and the route was unmapped, call `alertUnmappedRoute(path)`. The 402-challenge path should resolve the price silently.

**3c. Scope the alert to `/v1/` API routes.** Even on the real-charge path, skip the alert for non-API paths (`/`, `/robots.txt`, `/.env*`, `/.aws/*`, `/docs`, favicon, etc.). A simple `if (!path.startsWith('/v1/')) return;` guard in `alertUnmappedRoute` kills the scanner noise permanently.

**3d. (Optional, recommended) Don't 402 non-API paths.** A scanner hitting `/.env` or `/robots.txt` currently gets a `402 Payment Required`. Those should return `404` (they aren't payable API surface). Only return the MPP 402 challenge for `/v1/*` billable routes. This also stops advertising "pay to access" on junk paths.

**3e. Map the real public/free routes** so they neither alert nor mis-price if ever hit with an SPT: `/v1/blog/recent`, `/v1/skills/...` (skills listing), and the validate endpoint. If they're free, map them to a zero-cost interaction type (or exclude). `/v1/research/meter` is already special-cased (validate-only) — just ensure it's never the 402-challenge price source.

## 3f. Enrich the alert payload (so a real gap is instantly actionable)

Today the alert is just `path` + "$0.50". After 3a–3c every alert is a genuine charge gap, so give it enough context to fix without log-spelunking. Add to BOTH the structured `console.error` log and the Slack message:

- `method` — GET/POST
- `requestId` — `foddaMeta.requestId` (trace to logs + Firestore `meter_idempotency`)
- `billing_mode` — `spt-prepaid` vs per-call SPT (confirms a real charge)
- `charged_usd` — the default amount actually billed (e.g. `0.50`)
- `body_type` — `body?.type` when present (POST routes — tells you the right mapping)
- `source` — the `X-Fodda-Source` header (`spt` / `mcp` / absent) and/or `User-Agent`, to distinguish a real agent from a stray caller
- `suggested_type` — best-guess interaction type for the route, to speed the `resolveInteractionType()` edit

Do NOT log the SPT token, `Authorization` header, or any PII. IP/User-Agent are fine for triage.

Example Slack message:
```
🚨 SPT Pricing Gap (real charge): POST /v1/some/new-route
   billed: $0.50 (default 'search')  ·  billing: spt-prepaid  ·  source: mcp
   body.type: (none)  ·  requestId: req_abc123
   → map this route in resolveInteractionType() in index.ts
```

Consider Slack Block Kit `fields` for readability, but a multi-line `text` is fine.

## 4. Security note (benign, FYI)

The `/.env*` and `/.aws/credentials` hits are routine automated credential-scanning bots. The API correctly returns 402 and does **not** serve those files — no leak. After 3d they'll just 404. No action beyond that.

## 5. Verify

- Hit `/` , `/robots.txt`, `/.env` anonymously → no Slack alert; (after 3d) 404 not 402.
- Hit a real unmapped `/v1/...` route **with a valid SPT** → alert still fires (the case we actually care about).
- Anonymous `/v1/graphs` → still returns the 402 challenge with correct price, no alert.
- `#fodda-sales` goes quiet except genuine pricing gaps.
