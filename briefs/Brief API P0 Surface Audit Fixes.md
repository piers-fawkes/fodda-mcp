# Brief: API Changes for P0 Surface Audit (PII, Account Join, Routing)

> **Type:** `[x] Cross-Cutting Issue` · `[x] Bug Fix` · `[x] Security`
> **Priority:** `[x] P0 — Blocker` (PII leak)
> **Agent(s):** API agent (`functions/v1/`, `graphService.ts` and the `/v1/graphs` handler)
> **Companion brief:** `briefs/Brief MCP P0 Surface Audit Fixes.md` (MCP-layer fixes). Read both — the split between layers matters.
> **Source:** Live surface audit 2026-06-11, re-confirmed by direct API probe on 2026-06-11 (numbers below are measured, not estimated).

---

## Why this brief exists

The MCP server passes the `/v1/graphs` response through ≈1:1, so several audit problems originate **in the API** and affect every consumer (MCP, App, Website, A2A), not just Claude. The MCP layer is adding an allowlist serializer as immediate containment, but that does **not** fix the source. This brief is the source-level work for the API agent.

**Probe method (for reproduction):** `GET /v1/graphs` and `POST /v1/graphs/retail/search {query:"small format curated retail concepts", limit:10, include_evidence:true}`, signed with `X-API-Key` + HMAC `X-Fodda-Signature` (see `src/index.ts:142` `foddaRequest`), user `piers.fawkes@psfk.com`.

---

## 1. 🔴 P0 SECURITY — `/v1/graphs` leaks owner PII to every caller

**Measured:** the default `/v1/graphs` response serializes the full Airtable row. Confirmed present in the live response:

| Field | Coverage | Note |
|:------|:---------|:-----|
| `owner_email` | 37 / 210 graphs | **3 distinct personal email addresses exposed to all callers** |
| `owner_account_id` | 37 / 210 | internal Airtable account id |
| `blog_post_content` | 61 / 210 | **94.9KB — 15% of the 645KB payload** |
| `blog_post_title` / `blog_post_query` / `blog_post_status` | 61 / 210 | unpublished CMS drafts |
| `what_it_does` / `key_features` / `for_teams_like` / `how_to_access` / `what_contains` / `by_the_numbers` | 94–98 / 210 | marketing CMS copy |
| `portrait_url` / `icon_url` | 152 / 210 | **expiring Airtable signed URLs** (break on rotation) |
| `mcp_url` / `skill_phase` / `skill_tool_name` / `content_ownership` | 1–98 / 210 | internal routing/CMS |

### Required change
Stop serializing internal/CMS/PII fields from the `/v1/graphs` handler. Add an **explicit response allowlist** at the API serialization layer — the Airtable record must not pass through 1:1. Default response fields:

```
graph_id, name, description (with agent_prompt routing text if present),
curator, curator_url, domain, graph_type, graph_sub_type,
trend_count, evidence_count, status, last_updated, webpage_url, accessible/disabled
```

Everything in the table above → **removed from the default response.** If the App needs the rich profile (blog content, key_features, portraits) for gallery pages, expose it behind an **authenticated `GET /v1/graphs/:graph_id` detail endpoint** or a `?view=full` param — never in the list payload, and `owner_email`/`owner_account_id` should not be in any external response at all.

**Impact:** removing `blog_post_content` alone drops ~95KB; the full allowlist takes the list payload from ~645KB toward the ≤25KB target. This also fixes the App/Website which inherit the same leak.

---

## 2. `_account` rendering data is broken at source

Measured `_account` block:
```json
"profile": { "name": "recZ1FemUPoLtuIuF", "company": null, "jobTitle": "JOB", "isProfessionalServices": false },
"upsell":  { "plan": "TOP UP — 200 Tokens", "price": 0, "link": "https://buy.stripe.com/…", "plan_code": "7" }
```

### Required changes
1. **`profile.name` returns the Airtable record id** `recZ1FemUPoLtuIuF` instead of the human name. Resolve the linked-record join and return the actual display name (e.g. "Piers Fawkes"). If the name genuinely isn't set, return `null` — never the `rec…` id. (`jobTitle: "JOB"` also looks like an un-substituted placeholder — verify the profile mapping.)
2. **`upsell` has no `name` field and `price: 0`.** Downstream renders `"Upgrade to undefined"` / `"$0"` because it reads `upsell.name`. Either rename the display field to a consistent `name`/`display_name`, **or** document `plan` as the canonical label. And **don't emit an `upsell` object when there's no real upgrade** (`price: 0` is not an offer) — omit it so consumers can cleanly hide the block.

*(The MCP layer is also being hardened to guard against these — but the API should emit clean data so App/Website don't each reimplement the guard.)*

---

## 3. `/v1/graphs/:graphId/search` serves deprecated & cross-graph rows (routing integrity)

**Measured:** `POST /v1/graphs/retail/search` returned 10 rows whose actual `graphId`s were **`["psfk", "food"]`** — i.e. a search scoped to `retail` returned **zero retail rows**, served **`psfk` (deprecated)**, and served `food` rows the caller may not have enabled.

### Required changes
1. **Exclude deprecated graphs** (`psfk`, `waldo`) from search results entirely — they should never appear in any response.
2. **Respect graph scoping / the caller's enabled list.** A search against `:graphId = retail` should return retail rows (or, if cross-graph fan-out is intentional, only from graphs in the caller's `graphs_enabled`). Returning `psfk`/`food` for a `retail` query is a correctness + access-control issue.
3. Ensure each row's `graphId` reflects its true source graph so the MCP can compute accurate `_routed_graphs` / `_attribution` (those fields are MCP-added and were `undefined` at the API — no API change needed there, but the per-row `graphId` must be trustworthy).

---

## 4. Evidence — NO API CHANGE NEEDED (recorded to prevent a wild-goose chase)

The audit reported `include_evidence:true` returning zero evidence. **The API is fine.** Direct probe of the exact repro query returned `evidence: array[28]` on row 0, **10/10 rows had non-empty `evidence[]`, sum across rows = 152 items**, matching `evidenceCount`. Each evidence item carries the data the MCP needs for `formatted_citation`.

➡️ **The evidence loss is in the MCP normalization layer, not the API.** Tracked in the MCP brief (item 4). No action for the API agent — do not "fix" the evidence fetch; it works.

*(Optional P1, not P0: evidence arrays are large — 28 items × 10 rows ≈ a big chunk of the 162KB search payload. A future `evidence_limit` param or default cap on the endpoint would help context budgets. Not required now.)*

---

## 5. Aliased / redundant fields in search rows (coordinate with MCP item 3)

Measured row 0 carried all of: `trendDescription` **and** `description` (both 667 chars, byte-identical), `trendId` **and** `node_id`, `relevance_score` **and** `_score` **and** `semantic_score`, `evidenceCount` **and** `evidence_count`. The MCP brief dedupes these on output, but the **API emitting one canonical field each** would shrink every consumer's payload and remove ambiguity. Recommended canonical set: `node_id`, `description`, `relevance_score`, `evidence_count`. Treat as P1 unless cheap to land alongside §3.

---

## Verification

- [ ] `GET /v1/graphs` response contains **none** of: `owner_email`, `owner_account_id`, `blog_post_*`, `what_it_does`, `key_features`, `for_teams_like`, `how_to_access`, `what_contains`, `by_the_numbers`, `portrait_url`, `icon_url`, `mcp_url`, `skill_phase`, `skill_tool_name`, `content_ownership`. (Re-run the probe; the "LEAK field" lines must all disappear.)
- [ ] `GET /v1/graphs` default payload materially smaller (drop ≥95KB from `blog_post_content` removal alone).
- [ ] `_account.profile.name` is a human name or `null`, never a `rec…` id.
- [ ] `_account.upsell` absent when `price == 0`; when present, carries a usable display label.
- [ ] `POST /v1/graphs/retail/search` returns no `psfk`/`waldo` rows; row `graphId`s are valid and in-scope.
- [ ] Evidence behavior unchanged (still returns populated `evidence[]`).

## CHANGELOG (API repo)

```
### Security
- /v1/graphs: stop serializing owner_email/owner_account_id and CMS fields (blog_post_*, portraits, marketing copy) via response allowlist — was leaking 3 owner emails + expiring signed URLs to all callers

### Fixed
- _account.profile.name resolved to human name (was Airtable record id)
- _account.upsell omitted when not a real offer; display label normalized
- search: exclude deprecated graphs (psfk/waldo) and out-of-scope rows from results
```
