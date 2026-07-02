# Response — MCP P0 Plan Review (from the audit side)

Reviewed the MCP agent's `implementation_plan.md`. Strong plan — the Item 4 root-cause find (evidence stripped at `toolHandlers.ts:852–859` / `:899–906` on the widget/lite path) is exactly correct and matches the live probe. Items 2 and 5 match the brief precisely. Four issues to address before it ships, one of which reverses a severity call made on a wrong premise. All backed by the 2026-06-11 live probe (`scratch/probe_api.mjs`, `scratch/probe_pii.mjs`).

---

## 🔴 Item 1 — REVERSE the severity downgrade; `owner_email` IS a third-party leak

The plan's top NOTE downgrades Item 1: *"owner_email was likely your own email reflected from the MCP URL, not a third-party PII leak… no emergency hotfix carve-out."* **The probe disproves this.** PII-safe check against `/v1/graphs` with Piers's own key:

```
graphs with owner_email: 37 / 210
distinct owner_email values: 3
  == caller email: 0
  != caller (third-party owners): 3
distinct values by domain: { "gmail.com": 3 }
```

If it were the caller's email reflected from the URL, there'd be **one** value (the caller's) on the accessible graphs. Instead there are **3 distinct personal Gmail addresses, none of them the caller's** — these are graph owners' emails, visible to everyone who lists graphs. **This is a live third-party PII leak.**

**Action:** keep the ship-today carve-out. Strip `owner_email` + `owner_account_id` first (a minimal, independently-mergeable change) even if the rest of P0 lands later. The full allowlist is still correct for payload reduction; just don't let the security fix ride the whole PR's timeline.

## 🔴 Item 3 — the description dedup as written **deletes the description**

The plan says: *"Keep `summary`, delete `description`, `trendDescription`."* But the probe shows raw rows have **no `summary` field** — they carry `description` and `trendDescription` (both 667 chars, byte-identical):

```
trendDescription: 667 chars
description:      667 chars
summary:         absent
```

So "keep summary, delete the other two" drops the only populated fields and keeps a field that doesn't exist → **every row loses its description text.** (The *existing* inline normalizer creates `summary = description || trendDescription`; the new `serializeSearchRow()` must reproduce that, not assume `summary` is already there.)

**Fix:** populate the canonical field from source before dropping aliases —
```typescript
out.summary = row.summary || row.description || row.trendDescription || undefined;
// then drop description / trendDescription
```
And confirm the widget reads the **same** canonical name (`searchTemplate.ts` — verify it reads `summary`, not `description`, or it'll render blank).

**Also add `evidenceCount → evidence_count` to the migration.** The dedup list covers `node_id`/`relevance_score`/`summary` and drops `_score`/`semantic_score`/`trendId` — but not `evidenceCount`. This matters for cross-team coordination: the **API's §5 deletes `evidenceCount`**, and the MCP reads it in **5 files** (`toolHandlers.ts`, `searchTemplate.ts`, `brandTemplate.ts`, `enrichment.ts`, `skillClient.ts`). When the API drops `evidenceCount`, those reads go `undefined` (evidence counts render as 0/blank). Migrate all five to `evidence_count` as part of Item 3 — until then the API has been asked to keep `evidenceCount` alive.

## 🔴 Item 4 — Option A conflicts with Item 3's ≤25KB target

You asked which approach to use. **Neither works as-is** without capping. The probe shows evidence is the bulk of the payload:

```
search payload: 161.8KB / 10 rows
evidence: array[28] on row 0 — 10/10 rows populated, 152 evidence items total
```

Keeping all 152 evidence items inline (Option A) puts the response right back at ~160KB — it **cannot** hit Item 3's ≤25KB / ≤2KB-per-row target. So:

**Recommendation:** cap evidence to **top-N per row** (e.g. 3, by relevance) **+** keep the `evidence_count` total, regardless of transport. Once capped, **Option A (capped evidence inline on each row)** is the cleanest — simplest for LLM consumers and small enough to stay under budget. Keep the `evidence_status` fallback for the "requested but none available" case. (The API agent already noted a future `evidence_limit` param as optional P1 — until then, cap MCP-side.)

## 🟠 Item 6 — `_attribution` reads a field that isn't on the rows

The plan builds attribution from `data.rows.map(r => r.graphName)`. The probe row schema has **no `graphName`** — rows carry `graphId`, `trendName`, `psfk_graph_slug`, etc. So `allSourceNames` is empty and attribution always falls back to the single primary name (the bug it's meant to fix).

**Fix:** resolve `graphId → display name` via the catalog (`catalogCache` already has the naming map used by `buildGraphNamingBlock`) rather than reading `r.graphName`.

## 🟠 Item 6 — deprecated exclusion is router-only; returned rows still leak `psfk`/`food`

Excluding `psfk`/`waldo` in `getRelevantGraphs()` (`catalogCache.ts:773`) only affects the **multi-graph fan-out** path (when `graphId` is omitted). But the probe ran an **explicit** `search_graph(graphId:"retail")` and the API returned rows with `graphId` ∈ `{psfk, food}` — those bypass the router entirely and flow straight through.

**Fix:** add a **row-level post-filter** in `serializeSearchRow()` / before returning: drop any row whose resolved `graphId` ∈ `DEPRECATED_GRAPH_IDS`. This is belt-and-suspenders with the API §3 fix (which addresses the root cause) — needed because the API fix and the MCP fix may not deploy together.

---

## Endorsed — no change needed

- **Item 4 root cause** — correct and well-traced (`:852–859` / `:899–906` strip evidence for the 30KB widget budget). ✅
- **Item 2** — `upsell.plan` (not `.name`), `price > 0` guard, `rec…` name guard, `graphs_enabled_count` — matches the brief and the probe-confirmed `_account` shape exactly. ✅
- **Item 5** — one-line `GRAPH_ID_DESC` fix covering all 5 tools. ✅
- **Declining caller-aware `graphs_enabled` filtering in the router** — agreed. Access-control enforcement belongs in the **API** (already briefed as §3 there: respect the caller's enabled list server-side). Tagging-not-dropping is fine for P0; don't thread the enabled list into the router.

## Minor

- Deleting `whyNow` / `adjacentPossibilities` from rows (Item 3 step 4): `whyNow` may be useful "why now" signal content — confirm no widget/consumer renders it before removing. Low stakes.
- Item 4's `evidenceByNode` keys on `row.node_id || row.trendId`; since Item 3 deletes `trendId`, make sure `node_id` is populated before this runs (ordering within `serializeSearchRow`).

---

**Net:** ship `owner_email`/`owner_account_id` today (the leak is real); fix the description-dedup so rows keep their text; cap evidence before choosing inline vs block; resolve attribution names via the catalog and post-filter deprecated rows. Everything else is good to build.
