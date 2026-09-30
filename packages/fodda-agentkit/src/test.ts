import assert from "assert";
import { foddaActionProvider, FoddaActionProvider } from "./foddaActionProvider.js";
import { WalletProvider } from "@coinbase/agentkit";

class MockWalletProvider extends WalletProvider {
  transferCalls: Array<{ to: string; amount: string; asset: string }> = [];
  txCalls: Array<any> = [];

  getAddress(): string {
    return "0x1234567890abcdef1234567890abcdef12345678";
  }
  getNetwork() {
    return { protocolFamily: "evm", networkId: "base-mainnet", chainId: "8453" };
  }
  getName(): string {
    return "mock-wallet";
  }
  async getBalance(): Promise<bigint> {
    return 1000000000000000000n;
  }
  async nativeTransfer(to: `0x${string}`, value: string): Promise<`0x${string}`> {
    return "0xmocknativehash";
  }
  async transfer(to: string, amount: string, asset: string): Promise<string> {
    this.transferCalls.push({ to, amount, asset });
    return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  }
}

async function runTests() {
  console.log("--- Running Fodda Coinbase AgentKit Unit Tests ---\n");

  const originalFetch = globalThis.fetch;

  try {
    // ── Test 1: Provider instantiation & network support ──
    console.log("Test 1: Provider instantiation & network validation");
    const providerWithKey = foddaActionProvider({ apiKey: "sk_test_123" });
    assert.strictEqual(
      providerWithKey.supportsNetwork({ protocolFamily: "evm", networkId: "ethereum-mainnet" }),
      true,
      "API key mode supports all networks"
    );

    const providerAutonomous = foddaActionProvider();
    assert.strictEqual(
      providerAutonomous.supportsNetwork({ protocolFamily: "evm", networkId: "base-mainnet" }),
      true,
      "Autonomous mode supports base-mainnet"
    );
    assert.strictEqual(
      providerAutonomous.supportsNetwork({ protocolFamily: "solana", networkId: "solana-mainnet" }),
      false,
      "Autonomous mode requires Base/EVM"
    );
    console.log("✅ Test 1 Passed\n");

    // ── Test 2: Mode B — Pre-authenticated API Key flow ──
    console.log("Test 2: Mode B — Pre-authenticated API Key flow");
    let recordedAuthHeader = "";
    let recordedEndpoint = "";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as any).url || input.toString();
      if (url.includes("coinbase.com")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      recordedEndpoint = url;
      recordedAuthHeader = (init?.headers as Record<string, string>)?.["Authorization"] || "";

      return new Response(
        JSON.stringify({ ok: true, results: [{ title: "Chipotle Margin Expansion" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const wallet = new MockWalletProvider();
    const resultApiKey = await providerWithKey.searchMarketIntelligence(wallet, {
      query: "Chipotle pricing power",
      limit: 3,
    });

    assert.ok(recordedEndpoint.endsWith("/v1/search/domain"), `Queries /v1/search/domain, got: ${recordedEndpoint}`);
    assert.strictEqual(recordedAuthHeader, "Bearer sk_test_123", "Attaches Bearer token");
    assert.ok(resultApiKey.includes("Chipotle Margin Expansion"), "Returns valid JSON result");
    console.log("✅ Test 2 Passed\n");

    // ── Test 3: Mode A — Autonomous x402 settlement on Base ──
    console.log("Test 3: Mode A — Autonomous x402 settlement on Base");
    let fetchCount = 0;
    let paymentHeaderReceived = "";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as any).url || input.toString();
      if (url.includes("coinbase.com")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      fetchCount++;
      const headers = init?.headers as Record<string, string>;

      if (fetchCount === 1) {
        // First request: Return 402 challenge
        return new Response(
          JSON.stringify({
            ok: false,
            error: "PAYMENT_REQUIRED",
            payment_methods_detail: [
              {
                method: "x402",
                recipient_address: "0xF61c2D34e84C77e0e97eba47dB4A1db32fF225A1",
                price_per_call_usd: 0.05,
              },
            ],
          }),
          {
            status: 402,
            headers: {
              "Content-Type": "application/json",
              "WWW-Authenticate":
                'stripe-spt amount=50 currency=usd, x402 amount=5 currency=usd network=base recipient_address="0xF61c2D34e84C77e0e97eba47dB4A1db32fF225A1"',
            },
          }
        );
      }

      // Second request: Verify payment attached
      paymentHeaderReceived = headers?.["X-402-Payment"] || "";
      return new Response(
        JSON.stringify({
          ok: true,
          settled: true,
          results: [{ source: "Earnings Q2", quote: "We have not seen pushback on menu prices." }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const resultX402 = await providerAutonomous.searchEarningsIntelligence(wallet, {
      query: "pricing power",
      ticker: "CMG",
      limit: 2,
    });

    assert.strictEqual(fetchCount, 2, "Triggers 402 retry loop");
    assert.strictEqual(wallet.transferCalls.length, 1, "Executes wallet transfer on 402");
    assert.strictEqual(
      wallet.transferCalls[0].to,
      "0xF61c2D34e84C77e0e97eba47dB4A1db32fF225A1",
      "Transfers to Fodda Base treasury"
    );
    assert.strictEqual(wallet.transferCalls[0].amount, "0.05", "Transfers 0.05 USDC");
    assert.strictEqual(wallet.transferCalls[0].asset, "usdc", "Transfers USDC");

    const parsedPayment = JSON.parse(paymentHeaderReceived);
    assert.strictEqual(
      parsedPayment.tx_hash,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Passes transaction hash in X-402-Payment header"
    );
    assert.strictEqual(parsedPayment.network, "base", "Specifies Base network in payment payload");
    assert.ok(resultX402.includes("Earnings Q2"), "Returns completed data after settlement");
    console.log("✅ Test 3 Passed\n");

    // ── Test 4: Consult Human Agent action execution ──
    console.log("Test 4: Consult Human Agent action execution");
    let consultPayload: any = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as any).url || input.toString();
      if (url.includes("coinbase.com")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      consultPayload = JSON.parse((init?.body as string) || "{}");
      return new Response(
        JSON.stringify({
          ok: true,
          analyst: { name: "Ben Dietz", id: "ben-dietz" },
          response: "When brands discount, they destroy pricing power.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const resultConsult = await providerWithKey.consultHumanAgent(wallet, {
      agent_id: "ben-dietz",
      question: "What is your perspective on discounting in retail?",
    });

    assert.strictEqual(consultPayload.agent_id, "ben-dietz");
    assert.strictEqual(consultPayload.question, "What is your perspective on discounting in retail?");
    assert.ok(resultConsult.includes("Ben Dietz"), "Returns Human Agent consultation response");
    console.log("✅ Test 4 Passed\n");

    console.log("All 4 Fodda AgentKit tests passed successfully!");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
