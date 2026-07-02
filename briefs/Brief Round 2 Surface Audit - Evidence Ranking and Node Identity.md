# Brief: Round-2 Surface Audit — Evidence Ranking, Node Identity, Data Hygiene

> **Type:** `[x] Bug Fix` · `[x] Cross-Cutting Issue`
> **Priority:** `[x] P0` (evidence ranking) · `[x] P1` (node identity, ranking) · data-hygiene = ingestion
> **Agent(s):** MCP agent (evidence ranking — lone P0) · API agent (node identity) · Ingestion/data (hygiene + the corrupted batch) · MCP agent (P1 carry-overs)
> **Source:** Co-pilot review of the shipped round-1 P0 + live verification by Claude Code against `mcp.fodda.ai` / `api.fodda.ai`, 2026-06-12. Items tagged **VERIFIED-CC** (I reproduced on live data), **VERIFIED-CP** (co-pilot session, verbatim values), or **REPORTED**.

Round-1 P0 shipped and is verified live (PII gone both layers; routing honest; account clean; evidence flows; ghost ref fixed — the live MCP serves `list_graphs`, 0 `list_available_graphs`, so any sighting of the old name is client schema caching). This is the next layer it exposed.

---

## ★ Likely common root cause — the "7109 cluster" (one corrupted ingestion batch)

**VERIFIED-CC + CP.** Beauty nodes **6779, 6782, 6784, 6417** share a fingerprint that the healthy retail/fashion nodes do not:

| Symptom | These 4 nodes | Healthy nodes |
|---|---|---|
| `signal_score` | **7109** (identical) | 34–99 |
| `lastSeen` | **`2602-02-26`** | normal 2025/2026 |
| `place` array | contains literal `"string"`/`"null"` | clean |
| evidence count | **470 / 1286 / 1273 / 36** | ~12–28 |
| search rank | **1–4** (top of results) | 5–10 |
| graph label | confused (6779 = canonical `tech`, surfaced `beauty`/`retail`) | consistent |

This is not four separate bugs — it's **one bad batch** whose inflated `signal_score: 7109` rockets it to ranks 1–4, whose far-future `2602` date poisons `queryTimeline`, and whose evidence saturation + recency-cap (below) produces the off-topic citations. **Quarantine / re-ingest this batch and Exhibits C, D, and most of E collapse together.** Owner: ingestion. Hand the data team the node IDs above as the first thread to pull.

---

## P0 (lone, MCP) — Evidence ranking caps by recency, not relevance  ✅ VERIFIED-CC

**Definitive layer test.** Probing the API directly for the beauty nodes (not just `retail`):
```
GET-equivalent search → node 6779 returns 470 evidence items, ordered RELEVANT first:
  [16183] Decathlon store format · [15931] Nova Moda store · [15934] Riachuelo pop-up · [15949] H&M …
  the garbage ids ARE in the list (21013, 21196) but buried deep; both dated 2026-05-10/11 = the newest.
```
So the **API is correct** — node-linked, relevance-ordered, relevant first. The breakage is **MCP-side**:
- `src/enrichment.ts:83-86` — `enrichEvidence()` sorts by `publishedAt` **descending**.
- `src/toolHandlers.ts:761` — then `enriched.slice(0, 3)`.
- Net: of each node's 470–1286 relevance-ranked items, the MCP keeps the **3 most *recent*** — which are exactly the recently-ingested off-topic items (`21013` storage box, `21196` media-buying) — and discards the relevant top. `role` defaults to `'proof'` (`enrichment.ts:92`), so they're all stamped "proof" and cited inline via `_render_instructions`. **Worse than empty** for a citation-first product.

> Do **not** send this to the API agent. The API returns the right evidence in the right order; the MCP throws that order away.

**Fix (MCP, small):**
1. **Cap by relevance, not recency** — preserve the API's order (it's relevance-ranked) or sort by `relevance_score`/`_score`, *then* `slice(0,3)`. Drop the unconditional `publishedAt` sort from the pre-cap path (keep recency as a tie-break only).
2. **Stop defaulting `role` to `'proof'`** — assign only when `contentType` maps; else leave unset.

**Acceptance:** top-3 evidence for node 6779 are the Decathlon/Nova Moda/Riachuelo store items, not the storage-box/media-buying items. Re-probe with `scratch/probe_evidence2.mjs`.

---

## Exhibit: corrupted evidence records (data, not ranking)  ✅ VERIFIED-CP

Distinct from the ranking bug — these records are broken regardless of ordering. They surface *because* of the recency-cap, but the corruption is an ingestion defect:
- **`id 15468`** (node 6417, beauty): title = "Google's 2022 HCU shifts traffic…" but `sourceUrl` = an **NYT McDonald's beverages** article. Title↔URL mismatch.
- **`id 15392`** (node 6721, retail): title "OpenAI pauses AGI model…" but `sourceUrl` = an **Instagram login redirect**, not an article.

**Action (ingestion):** title↔URL/topic consistency check; reject records whose `sourceUrl` is a login/redirect/non-article.

---

## P1 — Ranking: `signal_score` dominates, `relevance_score` ignored  ✅ VERIFIED-CP · MCP/API

Query "small format curated retail concepts" returned (co-pilot, with scores):
- Ranks **1–4** = the four `signal_score: 7109` cluster nodes (incl. a **drug-discovery** trend at #4), regardless of topicality.
- The literal topic match, **"Small-Format Store Growth" (6678), ranked 5th** (`relevance_score 1.436`, `signal_score 99`).
- Ranks 6–10 are **non-monotonic** in `relevance_score` (0.969 → 1.312 → 1.166 → 0.935 → 1.024) — so the order follows neither score alone.

**Action:** review the ranking blend — `signal_score` is clearly overweighted and, via the 7109 cluster, is surfacing corrupted nodes. Fixing the cluster (above) removes the worst offenders; the weighting still needs a look so genuine high-`signal` nodes don't bury on-topic matches.

---

## P1 — Node identity: global IDs, `get_node` ignores the graph, surfaces disagree  ✅ VERIFIED-CC + CP · API (+MCP)

> **⚠️ SUPERSEDED — diagnosis corrected 2026-06-12.** Re-verification showed `get_node` does **not** ignore the graph for clean data (clean node 6678 → 404 for the wrong graphs ✅). The "matches every graph" behavior is the **7109-cluster mega-slug** (a data bug, routed to ingestion), not an API bug. The real residual is a narrow `graphId`-consistency issue. **Use these instead:** `briefs/Brief Cypher Node-Identity graphId Normalization.md` (query layer) + `briefs/Brief API Node-Identity graphId Consistency.md` (app residual). The text below is kept for history.

**VERIFIED-CC:** `GET /v1/graphs/{beauty|retail|food|tech}/nodes/6779` returns the **same node every time** — "Retail as a Destination", canonical `graphId: "tech"` — i.e. the path graph segment is **ignored**; node IDs are global.
**VERIFIED-CP (same session, same minute):**

| node | search_graph says | brainstorm_topic says |
|---|---|---|
| 6779 | `beauty` ("PSFK Beauty Trends", `_use_this_graphId: beauty`) | `retail` |
| 6782 | `beauty` | `retail` |
| 6784 | `beauty` | `retail` |

Canonical record says `tech`. **Three different graph labels for the same node.** Breaks chained calls: `search` says beauty → `get_node(beauty, 6779)` silently returns a `tech` node → wrong-curator attribution.

**Fix:** API — one **canonical `graphId` per node**, used consistently across `search`, `brainstorm`, `get_node`; `get_node` should validate membership rather than echo any path graph. MCP — carry/trust the canonical id so chained calls target the right graph. (Overlaps with the 7109-cluster mis-tagging.)

---

## Data hygiene — ingestion, not API/MCP code  ✅ VERIFIED-CP (verbatim) unless noted

| Item | Evidence |
|---|---|
| `place` literal `"string"`/`"null"` tokens | 6782/6784: `[…,"string","string",…]`; 6721: `[…,"null",…]` |
| Far-future `2602` dates → `queryTimeline span "2025–2602"` | nodes 6779/6782/6784/6417 (the cluster) |
| Duplicate brands; non-brand as brand | 6417 `["FlashPath","FlashPath",…]`; 6678 `["Liverpool","Liverpool",…]`; 6779 lists `"Malibu"` (also in its `place`) |
| Legacy/duplicate field pairs | 6417 has `Brand`+`brandNames`, `Industry`+`industryNames`, `Sector`+`sectorNames`; `demographicSlug: "string"` on several |
| `title` == `label` == `trendName` on every row | pick one canonical |
| `geographical_region` unstructured comma+junk string (1–2KB/row) | 6779: `"North America, APAC, …, , string, …"` |
| `psfk_graph_slug` 21-vertical internal string shipped per row | VERIFIED-CC on food/tech; should not ship to clients at all |
| Content bleed into `whyNow` | 6428: `whyNow` begins `"**Examples:** Article: \"McDonald's Revamps…\""` |

**Action:** ingestion validation pass (reject out-of-range dates, literal `"string"`/`"null"` values, routing-slug-shaped entity lists; dedupe brands; flag title↔URL mismatches) **+** a small MCP/API date-sanity guard so a `2602` can never reach `queryTimeline` even if a record slips through. The `psfk_graph_slug`/duplicate-field/triplicate-name items are cheap **MCP serializer** drops (don't ship internal routing fields).

---

## P1 carry-overs — already specced, specifics added  ⚠️ VERIFIED-CP

`brainstorm_topic` (query "neighborhood retail", depth 1): `graph_id` is comma-joined strings (`"retail,food,travel"` etc.); `key_brands: []` / `brands_identified: 0` **while the same seed nodes report `brand_count` up to 3594 in search** (extraction is silently dropping); verbatim duplicate descriptions across nodes (6500 & 6570; 6560 & 6669); dual `signal_score` scales (7109 vs 98/99) in one response; flat-string `suggested_next_prompts` + `_presentation_hint` vs search's typed prompts + `_render_instructions`. → already in `fodda-mcp-fix-spec.md` item 10 + BACKBURNER; this just confirms with live values. Also: response **size targets** + camelCase→snake_case params remain in BACKBURNER.

---

## Verification harnesses (`scratch/`, no secrets)
`probe_evidence2.mjs` (API per-node evidence order, the layer test) · `probe_evidence.mjs` · `probe_node.mjs` (ID collision) · `acceptance.mjs`/`acceptance2.mjs` (e2e vs `MCP_BASE`) · `probe_search/pii/api.mjs`.

## Acceptance (Round 2)
- [ ] Evidence top-3 per node are relevance-ranked (e.g. 6779 → store-format items), not the 3 newest; `role` not blanket-`proof`.
- [ ] The 7109 cluster is quarantined/re-ingested: no `2602` dates, no `signal_score 7109`, no `"string"`/`"null"` in `place`, ranks reflect topicality.
- [ ] A node's `graphId` is identical across `search`/`brainstorm`/`get_node`; `get_node` won't return an out-of-graph node.
- [ ] No corrupted-URL evidence (login redirects, title↔URL mismatch) reaches clients.
- [ ] `brainstorm` `graph_id` is an array; `key_brands` non-empty when the seed nodes have brands.
