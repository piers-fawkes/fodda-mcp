# Brief: Offering Landing Pages + Generated Discovery Surfaces

**Date:** 2026-06-21
**From:** MCP Agent (Coordinator)
**To:** Website Agent
**Repo:** ~/Documents/Fodda Website
**Priority:** P2
**Depends on:** the API agent's `Offerings` catalog endpoint (see *Brief - Offerings Catalog + Earnings Registration + Overage $0.50 (API Agent)*). Build readers against that endpoint; do **not** hardcode prices.

---

## 0. Context

Pricing is now a **flat $0.50/call** (offering price = `typical_calls × $0.50`). The audit found offerings are invisible as products (no pages, no `Product`/`Offer` structured data) and prices are hand-copied across `Pricing.tsx`, `ApiDocs.tsx`, `Agents.tsx`, `llms.txt` — already drifting ($0.20 vs $0.50). Goal: make offerings first-class and **generate every price/surface from the API catalog endpoint** so nothing drifts again.

Two audiences per offering: the **human buyer** (landing page) and the **agent / citing LLM** (structured data + llms.txt + the 402/A2A surfaces the API serves).

---

## 1. Per-offering landing pages (the 6 marquee)

Create a dedicated page per marquee offering, data-driven from the catalog endpoint (`is_marquee` rows):

| Offering | slug | price |
|---|---|---|
| Brand Intelligence | `/brand-intelligence` | $10 |
| Deep Research | `/deep-research` | $15 (comprehensive) / $10 (fast) |
| Topic Research | `/topic-research` | $7.50 |
| Earnings Intelligence | `/earnings-intelligence` | $7.50 |
| Expert Consult | `/expert-consult` | $2.50/turn |

Each page: what it does, what it orchestrates (`composed_of`), example output, price (from catalog), and a clear **"point your agent at this"** CTA (MCP + SPT, no signup). Use one `OfferingTemplate` rendered from catalog data — the same pattern as the existing `GraphTemplate`, not 6 hand-built pages.

## 2. Structured data (the citation play)

On each offering page emit schema.org **`Product` + `Offer` + `PriceSpecification`** JSON-LD (via `components/SEO.tsx`). Today only `Service` markup exists, so offerings aren't citable by generative engines. This is what gets Fodda cited when someone asks an LLM "how can my agent get brand intelligence."

## 3. Generate llms.txt / llms-full.txt from the catalog

`llms.txt` and `llms-full.txt` currently list pricing by hand. Generate them from the catalog endpoint at build time so offerings + the ~30 tools + prices are always current. Keep the AI-crawler allowances in `robots.txt`.

## 4. Complete + generate the tool catalog

`/api` (`ApiDocs.tsx`) hardcodes ~16 tools and `openapi.json` ~14 paths; the real surface is ~30 primitives. Render the full tool list from the catalog endpoint (`kind: 'tool'`) instead of the hardcoded `MCP_TOOLS[]`. One generated catalog, not 30 pages.

## 5. Reconcile pricing to $0.50

`Pricing.tsx` still shows the human/Lava path at **$0.20** alongside the SPT path at $0.50. It's now a flat **$0.50** everywhere — update it, and ideally source the numbers from the catalog endpoint so it can't drift again. Same for any $0.20 in `Agents.tsx` / `Connect.tsx`.

## 6. Sitemap + nav

Add the 6 offering pages to `sitemap.xml` and the site nav so humans and crawlers find them.

---

## Verify
- Each marquee offering has a live page with price pulled from the catalog endpoint (change a price in Airtable → page updates, no code edit).
- `Product`/`Offer` JSON-LD validates (Google Rich Results test).
- `llms.txt` lists all offerings + tools + current $0.50-based prices.
- `/api` shows all ~30 tools from the catalog.
- No `$0.20` remains anywhere on the site.
