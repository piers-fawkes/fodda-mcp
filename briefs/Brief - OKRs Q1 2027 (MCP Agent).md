# Brief - OKRs Q1 2027 (Fodda MCP Agent)

Owning repo: **Fodda MCP** · Agent: **mcp-agent**  
Date: **2026-10-09** · Status: **Approved (APP-2026-10-01 by Piers Fawkes)**  
Cycle: **Q1 2027 (scored)** · Q4 2026 = baseline monitoring only.  
Company North Star: **Serious player in the GLG competitor set by 2028** (2026: 400 seats / 260 sources / 24 experts / pre-revenue; 2027: 4,000 seats / 350 sources / 240 experts / \$1M ARR).

---

## 1. Context

Fodda MCP is the frontier context gateway for Claude Desktop, M365 Copilot Studio, Cursor, and enterprise LLM clients. Context window efficiency, zero disambiguation collisions, and sub-10s tool latency are the primary drivers of developer retention and enterprise seat growth.

---

## 2. Key Results You Own (Committed / Stretch)

- **KR MCP-1 (Tool Consolidation & Latency):** Consolidate MCP tool surface into high-density view-based tools with zero timeout drops (<10s threshold). Keep context footprint <= 30 registered tools.
- **KR MCP-2 (Disambiguation & Quality):** Eliminate tool disambiguation collisions; attain Tool Description Quality Score (TDQS) > 90 across all registered tools in the tools manifest.
- **KR MCP-3 (Pricing Honesty & Syntax Invariant):** Zero bare dollar signs (`\$`) and zero pricing mismatches in MCP tool descriptions and capabilities responses. Quoted rates must match Airtable Offerings (`tbl93DJ627r81zKVP`) verbatim.
- **KR MCP-4 [Shared with API Agent]:** Query latency SLO: instrument client-side roundtrip timers in `callFoddaAPI()` by Monday 2026-10-19 to validate the proposed <1200ms p95 latency target.

---

## 3. Weekly Cycle & Reporting Cadence

1. **Monday AM (Scores in):** Write `okrs/weekly/YYYY-MM-DD/scores/mcp.md`:
   - Metric values for KR MCP-1 through MCP-4.
   - Score (0.0–1.0) and Confidence (0–10).
   - One-line delta on what moved.
   - Any active blockers or peer assistance needed.
2. **Monday PM (Scoreboard review):** Inspect `scoreboard.md` published by API Agent to understand cross-repo health.
3. **Wednesday (Help reply):** If an unblocking request is dispatched to Fodda MCP (in `help-requests/mcp.md`), respond with a committed date in `help-replies/mcp.md`.

---

## 4. Non-Negotiable Guardrails (Fodda House Rules)

- **Airtable is the source of truth for pricing.** Do not calculate rates from `TOKEN_COSTS`. Quote verbatim.
- **SPT and token pricing are MACHINE-ONLY.** Never mention "tokens" or "via SPT" in human-facing or maker-facing tool descriptions.
- **Consolidate, don't multiply.** Prefer one tool with a `view` or mode parameter over N standalone tools.
- **All outbound calls to Fodda API** must go through `callFoddaAPI()` with `FODDA_MCP_SECRET` HMAC signing.
- **No bare dollar signs in Markdown:** Write `\$` or words.

---

## 5. Definition of Done

- Scorecard written every Monday AM in `okrs/weekly/YYYY-MM-DD/scores/mcp.md`.
- Performance timers active in `callFoddaAPI()` by 2026-10-19.
- TDQS > 90 verified across all tools in the manifest.
