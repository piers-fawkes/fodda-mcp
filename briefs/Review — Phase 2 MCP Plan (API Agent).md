# Review — Phase 2 MCP Implementation Plan (from API Agent session)

> **Date:** 2026-06-12
> **Re:** MCP agent's implementation_plan.md (Digital Twin Consult Envelope)
> **Verdict:** Approved with TWO corrections (one would break the speaker rules) and one cost nudge. And good news: **the API envelope is already LIVE** — real sample responses below to test against.

## Correction 1 — coverage vocabulary (would break rendering)

The plan's STEP C uses `coverage = "full" or "partial"` — those values don't exist. The live envelope returns exactly:

```
coverage: "in" | "adjacent" | "out"
```

## Correction 2 — "adjacent" needs its own branch

The plan's clause "Off-topic (coverage = 'out' **or referrals present**)" misroutes `adjacent`: the API populates `referrals` for BOTH `adjacent` and `out`, but `adjacent` responses contain a full expert answer, not a decline. Branch on the coverage value explicitly:

- **`in`** → expert's 1st-person answer; no referrals exist.
- **`adjacent`** → expert's full 1st-person answer (he was instructed to attribute lookups and acknowledge limits) + present referrals afterwards in platform voice as "also worth checking: …".
- **`out`** → the result is a short 1st-person decline; narrator delivers referrals in 3rd person with the offer to query. Never extend the expert's text.

## Nudge — hedge probe cost

Hedge probes bill the user's tokens on every consult. Prefer the targeted option: `search_graph` on 1–2 specifically relevant graphs rather than `get_expert_intelligence` (which fans out across ALL expert graphs). Keep `get_supplemental_context` strictly for stats-shaped queries. Unconditional + heavy = every consult double-bills.

## API status — envelope is live (resolves your open question)

Deployed: revision `fodda-api-new-00374-rkf`. Acceptance-tested 2026-06-12. Exact shapes:

```
sources_used: [{ type: "own_graph"|"library_graph"|"supplemental"|"web", id, label, url? }]
referrals:    [{ graph_id, name, curator, reason }]
speaker_note: string
```

(Note: referral field is `name`, not `graph_name` — your `r.graph_name || r.name` fallback happens to work; simplify to `r.name`.)

### Real sample — off-topic (use as your test fixture)

Query to `jeremy-bergstein-science-education-innovation`: *"What are the biggest trends in European beauty retail pricing and prestige skincare for 2026?"*

```json
{
  "coverage": "out",
  "referrals": [
    { "graph_id": "beauty-goes-digital-state-of-global-beauty-in-2026", "name": "NIQ Beauty Graph", "curator": "...", "reason": "Closest coverage: tracks \"Premiumization vs. Affordability\"" },
    { "graph_id": "boots-beauty-wellness-trends-report-2026", "name": "Boots Beauty & Wellness Trends Report 2026", "reason": "Closest coverage: tracks \"WORLD CLASS BEAUTY\"" },
    { "graph_id": "ecdb-global-ecommerce-outlook-2026", "name": "ECDB Global eCommerce Outlook", "reason": "Closest coverage: tracks \"Latin America Records Strong Growth\"" }
  ],
  "sources_used": [{ "type": "own_graph", "id": "postpals-expert-graph", "label": "Jeremy Bergstein / PostPals" }],
  "result": "To be completely honest, European beauty retail pricing and prestige skincare trends are entirely outside of what I..."
}
```

### Real sample — on-topic

Query: *"How can a zoo build recurring subscription revenue from its research data?"* → `coverage: "in"`, `referrals: []`, `sources_used` = own graph, full 2,393-char answer in voice.

(Known issue, fix pending one redeploy: `out` declines were truncating at the 512-token cap; raised to 1536 in the API working tree.)

## Everything else: approved as planned

Envelope-aware rendering with legacy passthrough ✓, referral-block delimiter carrying the narrator instruction inline ✓, Jeremy `ANALYST_ENTRIES` entry with the correct ID and graph ✓, tool-description update ✓, changelog ✓.
