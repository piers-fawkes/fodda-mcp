# Brief: Make /privacy server-rendered & crawler-visible (and fix the apex)

**Owner:** Fodda website (www.fodda.ai) — separate repo from the MCP server.
**Priority:** P1 — blocks/risks the Anthropic MCP Directory submission review.
**Context:** Fodda's MCP server is in the Anthropic directory review queue. Anthropic's
review (and search crawlers, link unfurlers) may fetch the privacy URL **without executing
JavaScript**. Today they'd see an empty page.

## Problem

The `/privacy` route renders correctly for human visitors, but the policy text is injected
client-side (the site is a SPA — the HTML source is just `<div id="root">` + a
`/assets/index-*.js` bundle). Consequences, all verified:

- `curl -s https://www.fodda.ai/privacy` → HTTP 200 but **~338 words of app shell, zero
  policy text** in the raw HTML. A no-JS client sees no policy.
- `curl -s -o /dev/null -w "%{http_code}" https://fodda.ai/privacy` → **404**. The bare
  apex doesn't serve sub-paths: GoDaddy domain forwarding redirects only the root and
  strips paths; only the `www` host (Google-hosted SPA) serves `/privacy`.

## Goal

The full Privacy Policy text is present in the **server-rendered HTML** for `/privacy`
(no JS required), and the apex path resolves.

## Scope

**In scope (this codebase):** making `https://www.fodda.ai/privacy` server-render the policy
text so it's visible without JS. This is the actual deliverable — the directory submission
and all our docs use the **`www`** URL.

**Out of scope (separate registrar/DNS task — NOT this codebase):** the bare apex
`https://fodda.ai/privacy` returning 404. That's a GoDaddy domain-forwarding limitation
(it redirects only the root and strips sub-paths); fixing it requires registrar/DNS/hosting
changes, not website code. Tracked separately — see "Out of scope" below. Do not block this
brief on it.

## Acceptance criteria (this codebase)

1. `curl -s https://www.fodda.ai/privacy` contains the heading "Privacy Policy" and the
   section body in the raw HTML. Stripped-text word count > 500.
2. No visual/functional regression for human visitors.
3. Set "Last updated: June 16, 2026" (updated this revision) and preserve the
   `privacy@fodda.ai` contact.

## Recommended approaches (most → least robust)

1. **Server-render / pre-render `/privacy`** (SSG or build-time prerender) so the policy
   HTML ships in the initial response. Best for SEO + crawlers. Ideally do the same for any
   other legal pages (Terms, Security Overview).
2. If full SSR isn't quick: **add a static `/privacy.html`** (or `/legal/privacy`) with the
   full text, **and/or** embed the policy inside a **`<noscript>`** block on the SPA route
   so the text is in the HTML source regardless.

## Out of scope — apex redirect (separate owner, registrar/DNS)

Not part of this brief; listed for the infra owner. The bare apex `fodda.ai/*` 404s on
sub-paths because GoDaddy domain forwarding strips paths. To fix (optional — we use `www`
everywhere): move DNS to Cloudflare and add a redirect rule `fodda.ai/* →
https://www.fodda.ai/$1`, or move hosting to a platform with native apex support
(Firebase/Netlify/Vercel/Cloudflare Pages) and proper apex↔www path-preserving redirects.

## Canonical policy text (source of truth — embed verbatim)

> **Privacy Policy** — Last updated: June 16, 2026
>
> **1. Introduction.** Fodda AI ("Fodda," "we," "us," or "our") is committed to protecting
> your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard
> your information when you use our website (www.fodda.ai), API services, MCP integration,
> and the Fodda Sandbox application (collectively, the "Services").
>
> **2. Information We Collect.**
> *Account Information:* When you register, we collect your name, email address, and
> organization details to create and manage your account.
> *Usage Data:* We log API queries (query text, graph accessed, timestamps) for billing,
> service improvement, and abuse prevention. We do not store the full content of
> AI-generated responses.
> *Technical Data:* We collect standard web analytics data including IP addresses, browser
> type, and referral URLs to improve our services.
>
> **3. How We Use Your Information.** Provide, maintain, and improve our Services; process
> billing and manage your subscription; monitor usage to prevent abuse and enforce rate
> limits; communicate service updates and support responses; comply with legal obligations.
>
> **4. Data Sharing.** We do not sell your personal information. We may share data with
> service providers (e.g., payment processors, cloud hosting) who assist in operating our
> Services, subject to confidentiality agreements. We may disclose information when required
> by law.
>
> **5. Data Retention.** We retain account information for as long as your account is
> active. Query logs are retained for billing and analytics purposes. You may request
> deletion of your account and associated data by contacting us.
>
> **6. AI Model Training.** Fodda does not use your queries or data to train AI models. Our
> knowledge graphs are curated by domain experts and are not generated from user
> interactions. API responses are deterministic and do not feed back into model training.
>
> **7. Security.** We implement industry-standard security measures including encrypted
> connections (TLS), API key authentication, and secure cloud infrastructure. For details,
> see our Security Overview.
>
> **8. Contact.** For privacy-related inquiries, contact us at privacy@fodda.ai or through
> our contact form.

## Verify when done (this codebase)

```bash
curl -s https://www.fodda.ai/privacy | sed 's/<[^>]*>//g' | tr -s ' \n' ' ' | wc -w   # > 500
curl -s https://www.fodda.ai/privacy | grep -ci "privacy policy"                       # >= 1
```

> Apex check (`curl ... https://fodda.ai/privacy`) is **out of scope** for this brief —
> it's a registrar/DNS task, not website code. See "Out of scope" above.
