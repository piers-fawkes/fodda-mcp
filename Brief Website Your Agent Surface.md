# Brief: Website "Your Agent" Surface

## Objective
Give every onboarded expert a page that shows them THEIR Human Agent and gets it into their daily tools in under a minute: profile, connector setup, example prompts, and the self-use deal ("your agent is free for you"). This is the front door for the expert self-use loop — every expert who uses their own agent daily is a live demo of the platform.

## Context (what already exists — verified live 2026-07-02)
- **`GET /v1/analysts/me`** is deployed on `api.fodda.ai`. Authenticated with the expert's API key (`x-api-key` header), it resolves their analyst profile(s) and returns everything this page needs. Errors: `401 AUTH_REQUIRED` (no key), `404 NO_ANALYST_PROFILE` (key valid but no analyst linked).
- Response shape:

```json
{
  "ok": true,
  "analysts": [ { "id", "name", "description", "status", "imageUrl", "expertCard",
                  "exampleQueries", "backing_graphs", ...public profile fields } ],
  "self_use": {
    "note": "Self-use — no charge. When your agent reads other experts' graphs, earnings, or supplemental data, those calls bill at standard rates.",
    "daily_cap": 25
  },
  "connect": {
    "mcp_url": "https://mcp.fodda.ai/mcp",
    "instructions": "Add this URL as a custom connector in Claude, ChatGPT, or any MCP client, using your API key...",
    "example_prompt": "Consult <name>: what are the three trends my clients should be acting on this quarter?"
  }
}
```

- Self-use billing is live: consulting your own analyst returns `self_use: true` and charges nothing (daily soft cap applies; reads beyond the expert's own graph bill at standard rates).

## What to Build
A **"Your Agent"** page on the website (suggested route: `/your-agent`, linked from the expert approval email and the experts area).

### 1. Key entry
Ask for the expert's Fodda API key (the one from their account email). Store in localStorage only; never send it anywhere except `api.fodda.ai`. If the website already has an authenticated session that knows the user's key, use that instead and skip the prompt.

### 2. Call `GET /v1/analysts/me` and render per state
- **200** → the main panel (below). If `analysts[]` has multiple entries, tab between them.
- **404 NO_ANALYST_PROFILE** → "No agent is linked to this account yet." with two CTAs: *Become an expert* (join flow) and *Think this is wrong? hello@fodda.ai*.
- **401 / bad key** → inline error, re-prompt.

### 3. The main panel
- **Identity**: portrait, name, description, status chip (Active / in review), backing graph(s).
- **Connect block** (the core of the page): the MCP URL with a copy button, their API key field (masked, copy button), and short per-client instructions — Claude (Settings → Connectors → Add custom connector), ChatGPT, generic MCP client. Render from the API's `connect` object; don't hardcode copy in the page.
- **Try it**: 2–3 example prompts as copy-to-clipboard chips — use `connect.example_prompt` plus the analyst's own `exampleQueries` when present.
- **The deal, stated plainly** (from `self_use.note`): *"Using your own agent is free (up to {daily_cap} consults/day). It pays standard rates only when it researches beyond your own knowledge — other experts' graphs, earnings data, market intelligence."*
- **Status-aware nudge**: if status is not Active yet, say the agent is in review and the connector will work the moment it's approved — let them set the connector up NOW so approval day is activation day.

### 4. Out of scope
Usage stats/earnings dashboards (separate app-side work), editing the profile, embed/share links for clients (future brief).

## Vocabulary
"Your agent" / "Human Agent" for the persona; "self-use" for the free-owner-usage concept. Match the API's wording — don't invent new terms on this page.

## Testing
1. Piers's key → renders `piers-fawkes-psfk` with connect block; copy buttons work.
2. A key with no analyst → 404 state with join CTA.
3. Garbage key → 401 state.
4. Page works logged-out (key-paste path) — experts will land here from email.

## Priority
P1 — the API side is fully live; this page is the missing front door. Small build: one page, one API call, four states.
