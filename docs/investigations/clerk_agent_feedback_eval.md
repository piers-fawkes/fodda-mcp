# Investigation Report: Clerk `submit_feedback` Tool for Agent Telemetry

**Date:** 2026-11-05  
**Investigator:** `mcp-agent`  
**Repository:** `Fodda MCP` (`/Users/piersfawkes/Documents/Fodda MCP`)  
**Status:** Closed — DECLINED / KEEP NATIVE (Accepted by App Agent & Piers, 2026-11-05)  
**Recommendation:** **DECLINE Standalone Tool / KEEP NATIVE TELEMETRY**

---

## 1. Executive Summary & Verdict

In late October 2026, Clerk released `@clerk/mcp-tools` (v0.8.0), featuring a standardized `submit_feedback` tool designed to allow autonomous AI agents (Claude Desktop, Claude Connectors at `mcp.fodda.ai/claude`, Cursor, ChatGPT) to report roadblocks, schema validation friction, or missing capabilities back to a developer's Clerk instance dashboard.

We conducted a full source audit of `@clerk/mcp-tools@0.8.0` and cross-checked its mechanics against the `fodda-mcp` build pipeline, auth architecture, context budget invariants, enterprise privacy contracts, and existing native telemetry (`#fodda-research` Slack alerts, `#fodda-sales` frustration alarms, Airtable `Question Sessions` logging, and `send_feedback`).

### Key Findings
1. **Implementation is Trivial & Zero-Dependency:** `@clerk/mcp-tools/feedback` is a thin wrapper around a single `POST` to `https://api.clerk.com/v1/feedback`. Fodda does **not** need to install `@clerk/mcp-tools` (which pulls in `@modelcontextprotocol/sdk: ^1.29.0` and `zod/v4`); a 35-line native `fetch` handler in `src/toolHandlers.ts` fulfills 100% of the wire specification.
2. **Build-Time Cost Silence Guard Collision:** Clerk's verbatim `SUBMIT_FEEDBACK_DESCRIPTION` contains the phrase *"Never include secrets, API keys, tokens, or personal data..."*. In `fodda-mcp`, `npm run build` executes `scripts/generate-tools-manifest.mjs`, which enforces a hard regex guard (`/\b(?:tokens?|via SPT)\b/i` at line 127) that **fails the build** if any tool description contains the word `"tokens"`. Using Clerk's package or default description verbatim breaks the build unless `"tokens"` is rewritten to `"credentials"`.
3. **Context Cost (~383 tokens) & Tool Budget Invariant:** The tool description and 7-field schema add ~383 tokens per LLM turn. With **56 tools** already in `tools-manifest.json` (and **28 tools** in the curated `/claude` profile), adding a 57th standalone tool violates Fodda House Rule 1 (*"Consolidate, don't multiply"*), especially since Fodda already has `send_feedback` (`src/toolHandlers.ts:6746`).
4. **Severe Behavioral Risk (Agent Premature Bailout):** Clerk's tool description prompts agents: *"Call it... whenever: none of these tools could do what the task needed (the most useful kind of report)..."*. On multi-tool research servers like Fodda, this instruction encourages LLMs (Claude, GPT-4o) to bail out and call `submit_feedback` on routine empty graph searches instead of following `next_moves` guidance or pivoting to sibling tools (`search_graph` → `search_insights` → `get_supplemental_context`).
5. **Enterprise Privacy & Zero Retention Violation Risk:** AI agents autonomously populate `task` and `description` with customer prompts, brand names, and attempted search queries. For enterprise customers under Fodda's `zeroQueryRetention` contract, forwarding agent-authored narratives to Clerk's third-party servers breaches data isolation guarantees.
6. **Redundant with Superior Native Telemetry:** Fodda already runs zero-token, automated server-side telemetry:
   - **Coverage Gap Alerts:** Automatic real-time Slack alerts to `#fodda-research` (`C0AU0403M3M`) via `buildGapAlertText` (`src/sessionTracker.ts:79`).
   - **Frustration Detection:** Automatic detection of `LOW_YIELD`, `NO_MATCH`, and `GRAPH_BOUNCING` streaks posted to `#fodda-sales` (`src/sessionTracker.ts:286`).
   - **Airtable `Question Sessions` (`tblvHx1DzwuTq3TJE`):** Persistent query and coverage logging via `Fodda API`.
   - **Native `send_feedback` Tool (`src/toolHandlers.ts:6746`):** Already routes feedback to Slack (`<@U0AU49JG7AS>`), Resend email (`piers.fawkes@psfk.com`), and local telemetry while honoring `sessionTracker.isZeroQueryRetention()`.

### Recommendation
**DECLINE** adding `submit_feedback` as a standalone 57th tool. Keep Fodda's zero-token server-side telemetry (`sessionTracker.ts` + Slack + Airtable) as the primary mechanism for detecting agent roadblocks. If explicit agent-invoked feedback on `/claude` is ever desired, expose or extend the existing `send_feedback` tool (adding an `'agent_friction'` category) rather than multiplying tools or introducing a third-party Clerk telemetry sink.

---

## 2. Technical Footprint & Reference Inspection

### 2.1 Package & Wire Protocol (`@clerk/mcp-tools@0.8.0`)
Inspection of the unpacked npm tarball (`@clerk/mcp-tools/dist/feedback.mjs` and `dist/feedback.d.mts`) confirms the exact wire contract:

* **Tool Name:** `submit_feedback`
* **Endpoint:** `POST https://api.clerk.com/v1/feedback`
* **Timeout:** `10,000ms` (`AbortSignal.timeout(10000)`)
* **Authentication:** `Authorization: Bearer <CLERK_SECRET_KEY>`
* **HTTP Headers:**
  * `Authorization: Bearer sk_live_...` (Clerk Secret Key)
  * `Content-Type: application/json`

### 2.2 Exact Input Schema & Wire Payload
`@clerk/mcp-tools` defines 4 required fields (`kind`, `task`, `description`, `impact`) and 3 optional fields (`operation`, `error`, `suggestion`):

```json
{
  "kind": "missing" | "broken" | "confusing" | "idea",
  "task": "Short phrase naming what the user asked (1-200 chars, required)",
  "description": "What the agent tried, including tool calls made, and what went wrong (1-4000 chars, required)",
  "impact": "blocked" | "worked_around" | "friction",
  "operation": "Tool name involved, stripped of mcp__*__ prefix (optional, max 200 chars on wire)",
  "error": "Exact error string received with secrets removed (optional, max 4000 chars)",
  "suggestion": "What would have helped (optional, max 2000 chars)",
  "source": {
    "type": "mcp",
    "name": "fodda-mcp",
    "version": "1.46.140"
  },
  "reporter": {
    "type": "agent",
    "name": "claude" | "chatgpt" | "cursor",
    "version": "1.0.0"
  },
  "user_id": "user_... (optional)",
  "client_id": "client_... (optional)"
}
```

### 2.3 Response Contract
* **Clerk API `200 OK` Body:** `{ "id": "fdbk_...", "created_at": "2026-11-05T..." }`
* **MCP Tool Output:**
  ```json
  {
    "feedback_id": "fdbk_...",
    "received": true
  }
  ```
* **On Error (`429` or `5xx`):** Returns `{ isError: true, content: [{ type: "text", text: "Feedback could not be sent. Do not retry; continue with the task." }] }`.

### 2.4 Why `@clerk/mcp-tools` Should NOT Be Installed as a Dependency
1. **Peer/Transitive Mismatch:** `@clerk/mcp-tools@0.8.0` imports `zod/v4` (`import { z } from "zod/v4"`) and `@modelcontextprotocol/sdk: ^1.29.0`.
2. **Build Guard Failure:** Its hardcoded `SUBMIT_FEEDBACK_DESCRIPTION` includes the word `"tokens"`, which triggers the build-time Cost Silence Guard in `scripts/generate-tools-manifest.mjs:127`.
3. **Zero Need:** The entire implementation is a single `fetch('https://api.clerk.com/v1/feedback', ...)` call.

---

## 3. Credential & Transport Mechanics in Fodda

### 3.1 Secret Management Audit
We inspected Google Secret Manager across both `fodda-mcp` and `fodda-api` GCP projects:
* **GCP Project `fodda-api`:** `CLERK_SECRET_KEY` exists (created `2026-08-01`).
* **GCP Project `fodda-mcp`:** Only contains `AIRTABLE_API_KEY`, `FODDA_INTERNAL_API_KEY`, `FODDA_MCP_SECRET`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, and `RESEND_API_KEY`. `CLERK_SECRET_KEY` is **not** present in `fodda-mcp`, nor is it mounted in `deploy_cloud_run.sh`.
* **Architectural Boundary:** Currently, `fodda-mcp` never talks to Clerk's Backend API directly. When a client authenticates via Clerk OAuth on `/claude` or `/mcp` (`src/index.ts:1192–1238`), `fodda-mcp` sends the Bearer token to `Fodda API` (`POST ${API_BASE_URL}/v1/auth/clerk-resolve`) using `X-Internal-Key: FODDA_INTERNAL_API_KEY`, and caches the resolved `{ apiKey, userId }` in Firestore (`mcp_oauth_tokens`).
* Keeping `CLERK_SECRET_KEY` isolated in `fodda-api` rather than duplicating it into `fodda-mcp` is cleaner and maintains strict secret least-privilege.

### 3.2 User Attribution in the Clerk Dashboard
In `@clerk/mcp-tools`, user attribution relies on `isClerkAuthInfo(authInfo)` reading `authInfo.extra.userId` (`user_2x...`) and `authInfo.clientId` (`client_...`).
* In `fodda-mcp`, `/v1/auth/clerk-resolve` resolves the token into a Fodda `apiKey` and Fodda `userId` (typically the user's email or account ID), and many connections use direct API keys (`sk_live_...`), trial tokens (`sk_trial_...`), `/c/:token` connection URLs, or SPT tokens (`spt_...`).
* Consequently, unless `clerk-resolve` also returned the raw Clerk `user_id` and the client authenticated via Clerk OAuth, feedback entries in Clerk's dashboard would appear unlinked to Clerk user records.

---

## 4. Context Overhead & Scoped Profiles Evaluation

### 4.1 Token Cost Measurement
| Component | Characters | Estimated Tokens |
|---|---|---|
| Tool Name (`submit_feedback`) | 15 | 3 |
| Tool Description | 425 | ~95 |
| Input Schema (7 properties, enums, length bounds, descriptions) | 1,120 | ~260 |
| Tool Annotations (`readOnlyHint`, `openWorldHint`, etc.) | 110 | ~25 |
| **Total Context Footprint** | **1,670** | **~383 tokens** |

### 4.2 Profile Placement & Manifest Generation Mechanics
Note how `fodda-mcp` manages tool profiles:
* **Retired `/sse`:** `/sse` and `/messages` were retired in `v1.46.85` (`src/index.ts:186` returns `410 Gone`). All active endpoints use Streamable HTTP.
* **Global `/mcp`:** `OFFERING_SCOPED_TOOLS['mcp']` is `undefined` (`src/index.ts:1167`), meaning `isToolCallable` (`src/toolHandlers.ts:485`) returns `true` for **every** tool registered via `server.tool()`. Similarly, `scripts/generate-tools-manifest.mjs:106` assigns `profiles: ['mcp', ...]` to every `server.tool()` registration.
* **Scoped `/claude` Profile:** `OFFERING_SCOPED_TOOLS['claude']` (`src/index.ts:421–450`) currently exposes **28 curated tools** (excluding `send_feedback` and onboarding tools).

| Placement Option | Evaluation | Verdict |
|---|---|---|
| **Option 1: Global (`/mcp`)** | Increases manifest from 56 to 57 tools; adds ~383 tokens to every `/mcp` session; duplicates `send_feedback`. | **REJECTED** |
| **Option 2: Scoped Claude (`/claude`)** | Increases `/claude` from 28 to 29 tools; risks premature agent bailout when graph queries return thin/empty coverage instead of following `next_moves`. | **REJECTED** |
| **Option 3: Dev / Diagnostic Profile (`/diagnostic`)** | Feasible only if `isToolCallable` in `src/toolHandlers.ts` explicitly gates `submit_feedback` out of `/mcp` when `offeringSlug !== 'diagnostic'`. | **NOT NEEDED (Keep Native)** |

---

## 5. Enterprise Data Privacy & Zero Retention Guardrails

### 5.1 Threat Model: What Autonomous Agents Submit
When an agent invokes `submit_feedback`, it autonomously synthesizes the user's prompt and its own tool call history into `task` and `description`:
```json
{
  "kind": "missing",
  "task": "Audit confidential Q3 DTC revenue margins for Client Acme",
  "description": "I called search_graph(query='Acme Q3 2026 internal margin breakdown', graph_id='retail') and get_node(node_id='acme_margin_2026'), which returned 0 results...",
  "error": "No matching trends found"
}
```
This payload leaks:
1. **Confidential user prompt intent** (`task` and `description`).
2. **Proprietary graph IDs, node IDs, and internal schema structures** (`description` and `error`).
3. **Potentially unredacted session identifiers, emails, or tokens** if echoed in `error` or `description`.

### 5.2 Zero Query Retention (`zeroQueryRetention`) Invariant
Fodda enforces `sessionTracker.isZeroQueryRetention()` across all outbound alerts (`src/sessionTracker.ts:92` and `src/toolHandlers.ts:6767`). Under a zero-retention contract:
* Raw queries are replaced with `'[zero-retention contract]'` even on Fodda's internal Slack channels.
* Transmitting agent-summarized prompts (`task`, `description`) to `https://api.clerk.com/v1/feedback` would send customer query context to a third-party processor, violating Fodda's zero-retention guarantee.

### 5.3 Mandatory Sanitization Filter
If any feedback payload is ever forwarded externally, it must pass through a strict sanitizer that blocks or fully redacts `zeroQueryRetention` sessions and scrubs PII, keys, emails, and graph node identifiers:

```typescript
export function sanitizeFeedbackPayload(
    report: {
        kind: 'missing' | 'broken' | 'confusing' | 'idea';
        task: string;
        description: string;
        impact: 'blocked' | 'worked_around' | 'friction';
        operation?: string;
        error?: string;
        suggestion?: string;
    },
    isZeroRetention: boolean
) {
    if (isZeroRetention) {
        return {
            kind: report.kind,
            task: '[zero-retention contract]',
            description: '[Client query and tool trace suppressed under zero-query-retention policy]',
            impact: report.impact,
            operation: report.operation ? scrubSensitiveText(report.operation) : undefined,
            error: undefined,
            suggestion: report.suggestion ? scrubSensitiveText(report.suggestion) : undefined,
        };
    }

    return {
        kind: report.kind,
        task: scrubSensitiveText(report.task),
        description: scrubSensitiveText(report.description),
        impact: report.impact,
        operation: report.operation ? scrubSensitiveText(report.operation) : undefined,
        error: report.error ? scrubSensitiveText(report.error) : undefined,
        suggestion: report.suggestion ? scrubSensitiveText(report.suggestion) : undefined,
    };
}

export function scrubSensitiveText(text: string): string {
    return text
        // Scrub email addresses
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
        // Scrub Fodda / Clerk / OAuth / GitHub tokens & keys
        .replace(/(?:sk_live_|sk_trial_|sk_test_|spt_|oat_|sess_|Bearer\s+|ghp_|token=|api_key=)[a-zA-Z0-9_\-\.]{6,}/gi, '[SECRET_REDACTED]')
        // Scrub connection URL tokens (/c/<token>)
        .replace(/\/c\/[a-zA-Z0-9_\-]{8,}/g, '/c/[TOKEN_REDACTED]')
        // Scrub UUIDs
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[UUID_REDACTED]');
}
```

---

## 6. Clerk vs. Native Slack/Airtable Telemetry

| Dimension | Fodda Native Telemetry (`sessionTracker.ts` + `send_feedback`) | Clerk `submit_feedback` (`api.clerk.com/v1/feedback`) |
|---|---|---|
| **Token Overhead** | **0 tokens** for `sessionTracker.ts` (server-side); `send_feedback` already counted in the 56 tools | **+383 tokens** per turn for a 57th tool |
| **Detection Reliability** | **100% deterministic** — triggers automatically on empty/thin coverage (`postGapToSlack`) and 3+ frustration signals (`LOW_YIELD`, `NO_MATCH`, `GRAPH_BOUNCING`) | **Non-deterministic** — depends on the LLM deciding to call `submit_feedback`, which also causes premature bailouts |
| **Team Workflow & Alerting** | **Real-time push** to `#fodda-research` (`C0AU0403M3M`), `#fodda-sales`, and email (`piers.fawkes@psfk.com`) | **Passive pull** — buried in Clerk Dashboard (`Feedback` tab) unless polled via Clerk's MCP server |
| **Session & Identity Context** | Full Fodda context (`userId` email, `entryId`, `sessionSource`, `clientSlug`, `graphsTried`, `layers_searched`) + Airtable `Question Sessions` (`tblvHx1DzwuTq3TJE`) | Only links if authenticated via Clerk JWT with raw Clerk `user_id`; lacks Fodda graph/tier metadata |
| **Enterprise Zero-Retention** | Native `isZeroQueryRetention()` masking inside Fodda's boundary | Sends agent prose to third-party Clerk API |
| **Secret Footprint** | Uses existing `SLACK_BOT_TOKEN`, `RESEND_API_KEY`, `AIRTABLE_API_KEY` | Requires propagating `CLERK_SECRET_KEY` into `fodda-mcp` Cloud Run |

---

## 7. Concrete Implementation Specs (Reference Only — If Proceeded in Future)

If product leadership ever elects to wire `submit_feedback` into `fodda-mcp`, below are the exact, build-verified artifacts accounting for `fodda-mcp`'s build guards and `createServer` scope variables.

### 7.1 Native Handler & Registration (`src/toolHandlers.ts`)

> **Important Build Guard Note:** The description below replaces Clerk's word `"tokens"` with `"credentials"` so `scripts/generate-tools-manifest.mjs` line 127 (`/\b(?:tokens?|via SPT)\b/i`) passes during `npm run build`.

```typescript
    // --- submit_feedback (Clerk Agent Telemetry) ---
    server.tool(
        'submit_feedback',
        'Report a problem you ran into while doing a task for the user, so the team that runs this MCP server can fix it. Call it once per task, after you finish or give up, whenever: none of these tools could do what the task needed; a tool failed or returned something wrong or inconsistent; a tool or its documentation was unclear; or the user asks you to report something. You do not need to ask the user first. Never include secrets, API keys, credentials, or personal data about end users.',
        {
            kind: z.enum(['missing', 'broken', 'confusing', 'idea']).describe('What kind of problem: "missing" (no tool could do what the task needed), "broken" (a tool failed or returned something wrong), "confusing" (a tool or its documentation was unclear), or "idea" (a suggestion that would have helped).'),
            task: z.string().trim().min(1).max(200).describe('A short phrase naming what the user asked you to do.'),
            description: z.string().trim().min(1).max(4000).describe('What you tried, including each tool call you made, and what went wrong or was confusing. Include both.'),
            impact: z.enum(['blocked', 'worked_around', 'friction']).describe('How the task ended: "blocked" (could not finish), "worked_around" (finished another way), or "friction" (finished, but it was harder than it should be).'),
            operation: z.string().trim().max(1000).optional().describe('Name of the tool the problem is about, such as search_graph. Omit it when no tool was involved.'),
            error: z.string().trim().max(4000).optional().describe('The exact error you received, with any secrets removed.'),
            suggestion: z.string().trim().max(2000).optional().describe('What would have helped.'),
        },
        {
            title: 'Send feedback',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        } as any,
        async (args) => {
            const isZeroRetention = sessionTracker.isZeroQueryRetention();
            const sanitized = sanitizeFeedbackPayload(args, isZeroRetention);
            const cleanOperation = sanitized.operation
                ? sanitized.operation.replace(/\bmcp__[^_\s,/]+(?:_[^_\s,/]+)*?__/g, '').slice(0, 200)
                : undefined;

            // Always record in local telemetry buffer
            recordFeedbackEntry(`agent_${sanitized.kind}`, `[${sanitized.impact}] ${sanitized.task}: ${sanitized.description}`, userId);

            const clerkSecretKey = process.env.CLERK_SECRET_KEY;
            if (!clerkSecretKey || isZeroRetention) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ feedback_id: 'local_logged', received: true }),
                    }],
                };
            }

            try {
                const response = await fetch('https://api.clerk.com/v1/feedback', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${clerkSecretKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        kind: sanitized.kind,
                        task: sanitized.task.slice(0, 200),
                        description: sanitized.description.slice(0, 4000),
                        impact: sanitized.impact,
                        ...(cleanOperation ? { operation: cleanOperation } : {}),
                        ...(sanitized.error ? { error: sanitized.error.slice(0, 4000) } : {}),
                        ...(sanitized.suggestion ? { suggestion: sanitized.suggestion.slice(0, 2000) } : {}),
                        source: {
                            type: 'mcp',
                            name: 'fodda-mcp',
                            version: MCP_SERVER_VERSION,
                        },
                        reporter: {
                            type: 'agent',
                            name: clientSlug || sessionSource || 'mcp-client',
                        },
                        ...(userId && !isPlaceholderUserId(userId) ? { user_id: userId } : {}),
                    }),
                    signal: AbortSignal.timeout(10000),
                });

                const body = await response.json().catch(() => null) as { id?: string } | null;
                if (!response.ok || !body?.id) {
                    console.error(`[submit_feedback] Clerk rejected feedback with status ${response.status}`);
                    return {
                        isError: true,
                        content: [{
                            type: 'text' as const,
                            text: 'Feedback could not be sent. Do not retry; continue with the task.',
                        }],
                    };
                }

                const result = { feedback_id: body.id, received: true };
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(result),
                    }],
                    structuredContent: result,
                };
            } catch (err: any) {
                console.error(`[submit_feedback] Network error: ${err?.message}`);
                return {
                    isError: true,
                    content: [{
                        type: 'text' as const,
                        text: 'Feedback may not have been received. Do not retry; continue with the task.',
                    }],
                };
            }
        }
    );
```

### 7.2 `scripts/generate-tools-manifest.mjs` & `tools-manifest.json` Schema
Because `tools-manifest.json` is auto-generated by `scripts/generate-tools-manifest.mjs` during `npm run build`, adding `submit_feedback: 'Account'` to the `CATEGORY` map in `scripts/generate-tools-manifest.mjs` (line 63) produces the following manifest entry:

```json
    {
      "name": "submit_feedback",
      "kind": "tool",
      "bills_as": "free",
      "category": "Account",
      "profiles": [
        "mcp"
      ],
      "description": "Report a problem you ran into while doing a task for the user, so the team that runs this MCP server can fix it. Call it once per task, after you finish or give up, whenever: none of these tools could do what the task needed; a tool failed or returned something wrong or inconsistent; a tool or its documentation was unclear; or the user asks you to report something. You do not need to ask the user first. Never include secrets, API keys, credentials, or personal data about end users."
    }
```

---

## 8. Final Decision Matrix

| Evaluation Criterion | Finding | Grade |
|---|---|---|
| **Technical Feasibility** | 35-line native `fetch` to `POST https://api.clerk.com/v1/feedback`; no npm dependency required. | High |
| **Build Guard Compatibility** | Clerk's default description includes `"tokens"`, which fails `scripts/generate-tools-manifest.mjs:127` unless edited. | Caution |
| **Context Token Cost** | ~383 tokens per turn; expands manifest to 57 tools (`send_feedback` already exists). | Negative |
| **Agent Behavior Impact** | Encourages premature bailout on empty/thin searches instead of following `next_moves`. | Negative |
| **Enterprise Privacy (`zeroQueryRetention`)** | High risk of leaking prompt text and graph queries to a third-party endpoint unless suppressed. | High Risk |
| **Signal vs. Native Telemetry** | Inferior to `sessionTracker.ts` automatic `#fodda-research` / `#fodda-sales` Slack alerts and Airtable `Question Sessions`. | Low Value |
| **Overall Recommendation** | **DECLINE Standalone Tool — Keep Native Telemetry** | **NO-GO** |
