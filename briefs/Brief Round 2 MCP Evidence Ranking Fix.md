# Brief: MCP Evidence Ranking — Cap by Relevance, Not Recency (Round-2 P0)

> **Type:** `[x] Bug Fix`
> **Priority:** `[x] P0` — citation-first product is serving off-topic citations under curators' names
> **Agent:** MCP agent (this repo). **API/ingestion not involved** — the API returns correct evidence; the MCP re-orders it wrong.
> **Source:** Round-2 audit, verified live 2026-06-12. Full context: `briefs/Brief Round 2 Surface Audit - Evidence Ranking and Node Identity.md`.

---

## Problem (verified)

`search_graph(include_evidence)` returns evidence items that are **node-linked but off-topic** — e.g. node 6779 "Retail as a Destination" cites a storage-box review, an agentic-media-buying piece, and a Dior face mist. All stamped `role: "proof"` with well-formed `formatted_citation`, so an agent cites them inline. Worse than empty for a citation-first product.

**Root cause is MCP-side (proven by direct API probe):** the API returns each node's evidence **relevance-ranked, relevant first** (node 6779 → 470 items led by Decathlon / Nova Moda / Riachuelo store-format articles). The MCP then:
1. `enrichEvidence()` **sorts the whole pool by `publishedAt` descending** (`src/enrichment.ts:84-88`), and
2. the caller takes `enriched.slice(0, 3)` (`src/toolHandlers.ts:761`).

Net: of 470 relevance-ranked items the MCP keeps the **3 most *recent*** — which are the recently-ingested off-topic ones — and discards the relevant top. The recency sort throws away the only relevance signal there is.

> Evidence items carry **no per-item relevance/score field** (fields: `id, node_id, title, summary, sourceUrl, publishedAt, imageUrl, place, brandNames, contentType, speakerName, speakerTitle, publication`). So the **API array order IS the relevance ranking** — preserve it.

---

## Fix

### 1. `src/enrichment.ts` — make the recency sort opt-in; stop blanket `role: 'proof'`

```diff
-export function enrichEvidence(items: any[]): any[] {
+export function enrichEvidence(items: any[], opts: { sortByRecency?: boolean } = {}): any[] {
     if (!Array.isArray(items)) return items;
-    // Sort by publishedAt descending — most recent evidence first
-    items.sort((a, b) => {
-        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
-        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
-        return dateB - dateA;
-    });
+    // Preserve the API's relevance order by default — evidence items have no
+    // per-item score, so input order IS the relevance signal. Recency is opt-in.
+    if (opts.sortByRecency) {
+        items.sort((a, b) => {
+            const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
+            const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
+            return dateB - dateA;
+        });
+    }
     return items.map(item => {
         const ct = (item.contentType || '').toLowerCase();
-        item.role = EVIDENCE_ROLES[ct] || 'proof';
+        const mapped = EVIDENCE_ROLES[ct];
+        if (mapped) item.role = mapped;   // don't stamp unknown contentTypes as 'proof'
```

### 2. `src/toolHandlers.ts:757-761` — cap the API's top-3, set total before cap

```diff
-                        // P0 Item 4: Enrich and cap evidence at top 3 per row
-                        if (trimmed.evidence?.length > 0) {
-                            const enriched = enrichEvidence(trimmed.evidence);
-                            trimmed.evidence_count = enriched.length;
-                            trimmed.evidence = enriched.slice(0, 3);
+                        // P0 Item 4 + Round-2: cap at top-3 BY RELEVANCE (API order), not recency
+                        if (trimmed.evidence?.length > 0) {
+                            trimmed.evidence_count = trimmed.evidence.length;        // total before cap
+                            trimmed.evidence = enrichEvidence(trimmed.evidence.slice(0, 3));
```

### 3. Other call site — `src/toolHandlers.ts:1087`
`data.evidence = enrichEvidence(data.evidence)` (uncapped, e.g. get_evidence path) now preserves API/relevance order instead of recency — this is the correct/better default, no change needed. If any consumer genuinely wants newest-first there, pass `enrichEvidence(data.evidence, { sortByRecency: true })`.

---

## Acceptance

- [ ] `search_graph(graphId:"beauty"|multi, include_evidence)` → node **6779**'s top-3 evidence are the **store-format items** (Decathlon / Nova Moda / Riachuelo), **not** the storage-box / media-buying / Dior-mist items.
- [ ] `evidence_count` still reflects the full total (pre-cap), `evidence` array length ≤ 3.
- [ ] `role` is unset for unknown `contentType` rather than defaulting to `proof`.
- [ ] No regression at the uncapped `:1087` path (still enriches, now relevance-ordered).
- [ ] Verify with `scratch/probe_evidence2.mjs` (dumps per-node evidence order at the API) and `scratch/acceptance.mjs` (e2e).

## Notes
- Independent of the ingestion work: PSFK's over-link repair *reduces* evidence volume on bad nodes, but this fix is what makes the **cap pick relevant items** regardless of volume. Ship either order.
- This is the lone round-2 **P0**. Node-identity (API) and data-hygiene (ingestion) are separate, already specced.
