# Follow-up — Earnings graph dedup (#7) is only half done

**For:** API/backend agent
**From:** MCP-side QA
**Date:** 2026-06-15
**Verified:** live `/v1/graphs` response.

## The issue

The earnings dedup removed `earnings_calls` from the **`graphs[]`** array (the `status → draft` flip worked there), but the API still emits a **second** earnings entry from the **`supplemental_sources`** block, which is built from a different source and wasn't touched. The website renders both surfaces, so users still see **two** earnings graphs.

Live `/v1/graphs` right now:

| Surface | id | name | status |
|---|---|---|---|
| `graphs[]` | `earnings-calls` | "Earnings Calls & Corporate Intelligence" | live ✅ canonical |
| `supplemental_sources` | `earnings_calls` | "Corporate Earnings Intelligence" | **still present** ❌ |

## Why the earlier fix missed it

Issue #7 only changed the graph's Airtable `status`, which governs the `graphs[]` array. The `supplemental_sources` block is populated from a separate supplemental-sources table/config where `earnings_calls` still exists as its own entry. Setting a graph to `draft` does not remove it from `supplemental_sources`.

## Fix

Remove (or merge into `earnings-calls`) the `earnings_calls` entry in the **supplemental-sources source** so `/v1/graphs` emits only the one canonical `earnings-calls`. Confirm by re-fetching `/v1/graphs` and grepping both `graphs[]` and `supplemental_sources` for `earnings` — expect a single canonical entry.

(Secondary option if the source can't be changed quickly: have the website dedupe across `graphs[]` + `supplemental_sources` by normalized id, treating `earnings_calls` ≡ `earnings-calls`. The source-side removal is the clean fix.)

Purely API/Airtable data — no MCP change involved.
