# Brief: Ingestion Tech Graph Future-Dated Article Cleanup & Ingest-Time Date Guard

**To:** PSFK Ingestion Agent / CE Graph Ingestion Agent (`ingestion-agent`)  
**From:** Fodda MCP Agent (`mcp-agent`)  
**Date:** 2026-09-18  
**Severity:** P1 — Blocks public launch of Fodda Technology Analyst on Grok Bot Marketplace  
**Scope:** Neo4j `tech` graph repair + Ingest pipeline validation gate  
**Companion:** `briefs/Brief - Vertical Analyst Bots, Launch Set & Graph Depth Evidence.md` (§4)

---

## 1. Context & Observed Defect

In preparation for launching the **Fodda Technology Analyst** bot, an empirical graph depth audit of live Neo4j was conducted on 2026-09-17 across all 7 vertical graphs.

A defect was discovered in the `tech` graph:
- **Defective Record:** Exactly one `Article` node has `published_at = 2029-02-13T00:00:00.000Z` (three years in the future).
- **Impact:** Because this record represents the `max(published_at)` for the entire `tech` graph, any freshness sort or query asking for "the latest technology movements" prioritizes this 2029 article. A public marketplace bot presenting 2029 dates undermines user trust on the very first query.
- **Scope of Defect:** Isolated to this one article; no other vertical graph has future-dated records.

---

## 2. Requirements (Two Parts)

### Part 1: Neo4j Data Cleanup (Immediate)
Locate the offending `Article` node in the `tech` graph where `published_at > datetime()` (specifically matching `2029-02-13`).
1. Inspect the original source URL / ingest payload to determine the true publication date (likely `2024-02-13` or `2025-02-13`).
2. If the true date is unambiguous, update the `published_at` property to the correct ISO-8601 timestamp.
3. If the true date cannot be determined with certainty, soft-delete or remove the article node and its associated `:MENTIONS` / `:CITES` relationships.

### Part 2: Ingest-Time Date Validation Guard (Systemic Fix)
One bad row reached production because the ingestion pipeline lacked future-date bounds checking. The same gap will admit future errors unless guarded at ingest time.

Add an ingest-time validation gate to the ingestion pipeline:
1. Reject or clamp any incoming article or signal where `published_at > now() + tolerance` (recommend maximum 24-48 hours tolerance for timezone differences).
2. On violation:
   - Log a warning with the article title, source URL, and incoming `published_at` value: `[ingest-guard] Rejected future-dated published_at: ${published_at}`.
   - Do not write future dates to Neo4j.
3. Add a unit test verifying that future timestamps beyond the tolerance threshold fail validation.

---

## 3. Definition of Done

- [ ] Cypher query `MATCH (a:Article) WHERE a.graphId = 'tech' AND a.published_at > datetime() RETURN count(a)` returns `0`.
- [ ] Ingest-time date validation gate is deployed in the ingestion pipeline.
- [ ] Ingestion test suite verifies future-dated records are rejected.
- [ ] Confirmation note logged to hand off to `mcp-agent` to unblock Technology Analyst marketplace publishing.
