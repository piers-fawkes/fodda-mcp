# Brief: MCP P0 Surface Audit Fixes

> **Type:** `[x] Cross-Cutting Issue` · `[x] Bug Fix`
> **Priority:** `[x] P0 — Blocker` (item 1 `owner_email` is a live PII leak — ship today, ahead of the rest)
> **Agent(s):** MCP agent (primary, `fodda-mcp` repo) · API agent (secondary, root-cause fixes in `functions/v1/`)
> **Source:** Live surface audit via Claude connector, 2026-06-11. See `fodda-mcp-fix-spec.md` (repo root) for the full spec; this brief covers **P0 items 1–6 only**.

---

## 1. Objective

`list_graphs` (883KB / ~220K tokens) and `search_graph` (233KB / ~58K tokens for 10 rows) blow past most MCP clients' context budgets, leak private/CMS fields, and return inconsistent routing metadata. This brief hands the MCP agent the six P0 fixes needed to make the surface safe and usable, with the exact call sites already located. **Item 1 contains a live security leak** — three personal Gmail addresses (`owner_email`) are exposed to every caller — and must ship independently and immediately, not wait for the full P0 branch.

## 2. Persona & System Instructions

N/A — no new agent or system-prompt change. This is a fix to existing tool handlers.

---

## 3. Architecture note — where the data actually comes from (READ FIRST)

Both `list_graphs` and `get_my_account` call `foddaRequest('GET', '/v1/graphs', …)` and pass the backend response through **≈1:1** to the MCP client. The bloat/PII fields (`owner_email`, `blog_post_content`, etc.) **originate in the API**, not in this repo.

That gives two layers of fix, and the agents managing each repo should do both:

| Layer | Repo | Role | Speed |
|:------|:-----|:-----|:------|
| **MCP allowlist serializer** | `fodda-mcp` | Filters fields on the way out. **This is the security containment and the only thing that ships today.** | Fast — one PR |
| **API serialization** | `functions/v1/` | Stop emitting PII/CMS fields at source so other consumers (App, Website, A2A) are also protected. | Follow-up |

**Do not block the MCP allowlist on the API change.** The MCP layer must not trust the API to be clean — add the allowlist regardless. The Airtable row schema must never pass through 1:1.

---

## 4. The six P0 fixes

All line numbers are `src/toolHandlers.ts` unless noted, against the audited revision — re-grep to confirm before editing.

### Item 1 — Strip private/CMS fields from `list_graphs` 🔴 SHIP TODAY
**Where:** `list_graphs` handler, ~`toolHandlers.ts:446`. Currently `JSON.stringify(data)` of the raw `/v1/graphs` response (only mutation is injecting `agent_prompt` into `description`).
**Change:** Add an explicit **allowlist serializer** that maps each `data.graphs[i]` to routing-relevant fields only. **Remove** from the serialized output: `owner_email`, `owner_account_id`, `blog_post_content` (~100KB, 22% of payload), `blog_post_title`, `blog_post_query`, `blog_post_status`, `what_it_does`, `key_features`, `for_teams_like`, `how_to_access`, `what_contains`, `by_the_numbers`, `portrait_url`/`icon_url` (expiring Airtable signed URLs), `mcp_url`, `skill_phase`, `skill_tool_name`, `content_ownership`.
**Keep (allowlist):** `graph_id`, `name`, `one_liner`/`description` (with the `agent_prompt` routing injection preserved), `curator`, `domain`, `graph_type`, `trend_count`, `evidence_count`, `status`, `last_updated`. (Same allowlist P1 item 7 will formalize.)
**Hotfix carve-out:** the security-critical subset is `owner_email` + `owner_account_id`. Ship those two stripped **first**, as a minimal standalone PR, even if the full allowlist lands later.

### Item 2 — Fix `get_my_account` rendering bugs
**Where:** handler ~`toolHandlers.ts:364`, status object built ~`:400–431`.
- **`profile.name`** (`:417`) returns the Airtable record id `"recZ1FemUPoLtuIuF"`. Resolve to the human name. If the API doesn't return a human name in `_account.profile`, the **API agent** must add it; meanwhile the MCP layer should detect the `^rec[A-Za-z0-9]{14}$` pattern and omit `profile.name` rather than show the raw id.
- **`upgrade_offer`** (`:423–429`) renders `{"price":"$0","action":"Upgrade to undefined"}`. **Probe-confirmed root cause:** the API's `_account.upsell` is `{plan:"TOP UP — 200 Tokens", price:0, link, plan_code:"7"}` — there is **no `name` field** (the code reads `upsell.name` → `undefined`) and `price` is `0`. Read `upsell.plan` (not `upsell.name`), and only emit the block when a real offer exists (`upsell.plan` present **and** `upsell.price > 0`); omit entirely otherwise. No `undefined`/`$0` strings anywhere.
- **`graphs_enabled`** (`:413`) ships the full ~210-item array. Replace with `graphs_enabled_count` (number) + `"see list_graphs"`.

### Item 3 — Cap `search_graph` row bloat ⚠️ touches widget rendering — see §5
**Where:** per-row normalization ~`toolHandlers.ts:703–725`.
- `brandNames` + `place` = 86% of payload, shipped as single concatenated strings up to 28.8KB. Return **arrays capped at top 10**, plus `brand_count` / `place_count` totals. (`brandNames` is pipe-`|`-delimited; `place` is comma-delimited at source.)
- **Dedupe aliased fields** (byte-identical today): keep ONE of `trendDescription`/`description`/`summary`; ONE id — keep `node_id`, drop `trendId`; ONE score — keep `relevance_score`, drop `_score`/`semantic_score`/`score`.
- **Target ≤2KB/row.**

### Item 4 — `include_evidence: true` (default) returns zero evidence → **this is an MCP-layer bug, not the API**
**Probe finding (important):** a direct API call (`POST /v1/graphs/retail/search`, `include_evidence:true`, same repro query) returns evidence correctly — `evidence: array[28]` on row 0, **10/10 rows non-empty, 152 items total, matching `evidenceCount`**. So the API is fine; the evidence is being **dropped/not-attached inside the MCP**. Do **not** send this to the API agent.
**Where:** param default `:512`, passed to API `:526`; per-row normalization `:703–725`; `enrichEvidence()` in `src/enrichment.ts`. The `evidence` array arrives from the API but is lost before output — likely the normalization map omits the `evidence` field, or `enrichEvidence` throws/returns empty.
**Change:** Trace the row mapping at `:703–725` and ensure the inline `evidence[]` (with `formatted_citation` from `enrichEvidence`) survives to the response. **No silent broken promises:** if for some reason evidence can't be attached, add an explicit `evidence_status` field stating why — but the expected outcome here is "evidence now flows through," since the API already provides it.

### Item 5 — Ghost tool reference (trivial)
**Where:** single constant `GRAPH_ID_DESC` at `toolHandlers.ts:160` says "Use `list_available_graphs`". It feeds 5 tools (`get_node`, `get_evidence`, `get_neighbors`, `discover_adjacent_trends`, +1) via `:948,:984,:1014,:1043,:1069`.
**Change:** `list_available_graphs` → `list_graphs`. One-line edit fixes all five. Acceptance grep must return 0 hits repo-wide.

### Item 6 — Routing integrity
**Where:** `_routed_graphs` set at `:682` from `graphsToSearch.map(g => g.graph_id)` (the router's *intent*); `_attribution` ~`:734`; deprecated-graph aliasing (`psfk` → `retail`) ~`:532,:702`.
**Change:**
- `_routed_graphs` = **actual** `set(rows[].graphId)` of returned rows, not the router's candidate list.
- `_attribution` must cover **all** source graphs by display name, not just the primary.
- **Exclude deprecated graphs from the router** (`psfk` deprecated; don't serve `tech`/`food` rows to callers without them enabled). Cross-check returned `graphId`s against the caller's enabled list.

---

## 5. ⚠️ Widget-rendering coupling (item 3 — do not skip)

Changing `brandNames`/`place` from strings to arrays touches the widget pipeline. Audit findings:
- `normalizeBrands()` in `src/searchTemplate.ts:53` **already accepts string OR array** — arrays render fine. ✅
- **`place.split(',')` at `toolHandlers.ts:781`** (geographic-bias detection) **will throw if `place` becomes an array.** Must be updated to handle arrays. 🔴
- `src/skillClient.ts:394` and several `brandNames.split('|')` sites (`:1167,:1262,:1349,:1352,:1387,:1427`) guard with `typeof === 'string'` and fall back to array — safe, but verify.
- `brandTemplate.ts:363/:459` consume `place` as a single string from a *different* source (`geographic_distribution[].place`), not the search row — leave as-is.

**Add widget tests to the acceptance run:** assert `searchTemplate` renders correctly for both the old string shape and the new array shape, and that the geo-bias path at `:781` handles arrays. There is currently **no test coverage** asserting field shape (`src/test_skills.ts` has fixtures but no assertions).

---

## 6. Safety Policy

```python
from google.antigravity.hooks import policy

policies = [
    policy.deny_all(),
    policy.allow("view_file"),
    policy.allow("edit_file"),
    policy.allow("grep"),
    policy.ask_user("run_command"),      # build / test / git require confirmation
    policy.deny("mcp_fodda_mcp_*"),      # do NOT call live MCP tools with prod keys during dev
]
```

Never commit a real `FODDA_API_KEY` or any `sk_live_*` value to the repo. Obtain a trial/dev key out-of-band and keep it in a gitignored `.env` only.

## 7. Testing Plan

- [ ] **Refactor serializers into pure functions** (`serializeGraphList(raw)`, `serializeSearchRow(raw)`) so before/after byte sizes can be measured deterministically off a captured payload — no live key required for the unit layer.
- [ ] Grep: `owner_email|owner_account_id|blog_post` not present in any serialized MCP response. → 0 hits
- [ ] Grep: `list_available_graphs` repo-wide → 0 hits
- [ ] `list_graphs` ≤25KB; `search_graph` default ≤25KB / 10 rows; ≤2KB/row
- [ ] `include_evidence: true` returns ≥1 evidence item with `formatted_citation`, **or** an explicit `evidence_status` reason
- [ ] `get_my_account`: human `profile.name` (or omitted if unresolved); no `undefined`/`$0` strings; `graphs_enabled_count` not the array
- [ ] `_routed_graphs` equals actual source graphs of returned rows; no deprecated graphs served
- [ ] **Widget:** `searchTemplate` renders for both string and array `brandNames`/`place`; geo-bias `:781` handles arrays
- [ ] Edge case: graph row missing all allowlisted optional fields → serializer emits valid object, no crash

### Measurement harness & confirmed baselines
A read-only probe harness already exists at **`scratch/probe_api.mjs`** (run: `node --env-file=.env scratch/probe_api.mjs`). It replicates the exact `foddaRequest` HMAC signing and prints **aggregates only** (sizes, field presence, counts) — no PII persisted. Use it for before/after. It needs a real `FODDA_API_KEY` **and** `FODDA_MCP_SECRET` in a gitignored `.env` (the API rejects unsigned requests). `graph_profiles.json` in the repo is the wrong (older, camelCase) shape — do not use it as a fixture.

**Confirmed baselines from the 2026-06-11 probe** (compact JSON; the MCP pretty-prints with 2-space indent, inflating to roughly the audit's 883KB/233KB):

| Surface | Measured (compact) | Key facts |
|:--------|:-------------------|:----------|
| `GET /v1/graphs` | **645.2KB**, 210 graphs | `owner_email` on 37/210 (**3 distinct emails**); `blog_post_content` 94.9KB (15%); `_account.profile.name`=`"recZ1FemUPoLtuIuF"`; `_account.upsell`=`{plan,"price":0}`; `graphs_enabled`=210 |
| `POST /v1/graphs/retail/search` (`include_evidence:true`, repro query) | **161.8KB**, 10 rows | `brandNames` up to 1428 chars; `place` up to 504 chars; `evidence` array[28] on row 0, **10/10 rows populated, 152 items total** (API evidence works); row `graphId`s = `["psfk","food"]` (deprecated/cross-graph leak) |

**Refactor serializers into pure functions** (`serializeGraphList(raw)`, `serializeSearchRow(raw)`) so the same probe payloads can be run through old vs new path for deterministic before/after.

## 8. CHANGELOG Entry

```
### Security
- list_graphs: strip owner_email / owner_account_id and all CMS fields via explicit allowlist serializer (was leaking 3 personal emails to all callers)

### Changed
- list_graphs: ~883KB → ≤25KB via routing-field allowlist
- search_graph: cap brandNames/place to top-10 arrays + counts; dedupe aliased id/score/description fields (~2KB/row)
- get_my_account: resolve profile.name, fix upgrade_offer interpolation, replace graphs_enabled array with count
- search_graph: _routed_graphs now reflects actual source graphs; exclude deprecated graphs from router

### Fixed
- Tool descriptions referenced non-existent `list_available_graphs` → `list_graphs`
- include_evidence now returns evidence or an explicit evidence_status reason
```
