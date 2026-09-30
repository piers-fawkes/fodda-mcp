import { ActionProvider, CreateAction, Network, WalletProvider } from "@coinbase/agentkit";
import { encodeFunctionData, parseUnits } from "viem";
import { z } from "zod";
import {
  MarketIntelligenceSchema,
  EarningsIntelligenceSchema,
  ConsultHumanAgentSchema,
} from "./schemas.js";

export interface FoddaActionProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export const BASE_USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const DEFAULT_BASE_TREASURY_ADDRESS = "0xF61c2D34e84C77e0e97eba47dB4A1db32fF225A1";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export class FoddaActionProvider extends ActionProvider<WalletProvider> {
  private apiKey?: string;
  private baseUrl: string;

  constructor(config: FoddaActionProviderConfig = {}) {
    super("fodda", []);
    this.apiKey = config.apiKey || process.env.FODDA_API_KEY;
    this.baseUrl = (config.baseUrl || process.env.FODDA_API_URL || "https://api.fodda.ai").replace(/\/$/, "");
  }

  /**
   * Supports Base for x402 settlement. If an API key is provided, all networks are supported.
   */
  supportsNetwork = (network: Network): boolean => {
    if (this.apiKey) return true;
    return (
      network.networkId === "base-mainnet" ||
      network.networkId === "base-sepolia" ||
      network.chainId === "8453" ||
      network.chainId === "84532" ||
      network.protocolFamily === "evm"
    );
  };

  /**
   * Internal helper executing API requests with autonomous x402 Base USDC fallback
   */
  private async executeWithAuth(
    walletProvider: WalletProvider,
    endpoint: string,
    payload: Record<string, any>
  ): Promise<string> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // If 402 Payment Required: Autonomous x402 settlement on Base
    if (response.status === 402) {
      let treasuryAddress = DEFAULT_BASE_TREASURY_ADDRESS;
      let amountUsdc = "0.05"; // Default 5¢ agentic rate

      // 1. Try parsing JSON body for payment parameters
      let bodyData: any = null;
      try {
        const cloned = response.clone();
        bodyData = await cloned.json();
      } catch (_) {}

      if (bodyData) {
        const x402Detail = bodyData.payment_methods_detail?.find((m: any) => m.method === "x402");
        if (x402Detail?.recipient_address) {
          treasuryAddress = x402Detail.recipient_address;
        }
        if (x402Detail?.price_per_call_usd != null) {
          amountUsdc = String(x402Detail.price_per_call_usd);
        }
      }

      // 2. Parse WWW-Authenticate header for overrides
      const authHeader = response.headers.get("www-authenticate") || "";
      const addressMatch = authHeader.match(/(?:recipient(?:_address)?|address)=["']?([^"', ]+)["']?/i);
      if (addressMatch) {
        treasuryAddress = addressMatch[1];
      }

      const amountMatch = authHeader.match(/x402[^,]*amount=["']?([^"', ]+)["']?/i);
      if (amountMatch) {
        const rawAmt = amountMatch[1];
        if (!rawAmt.includes(".") && Number(rawAmt) > 0) {
          amountUsdc = (Number(rawAmt) / 100).toFixed(2);
        } else {
          amountUsdc = rawAmt;
        }
      }

      // 3. Execute transfer via connected wallet
      let txHash: string;
      if (typeof (walletProvider as any).transfer === "function") {
        // Direct transfer method (custom provider or mock)
        txHash = await (walletProvider as any).transfer(treasuryAddress, amountUsdc, "usdc");
      } else if (typeof (walletProvider as any).sendTransaction === "function") {
        // Standard EvmWalletProvider (e.g. CdpWalletProvider, ViemWalletProvider)
        const amountUnits = parseUnits(amountUsdc, 6);
        const hash = await (walletProvider as any).sendTransaction({
          to: BASE_USDC_CONTRACT_ADDRESS as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [treasuryAddress as `0x${string}`, amountUnits],
          }),
        });

        if (typeof (walletProvider as any).waitForTransactionReceipt === "function") {
          await (walletProvider as any).waitForTransactionReceipt(hash);
        }
        txHash = typeof hash === "string" ? hash : String(hash);
      } else {
        throw new Error(
          "Connected wallet does not support transfer or sendTransaction for x402 settlement."
        );
      }

      // 4. Retry query attaching the settled payment transaction
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "X-402-Payment": JSON.stringify({ tx_hash: txHash, network: "base" }),
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fodda API returned error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return JSON.stringify(data, null, 2);
  }

  @CreateAction({
    name: "search_market_intelligence",
    description:
      "Search Fodda's 250+ expert-curated knowledge graphs across retail innovation, consumer trends, brand strategy, and market culture. Returns grounded evidence nodes and analyst perspectives.",
    schema: MarketIntelligenceSchema,
  })
  async searchMarketIntelligence(
    walletProvider: WalletProvider,
    args: z.infer<typeof MarketIntelligenceSchema>
  ): Promise<string> {
    return this.executeWithAuth(walletProvider, "/v1/search/domain", {
      query: args.query,
      limit: args.limit,
    });
  }

  @CreateAction({
    name: "search_earnings_intelligence",
    description:
      "Search SEC 10-K/10-Q filings, transcripts, and management Q&A disclosures across major public retail and consumer brands. Analyzes margin headwinds, customer behavior, and corporate guidance.",
    schema: EarningsIntelligenceSchema,
  })
  async searchEarningsIntelligence(
    walletProvider: WalletProvider,
    args: z.infer<typeof EarningsIntelligenceSchema>
  ): Promise<string> {
    return this.executeWithAuth(walletProvider, "/v1/search/report", {
      query: args.query,
      ticker: args.ticker,
      limit: args.limit,
    });
  }

  @CreateAction({
    name: "consult_human_agent",
    description:
      "Consult specialized domain strategists and industry experts (Human Agents) curated by Fodda. Provides grounded answers in the expert's specific framework and point of view.",
    schema: ConsultHumanAgentSchema,
  })
  async consultHumanAgent(
    walletProvider: WalletProvider,
    args: z.infer<typeof ConsultHumanAgentSchema>
  ): Promise<string> {
    return this.executeWithAuth(walletProvider, "/v1/human-agents/consult", {
      agent_id: args.agent_id,
      question: args.question,
    });
  }
}

export const foddaActionProvider = (config?: FoddaActionProviderConfig) =>
  new FoddaActionProvider(config);
