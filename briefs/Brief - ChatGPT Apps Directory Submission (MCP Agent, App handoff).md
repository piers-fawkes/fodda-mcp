# Brief — ChatGPT Apps Directory Submission (MCP Agent primary, App Agent handoff)

> **Type:** Agent Task · **Priority:** P1 · **Owner:** `mcp-agent` · **Handoff:** App agent (Clerk password lane)
> **Execution:** `/build-from-brief "briefs/Brief - ChatGPT Apps Directory Submission (MCP Agent, App handoff).md"`
> **Prepared:** 2026-09-02 by Claude Code, from a live audit of `mcp.fodda.ai` (v1.46.48, rev `fodda-mcp-00023-mts`) against OpenAI's plugin submission requirements (`developers.openai.com/plugins/deploy/submission`, `apps-sdk/build/auth`, `apps-sdk/app-submission-guidelines`).

---

## 1. Context

OpenAI's directory accepts **MCP-only plugins** over a single public "Universal" URL, authenticated by **OAuth 2.1 only** (DCR or pre-registered client; API keys, client-credentials and "no auth" for user data are explicitly rejected). Fodda already satisfies most of the technical bar — verified live on 2026-09-02:

| Requirement | State | Evidence |
|---|---|---|
| Public production MCP URL, Streamable HTTP | ✅ | `https://mcp.fodda.ai/{mcp,copilot,…}` |
| OAuth 2.1 + PKCE S256 + DCR | ✅ | `clerk.fodda.ai/.well-known/oauth-authorization-server` advertises `registration_endpoint`, `authorization_code`+`refresh_token` |
| RFC 9728 protected-resource metadata | ✅ for `/mcp` only | `/.well-known/oauth-protected-resource/mcp` 200; `/copilot` variant 404 |
| Anonymous `initialize` rejected | ⚠️ partial | `/mcp`, `/copilot` → 401; `/brand-intelligence`, `/topic-research` → **200** (anonymous trial lane still open on offering paths) |
| `readOnlyHint` / `destructiveHint` / `openWorldHint` on every tool | ✅ | `src/toolHandlers.ts` static tools + fail-safe defaults for discovered skill tools (`:564`) |
| Scoped tool surface (not 47 tools) | ✅ mechanism exists | `OFFERING_SCOPED_TOOLS` (`src/index.ts:119`) — 13–18 tools per path |
| Privacy / Terms public URLs, server-rendered | ✅ | `www.fodda.ai/privacy`, `/terms` |
| Support URL | ⚠️ | `/support` 404 → use `www.fodda.ai/contact` (200) |
| Domain verification file | ❌ | `/.well-known/openai-apps-challenge` not served |
| Reviewer demo login **with password, no email/SMS/MFA step** | ❌ | App sign-in is LinkedIn / Google / GitHub SSO + email 6-digit code; "No password, ever." (`Fodda/frontend/components/AuthGate.tsx:502`) |
| No selling of digital services / credits / upgrades inside the plugin | ❌ | see §2.2 |

Two review policies make this more than a checklist:

1. **Commerce.** OpenAI: plugins may not sell "digital products or services — including subscriptions, digital content, tokens, or credits", and may not "display subscription plans, initiate new subscriptions, or promote upgrades". Accessing an *existing* paid account is fine. Today the connector returns an `upgrade_offer` with a Stripe link (`get_my_account`), Stripe checkout / setup URLs with `action: CHECKOUT_AVAILABLE` on credit exhaustion (`src/errorHandling.ts:150–172`), commissions paid expert work (`request_deliverable`), and creates recurring charges (`manage_scheduled_reports`). **This is the opposite of the Anthropic remediation** (Phases 3/5 of `Brief MCP Directory Remediation Plan.md` deliberately made prices and consent affordances visible). Both are correct for their reviewer — so ChatGPT needs its own profile, not a change to the Claude connector.
2. **Reviewer login.** "Provide a login and password for a fully featured demo account with sample data… without MFA, SMS, email confirmation." SSO-only makes this *worse* (third-party device verification). The fix lives in the App repo + Clerk dashboard, not here.

## 2. What to build

### 2.1 `chatgpt` offering profile (MCP repo)

Add a `'chatgpt'` entry to `OFFERING_SCOPED_TOOLS` and mount it on the transport route list (`src/index.ts:985`). Start from `copilot` and remove every commerce-adjacent or expert-side tool:

```
get_capabilities, search_graph, search_statistics, search_insights, get_validated_trends,
brand_tracker, get_company_earnings, get_earnings_intelligence, get_earnings_divergence,
deep_research_topic, check_research_status, consult_analyst, consult_human_agent, list_analysts,
get_evidence, get_node, get_neighbors, get_label_values, list_graphs, get_my_account,
read_url, get_supplemental_context, check_supplemental_status, generate_visual
```

**Excluded on this path:** `request_deliverable`, `check_deliverable_status`, `manage_scheduled_reports`, `sign_up_free_account`, `get_my_earnings`, `draft_linkedin_*`, `send_feedback`, `update_user_profile`, `toggle_graph_preference`, and all 8 expert-onboarding tools. (They stay on every other path — this is a profile, not a retirement.)

### 2.2 Commerce-free responses when `source === 'chatgpt'`

Thread the existing `source` value (already computed per session in `index.ts:1080`) into the two places that emit payment UI, and branch on it:

- `get_my_account` (`toolHandlers.ts` ~`:631–700`): omit `upgrade_offer`, `overage_note`, `overage_tokens`; keep `plan`, `api_calls_*`, `reset_date`, `manage_url` (`https://app.fodda.ai/account` — an existing-account link is permitted).
- `errorHandling.ts` credit-exhaustion path (`:143–172`): return `{ error: 'QUOTA_EXHAUSTED', message: 'Monthly limit reached. Manage your Fodda account at https://app.fodda.ai/account.', manage_url }` — no `top_up_url`, `upgrade_url`, `overage_rate_usd`, `action`, or Stripe hosts.
- `query_costs` in `get_my_account`: keep (it is usage metering, not a sales surface) but confirm no `$` string is present — the build guard in `scripts/generate-tools-manifest.mjs` already fails on `$` in descriptions; extend the same regex check to these two response builders in a unit test.

### 2.3 Auth hardening on the submitted path

- **DECIDED (Piers, 2026-09-02): no anonymous use of any offering.** Apply the 401 + `WWW-Authenticate` policy (`index.ts:1091`) to **every** transport path — `chatgpt` plus `/brand-intelligence`, `/topic-research`, `/deep-research`, `/earnings-intelligence`, `/expert-consult` (today the latter accept anonymous `initialize` with HTTP 200). Simplest form: drop the slug condition entirely; `MCP_ALLOW_ANONYMOUS=true` remains the only override.
- Serve `/.well-known/oauth-protected-resource/<slug>` for every path (generalise the `/mcp` handler at `index.ts:108` over the route list), each with `resource: https://mcp.fodda.ai/<slug>`.
- `pricingTier.tokenModel` in the discovery-card template (`index.ts:282`, `:311`) is read by nothing (not in the MCP schema; no consumer in any Fodda repo). Replace the string with `metered per API call — see https://fodda.ai/pricing` or delete the `pricingTier` block. One-line, zero blast radius; do it globally.
- Serve `/.well-known/openai-apps-challenge` from env `OPENAI_APPS_CHALLENGE` (plain text body). Add to the well-known allowlist at `index.ts:255`.

### 2.4 Response hygiene pass (review criterion: "no internal identifiers, debug payloads, auth secrets")

Tools that `JSON.stringify` raw API payloads on the `chatgpt` profile (`consult_*`, `get_company_earnings`, `get_earnings_*`, `get_supplemental_context`) get a one-line allowlist filter dropping keys matching `/^_|_id$|airtable|record_id|internal|debug|trace/i`. Verify with one live call per tool and paste the before/after key lists into the CHANGELOG entry.

### 2.5 Submission package (docs, no code)

Write `docs/chatgpt-submission.md` containing:
- Server URL `https://mcp.fodda.ai/chatgpt`, auth = OAuth (DCR), CSP = none (no custom UI shipped — `generate_visual` returns inline SVG text, not an Apps-SDK component).
- Per-tool annotation justifications (one sentence each — reviewers ask for these).
- 5 positive test prompts (one per capability: brand, topic, earnings, deep research, expert consult) with expected tool + shape; 3 negative prompts (e.g. "buy me more credits", "sign me up", "schedule a weekly report") with the expected refusal text from §2.2.
- Starter prompts (reuse `get_capabilities.example_prompts`), release notes, category, logo asset path (`server.json` icon), URLs: website `www.fodda.ai`, privacy `/privacy`, terms `/terms`, support `/contact`.
- Reviewer account: email + password (from §3), plan with ≥ 700 calls, ≥ 5 graphs enabled.

## 3. Cross-repo handoff — App agent + Clerk dashboard (blocking)

Fodda needs **one password-capable reviewer account** without changing anyone else's sign-in:

1. **Clerk dashboard:** enable *Password* as an optional authentication strategy (email code stays the default; accounts with no password are unaffected).
2. **App (`Fodda/frontend/components/AuthGate.tsx`):** after `signIn.create({ identifier })`, if the returned supported first factors include `password`, render a password field instead of sending a code. Normal users never see it. The OAuth consent flow already lands on this component (`OAuthConsentPage.tsx`, commit `3c176c1`), so a dashboard toggle alone will not surface it.
3. Create the reviewer account (`chatgpt-review@fodda.ai` or similar — **not** a real user), set its password, fund it, enable graphs. Store credentials in the shared vault, never in a repo.
4. Verify end-to-end: fresh browser → `https://mcp.fodda.ai/chatgpt` via MCP Inspector → OAuth → sign in with password only → tools list = §2.1 set.

The separate question of whether *humans* keep email-code sign-in is Piers's call and does not affect this brief.

## 4. Where to register

- `src/index.ts`: `OFFERING_SCOPED_TOOLS.chatgpt`, route list, 401 policy, two `.well-known` handlers.
- `src/toolHandlers.ts`, `src/errorHandling.ts`: `source`-aware branches from §2.2.
- `server.json` / `fodda_mcp_server.json`: no change (the Anthropic listing keeps its own surface).
- `tools-manifest.json`: regenerate; add a `profiles` column listing which paths expose each tool.
- `README.md` "Connect from ChatGPT" section pointing at `/chatgpt` (replace the current Responses-API-only guidance).
- `CHANGELOG.md`: version bump + verification results (live curl of 401 on `/chatgpt`, Inspector tool count, before/after payload keys).

## 5. Definition of Done

- [ ] Unauthenticated `initialize` on **every** path (`/mcp`, `/copilot`, `/chatgpt`, and all five offering slugs) → 401 with `WWW-Authenticate` pointing at that path's `/.well-known/oauth-protected-resource/<slug>` (200, `authorization_servers: ["https://clerk.fodda.ai"]`). Paste the live curl matrix into the CHANGELOG.
- [ ] Authenticated `tools/list` on `/chatgpt` returns exactly the §2.1 set; `/mcp` and `/copilot` are unchanged.
- [ ] `get_my_account` on `/chatgpt` has no `upgrade_offer`/`overage_*`; quota-exhausted error has no Stripe host, `top_up_url`, `upgrade_url`, `overage_rate_usd`, or `action`.
- [ ] `grep -E '\$\s?[0-9]|stripe\.com|buy\.stripe' ` over a recorded `chatgpt` session transcript of the 8 test prompts returns nothing.
- [ ] `/.well-known/openai-apps-challenge` serves the env token.
- [ ] Reviewer account signs in with password only (no code email sent) and completes OAuth from MCP Inspector.
- [ ] `docs/chatgpt-submission.md` complete; Piers holds the OpenAI Platform org role with "Apps Management" write access and a verified publisher identity (manual, Piers).
- [ ] CHANGELOG entry with the real verification output.

## 6. Do Not

- Do not alter the Anthropic connector surface (`/mcp`, `/copilot`, `server.json`) — its price-visibility and consent affordances are deliberate.
- Do not remove or rename tools globally; this is a profile.
- Do not compute or print any USD figure from `apiCallsCharged × 0.50`; the only price sources are the Airtable Plan / Offerings tables (see pricing note below).
- Do not add prices, "tokens", or "SPT" to any tool description or response text.
- Do not put reviewer credentials in the repo, a brief, or a CHANGELOG.
- Do not ship an Apps-SDK UI component in this pass; it triggers the CSP review path.

## 7. Files changed (expected)

`src/index.ts`, `src/toolHandlers.ts`, `src/errorHandling.ts`, `src/test_chatgpt_profile.ts` (new), `tools-manifest.json`, `README.md`, `CHANGELOG.md`, `docs/chatgpt-submission.md` (new), `deployment/*` (env: `OPENAI_APPS_CHALLENGE`).
App repo: `frontend/components/AuthGate.tsx`, its CHANGELOG.

---

### Pricing note (from the same audit — for Piers, not part of this brief's scope)

- The deployed `fodda-mcp` service has **no `AIRTABLE_API_KEY`** (env: `FODDA_API_URL, NODE_ENV, FODDA_MCP_SECRET, FODDA_API_KEY`), and the Docker build runs `npm run build` without it. So both the hourly Airtable pricing refresh (`src/pricingCache.ts:367`) and the build-time description sync are skipped in production; the MCP serves the **hardcoded** `DEFAULT_PRICING`.
- Today that is harmless: every overlapping row matches Airtable's Query Pricing table exactly, the `$100 / 200-call` upsell comes live from the Plan table via the API, and descriptions carry no prices by design (cost-silence guard, 1.46.34). But any future Airtable change will not reach the MCP until someone edits code. Recommended: add `AIRTABLE_API_KEY` (secret) + `PRICING_TABLE_ID` to the Cloud Run service and as a build arg.
- Nine query codes exist in code but not in Airtable (`earnings_*` ×6, `human_agent_consult`, `linkedin_post`, `linkedin_article`) and one Airtable row is blank — Airtable can't be the source of truth for those until rows exist.
- `.well-known` discovery cards still say "$0.50 via SPT" (`src/index.ts:282, :311`) — machine-facing, but human-readable; suggest "metered per API call — see https://fodda.ai/pricing".
