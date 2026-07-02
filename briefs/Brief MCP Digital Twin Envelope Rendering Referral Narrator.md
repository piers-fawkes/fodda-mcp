# Brief: MCP Agent — Render Digital Twin Consult Envelope (Referrals, Narrator Voice, Parallel Hedge)

> **For:** MCP Agent (`Fodda MCP/`)
> **Priority:** High — Phase 2 of the June 2026 Digital Twin update (depends on API brief "Digital Twin Coverage Gate, Library Context & Referral Envelope")
> **Date:** 2026-06-12
> **Context:** `POST /v1/analysts/consult` is gaining a structured envelope: `{ result, coverage, sources_used, referrals, speaker_note }`. The MCP must render it with the agreed speaker rules — expert in 1st person, platform narrator delivers referrals in 3rd person — and fire hedge research in parallel with consults.

---

## Background

Today `consult_analyst` (`src/toolHandlers.ts` ~3067–3100) returns the `result`/`report` text as-is, and the `VirtualExpertConsultation` sequence (`src/systemPrompt.ts` ~48–60) is strictly serial: search the expert's graph → consult. There is no off-topic handling; the client LLM presents whatever the persona says.

Speaker rules decided with Piers:
- **In coverage:** expert speaks 1st person, including attributed lookups ("I pulled the Census ACS numbers — 23% as of 2024", "PSFK's retail graph tracks this as 'X'").
- **Off-topic:** the expert gives only a short 1st-person decline; the **narrator** (the client LLM that already frames "Consulting Jeremy Bergstein…") delivers the referral in 3rd person: "Jeremy doesn't cover European beauty pricing — but Tara James Taylor's NielsenIQ Beauty graph does. Want me to pull it?" The twin never fakes fluency.

---

## What to Build

### 1. `consult_analyst` handler — surface the envelope

When the API response contains `coverage`/`referrals`, append a clearly-delimited block to the tool result so the client can act on it:

```
--- COVERAGE: out ---
--- SOURCES USED: [list with labels/urls] ---
--- REFERRALS (deliver these in 3rd person as the platform, NOT in the expert's voice): ---
1. {name} by {curator} — {reason}
```

Keep plain-text passthrough for legacy responses (no envelope fields).

### 2. System prompt — update `SEQUENCE: VirtualExpertConsultation` (~lines 48–60)

- Add the speaker rule: expert text is rendered in the expert's 1st-person voice; referral text is rendered by the assistant in 3rd person platform voice. Never extend the expert's answer beyond their `result`.
- Add referral follow-through: after presenting referrals, offer to query the referred graph(s) (`search_graph` / `get_supplemental_context`) in the next step.
- Add the **parallel hedge**: when consulting an expert, fire `consult_analyst` AND a library probe (`get_expert_intelligence` or `search_graph` on likely-relevant graphs) in the same turn; if the query is stats-shaped, also fire `get_supplemental_context` (it is async job + poll — `check_supplemental_status`). By the time the consult returns, hedge results are ready to weave in (attributed) or to back the referral.

### 3. Register Jeremy in `ANALYST_ENTRIES` (`src/systemPrompt.ts` ~483–490)

Missing today. Add:

```typescript
'jeremy-bergstein-science-education-innovation': {
  name: 'Jeremy Bergstein',
  graphId: 'postpals-expert-graph',
  domain: 'institutional data monetization, science education commerce, experiential retail, slow edtech'
},
```

(Do NOT use `jeremy-bergstein-macro` — that ghost graph/ID was deleted from the registry on 2026-06-12.)

### 4. Tool description for `consult_analyst`

Mention that responses may include coverage + referrals and that referrals must be presented in platform voice with an offer to query the referred graph.

---

## Definition of Done

- [ ] Off-topic consult renders: expert's short 1st-person decline + 3rd-person platform referral + offer to query the referred graph
- [ ] In-coverage consult renders expert 1st person with sources attributed by graph name
- [ ] Hedge tools fired in parallel with consult (visible in tool-call sequence)
- [ ] Jeremy entry-point routing works (`&id=jeremy-bergstein-science-education-innovation`)
- [ ] Legacy (non-envelope) consult responses still render unchanged
- [ ] `CHANGELOG.md` updated

## Do Not

- Do not block on the consult before firing hedge probes (that's the point of the parallel pattern)
- Do not let the client LLM answer off-topic questions in the expert's voice from its own knowledge
- API-side changes (coverage gate, envelope) are the API agent's brief — do not duplicate

## Files Expected to Change

| File | Change |
|---|---|
| `src/toolHandlers.ts` | Envelope rendering in consult handler; tool description |
| `src/systemPrompt.ts` | VirtualExpertConsultation sequence, speaker rules, ANALYST_ENTRIES |
| `CHANGELOG.md` | Document behavior |

## Related

Master plan: `Fodda API/coordination_notes/Digital Twin Update Plan June 2026.md`. Companion briefs in Fodda API (envelope), Fodda CE (evidence enrichment), Fodda Website (prompt single-sourcing).
