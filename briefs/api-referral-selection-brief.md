# API Brief: Improve Referral Graph Selection on `coverage = "out"`

**Priority:** Medium  
**Triggered by:** Demo feedback — Korean fashion collaboration query to Jeremy Bergstein  
**Date:** 2025-06-25

---

## Problem Observed

When Jeremy Bergstein was asked about "brand collaboration with Korean fashion companies" and returned `coverage = "out"`, the API's referral list was:

1. **Dentsu Creative Marketing** — "tracks brand building through creator collaborations"
2. **Kantar Marketing** — "tracks retail media and growth through collaboration"
3. **Marieke Neleman (Cultural Signals)** — "tracks hyperlocal as premium"

All three came back empty on the actual query. The referrals matched on the word "collaboration" and broad marketing adjacency, but none had substantive coverage of Korean fashion, K-fashion, or international brand partnership strategy.

**Question:** Was there a better graph to hit? Could the referral logic have found one?

---

## What the MCP Now Does Differently

The MCP system prompt has been updated so that when `coverage = "out"`:
- Claude **auto-searches the referred graphs immediately** (no longer asks permission)
- Claude **silently skips** sources that return nothing (no "I couldn't surface Marieke Neleman's signal")
- Claude **leads with what it found**, not what it didn't find

This means the referral graph quality matters more than before — if all 3 referrals are duds, the user now sees one turn of "I didn't find much" instead of a two-turn dance. Better referrals = better UX.

---

## Proposed API Improvements

### 1. Smarter Referral Matching — Beyond Keyword Overlap

Current referral selection appears to match on keyword overlap between the query and graph metadata. For the Korean fashion query, "collaboration" matched Dentsu and Kantar but didn't actually predict useful results.

**Suggestion:** Before returning referrals, run a lightweight semantic search (top-1, low limit) against each candidate graph. Only include graphs in the referral list that actually have ≥1 result above a relevance threshold (e.g., 0.75). This turns referrals from "these graphs *might* help" into "these graphs *do* have something."

### 2. Return a `referral_confidence` Field

Add a confidence indicator to each referral so the MCP can make smarter decisions:

```json
{
  "referrals": [
    {
      "name": "Dentsu Creative Marketing",
      "curator": "Dentsu Creative",
      "reason": "tracks brand building through creator collaborations",
      "referral_confidence": "high | medium | low",
      "preview_hit": true
    }
  ]
}
```

- `referral_confidence`: How strongly the graph's domain overlaps with the query
- `preview_hit`: Whether a quick pre-search found any results (boolean)

### 3. Consider Topic-Specific Routing Keywords

The Marieke Neleman referral was based on "hyperlocal as premium" — a conceptual match to how Korean fashion *could* be positioned globally. That's a creative editorial leap, not a data match. 

**Suggestion:** Distinguish between:
- **Data referrals** — "this source has content on your topic" (high confidence)
- **Conceptual referrals** — "this source covers a framework that could apply" (lower confidence, present differently)

The MCP could then present conceptual referrals as "from a different angle..." rather than as direct answers.

---

## No Breaking Changes

These are additive — existing `referrals` array structure stays the same. New fields (`referral_confidence`, `preview_hit`) are optional and the MCP will gracefully ignore them if absent.
