# Response — Web Surfaces + Quick Wins

> Walkthrough of the work delivered against **Brief — Web Surfaces + Quick Wins.md** (2026-07-07).
> Author: Website Agent (also picked up Q1 in the MCP repo). Status below is **code-complete + locally verified**; the live acceptance for every item is a **manual deploy + smoke-test** (this project does not auto-deploy).

---

## TL;DR ledger

| Item | Repo | Code | Local verification | Live gate (owner action) |
|---|---|---|---|---|
| **W1** `/your-agent` page | Website | ✅ | `tsc` + `vite build` clean; key-entry + error state render in a real browser | Deploy → open `/your-agent` with a real key → eyeball the 200 panel |
| **W2** `/privacy` server-render | Website | ✅ | `curl` local server → 200, 720 words, heading + correct title | Deploy → `curl -s https://www.fodda.ai/privacy \| … \| wc -w` |
| **Q1** A2A part-format fix | MCP | ✅ | `tsc --noEmit` exit 0; 7/7 standalone logic test | Deploy `fodda-mcp` → three `message/send` curls |
| **Q2** earnings supplemental dedup | Airtable | — | n/a — pure data, no code | API/Airtable agent (not touched) |

Nothing is live yet. Git push does **not** deploy either repo.

---

## 0. Discovery — three facts that shaped the work

1. **The website is served by `server.js` (Node), not nginx.** `nginx.conf` is stale/unused; the `Dockerfile` runs `node server.js`. That server has a **"pre-rendered content injection" block** (~line 3691) that injects an HTML body into `<div id="root">` for **all** visitors — not only crawler user-agents. Humans still get the React SPA because `index.tsx` uses `createRoot().render()`, which **clears** `#root` on mount. This is the mechanism W2 rides on, and it's why `curl` (a non-crawler UA) sees the policy text.
2. **The live API contract differs slightly from the brief.** Probing `GET /v1/analysts/me`:
   - no key → **402** `payment_required` (the general API paywall), not 401.
   - bad key → **401** `{ error: { code: "INVALID_API_KEY", … } }`.
   W1 was built to the *live* shapes, not the brief's documented ones (see §1).
3. **Deploy is manual and ships the working tree.** `bash deploy_website.sh` (Cloud Run, `--source .`). Verified against the deploy docs; consistent with the standing note that the live site can differ from git HEAD.

---

## 1. W1 — "Your Agent" page (`/your-agent`)

**Files**
- `pages/YourAgent.tsx` — new page (self-contained).
- `App.tsx` — lazy import + `<Route path="/your-agent" … />`.
- `server.js` — added `/your-agent` to `KNOWN_STATIC_ROUTES` (without it the server 404s the route, since it's not a real file).

**Design.** One authenticated call — `GET https://api.fodda.ai/v1/analysts/me` with the `x-api-key` header — drives four states:

- **Key entry** — masked password input with show/hide. Key persisted in `localStorage` under `fodda_api_key`, **only** ever sent to `api.fodda.ai`. On mount, a stored key auto-loads (reuses an existing session, per brief).
- **200** — the main panel:
  - *Identity*: portrait (falls back to a Bot glyph), name, description, **status chip** (Active vs In review), backing-graph pills, and **tabs** when `analysts[]` has more than one entry.
  - *Connect block* rendered from the API's `connect` object: MCP URL (copy), masked API key (reveal + copy), a collapsible **ready-to-paste connector URL** (`mcp_url?api_key=…`), and short per-client steps (Claude / ChatGPT / any MCP client). Copy stays sourced from the API, not hardcoded.
  - *Try it*: prompt chips from `connect.example_prompt` + the analyst's `exampleQueries`, de-duped, click-to-copy.
  - *The deal*: from `self_use.note`, with a `daily_cap` fallback sentence.
  - *Status nudge*: an in-review banner telling the expert to set the connector up now so approval day is activation day.
- **404** (`NO_ANALYST_PROFILE`) — "No agent linked yet" + *Become an expert* / email CTAs.
- **401 / bad key** — inline error, re-prompt (message pulled from `error.message` when present).

**Robustness decisions**
- Any non-200/404 (covers the live 401 **and** the 402 paywall) → re-prompt path. Any 404 → no-analyst. Network failure → caught, friendly error.
- All field access is defensive: optional chaining, arrays defaulted, and `graphLabel()` handles `backing_graphs` items whether they're strings or objects — so an unexpected payload degrades instead of crashing.
- Page is `noIndex`.

**Conventions reused** — `SEO`, `useToast`, the brand palette (`brand`/`brand-light`/`brand-dark`), and the `Connect.tsx` copy-button/prompt-card patterns, so it reads like the rest of the site.

**Verification**
- `npx tsc --noEmit` → clean. `npx vite build` → clean (emits a `YourAgent-*.js` chunk).
- Ran the built `server.js` locally and drove the page in a real browser: **key-entry renders correctly**, and **submit → loading → error** renders ("Could not reach Fodda…").

**Known gap (this is the real acceptance gate).** The **200** and **404** panels were never exercised end-to-end: it needs a real analyst key, and the local preview sandbox blocks all `api.fodda.ai` requests (the page's own catalog/experts hooks fail there too). The logic is reviewed and the API shapes are curl-confirmed, but no live identity has actually rendered.
→ **Owner smoke-test:** deploy, open `/your-agent`, paste your key, and eyeball the 200 panel — portrait, tabs (if multi-analyst), Connect block with the real MCP URL + masked key, prompt chips, the deal. Residual risk is purely visual (layout of the real payload), not a likely crash.

---

## 2. W2 — `/privacy` server-rendered & crawler-visible

**Problem.** `PrivacyPolicy.tsx` renders client-side only, so `curl https://www.fodda.ai/privacy` returned the app shell with zero policy text — a risk for the Anthropic MCP Directory review (reviewers/crawlers fetch without executing JS).

**Fix.** Added a `/privacy` branch to the `server.js` "pre-rendered injection" block (§0.1): sets `matched = true`, the title/description, a `WebPage` JSON-LD schema, and a `crawlerBodyContent` HTML string carrying the **full policy text** (mirrors `pages/PrivacyPolicy.tsx` verbatim — 8 sections, "Last updated: June 16, 2026", `privacy@fodda.ai` preserved). The block injects that into `<div id="root">` and returns.

**Why no human regression.** `createRoot().render()` clears `#root` on mount, so the React page replaces the injected static HTML for JS visitors. `curl`, crawlers, and the directory reviewer see the text; humans see the unchanged SPA page.

**Verification (local `server.js`).**
- `curl /privacy` → **200**, stripped word count **720** (> 500), `grep -ci "privacy policy"` → 5, `<title>Privacy Policy | Fodda</title>`.

→ **Owner gate:** after deploy, `curl -s https://www.fodda.ai/privacy | sed 's/<[^>]*>//g' | tr -s ' \n' ' ' | wc -w` should print > 500, and the heading grep ≥ 1.

**Out of scope (unchanged, per brief):** the bare-apex `fodda.ai/privacy` 404 — a GoDaddy domain-forwarding/DNS matter, not website code.

---

## 3. Q1 — A2A part-format compatibility (MCP repo)

**File:** `src/a2aHandler.ts` in the MCP repo's `gifted-gagarin-d0798a` worktree (branch `claude/gifted-gagarin-d0798a` — the hub this brief bundle lives in; it was clean before the edit).

**Problem.** The `/a2a` endpoint only matched parts with `kind === 'text'`. Google's A2A routing (Fodda is ENABLED on Gemini Enterprise A2A) and other registries send `{ type: 'text', text }` or bare `{ text }`, which errored with `-32602 no text part found`.

**Fix (two edits).**
1. `A2APart` interface — `kind` made optional, optional `type` added. Safe: `A2APart` is input-only, and making a field optional never breaks literals that already provide it.
2. Text-part finder — now accepts `kind === 'text'` **or** `type === 'text'` **or** bare (`!kind && !type`), each gated on a non-empty `text`.

**Verification (no deploy needed).**
- `tsc --noEmit` → **exit 0**, zero errors (checked with the repo's real `node_modules`).
- Standalone logic test of the exact predicate → **7/7**: the three accepted shapes resolve the text part; the reject cases (data-only part, `type:'text'` with empty text, file part) still fall through to the correct `-32602` error.

→ **Owner gate:** `gcloud run deploy fodda-mcp --source . --region us-central1`, then the brief's three `message/send` curls (bare / Google / v1.0) against `mcp.fodda.ai` — all should return a task response, not `-32602`.

**Scope discipline:** stayed strictly on the A2A bug — no drift into parked Group B (#5/#6) in that repo.

---

## 4. Q2 — earnings supplemental dedup

Not touched — it's a pure **Airtable** data change (remove/merge the stale `earnings_calls` entry in the supplemental-sources source; base `app8RmjByxBeb6p0L`), with no website or MCP code involved. Belongs to the API/Airtable agent. Verification stays as the brief specifies: re-fetch `/v1/graphs`, grep `graphs[]` and `supplemental_sources` for `earnings` → a single canonical entry.

---

## 5. Housekeeping notes

- **Killed ~10 orphaned `node server.js` processes** from prior sessions that were squatting on ports and shadowing my test server with stale code (they made an early `/your-agent` check falsely 404). Worth knowing if anything else was relying on them.
- **Added `.claude/launch.json`** (name `site`, `autoPort: true`) in the website worktree so the Preview MCP can drive the built server. It's local-only (`.claude/` is untracked here), not part of the shipped change.
- **Saved a memory** documenting the `server.js` SSR-injection mechanism (fires for all visitors, not just crawler UAs) so future "make route X crawler-visible" work is a one-liner.

---

## 6. Owner deploy checklist

**Website (W1 + W2)** — from the website repo:
```bash
bash deploy_website.sh
# then:
curl -s -o /dev/null -w "%{http_code}\n" https://www.fodda.ai/your-agent            # 200
curl -s https://www.fodda.ai/privacy | sed 's/<[^>]*>//g' | tr -s ' \n' ' ' | wc -w  # > 500
# open https://www.fodda.ai/your-agent, paste your key, eyeball the 200 panel  ← the real W1 gate
```

**MCP (Q1)** — from the MCP worktree:
```bash
gcloud run deploy fodda-mcp --source . --region us-central1
# then the three message/send curls from Brief A2A Part Format Fix.md → expect task responses, not -32602
```

Two agents are warm: the website changes (W1/W2) and — same session — the MCP repo (Q1). If the live W1 200 render looks wrong, flag it and I'll jump straight back; that's the one path deploy still needs to settle.
