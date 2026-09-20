# Brief — BYO-MCP Domain & Voice Study Alignment

**For:** Website Agent (`/Fodda Website`) & MCP Agent (`/Fodda MCP`)  
**From:** Piers & Antigravity (post-incident investigation: Steve Bryant BYO-MCP onboarding topic drift, Sep 20, 2026)  
**Status:** Ready for pickup  

---

## 1. Problem & Context

When an expert onboards with a Bring-Your-Own-MCP (BYO-MCP) endpoint, their MCP represents their specialized knowledge asset (e.g. Steve Bryant connecting `https://games.thisisdelightful.com/mcp`, indexing 923 curated video game publications across 26 countries).

Concurrently, experts provide a Voice Study (via Claude conversation analysis). Because the Voice Study prompt analyzes their career-spanning chat history, it frequently captures their general consulting or executive hat (e.g. Steve's 15+ years in brand, content, and cultural strategy across enterprise tech, media, and telecom).

### The Defect:
1. **Unconstrained Voice Study Precedence:** The profile generation pipeline currently uses the Voice Study's `one_liner` and `self_described_role` verbatim for `Description`, `askLine`, and `signatureInsights`.
2. **Topic Erasure:** The MCP's actual subject matter (e.g. Video Games) is relegated to a metadata tag, producing a profile dominated by abstract consulting philosophy (*"settles contemporary arguments by going back to the original document"*, *"cultural primary sources"*) that conceals the expert's actual commercial domain.
3. **Missing Admin Review Email on MCP Channel:** Because the Claude MCP onboarding path bypassed the web submission endpoint, Email 2 (Admin Review notification with Approve/Reject links to `piers.fawkes@psfk.com`) was never sent.

---

## 2. Architecture & Invariants

* **Voice Study** defines **HOW** the agent thinks, reasons, and speaks (tone, register, vocabulary, reasoning structure).
* **MCP Source** defines **WHAT** the agent speaks about (domain, topics, industry data, commercial applications).
* **Core Invariant:** A Human Agent profile must **never** present abstract methodology in place of domain substance. The profile must fuse the expert's strategic voice with the connected MCP's domain asset.

---

## 3. Required Changes

### A. Fodda MCP (`/Fodda MCP/src/systemPrompt.ts` & `toolHandlers.ts`)
1. **Interactive Topic Reconciliation:**
   - In `submit_mcp_source`, after probing the endpoint and extracting tools/categories, Claude must explicitly ask the expert to reconcile their voice with their MCP:
     > *"We see your MCP endpoint focuses on **[Discovered Domain: e.g. Video Games & Gaming Culture]**, while your background is in **[Role: e.g. Brand & Cultural Strategy]**. We recommend introducing your Human Agent as: **'[Role] specializing in [MCP Domain]'**. Does that align with how you want to be discovered?"*
   - Record the reconciled title and confirmed domain in `finalize_byo_mcp_onboarding`.

### B. Fodda Website (`/Fodda Website/server.js`)
1. **Domain-Constrained Profile Synthesis (`POST /api/onboard-expert`):**
   - In `buildServerExpertCard()` and related bio synthesis helpers: when an expert provides an `mcpUrl` or `byoMcp` config, inject the MCP domain topics as a mandatory constraint into the LLM prompt.
   - Prohibit abstract meta-methodology (*"primary documents"*, *"original sources"*) from occupying the lead sentence of `Description` or `askLine`.
   - Formula: `[Role Title] — [Specialization in MCP Topic]. [How they use their data asset to solve client problems].`
2. **Universal Admin Review Dispatch:**
   - Ensure that `finalize_byo_mcp_onboarding` (and any administrative reconciliation path) reliably triggers Email 2 (`New expert to review: [Name]`) to `process.env.ADMIN_CC_EMAIL || "piers.fawkes@psfk.com"`.

---

## 4. Acceptance Criteria
1. Onboarding an MCP endpoint with games tools + a general strategy voice study generates a bio stating: *"Brand strategist specializing in video games..."* instead of abstract document-analysis philosophy.
2. The `askLine` includes both the action and the topic domain (`Ask [Name]^[HA] to guide your brand strategy across video games...`).
3. `piers.fawkes@psfk.com` receives Email 2 with one-click approval links whenever an expert completes onboarding via any channel.
