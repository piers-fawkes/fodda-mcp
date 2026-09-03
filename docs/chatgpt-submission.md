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
- **Developer / Publisher**: `Fodda Inc.`
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

## 3. Authentication Configuration (OAuth 2.0)

- **Auth Type**: OAuth 2.0 (Authorization Code Grant with PKCE)
- **Authorization URL**: `https://app.fodda.ai/oauth/authorize`
- **Token URL**: `https://app.fodda.ai/oauth/token`
- **Resource Metadata**: `https://mcp.fodda.ai/.well-known/oauth-protected-resource/chatgpt`
- **Scopes**: `openid profile email offline_access`
- **Token Refresh**: Enabled (via refresh token / `offline_access`)
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
