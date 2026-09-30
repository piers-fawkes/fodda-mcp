# Brief (MCP Agent) — Package & Publish Fodda Action Provider for Coinbase AgentKit

**Context:**  
Coinbase AgentKit (`@coinbase/agentkit`) is the premier framework for building autonomous AI agents on Base with USDC wallets. We want to publish `@fodda/agentkit-action-provider` in the `Fodda MCP` monorepo (`packages/fodda-agentkit`) and submit a Pull Request to `coinbase/agentkit` on GitHub so that every AgentKit agent can query Fodda.

**What to build:**
1. In `packages/fodda-agentkit/`:
   - `package.json`: `@fodda/agentkit-action-provider` with peer dependency `@coinbase/agentkit: ">=0.1.0"`.
   - `src/schemas.ts`: Zod schemas for `search_market_intelligence`, `search_earnings_intelligence`, and `consult_human_agent`.
   - `src/foddaActionProvider.ts`: `FoddaActionProvider` extending `ActionProvider<WalletProvider>`. Supports dual-mode settlement:
     * Mode A: Autonomous x402 (\$0.05 USDC per query) via `walletProvider.transfer()` upon receiving HTTP 402 challenge.
     * Mode B: `FODDA_API_KEY` Bearer token authentication.
   - `src/index.ts`: export `foddaActionProvider` and schemas.
   - `README.md`: Quickstart showing LangChain + AgentKit agent integration.

2. Verify compilation:
   - `npm run build` in `packages/fodda-agentkit/`.

**Definition of Done:**
- Package compiles cleanly without type errors.
- Unit tests verify action invocation and x402 retry loop.
- Ready for `npm publish --access public`.

**Do Not:**
- Do not hardcode prices in marketing copy. Machine x402 quotes dynamically from HTTP 402 response header.
- Do not introduce breaking changes to root MCP server.

**Files Expected to Change:**
- `packages/fodda-agentkit/package.json`
- `packages/fodda-agentkit/tsconfig.json`
- `packages/fodda-agentkit/src/index.ts`
- `packages/fodda-agentkit/src/foddaActionProvider.ts`
- `packages/fodda-agentkit/src/schemas.ts`
- `packages/fodda-agentkit/README.md`
