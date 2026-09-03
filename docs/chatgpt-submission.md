# ChatGPT Apps Directory Submission Manifest: Fodda Intelligence

This document contains all metadata, authentication configurations, sample prompts, and verification checklists required for submitting Fodda to the ChatGPT Apps Directory.

---

## 1. App Identity & Metadata

- **App Name**: `Fodda Intelligence`
- **Short Description** (79 chars, limit 100):
  `Live market, brand & earnings intelligence grounded in expert knowledge graphs.`
- **Long Description** (limit 1000 chars):
  `Fodda Intelligence gives ChatGPT verified access to expert-curated knowledge graphs across retail, consumer goods, technology, sustainability, and culture. Research emerging market signals, track brand footprints, explore competitive dynamics, and inspect quarterly corporate earnings commentary with citations down to the source quote. Unlike unverified web scrapes, every finding is grounded in structured ontologies maintained by industry analysts, with transparent attribution and supporting evidence for every insight.`
- **Categories**:
  - Business & Finance
  - Productivity
  - Research & Analysis
- **Developer / Publisher**: _confirm legal entity name (must match the verified publisher identity in the OpenAI Platform org)_
- **Website**: `https://fodda.ai`
- **Pricing Model**: `Metered per API call — see https://fodda.ai/pricing`

---

## 2. Technical & Server Configuration

- **MCP Server URL**: `https://mcp.fodda.ai/chatgpt`
- **Transport**: Streamable HTTP (POST)
- **Tool Profile**: `chatgpt` (24 curated tools)
- **Domain Verification Challenge Endpoint**: `https://mcp.fodda.ai/.well-known/openai-apps-challenge`
- **RFC 9728 Protected Resource Metadata**: `https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt`

---

## 3. Authentication Configuration (OAuth 2.1)

Verified live 2026-09-03 against `https://clerk.fodda.ai/.well-known/oauth-authorization-server`.

- **Auth Type**: OAuth 2.1, Authorization Code + PKCE (`S256`), **Dynamic Client Registration** (ChatGPT registers itself; no pre-shared client id needed)
- **Issuer / Authorization Server**: `https://clerk.fodda.ai`
- **Authorization URL**: `https://clerk.fodda.ai/oauth/authorize`
- **Token URL**: `https://clerk.fodda.ai/oauth/token`
- **Registration URL (DCR)**: `https://clerk.fodda.ai/oauth/register`
- **Resource Metadata (RFC 9728)**: `https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt`
- **Scopes**: `openid profile email offline_access`
- **Grants**: `authorization_code`, `refresh_token`
- **Sign-in UI**: `https://app.fodda.ai` (consent page `/oauth-consent`)
- **Anonymous Use**: Disabled (all routes reject unauthenticated requests with HTTP 401 and RFC 9728 WWW-Authenticate headers)

---

## 4. Legal & Support Links

- **Privacy Policy**: `https://fodda.ai/privacy`
- **Terms of Service**: `https://fodda.ai/terms`
- **Support URL**: `https://app.fodda.ai/support`
- **Support Email**: `support@fodda.ai`

---

## 5. Sample User Prompts

1. `What are the emerging trends in luxury retail resale?`
2. `Compare Nike and Lululemon's latest quarterly commentary on inventory and direct-to-consumer.`
3. `What signals are emerging around AI agent workflows in consumer tech?`
4. `Track Patagonia's brand footprint across retail and sustainability graphs.`
5. `Where are apparel executives deflecting questions in recent earnings calls?`

Expected behaviour: each prompt resolves to one profile tool (`search_graph`, `get_company_earnings` / `get_earnings_divergence`, `search_insights`, `brand_tracker`, `get_earnings_intelligence`) and returns cited graph evidence with expert/graph attribution. No prompt above triggers a payment, sign-up, or scheduling action.

### 5b. Negative prompts (expected safe refusals)

1. `Buy me 200 more Fodda API calls.` → tool surface has no purchase path; model answers that account changes are made at `https://app.fodda.ai/account` (no link to any payment page is returned by any tool).
2. `Sign me up for a new Fodda account with my email.` → `sign_up_free_account` is not on this profile; model directs the user to sign in via the app's OAuth connection.
3. `Schedule a weekly brand report for Nike and email it to me every Monday.` → `manage_scheduled_reports` is not on this profile; model explains scheduling is not available in ChatGPT and offers a one-off `brand_tracker` run instead.

---

## 6. Pre-Submission Verification Checklist

- [ ] **Challenge verification**: `curl -s https://mcp.fodda.ai/.well-known/openai-apps-challenge` returns the challenge token string matching `OPENAI_APPS_CHALLENGE` with status 200 and Content-Type `text/plain; charset=utf-8`.
- [ ] **Discovery metadata**: `curl -s https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt` returns valid RFC 9728 JSON pointing to the Clerk authorization server issuer.
- [ ] **Unauthenticated 401 gate**: `curl -s -i -X POST https://mcp.fodda.ai/chatgpt -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'` responds with HTTP 401 and `WWW-Authenticate: Bearer resource_metadata="https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt"`.
- [ ] **Tool footprint**: Server exposes exactly 24 tools on `/chatgpt`, including `search_graph`, `brand_tracker`, `get_company_earnings`, `consult_analyst`, and `generate_visual`.
- [ ] **Commerce silence & hygiene**:
  - `get_my_account` returns clean account status omitting `stripe_link`, `upgrade_offer`, and overage dollar figures.
  - Credit exhaustion returns `QUOTA_EXHAUSTED` with `manage_url: https://app.fodda.ai/account` and no Stripe URLs.
  - Search results and queries do not include `$0.50/API call` overage notes.
  - Response payloads strip internal `_`, `record_id`, `airtable_*`, and Airtable `rec*` strings while preserving all chainable IDs (`analyst_id`, `node_id`, `job_id`, etc.).
- [ ] **OAuth flow**: Complete end-to-end OAuth flow in ChatGPT custom app connection UI and verify tools can be invoked without manual header injection.
- [ ] **Anonymous gate on production**: after deploy, unauthenticated `initialize` returns 401 on all eight routes **and** on `/sse` (`curl -si https://mcp.fodda.ai/sse | head -1`).

---

## 7. Tool annotation justifications (reviewers ask for one line per tool)

All 24 tools are non-destructive (`destructiveHint: false`). Values below are the live annotations in `src/toolHandlers.ts`.

| Tool | readOnly | idempotent | openWorld | Justification |
|---|---|---|---|---|
| `get_capabilities` | true | true | false | Static catalogue of platform capabilities. |
| `list_graphs` | true | true | false | Lists the user's enabled knowledge graphs; no writes. |
| `list_analysts` | true | true | false | Registry lookup of named experts. |
| `search_graph` | true | false | true | Vector + graph search; may fan out to supplemental external sources (web, trends APIs). Not idempotent: results depend on live indexes. |
| `search_statistics` | true | false | false | Type-scoped graph query for statistics; internal data only. |
| `search_insights` | true | false | false | Type-scoped graph query for expert quotes; internal data only. |
| `get_validated_trends` | true | true | false | Reads earnings-validated trend records. |
| `brand_tracker` | true | false | true | Composes graph data with external signals (Google Trends, Wikipedia, commerce APIs) into a brand profile. |
| `get_company_earnings` | true | true | false | Reads per-ticker earnings records from Fodda's earnings store. |
| `get_earnings_intelligence` | true | false | false | Cross-transcript query over the earnings store. |
| `get_earnings_divergence` | true | false | false | Computes management-vs-analyst divergence from stored transcripts. |
| `deep_research_topic` | true | false | true | Starts an autonomous research job that reads graphs, supplemental APIs and the web; creates a job record but no user-visible state. |
| `check_research_status` | true | true | false | Polls a research job by `job_id`. |
| `consult_analyst` | false | false | false | Conversational turn with a synthetic analyst; persists session context (read/write on the user's own session only). |
| `consult_human_agent` | false | false | false | Conversational turn with an expert's digital twin; persists session context (user's own session only). |
| `get_evidence` | true | true | false | Returns source articles for a trend node. |
| `get_node` | true | true | false | Node metadata lookup by id. |
| `get_neighbors` | true | true | false | One-hop graph traversal. |
| `get_label_values` | true | true | false | Taxonomy lookup. |
| `get_my_account` | true | true | false | Account status read; on this profile returns no purchase or upgrade fields. |
| `read_url` | true | true | true | Fetches a user-supplied public URL and matches it against graphs. |
| `get_supplemental_context` | true | false | true | Calls external institutional data APIs (FRED, BLS, Census, etc.). |
| `check_supplemental_status` | true | true | false | Polls an async supplemental request. |
| `generate_visual` | true | true | false | Renders an SVG from data already in the conversation; no network. |

---

## 8. Reviewer demo account

OpenAI requires a login **and password** that completes sign-in with no MFA, SMS, or email confirmation. Fodda sign-in today is SSO + email code only, so this is blocked on the App-agent handoff (Clerk password strategy for one reviewer account). Fill in when ready; **never commit the credentials**.

- Email: _pending_
- Password: _in shared vault_
- Plan / calls: ≥ 700 API calls, ≥ 5 graphs enabled
- Verified: [ ] fresh browser → MCP Inspector → `/chatgpt` → OAuth → password only → 24 tools listed

---

## 9. Release notes (for the submission form)

v1.46.49 — First ChatGPT Apps Directory build. Dedicated `/chatgpt` profile (24 read-mostly research tools), OAuth 2.1 with dynamic client registration via `clerk.fodda.ai`, RFC 9728 discovery on every route, domain verification at `/.well-known/openai-apps-challenge`. No purchase, sign-up, or scheduling actions are exposed; account management stays at app.fodda.ai. Setup: connect the app, sign in with your Fodda account, then ask a research question.
