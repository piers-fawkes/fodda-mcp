# Brief: Ingestion Data Integrity — Corrupted PSFK Batch + Universal Validation Gates

> **Type:** `[x] Bug Fix` · `[x] Cross-Cutting Issue`
> **Priority:** `[x] P1` (a corrupted batch is poisoning live search ranking + citations)
> **Primary agent:** **PSFK Ingestor** (all verified defects are in PSFK-ingested graphs: beauty / retail / fashion / tech).
> **Secondary:** **Expert Ingestor** + **Earnings Ingestor** — adopt §3 validation gates preventively. No defects observed in their graphs in this audit, but the gates are pipeline-agnostic.
> **Source:** Round-2 surface audit, verified live 2026-06-12. Full context: `briefs/Brief Round 2 Surface Audit - Evidence Ranking and Node Identity.md`. **This brief owns the data-layer items only** — the evidence-ranking P0 is a separate MCP fix; do not touch ordering here.

---

## 1. 🔴 The "7109 cluster" — one corrupted batch (PSFK)

Four nodes share a fingerprint that healthy nodes don't, and it's corrupting live results. **Verified node IDs: `6779`, `6782`, `6784`, `6417`** (surfaced in PSFK Beauty/Retail Trends).

| Field | Cluster value (wrong) | Healthy value | Likely cause to investigate |
|---|---|---|---|
| `signal_score` | **`7109`** (identical across all 4) | 34–99 | un-normalized raw count, or a default/placeholder written as score. It inflates these nodes to **search ranks 1–4**, burying on-topic results. |
| `lastSeen` | **`2602-02-26T00:00:00Z`** | 2025/2026 | a date-parse error (e.g. `"26-02-26"`/DD-MM misread, or a bad source value) producing year 2602. Propagates to response-level `queryTimeline: "2025–2602"`. |
| `place[]` | literal **`"string"`** / **`"null"`** tokens mixed with real places (`["North America","string","string","Europe",…]`) | clean place names | a field defaulting to its **type name / placeholder** (`"string"`) or a stringified null on extraction failure. |
| evidence count | **470 / 1286 / 1273** | ~12–28 | over-linking — an evidence join attaching far too many items (saturation feeds the downstream citation problem). |
| graph membership | inconsistent: `6779` is canonically `graphId: "tech"` but surfaces as `beauty`/`retail` | consistent | mis-tagged graph assignment for this batch (see §2). |

**Action:** treat these four as a **quarantine-and-re-ingest** unit — they look like one ingestion run that went wrong. Trace them to the source batch, find the common job/date/transform, fix at source, re-ingest. Confirm the `7109`/`2602`/`"string"` signatures disappear and that ranks reflect topicality afterward.

---

## 2. 🔴 Graph mis-tagging (PSFK)

**Verified:** node `6779` ("Retail as a Destination") has canonical `graphId: "tech"`, yet `search_graph` labels it `beauty` and `brainstorm_topic` labels it `retail` — three different graphs for one node, same session. A retail-titled trend living in `tech` is itself suspect.

**Action:** each node must have **one canonical graph** set at ingestion. Audit the cluster (and any node whose `psfk_graph_slug` lists many verticals) for which graph it truly belongs to, and write a single authoritative `graphId`. (The API/MCP will enforce consistency downstream — see the round-2 spec — but the source of truth is the ingested record.)

---

## 3. 🟠 Corrupted individual evidence records (PSFK)

**Verified evidence IDs:**
- **`15468`** (on node `6417`): `title` = "Google's 2022 HCU shifts traffic…" but `sourceUrl` = an **NYT McDonald's beverages** article (`nytimes.com/2026/04/13/business/mcdonalds-…`). Title and URL describe different stories.
- **`15392`** (on node `6721`): `title` "OpenAI pauses AGI model…" but `sourceUrl` = an **Instagram login redirect** (`instagram.com/accounts/login/?next=…`), not an article.

**Action:** fix/drop these two records, and add the §3 gates so the class can't recur.

---

## 4. ✅ Universal validation gates — ALL THREE ingestors adopt

Add these as a **pre-write validation pass**; reject or quarantine records that fail, with a log. Pipeline-agnostic — PSFK, Expert, Earnings.

1. **Date sanity:** reject any date field outside `[2010-01-01, today + 90d]`. (Catches `2602`.)
2. **Placeholder-token rejection:** no field value may be the literal string `"string"`, `"null"`, `"undefined"`, `"None"`, or empty-after-trim inside arrays. (Catches `place: ["string"]`, `demographicSlug: "string"`.)
3. **Brand list hygiene:** dedupe case-insensitively; drop entries that also appear in the node's `place`/geography (catches `"Malibu"` as a brand); cap and de-noise.
4. **Evidence URL integrity:** `sourceUrl` must be a fetchable article URL — reject login/redirect/auth-wall URLs (`/accounts/login`, `?next=`, etc.); flag **title↔URL topic mismatch** (the publication/domain in the URL should be consistent with `publication`). (Catches `15392`, `15468`.)
5. **Signal-score range:** validate `signal_score` is within the expected normalized band; flag outliers like `7109` for review rather than writing them through.
6. **Evidence-link sanity:** flag nodes whose evidence count is an extreme outlier (e.g. >5× the graph median) — over-linking is usually a bad join.

---

## 5. Out of scope here (routed elsewhere — do not duplicate)
- **Evidence ordering** (recency vs relevance), **internal-field stripping** (`psfk_graph_slug`, duplicate `Brand`/`brandNames`, triplicate `title`/`label`/`trendName`), `whyNow` content bleed → **MCP serializer**, not ingestion (round-2 spec).
- **`get_node` graph validation**, canonical-`graphId` enforcement on the API surface → **API agent** (round-2 spec). Ingestion sets the *source-of-truth* graphId (§2); the API enforces it.

## 6. Acceptance
- [ ] Nodes 6779/6782/6784/6417 re-ingested: no `signal_score 7109`, no `2602` dates, no `"string"`/`"null"` in `place`, evidence counts in normal range, single correct `graphId`.
- [ ] Evidence `15468` and `15392` corrected or dropped.
- [ ] Validation gates live in all three ingestors; a synthetic record with a `2602` date, a `"string"` token, a dup brand, and a login-redirect URL is rejected with a log.

---

## 7. Live re-verification 2026-06-15 — cluster is larger and still live on `search` (sports graph)

A live `search_graph(graphId="sports", …)` run reproduced both the 7109 inflation **and** the mega-slug contamination, with **new corrupt node IDs beyond §1's checklist**. The 2026-06-12 re-ingest did not cover these, or new corrupt nodes were ingested since. Cross-confirmed independently by the API agent (Neo4j scope audit).

**New 7109-cluster nodes (inflated to search ranks #1–2, `relevance_score` > 1.0 — impossible for a normalized score):**
- `6746` "Collaborative Commerce" — `signal_score 7109`, relevance **1.414**
- `6621` "Condition-Specific Digital Therapeutics" — `signal_score 7109`, relevance **1.239**

**Mega-slug membership contamination** — tech/startup nodes carrying `psfk_graph_slug = "startup,tech,sports"`, pulled into the sports graph (`signal_score 133`, identical fallback `relevance 0.505`):
- `6611` "Specialized AI Compute Clouds Sold as Managed Performance"
- `6614` "Nonprofit RevOps Automation"
- `6618` "Quantum and Photonics Components Moving Into Procurement Catalogs"
- (~13 nodes in this block total; the three above are representative — clearly NOT sports trends.)

API-agent scope audit of the 80 trends returned: **0 are canonically `graphId="sports"`** — breakdown `psfk:40, tech:29, travel:6, food:4, sic:1`. They surface only via the `psfk_graph_slug` comma-list / `CONTAINS_TREND` edges.

> [!IMPORTANT]
> **`graphId` is stale, so any relevance "boost the matching graph" fix must be membership-aware.** Because no node stores the literal `graphId="sports"` (they store `psfk` / comma-lists), a boost keyed on `graphId == query` would boost **nothing**. The boost/guard must key on **`psfk_graph_slug` membership or `CONTAINS_TREND` edges** — i.e. the mega-slug guard in `Brief Cypher Node-Identity graphId Normalization.md` (Fix 3), confirmed still needed on `search`.

### Node-identity field swap (the "mismatched summary" symptom) — ingestion, not MCP
Two sports-relevant nodes return a `summary` that belongs to a **different trend**:
- `6276` "Social-sports entertainment venues…" → summary is solo-traveler / community-building text (`psfk_graph_slug = "sports,food,travel"`).
- `6575` "Spectacle Pop-Ups in Non-Retail Venues" → summary is generic retail text (`psfk_graph_slug = "sports,retail,media"`).

**Mechanism (reconciled):** the Neo4j `summary` property is null on these nodes; the MCP serializer backfills `summary ← description || trendDescription` ([toolHandlers.ts:754](file:///Users/piersfawkes/Documents/Fodda%20MCP/src/toolHandlers.ts#L754)); and the node's `trendDescription`/`description` **itself belongs to a different trend than its `trendName`**. So this is an **ingestion-level node-identity swap** — `trendName` from one source trend, `trendDescription` from another — surfaced (not caused) by the MCP backfill. The earlier "Claude conflated two results" read is withdrawn; the mismatch is real and on the wire.

**Additional acceptance:**
- [ ] Nodes 6746, 6621 re-ingested: no `signal_score 7109`, normalized relevance ≤ 1.0.
- [ ] Nodes 6611, 6614, 6618 (and the rest of the `startup,tech,sports` block): bad `sports` slug tag removed — these are tech/startup, not sports.
- [ ] Nodes 6276, 6575: `trendDescription`/`description` matches `trendName` (no cross-trend field swap).
