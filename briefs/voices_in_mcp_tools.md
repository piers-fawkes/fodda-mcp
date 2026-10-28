# Brief (MCP Agent) — Voices in MCP tools

**Owner:** `mcp-agent` · **Repo:** Fodda MCP · **Execute:** `/build-from-brief briefs/voices_in_mcp_tools.md`
**Depends on:** `Fodda API/briefs/Brief - Voices in API responses (Voice Phase 2 API).md` being deployed. Check that `voices[]` is present in live responses before starting.
**Contract:** `Fodda API/Fodda/docs/contracts/voice.md`

## Context

The API now returns sourced third-party voices (`Voice`: quote, quote_kind, claim, speaker{name,title,org,type}, source, verified, license, stance, angle, display{quotable, attribution}):
- `voices[]` on graph search rows;
- `voices[]` on evidence, with `view: articles|voices|both`;
- `voice` on each quote result from `/v1/statistics`;
- `voices[]` on the dossier and domain search;
- `perspective` on consult responses, for labelled agent output.

The MCP tools neither pass these through nor tell the model how to render them. Today `search_insights` returns article-clone "quotes" with no speaker.

House rule: one tool with a `view` param beats more tools (pattern: `get_company_earnings` `view`, toolHandlers.ts ≈5397). **Add no new tools.**

## What to build

1. **`get_evidence` (≈3008).**
   - Add `view: z.enum(['articles','voices','both']).default('both')` and pass it to `POST /v1/graphs/{id}/evidence`.
   - Render `voices[]` as a separate `voices` block in the result.
   - Update the description to say it returns supporting articles **and** sourced voices: what executives, analysts and commentators said about the trend, labelled supports / challenges / nuances.
2. **`search_insights` (≈5024).**
   - Add optional `speaker_types` and `stance` params and pass them through.
   - Return each result's `voice` object.
   - Keep `types` defaulting to `'quote,interpretation'`.
   - Update the description so it names speaker, claim and stance.
3. **`search_graph` (≈2113).** Pass `voices[]` through on each trend row. Add `include_voices` (default true) for callers that want a lighter payload. The widget HTML path may ignore voices for now.
4. **`get_intelligence_dossier`.** Pass `voices[]` through next to the existing fields.
5. **`consult_analyst` / `consult_human_agent` (≈7717 / 7770).**
   - Put the API's `perspective` object into `structuredContent`.
   - Add a line to the text output that labels the response as the agent's perspective, using `perspective.label`.
6. **Rendering guidance in tool descriptions.** Keep it to one sentence each, because tool descriptions cost context:
   - "Put a voice in quotation marks only when `display.quotable` is true; otherwise paraphrase it with `display.attribution`."
   - "A consult `perspective` is the agent's view, never a quote from the real person."
7. **Formatting.** In `enrichEvidence` / `rankAndFilterEvidence`, give voices their own path. Do not run them through article ranking, and do not merge them into `evidence[]`.

## Where to register
- `CHANGELOG.md`.
- `npm run build`, which syncs Airtable descriptions, then the tools manifest, then runs tsc.
- Deploy with `deploy_cloud_run.sh` (`fodda-mcp`, us-east4).
- Bump the version and publish with `scripts/publish_registry.sh` once Piers OKs it.

## Definition of Done
- [ ] Tests (alongside `test_search_graph_quality.ts` / `test_credibility_anchors.ts`) cover:
  - `get_evidence` with `view=articles` matching today's output;
  - `view=voices` returning only voices;
  - `search_insights` results carrying `voice.speaker.name`;
  - consult `structuredContent.perspective` being present.
- [ ] Live check against the deployed MCP: one `get_evidence`, one `search_insights` and one `consult_human_agent` call. Paste the trimmed outputs into the CHANGELOG.
- [ ] The tool count is unchanged.
- [ ] No description contains a price, "tokens" or "SPT". `sync-descriptions-from-airtable.mjs` still strips prices.

## Do Not
- Do not add new tools.
- Do not put voices into `evidence[]`, or perspectives into voices.
- Do not render a `quotable: false` voice in quotation marks in any formatted text the MCP produces.
- Do not publish to the registry without Piers's OK.
