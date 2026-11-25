# Rule — ChatGPT plugin listing & OpenAI continuous scanner (live since 2026-09-25)

Fodda is a published ChatGPT plugin managed at **https://platform.openai.com/plugins**:
https://chatgpt.com/plugins/plugin_asdk_app_6a997b8bb20881918d0413051bb6f9c5
("Brand, market & earnings intel"). It points at `https://mcp.fodda.ai/chatgpt`, which is
`OFFERING_SCOPED_TOOLS.chatgpt` in `src/index.ts`: 29 tools, OAuth via `clerk.fodda.ai`.

## 1. Live Contract & Continuous Review (`live` vs `held`)
- OpenAI maintains a `"live"` snapshot of all 29 tools and `server_instructions`, and runs **Continuous Tool Review** (`MCPs -> Issues -> Rescan` at `https://platform.openai.com/plugins`, plus daily scans via `chatgpt-review@fodda.ai`).
- Passing tool updates and new tools auto-promote directly to `"live"` (~2s `initialize` + `tools/list` scan) without uploading a new ZIP. Flagged items stay in `"held"` while `"live"` continues serving users.
- **Do NOT submit a manual appeal ("Request a manual review")** for metadata/schema holds: appeals **pause all automated MCP scans**, put the server in a slow human queue, and do not cover `server_instructions`. Fix the trigger on the server, deploy, and click **Rescan** instead.
- **Never** rename or remove a `/chatgpt` tool, remove or rename an existing `"live"` parameter, make an optional parameter required, or change a parameter's type. Additive optional params are OK.
- **Never** add/remove a tool on `/chatgpt` or change existing `"live"` annotations (`readOnlyHint`, `openWorldHint`, `destructiveHint`, `idempotentHint`) without Piers's approval.

## 2. OpenAI Automated Scanner Guardrails (`/chatgpt`)
- **Zero age-restricted / 18+ examples (Guideline 3.2 — 13–17 general audience):** Never use `'Alcoholic Drinks'`, `'alcoholic beverage'`, alcohol, wine/spirits, tobacco/vapes, cannabis, or gambling examples in tool or parameter descriptions (use `'Beverages'` / `'specialty beverage'`).
- **Zero circumvention phrasing (Guideline 3.5.c):** Never write `"bypasses"` (e.g. `"bypasses graph IDs"`) in descriptions; write `"scopes ... to"`.
- **Strict `readOnlyHint` / `openWorldHint` alignment (Guideline 6.3):**
  - Tools with `readOnlyHint: true` must never describe themselves as a `"generator"`, use `"upload"` / `"publish"`, or expose newsletter-publishing params (`publication_name`, `publication_style`, internal house-style enums) on `/chatgpt`.
  - Tools with `openWorldHint: true` must explicitly name the external public feeds they read (`FRED, BLS, US Census`, `Google Trends`, `Wikipedia`, `SEC filings`).
- **`server_instructions` hygiene (`src/systemPrompt.ts`):**
  - Keep `userContextBlock` and `personaBlock` suppressed when `isScopedConnector` is true (`chatgpt` / `claude`) so reviewer-account profile/client data never leaks into public `server_instructions`.
  - Never include `pricing`, competitor names (`Claude`), unsolicited routing hijacks (`PROACTIVE ROUTING RULE`, `BEFORE any graph search`, `TURN 1`, `MUST chain`), or anti-transparency bans (`NEVER leak raw internal tool names`). Keep `/chatgpt` `server_instructions` byte-identical to the approved `"live"` text unless intentionally changing it.
- **Commerce silence:** `/chatgpt` stays 100% commerce-free — no pricing, `$` amounts, Stripe/billing links, SPT/tokens, upsells, or runtime overage notices (`appendOverageNoticeToContent` must check `sessionSource !== 'chatgpt'`).
- **Build-time description sync:** Keep OpenAI-hardened tools (`get_capabilities`, `get_intelligence_dossier`, `generate_comms_plan`, `search_graph`, `search_insights`, `search_statistics`) in the skip-list in `scripts/sync-descriptions-from-airtable.mjs` so `npm run build` never overwrites sanitized `/chatgpt` copy.

## 3. Auth, Reviewer Account & Pre-Deploy Verification
- Unauthenticated `initialize` on `/chatgpt` must return `401` + `WWW-Authenticate` (RFC 9728). Keep `/.well-known/openai-apps-challenge` serving.
- Keep `chatgpt-review@fodda.ai` funded, password sign-in enabled (no MFA/OTP), OAuth scan authorization connected in the OpenAI portal, and excluded from sales/retention automations.
- Before any deploy touching `src/index.ts`, `src/systemPrompt.ts`, `src/toolHandlers.ts` schemas, or auth: run `npm run build && node scripts/test_chatgpt_live.mjs` and verify all 29 `/chatgpt` tools pass.
