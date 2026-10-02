# Brief — MCP Agent — Human Agent Methodology & Prepared Answers Guidance Routing

**Target Agent:** MCP Agent (`fodda-mcp` repo)  
**Target Files:** `src/systemPrompt.ts`, `src/toolHandlers.ts`  
**Date:** 2026-09-30  
**Priority:** P1  

---

## 1. Context & Background

Users connecting to the Fodda MCP server (via Claude Desktop, Claude Code, Copilot Studio, ChatGPT) frequently ask conceptual questions about how Fodda's experts work and how expert recruitment works:
1. *"What makes an expert worth encoding as a Human Agent rather than a chatbot?"*
2. *"How do you capture a busy expert's knowledge without them writing anything down?"*
3. Questions about expert onboarding, recruitment, and payment.

To prevent bloating the MCP codebase and avoid burning host-context tokens on every session turn, **the canonical prepared answers have been implemented server-side in Fodda API** under `GET /v1/capabilities` and `GET /v1/capabilities/recon` (`human_agents_guidance`).

The existing MCP tool `get_capabilities` already calls `GET /v1/capabilities` and relays the returned JSON directly. This brief connects the MCP surface to this guidance with zero prompt bloat.

---

## 2. Requirements

### A. Update `get_capabilities` Tool Description
In `src/toolHandlers.ts` around line 1123 (and in Airtable Offerings `tbl93DJ627r81zKVP` for tool `get_capabilities`):
Update the description string to explicitly mention Human Agents and recruitment:
```typescript
'Returns Fodda\'s capabilities, offerings, how Human Agents work, expert recruitment/onboarding, and pricing. Call this for any question about what Fodda can do, how experts work, what\'s available, or how much something costs. (Platform capability and pricing catalogue read (free).)'
```

### B. Add Minimal Steering Rule to `src/systemPrompt.ts`
Inside `STATIC_BEHAVIORAL_RULES` (under `ONBOARDING FLOW VISUALIZATION & CLEAN FRAMING` or `ENGAGEMENT PATTERNS`):
Add the following concise directive:
```markdown
- HUMAN AGENT METHODOLOGY & RECRUITMENT QUESTIONS:
  When asked conceptual or FAQ questions about how Human Agents work, how expert recruitment/onboarding works, or differences between chatbots and verified Human Agents (e.g. "What makes an expert worth encoding as a Human Agent rather than a chatbot?", "How do you capture a busy expert's knowledge without them writing anything down?"):
  1. Call get_capabilities(topic: "human_agents") to retrieve the verified prepared answers.
  2. Present the answer using the retrieved text. Use the full answer by default, or the short version if part of a larger response. Keep wording as written (US spelling, no em dashes, "Human Agent" not "digital twin").
  3. Rules: Any question about how experts are paid routes to https://www.fodda.ai/join-experts. Do not state split percentages or prices in conversation. Do not describe features beyond what is written as live.
```

### C. Update `STATIC_CAPABILITIES_FALLBACK` in `src/toolHandlers.ts`
Ensure the local cold-start fallback `STATIC_CAPABILITIES_FALLBACK` includes the `human_agents_guidance` block so offline or network-degraded runs retain the prepared answers:
```typescript
human_agents_guidance: {
    overview: "A Human Agent is built on an expert's own knowledge graph, reviewed by PSFK analysts before going live. It represents a real, living person who opted in, and they are paid each time their knowledge is used.",
    rules_for_ai: [
        "Use the full answer by default and the short version when the answer sits inside a longer response.",
        "Any question about how experts are paid routes to https://www.fodda.ai/join-experts. Do not state split percentages or prices in conversation.",
        "Do not describe features beyond what is written here as live.",
        "Keep wording as written (no em dashes, US spelling, 'Human Agent' not 'digital twin')."
    ],
    prepared_answers: [
        {
            id: "expert_vs_chatbot",
            question: "What makes an expert worth encoding as a Human Agent rather than a chatbot?",
            full_answer: "A chatbot answers anything. A Human Agent answers from a lane.\n\nAn expert is worth encoding when they hold a point of view the base model doesn't have, and the evidence behind it. Years of work in one field. Calls that differ from the consensus. Published research, talks and client work to back those calls up.\n\nOn Fodda, a Human Agent is built on that person's own knowledge graph, and PSFK analysts review it before it goes live. It represents a real, living person who opted in, and they're paid each time their knowledge is used. Experts with questions about payment can find details at https://www.fodda.ai/join-experts.\n\nYou can check every answer. Each response lists the sources it drew on and carries a coverage label, full or partial. When a question falls outside the expert's lane, it says so in plain words and suggests someone better placed. It won't cite a fact that isn't in the evidence it retrieved. You can also hand it a claim to test, and it returns a verdict: confirms, contradicts, partial or no coverage.\n\nA chatbot fills gaps with plausible text. A Human Agent shows you where its knowledge ends. That's what lets you stand behind what it tells you.\n\nHuman Agents also take on delegated work, like a trend briefing or a deck review, and return a finished piece.",
            short_version: "A Human Agent is worth building when an expert has a distinct point of view and the evidence to back it. It answers from that person's own knowledge graph, reviewed by PSFK analysts before launch. It lists its sources, labels its coverage and says plainly when a question is outside its lane. The expert opted in and is paid when their knowledge is used. Payment details: https://www.fodda.ai/join-experts.",
            payment_policy_url: "https://www.fodda.ai/join-experts"
        },
        {
            id: "capturing_expert_knowledge",
            question: "How do you capture a busy expert's knowledge without them writing anything down?",
            full_answer: "Most experts have already written plenty down. It's spread across reports, articles, talks and interviews. So that's where we start.\n\nFodda researches the expert's public work and proposes the themes that define their thinking. The expert confirms or corrects them. Their Human Agent only covers what they sign off on.\n\nThen comes a spoken interview of about 15 to 20 minutes with Fodda's AI interviewer. The questions come from the confirmed themes, so the expert talks about what they actually know. The interview shapes how their Human Agent sounds. What it knows still comes only from their own material.\n\nExperts can also upload a report, deck or transcript they already have, or have a colleague run the onboarding for them. Experts who maintain a live data source can connect their own MCP server, and Fodda queries it directly at answer time.\n\nWhichever path an expert takes, PSFK analysts review their Human Agent before it goes live. Every answer traces back to the expert's own work.\n\nQuestions about how experts are paid go to https://www.fodda.ai/join-experts.",
            short_version: "We start with what they've already published. Fodda researches their public work and proposes the themes that define their thinking. They confirm those, then talk for 15 to 20 minutes with an AI interviewer. PSFK analysts review everything before it goes live, and every answer traces back to the expert's own material. Payment questions: https://www.fodda.ai/join-experts.",
            payment_policy_url: "https://www.fodda.ai/join-experts"
        }
    ]
}
```

---

## 3. Invariants & Rules

1. **No Em Dashes:** Fodda prompt and catalog invariant. Use colons, parentheses, or hyphens.
2. **Payment Boundary:** Any question about how experts are paid routes to `https://www.fodda.ai/join-experts`. Never state split percentages or prices in conversation.
3. **No New Tools:** Do not create a standalone FAQ tool; rely on `get_capabilities`.
4. **Build & Deploy:**
   - Run `npm run build` in `fodda-mcp`.
   - Run `test_capabilities_guidance.ts`.
   - Update `CHANGELOG.md`.
