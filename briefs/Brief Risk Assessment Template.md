# Brief: Pre-Filled Risk Assessment Template for Enterprise Onboarding

> **For:** Product / Sales  
> **From:** Architecture  
> **Priority:** Low — back-burner, useful for enterprise pipeline  
> **Date:** 2026-05-08  
> **Inspiration:** Wild.ai whitepaper "AI in Regulated Industries" (Feb 2026) — Section 05 "Blueprint for a risk assessment paper"

---

## Problem

Enterprise buyers in regulated industries (banking, insurance, healthcare, large CPG) require a formal AI Risk Assessment before procurement can proceed. These documents typically take 2-6 weeks to produce because the buyer's compliance team has to reverse-engineer how the AI system works.

Fodda can short-circuit this by **pre-filling the template** — answering 80% of the questions before the buyer even asks them.

## Goal

Create a `Fodda_Risk_Assessment_Template.md` document that follows Wild's 9-section blueprint, pre-filled with Fodda's actual architecture details. Hand it to enterprise prospects during onboarding. Their compliance team annotates and signs off — instead of starting from scratch.

## Template Structure (following Wild's blueprint)

### 1. System Overview
- **Purpose:** Fodda provides expert-curated trend intelligence via MCP (Model Context Protocol) and API. Users query knowledge graphs built by named industry experts.
- **Users:** Strategists, analysts, CMOs, agency planners
- **Deployment channels:** MCP (Claude, Cursor, VS Code), REST API, Slack, Web dashboard
- **Decisions it can influence:** Research direction, trend identification, competitive positioning, market opportunity assessment
- **Actions it can execute:** Read-only queries against knowledge graphs, supplemental data lookups (government statistics, market data), scheduled report generation. **No write actions to external systems.**

### 2. Scope & Boundaries
- **In-scope:** Trend research, brand intelligence, evidence retrieval, statistical context, deep research synthesis
- **Out-of-scope:** Medical advice, legal advice, financial advice, credit decisions, personal data processing
- **Refusal rules:** System refuses to reveal internal architecture, tool names, or data source names. Refuses prompt injection attempts. Acknowledges coverage gaps honestly rather than fabricating.
- **Escalation:** Feedback tool routes to human team. No autonomous escalation to external systems.
- **Jurisdictions:** Content is primarily US/EU/UK focused. No jurisdiction-specific legal compliance claims.

### 3. Data Handling
- **Inputs:** User query text, user ID, API key
- **Outputs:** Trend summaries, evidence articles (with source URLs), statistical data, visualizations
- **Storage:** Query logs in Airtable (retained for service improvement). Knowledge graph data in Neo4j (curated editorial content, not user data).
- **PII handling:** No PII is collected beyond email address for account creation. Queries are not linked to PII in knowledge graph storage.
- **Data access control:** Graph-level access control — users only query graphs their subscription includes. Token-based metering per API call.
- **Retention:** [TO BE FILLED per client agreement]

### 4. Model & Orchestration Design
- **Deterministic components:** Evidence categorization (`normalizeEvidenceCategory()` — 5 fixed categories), access control (graph scoping), token metering, citation formatting, tool routing
- **LLM components:** Query interpretation, response synthesis, editorial framing, follow-up generation
- **Pattern:** "Calculator + Narrator" — deterministic systems handle data retrieval, categorization, and access control; LLMs handle interpretation and communication
- **Tool permissions:** 35+ MCP tools, all read-only. No tools modify external state. Tool schemas define strict input/output contracts.
- **Reproducibility:** Non-deterministic LLM outputs. Mitigated by: deterministic data layer, citation requirements, and structured grading of tool outputs.

### 5. Risk Controls Mapped to Threats

| Threat | Control | Implementation |
|--------|---------|---------------|
| Prompt injection / jailbreak | System prompt refusal rules | Tested via MUST-NOT-DO eval suite |
| Data leakage | Source confidentiality rules | LLM instructed to describe capabilities, not name sources. Grader scans for forbidden terms. |
| Harmful content | Content comes from curated knowledge graphs, not generated | Editorial curation layer + evidence category validation |
| Incorrect advice / overreliance | Epistemic hedging rules, "research honesty" directive | System acknowledges coverage gaps; hedges lifecycle claims |
| Operational failures | Timeout handling, graceful degradation | Tool calls fail silently; system continues with available data |
| Cross-user data exposure | User-scoped API keys, graph-level access control | Server enforces user_id + api_key on every request |

### 6. Logging, Traceability, and Audit Readiness
- **What is logged:** Query text, tool calls made, graphs queried, tokens consumed, response metadata
- **Where:** Airtable (query logs), application logs (Cloud Run)
- **How long:** [TO BE FILLED per client agreement]
- **Incident reproduction:** Query logs include tool call sequence; responses can be re-run against same inputs
- **Traceability:** Every evidence item carries `source_url`, `publish_date`, `Category`, and `graphId` — full provenance chain from response back to original source

### 7. Human Oversight Model
- **Who can override:** Account administrators via dashboard (app.fodda.ai)
- **What requires approval:** No autonomous actions require approval (system is read-only)
- **Human review by design:** 
  - Knowledge graph content is human-curated (PSFK editorial team + named experts)
  - Evidence categorization uses deterministic normalization, not LLM judgment
  - Scheduled reports are initiated by users, not autonomously
  - Feedback loop routes user reports to human team via Slack

### 8. Evaluation & Monitoring Plan
- **Pre-release eval gates:** [TO BE IMPLEMENTED — see Brief MCP Eval Harness.md]
  - 50+ behavioral test cases (SHOULD-DO + MUST-NOT-DO)
  - Code-based graders for citation, scope, refusal, confidentiality
  - Deploy gate: all MUST-NOT-DO tests must pass
- **Ongoing monitoring:** Token consumption tracking, query volume monitoring, error rate tracking
- **Incident response:** Feedback tool → Slack alert → human triage
- **Feedback loop:** User feedback captured via `send_feedback` tool, routed to product team

### 9. Residual Risks + Sign-Off
- **LLM hallucination:** Mitigated but not eliminated. Citation requirements + grounding in curated data reduce risk. Residual risk: LLM may occasionally synthesize beyond the evidence provided.
- **Stale data:** Knowledge graphs are updated on editorial cycles, not real-time. `freshnessDays` field allows users to assess currency.
- **Coverage gaps:** Not all industries/topics have deep graph coverage. System is instructed to acknowledge gaps rather than fabricate.
- **Model provider changes:** LLM behavior may shift with provider updates. [Eval harness monitors for regression once implemented.]
- **Risk acceptance:** [TO BE SIGNED by client compliance officer]
- **Review cadence:** [Quarterly recommended]

## Customization Points (marked with [TO BE FILLED])

Each enterprise client fills in:
- Data retention period
- Specific jurisdiction requirements
- Internal risk acceptance sign-off
- Review cadence
- Any additional MUST-NOT-DO rules for their org

## Deliverable

A polished markdown document (convertible to PDF) that lives at:
- `coordination_notes/Fodda_Risk_Assessment_Template.md` — master template
- Can be exported per-client with their specific fill-ins

## What This Enables

- **Shortened sales cycle:** Compliance team reviews a pre-filled doc instead of starting from zero
- **Credibility signal:** Shows Fodda has thought through the same risk framework enterprise buyers use
- **Stickiness:** Once a client's compliance team has signed off on this doc, switching costs increase significantly

## Reference

- Wild.ai, "AI in Regulated Industries" (Feb 2026) — Section 05 blueprint
- Optimum, "AI Compliance in Regulated Industries: A Strategic Framework for Enterprise Leaders" (Jul 2025)
- NIST AI Risk Management Framework (AI RMF)
- ISO/IEC 42001:2023
