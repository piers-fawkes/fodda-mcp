# Brief — Investigate Clerk submit_feedback Tool for Agent Telemetry (MCP Agent)

**Execution handle:** `/build-from-brief briefs/Brief - Investigate Clerk submit_feedback Tool for Agent Telemetry (MCP Agent).md`  
**To:** `mcp-agent` (Fodda MCP repo: `/Users/piersfawkes/Documents/Fodda MCP`)  
**From:** App Agent / Coordinator (on behalf of Piers)  
**Date:** 2026-11-05  
**Priority:** Medium (Telemetry / DX Investigation)  
**Status:** Closed — DECLINED / KEEP NATIVE (2026-11-05)  
**Evaluation Report:** `docs/investigations/clerk_agent_feedback_eval.md`  

---

## 1. Context & Motivation

In late October 2026, Clerk announced an agent feedback mechanism for Model Context Protocol (MCP) servers (`submit_feedback`), designed to capture real-time telemetry when client agents (Claude Desktop, Claude Connectors at `mcp.fodda.ai/claude`, Cursor, ChatGPT) encounter roadblocks while interacting with MCP tools.

When an AI agent gets stuck, hits a schema validation error, cannot find the right tool, or fails to fulfill a user prompt, it can autonomously invoke `submit_feedback` to report what failed. These reports are captured by Clerk and can be inspected via the Clerk Dashboard or Clerk's own MCP server.

Because Fodda operates a high-traffic production MCP server (`fodda-mcp`) connecting external LLMs to Fodda knowledge graphs, having structured visibility into where client agents get confused or drop queries is valuable. However, adding tools directly impacts our context budget and tool count invariants.

This brief tasks `mcp-agent` with investigating the viability, context impact, and privacy considerations of adopting Clerk's `submit_feedback` tool.

---

## 2. Invariants & Fodda House Rules to Respect

1. **Tool Budget Discipline:**  
   *“Consolidate, don't multiply. Prefer one tool with a `view`/mode parameter over N tools (context budget is tight, ~30+ tools). A new standalone tool needs justification.”*  
   `tools-manifest.json` currently tracks 56 tools. Any addition must justify its context token overhead.
2. **Enterprise Privacy & Zero Retention:**  
   Fodda respects customer data boundaries and `zeroQueryRetention` policies. Feedback payloads must never leak proprietary graph IP, customer queries, or auth tokens to external third-party loggers without sanitization.
3. **Internal Auth & HMAC Standards:**  
   Any outbound communication must follow established Fodda security rules. If Clerk credentials are required, it must reuse existing production keys (`CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY`) already present in Cloud Run secret management.

---

## 3. Scope of Investigation

### A. Technical Footprint & Implementation
1. **Package & Schema Inspection:**  
   Inspect `@clerk/mcp-tools` (or `@clerk/mcp-tools/feedback`) and its reference implementation.
   - What is the exact tool name and parameter schema expected by Clerk (e.g. `task_id`, `feedback`, `category`, `context`)?
   - Can the tool be implemented cleanly with a lightweight native fetch handler in `src/toolHandlers.ts`, or does it require installing `@clerk/mcp-tools` as a dependency?
2. **Credential & Transport Mechanics:**  
   - How does `submit_feedback` authenticate to Clerk's backend? Does it call `api.clerk.com` using the server's `CLERK_SECRET_KEY`?
   - How is the feedback attributed in the Clerk Dashboard (per-instance, per-user, or anonymous)?

### B. Context Overhead & Scoped Profiles
1. **Token Cost Measurement:**  
   Calculate the approximate token overhead of the tool schema and description.
2. **Profile Placement:**  
   If adopted, where should `submit_feedback` live?
   - **Option 1 (Global):** Available across `/mcp` and `/sse` (all 56+ tools).
   - **Option 2 (Scoped Claude Connector):** Added only to `mcp.fodda.ai/claude` (`src/scopedProfiles.ts`), where Claude research users are most likely to benefit from automated error escalation.
   - **Option 3 (Dev / Diagnostic Profile):** Excluded from production consumer endpoints, exposed only to staging/diagnostic agents.

### C. Data Privacy & Sanitization
1. What telemetry does an autonomous agent naturally submit when prompted to report failure?
2. Does the report risk echoing user prompt text or proprietary graph nodes?
3. Design a sanitization filter to scrub email addresses, session tokens, and raw query text before forwarding to Clerk.

### D. Clerk vs. Native Slack/Airtable Telemetry
Fodda already reports certain operational failures to Slack channels (`C0AU0403M3M` / `alerts.ts`) and Airtable (`Question Sessions`).
- Does Clerk's agent feedback dashboard provide genuine signal beyond our existing error logging?
- Does having feedback inside Clerk offer any workflow advantage (e.g. filtering by Clerk `userId` / instance)?

---

## 4. Expected Deliverables

Please output an investigation memo in `Fodda MCP/docs/investigations/clerk_agent_feedback_eval.md` (or in the brief response) containing:

1. **Feasibility Summary:** Minimal code snippet required to implement `submit_feedback` in `src/toolHandlers.ts`.
2. **Context Impact:** Token cost and recommendation on whether to place it globally or restrict to scoped profiles (e.g. `/claude`).
3. **Go / No-Go Recommendation:**
   - **Proceed with Scoped Implementation**: If token overhead is negligible and Clerk dashboard telemetry provides high-value insight into agent failures.
   - **Decline / Keep Native**: If external tool overhead does not justify the benefit over our native logging and Slack alerts.
4. If **Proceed**, provide the exact schema definition for `tools-manifest.json` and handler outline for `src/toolHandlers.ts`.
