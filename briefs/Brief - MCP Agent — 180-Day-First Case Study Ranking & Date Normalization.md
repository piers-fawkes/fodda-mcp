# Brief: MCP Agent — 180-Day-First Case Study Ranking & `published_at` Date Normalization

**Target Repo:** `~/Documents/Fodda MCP` (`fodda-mcp`)  
**Owner:** `mcp-agent`  
**Date:** 2026-11-10  
**Related QA:** App & Website Chat QA (`questionId` `19120`–`19126`)

---

## Problem

During QA of a retail store discovery conversation in App Chat (`"in one newsletter you featured this really cool Retail store in New York... smallish rooms that was ornately decorated"` → follow-up `"anything from 2026"`):

1. **`published_at` property mismatch in `rankAndFilterEvidence` (`src/enrichment.ts`):**
   - In `src/enrichment.ts` (~L572), the 180-day recency boost only inspects `item.publishedAt`:
     ```ts
     if (item.publishedAt) {
         const daysAgo = (Date.now() - new Date(item.publishedAt).getTime()) / 864e5;
         if (!isNaN(daysAgo) && daysAgo < 180) score += 2.0;
     }
     ```
   - Neo4j `Article` nodes on PSFK domain graphs (`retail`, `fashion`, `beauty`, etc.) carry snake_case `published_at` (e.g. `published_at: "2026-09-04T09:06:53.000Z"` on Victoria Beckham's Mercer St flagship and `"2026-02-18T00:00:00.000Z"` on Tuckernuck). Whenever `published_at` or `published_date` is present without camelCase `publishedAt`, the 180-day recency check silently evaluates to `false` and `enrichEvidence` omits normalized date metadata.

2. **180-Day-First Discovery Window with Auto-Widen on Thin/Recall:**
   - For idea and case-study discovery queries, Fodda should prioritize case studies/signals from the **last 180 days first**, automatically widening to older (`181d+`) items when `< 3` strong on-topic items exist inside the 180-day window OR when the user asks a recall/historical question (*"you featured..."*, *"do you remember..."*, *"in a past newsletter..."*, or an explicit non-current year).

3. **Off-Topic Cross-Graph `specific.brands` Pollution (`src/coverageRelevance.ts`):**
   - On the luxury NYC multi-room boutique query, `search_graph` fanned out to 17 graphs including `mckinsey-agentic-commerce-trends`. `coverageRelevance.ts` (~L2086–2130) counted brand mentions across all `onTopicRows` and promoted `specific.brands = ["Amazon"]`, causing downstream surfaces to suggest `"Want to drill into Amazon specifically?"` on an answer strictly about Tuckernuck and Victoria Beckham.

---

## Required Changes

### 1. Normalize `publishedAt` & Enforce 180-Day-First Tiering in `src/enrichment.ts`
- Resolve article dates across all canonical fields: `item.publishedAt || item.published_at || item.published_date || item.date || item.Date`.
- Ensure `enrichEvidence()` preserves a normalized `publishedAt` ISO string (and human-readable `Month YYYY` in `formatted_citation` / `short_citation` when available) so downstream LLM synthesizers always see the publication month and year.
- In `rankAndFilterEvidence(items, query, trendContext, opts)`:
  - Detect recall/historical queries (`/(\bremember\b|\byou featured\b|\bin one newsletter\b|\bpast newsletter\b|\bhistoric|\b202[0-5]\b)/i.test(query)`).
  - For standard discovery queries (non-recall), partition `positiveEligible` into `recent180` (`daysAgo <= 180`) and `olderArchive` (`daysAgo > 180` or undated):
    - Rank `recent180` items ahead of `olderArchive` items, filling up to `maxItems` from `recent180` first and automatically backfilling remaining slots from `olderArchive` when `recent180.length < maxItems` (zero extra API calls, zero loss on recall queries like Tuckernuck).

### 2. Tighten `specific.brands` Selection in `src/coverageRelevance.ts`
- When computing `specific.brands` (~L2086–2130), weight brands appearing in the **top 3 ranked rows** (or rows whose `evidence` was actually selected) higher than brands appearing only in lower-ranked/adjacent report graphs, and apply `hasLuxuryQuery` exclusion against `MASS_BUDGET_BRANDS` / mass e-commerce marketplaces (`Amazon`, `Walmart`, `Temu`, `Shein`) when the query asks for luxury/high-end boutiques or fashion flagships.

---

## Files Expected to Change
- `src/enrichment.ts`
- `src/coverageRelevance.ts`
- Unit test file verifying 180-day-first ranking + recall fallback + luxury `specific.brands` hygiene
- `CHANGELOG.md`

## Verification
1. Run unit tests confirming:
   - `Article` items with snake_case `published_at` receive `publishedAt` normalization and `<180d` tiering priority.
   - Standard query with 3+ `<180d` case studies returns the `<180d` items first; standard query with only 1 `<180d` case study (e.g. Sept 2026 Victoria Beckham) + 1 `265d` case study (Feb 2026 Tuckernuck) returns both via automatic backfill.
   - Recall query (`"in one newsletter you featured... do you remember"`) does not demote older exact matches below weaker recent matches.
   - Luxury boutique query does not emit `Amazon` in `next_moves.specific.brands`.
2. Build (`npm run build`) with zero TypeScript errors.
