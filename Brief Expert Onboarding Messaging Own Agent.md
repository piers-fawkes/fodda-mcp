# Mini Brief: Expert Onboarding Messaging — Using Your Own Human Agent

## Objective
Every expert should learn, at the moment they're approved, that (a) their Human Agent is theirs to use, (b) it's free for them, and (c) getting it into Claude/ChatGPT takes one connector URL. Right now nothing in the onboarding thread tells them any of this.

## The facts the messaging must carry (all live as of 2026-07-02)
- Connector URL: **`https://mcp.fodda.ai/mcp`** — added as a custom connector in Claude, ChatGPT, or any MCP client, authenticated with the expert's Fodda API key.
- **Self-use is free**: consulting their own agent costs them nothing (fair-use cap of 25/day). Their agent pays standard rates only when it researches beyond their own knowledge graph.
- They ask for themselves by name: *"Consult {Expert Name} about {topic}"*.
- `GET /v1/analysts/me` (with their API key) returns their profile + a ready-made connect block — the "Your Agent" page (separate brief) renders this.

## Where to add messaging (three touchpoints)

### 1. Approval email ("Your agent is live")
Add a section after the approval announcement:

> **Use your own agent — free.**
> Your Human Agent isn't just for clients. Add it to Claude or ChatGPT and it becomes your own researcher — grounded in your knowledge, in your voice.
> 1. In Claude: Settings → Connectors → Add custom connector
> 2. URL: `https://mcp.fodda.ai/mcp` — API key: {their key or where to find it}
> 3. Try: *"Consult {Name}: what are the three trends my clients should be acting on this quarter?"*
> Using your own agent is free. It only incurs standard charges when it researches beyond your own knowledge — other experts' graphs, earnings data, market intelligence.

### 2. Onboarding completion screen (end of the join wizard)
One line under the "what happens next" copy: *"Once approved, your agent plugs into Claude and ChatGPT via a connector — and using it yourself is free."* Sets the expectation early; no setup detail here.

### 3. Interview confirmation email (if one is sent)
Same single line as #2. Anticipation, not instructions.

## Rules
- Say **"free"** plainly, then the boundary in one sentence (beyond-your-graph research bills at standard rates). Never bury the boundary — an expert surprised by a charge is worse than one never told "free."
- Use the term **self-use** consistently if the concept needs a name; otherwise plain language.
- Don't paste the API key into emails if avoidable — link to where they retrieve it (account page / Your Agent page).
- Link the "Your Agent" page as the canonical setup destination once it ships; email copy is the fallback for people who don't click.

## Owner
Whoever runs the expert-onboarding thread (emails live in the website server's onboarding flow — `/api/onboard-expert` sends the approval email).
