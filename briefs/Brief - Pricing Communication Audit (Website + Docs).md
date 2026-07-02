# Brief: Pricing & Billing Communication Audit — Website + README/Docs

**Date:** 2026-06-19
**From:** MCP Agent
**To:** Website Agent + Docs (cc: API Agent)
**Priority:** P1 — High
**Context:** Two readers scanned every pricing/billing surface across the Website, README/docs, vscode extension, and API docs against the canonical billing model (trial RETIRED; free Base plan 100 API calls/mo; Lava PAYG $0.20/call; plan overage $0.20/call; one-time top-up $50/200 calls; SPT $0.25/call DIRECT-API only; wording standard "API calls" not "tokens"). Overall the surfaces are in good shape — terminology and headline prices are consistent — but a handful of stale "trial" references, one ambiguous SPT/MCP claim, and a "tokens"-vs-"API calls" leak in the API docs need correcting before they propagate.

## 1. Objective

Bring every pricing/billing surface to a single voice. Eliminate residual "trial" language (trial is retired — the entry point is the free Base plan), remove any implication that SPT works via the hosted MCP (it is direct-API only), and reconcile the API doc "token" terminology with the user-facing "API calls" standard. Confirm `brand_intelligence = 20` everywhere (never ~10). Make the model parseable by AI agents, not just humans.

## 2. Findings

| Surface | Claim found | Location (file:line) | Canonical | Status | Fix |
|---|---|---|---|---|---|
| Website FAQ | "How does the trial work? … You enter an email, get a **trial key**" | `Fodda Website/pages/FAQ.tsx:37-38` | Trial RETIRED; entry = free Base plan (100 API calls/mo) | ❌ Stale | Reframe to free Base plan, no "trial" |
| Website Pricing (Partnership) | "Issue Fodda **trial keys** to your users" | `Fodda Website/pages/Pricing.tsx:660` | Free Base plan is the entry point | ⚠️ Stale (section gated `{false &&`) | Reword to "free Base accounts" before re-enabling |
| vscode README | "Without an API Key (**Agent Pay-Per-Query**) … query Fodda without any account or API key … Send `X-Stripe-SPT` header **with any REST API request**" | `Fodda MCP/fodda-vscode/README.md:107-111` | SPT $0.25/call is **DIRECT-API only — not via the hosted MCP** | ⚠️ Misleading by omission | Add explicit "REST API only, not via this MCP connector" caveat |
| vscode README (table) | "Agent Pay-Per-Query \| Zero-onboarding agent access via SPT" | `Fodda MCP/fodda-vscode/README.md:121` | SPT = direct REST only | ⚠️ Ambiguous | Annotate channel as "(direct REST API)" |
| vscode CHANGELOG | "four-channel payment model (SPT agent access, inline **token** top-up, Lava PAYG, paid plans)" | `Fodda MCP/fodda-vscode/CHANGELOG.md:5` | "API calls" not "tokens"; top-up = $50/200 calls | ⚠️ Terminology leak | "inline API-call top-up via Stripe Checkout" |
| API docs v1.6 | "Token costs are authoritative" + table (`url_context=1`, `research_chat=3`, `expert_agent=5`, `deep_dive_fast=10`, `deep_dive_comprehensive=25`) | `Fodda API/Fodda/Fodda_API_Documentation_v1.6_2026-05-21.md:415, 420-429` | User-facing standard is "API calls" | ⚠️ Terminology divergence | Add a note that "tokens" = internal metering unit; clarify call↔token mapping (see §3.4) |
| Website Pricing | Free Base (100 API calls/mo, no card); Lava PAYG $0.20/call, first 3 free, credits never expire; overage $0.20/call; SPT $0.25/call; top-up $50/200 calls | `pages/Pricing.tsx:253,256,270-271,343,399-400,426,433,460-461,512,559,585` | All match | ✅ Correct | None |
| Website integrations | "Base plan gives you 100 API calls/month free" (no "trial") | `pages/IntegrationClaude.tsx:180`, `pages/IntegrationGemini.tsx:70`, `pages/Agents.tsx:338` | Matches | ✅ Correct | None |
| Website Pricing | Query tiers Light 5 / Standard 15 / Heavy 20 / Intensive 30 (Airtable-driven) | `pages/Pricing.tsx:269,703`, `hooks/usePricingData.ts:136-141` | Matches per-query table | ✅ Correct | None |
| llms.txt | API Key free tier 100 calls/mo; MPP 402 → `Bearer spt_xxx`, zero-onboarding | `Fodda Website/llms.txt:39-43` | Matches; SPT correctly framed as REST/402 (not MCP) | ✅ Correct | None |
| vscode README | "free Base plan … top up … pay-as-you-go … one-time purchase via inline Stripe Checkout" | `Fodda MCP/fodda-vscode/README.md:105` | Matches | ✅ Correct | None |
| Internal brief | `brand_intelligence … 20` (correct, not 10) | `Fodda MCP/briefs/Brief Airtable Changes.md:41` | brand = 20 | ✅ Correct (the "10" is a different column, not the price) | None — confirmed no brand=10 price error on any surface |

## 3. Inconsistencies to fix (prioritized; each with the correct value)

**3.1 — `FAQ.tsx:37-38` — Stale "trial key" language (P1).** Trial is retired. Replace the Q&A with:
> **Q:** "How do I get started? Do I need a credit card?"
> **A:** "No credit card. Create a free Base account at app.fodda.ai, verify your email, and you get **100 API calls/month** immediately — enough to connect to Claude or other supported tools and start researching."

**3.2 — `vscode/README.md:107-121` — SPT must be marked direct-API only (P1).** The vscode extension connects via the **hosted MCP, which requires an API key**. SPT / "Agent Pay-Per-Query" ($0.25/API call) is **not available through this MCP connector** — it is REST-API only. Add a caveat under the "Without an API Key" heading:
> "**Note:** SPT (Agent Pay-Per-Query) applies to direct REST API requests only. It is **not** available through this MCP connector — MCP usage requires an API key (free Base plan or paid)."

And annotate the table row: `| **Agent Pay-Per-Query** | Zero-onboarding agent access via SPT — **direct REST API only** |`.

**3.3 — `vscode/CHANGELOG.md:5` — "token top-up" → "API-call top-up" (P2).** Correct value: top-up is **$50 for 200 API calls**, one-time via inline Stripe Checkout. Reword to: "four-channel payment model (SPT agent access via REST, **inline API-call top-up via Stripe Checkout**, Lava PAYG, paid plans)."

**3.4 — `Fodda API v1.6:415,420-429` — "tokens" vs "API calls" reconciliation (P2, API Agent owns).** User-facing surfaces standardize on "API calls"; the API doc says "token costs are authoritative" with per-interaction values. These appear to be the **same unit** (1 token = 1 API call in billing), but that 1:1 relationship is nowhere stated. Add one line above the table:
> "In billing and all user-facing communication these units are called **API calls** (1 token = 1 API call). 'Token' here refers only to the internal metering unit."
This prevents an agent or developer from inferring a hidden second currency. Do not change the per-interaction values — only label them.

**3.5 — `Pricing.tsx:660` — Partnership "trial keys" (P3, gated off).** Section is currently disabled (`{false &&`). Before it is ever re-enabled, change "Issue Fodda trial keys to your users" → "Issue free Fodda Base accounts to your users."

## 4. Recommendations (single voice on pricing/billing language)

1. **Ban the word "trial" in all customer-facing copy.** The entry point is the **free Base plan: 100 API calls/month on email verify, no credit card**. Grep every repo for `trial` in user-facing strings (`FAQ.tsx`, `Pricing.tsx`, READMEs) and replace. Internal CHANGELOG/code references to `sk_trial_` keys may remain but should carry a one-line "trial tier deprecated" note so future readers don't resurrect it.
2. **"API calls" is the only unit in customer-facing text.** "Tokens" survives only as an internal metering term inside the API spec, and even there must be explicitly mapped 1:1 to API calls. No customer-facing surface says "tokens."
3. **Present the four rails consistently, in this order, on every surface:**
   - **Free Base** — 100 API calls/month, email verify, no card.
   - **Paid Plans** — subscription tiers (overage $0.20/API call, card on file).
   - **Lava PAYG** — $0.20/API call, first 3 free each month, credits never expire.
   - **MCP Top-Up** — $50 for 200 API calls, one-time, inline Stripe Checkout (MCP/IDE users).
   - **SPT (Agent Pay-Per-Query)** — $0.25/API call, zero-onboarding, **direct REST API / MPP-402 only — not via the hosted MCP**.
4. **Always disambiguate SPT's channel.** Anywhere SPT/$0.25 appears next to MCP setup instructions, add "direct REST API only." llms.txt already does this correctly (402/`spt_xxx`); the vscode README does not.
5. **Keep the per-query table canonical and visible:** search_graph 15, brand_tracker **20** (never ~10), deep_research_topic 20 light / 30 heavy, brainstorm 15, read_url 15, upload_compare 20, weekly_tracker 20, get_supplemental_context/get_evidence/search_statistics/expert_agent/get_earnings_intelligence 5, research_chat 3, generate_visual/account-admin 0. The website's Airtable-driven table (`usePricingData.ts:136-141`) is the right pattern — other surfaces should reference it, not hardcode.
6. **Make it AI-parseable.** llms.txt is the model citizen — keep a machine-readable pricing block there (unit = API call; rails + prices; SPT = 402/direct-only). Mirror a compact, label:value pricing summary into the vscode README's "Access & Pricing" section so an agent scraping the README gets unambiguous numbers, not just prose links to the pricing page. Avoid human-only phrasings like "top up instantly" without the actual $50/200 figure nearby.

## 5. Acceptance Criteria

- [ ] `FAQ.tsx:37-38` no longer contains "trial" or "trial key"; reframed around free Base plan (100 API calls/mo).
- [ ] `vscode/README.md:107-121` explicitly states SPT is direct REST API only and NOT available via the MCP connector.
- [ ] `vscode/README.md:121` table row annotates Agent Pay-Per-Query as "direct REST API only."
- [ ] `vscode/CHANGELOG.md:5` says "API-call top-up," not "token top-up."
- [ ] `Fodda_API_Documentation_v1.6:420` carries a line mapping token ↔ API call 1:1 and scoping "token" to internal metering.
- [ ] `Pricing.tsx:660` reworded to "free Base accounts" (apply before any re-enable of the gated section).
- [ ] `grep -ri "trial" ` across customer-facing files returns no user-visible matches (internal `sk_trial_` allowed, with deprecation note).
- [ ] `grep -ri "token"` across customer-facing copy returns no billing-unit usage.
- [ ] `brand_tracker` / brand_intelligence reads **20** on every surface (no "10" as a price); confirmed — no fix needed, included as a guard check.
- [ ] All five rails (Free Base, Paid Plans, Lava PAYG, MCP Top-Up, SPT) appear with correct prices in the same order on Website Pricing, vscode README, and llms.txt.

## 6. CHANGELOG Entry

```
### Docs — Pricing & billing language alignment (P1)
- FAQ: removed retired "trial key" language; entry point is the free Base plan (100 API calls/month, email verify, no card).
- vscode README: clarified SPT / Agent Pay-Per-Query ($0.25/API call) is direct REST API only and NOT available via the hosted MCP connector (MCP requires an API key).
- vscode CHANGELOG: "token top-up" → "API-call top-up" ($50 / 200 API calls, inline Stripe Checkout).
- API docs v1.6: noted token metering unit = API call (1:1); "token" scoped to internal metering only.
- Pricing page Partnership (gated): "trial keys" → "free Base accounts" pending re-enable.
- Confirmed brand_intelligence = 20 API calls across all surfaces (no stale "~10").
- Standardized rail order/prices: Free Base, Paid Plans, Lava PAYG ($0.20/call, first 3 free), MCP Top-Up ($50/200), SPT ($0.25/call, direct REST only).
```
