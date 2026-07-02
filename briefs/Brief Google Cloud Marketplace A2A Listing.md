# Brief: Google Cloud Marketplace — A2A Agent Listing

**Priority:** High — enterprise distribution channel  
**Status:** Vendor application submitted 2026-05-17, awaiting approval email  
**Agent:** MCP + Sales

---

## What We've Done

1. ✅ **Created Gemini Enterprise app** — `fodda_1779044845082` on project `gen-lang-client-0972731824`
2. ✅ **Registered Fodda as A2A agent** — Agent ID `5017368423920345753`, state ENABLED, type "A2A (Custom)"
3. ✅ **Agent card synced** — Full 6-skill card from `www.fodda.ai/.well-known/agent-card.json`
4. ✅ **A2A endpoint live** — `POST https://mcp.fodda.ai/a2a` responds to JSON-RPC 2.0 `message/send`
5. ✅ **Vendor application submitted** — Via Google Cloud Partner enrollment form

> [!IMPORTANT]
> Step 2 registered Fodda on **our own** Gemini Enterprise instance. The Marketplace listing (below) makes Fodda discoverable to **all** Gemini Enterprise customers — Salesforce, Microsoft partner agents, enterprise buyers, etc.

---

## What's Next (After Vendor Approval)

Once Google approves the vendor application, we get access to the **Producer Portal**. The listing workflow from the docs:

### 1. Add Your AI Agent
- Select **"AI Agents as a Service (A2A protocol)"** as the product type
- This is distinct from SaaS, Kubernetes, or VM-based listings

### 2. Add Product Details
- Product name, description, icon, screenshots
- Category selection (Consumer Intelligence / Analytics / Research)
- Company information (PSFK / Fodda)

### 3. AI Agent Listing Requirements & Metadata
- Agent description optimized for enterprise discovery
- Use case examples
- Supported industries/verticals
- Integration documentation

### 4. Add Pricing Information
Google supports these pricing models for A2A agents:
- **Subscription-based** — monthly/annual flat fee
- **Usage-based** — per API request, per token, or custom metric
- **Combined** — base subscription + usage overage
- **Free trial** — optional trial period

**Recommended for Fodda:**
| Tier | Price | Includes |
|---|---|---|
| Standard | $10 per 1,000 API requests | All graph access |
| Pro | Custom metric (per research report) | Deep research + brand tracker |
| Enterprise | Contact sales | Dedicated graphs + SLA |

Custom metric option: `$10 per 1000 API requests` (maps to Fodda's token model)

### 5. Add Your Agent Card
- Upload the agent card JSON (already deployed at `www.fodda.ai/.well-known/agent-card.json`)
- Must include: skills, capabilities, input/output modes

### 6. Integrate with Cloud Marketplace
- Connect billing (Stripe or Google's procurement API)
- Set up entitlement provisioning (auto-create Fodda API keys on purchase)
- Health check endpoint verification

### 7. Publish
- Submit for Google review
- Goes live on Cloud Marketplace once approved

---

## Pre-Work (Do Before Approval Arrives)

### MCP Agent Tasks
- [ ] **Fix A2A part format compatibility** — see `Brief A2A Part Format Fix.md`
- [ ] **Add health check endpoint** — Google may probe `GET /a2a` or a dedicated `/health` for marketplace listings
- [ ] **Ensure the agent card at `www.fodda.ai/.well-known/agent-card.json` is canonical** — Google references this URL

### Sales Agent Tasks
- [ ] **Prepare marketplace listing copy** — product description, screenshots, use case examples
- [ ] **Prepare pricing tiers** — map Fodda token model to Google's usage-based pricing
- [ ] **Prepare integration docs** — how enterprise customers connect their agents to Fodda

### API Agent Tasks
- [ ] **Marketplace entitlement webhook** — auto-provision API keys when a customer subscribes via Google Cloud Marketplace
- [ ] **Usage reporting API** — report consumption back to Google for usage-based billing

---

## Why This Matters

Google Cloud Marketplace A2A is where enterprise agents live. When a Salesforce agent, a Microsoft Copilot extension, or any enterprise AI system running on GCP needs consumer intelligence, trend analysis, or retail insights — they'll discover Fodda here. This is the distribution channel that matters disproportionately because:

1. **Enterprise buyers purchase through Marketplace** — committed spend, procurement compliance
2. **Agent discovery is automated** — Gemini routes tasks to registered A2A agents
3. **Billing is handled** — Google manages invoicing, reducing Fodda's sales friction
4. **Trust signal** — listed alongside Salesforce, Microsoft, and Google's own agents

---

## Reference Links

- Vendor signup: https://cloud.google.com/marketplace/docs/partners/get-started
- A2A agent listing docs: https://cloud.google.com/marketplace/docs/partners/ai-agents
- Pricing models: https://cloud.google.com/marketplace/docs/partners/pricing-models-for-ai-agents
- Producer Portal: https://partners.cloud.google.com/
- Current agent registration: https://console.cloud.google.com/gemini-enterprise/locations/global/engines/fodda_1779044845082/overview/dashboard?project=gen-lang-client-0972731824
