# Connecting Fodda to Claude Tag (MCP Setup Guide)

> **Audience:** Workspace admins on Claude Enterprise or Team plans  
> **Time to complete:** ~10 minutes  
> **Result:** Anyone in your Slack channel can `@Claude` and get Fodda trend intelligence, brand analysis, and market research — no individual logins required.

---

## Prerequisites

Before you begin, confirm you have:

| Requirement | Where to get it |
|---|---|
| **Fodda account with API access** | [app.fodda.ai](https://app.fodda.ai) |
| **Fodda API key** | Generated in your Fodda dashboard under **Settings → API Keys** |
| **Claude Enterprise or Team plan** | Claude Tag MCP connectors are not available on free or Pro plans |
| **Claude Tag admin role** | Your Slack workspace admin or Claude Tag admin must grant this |
| **Claude Tag installed in Slack** | The Anthropic Claude app must be added to your Slack workspace |

---

## Step 1: Get Your Fodda API Key

1. Sign in at [app.fodda.ai](https://app.fodda.ai).
2. Navigate to **Settings → API Keys**.
3. Click **Generate New Key**.
4. Copy the key and store it securely — you will not be able to view it again.

> [!IMPORTANT]
> One API key covers an entire channel. Every user who `@Claude` in that channel meters against the same credit pool. Generate a dedicated key per channel if you need separate billing visibility.

---

## Step 2: Add Fodda as a Claude Tag Connector

1. Open [claude.ai](https://claude.ai) and sign in with your admin account.
2. Go to **Admin Settings → Integrations → Claude Tag**.
3. Under **MCP Tool Connectors**, click **Add Connector**.
4. Enter a display name — for example, `Fodda Trend Intelligence`.

---

## Step 3: Configure Endpoint URL and Authentication

In the connector configuration form, enter the following:

### Endpoint

```
https://mcp.fodda.ai/mcp
```

This is a **Streamable HTTP** endpoint (the primary transport Fodda supports). No additional transport configuration is needed.

> [!NOTE]
> Fodda also exposes a legacy SSE endpoint at `https://mcp.fodda.ai/sse`. Use the primary `/mcp` endpoint unless Anthropic's documentation specifically requires SSE.

### Authentication

Set the authentication type to **Bearer Token** and paste your Fodda API key:

| Field | Value |
|---|---|
| **Auth type** | Bearer Token |
| **Token** | `<your Fodda API key>` |

Claude Tag sends this as the `Authorization: Bearer <API_KEY>` header on every MCP request.

#### Example header (for reference)

```
Authorization: Bearer fod_a1b2c3d4e5f6...
```

#### Alternative auth methods (advanced)

Fodda also accepts credentials via query string or a custom header. These are useful if your proxy or gateway strips `Authorization` headers:

```
# Query string
https://mcp.fodda.ai/mcp?api_key=YOUR_KEY&user_id=admin@yourcompany.com

# Custom header
X-API-Key: YOUR_KEY
```

In most Claude Tag setups, the Bearer Token method is sufficient.

---

## Step 4: Select Tools for Your Channel

After saving the connector, Claude Tag will discover Fodda's 31 available tools. You do **not** need to enable all of them. Select tools based on what the channel needs.

### Recommended starter set

These five tools cover the most common requests and work well with natural-language prompts:

| Tool | What it does | Cost |
|---|---|---|
| `search_graph` | Search 100+ knowledge graphs for trends. Works with just a query — no extra parameters needed. | 1 call |
| `brand_tracker` | Generate a complete brand intelligence profile. | Varies |
| `get_supplemental_context` | Pull real-time market data from 80+ sources. | 5 calls |
| `deep_research_topic` | Run an autonomous deep-research report on any topic. | 20–30 calls |
| `brainstorm_topic` | Explore connections, adjacencies, and creative angles. | 1 call |

### Don't forget the companion polling tools

Two tools return results asynchronously. If you enable either one, **you must also enable its polling companion** or Claude will not be able to retrieve the results:

| Async tool | Required companion |
|---|---|
| `get_supplemental_context` | `check_supplemental_status` |
| `deep_research_topic` | `check_research_status` |

> [!WARNING]
> If the polling tool is missing, Claude will call the async tool, receive a job ID, and then have no way to fetch the completed results. Always assign them as a pair.

### Additional tool to consider

| Tool | What it does | Cost |
|---|---|---|
| `consult_analyst` | Talk to synthetic expert analysts for domain-specific perspectives. | 1 call |

---

## Step 5: Test with a Sample Query

Once the connector is saved and tools are assigned to a channel:

1. Open the Slack channel where Claude Tag is active.
2. Post a message that invokes Fodda:

```
@Claude What are the top emerging trends in regenerative agriculture?
```

Claude will call `search_graph` (or whichever tool it deems appropriate) and return results inline.

### Other test prompts to try

```
@Claude Give me a brand intelligence report on Patagonia.
```

```
@Claude Run a deep research report on the future of lab-grown meat.
```

```
@Claude What supplemental market context exists for plant-based dairy in the EU?
```

If the response includes trend data, citations, or a job-status message, the connection is working.

---

## Billing & Credit Metering

All Fodda API usage through Claude Tag is metered against the API key you configured — not against individual Slack users.

### Cost per tool call

| Tool type | Credit cost per invocation |
|---|---|
| Standard tools (`search_graph`, `brainstorm_topic`, `consult_analyst`, etc.) | 1 API call |
| Deep research (`deep_research_topic`) | 20–30 API calls |
| Supplemental context (`get_supplemental_context`) | 5 API calls |
| Brand intelligence (`brand_tracker`) | Varies by scope |

### What happens when credits run out

When the API key's credit pool is exhausted, Fodda returns a structured error response that includes:

- A clear message indicating credit exhaustion
- A link to upgrade or purchase additional credits

Claude will surface this message to the Slack user. No partial or degraded results are returned.

> [!TIP]
> Monitor your credit usage in the Fodda dashboard at [app.fodda.ai](https://app.fodda.ai). If a channel is burning through credits faster than expected, check whether `deep_research_topic` is being triggered frequently — each call costs 20–30x a standard call.

---

## Recommended Tool Sets by Team Type

Not every channel needs every tool. Use these presets as a starting point.

### Marketing

| Tool | Why |
|---|---|
| `search_graph` | Spot consumer and cultural trends |
| `brand_tracker` | Track brand perception and positioning |
| `brainstorm_topic` | Generate campaign angles and creative territory |
| `consult_analyst` | Get marketing-strategy perspectives |

### Strategy

| Tool | Why |
|---|---|
| `search_graph` | Landscape scanning and trend identification |
| `deep_research_topic` | In-depth competitive and market analysis |
| `check_research_status` | *(required companion)* |
| `get_supplemental_context` | Enrich strategy decks with live data |
| `check_supplemental_status` | *(required companion)* |

### Innovation

| Tool | Why |
|---|---|
| `search_graph` | Discover emerging signals and whitespace |
| `brainstorm_topic` | Map adjacencies and opportunity spaces |
| `deep_research_topic` | Validate innovation hypotheses with deep dives |
| `check_research_status` | *(required companion)* |
| `consult_analyst` | Stress-test ideas with synthetic domain experts |

### Research

| Tool | Why |
|---|---|
| `deep_research_topic` | Produce autonomous research reports |
| `check_research_status` | *(required companion)* |
| `get_supplemental_context` | Source real-time data from 80+ providers |
| `check_supplemental_status` | *(required companion)* |
| `search_graph` | Quick knowledge-graph lookups |

---

## Async Tools: How They Work

Most Fodda tools return results immediately. Two tools — `get_supplemental_context` and `deep_research_topic` — operate asynchronously because they aggregate data from many sources or run multi-step research workflows.

### The async flow

```
1. Claude calls the async tool (e.g., deep_research_topic)
2. Fodda returns a job ID immediately
3. Claude calls the polling tool (e.g., check_research_status) with the job ID
4. If the job is still running, Claude waits and polls again
5. When the job completes, Fodda returns the full results
6. Claude formats and posts the results in Slack
```

This happens automatically — the Slack user just sees a short wait followed by the completed output. No user intervention is required.

> [!NOTE]
> Deep research jobs can take 30–90 seconds to complete. Claude will poll automatically, but Slack users may notice a brief delay before results appear.

---

## Troubleshooting

### Invalid API key

**Symptom:** Claude responds with an authentication error or "unauthorized" message.

**Fix:**
1. Verify the API key in your Fodda dashboard — it may have been revoked or rotated.
2. In Claude Tag admin, edit the connector and re-paste the key.
3. Confirm there are no extra spaces or line breaks in the token field.

### Credit exhaustion

**Symptom:** Claude returns a message about insufficient credits with a link to upgrade.

**Fix:**
1. Log in to [app.fodda.ai](https://app.fodda.ai) and check your credit balance.
2. Purchase additional credits or upgrade your plan.
3. No connector reconfiguration is needed — calls will resume once credits are replenished.

### Timeout or no response

**Symptom:** Claude does not return results, or Slack shows a generic error.

**Fix:**
1. Confirm the endpoint URL is exactly `https://mcp.fodda.ai/mcp` (no trailing slash, no typos).
2. Check that the Fodda service status page does not show an outage.
3. For async tools, ensure the companion polling tool is assigned to the channel (see [Async Tools](#async-tools-how-they-work) above).

### Tool not found

**Symptom:** Claude says it cannot find a requested tool.

**Fix:**
1. In Claude Tag admin, verify the tool is enabled for the channel.
2. If the tool name was recently renamed or deprecated, check the Fodda changelog.

### "Job ID not found" on polling

**Symptom:** `check_research_status` or `check_supplemental_status` returns a "not found" error.

**Fix:**
1. Job IDs expire after a set window. If too much time has passed, re-run the original async tool.
2. Confirm you are using the correct polling tool for the job type (research vs. supplemental).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     SLACK WORKSPACE                      │
│                                                         │
│  User types: @Claude What are the trends in [topic]?    │
│                          │                              │
│                          ▼                              │
│                 ┌─────────────────┐                     │
│                 │   Claude Tag    │                     │
│                 │  (Anthropic AI) │                     │
│                 └────────┬────────┘                     │
└──────────────────────────┼──────────────────────────────┘
                           │
                           │  MCP Request (Streamable HTTP)
                           │  Authorization: Bearer <API_KEY>
                           ▼
                 ┌─────────────────┐
                 │  Fodda MCP API  │
                 │ mcp.fodda.ai/mcp│
                 └────────┬────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
     ┌────────────┐ ┌──────────┐ ┌───────────┐
     │ Knowledge  │ │  Brand   │ │   Deep    │
     │  Graphs    │ │  Intel   │ │ Research  │
     │ (100+)     │ │ Engine   │ │  Engine   │
     └────────────┘ └──────────┘ └───────────┘
            │             │             │
            ▼             ▼             ▼
     ┌────────────────────────────────────────┐
     │         Results returned to Claude     │
     │      Claude formats and posts in Slack │
     └────────────────────────────────────────┘
```

**Key points:**
- All traffic flows through a single MCP endpoint.
- Authentication is per-key, not per-user. One key covers the whole channel.
- All tools are **read-only** — Fodda never modifies your data or systems.
- Async tools (deep research, supplemental context) require Claude to poll for results before responding.

---

## Quick Reference

| Item | Value |
|---|---|
| **MCP Endpoint** | `https://mcp.fodda.ai/mcp` |
| **Legacy SSE Endpoint** | `https://mcp.fodda.ai/sse` |
| **Auth Header** | `Authorization: Bearer <API_KEY>` |
| **Alt Auth (query string)** | `?api_key=KEY&user_id=EMAIL` |
| **Alt Auth (header)** | `X-API-Key: KEY` |
| **Transport** | Streamable HTTP |
| **Total Tools** | 31 |
| **Tool Access** | Read-only |
| **Dashboard** | [app.fodda.ai](https://app.fodda.ai) |
