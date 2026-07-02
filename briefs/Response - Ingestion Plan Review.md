# Response — Ingestion Implementation Plan Review

Strong plan — the 6-gate module, the write-boundary wiring (createArticle/createTrend/neo4j-sync/earnings-bridge/report-ingest), the dry-run quarantine script, and the synthetic test all match the brief. **Approved to build**, with three refinements. #1 is load-bearing and answers your open question.

---

## 🔴 1. `confidenceScore` — fix the input, don't just clamp the output (answers the open question)

You found `signal_score` aliases Airtable's `confidenceScore` and that it "appears to be an Airtable-side **computed field**." If that's true, two things in the plan break:

- **The quarantine script (§6.4) "Sets confidenceScore to 0" in Airtable will fail** — you can't write to a formula/rollup/lookup field via the API. That step will error.
- **The next sync will recompute `7109`** for these records, because the *input* that feeds the formula is unchanged. So your neo4j-sync clamp (§3c) protects the graph — keep it, it's the right safety net — but the Airtable value stays wrong and any other consumer of `confidenceScore` still sees 7109.

**So the answer to "what's the expected range?" is: don't lead with a range.** First determine **what computes `confidenceScore`**:
- If it's a formula, open it and find which input is huge for nodes 6779/6782/6784/6417.
- **Strong hypothesis:** these same 4 nodes have **470–1286 evidence items** (the over-link defect, your §3f). `7109` smells like a raw count (or a numerator with no denominator) derived from that inflated evidence linkage. **If so, `confidenceScore` and the evidence saturation are the *same* root cause** — fix the over-linking and the score normalizes on its own.

**Action:** investigate the formula/input first; quarantine by fixing **inputs** (or the EVIDENCE_FOR join), not by writing the computed field. Keep the clamp as defense-in-depth. Once you know the formula, *then* set the validation band (your proposed `>200 = suspicious` is a fine flag threshold for the gate — just not a substitute for the input fix).

## 🟠 2. Confirm "Expert Ingestor" = report-ingest (needs Piers)

You found PSFK + Earnings + Report-ingest and **no distinct "Expert Ingestor."** Wiring the gates at the write boundary (Article/Trend DB) is the right call — it catches everything regardless of pipeline. **But the expert graphs** (the named-curator graphs — Tara James Taylor, Lucio Ribeiro, etc.) **must enter the DB through one of those three paths for the gates to cover them.** If expert graphs are ingested by a separate system/repo you didn't find, they'd be ungated. Piers named "Expert" specifically — **confirm whether it = report-ingest or a separate pipeline.** (Lower urgency: the audit found *no* defects in expert graphs, so this is preventive coverage.)

## 🟠 3. Per-record isolation — don't let one reject halt a batch

§2 wires validation into `createArticle()` and **throws** on a reject. The neo4j-sync path correctly uses `.filter()` (skip, not throw) — good. But if the ingestion loop calls `createArticle()` per record **without** per-record try/catch, one garbage record aborts the whole run. **Ensure callers catch per-record (log + skip + continue), or have `createArticle` return a `{written, rejected}` result instead of throwing.** A data-integrity gate that halts ingestion is worse than the data it blocks.

---

## Confirmed good (no change)
- 6-gate module + write-boundary placement — correct architecture. ✅
- `.filter()` quarantine on the Neo4j MERGE path. ✅
- Date sanitizer: note the *existing* `[2000,2100]` bound **already** rejects `2602` — the real bug was that it **wasn't applied to `lastSeen`/`firstSeen` on the trend path**; your §3d wiring is the actual fix. Keep the tighter `today+90d` upper bound from gate #1 in `validation.ts`. ✅
- Dry-run-first on the repair script. ✅

## One sequencing note
Run the **investigation of #1 (the formula/over-link) before** the quarantine script — if the over-link is the root, the quarantine step changes (fix the join, not the score), and you avoid the failed formula-field write.
