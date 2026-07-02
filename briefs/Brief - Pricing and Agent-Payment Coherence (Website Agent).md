# Brief: Public Pricing + Agent-Payment Coherence (Website)
**Date:** 2026-06-19
**From:** MCP Agent
**To:** Website Agent
**Priority:** P1 — High. Pricing/Agents pages are already strong; remaining gaps are a stale checkout URL the API hands to agents, residual "trial" language that contradicts the retired-trial model, an undiscoverable agent-payments doc, and "tokens"-vs-"API calls" drift. None block the MCP, but all undermine the cold-agent "how to pay" story the owner prioritizes.
**Context:** The pricing model is now free Base (no trial), paid subscriptions, Lava PAYG ($0.20/API call), $50/200 MCP top-up, and the SPT agent-wallet ($0.25/API call, zero-onboarding via HTTP 402). The Website largely reflects this already; this brief closes the residual gaps and the broken handshake between the API's 402 discovery payload and the site.

---

## 1. Objective
Make the public pricing + agent-payment story internally consistent and externally discoverable: (a) purge residual billing-"trial" language so the site matches "trials retired"; (b) resolve the agent-session checkout URL the API advertises in its 402/discovery payload, which points at a path absent from this repo; (c) make the existing agent-payments documentation (`/agents`, `/api`, `/pricing#zero-onboarding`) reachable from site navigation so a cold agent/developer can find it; (d) standardize human-facing copy on "API calls" rather than "tokens."

## 2. What You Need To Do

**2.1 — Remove residual billing-"trial" language (the model has no trial).**
The Pricing/Agents/SPT surfaces are clean, but these public strings still sell a "trial":

| File:line | Current | Fix |
|---|---|---|
| `pages/IntegrationClaude.tsx:331` | `…One-click custom connector. Free trial, no credit card.` | "Free Base plan, no credit card." |
| `pages/IntegrationClaude.tsx:349` | `…Works in claude.ai and Claude Desktop. Free trial, no credit card.` | same |
| `pages/Graphs.tsx:402` | `…Get a free trial key and start in minutes.` | "Get a free API key and start in minutes." |
| `pages/FAQ.tsx:38` | `…you get a trial key, and can immediately connect…` | "…you get an API key, and can immediately connect…" |
| `pages/PostMicrosoftDiscovery.tsx:370` | CTA `Request Live Trial Key` | "Request a Free API Key" (or drop) |
| `pages/Pricing.tsx:660` | Distribution Partnership feature `Issue Fodda trial keys to your users` | n/a while disabled — this is inside the `{false && (…)}` Platform Partnership block (`pages/Pricing.tsx:650`), not rendered. Fix only if that block is ever re-enabled. (confirm) |

**2.2 — `GraphTrialWidget` provisions a "trial account" against `app.fodda.ai`.**
`components/GraphTrialWidget.tsx:195` POSTs to `https://app.fodda.ai/api/account/trial-provision` with `company: '${email.split('@')[0]}'s Web Trial'` (`:201`); UI shows `Provisioning trial account…` (`:773`) and `generate trial key` (`:278`). This is the live "try-it" widget on graph pages. Two things, in order:
1. Copy: rename user-visible strings from "trial" to "free key / free account" (`:773`, `:278`, `:620` comment is internal only).
2. Endpoint: confirm with the **app/account service owner** whether `/api/account/trial-provision` still exists and what it now creates (free Base account vs. a legacy trial). If it still mints trial-flagged accounts, this contradicts "trials retired" at the data layer — escalate to API/account, do not silently rename. (confirm — endpoint lives in app.fodda.ai, not this repo or the API `functions/`.)

**2.3 — Resolve the agent-session checkout URL the API advertises to agents (Findings E).**
The API's discovery payload hands agents this (API `functions/index.ts:758-767`):
```js
agent_checkout: {
  url: 'https://app.fodda.ai/api/account/checkout/agent-session',
  method: 'POST',
  body: { email, source },
  description: '…create a Stripe Checkout Session for 100 tokens. Returns { checkout_url }…',
  tokens: 100,
}
```
That path is **NOT in this Website repo**. The site server (`server.js`) is a raw `http.createServer` (`server.js:402`) with hand-routed paths and **zero checkout/account/stripe/spt/lava routes** — `/account`, `/sign-up`, `/register` all 301 → `app.fodda.ai` (`server.js:1833`). So `agent-session` must live in the **app.fodda.ai account service** (a different repo/host), not www.
- Action: confirm with the app/account-service owner that `POST app.fodda.ai/api/account/checkout/agent-session` actually exists and returns `{ checkout_url }`. If it does not, the API is advertising a dead URL to every agent that hits a 402-equivalent affordance. Report back which repo owns it. (confirm)
- For contrast, the Lava PAYG path the *site* uses is healthy: `pages/Pricing.tsx:58` POSTs `https://api.fodda.ai/api/checkout/lava-session`, which exists and is public on the API (`functions/index.ts:2417`, allow-listed at `functions/index.ts:202`). No action — just don't conflate the two; `agent-session` (app host) and `lava-session` (api host) are different endpoints.
- Wording nit (route to API Agent, not you): the `agent-session` description says "100 tokens" — should read "100 API calls" to match site-wide language. Flag it; the fix is in the API repo.

**2.4 — Make the agent-payments doc discoverable.**
The doc effectively already exists and is good — don't rebuild it. The 402 → pricing → pay(SPT) path is documented in three places:
- `pages/ApiDocs.tsx:359-404` — auth headers (`Bearer spt_…` standard / `X-Stripe-SPT` legacy), `402 + WWW-Authenticate: stripe-spt`, and the retry flow.
- `pages/Agents.tsx:387-388, 431-440` — SPT headers, Lava wallets, and the "402 → attach SPT → retry → data" callout.
- `pages/Pricing.tsx:375-571` — the `#zero-onboarding` section, the 4-channel table, and a copy-as-Markdown agent block (`pages/Pricing.tsx:387-443`).

The gap is reachability: `/agents` is a registered route (`App.tsx:64`) but is **not linked in the Footer** (`components/Footer.tsx` has `/pricing`, `/api`, `/connect`, integrations — no `/agents`) and not in the Header (`components/Header.tsx`). A cold developer/agent can't navigate to it.
1. Add a Footer link, e.g. under the "Resources"/integrations column: `<li><Link to="/agents">Agent Payments &amp; Access</Link></li>` near `components/Footer.tsx:40`.
2. Add an anchor link from `pages/ApiDocs.tsx` 402 section → `/pricing#zero-onboarding` and → `/agents`, so the three surfaces cross-reference.
3. (confirm) Verify `/agents` and `/pricing` are in `sitemap.xml` / `llms.txt` so agents crawling for payment info find them (`sitemap.xml`, `llms.txt`, `llms-full.txt` exist at repo root).

**2.5 — Standardize "API calls" over "tokens" in human-facing copy.**
Pricing/Agents already say "API call"; these public strings still say "tokens":

| File:line | Current |
|---|---|
| `pages/Product.tsx:205` | `20 tokens per briefing · Included in PRO and above` |
| `pages/Agents.tsx:423` | `…Includes token allowances and premium graph access.` |
| `pages/ExpertDetail.tsx:125` | `Try a question. {tokenCost} tokens per query.` |
| `pages/ExpertDetail.tsx:381` | `{expert.tokenCost} tokens / query` |
| `components/AskExpertHero.tsx:79, :104` | `{expert.tokenCost} tokens / query` |

Replace "tokens" → "API calls" in the rendered copy. Leave the `tokenCost` variable/prop name alone (internal). Exclusions — do NOT touch: blog posts about LLM token economics (`pages/PostPromptInEmojis.tsx`, `pages/Blog.tsx:46`), enterprise "API tokens" = credentials (`pages/IsoCompliance.tsx:254`, `pages/IntegrationCopilot.tsx:202`), and code-block strings (`pages/Pricing.tsx:418` "retries with SPT token" is the auth token — leave).

## 3. Acceptance Criteria
- [ ] `grep -rinE "free trial|trial key|trial account" pages components` returns only the disabled Partnership block (`pages/Pricing.tsx:660`) and internal comments/variable names — no rendered user-facing trial CTA.
- [ ] `GraphTrialWidget` shows "free account/key" copy; its provisioning endpoint is confirmed to create a free Base account (not a trial-flagged account), or the discrepancy is escalated to the account-service owner with a ticket link.
- [ ] The `agent-session` URL in the API 402/discovery payload (`API functions/index.ts:759`) resolves to a working `{ checkout_url }` endpoint on `app.fodda.ai`, OR is confirmed dead and a removal/fix ticket is filed against the owning repo.
- [ ] `/agents` is reachable from the Footer (and ideally Header); `pages/ApiDocs.tsx` 402 section links to `/pricing#zero-onboarding` and `/agents`.
- [ ] `/agents` and `/pricing` present in `sitemap.xml` and `llms.txt`.
- [ ] Human-facing "tokens" replaced with "API calls" on the five files in 2.5; blog/credential/code-token usages untouched.
- [ ] Pricing page still renders all six grid plans + SPT/MCP-topup cards + 4-channel table with no "trial" copy (`pages/Pricing.tsx` already compliant — regression check only).

## 4. Testing Plan
- `npm run build` (Vite) clean; load `/pricing`, `/agents`, `/api`, `/graphs`, `/integration-claude`, `/faq` and visually confirm no "trial" CTA and no "tokens" in rendered copy.
- Exercise the live Lava PAYG button on `/pricing` ("Buy Credits") against `api.fodda.ai/api/checkout/lava-session`; confirm the iframe opens. **Anti-double-billing:** any automated/CI smoke test that hits Fodda research endpoints during verification must use `FODDA_INTERNAL_API_KEY` (not a real user key) so internal calls aren't metered.
- `curl -s -X POST https://app.fodda.ai/api/account/checkout/agent-session -H 'content-type: application/json' -d '{"email":"test@fodda.ai","source":"verify"}'` — assert `200 { checkout_url }`, or capture the failure for 2.3 escalation.
- Crawl check: `grep -c "/agents" sitemap.xml` ≥ 1; `/agents` and `/pricing` appear in `llms.txt`.

## 5. Dependencies & Coordination
- **App / account-service owner (app.fodda.ai):** owns `/api/account/trial-provision` (2.2) and `/api/account/checkout/agent-session` (2.3). Both are referenced from outside this repo and cannot be verified here. You must get a yes/no on existence + behavior before closing 2.2/2.3.
- **API Agent:** owns the 402/discovery payload (`API functions/index.ts:758-767`) and its "100 tokens" wording. Coordinate so the URL the API advertises and the endpoint the site/app exposes are the same string, and the unit reads "API calls." This is a handshake: the API's `agent_checkout.url` must match a live route. SPT premium price ($0.25/API call) on `/pricing` and `/api` matches the API's SPT tier (Findings B) — keep them in lockstep if API changes it.
- **MCP Agent (me):** the MCP advertises the $50/200 top-up inline on CREDITS_EXHAUSTED; site copy ($50/200 API calls, `pages/Pricing.tsx:512`, `:559`) must stay consistent with whatever the MCP renders. No change requested now; flag if you alter the number.

## 6. CHANGELOG Entry
```
### Changed
- Pricing/site copy: replaced residual "free trial" / "trial key" language with free Base-plan wording (IntegrationClaude, Graphs, FAQ, PostMicrosoftDiscovery, GraphTrialWidget).
- Standardized human-facing usage metric from "tokens" to "API calls" (Product, Agents, ExpertDetail, AskExpertHero); blog/credential/auth-token usages left intact.

### Added
- Footer + ApiDocs navigation links to /agents and /pricing#zero-onboarding so the HTTP 402 → SPT agent-payment doc is discoverable to crawling agents/developers.

### Fixed
- Verified Lava PAYG checkout (api.fodda.ai/api/checkout/lava-session) reachable from /pricing; flagged the API-advertised agent-session checkout URL (app.fodda.ai/api/account/checkout/agent-session) for owner confirmation — not present in the www repo.
```

---

Verification notes (file:line confirmed against `/Users/piersfawkes/Documents/Fodda Website`):
- Pricing page already current and trial-free: `pages/Pricing.tsx` (free Base planCode 2, Lava PAYG planCode 12 at $0.20/API call `:133`, $50/200 top-up `:512`, SPT $0.25 `:460`, 402 flow markdown `:413-420`).
- Website server has no checkout/account routes — raw http server, `/account|/sign-up|/register` 301 → app.fodda.ai (`server.js:1833`); `agent-session` absent from entire repo (grep clean).
- `lava-session` confirmed live on the API (`functions/index.ts:2417`, public allow-list `:202`); `agent-session` advertised at `functions/index.ts:759` points to app.fodda.ai (separate service) — could not verify here, marked (confirm).
- `/agents` route exists (`App.tsx:64`) but is not in Footer (`components/Footer.tsx`) or Header (`components/Header.tsx`).
