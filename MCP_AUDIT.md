# Fodda MCP Server — Technical Audit

**Date**: 2026-02-16
**Version Audited**: 1.2.0 (post-polish)
**Architecture**: Stateless MCP proxy → Fodda REST API

---

## 1. Architecture Overview

```mermaid
graph LR
    A["AI Client (Gemini / Claude)"] -->|MCP Protocol| B["Fodda MCP Server"]
    B -->|REST + HMAC| C["Fodda API (api.fodda.ai)"]
    C --> D["Neo4j Knowledge Graph"]
```

- **Transport**: Dual-mode — STDIO (local dev) or SSE over Express (Cloud Run)
- **Auth**: Bearer token in `_meta.authorization`, forwarded as `X-API-Key`
- **Signing**: HMAC-SHA256 (`X-Fodda-Signature`) using `FODDA_MCP_SECRET`
- **Hosting**: Google Cloud Run, Docker multi-stage build

---

## 2. Tool Inventory (6 tools)

| Tool | Type | Deterministic | Auth Required | Notes |
|------|------|:---:|:---:|-------|
| `search_graph` | POST | ❌ | ✅ | Hybrid vector+keyword, limit capped at 50 |
| `get_neighbors` | POST | ✅ | ✅ | Depth capped at 2, results capped at 50 |
| `get_evidence` | POST | ✅ | ✅ | top_k capped at 10 |
| `get_node` | GET | ✅ | ✅ | Single node retrieval |
| `get_label_values` | GET | ✅ | ✅ | Label value discovery |
| `psfk_overview` | POST | ❌ | ✅ | Macro overview, at least one of industry/sector required |

---

## 3. Security Posture

### ✅ Strengths
- **HMAC signing** implemented for all requests (POST body-based, GET path-based)
- **Timing-safe comparison** used for signature verification (`crypto.timingSafeEqual`)
- **Defense-in-depth caps** on all numeric parameters (limit, depth, top_k)
- **Bearer token extraction** with strict enforcement in production
- **Structured audit logging** for all tool calls (event, tool, user, duration, billing)
- **Simulation mode guardrails** — blocked in production without internal key allowlist

### ⚠️ Observations
- **HMAC middleware is commented out** (L340 in `index.ts`). The signing logic works but the Express middleware that *verifies* inbound signatures is disabled. This means the `/messages` endpoint currently accepts unsigned requests.
- **No rate limiting** on the Express layer. Cloud Run provides some inherent protection, but application-level rate limiting per API key is absent.
- **No request/response size limits** beyond Express defaults. Large payloads could be used for resource exhaustion.
- **HMAC body verification fragility**: Uses `JSON.stringify(req.body)` after Express JSON parsing, which may not match the original raw body byte-for-byte in edge cases (e.g., Unicode escaping, key ordering).
- **`--allow-unauthenticated`** in `deploy_cloud_run.sh` — the Cloud Run service is publicly accessible. This is intentional for MCP clients, but worth noting.

### 🔒 Recommendations
1. **Enable HMAC middleware** when ready — it's fully implemented and tested
2. **Add request size limits**: `app.use(express.json({ limit: '1mb' }))`
3. **Consider raw body capture** for HMAC: `app.use(express.json({ verify: (req, res, buf) => (req as any).rawBody = buf }))`
4. **Add per-key rate limiting** using a lightweight in-memory store or Cloud Run metadata

---

## 4. API Design Quality

### ✅ Strengths
- Clean tool schemas with explicit `required` fields and human-readable `description`s
- Consistent parameter naming (`graphId`, `userId` across all tools)
- `isDeterministic` metadata on each tool — enables client-side caching decisions
- `/mcp/tools` registry endpoint provides full transparency
- `/health` endpoint for Cloud Run probes

### ⚠️ Observations
- **`psfk_overview` schema looseness**: `required` only includes `userId`, but runtime logic requires at least one of `industry`/`sector`. This discrepancy can confuse AI clients that rely on schema validation alone.
- **No response schema published**: Tool definitions describe inputs but not output shapes. Clients have no way to pre-validate what they'll receive.
- **No pagination** on `search_graph` or `get_label_values` — results are capped but not pageable.

### 📋 Recommendations
1. Add `oneOf` or a `description` note to `psfk_overview` schema clarifying the industry/sector requirement
2. Consider adding `outputSchema` to tool definitions for enterprise clients
3. Design pagination for `search_graph` if result sets grow beyond 50

---

## 5. Code Quality

### ✅ Strengths
- Strong TypeScript configuration (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Clean separation: `index.ts` (server), `tools.ts` (definitions), `types.ts` (interfaces)
- Multi-stage Docker build with `--omit=dev`
- Structured JSON logging via `console.error` (Cloud Run captures stderr as logs)

### ⚠️ Observations
- **No automated test suite** — `package.json` has `"test": "echo... && exit 1"`. Verification scripts exist (`verify.ts`, `verify_hmac.ts`, `verify_tools_endpoint.ts`) but are manual.
- **Single SSE transport variable** — only one concurrent SSE connection is supported. If a second client connects, the first is silently orphaned.
- **No graceful shutdown** — `process.exit(1)` on error, no SIGTERM handler for clean Cloud Run shutdowns.
- **Express 5** — relatively new; confirm MCP SDK compatibility under load.

### 📋 Recommendations
1. Wire up verification scripts as `npm test` (even as simple integration tests)
2. Add a connection map for SSE transport to support multiple concurrent clients
3. Add SIGTERM/SIGINT handler: `process.on('SIGTERM', () => server.close())`

---

## 6. Deployment & Operations

### ✅ Strengths
- Docker multi-stage build (builder → slim runtime)
- Cloud Run deployment script with env var injection
- Terraform and K8s manifests available in `deployment/`
- `.env.example` documents all expected env vars

### ⚠️ Observations
- **No CI/CD pipeline** — deployment is manual via `deploy_cloud_run.sh`
- **No health check configured in Cloud Run** — the `/health` endpoint exists but isn't referenced in the deploy script's `--set-env-vars`
- **No secret management** — `FODDA_MCP_SECRET` should use Cloud Run Secrets or Secret Manager, not env vars

### 📋 Recommendations
1. Add `--health-check-path=/health` to Cloud Run deploy script
2. Migrate secrets to Google Secret Manager
3. Set up GitHub Actions CI for build + test on PR

---

## 7. Enterprise Readiness Summary

| Capability | Status | Notes |
|-----------|:------:|-------|
| Tool registration & discovery | ✅ | `/mcp/tools` endpoint |
| Authentication | ✅ | Bearer token in `_meta` |
| Request signing (HMAC) | ✅ | Middleware enabled |
| Structured audit logging | ✅ | JSON to stderr |
| Simulation/test mode | ✅ | `gemini_echo` with production guardrails |
| Defense-in-depth caps | ✅ | All numeric params capped |
| Versioning discipline | ✅ | Server + per-tool versions |
| Rate limiting | ✅ | Per-key, 60 req/min default, configurable |
| Automated testing | ✅ | `npm test` wired to verify script |
| CI/CD | ❌ | Manual deploy |
| Multi-client SSE | ✅ | Session Map with auto-cleanup |
| Graceful shutdown | ✅ | SIGTERM/SIGINT handlers |
| Output schemas | ✅ | All 6 tools have outputSchema |
| Request size limits | ✅ | 1MB limit on JSON bodies |
| Health probes | ✅ | `/health` with Cloud Run probe config |
| Secret management | ✅ | Deploy script uses Secret Manager |
| Marketplace packaging | ⏸️ | Backburner, awaiting format guidance |

---

## 8. Priority Action Items

1. ~~**Enable HMAC middleware**~~ ✅ Done
2. ~~**Add `npm test`**~~ ✅ Done
3. ~~**Add SIGTERM handler**~~ ✅ Done
4. ~~**Support multiple SSE connections**~~ ✅ Done
5. ~~**Add request size limits**~~ ✅ Done
6. ~~**Configure Cloud Run health check**~~ ✅ Done
7. ~~**Migrate secrets**~~ ✅ Done (deploy script references Secret Manager)
8. ~~**Add output schemas**~~ ✅ Done

### Remaining Recommendations
- Set up GitHub Actions CI for build + test on PR
- Add raw body capture for byte-perfect HMAC verification

---

*This audit is current as of v1.2.0. All priority action items completed. Next review recommended after rate limiting and CI/CD implementation.*
