# Rule — ChatGPT plugin listing (live since 2026-09-25)

Fodda is a published ChatGPT plugin:
https://chatgpt.com/plugins/plugin_asdk_app_6a997b8bb20881918d0413051bb6f9c5
(listing v1.0.1, "Brand, market & earnings intel"). It points at `https://mcp.fodda.ai/chatgpt`, which is
`OFFERING_SCOPED_TOOLS.chatgpt` in `src/index.ts`: 24 tools, OAuth via clerk.fodda.ai.

OpenAI approved a **snapshot** of those 24 tools: names, input schemas, annotations and descriptions.
Server-side changes don't update the approved listing; they only take effect after resubmission and review.
Breaking the live contract makes calls fail inside ChatGPT for every installed user.

- **Never** rename or remove a `/chatgpt` tool, remove or rename a parameter, make an optional parameter
  required, or change a parameter's type. Additive optional params are OK.
- **Never** add a tool to the `/chatgpt` profile, or change its annotations (`readOnlyHint`,
  `openWorldHint`, `destructiveHint`), without Piers approving a listing resubmission.
- **Descriptions:** `npm run build` syncs descriptions from Airtable Offerings for ALL tools, including
  these 24. A description change is harmless to the live listing (the approved snapshot keeps the old one),
  but note it in CHANGELOG as "pending ChatGPT resubmission".
- `/chatgpt` stays commerce-free: no pricing, checkout, SPT or upsell text in these tools' output.
- Unauthenticated `initialize` on `/chatgpt` must return 401 + `WWW-Authenticate` (RFC 9728). Keep
  `/.well-known/openai-apps-challenge` serving.
- The reviewer account `chatgpt-review@fodda.ai` must stay funded, password sign-in working, and sample data intact.
  OpenAI can re-test at any time. Keep it off sales and retention automations.
- Before any deploy that touches `src/index.ts` profiles, `src/toolHandlers.ts` schemas or auth: run
  `scripts/test_chatgpt_live.mjs` (or an equivalent `tools/list` diff against the 24-tool snapshot) and paste the result.
