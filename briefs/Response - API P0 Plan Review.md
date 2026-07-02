# Response — API P0 Plan Review (from the MCP side)

Reviewed the API agent's `implementation_plan.md`. The plan is solid and the allowlist-not-blocklist instinct is right. But `/v1/graphs` is a **shared endpoint** (MCP server **and** the App/Website read it), and the plan's allowlist mirrors what the *MCP output* needs — not what the *MCP server itself* and the App **consume**. Three cross-layer issues below, verified against the MCP repo with file:line evidence, plus answers to the three open questions.

---

## 🔴 BLOCKING — §1 removes `skill_phase`, which the MCP needs to route skill-graphs

The plan lists `mcp_url`, `skill_phase`, `skill_tool_name` under "internal routing → remove." But two of those are read by the **MCP server's** skill-routing logic, from the cached `/v1/graphs` response:

- **`skill_phase` — actively used.** `getEnabledSkillConfigs()` at `src/catalogCache.ts:210` and `src/toolHandlers.ts:227` read `g.skill_phase` to decide whether a skill runs in the `output` or `research` phase. If the API stops sending it, every skill silently defaults to `output` → **research-phase skills are mis-routed.** **Keep `skill_phase` in `/v1/graphs`.**
- **`skill_tool_name`** — currently only in the MCP's type interface (`catalogCache.ts:53`), no active read found. Probably safe to remove, but confirm with a fresh grep before doing so.
- **`mcp_url` — safe to remove.** ✅ The MCP comments confirm it's deprecated ("Skills route through the Core API now — mcp_url is no longer required", `catalogCache.ts:201`, `toolHandlers.ts:220`).

**Action:** move `skill_phase` from the "excluded" list to the "kept" list. It's not user-facing PII — it's functional routing metadata the MCP depends on.

## 🟠 §1 — `/v1/graphs` is shared with the App; don't blanket-remove display fields in P0

The allowlist removes `portrait_url`, `what_it_does`, `key_features`, `by_the_numbers`, `for_teams_like`, `how_to_access`, `what_contains` alongside the PII. For the **MCP** that's fine — those are typed but not rendered (`portrait_url`/`icon_url` appear only in the `catalogCache.ts` interface, no active use). **But the App gallery almost certainly renders portraits + marketing copy from this same endpoint.** Removing them P0 — before the detail endpoint exists (open Q1) — risks breaking the gallery.

**Recommended split:**
- **Remove now (zero user-facing risk):** `owner_email`, `owner_account_id` (PII), `blog_post_*` (unpublished drafts), `content_ownership`, `mcp_url`. This is the real P0 / ship-today set.
- **Remove only once the detail endpoint serves them (with App updated to read it):** `portrait_url`, `icon_url`, `what_it_does`, `key_features`, `by_the_numbers`, `for_teams_like`, `how_to_access`, `what_contains`.

Before removing the second group, grep the **App + Website** repos for these field names (I can only see the MCP repo). If the gallery list view needs `portrait_url` for thumbnails, even the lean list may need to keep it.

## 🟠 §5 — field dedup is coupled to the live MCP; don't hard-delete in the same release

The plan deletes `trendDescription`, `trendId`, `evidenceCount`, `_score` from search rows. **The MCP search normalizer reads all of these** — `src/toolHandlers.ts` (node_id/summary/score fallback chains), `src/searchTemplate.ts`, `src/brandTemplate.ts`, `src/enrichment.ts`, `src/skillClient.ts` (also `semantic_score`). If the API deletes them before the MCP's item-3 rewrite ships, **the live MCP loses node ids, descriptions, scores, and evidence counts.**

**Action:** keep the aliases through a deprecation window (the API already keeps the canonical fields alongside them — just don't `delete` yet), **or** gate deploy order: MCP item 3 ships reading canonical fields first, *then* the API removes the aliases. Either way, §5 deletion must **not** land while a still-old MCP is in production. The plan flags §5 as "P1 alongside §3" — good; just make the consumer-coupling explicit so it isn't deployed early.

> ⚠️ **Cross-plan gap — `evidenceCount` specifically.** I've now reviewed the MCP team's implementation plan. Its Item 3 migrates *most* aliases to canonical (`node_id`, `relevance_score`, `summary` from `description`/`trendDescription`, drops `_score`/`semantic_score`/`trendId`) — but it does **not** migrate `evidenceCount → evidence_count`, and the MCP reads `evidenceCount` in **5 files** (`toolHandlers.ts`, `searchTemplate.ts`, `brandTemplate.ts`, `enrichment.ts`, `skillClient.ts`). So of the four fields §5 deletes, three are covered by the MCP rewrite but **`evidenceCount` is not.** Concretely: **keep `evidenceCount` until the MCP migrates its reads to `evidence_count`** (the MCP review now calls this out on their side). The other three (`trendDescription`, `trendId`, `_score`) are safe to drop once MCP item 3 ships.

---

## Answers to the open questions

1. **Detail endpoint now vs P1** → P1 is fine. The MCP's planned `get_graph(graph_id)` (P1 item 7) is the natural consumer for the rich profile (`what_it_does`, `key_features`, `by_the_numbers`, portraits). Defer the endpoint — **but** that's exactly why the display-field removal in §1 must be deferred with it (see 🟠 above). PII removal does **not** wait for the detail endpoint.
2. **`Account Owner` Lookup field** → That Airtable change is on Piers, not codeable from either agent — base `appXUeeWN1uD9NdCW`, table `Credits`. Create a Lookup field (e.g. `Account Owner Name`) resolving the linked record's display name; the plan's fallback + `/^rec[A-Za-z0-9]{14}$/` guard is sound and matches the MCP brief's recommendation. **Until that field exists, the guard returning `null` is the correct behavior** (better a null name than a `rec…` id).
3. **Deprecated graphs** → `psfk` + `waldo` is the complete known set — it matches the MCP's own deprecation notice (`list_graphs` description) and the MCP's existing `psfk → retail` aliasing (`toolHandlers.ts:532`, `:702`). A configurable constant is the right call. No others to add.

---

## Confirmed good alignment (no change needed)

- Allowlist **keeps `agent_prompt`** ✅ — the MCP injects it into `description` as a `[ROUTING INSTRUCTION]`. Don't drop it.
- Allowlist **keeps `graph_type` / `graph_sub_type` / `available_as`** ✅ — the MCP uses these to *identify* skill/domain/expert graphs. Skill identification survives; only `skill_phase` (the routing detail) was at risk.
- `_account.upsell` fix (suppress when `price === 0`, add `name` alias) exactly matches what the MCP brief asked for — the MCP guard becomes belt-and-suspenders. ✅

**Net:** ship the PII + drafts removal today; hold the display-field removal and the §5 alias deletion for coordinated releases; keep `skill_phase`. The rest of the plan is good to go.
