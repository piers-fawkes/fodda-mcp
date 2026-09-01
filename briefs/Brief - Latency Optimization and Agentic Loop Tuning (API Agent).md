# Brief: Latency Optimization & Agentic Loop Tuning (API Agent)

> **For:** Fodda API Agent (`Fodda API` repo)
> **Priority:** High
> **Target Service:** `fodda-api-new` in `us-east4` (do NOT configure legacy `fodda-api` in `us-central1`)

---

## Executive Summary

Server-side telemetry over 30 days reveals that consultation latency in Claude Web MCP is heavily dominated by backend execution inside `POST /v1/human-agents/consult` (median 23.8s, p90 ~35s) and `POST /v1/analysts/consult` (median 11.9s, p90 ~41s).

The primary driver is the server-side Gemini Interactions session with a managed Antigravity agent that executes a multi-iteration agentic tool loop. The MCP layer has eliminated client-side Step A pre-search and tool-bouncing; this brief directs the API-side optimizations needed to target low latency.

---

## Requirements

### 1. Instrument Consultation Sub-Stages with Structured Logging
Add high-resolution sub-stage timers inside `POST /v1/human-agents/consult` and `POST /v1/analysts/consult` and output structured JSON metrics to Cloud Logging (note: log entries serialize as `jsonPayload`, so Log Explorer queries and alerts must filter on `jsonPayload.message`, not `textPayload`):
* **`lookup_duration_ms`**: Analyst record lookup & persona resolution.
* **`embedding_duration_ms`**: Parallel embedding generation and registry fetching.
* **`neo4j_presearch_ms`**: Neo4j vector pre-search and coverage scoring.
* **`managed_agent_loop_ms`**: Gemini Interactions session creation, tool execution iterations, and report generation.
* **`postprocess_duration_ms`**: Source merging, citation tiering, next-moves extraction.
* **`session_write_ms`**: Firestore / session state persistence.

### 2. Managed Agentic Loop Optimization
* **Capping Tool Iterations**: Inspect the system prompt of the managed agent inside the Gemini Interactions session. Cap tool iterations to a strict maximum (e.g. 1–2 tool calls) or allow one-shot synthesis when Neo4j pre-search returns sufficient evidence.
* **Pre-Search Context Utilization**: Pass the pre-searched Neo4j graph context directly into the managed agent's initial prompt so it does not need to issue redundant MCP tool calls back to Fodda MCP for basic graph grounding.

### 3. Cloud Run Service Provisioning (`fodda-api-new`)
* Configure `min-instances: 1` on `fodda-api-new` in `us-east4` to eliminate container cold starts.
* Ensure `fodda-api` in `us-central1` is maintained as legacy and is not given min-instances.

### 4. 402 Retry Circuit Breaker
* When a user account balance is 0 or research limit is reached, return a structured 402 error payload that halts automated client retry loops (mitigating the 370+ HTTP 402 spike observed on `/v1/graphs` and search).

---

## Verification Criteria

1. Sub-stage timings are logged in Cloud Logging under `[API_CONSULT_METRICS]` with field breakdown.
2. Managed agent consultation completes within target server-side budget (< 6–10s vs 24s baseline).
3. Cloud Run service `fodda-api-new` in `us-east4` has `min-instances = 1`.
4. Automated tests pass cleanly across `functions/v1/humanAgents.ts` and `functions/v1/analysts.ts`.
