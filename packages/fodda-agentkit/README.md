# fodda-agentkit

Official Fodda Action Provider for [Coinbase AgentKit](https://github.com/coinbase/agentkit). Enables autonomous AI agents to access 250+ expert-curated knowledge graphs, consumer trends, earnings call transcripts, and specialized Human Agents.

## Features
- **Dual Settlement Modes**:
  - **Autonomous x402 Micropayments**: If no API key is configured, the agent automatically settles micropayments (USDC on Base) per query using its connected wallet upon receiving the HTTP 402 challenge (quoting amount and recipient dynamically from the response headers).
  - **Enterprise API Key**: Use `FODDA_API_KEY` for pre-authenticated team plans.
- **Three Core Actions**:
  - `search_market_intelligence`: Traverses 250+ knowledge graphs across retail, innovation, and culture.
  - `search_earnings_intelligence`: Queries SEC disclosures and earnings call transcripts with executive Q&A.
  - `consult_human_agent`: Direct consultations with domain-expert digital twins.

## Installation

```bash
npm install fodda-agentkit @coinbase/agentkit
```

## Quick Start (with LangChain & AgentKit)

```typescript
import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { foddaActionProvider } from "fodda-agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// 1. Configure Coinbase Wallet on Base
const walletProvider = await CdpWalletProvider.configureWithWallet({
  apiKeyName: process.env.CDP_API_KEY_NAME,
  apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
  networkId: "base-mainnet",
});

// 2. Initialize AgentKit with Fodda Provider
const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [
    foddaActionProvider(), // Autonomous pay-per-call (0.05 USDC) or set FODDA_API_KEY
  ],
});

// 3. Export tools to LangChain Agent
const tools = await getLangChainTools(agentKit);
const llm = new ChatOpenAI({ model: "gpt-4o" });
const agent = createReactAgent({ llm, tools });

// 4. Run an autonomous research query
const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "Analyze Chipotle's pricing power and margin strategy without discounting from their latest earnings transcripts.",
    },
  ],
});

console.log(result.messages[result.messages.length - 1].content);
```

## License
Apache-2.0
