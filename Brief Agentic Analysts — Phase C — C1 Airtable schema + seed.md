# Phase C — C1: Airtable schema changes + seeding (the one thing I did NOT run)

Everything else in Phase C is built + committed. **C1 mutates production Airtable, so I left it for you.** Two steps: add the fields, then run the seed script.

## Step 1 — add fields to the `Offerings` table (base `appXUeeWN1uD9NdCW`)

| Field | Type | Notes |
|---|---|---|
| `offered_by` | Link to another record → **Analysts** | Allow linking to multiple records. Which expert(s) own this offering. |
| `offered_by_analyst_id` | Lookup | Source: `offered_by` → Analysts field **"Analyst ID"**. This surfaces the human-readable analyst ids; the API filters offerings→analyst on this. **Required** for offerings to appear on an analyst. |
| `deliverable_template` | Long text | The format contract mounted into the sandbox at `/workspace/template.md`. |
| `turnaround` | Single line text | e.g. `~20 min`. Shown in `list_analysts` offerings. |
| `example_brief` | Long text | One-line example brief. Agents imitate examples — this matters most. |

The code reads all five **tolerantly** — absent → the feature is simply dormant (offerings arrays come back `[]`), nothing breaks. So you can add fields and deploy in either order.

## Step 2 — seed the 3 pilot offerings

Script: [`scripts/seed_deliverable_offerings.ts`](../../../Fodda%20API/Fodda/scripts/seed_deliverable_offerings.ts) (in the API repo). Additive + idempotent — upserts by `key`, never deletes. It resolves each analyst's Airtable record id and sets the `offered_by` link.

```bash
cd "Fodda API/Fodda"
npx tsx scripts/seed_deliverable_offerings.ts            # DRY RUN — prints what it would do
npx tsx scripts/seed_deliverable_offerings.ts --commit   # writes to Airtable
```

Pilots (all mapped to `ben-dietz-sic`, the validated managed twin — reassign in the script's `PILOTS` array as you like):
- `marketing_plan` — $10, ~20 min
- `deck_review` — $10, ~15 min
- `trend_briefing` — $5, ~10 min

## ⚠️ Important: the destructive full-sync

`scripts/seed_offerings.ts` is a **full-sync that DELETES any Offerings row whose key isn't in its `SEED_DATA`**. I added the three pilot keys to that `SEED_DATA` (base fields only) so a future full-sync won't wipe them — but only `seed_deliverable_offerings.ts` populates the link + template + example_brief. Run order if you run both: `seed_offerings.ts` first (base rows), then `seed_deliverable_offerings.ts` (deliverable fields + links).

## After seeding — verify

1. `GET /v1/analysts` → `ben-dietz-sic` has a populated `offerings: [...]` array.
2. MCP `list_analysts` shows those offerings.
3. `request_deliverable(analyst_id: "ben-dietz-sic", offering_key: "trend_briefing", brief: "...")` → returns a `job_id`; `check_deliverable_status(job_id)` eventually returns `completed` with artifact links.
4. Confirm the account was charged the offering price once (server-side, in `/deliver`).
