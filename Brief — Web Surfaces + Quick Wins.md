# Brief — Web Surfaces + Quick Wins

> Consolidated hand-off (2026-07-07). Bundles the two outstanding **website** items with two genuinely-cheap **cross-repo** opens surfaced by the brief triage. Each task is independently shippable — do in any order. Full detail for each lives in the source brief noted; this is the actionable summary.
>
> Note: both website items are **OPEN** (not partial) — the API side is live, the pages just aren't built. The PARTIAL items from triage (Widget Template Phase 2, MCP self-changes, graph-catalog evidence retrieval, CE encoding) are MCP/API/CE work, not web — not included here.

---

## Website (Fodda Website — Vite + React Router SPA, routes in `App.tsx`, pages in `pages/`)

### W1 · "Your Agent" page — `/your-agent`  ·  P1
**Source brief:** `Brief Website Your Agent Surface.md` (full spec + response shape).

The front door for expert self-use: an onboarded expert lands here (from the approval email) and gets their Human Agent into Claude/ChatGPT in under a minute. **API is fully live** — one authenticated call, `GET /v1/analysts/me` (`x-api-key` header), returns everything the page needs.

**Build:** new page + route `/your-agent`, four states off one API call:
- **Key entry** — prompt for the expert's Fodda API key; store in `localStorage` only; only ever send to `api.fodda.ai`. Reuse an existing authed session/key if the site has one.
- **200** → main panel: identity (portrait, name, description, status chip, backing graphs); a **Connect block** (MCP URL + masked API key, both copy buttons, per-client setup — render from the API's `connect` object, don't hardcode); **Try it** example-prompt chips (`connect.example_prompt` + analyst `exampleQueries`); **the deal** from `self_use.note` ("free up to `daily_cap`/day; pays standard rates only beyond your own graph"); a status nudge so an in-review expert sets the connector up now.
- **404 `NO_ANALYST_PROFILE`** → "No agent linked yet" + join-experts CTA.
- **401 / bad key** → inline error, re-prompt.

**Out of scope:** usage/earnings dashboards, profile editing, client share links.
**Acceptance:** Piers's key renders `piers-fawkes-psfk` with working copy buttons; no-analyst key → 404 state; garbage key → 401; works logged-out (email-paste path).

### W2 · Make `/privacy` crawler-visible (server-render)  ·  P1
**Source brief:** `briefs/Brief Website Privacy Page Server-Render.md`.

`PrivacyPolicy.tsx` renders **client-side only** — `curl https://www.fodda.ai/privacy` returns the app shell with **zero policy text**. This risks the Anthropic MCP Directory review (reviewers/crawlers fetch without executing JS).

**Goal:** the full Privacy Policy text is present in the **server-rendered HTML** for `www.fodda.ai/privacy` (no JS required). Use whatever the stack supports cheaply — a prerender/SSG step for that route, or a static `/privacy` HTML fallback carrying the policy text.
**Acceptance:** `curl -s https://www.fodda.ai/privacy` contains the "Privacy Policy" heading and the policy body.
**Explicitly out of scope:** the bare apex `fodda.ai/privacy` 404 — that's a GoDaddy domain-forwarding/DNS issue, not website code. Don't block on it.

---

## Quick wins (cheap, self-contained — different repos/agents)

### Q1 · A2A part-format compatibility (MCP — `src/a2aHandler.ts`)  ·  small
**Source brief:** `briefs/Brief A2A Part Format Fix.md`.

The `/a2a` endpoint only accepts message parts with `kind: 'text'`. Google's A2A routing (Fodda is ENABLED on Gemini Enterprise A2A) and other registries send `{ type: 'text', text }` or bare `{ text }`, which currently error with `-32602 no text part found`. **Fix:** in the part finder, accept `kind === 'text'` **or** `type === 'text'` **or** a bare `text` field; loosen the `A2APart` type so `kind`/`type` are optional. Verify with a `message/send` using each of the three shapes.

### Q2 · Earnings supplemental dedup (API/Airtable — data)  ·  small
**Source brief:** `briefs/api-earnings-dedup-followup.md`.

`/v1/graphs` still emits **two** earnings entries: the canonical `earnings-calls` in `graphs[]` **and** a stale `earnings_calls` in the `supplemental_sources` block (built from a separate source the earlier `status→draft` fix didn't touch). The website renders both, so users see duplicate earnings graphs. **Fix:** remove (or merge into `earnings-calls`) the `earnings_calls` entry in the supplemental-sources source. **Verify:** re-fetch `/v1/graphs`, grep both `graphs[]` and `supplemental_sources` for `earnings` → a single canonical entry. Pure data; no MCP change.

---

## Priority order
W1 (self-use front door, highest leverage) → W2 (unblocks directory review) → Q1 (A2A robustness) → Q2 (cosmetic dedup). W-items are Website Agent; Q1 is MCP Agent; Q2 is API Agent.
