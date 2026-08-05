# `@fodda/agent-swarm-test`

> Zero-dependency CLI tool and benchmarking utility for testing parallel AI agent swarms against Fodda API knowledge graphs and Stripe SPT / Machine Payments Protocol (MPP) HTTP 402 token settlements.

Designed for AI agent developers and multi-agent framework authors (e.g., LangChain, AutoGen, CrewAI, Claude Code).

---

## Quick Start

Run instantly without installing heavy npm dependencies:

```bash
npx @fodda/agent-swarm-test --agents=10 --queries=50 --domain=retail --mode=spt
```

---

## CLI Parameter Reference

| Flag | Short | Default | Description |
|---|---|---|---|
| `--agents` | `-a` | `5` | Number of simulated concurrent parallel worker agents (1–100). |
| `--queries` | `-q` | `20` | Total queries distributed across the swarm. |
| `--domain` | `-d` | `retail` | Target knowledge graph vertical (`retail`, `beauty`, `sports`, `fashion`). |
| `--mode` | `-m` | `spt` | Authentication & billing mode (`spt` or `apikey`). |
| `--endpoint` | `-e` | `https://api.fodda.ai` | Target API host URL. |
| `--help` | `-h` | — | Displays usage instructions and flag options. |

---

## Authentication Modes & MPP HTTP 402 Validation

1. **`spt` Mode (Default)**:
   - Tests zero-onboarding **Machine Payments Protocol (MPP)** HTTP 402 challenge handling.
   - Executes unauthenticated request → catches HTTP 402 Payment Required response → verifies token pricing ($0.50 per query / 1 token unit via SPT) → attaches SPT bearer token header and completes request.

2. **`apikey` Mode**:
   - Tests traditional header-based authentication sending `X-API-Key`. Reads `FODDA_API_KEY` from the environment if present.

---

## Sample Benchmark Summary Output

```
========================================================
   Fodda Swarm Benchmark Summary
========================================================
Concurrency (Agents) : 10
Total Queries       : 50
Target Vertical     : retail
Auth Protocol       : Stripe SPT (MPP HTTP 402)
--------------------------------------------------------
Success Rate        : 100% (50/50 OK)
Avg Latency         : 342 ms
P50 Latency (Median): 310 ms
P95 Latency         : 520 ms
Total Tokens Used   : 50 tokens ($25.00 via SPT)
--------------------------------------------------------
HTTP Status Code Breakdown:
  - HTTP 200 : 50
========================================================
```

---

## License

MIT © Fodda
