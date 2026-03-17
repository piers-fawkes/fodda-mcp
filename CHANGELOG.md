# Changelog

All notable changes to the Fodda MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.8.0] - 2026-03-16

### Added
- **Community Pattern Graphs support**: Updated tool descriptions across `list_graphs`, `search_graph`, and all `graphId` parameters to reference community-contributed Pattern Graphs alongside expert-curated PSFK graphs.
- **Server instruction — GRAPH TYPES section**: Added `GRAPH TYPES` block to MCP server instructions explaining the two graph types (Curated vs Community) and providing community graph attribution guidance (use creator's name instead of "PSFK").
- **Tool annotations**: All 8 tools now include MCP spec `annotations` (`title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint`, `openWorldHint: false`) for Anthropic Connectors Directory compliance.
- **Favicon & root page**: Added `/favicon.ico` (→ PNG), `/favicon.svg` (→ SVG), and root `/` HTML page with `<link rel="icon">` tags so Google's favicon API resolves the Fodda logo for directory listings.

### Changed
- Bumped tool versions: `list_graphs` → 1.1.0, `search_graph` → 1.4.0.
- Version bumped to 1.8.0 across `package.json` and `tools.ts`.

---

## [1.7.3] - 2026-03-10

### Changed
- **Server architecture rebuilt**: Replaced `Server` (low-level SDK class) with `McpServer` (high-level API) — the same architecture pattern used in a working test server. This fixed persistent `"Error occurred during tool execution"` errors in Claude.ai web client.
- **Middleware chain removed**: Eliminated AsyncLocalStorage (`requestContext.run()`), rate limit response headers, diagnostic response interceptors, and HMAC verification on incoming requests. The combination of these middleware layers was interfering with the SDK's `@hono/node-server` response pipeline, causing Claude to reject valid tool responses.
- **Tool registration simplified**: Tools now registered via `server.tool()` with Zod schemas instead of `setRequestHandler(CallToolRequestSchema)`.
- **API key handling**: Extracted from URL query params and passed directly to tool handlers — no per-request context stores.
- **`psfk_overview` tool**: Temporarily removed from available tools (was already excluded from default enterprise tools list).

### Root Cause
The original server's `Server` class + `AsyncLocalStorage` + middleware chain (CORS → context → HMAC → rate limiter → JSON parse → Accept injection → diagnostic interceptors) created conditions where the SDK's HTTP transport adapter (`@hono/node-server`) couldn't properly deliver tool call responses to Claude's MCP client. A test server using the same SDK + same API calls but with `McpServer` + no middleware worked immediately.

### Deployment
- Revision: `fodda-mcp-00042-x2w`
- GCP Project: `fodda-mcp`
- Region: `us-east4`
- Verified: `list_graphs` and `search_graph` both work end-to-end through Claude.ai

---

## [1.7.2] - 2026-03-08

### Changed
- **Credit exhaustion error messages**: When the API returns `CREDITS_EXHAUSTED` or `INSUFFICIENT_CREDITS` error codes, the MCP now returns a user-friendly contextual message: *"You've reached your query limit. Your account will renew with a refreshed query limit of X on [renewal date]. Contact [account admin] or upgrade at https://app.fodda.ai."* If the API includes account metadata (`monthlyQueryLimit`, `nextRenewalDate`, `accountOwner`), those values are used; otherwise, graceful generic wording is substituted (e.g., "your allocated", "your next billing cycle", "your account administrator"). If the API already provides a rich message (≥30 chars), it passes through unchanged.

---

## [1.7.1] - 2026-03-07


### Added
- **Claude.ai web connector support**: API key can now be passed via URL query parameter (`?api_key=fk_live_...`) since Claude's "Add custom connector" form only supports OAuth — not custom headers. Key is extracted at the HTTP layer and persisted per-session.
- **Per-session API key storage**: API keys from URL query params or HTTP `Authorization` headers are stored in a `sessionApiKeys` map, automatically injected into tool call context, and cleaned up on session disconnect.
- **HMAC bypass for API-key-authenticated clients**: MCP transport endpoints (`/mcp`, `/sse`, `/messages`) now skip HMAC signature verification when the client authenticates via API key. HMAC remains enforced for server-to-server calls without API key auth.

### Changed
- **Auth fallback chain**: Tool call auth now checks `_meta.authorization` → session API key (from URL/header) → dev fallback, with a helpful error message directing users to the `?api_key=` URL format.
- **README**: Added Claude Web quick-start as the first section, added Claude Enterprise section, added `list_graphs` and `discover_adjacent_trends` to tools table, fixed version badge (1.4.0 → 1.7.0).
- **Enterprise_MCP_Setup.md**: Expanded Anthropic section from a vague one-liner into full setup guides for Claude Web, Claude Enterprise, and Claude Code CLI.
- **deploy_cloud_run.sh**: Fixed project ID (`gen-lang-client-0472572023`, not `fodda-mcp`) and region (`us-central1`, not `us-east4`). Added `--project` flag to all gcloud commands.

### Deployment
- GCP Project: `fodda-mcp`
- Region: `us-east4`
- Custom domain: `mcp.fodda.ai`
- Note: A secondary copy also runs in `gen-lang-client-0472572023` / `us-central1`

---

## [1.7.0] - 2026-03-07

### Added
- **Internal service key support**: MCP now reads `INTERNAL_SERVICE_KEY` or `FODDA_INTERNAL_KEY` env var and forwards `fodda-internal-service-key` header to the API to bypass credit checks for internal/admin usage.
- **`get_evidence` output schema**: Added `place` (geographic location of the article) and `brandNames` to evidence item documentation.
- **`FoddaEvidence` type**: Added `place` and `brandNames` optional fields to align with API response shape.

### Changed
- **`search_graph` — output schema**: Added explicit `semantic_score` (0–1, raw vector similarity), `relevance_score` (0–1, composite score penalizing zero-evidence trends by 0.6×), and `evidence_count` (integer) fields to output schema items. Results are now documented as pre-sorted by `relevance_score` descending. Bumped `search_graph` tool version → 1.3.0.
- **`search_graph` — query description**: Now documents that location terms (city/country names like "London", "Tokyo") are auto-detected and used to hard-filter results geographically, with auto-expansion (e.g., "London" → "UK", "England").
- **`search_graph` — tool description**: Added note that a server-side relevance gate may reduce results for brand/entity-specific queries (low-score results that don't mention query terms are filtered out).
- **`search_graph` — `include_evidence` default**: Changed from `false` to `true` — most agent use cases benefit from inline evidence. Each evidence item now documented with `sourceUrl`, `place`, `brandNames`, `snippet`, `publishedAt`.
- **`get_neighbors` — `relationship_types`**: Added `ASSOCIATED_BRAND`, `MENTIONS_BRAND`, and `IN_LOCATION` as valid relationship types alongside existing `EVIDENCED_BY`, `RELATED_TO`, `SEMANTICALLY_SIMILAR`.
- **`get_label_values` — `label` description**: Added `Location` as a valid label value alongside `Brand`, `Technology`, `Audience`, `RetailerType`, `Trend`.
- **Types audit**: Confirmed no references to API-stripped fields (`embedding`, `brands`, `Freshness Date`, `Freshness Days`, `Date Added`, `vertical - raw`, `dataset`, `articleIds_csv`, `airtableRecordId`, `industry`, `technology`, `sector`, `audience`, `relatedTrendRecIds`, `macroRecIds`).
- Bumped tool versions: `search_graph` → 1.3.0, `get_neighbors` → 1.2.0, `get_evidence` → 1.1.0, `get_label_values` → 1.2.0.
- Version bumped to 1.7.0 across `package.json`, `server.json`, and `tools.ts`.

---

## [1.6.0] - 2026-03-06

### Added
- **`list_graphs` tool**: New MCP tool wrapping `GET /v1/graphs` — lets AI agents discover available knowledge graphs, node types, relationship types, and versions before querying.
- **`search_graph` — `filters` parameter**: Supports `filters.node_types` to narrow results to specific labels (e.g., `["Trend", "Article"]`).
- **`search_graph` — `include_evidence` parameter**: Batch-fetches supporting evidence articles inline with search results, eliminating the need for separate `get_evidence` calls per trend.
- **`get_neighbors` — `direction` parameter**: Supports `'in'` or `'out'` traversal direction (default `'out'`), enabling inbound relationship discovery.
- **`get_label_values` — `property` parameter**: Specifies which property to return values for, with smart per-label defaults.

### Changed
- **Graph ID descriptions standardized** across all 8 tools. All tools now reference `list_graphs` as the canonical discovery source and list consistent examples including `'pew'`.
- **`list_graphs` and `get_label_values` added to `DEFAULT_ENTERPRISE_TOOLS`** — available out of the box for all enterprise deployments.
- Bumped tool versions: `search_graph` → 1.1.0, `get_neighbors` → 1.1.0, `get_label_values` → 1.1.0.
- Version bumped to 1.6.0 across `package.json`, `server.json`, and `tools.ts`.

---

## [1.5.0] - 2026-03-06

### Added
- **`discover_adjacent_trends` tool**: New MCP tool that wraps the API's `GET /v1/graphs/:graphId/adjacent` endpoint, enabling AI agents to discover semantically similar trends for a given seed trend. Supports `min_score`, `limit`, and `include_editorial` parameters with defense-in-depth caps (limit capped at 20).
- `src/test_live_mcp.ts` — Live MCP integration test script.

### Changed
- Version bumped to 1.5.0 across `tools.ts`.
- `discover_adjacent_trends` added to `DEFAULT_ENTERPRISE_TOOLS` (available out of the box).
- Minor README updates.

---

## [1.4.0] - 2026-02-24

### Added
- **Streamable HTTP Support**: Enabled `/mcp` alongside `/sse` for full compatibility with Anthropic Enterprise and OpenAI Frontier.
- **Enterprise Observability**: Ingests and forwards `traceparent` headers to the upstream API and applies stable UUIDv4 `requestId` parameters automatically to all tool execution pathways.
- **Enterprise Sandbox Tooling**: Added `ALLOWED_TOOLS` environment variable defaulting to a tightened schema (`search_graph`, `get_node`, `get_evidence`, `get_neighbors`) to control LLM footprint.
- **MAX_RESPONSE_BYTES Guardrail**: Hard-caps response JSON sizes to prevent runtime memory exhaustion, throwing a deterministic `PAYLOAD_TOO_LARGE` envelope upstream.
- **Enterprise MCP Setup Guide** (`Enterprise_MCP_Setup.md`): Onboarding documentation for enterprise integrators.
- **Description Updates Tracker** (`DESCRIPTION_UPDATES.md`): Central record of tool/server description revisions.

### Changed
- **Error Transparency Uniformity**: Ripped out all legacy protocol errors returning unhandled strings. ALL errors now permanently trace inside JSON `[{ text: "{\"error\": ...}" }]`.
- **Precedence Clarified**: `server.json` manifest properly declares `streamable-http` as the primary transport protocol fallback.
- Updated `@modelcontextprotocol/sdk` to `^1.27.1`.
- Expanded tool definitions in `src/tools.ts` with richer `outputSchema` and inline descriptions.
- `.env.example` updated with new enterprise configuration variables.

## [1.3.2] - 2026-02-16

### Published
- **Published to Official MCP Registry** as `io.github.piers-fawkes/fodda`
- Published to npm as `fodda-mcp@1.3.2`
- Registry listing: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda

### Changed
- Updated MCP name to use GitHub namespace format (`io.github.piers-fawkes/fodda`)
- Temporarily removed `remotes` section to resolve registry conflicts
- Users can install via npm: `npx fodda-mcp` or add to MCP client configs

## [1.3.0] - 2026-02-16

### Added
- Official MCP Registry manifest (`server.json`) conforming to 2025-12-11 schema.
- `/.well-known/mcp.json` discovery endpoint for automatic MCP server detection.
- `scripts/publish_registry.sh` for one-command npm + registry publishing.
- npm package support (`packages` field in `server.json`) for self-hosted installs.

### Changed
- README rewritten for marketplace-quality onboarding (Claude, Gemini quick-start examples).
- Version bumped to 1.3.0 across `package.json`, `tools.ts`, and `server.json`.
- Removed `metadata.json` (superseded by `server.json`).

## [1.2.0] - 2026-02-16

### Added
- HMAC middleware enabled on Express layer.
- Per-key rate limiting (60 req/min default, configurable via `RATE_LIMIT_RPM`).
- Multi-client SSE session map with auto-cleanup.
- Graceful shutdown (SIGTERM/SIGINT handlers).
- Request size limit (1MB) on JSON bodies.
- Cloud Run health check probe configuration.
- Secret Manager references in deploy script.
- `outputSchema` on all 6 tool definitions.

## [1.1.0] - 2026-02-14

### Added
- Simulated Gemini tool invocation mode (`gemini_echo`) for testing without upstream API calls.
- `psfk_overview` tool for generating macro overviews.
- System validation endpoint `/v1/system/validation`.

### Changed
- Updated `@modelcontextprotocol/sdk` to `^1.26.0`.
- Enforced API Key validation for all tool calls.

## [1.0.0] - 2026-01-01

### Added
- Initial release of Fodda MCP Server.
- Core graph tools: `search_graph`, `get_neighbors`, `get_evidence`, `get_node`.
- Express-based HTTP server with stdio fallback.
- Axios-based upstream API proxy to `api.fodda.ai`.
- HMAC request signing support.
- Structured JSON audit logging to stderr.

---

<!-- Links -->
[Unreleased]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.2...v1.8.0
[1.7.2]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.3.0...v1.3.2
[1.3.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/piers-fawkes/fodda-mcp/releases/tag/v1.0.0
