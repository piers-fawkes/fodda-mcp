import { performance } from 'node:perf_hooks';

export interface SwarmOptions {
  agents: number;
  queries: number;
  domain: string;
  mode: 'spt' | 'apikey';
  endpoint: string;
}

export interface QueryResult {
  id: number;
  durationMs: number;
  statusCode: number;
  tokensUsed: number;
  costUsd: number;
  success: boolean;
  error?: string;
  mode: 'spt' | 'apikey';
  sptChallengeVerified?: boolean;
}

export interface SwarmSummary {
  concurrency: number;
  totalQueries: number;
  completedQueries: number;
  successfulQueries: number;
  failedQueries: number;
  targetDomain: string;
  mode: 'spt' | 'apikey';
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  statusCodes: Record<number, number>;
}

// Canonical token pricing reference: 1 API call / unit = 1 token ($0.50 via SPT)
const SPT_COST_PER_TOKEN_USD = 0.50;
const MAX_CONCURRENT_AGENTS = 100;

const DOMAIN_QUERIES: Record<string, string[]> = {
  retail: [
    'top omnichannel retail trends',
    'e-commerce conversion benchmarks Q3',
    'buy-now-pay-later adoption retail',
    'self-checkout consumer sentiment',
    'supply chain visibility solutions'
  ],
  beauty: [
    'clean beauty market growth rate',
    'skincare personalization trends',
    'sustainable packaging cosmetics',
    'dermatologist recommended brand index',
    'k-beauty expansion strategies'
  ],
  sports: [
    'wearable tech in professional athletics',
    'sports streaming viewership stats',
    'athleisure market share analysis',
    'stadium fan engagement tech',
    'esports sponsorship metrics'
  ],
  fashion: [
    'fast fashion vs circular textiles',
    'luxury brand digital resale models',
    'virtual fitting room adoption',
    'sustainable denim manufacturing',
    'streetwear capsule drop trends'
  ],
  general: [
    'knowledge graph query benchmarks',
    'multi-agent framework throughput',
    'market intelligence search latency',
    'agentic workflow optimization',
    'machine payments protocol HTTP 402'
  ]
};

function getRandomQuery(domain: string, index: number): string {
  const normalizedDomain = domain.toLowerCase();
  const pool = DOMAIN_QUERIES[normalizedDomain] || DOMAIN_QUERIES.general;
  return pool[index % pool.length];
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
  return sortedValues[safeIndex];
}

async function executeSingleQuery(
  id: number,
  options: SwarmOptions
): Promise<QueryResult> {
  const query = getRandomQuery(options.domain, id);
  const startTime = performance.now();
  const targetUrl = new URL(`${options.endpoint}/v1/search`);
  targetUrl.searchParams.set('query', query);
  targetUrl.searchParams.set('domain', options.domain);

  let statusCode = 0;
  let success = false;
  let errorMsg: string | undefined;
  let sptChallengeVerified = false;
  let tokensUsed = 1; // Standard 1 token cost per query call

  try {
    if (options.mode === 'spt') {
      // Step 1: Unauthenticated request to trigger & verify MPP HTTP 402 Challenge
      const challengeRes = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fodda-Agent-Swarm-Test/1.0'
        }
      });

      if (challengeRes.status === 402) {
        sptChallengeVerified = true;
        // Step 2: Attach SPT bearer token and retry
        const retryRes = await fetch(targetUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer spt_simulated_swarm_agent_${id}`,
            'User-Agent': 'Fodda-Agent-Swarm-Test/1.0'
          }
        });
        statusCode = retryRes.status;
        success = retryRes.ok;
        if (!retryRes.ok) {
          errorMsg = `HTTP ${retryRes.status}: ${retryRes.statusText}`;
        }
      } else {
        statusCode = challengeRes.status;
        success = challengeRes.ok;
        if (!challengeRes.ok) {
          errorMsg = `HTTP ${challengeRes.status}: ${challengeRes.statusText}`;
        }
      }
    } else {
      // apikey mode: Attach X-API-Key header directly
      const apiKey = process.env.FODDA_API_KEY || 'sk_test_simulated_key';
      const res = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey,
          'User-Agent': 'Fodda-Agent-Swarm-Test/1.0'
        }
      });
      statusCode = res.status;
      success = res.ok;
      if (!res.ok) {
        errorMsg = `HTTP ${res.status}: ${res.statusText}`;
      }
    }
  } catch (err: any) {
    statusCode = 503;
    success = false;
    errorMsg = err?.message || 'Network / Connection error';
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    id,
    durationMs,
    statusCode,
    tokensUsed: success ? tokensUsed : 0,
    costUsd: success ? tokensUsed * SPT_COST_PER_TOKEN_USD : 0,
    success,
    error: errorMsg,
    mode: options.mode,
    sptChallengeVerified
  };
}

export async function runSwarmBenchmark(options: SwarmOptions): Promise<SwarmSummary> {
  const concurrency = Math.min(Math.max(1, options.agents), MAX_CONCURRENT_AGENTS);
  const totalQueries = Math.max(1, options.queries);

  console.log(`\n🤖 Starting Fodda Swarm Benchmark...`);
  console.log(`- Concurrency : ${concurrency} parallel agents`);
  console.log(`- Total Tasks : ${totalQueries} queries`);
  console.log(`- Vertical    : ${options.domain}`);
  console.log(`- Auth Mode   : ${options.mode === 'spt' ? 'Stripe SPT (MPP HTTP 402)' : 'X-API-Key'}`);
  console.log(`- Target Host : ${options.endpoint}\n`);

  let nextQueryId = 0;
  let completedQueries = 0;
  const results: QueryResult[] = [];
  const statusCodes: Record<number, number> = {};

  const updateProgress = () => {
    const percent = Math.floor((completedQueries / totalQueries) * 100);
    const active = Math.min(concurrency, totalQueries - completedQueries);
    const successCount = results.filter(r => r.success).length;
    const currentAvg = results.length > 0 
      ? Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length) 
      : 0;

    process.stdout.write(
      `\r[Swarm Progress] ${percent}% (${completedQueries}/${totalQueries}) | Active: ${active} | OK: ${successCount} | Avg Latency: ${currentAvg}ms`
    );
  };

  const worker = async () => {
    while (nextQueryId < totalQueries) {
      const currentId = nextQueryId++;
      const res = await executeSingleQuery(currentId, options);
      results.push(res);
      statusCodes[res.statusCode] = (statusCodes[res.statusCode] || 0) + 1;
      completedQueries++;
      updateProgress();
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Clear progress bar line
  process.stdout.write('\r\x1b[K');

  // Compute final aggregated statistics
  const successfulQueries = results.filter(r => r.success).length;
  const failedQueries = results.length - successfulQueries;
  const sortedLatencies = results.map(r => r.durationMs).sort((a, b) => a - b);
  const avgLatencyMs = results.length > 0
    ? Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length)
    : 0;
  const p50LatencyMs = calculatePercentile(sortedLatencies, 50);
  const p95LatencyMs = calculatePercentile(sortedLatencies, 95);
  const totalTokensUsed = results.reduce((acc, r) => acc + r.tokensUsed, 0);
  const totalCostUsd = totalTokensUsed * SPT_COST_PER_TOKEN_USD;

  const summary: SwarmSummary = {
    concurrency,
    totalQueries,
    completedQueries: results.length,
    successfulQueries,
    failedQueries,
    targetDomain: options.domain,
    mode: options.mode,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    totalTokensUsed,
    totalCostUsd,
    statusCodes
  };

  printSummaryReport(summary);

  return summary;
}

function printSummaryReport(s: SwarmSummary): void {
  const successPct = Math.round((s.successfulQueries / s.totalQueries) * 100);
  const authProtocolStr = s.mode === 'spt' ? 'Stripe SPT (MPP HTTP 402)' : 'Header API Key (X-API-Key)';

  console.log('========================================================');
  console.log('   Fodda Swarm Benchmark Summary');
  console.log('========================================================');
  console.log(`Concurrency (Agents) : ${s.concurrency}`);
  console.log(`Total Queries       : ${s.totalQueries}`);
  console.log(`Target Vertical     : ${s.targetDomain}`);
  console.log(`Auth Protocol       : ${authProtocolStr}`);
  console.log('--------------------------------------------------------');
  console.log(`Success Rate        : ${successPct}% (${s.successfulQueries}/${s.totalQueries} OK)`);
  console.log(`Avg Latency         : ${s.avgLatencyMs} ms`);
  console.log(`P50 Latency (Median): ${s.p50LatencyMs} ms`);
  console.log(`P95 Latency         : ${s.p95LatencyMs} ms`);
  console.log(`Total Tokens Used   : ${s.totalTokensUsed} tokens ($${s.totalCostUsd.toFixed(2)} via SPT)`);
  console.log('--------------------------------------------------------');
  console.log('HTTP Status Code Breakdown:');
  for (const [code, count] of Object.entries(s.statusCodes)) {
    console.log(`  - HTTP ${code} : ${count}`);
  }
  console.log('========================================================\n');
}
