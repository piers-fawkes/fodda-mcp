#!/usr/bin/env node

import { runSwarmBenchmark, SwarmOptions } from './swarm.js';

function parseArgs(args: string[]): SwarmOptions | null {
  const options: SwarmOptions = {
    agents: 5,
    queries: 20,
    domain: 'retail',
    mode: 'spt',
    endpoint: 'https://api.fodda.ai'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      return null;
    }

    if (arg.startsWith('--agents=')) {
      options.agents = parseInt(arg.split('=')[1], 10) || 5;
    } else if (arg === '--agents' || arg === '-a') {
      options.agents = parseInt(args[++i], 10) || 5;
    } else if (arg.startsWith('--queries=')) {
      options.queries = parseInt(arg.split('=')[1], 10) || 20;
    } else if (arg === '--queries' || arg === '-q') {
      options.queries = parseInt(args[++i], 10) || 20;
    } else if (arg.startsWith('--domain=')) {
      options.domain = arg.split('=')[1] || 'retail';
    } else if (arg === '--domain' || arg === '-d') {
      options.domain = args[++i] || 'retail';
    } else if (arg.startsWith('--mode=')) {
      const val = arg.split('=')[1]?.toLowerCase();
      options.mode = val === 'apikey' ? 'apikey' : 'spt';
    } else if (arg === '--mode' || arg === '-m') {
      const val = args[++i]?.toLowerCase();
      options.mode = val === 'apikey' ? 'apikey' : 'spt';
    } else if (arg.startsWith('--endpoint=')) {
      options.endpoint = arg.split('=')[1] || 'https://api.fodda.ai';
    } else if (arg === '--endpoint' || arg === '-e') {
      options.endpoint = args[++i] || 'https://api.fodda.ai';
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
@fodda/agent-swarm-test — AI Agent Swarm Benchmarking CLI Tool

Usage:
  npx @fodda/agent-swarm-test [options]

Options:
  --agents, -a    Number of simulated parallel agents (default: 5, max: 100)
  --queries, -q   Total queries distributed across the swarm (default: 20)
  --domain, -d    Target knowledge graph vertical: retail, beauty, sports, fashion (default: retail)
  --mode, -m      Auth mode: spt (Stripe SPT / MPP HTTP 402) | apikey (X-API-Key) (default: spt)
  --endpoint, -e  Target Fodda API host URL (default: https://api.fodda.ai)
  --help, -h      Display this help documentation

Examples:
  npx @fodda/agent-swarm-test --agents=10 --queries=50 --domain=retail --mode=spt
  npx @fodda/agent-swarm-test --agents=25 --queries=100 --domain=beauty --endpoint=https://api.fodda.ai
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.exit(0);
  }

  try {
    await runSwarmBenchmark(options);
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Swarm Benchmark failed:', err?.message || err);
    process.exit(1);
  }
}

main();
