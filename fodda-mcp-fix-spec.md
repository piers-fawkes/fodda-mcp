# Fodda MCP — Fix Spec (from live surface audit, 2026-06-11)

Source: live audit via Claude connector. Repro calls: `get_my_account`, `list_graphs`, `search_graph(query="small format curated retail concepts")`, `get_node(graphId="retail", nodeId="1")`, `brainstorm_topic(query="neighborhood retail", depth=1)`.
Baseline measurements: `list_graphs` = **883KB (~220K tokens)**, default `search_graph` = **233KB (~58K tokens)** for 10 rows. Both exceed most MCP clients' context budgets.

## P0 — Security & correctness (ship first)

1. **Strip private/CMS fields from `list_graphs`.** Remove from API serialization: `owner_email` (3 personal Gmail addresses currently exposed to all callers), `owner_account_id`, `blog_post_content` (100KB, 22% of payload), `blog_post_title/query/status`, `what_it_does`, `key_features`, `for_teams_like`, `how_to_access`, `what_contains`, `by_the_numbers`, `portrait_url`/`icon_url` (expiring Airtable signed URLs), `mcp_url`, `skill_phase`, `skill_tool_name`, `content_ownership`. Keep routing-relevant fields only. The Airtable row schema must not pass through 1:1 — add an explicit allowlist serializer.
2. **Fix `get_my_account` rendering bugs.** `profile.name` returns the Airtable record ID `"recZ1FemUPoLtuIuF"` — resolve the join to the human name. `upgrade_offer` returns `{"price": "$0", "action": "Upgrade to undefined"}` — fix template interpolation; omit the block entirely when no upgrade applies. Replace the 210-item `graphs_enabled` array with `graphs_enabled_count` + `"see list_graphs"`.
3. **Cap `search_graph` row bloat.** `brandNames` + `place` = 86% of payload, shipped as single strings up to 28.8KB. Return arrays capped at top 10 + `brand_count`/`place_count` totals. Dedupe aliased fields: keep ONE of `trendDescription`/`description`/`summary` (byte-identical today), ONE id (`node_id`; drop `trendId`), ONE score (`relevance_score`; drop `_score`/`semantic_score`/`score`). Target ≤2KB/row.
4. **`include_evidence: true` (default) returns zero evidence.** Field absent despite `evidenceCount` up to 1,286. Fix the batch fetch, or default false and correct the tool description. No silent broken promises.
5. **Ghost tool reference.** Descriptions for `get_node`, `get_evidence`, `get_neighbors`, `discover_adjacent_trends` say "Use `list_available_graphs`" — tool is `list_graphs`. Grep and fix all occurrences.
6. **Routing integrity.** Rows returned from graphs `tech`/`psfk`/`food` (psfk deprecated; tech/food not in caller's enabled list) while `_routed_graphs` claimed 15 different graphs and `_attribution` said only "Data sourced from tech". Make `_routed_graphs` = actual `set(rows[].graphId)`, `_attribution` cover all source graphs by display name, and exclude deprecated graphs from the router.

## P1 — Architecture

7. **Tiered discovery.** `list_graphs` returns only: `graph_id`, `name`, `one_liner`, `curator`, `domain`, `graph_type`, `trend_count`, `evidence_count`, `status`, `last_updated`. Target ≤25KB total for 210 graphs. New tool `get_graph(graph_id)` returns the full profile on demand. Also: enabled-graph list currently duplicated 3× per response (`graphs[]`, `plan_info.accessible_graphs`, `_account.graphs_enabled`) — return once.
8. **One naming convention.** snake_case everywhere: `graphId→graph_id`, `nodeId→node_id`, `for_node_id`/`trend_id`→`node_id`, `seed_node_ids`→`node_ids`. Accept legacy names server-side (silent alias) for a deprecation window.
9. **Unified response envelope, all 46 tools:** `{ data, _meta: {request_id, credits_used, credits_remaining, routed_graphs, attribution, version}, _affordances: {next_prompts: [{label, prompt, type}], render_rules: [...] } }`. Today search uses `_render_instructions` + typed prompt objects while brainstorm uses `_presentation_hint` + flat strings — standardize on the search schema.
10. **`brainstorm_topic` fixes.** `graph_id: "retail,food,travel"` is a comma-joined string → return array. `key_brands`/`geographic_hotspots` return empty (`brands_identified: 0`) despite graph holding brand data — fix extraction. Normalize `signal_score` (7109 and 98 appear on the same scale in one response).

## P2 — Polish & growth

11. Quota in every `_meta`; warn below 10%; out-of-credits error must point to `sign_up_free_account` / upgrade link.
12. Ship 2–3 MCP **prompts** (e.g. `fodda-brand-deep-dive`, `fodda-trend-brief`) encoding list→search→evidence choreography.
13. Dedupe near-identical nodes (search rows 1–2; brainstorm node pairs 6500/6570 and 6560/6669 have identical descriptions).
14. Centralize defensive copy: remove the repeated "Node IDs are NOT sequential" warning and 15-item graph-ID example lists from tool descriptions; keep teaching via errors (the `get_node` 404 message is the model — preserve it).

## Acceptance criteria (verify by re-running the repro calls)

- [ ] `list_graphs` ≤25KB; `search_graph` default ≤25KB/10 rows
- [ ] `grep -r "owner_email\|owner_account_id\|blog_post" <serializers>` → not in any API response
- [ ] `grep -r "list_available_graphs"` in tool descriptions → 0 hits
- [ ] `include_evidence: true` returns ≥1 evidence item with `formatted_citation`, or an explicit `evidence_status` reason
- [ ] `get_my_account` → human `profile.name`; no `undefined`/`$0` strings anywhere
- [ ] `_routed_graphs` equals actual source graphs of returned rows; no deprecated graphs served
- [ ] All params snake_case; legacy camelCase still accepted
- [ ] `brainstorm_topic` returns `graph_id` arrays and non-empty `key_brands` for brand-rich topics
