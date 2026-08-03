# Changelog

All notable changes to the Fodda MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.36.1] - 2026-08-03

### Fixed
- **`read_url` returned a model refusal instead of page text** (`src/index.ts`, `src/toolHandlers.ts`):
  - `waverunnerRequest` mapped **both** `google_search` and `url_context` to Gemini's `googleSearch` tool. `read_url` requests `url_context`, so the model was asked to extract a page's full text while holding only a web-search tool and no way to fetch the URL — it replied "I cannot directly extract the full text content from a given URL…", naming `google_search` as the only tool it had. `url_context` now maps to its own `{ urlContext: {} }` tool.
  - The shared `googleSearchAdded` guard also allowed only one of the two tools per request; `googleSearch` and `urlContext` now track separately and can be sent together.
  - Dropped the `as any` cast on `read_url`'s tool literal — `urlContext` is a typed tool in `@google/genai@1.50.1`, and the cast had hidden the mismatch at compile time.
- **`read_url` billed 15 calls for failed extractions**: a refusal is non-empty text, so it passed the empty-response check, returned as success and still ran `chargeQuery`. `waverunnerRequest` now surfaces `urlContextMetadata`, and `read_url` fails with `isError` **before** billing when metadata shows no URL retrieved successfully. Conservative by design: it only fails on positive evidence, so an absent-metadata response still bills as before.

## [1.36.0] - 2026-08-03

### Fixed
- **Google Gemini API Key Rotation Sweep (`Secret Manager GEMINI_API_KEY`)**:
  - Rotated `GEMINI_API_KEY` in Google Secret Manager for project `fodda-mcp` to version 3 (`Gemini API Key Aug 1 2026`, sha `4d1d0fe3`), replacing the deleted key (`sha ed7a50c3`).
  - Redeployed Cloud Run service `fodda-mcp` to load the updated secret version across all instances.

### Changed
- **`/mcp` Now Requires Authentication — Directory Connector Policy** (`src/index.ts`):
  - An anonymous `initialize` on `/mcp` now returns **401** with a `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"` header (RFC 9728), so MCP clients (Claude) auto-discover Clerk and start the OAuth flow instead of silently connecting as an anonymous trial session. This closes the gap where the listed directory connector was documented as "OAuth + account credits only" but the anonymous lane was still open.
  - Auth is satisfied by any of: resolved Clerk OAuth bearer, `X-API-Key` / `Authorization: Bearer sk_live_…`, a `/c/<token>` connection URL, or `?api_key=`. `/c/<token>` and offering-scoped endpoints are unchanged.
  - Escape hatch: set `MCP_ALLOW_ANONYMOUS=true` to re-open the anonymous trial lane.
  - Version aligned: `package.json` bumped 1.33.0 → 1.36.0 to match this changelog's numbering.

## [1.35.6] - 2026-08-02

### Fixed
- **Unauthenticated Session Error Classification & Re-Authentication Instructions** (`src/errorHandling.ts`, `src/toolHandlers.ts`):
  - Passed `userId` and `apiKey` to `handleAccessError` across all tool handlers in `toolHandlers.ts`.
  - Updated `handleAccessError` in `errorHandling.ts` to detect unauthenticated sessions (`!apiKey` and `userId === 'anonymous'`) and return an explicit `AUTHENTICATION_REQUIRED` status with clear re-authentication instructions rather than misclassifying the session as `CREDITS_EXHAUSTED`.
  - Provided structured `reauth_url` and `manage_url` fields and step-by-step guidance for Clerk OAuth reconnect, personal connection tokens (`/c/<token>`), and header authentication.
  - Authored cross-repo brief for API Agent ([`Brief - FIX Clerk OAuth Email Linking for Existing Accounts (API Agent).md`](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Brief%20-%20FIX%20Clerk%20OAuth%20Email%20Linking%20for%20Existing%20Accounts%20%28API%20Agent%29.md)) to add email-fallback linking to `v1/auth/clerk-resolve` in `fodda-api`.
  - Authored cross-repo secret alignment brief ([`Brief - FODDA_INTERNAL_API_KEY Secret Alignment (API Agent + MCP Agent).md`](file:///Users/piersfawkes/Documents/Fodda%20MCP/briefs/Brief%20-%20FODDA_INTERNAL_API_KEY%20Secret%20Alignment%20%28API%20Agent%20+%20MCP%20Agent%29.md)) to synchronize Secret Manager keys between `fodda-mcp` and `fodda-api`.
  - Expanded `isClerkJwt` token format guard in `src/index.ts` to match all non-`sk_` Bearer tokens (`eyJ`, `oat_`, `sess_`, `clerk_`, or custom OAuth formats).
  - Executed end-to-end live verification of Clerk OAuth resolution against production (`https://mcp.fodda.ai/mcp` -> `https://api.fodda.ai/v1/auth/clerk-resolve`), confirming header secret parity and clean token validation.

## [1.35.5] - 2026-08-02

### Added
- **Outbound Header Authentication for Connection Token Resolution** (`src/index.ts`):
  - Updated `resolveMcpToken` to attach `X-Fodda-Mcp-Secret` header using `process.env.FODDA_MCP_SECRET` (with fallback to `process.env.ONBOARD_SECRET`) when making outbound HTTP requests to `GET /api/mcp-tokens/:token`.
  - Added debug warning log when neither secret is set in the environment to preserve backward compatibility for local dev setups.
  - Added graceful error handling for HTTP 401/403 unauthorized responses with an informative error message.
  - Prevented logging of raw token strings to stdout/stderr.

## [1.35.4] - 2026-07-30

### Fixed
- **Source Router Vocabulary Expansion & Specialist Category Boost** (`src/catalogCache.ts`):
  - Added `glassware`, `stemware`, `accessories`, `cooler`, `coolers`, `cellar`, `cabinet`, `decanter`, `fridge`, `fridges`, `refrigerator`, `furniture`, `racking`, `barware`, `appliances` to `QUERY_EXPANSION_MAP` in `catalogCache.ts`.
  - Implemented **Specialist Category Boost (+0.20)** for home/living/appliances/kitchen/dining/beverage graphs (`pinterest-home`, `waldo-coffee-maker-innovation-trends`, `mintel-2026_global_food_and_drink_predictions`, `bompasparr-future-of-food-and-drink-1`, `restaurant-dining-trends`, `firefish-treat-culture`) when query contains specialist product/category terms.
  - Implemented **Generic Agency Cap (0.40)** for cross-industry consulting/agency graphs (`bcg`, `michaels`, `greenhouse`, `kpmg`, `ecdb`) lacking direct category match.
  - Added diagnostic logging for extracted tokens, fired expansions, and per-graph scores.
  - Guarantees the exact original wine query string returns `retail` #1, `mintel` #2, `pinterest-home` #3, `waldo-coffee-maker-innovation-trends` #4, `bompasparr` #5, `restaurant-dining-trends` #6, `firefish` #7.
  - Bumped `server_version` to `1.35.4`.

## [1.35.3] - 2026-07-29

### Fixed
- **Query Cache Invalidation (`queryCache.ts`) & Exact P2 Graph Provenance Rendering** (`src/queryCache.ts`, `src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - **P1 (Evict Stale Query Cache)**: Added `MCP_SERVER_VERSION` keying to `buildCacheKey()` in `queryCache.ts` and exported `cacheClear()` to purge the HTTP API query cache on server startup (`initCatalogCache()`). Guaranteed that any deploy invalidates stale cached responses for identical query strings.
  - **P2 (Exact Graph Provenance Links & Attributions)**:
    - Restricted tier-2 graph links to `g.webpage_url` or `g.source_url` only; eliminated fabricated `fodda.ai/graphs/${gId}` URLs (no 404s).
    - Appended tier-3 curator attributions (`Piers Fawkes / PSFK`, `Heather Bennett / Michaels`, `Susie Hogarth / Firefish`) for all graph entries; replaced `<graph_id> (Fodda internal)` placeholders.
    - Standardized output section header to `## Sources & References` and ensured Gemini's self-generated section is always replaced.
  - Bumped `server_version` to `1.35.3`.

## [1.35.2] - 2026-07-29

### Fixed
- **Source Plan Cache-Busting (P1) & Graph Provenance Sources with Curator Links (P2)** (`src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - **P1 (Source Plan Cache-Busting)**: Folded server version `v1.35.2` into `sourcePlanCache` keys in `catalogCache.ts` and added auto-flushing on `initCatalogCache()` and `rebuildSearchIndex()`. Guaranteed that server deployments invalidate all stale cached source plans immediately.
  - **P2 (Graph Provenance Links & Attributions)**: Extended `deepResearch.ts` to harvest graph provenance sources for every active knowledge graph searched. Implemented fallback citation link order: (1) evidence-level external `sourceUrl` / `formatted_citation`, (2) resolved graph deep-link (`webpage_url` or `https://fodda.ai/graphs/${g.graph_id}`), (3) curator publication `source_url`. Added curator attributions (e.g. `Heather Bennett / Michaels`, `Susie Hogarth / Firefish`).
  - Guaranteed every report (corpus-native, web, or mixed) emits a complete `## Sources & References` section with zero dead ends or raw redirect links.
  - Bumped `server_version` to `1.35.2`.

## [1.35.1] - 2026-07-29

### Fixed
- **Source Plan Discrepancy Fix (`extractRoutingTopic`)** (`src/toolHandlers.ts`):
  - Resolved routing source_plan mismatch: `toolHandlers.ts` was passing `cleanQuery` (the full 90-word raw user prompt containing generic words like "market sizing", "forecasts", "growth") to `getRelevantSources()` for building `sourcePlan` / `previewCandidates`, whereas `deepResearch.ts` was using `extractRoutingTopic(query)`.
  - Updated `toolHandlers.ts` to pass `extractRoutingTopic(query)` ("wine fridges, wine furniture and wine glassware and accessories") to `getRelevantSources()`.
  - Guarantees `source_plan` in `deep_research_topic` matches the specialist-boosted graph candidate ranking (`retail` #1, `mintel-food-and-drink` #2, `waldo-coffee-maker-innovation` #3, `pinterest-home` #4, `restaurant-dining-trends` #6, `trendbible-home` #7).
  - Bumped `server_version` to `1.35.1`.

## [1.35.0] - 2026-07-29

### Fixed
- **Grounding API Redirect URL Stripping & Topic Specialist Router Release** (`src/deepResearch.ts`, `src/catalogCache.ts`):
  - Fixed Sources list URL leak: added regex post-processor to detect and strip self-generated `## Sources` sections containing raw `vertexaisearch.cloud.google.com` or `google.com/url` redirect links, replacing them with clean, verified `sourceUrls`.
  - Released 100% topic-agnostic graph router in `catalogCache.ts`: Topic Specialist Boost (+0.10) surfaces `waldo-coffee-maker-innovation-trends`, `pinterest-home`, `trendbible-on-the-horizon-2026`, `restaurant-dining-trends`, and `bompasparr-future-of-p-leisure-2026-nightlife` alongside `retail`.
  - Bumped `server_version` to `1.35.0`.

## [1.34.4] - 2026-07-29

### Fixed
- **Outlier Order-of-Magnitude Market Sizing Guardrail & Grounding Redirect URL Filter** (`src/agents/fodda-researcher/skills.ts`, `src/deepResearch.ts`):
  - Added `RULE: OutlierOrderOfMagnitudeGuardrail` to `SKILL_SOURCE_QUALITY`: requires Gemini to discard wild outlier market size estimates that differ by an order of magnitude or more (e.g. $430 billion vs $1.5-$3.5 billion for wine fridges) rather than hedging or keeping them.
  - Added regex unwrap filter to strip raw `vertexaisearch.cloud.google.com` and `google.com/url` redirect links embedded in markdown text by Gemini.
  - Enhanced `normalizeUrl` and `isInternalOrSearchUrl` to extract target destinations from Google redirect URLs and filter internal search/grounding domains.
  - Bumped `server_version` to `1.34.4`.

## [1.34.3] - 2026-07-29

### Fixed
- **Topic-Agnostic Graph Relevance Scoring** (`src/catalogCache.ts`):
  - Refactored `scoreClauseRelevance` in `catalogCache.ts` to be 100% topic-agnostic without any hardcoded query strings or hardcoded graph penalties.
  - Rewarded topic specialist matches (+0.10) whenever a graph's explicit `topics`, `routing_keywords`, `name`, or `graph_id` matches query terms or expanded category clusters directly.
  - Expanded `QUERY_EXPANSION_MAP` across all major industry verticals (Automotive & EV, Pet & Animal Care, AI & SaaS, Home & Living, Food & Dining, Retail & E-Commerce).
  - Generalized narrow-domain mismatch penalties so unrelated narrow graphs (beauty, gaming, automotive) are safely penalized on irrelevant queries.
  - Bumped `server_version` to `1.34.3`.

## [1.34.2] - 2026-07-29

### Fixed
- **Domain-Specialist Graph Routing & Expansion** (`src/catalogCache.ts`):
  - Updated `scoreClauseRelevance` in `catalogCache.ts` with a specialist domain boost (+0.12) for home, appliances, kitchen, dining, beverage, hospitality, and nightlife graphs when product/lifestyle queries are present.
  - Added a soft penalty (-0.10) for generic marketing agency reports (`Dentsu`, `Edelman`, `Michaels`, `Forrester`), preventing generic agency graphs from crowding out specialized appliance and nightlife graphs.
  - Successfully surfaces `waldo-coffee-maker-innovation-trends` (#3), `pinterest-home` (#4), `restaurant-dining-trends` (#6), `trendbible-on-the-horizon-2026` (#7), and `bompasparr-future-of-p-leisure-2026-nightlife` (#11) alongside `retail` (#1).
  - Bumped `server_version` to `1.34.2`.

## [1.34.1] - 2026-07-29

### Fixed
- **Query Expansion for Home, Appliance Innovation & Nightlife Graphs** (`src/catalogCache.ts`):
  - Expanded `QUERY_EXPANSION_MAP` for `wine`, `beverage`, `dining`, `glassware`, `fridge`, `appliances`, and `furniture` to map to `nightlife`, `leisure`, `entertainment`, `kitchen`, and `interior`.
  - Enables the router to reach specialized home/appliance innovation graphs (`pinterest-home`, `trendbible-on-the-horizon-2026`, `waldo-coffee-maker-innovation-trends`) and nightlife/hospitality graphs (`bompasparr-future-of-p-leisure-2026-nightlife`, `restaurant-dining-trends`, `eventbrite-live-experiences-2026`).
  - Bumped `server_version` to `1.34.1`.

## [1.34.0] - 2026-07-29

### Optimized & Fixed
- **Heavy Synthesis Optimization & 180s Gemini Timeout Window** (`src/deepResearch.ts`, `src/index.ts`):
  - Capped curated trends per graph (top 6 in heavy, top 4 in light) to keep synthesis prompt context high-density and prevent model generation timeouts on heavy multi-pass runs.
  - Increased Gemini generation timeout promise guard from 150s to 180s in `index.ts`.
  - Bumped `server_version` to `1.34.0`.

## [1.33.9] - 2026-07-29

### Fixed
- **Word-Boundary Truncation Fix, Hard 240s Job Timeout Guard & LLM Sub-Theme Expander Prompting** (`src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Fixed sub-theme truncation bug in `fallbackSubThemes()`: clean topics now snap back to the last complete word boundary (`lastIndexOf(' ', 40)`), eliminating broken search tokens like `"wine glasswa"`.
  - Added a guaranteed hard 240s background timer guard (`jobTimeoutTimer`) on `activeResearchJobs` in `toolHandlers.ts` that automatically transitions stalled jobs to `FAILED` status, eliminating background hangs.
  - Enhanced `generateSubThemes()` with robust JSON regex parsing (`match(/\[[\s\S]*\]/)`) and explicit error stack logging.
  - Bumped `server_version` to `1.33.9`.

## [1.33.8] - 2026-07-29

### Fixed
- **LLM Sub-Theme Expander (`response_mime_type`), `check_research_status` Payload & URL Parser Normalization** (`src/deepResearch.ts`, `src/toolHandlers.ts`, `src/index.ts`):
  - Added `response_mime_type` support to `waverunnerRequest` in `index.ts`, enabling structured JSON response output for LLM calls.
  - Configured `generateSubThemes` to pass `response_mime_type: 'application/json'` and full error stack logging, ensuring topic-specific LLM sub-themes generate reliably.
  - Cleaned `fallbackSubThemes` to truncate 20-word multi-clause queries and include explicit moderation & lifestyle shift angles in heavy mode (addressing Bompas & Parr's "New Night Sips" trend data).
  - Explicitly surfaced `sub_themes_used` in `check_research_status` completion response payload.
  - Upgraded `normalizeUrl` with `new URL(u)` parser validation: strips inner spaces in paths (e.g. `funded- startups`), rejects missing hostnames (`https.com`), and validates http/https protocol.
  - Bumped `server_version` to `1.33.8`.

## [1.33.7] - 2026-07-29

### Fixed
- **URL Scheme Normalization, `sub_themes_used` Payload Visibility & `gemini-2.0-flash` Expansion** (`src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Added URL scheme normalization (`normalizeUrl`) to recover malformed Gemini grounding URLs (`https.domain.com` -> `https://domain.com` and `httpss://` -> `https://`), restoring 9+ valid publisher citations.
  - Included `sub_themes_used` in the initial `deep_research_topic` tool payload response for immediate caller visibility.
  - Switched sub-theme expansion model to `gemini-2.0-flash`, ensuring LLM-generated topic-specific sub-themes fire consistently.
  - Bumped `server_version` to `1.33.7`.

## [1.33.6] - 2026-07-29

### Added & Fixed
- **Sub-Themes Tiered Architecture & Per-Call Timeout Guards for `deep_research_topic`** (`src/deepResearch.ts`, `src/toolHandlers.ts`, `src/agents/fodda-researcher/index.ts`, `src/agents/fodda-researcher/skills.ts`):
  - Implemented `sub_themes` optional array parameter in `deep_research_topic` tool schema and `runDeepResearch` pipeline. If omitted, sub-themes are generated automatically server-side via `gemini-2.0-flash-lite` (with deterministic fallback).
  - Transitioned graph retrieval to a **Tiered Two-Pass Architecture**: Pass 1 runs broad discovery (`routingTopic`) across all graphs (limit 3); Pass 2 runs deep sub-theme searches on top-hit graphs only (limit 5, ranked by max row relevance score + router score tiebreaker).
  - Ported `linkedinEngine.ts` curation/deduplication layer: keyed by `(graphId, trendName)` to preserve multi-graph corroboration signals and aggregated `subThemes: Set<string>` on each trend. Deep hits take priority so Gemini's synthesis context explicitly maps which trends support which sub-themes.
  - Added per-call 8s timeout guards (`withTimeout`) inside `Promise.all` search mapping loops, preventing a single slow graph from failing the entire pass.
  - Refined citation guards: dropped false-positive digit regexes in favor of strictly verbatim source-metadata URLs from Gemini annotations (`url_citation` / `groundingChunks`), with `httpss://` scheme and `YOUR_\w+` placeholder checks. Added raw citation payload logging.
  - Added `subThemesUsed` to `GraphContext` and injected `## Mandatory Research Sub-Themes` into the researcher agent instruction. Added `ConflictingEstimates` rule to `SKILL_SOURCE_QUALITY` requiring all conflicting quantitative estimates to be surfaced with sources.
  - Updated tool descriptions and cost units to reflect repriced tiered call budgets (Light: 25–30 API calls, Heavy: 40–50 API calls) with a 240s global execution ceiling. Bumped `server_version` to `1.33.6`.

## [1.33.5] - 2026-07-29

### Fixed
- **Deep Research Phase 0 Publisher Exclusions, 150s Timeout Guard & Regression Test Suite** (`src/catalogCache.ts`, `src/index.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Excluded generic publisher/consultancy names (`mckinsey`, `bcg`, `deloitte`, `kpmg`, `forrester`, `gartner`, `pwc`, `ey`, `capgemini`, `bain`, `niq`, `mintel`, `dentsu`) from Phase 0 company name matching in `catalogCache.ts`.
  - Added `server_version: 1.33.2` to `deep_research_topic` initial `source_plan` payload.
  - Increased synthesis timeout guard in `src/index.ts` to 150s with explicit `clearTimeout` cleanup.
  - Mandated web-grounded quantitative market sizing, dollar values, and CAGRs in `src/deepResearch.ts`.
  - Created automated regression test suite `scratch/test_regression_suite.ts` verifying `retail` at Rank #1 (`0.357`), `0.250` score spread, and 0 automotive false positives on multi-clause strategist briefs.

### Fixed
- **Deep Research Query Clause Decomposition, Flagship Retail Anchor Boost & Timeout Guard** (`src/catalogCache.ts`, `src/index.ts`, `src/deepResearch.ts`):
  - Implemented multi-clause query decomposition in `scoreGraphRelevance` (`scoreClauseRelevance`). Multi-clause research prompts are split across punctuation and conjunctions, evaluated per clause, and combined via `(maxScore * 0.7) + (avgScore * 0.3)` to prevent multi-sentence prompt dilution.
  - Added flagship `retail` graph anchor boost (+0.25) to guarantee `PSFK Retail Trends` (192 trends) ranks #1 for product, commerce, hardware, appliance, and channel queries.
  - Added out-of-domain mismatch penalty (-0.3) for pure `beauty`/`skincare`/`fragrance` graphs when query contains no beauty terms, eliminating beauty graph false positives.
  - Wrapped `ai.models.generateContent` in `src/index.ts` with a 90-second timeout promise guard (`Promise.race`) to prevent research synthesis requests from hanging indefinitely.
- **Deep Research Query Expansion, Phase 0 Routing & Citation Hygiene** (`src/catalogCache.ts`, `src/deepResearch.ts`, `src/toolHandlers.ts`):
  - Refined Phase 0 direct matching in `catalogCache.ts` using regex word boundaries (`matchesWordBoundary`) and generic term exclusion. Fixed `isDirectMatch` tracking on `GraphRelevanceResult` so high topic-match scores are no longer falsely reported with reason `"named directly in query"`.
  - Added research meta-words (`run`, `fodda`, `deep`, `research`, `project`, `about`, `briefing`, etc.) to `stopWords` in `scoreGraphRelevance`, preventing prompt wrapper words from triggering false-positive matches on unrelated graphs.
  - Added `QUERY_EXPANSION_MAP` to `catalogCache.ts` (`scoreGraphRelevance`) for niche product term expansion (`wine`, `fridges`, `furniture`, `glassware`, `accessories`, `barware`, `appliances`, etc.), mapping queries to relevant graphs (Home & Living, Beverage Tech, Food & Beverage, CPG & Retail Futures).
  - Cleaned up citation output in `deepResearch.ts`: filtered out internal `fodda.ai` self-citations and Google Vertex search URLs, prevented un-cited graph background URLs from dumping into the sources list, and eliminated duplicate `## Sources` headers in report payloads.
- **Deep Research Gemini API Migration & Source Plan Fallback** (`src/index.ts`, `src/catalogCache.ts`):
  - Migrated `waverunnerRequest` from deprecated `ai.interactions.create()` to the supported `@google/genai` `ai.models.generateContent()` API, resolving the 400 legacy schema error (`interactions-breaking-changes-may-2026`).
  - Updated `getRelevantSources` in `catalogCache.ts` to default `minGraphs = 2` when not specified, ensuring `source_plan` and knowledge graph candidates are always populated for broad research queries.
- **Backend Error Visibility & Non-Silent Failures** (`src/toolHandlers.ts`):
  - Updated `addCoverageAnnotation` to explicitly check for backend error signals (`normalizedData.error`, `error_code`, `code`, `status === 'error'`, `dataStatus === 'error'`). Sets `coverage.status = 'error'` instead of falling through to `coverage.status = 'empty'`.
  - Updated search tool handlers (`search_graph`, `get_domain_intelligence`, `get_expert_intelligence`, `get_report_intelligence`, `search_statistics`, `search_insights`) to check for `coverage.status === 'error'` or `error` and return `{ isError: true, ... }`. This prevents backend authentication failures (such as `NEO4J_AUTH_MISSING` or API 401/5xx) from being misreported as "zero results across graphs due to low domain coverage."

### Added
- **Company-Specific Executive Routing ("Nike CMO")** (`src/toolHandlers.ts`, `tools-manifest.json`):
  - Updated `list_analysts` description and return payload to include a top-level `company_query_guide` explaining how company-specific queries (e.g., 'Nike CMO', 'Apple CEO', 'Target CFO') map to role-based analyst IDs (`brand-cmo`, `brand-ceo`, `brand-cfo`) with a `company` parameter.
  - Implemented `resolveAnalystAlias` in `consult_analyst` to automatically parse and resolve alias strings (e.g., `"Nike CMO"`, `"nike-cmo"`, `"Nike Synthetic CMO"`, `"Apple CEO"`) into the target role ID (`brand-cmo`) and extracted `company` parameter (`"Nike"`).

### Added
- **Fodda MCP Discoverability & Orientation Refactor** (`src/systemPrompt.ts`, `src/catalogCache.ts`, `src/tools.ts`, `src/index.ts`, `src/toolHandlers.ts`):
  - **Front-Loaded Capabilities Instructions**: Replaced buried text in `buildSystemPrompt()` with a ~600 character marquee capabilities block at the very start of `instructions`. Includes explicit scope rules establishing platform capabilities as the default interpretation for unqualified "offerings", "features", and "what can you do" queries.
  - **Graph Naming Table Eviction**: Evicted the 193-line `graphId` lookup table from `instructions` (~90% payload reduction), replacing it with concise attribution guidance pointing models to `list_graphs`.
  - **Broadly-Named Orientation Tool (`get_capabilities`)**: Added `get_capabilities` tool across all endpoints (`/brand-intelligence`, `/topic-research`, `/deep-research`, `/earnings-intelligence`, `/expert-consult`), carrying a phrasing-agnostic synonym list in its description. Sourced pricing dynamically from `getToolCostSummary()` / `getQueryPricing()` at runtime.
  - **Market-Validated Consumer Trends Tool (`get_validated_trends`)**: Added `get_validated_trends` tool connected to `/v1/earnings/validated-trends` (with snapshot fallback) and surfaced on `/earnings-intelligence` and `/topic-research` endpoints.
  - **Renamed Onboarding Tool**: Renamed `run_deep_research` to `expert_onboarding_research` to avoid naming collision with `deep_research_topic`.
  - **Safe Analyst Deduplication**: Refactored `list_analysts` to deduplicate duplicate analyst records by ID/slug without dropping analysts with empty offerings, surfacing non-commissionable experts with `commissionable: false`.

### Added
- **Unmask `topics` and `verticals` in `list_graphs`** (`src/toolHandlers.ts`):
  - Added `'topics'` and `'verticals'` to `GRAPH_LIST_ALLOWLIST` so curated graph objects in `graphs[]` surface their topic tags and vertical classifications alongside `supplemental_sources[]`.
  - **Before:**
    ```json
    {
      "graph_id": "beauty",
      "name": "Beauty & Personal Care",
      "one_liner": "Trend signals across skincare, cosmetics, wellness...",
      "trend_count": 42
    }
    ```
  - **After:**
    ```json
    {
      "graph_id": "beauty",
      "name": "Beauty & Personal Care",
      "one_liner": "Trend signals across skincare, cosmetics, wellness...",
      "trend_count": 42,
      "topics": ["beauty", "health", "skincare"],
      "verticals": ["consumer-goods"]
    }
    ```
- **Offering-Scoped MCP Endpoints Rollout (5 Marquee Offerings)** (`src/index.ts`, `src/toolHandlers.ts`, `fodda_mcp_*_server.json`):
  - **Scoped Tool Filtering (`src/toolHandlers.ts`)**: Added `allowedTools` filtering to `createServer()` via SDK `disable()` method, enforcing endpoint-level tool subsetting across all scoped endpoints.
  - **5 Scoped Routes & Source Attribution (`src/index.ts`)**: Stood up all 5 marquee endpoints: `/brand-intelligence` (12 tools), `/topic-research` (13 tools), `/deep-research` (13 tools), `/earnings-intelligence` (11 tools), and `/expert-consult` (12 tools). Requests arriving at each endpoint automatically set matching `source: '<slug>'` for connection telemetry.
  - **Discovery Cards (`src/index.ts`)**: Added `/.well-known/<slug>` discovery endpoints returning metadata for `ai.fodda/brand-intelligence`, `ai.fodda/topic-research`, `ai.fodda/deep-research`, `ai.fodda/earnings-intelligence`, and `ai.fodda/expert-consult`.
  - **MCP Registry Records (`fodda_mcp_*_server.json`)**: Created canonical domain-verified registry definitions for `ai.fodda/topic-research`, `ai.fodda/deep-research`, `ai.fodda/earnings-intelligence`, and `ai.fodda/expert-consult`.
- **Pricing Infrastructure Handoff (§2, §5, §6, §7)** (`src/pricingCache.ts`, `src/toolHandlers.ts`, `src/index.ts`, `src/resources.ts`, `src/telemetry.ts`):
  - **§2 — 1-Call 1-Price (`query_costs` explicit mode args)**: Added explicit `mode` parameter enums to multi-price tools (`search_graph`: `research`|`compare`, `deep_research_topic`: `light`|`heavy`, `get_company_earnings`: `snapshot`|`history`|`qa`|`compare`|`guidance`|`coverage`). Updated `getQueryTypeForTool` and `getToolCostSummary` so tool + mode arguments map deterministically to a single cost.
  - **§5 — Discovery Surface & Card**: Implemented `/.well-known/mcp-server.json` and `/.well-known/mcp` metadata endpoints detailing server capabilities, structure (free) vs substance (metered) pricing tiers.
  - **§6 — Citable Resource URIs**: Implemented `src/resources.ts` registering durable MCP Resources with the `fodda://` scheme (`fodda://expert/{slug}/insight/{id}`, `fodda://graph/{vertical}/trend/{slug}`) to enable downstream attribution in LLM outputs.
  - **§7 — Error-Rate Instrumentation**: Created `src/telemetry.ts` to record tool pass/fail outcomes, compute per-tool and global error rates, and exposed `/telemetry` and `/v1/feedback` HTTP endpoints.
- **Onboarding Gating and Error Propagation** (`src/toolHandlers.ts`): Added pre-flight key checks to all onboarding tools to immediately short-circuit if `apiKey` is empty. Propagated server credentials-missing warnings verbatim as plain text to show the `join-experts` connector URL directly inside Claude.
- **`/c/:token` SSE Transport and Token Resolution Cache** (`src/index.ts`): Implemented a route for token-resolved connector connection and an in-memory resolution cache (1 minute TTL) to minimize redundant requests.

### Changed
- **`begin_expert_onboarding` description** (`src/toolHandlers.ts`): Updated description to register explicit support for both `"Onboard me as a Fodda expert"` and `"Onclaude me as a Fodda expert"` triggers.
- **API Routing** (`src/index.ts`): Routed `/api/*` calls in `foddaRequest` directly to `www.fodda.ai`.
- **Digital Twin Envelope Rendering** (`toolHandlers.ts`): `consult_analyst` handler now surfaces the structured envelope from the API — coverage status (`in`/`adjacent`/`out`), source attribution, referrals, and speaker notes — as delimited blocks in the tool result. Legacy (non-envelope) responses render unchanged.
- **Jeremy Bergstein analyst entry** (`systemPrompt.ts`): Added `jeremy-bergstein-science-education-innovation` to `ANALYST_ENTRIES` routing table, mapped to the `postpals-expert-graph` graph.
- **`toggle_graph_preference` tool** (`src/toolHandlers.ts`, `src/tools.ts`): Added a new tool that allows the MCP agent to permanently enable or disable any knowledge graph, supplemental data source, or skill on the user's behalf. It calls the new `POST /v1/user/preferences/toggle` API endpoint.
- **Claude Tag Setup Guide** (`docs/claude-tag-setup.md`): Step-by-step admin guide for connecting Fodda as a Claude Tag MCP tool connector in Enterprise/Team Slack workspaces. Covers endpoint configuration, authentication, tool selection by team type, billing, and troubleshooting.

### Changed
- **Dual-Voice Speaker Rules** (`systemPrompt.ts`): Updated `VirtualExpertConsultation` sequence with three-branch rendering: `in` → expert 1st-person voice; `adjacent` → expert's full answer + referrals offered in platform voice as "also worth checking"; `out` → expert's short decline + narrator 3rd-person referral handoff. The client LLM must never extend the expert's answer beyond the API result or answer off-topic in the expert's voice.
- **Parallel Hedge Probing** (`systemPrompt.ts`): Consultation sequence now fires `consult_analyst` and targeted `search_graph` hedge probes on 1–2 relevant adjacent graphs in the same tool-call turn rather than serially. `get_supplemental_context` reserved for stats-shaped queries only. `get_expert_intelligence` explicitly excluded from hedges to avoid fan-out billing.
- **`consult_analyst` tool description** (`toolHandlers.ts`): Updated to mention coverage/referral envelope and the 3rd-person rendering rule.
- **System Prompt** (`systemPrompt.ts`): Updated rules for skill configuration. Explicitly instruct the LLM to call `toggle_graph_preference` instead of directing users to the dashboard when they ask to turn graphs, sources, or skills on or off.
- **User ID Extraction** (`src/index.ts`): Enhanced `/mcp` and `/sse` transport handlers to extract `userId` from client-provided headers (`X-User-Id` or `x-user-id`) in addition to URL query parameters.
- **CORS Configuration** (`src/index.ts`): Added `X-User-Id` to `Access-Control-Allow-Headers` CORS configuration to allow cross-origin browser clients to send custom user identity headers without preflight blocks.
- **Claude Tag Readiness — Tool Description Polish** (`toolHandlers.ts`): Rewrote 12 tool descriptions for clarity in multiplayer Slack contexts where non-technical users trigger tools via `@Claude`. Removed implementation jargon (e.g. "traverse graph relationships", "pre-computed embeddings", "institutional market data"), led with user outcomes, preserved developer-facing detail in parameter descriptions. Affected tools: `search_graph`, `get_neighbors`, `get_evidence`, `get_node`, `get_label_values`, `discover_adjacent_trends`, `get_supplemental_context`, `search_statistics`, `search_insights`, `check_supplemental_status`, `check_research_status`, `generate_visual`.

### Fixed
- **`confirm_themes` tool handler** (`src/toolHandlers.ts`): Prevent advancing to `schedule_interview` when questionnaire generation fails (returns HTTP 200 with `{ success: false }`). Instead, return a non-advancing error instructing the agent/LLM to retry `confirm_themes`.
- **Routing instruction leak** (`toolHandlers.ts`): Internal `[ROUTING INSTRUCTION: ...]` blocks were being injected into the public `description` field in `list_graphs` output — visible to any MCP client. Routing guidance now surfaces as a dedicated `routing_hint` field, keeping descriptions client-safe. A defensive `stripRoutingInstruction()` sanitizer also strips any routing text baked into API-side descriptions.
- **Report graph trend discoverability** (`toolHandlers.ts`): `get_label_values` description now explicitly guides LLMs to use `label="Trend"` for complete, deterministic trend enumeration on industry-report graphs where `search_insights`/`search_statistics` return partial or empty results due to unlinked evidence.
- **`search_graph` payload size fallback** (`src/toolHandlers.ts`): Fixed a critical bug where `data` (with all heavy evidence arrays) was returned instead of `jsonPayload`/`liteData` (with evidence stripped) when payload size checks (>30KB) were triggered, causing context overflows and massive response payloads.
- **`search_graph` fallback path** (`src/toolHandlers.ts`): Fixed same issue in the no-widget fallback path, ensuring evidence arrays are stripped before returning.

## [1.26.0] - 2026-05-12

### Added
- **Analyst Routing Logic** (`systemPrompt.ts`): Implemented a mandatory two-step workflow for Consulting Analysts. The LLM must now search the relevant domain graph first and inject found signals into the analyst consultation query to ground the response.
- **Enhanced Auth Support** (`index.ts`): Added support for `X-API-Key` and `Authorization Bearer` headers in the `/mcp` route, improving compatibility with remote MCP clients and API gateways.

### Changed
- **Server Name**: Internal MCP server name changed from `fodda-mcp` to `fodda_mcp` for better compatibility with certain SDK clients.


### Added
- **Consulting Analysts Tooling** (`toolHandlers.ts`, `tools.ts`): New orchestration flow for "talking to" Synthetic Analysts.
  - **`list_analysts` tool**: Discovers available expert personas (e.g., Ben Dietz) and their specialized domains.
  - **`consult_analyst` tool**: Enables direct conversation with an analyst persona. Routes to the Fodda API's new analyst consultation engine.
- **Fodda Research Agent (Autonomous Research)** (`src/agents/fodda-researcher/`): Integrated a new autonomous agent architecture for deep analysis.
  - **Skill-Injected Instruction Engine**: Assembles complex system instructions from 5 modular skill files: Research Methodology, Evidence Categories, Output Format, Graph Awareness, and Source Quality.
  - **Graph Context Injection**: `deep_research_topic` now pre-fetches graph results and injects them as primary source material into the agent's context, ensuring "graph-first" autonomous research.
  - **Waverunner Integration**: Researcher agent utilizes the Gemini Interactions API (via `waverunnerRequest`) with autonomous `google_search` and `url_context` tools.

### Changed
- **`deep_research_topic` Orchestration**: Refactored to use the new `Fodda Research Agent` architecture. Includes 5-phase research loop (Plan → Search → Read → Synthesize → Cite) and editorial-quality reporting.
- **Version Bump**: Updated server version to 1.25.0 to reflect major agentic capability expansion.

### Added
- **Fixed-Price Query Billing System** (`pricingCache.ts`, `toolHandlers.ts`, `index.ts`): Major billing architecture change — migrated from variable per-API-call token metering to fixed-price-per-query billing. Each query type (Topic Research, Brand Intelligence, Brainstorm, etc.) now has a single fixed cost in API calls, charged once at query completion via `POST /v1/research/meter`.
  - **`pricingCache.ts`** (NEW): Centralized pricing engine with 15 query type definitions, hardcoded defaults, and optional Airtable-backed dynamic pricing (`tblHsMfyoW39LqCv8`). Exports `chargeQuery()` — the single billing entry point for all tool handlers. Differentiates between trial users (Firestore counter), paid users (meter API), and free tools (no charge).
  - **`chargeQuery()` wired into 7 billing points** across `toolHandlers.ts`: `search_graph` (3 return paths), `brand_tracker`, `get_supplemental_context`, `brainstorm_topic`, `read_url`, `deep_research_topic`. Fire-and-forget pattern — billing never blocks the response.
  - **`X-Fodda-Billing: mcp-orchestrated` header** (`index.ts`): Added to all `foddaRequest()` calls. Signals the API to skip per-call `decrementCredits()` and let the MCP handle billing via the meter endpoint. Prevents double-billing.
  - **Query Pricing Table** created in Airtable (`tblHsMfyoW39LqCv8`): 15 records covering all query types with `apiCallsCharged`, `researchCalls`, `overheadCalls`, margin formulas, and tool mappings. MCP reads this table hourly when `AIRTABLE_API_KEY` is set.

### Changed
- **Terminology: "tokens" → "API calls"**: Platform-wide rename across all user-facing strings in system prompts, tool descriptions, error messages, and account status displays. Internal variable names preserved. Coordinated across API, App, and Website agents.
- **`deep_research_topic` pricing**: `comprehensive` tier changed from 50 to 30 API calls to align with new fixed pricing.

### Fixed
- **`brand_tracker` — empty evidence tab** (`toolHandlers.ts`): The Cypher endpoint (`/v1/brand-intelligence/:brand`) returns `evidenceCount` as a scalar but may not include the actual evidence items in the response. The evidence tab was rendering empty because `t.evidence` was `undefined` despite `t.evidenceCount` being 32. Added an evidence backfill step: when Cypher returns trends with `evidenceCount > 0` but no `evidence` array, the MCP now calls `/v1/graphs/:graphId/evidence` per-trend to recover the actual evidence items.
- **`brand_tracker` — only 1 trend surfaced for well-known brands** (`toolHandlers.ts`): The fallback multi-graph search used `use_semantic: true` which correctly found relevant trends, but the post-search brand filter required the brand name as a literal string in the trend name, description, or evidence text. Semantically relevant trends (e.g., "Closed-Loop Textiles" for Patagonia) were discarded. Added a second-tier semantic relevance check: rows with `signal_score >= 60` from semantic search are now accepted even without a direct brand name mention.
- **`brand_tracker` — Google Trends flat-line chart displayed when no data** (`brandTemplate.ts`): When the Google Trends API returned a valid response wrapper but empty `interest_over_time`, the widget showed a flat line at y=88 with no labels — confusing users. The chart section, comparison bars, related queries, and geographic spread sections are now conditionally hidden via `display:none` when their data is empty. The "Google Trends" source pill is also suppressed when there's no actual time-series data.
- **`brand_tracker` — Gemini 429 error rendered in Analysis tab** (`editorialFill.ts`): When Gemini returned a rate-limit error (429), the raw error string was injected directly into the widget's Analysis tab HTML. Both `fillBrandVerdict` and `fillAnalysis` now return empty strings on failure (logging the error to stderr), keeping the `{{ANALYSIS_HTML}}` slot open for Claude to fill client-side.

### Added
- **Waverunner Agent Intelligence Integration**: Major capability expansion integrating the Gemini Agents (Waverunner) API for autonomous research and visual intelligence.
  - **`read_url` MCP tool** (`toolHandlers.ts`): Extracts clean text from any URL using Waverunner's native `url_context`. Users paste a link and cross-reference against Fodda graphs.
  - **`generate_visual` MCP tool** (`toolHandlers.ts`): On-demand SVG visualization. 6 chart types: cultural_shifts, competitive_compass, trend_constellation, implication_ladder, innovation_pathway, opportunity_map. Returns inline SVG.
  - **SVG Visual Engine** (`svgVisuals.ts`): Fodda watercolor aesthetic — purple node blobs, ambient specks, dot-chain trails. Off-white paper background, Fodda purple palette.
  - **Auto-generated Trend Constellation** (`toolHandlers.ts`): `deep_research_topic` automatically generates a constellation SVG from search results and prepends it to the response.
  - **`url_context` for Waverunner sub-agent** (`toolHandlers.ts`): Research agent can now autonomously read URLs during deep research loops.
- **New API Endpoints** (shipped by API Agent): `GET /v1/research/stream` (Glass Brain SSE), `POST /v1/research/deep-dive` (premium async research), `GET /v1/context` (URL extraction).

### Added
- **`brainstorm_topic` tool** (`toolHandlers.ts`): Fourth MCP orchestration flow — graph-native ideation via neighbor traversal. Searches up to 4 relevant graphs in parallel for seed trends, runs `get_neighbors` (depth 1-2) on each seed to discover adjacent territories, clusters results into trends/brands/locations, and generates graph-powered `suggested_next_prompts` based on actual knowledge graph connections instead of text-derived follow-ups. Returns a structured brainstorm map with seed trends, adjacent territories, key brands (flagged when cross-trend), geographic hotspots, and discovery stats.
- **`get_supplemental_context` tool** (`toolHandlers.ts`): Unified supplemental data tool calling the new `POST /v1/supplemental/context` API endpoint. A single call queries up to 8 institutional data sources (Google Trends, Census, FRED, BEA, BLS, OECD, etc.) in parallel — the server selects the most relevant sources based on query and domain. Accepts `query`, `domain`, `brands`, and `graph_ids` parameters. Billed as 1 token per call regardless of internal source fan-out.
- **`get_domain_intelligence` tool** (`toolHandlers.ts`): Searches ALL PSFK curated domain graphs (retail, beauty, fashion, sports, etc.) in parallel via `POST /v1/search/domain`. Returns trends with bundled evidence pre-categorized into statistics, case studies, analysis, and interviews. No graph ID needed — the API handles graph selection.
- **`get_expert_intelligence` tool** (`toolHandlers.ts`): Searches ALL expert specialist graphs in parallel via `POST /v1/search/expert`. Returns trends with bundled evidence from named strategists and industry leaders. No graph ID needed.
- **`get_report_intelligence` tool** (`toolHandlers.ts`): Searches ALL industry report graphs in parallel via `POST /v1/search/report`. Returns market forecasts, quantitative projections, and published research findings with bundled evidence. No graph ID needed.

### Changed
- **Expert graph evidence tools unblocked** (`toolHandlers.ts`, `catalogCache.ts`, `systemPrompt.ts`): Removed the restriction that prevented `search_statistics` and `search_insights` from running on expert graphs. Both tool descriptions, the dynamic expert workflow prompt block, the curated-only tools block, and the system prompt all updated from "Do NOT call on expert graphs" to "Works on ALL graphs." Expert graphs have rich categorized evidence (48% Statistic, 27% Case Study, 14% Analysis, 10% Interview).
- **Expert graph evidence categories normalized** (Airtable): Batch-updated 1,210 records in the Expert Reports Evidence table to the PSFK standard 4-category taxonomy: Case Study, Statistic, Analysis, Interview. Mapped 17 non-standard labels (Statistics→Statistic, Quote→Interview, Policy→Analysis, etc.).
- **System prompt Step 3 updated** (`systemPrompt.ts`): Now instructs the LLM to use `get_supplemental_context` for macro data instead of picking individual supplemental tools.

### Added
- **Feedback & Frustration → Slack Alerts** (Brief: `brief_mcp_frustration_to_slack.md`): When users send feedback or the session detects aggregate frustration, an alert is now posted to `#fodda-sales` on the PSFK Slack workspace — in addition to the existing Resend email. The Fodda Sales bot auto-enriches these alerts with user context (query history, Streak CRM status).
  - **`postToSlack()` helper** (`sessionTracker.ts`): New exported function that POSTs to Slack via `chat.postMessage` using `SLACK_BOT_TOKEN`. Fire-and-forget — errors are logged but never thrown or awaited in the hot path.
  - **`send_feedback` → Slack** (`toolHandlers.ts`): Every feedback submission now posts a formatted alert to `#fodda-sales` with category-specific emoji (💬 feedback, 🐛 bug, ✨ feature_request, 🚪 exit_reason, 😤 complaint), user email, and the full feedback text. The `<@U0AU49JG7AS>` mention triggers the sales bot's auto-enrichment.
  - **Aggregate frustration → Slack** (`sessionTracker.ts`): When `detectFrustration()` fires and the session's frustration score is ≥ 2 (i.e., multiple patterns triggered — LOW_YIELD + NO_MATCH, or NO_MATCH + GRAPH_BOUNCING, etc.), a single alert is posted to Slack with the user identifier, dominant pattern, graphs tried, and recent queries. Posts once per session to avoid noise.
  - **New types & functions** (`sessionTracker.ts`): `FrustrationPattern`, `FrustrationDetails`, `getFrustrationDetails()`, `getRecentSearches()`, `postFrustrationToSlack()`.
  - **Env var**: `SLACK_BOT_TOKEN` added to `.env.example`. Also documented `RESEND_API_KEY`.
  - **What's preserved**: Resend email (reliable backup), invisible hint injection for Claude's strategy adjustment, NO_MATCH individual events (not posted to Slack — only aggregate frustration).

### Added
- **User Context Persistence** (Brief: `mcp_user_context_brief.md`): Implemented the API agent's user context system — a two-layer personalization architecture that persists user research profiles across sessions and detects structural frustration patterns.
  - **`update_user_profile` tool** (`toolHandlers.ts`): New tool that calls `POST /v1/user/context` to persist `userContext` (actionable framing instructions for the user) and `accountContext` (company-level context shared across all users on the account). Max 2000 chars per field. Fails gracefully for trial users (returns `SKIPPED` status with upgrade guidance).
  - **Session start context loading** (`toolHandlers.ts`, `systemPrompt.ts`): `AccountProfile` interface extended with `userContext` and `accountContext` fields. When `/v1/graphs` returns stored context, it's injected into the system prompt as a `USER RESEARCH PROFILE` block so Claude uses it for all subsequent framing.
  - **Profile solicitation nudge** (`toolHandlers.ts`, `systemPrompt.ts`): When a non-trial user has no stored `userContext`, two nudges are injected: (1) a system prompt `PROFILE SOLICITATION` block instructing Claude to capture profile data naturally through conversation, and (2) a `list_graphs` response-level nudge appended to the JSON payload. Both emphasize writing ACTIONABLE framing instructions, not just role labels.
  - **Session frustration detection** (`sessionTracker.ts`): New module that tracks search patterns within a single MCP connection and detects three structural frustration signals: repeated similar queries (3+ searches with >50% word overlap in same graph), NO_MATCH streaks (2+ consecutive zero-result searches), and graph bouncing (same query across 3+ different graphs). Hints are injected into `search_graph` response text for Claude to act on — the user never sees them directly.
  - **Two-layer architecture**: Layer 1 (MCP) detects structural frustration from tool call patterns and injects strategy hints. Layer 2 (Claude) detects conversational frustration from user messages and calls `update_user_profile` to refine stored preferences reactively.
  - Version bumped to 1.24.0.

### Changed
- **Proactive Graph Coaching** (`systemPrompt.ts`): Added `PROACTIVE GRAPH COACHING` rule to the system prompt. After the first substantive response, the LLM now tells the user which graphs contributed results and what each graph is designed for (e.g., "The CE Design Graph tracks design-stage ideas and concept work"). If results are dominated by one graph type, it sets expectations about what that graph *does and doesn't* cover. After 2+ queries in the same domain, it suggests narrowing graph selection. Keeps coaching to 1-2 sentences — helpful, not lecturing. Addresses user feedback about needing clearer context on what each graph's coverage model is.

### Added
- **Embedded Rendering Instructions** (Fix: Claude.ai template gap): Claude.ai's MCP client does not surface the server-level `instructions` field, making all rendering specs in `systemPrompt.ts` invisible. This fix embeds critical rendering rules directly into tool descriptions and tool response payloads, ensuring reliable cross-client behavior.
  - **Tool description rendering rules** (`toolHandlers.ts`): `search_graph`, `brand_tracker`, and `get_evidence` tool descriptions now include inline `RENDERING RULES` / `LINK RULE` directives. These are always visible to any LLM client regardless of `instructions` field support.
  - **`_render_instructions` response object** (`toolHandlers.ts`): `search_graph` and `brand_tracker` responses now include a top-level `_render_instructions` object with ≤6 imperative rules covering attribution, citation linking, suggested prompts, widget handling, and editorial tone.
  - **`buildRenderInstructions()` helper** (`toolHandlers.ts`): New function that dynamically assembles context-aware rendering rules based on whether the response contains widgets, evidence, or suggested prompts.
  - **Widget HTML prefix** (`toolHandlers.ts`): All widget HTML content blocks are now prefixed with an explicit instruction: "If your client supports HTML visualization (show_widget, visualize:show_widget, or artifacts), pass this HTML verbatim. Do not rewrite or restyle."
  - **`_source_links` infrastructure** (`toolHandlers.ts`): `collectGraphWebpageUrls()` function ready to populate graph-level links from catalog once the API surfaces `webpage_url` from Airtable. No hardcoded URLs — activates automatically.
  - **`systemPrompt.ts` preserved**: Server-level instructions kept as-is for MCP clients that do honor the `instructions` field.

### Added
- **UX Lifecycle Improvements** (UX Audit): Comprehensive improvements to trial onboarding, credit management, and user lifecycle flows.
  - **`id` query parameter support** (`index.ts`): The MCP URL now reads the `id` query parameter. Email-shaped IDs (e.g., `id=user@company.com`) are automatically used as `userId` for tracking and seamless signup. Non-email IDs (e.g., `id=linkedin_buddy`) are passed as `entryId` for source attribution.
  - **Trial welcome block** (`systemPrompt.ts`): Trial users (`sk_trial_` keys) now receive a welcome message on first interaction: "You're connected to Fodda — expert trend intelligence, sourced and structured, across retail, beauty, fashion, sports, and more." Follows Fodda tone of voice guidelines.
  - **Capabilities orientation** (`systemPrompt.ts`): Added `WHAT FODDA CAN DO` block listing 5 core capabilities. Claude surfaces these when users ask "what can you do?" or seem unsure. Kept natural — never recited unprompted.
  - **Graph volume guidance** (`systemPrompt.ts`): Added `GRAPH VOLUME GUIDANCE` block. When results seem overwhelming, Claude proactively suggests narrowing by topic (retail, beauty) or graph type (expert vs. curated).
  - **Settings access guidance** (`systemPrompt.ts`): Added `SETTINGS AND ACCESS` block. Trial users pointed to sign up for Base; Base users pointed to `app.fodda.ai` (email login, no password).
  - **Offboarding guidance** (`systemPrompt.ts`): Added `OFFBOARDING` block. Claude now handles "how do I cancel?" gracefully — points to `app.fodda.ai`, asks for feedback.
  - **Feedback collection** (`systemPrompt.ts`): Added `FEEDBACK` block instructing Claude to call `send_feedback` whenever users share complaints, suggestions, feature requests, or exit reasons.
  - **`send_feedback` tool** (`toolHandlers.ts`): New tool that forwards user feedback to `piers@fodda.ai` via Resend email. Includes user email, entry source, API key prefix, and feedback category. Falls back to console logging if `RESEND_API_KEY` is not set.
  - **Extended credit warnings** (`toolHandlers.ts`): `_credit_warning` now fires for ALL plan types. Trial: warns at < 10 tokens (was < 3). Base: warns at < 15 tokens (was: never).
  - **Improved Base user exhaustion** (`errorHandling.ts`): Replaced cold generic "Query limit reached" with warm, actionable message: "You've used all your tokens for this month. Two options: add a 100-token top-up at app.fodda.ai, or wait for your balance to reset next month."
  - **Post-upgrade reconnection instructions** (`systemPrompt.ts`): After trial→Base conversion, Claude now tells users to update their MCP connection URL with their new API key.
  - **Support contact** (`systemPrompt.ts`): Added `piers@fodda.ai` as the support email in HELPFUL LINKS.
  - **`get_my_account` tool** (`toolHandlers.ts`): New read-only tool that surfaces live account status in-conversation — plan, token balance, reset date, enabled/disabled graphs, and profile. Uses the enriched `_account` object from `/v1/graphs` (implemented by API agent). Returns deep links to `app.fodda.ai/account`, `app.fodda.ai/account#top-up`, and `app.fodda.ai/graphs`.
  - **Deep links** (`systemPrompt.ts`): Updated HELPFUL LINKS with confirmed App routes: `/account`, `/account#top-up`, `/graphs`, `/connections/claude`, and `fodda.ai/pricing`.
  - **Resend API key** (`deploy_cloud_run.sh`): Added `RESEND_API_KEY` to Cloud Run env vars — `send_feedback` tool now sends real emails.

### Added
- **Skills Integration Engine** (Phase 3): New `src/skillClient.ts` module enables external MCP-based "Skills" (e.g., Paralogy, Igloo) to post-process Fodda search results. Skills are external MCP servers that adapt/reframe output — called automatically after research, before the final response.
  - **`skillClient.ts`**: MCP client wrapper with fail-open semantics, 10s timeouts, parallel execution of multiple skills, and structured input contract (`SkillInput`). Uses `@modelcontextprotocol/sdk` client classes (`Client` + `StreamableHTTPClientTransport`).
  - **`catalogCache.ts`**: Added `getSkillGraphs()` and `getEnabledSkillConfigs()` functions. `CatalogGraph` interface extended with `mcp_url`, `skill_phase`, and `skill_tool_name` fields for skill-type graphs.
  - **`toolHandlers.ts`**: Session init now captures `disabled_graphs` from `/v1/graphs` response and resolves enabled skill configs (dual strategy: reads from `/v1/graphs` response directly, falls back to catalogCache). `search_graph` tool has a new `skip_skills` parameter — when `true`, suppresses skill execution for that single query.
  - **`systemPrompt.ts`**: `buildSystemPrompt()` now accepts `enabledSkills` parameter. When skills are active, injects `ACTIVE SKILLS` block into the system prompt instructing the LLM how to integrate skill outputs, attribute them by name, and handle user requests to skip or disable skills.
  - **Post-processing hook**: After search results are enriched but before widget rendering, all enabled output-phase skills are called in parallel. Skill outputs are appended as `── SKILL: [name] ──` content blocks to the MCP response. Applied to both the widget and fallback response paths.
  - **UX design**: Skills are auto-applied by default. Users can say "without skills" or "skip Paralogy" for per-query suppression, or toggle them off permanently in the My Graphs dashboard.

### Added
- **`delta/the-connection-index` Graph Support** (Brief: Note For MCP Agent — The Connection Index): Integrated Delta's The Connection Index expert graph into the MCP server. Domain: Air Travel / Modern Connection. Focus: the role of travel in rediscovering real-world experiences and community belonging.
  - `GRAPH_ID_DESC` in `index.ts` and `GRAPH_ID_DESCRIPTION` in `tools.ts` — added `'delta/the-connection-index'` to example graph lists.
  - **Graph attribution rule** — added `graphId "delta/the-connection-index" → "Delta's The Connection Index"` to fallback naming block.
  - **Expert graph routing** — added fallback routing for "Air travel trends", "Travel and connection", "Digital vs. real-world experiences", "Sensation over simulation", "Travel's impact on well-being and clarity".
  - **`search_graph` graphId description** — added `'delta/the-connection-index'` to the inline example list.
  - **Dynamic catalog** already handles this graph automatically — `catalogCache.ts` will pick up the graph from `/v1/graphs/catalog` once status changes to `live`, generating dynamic naming, routing, and supplemental pairing (travel domain → World Bank + WTO primary, BEA + Wikipedia secondary).
  - **Current status:** `coming_soon` (Neo4j sync pending). No queries will route to this graph until status is `live`.

### Added
- **`get_openalex_research_trends` tool** (Brief: OpenAlex Academic Research): Added 21st supplemental data tool — OpenAlex academic research trends covering 250M+ scholarly works across ALL academic domains (retail, marketing, culture, sports, technology, AI — everything PubMed does NOT cover). Endpoint: `GET /v1/supplemental/openalex/research-trends`.
  - **Parameters**: `term` (required — search query), `years` (optional, default 10, max 20), `top_papers` (optional, default 5, max 10).
  - **Returns**: `total_works`, `publication_trend` (year-by-year counts), `trend_direction` (accelerating/growing/stable/declining), `top_cited_papers` (with citation counts, topics, DOI), `dominant_topics` (4-level hierarchy: domain → field → subfield → topic).
  - **Anonymized title**: `"Query Academic Research Data"` (Claude UI shows this instead of "OpenAlex Research Trends").
  - **PubMed vs OpenAlex routing logic** added to system prompt: biomedical → PubMed, everything else → OpenAlex, cross-domain → both.
  - **Supplemental pairing updated** (`catalogCache.ts`): OpenAlex added as secondary tool for Retail, Consumer Culture, Technology, Design, and related domains.
  - **`list_graphs` description** updated: supplemental source count 20 → 21, "OpenAlex" added to source list.
  - Tool definition in `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS), handler in `index.ts`.

- **`green-house/thrive-report` Graph Support**: Integrated The Craft Graph (Thrive Report) into the fallback logic and tool parameter descriptions. Ensured specific routing context for "On-premise beverage marketing", "Craft spirits, mixers, or modern bar culture", "AI personalization or multi-sensory experiences in hospitality", and "Beverage formats like micro-serves or alternative RTDs".

### Added
- **`pwc/sxsw-2026-key-insights` Graph Support**: Integrated PwC's SXSW 2026 Key Insights expert graph into the fallback logic and tool parameter descriptions. Ensured specific routing context for "Technology trends", "AI integration and workforce adaptation", and "Brand authenticity in the algorithmic age".

### Added
- **Dynamic Graph Catalog Cache** (`src/catalogCache.ts`): New module that fetches `GET /v1/graphs/catalog` (public, no auth) at server startup and caches the full graph registry in memory with hourly background refresh. The catalog endpoint is the same one used by the Fodda website and app — already cached with 1h TTL on the API side.
- **Dynamic System Prompt Generation**: The MCP server's `instructions` string now dynamically builds 6 graph-specific blocks from the cached catalog instead of hardcoded text:
  - **GRAPH NAMING** — curator-attributed display names for every graph (e.g. `graphId "retail" → "PSFK's Retail Graph"`)
  - **GRAPH TYPES** — curated, expert, baseline, and community graph type descriptions
  - **EXPERT GRAPH ROUTING** — domain→graphId routing rules inferred from each graph's `domain` and `topics` fields
  - **SUPPLEMENTAL PAIRING STRATEGY** — per-graph tool pairings (primary/secondary) inferred from graph domain keywords
  - **EXPERT GRAPH WORKFLOW** — dynamically lists all expert graph IDs
  - **CURATED-ONLY TOOLS** — dynamically lists which graphs support `search_statistics` and `search_insights`
- **Graceful Fallback**: If the catalog fetch fails at startup, the server starts with a minimal hardcoded fallback (6 core graphs + generic instructions). The LLM is told to use `list_graphs` for discovery.

### Changed
- **Trend Validation Instruction**: Updated the MCP system prompt (`systemPrompt.ts`) to prevent the LLM from using internal database metrics (e.g. evidence counts, number of trends, signal scores) as proof that a trend exists or is growing. Fodda's data is curated by human experts, so presence in the database is the proof of existence. The LLM is now instructed to use signal score simply as a relative measure within the graph, and to rely on supplemental market data (e.g., Google Trends, BEA) to demonstrate real-world momentum.
- **`GRAPH_ID_DESC`** (`src/index.ts`) and **`GRAPH_ID_DESCRIPTION`** (`src/tools.ts`): Removed hardcoded graph ID lists. Both now say "Call list_graphs first to see all available graphs and their IDs."
- **`PSFK_DOMAIN_GRAPHS`** set (used for theme coloring): Now populated dynamically from `getDomainGraphIds()` with a hardcoded fallback if catalog is unavailable.
- **Server startup**: `app.listen()` now waits for `initCatalogCache()` to complete before accepting connections, ensuring the first MCP session gets the dynamic prompt. Startup proceeds even if the catalog fetch fails.
- **~100 lines of hardcoded graph data removed** from the system prompt: graph naming entries, expert routing rules, supplemental pairing strategy, and expert workflow lists are no longer maintained manually. New graphs added to Airtable will appear in the MCP automatically — no code deployment needed.
- **Supplemental access gating moved to API** (Brief: MCP API Access Gating): Removed all hardcoded "Retail → these tools, Beauty → those tools" routing logic from the system prompt. The API now returns 403 (`FORBIDDEN` or `GRAPH_DISABLED`) for sources the user's plan doesn't cover. The MCP calls any relevant tool and lets the API decide access.
- **Supplemental pairing reframed as relevance hints**: The system prompt now provides soft "relevance hints" per domain (e.g., "Retail: Census, BEA, FRED are most useful") instead of hard routing rules. Universal tools (Google Trends, Amazon, OECD, OpenStreetMap) are explicitly flagged as always-relevant.
- **403 error handling** (`handleAccessError`): All 21 supplemental tool catch blocks now use differentiated 403 handling:
  - `FORBIDDEN` → silent skip (returns empty data, not an error — LLM moves on)
  - `GRAPH_DISABLED` → mentions the source is disabled in user settings
  - `CREDITS_EXHAUSTED` → shows credits message
- **Interpretation evidence type guidance**: Added `EVIDENCE TYPES` block to system prompt for `search_insights`. The PSFK pipeline fix (Brief: MCP API Access Gating §4) corrected the evidence materialization — `interpretation` type results (from Opinion/Analysis articles) will now appear for the first time. LLM is instructed to frame these as analytical perspective ("Analysis from [source] suggests..."), not raw fact.

### Added
- **6 New Supplemental Data Tools** (Brief: Supplemental Data Sources MCP Agent): Implemented 6 new MCP tools wrapping live API endpoints for real-time supplemental data queries. Total supplemental tools: 19.
  - **`get_pew_survey_data`**: Pew Research Center NPORS 2025 survey data — social media usage, technology adoption, news consumption, trust, and AI attitudes segmented by demographics (age, income, education, race, sex, party). Endpoint: `GET /v1/supplemental/pew/survey-data`.
  - **`get_openfoodfacts_snapshot`**: Open Food Facts crowdsourced product database — ingredient composition, additive prevalence, NOVA ultra-processing levels, brand distribution. Endpoint: `GET /v1/supplemental/openfoodfacts`.
  - **`get_ridb_recreation_snapshot`**: Recreation.gov RIDB — US federal recreation facilities, trails, campgrounds, parks with GPS coordinates and activity types. US only (NPS, USFS, BLM, Army Corps). Endpoint: `GET /v1/supplemental/ridb`.
  - **`get_osm_commerce_snapshot`**: OpenStreetMap commerce infrastructure — global retail/commercial location data across 35+ categories and 180+ countries via Overpass API. Endpoint: `GET /v1/supplemental/osm`.
  - **`get_google_trends_snapshot`**: Google Trends demand signals — relative search interest over time, trend direction, regional breakdowns, related queries. Values are relative (0–100), not absolute. Endpoint: `GET /v1/supplemental/google-trends`.
  - **`get_amazon_products_snapshot`**: Amazon product & pricing reality — real-time listings, pricing tiers, brand distribution. Snapshot of current listings, not full market coverage. All references say "Amazon" only (never mention underlying data provider). Endpoint: `GET /v1/supplemental/amazon`.
  - **Tool definitions** added to `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS).
  - **Tool handlers** added to `index.ts` — 6 new `server.tool()` registrations following existing supplemental tool pattern.
  - **Server instructions updated**: supplemental source count 13 → 19 in `list_graphs` description; new source categories added to supplemental data sources instruction block; TOOLS NOT UNIVERSALLY PAIRED section expanded with pairing guidance for all 6 new tools.
  - Version bumped to 1.19.0.

### Added
- **13 New Expert Graphs** (Brief: MCP_INTEGRATION_BRIEF.md): Integrated 13 new domain-specific expert knowledge graphs into the MCP server. All are `status: "live"`, use `gemini-embedding-001 (768d)` embeddings, and follow the standard `EVIDENCE_FOR` relationship pattern. No code changes needed for `list_graphs` (dynamic from API) or response parsing (same shape as existing graphs).
  - **Graphs**: `ezra-eeman-wayfinder` (Future of Work), `juan-isaza-trends` (Consumer Culture), `automotive-color-trends` (BASF Automotive Color), `braze-2026-trends` (Customer Engagement), `common-ground-trail-trends` (Trail Culture), `dhl-ecommerce-trends-2026` (Logistics/E-Commerce), `firefish-treat-culture` (Treat Culture), `florian-schleicher-friction-unloaded` (Friction Design), `havas-media-trends` (Media/Advertising), `joanna-haugen-travel-trends` (Sustainable Travel), `marieke-neleman-trends` (Design/Lifestyle), `publicis-sapient-next-graph` (Enterprise Tech), `alyson-stevens-macro` (Macro Culture/TBWA).
  - **`GRAPH_ID_DESCRIPTION`** in `tools.ts` and **`GRAPH_ID_DESC`** in `index.ts` — added all 13 expert graph slugs as examples alongside existing curated and community graphs.
  - **Graph attribution rules** — added 13 new entries to the `GRAPH NAMING` block in server instructions (e.g., `graphId "ezra-eeman-wayfinder" → "Ezra Eeman's Wayfinder Graph"`).
  - **`GRAPH TYPES` expanded** — added "EXPERT GRAPHS" as a third category alongside Curated and Community, describing expert graphs as domain-specific knowledge graphs built from expert reports.
  - **`EXPERT GRAPH ROUTING`** — added 13 domain-to-graph routing hints in the server instructions (e.g., `Work / HR / Organization → ezra-eeman-wayfinder`).
  - **Expert Graph supplemental pairing strategy** — added pairing guidance for all 13 expert graphs (e.g., `dhl-ecommerce-trends-2026: get_census_retail_snapshot + get_wto_trade_snapshot`).
  - **`search_graph` GRAPH SELECTION GUIDE** — expanded with all 13 expert graph slugs and their domain keywords.
  - **`search_statistics`** and **`search_insights`** `graph_id` parameter descriptions — added expert graph slug examples.
  - Version bumped to 1.18.0.

### Added
- **MLB Sponsorship graph support** (Brief: Note For MCP Agent — MLB Sponsorship Graph): Added `mlb-sponsorship` (Comunicano MLB Sponsorship & Technology Graph, curated by Andy Abramson) across all MCP server touchpoints:
  - `GRAPH_ID_DESC` in `index.ts` and `GRAPH_ID_DESCRIPTION` in `tools.ts` — added `'mlb-sponsorship'` to the example graph list.
  - **Graph attribution rule** — added `graphId "mlb-sponsorship" → "Andy Abramson's Comunicano MLB Sponsorship & Technology Graph"` to the server instructions naming block.
  - **Supplemental pairing strategy** — added MLB-specific tool guidance: Wikipedia (primary, for team/league/brand attention), BEA (primary, recreation spending), Census Demographics (secondary, metro fan base), FRED (secondary, consumer sentiment).
  - **`search_graph` description** in `tools.ts` — added `mlb-sponsorship (MLB technology and sponsorship)` to the coverage list.
  - No changes to `list_graphs` (dynamic from API), Axios patterns, auth, error handling, or supplemental tools.
- **`get_wto_trade_snapshot` tool** (Brief: WTO International Trade Data — MCP Agent): Added 13th supplemental data source — World Trade Organization international trade data. New MCP tool wraps `GET /v1/supplemental/wto/trade-snapshot` endpoint, providing merchandise trade volumes, services trade, and tariff rates across 160+ economies.
  - **Parameters**: `countries` (group key: `major`, `g7`, `brics`, `eu_big4`, `asia_pac`, `english`, `nordic`, or custom WTO codes), `categories` (`merchandise`, `services`, `tariffs`), `years` (1-10, default 5).
  - **Tool handler** added to `index.ts` with storytelling directives for trade dependency framing and tariff rate comparisons.
  - **Tool definition** added to `tools.ts` (ALL_TOOLS + DEFAULT_ENTERPRISE_TOOLS + TOOL_VERSIONS).
  - **Server instructions updated**: supplemental source count 12 → 13 in `list_graphs` descriptions; WTO added to STEP 3 macro validation; WTO added to supplemental pairing strategy for Retail, Beauty, Sports, CE Design graphs; WTO added to TOOLS NOT UNIVERSALLY PAIRED list.
  - Version bumped to 1.17.0.

### Changed
- **Graph Naming rule** (Brief: MCP Graph Naming and Response Structure): Replaced the `ATTRIBUTION` instruction block with a `GRAPH NAMING` rule. The MCP agent now attributes results to the named expert who curated the graph (e.g., "PSFK's Retail Graph identifies…") instead of saying "the Fodda graph." Fodda is the platform; experts are the authority. Mapping: `psfk` → "PSFK's expert graph", `sic` → "Ben Dietz's SIC graph", `pew` → "Pew Research data", and vertical graphs (`retail`, `beauty`, `sports`) → "PSFK's [Vertical] vertical."
- **Response Structure rule** (Brief: MCP Graph Naming and Response Structure): Added a `RESPONSE STRUCTURE` instruction that makes graph trends the structural spine of every response. Web-sourced data (BCG, Bain, etc.) must be clearly subordinate and labeled: "Outside Fodda's expert coverage, [source] reports that…" Includes a good/bad example to guide the agent.
- **Source Attribution wording**: Updated `SOURCE ATTRIBUTION` instruction to use expert-level naming ("PSFK's Retail Graph identifies…" instead of "According to Fodda's PSFK retail intelligence graph…") and changed web-source label from "Outside of Fodda's coverage, web sources indicate…" to "Outside Fodda's expert coverage, [source] reports that…"
- **Graph Mismatch Handling** (Brief: MCP Graph Mismatch Handling): Confirmed the `CROSS-GRAPH NODE HANDLING` instruction and `_use_this_graphId` / `GRAPH_MISMATCH` error guidance in `get_evidence`, `get_neighbors`, and `get_node` tool descriptions were already implemented in a prior session. No additional code changes needed.
- **Evidence Citation Rule** (Brief: MCP Evidence Citations): Replaced the generic `CITATIONS & LINKS` instruction with a comprehensive `EVIDENCE CITATION RULE`. The agent now: (1) always calls `get_evidence` to retrieve supporting articles, (2) uses the new `evidenceType` field to frame evidence differently — signals as case studies, metrics as data points, quotes as expert voices with attribution, interpretations as analysis, (3) always includes `sourceUrl` links inline, and (4) uses the `publication` field for source attribution. Includes a worked example demonstrating the format.

### Fixed
- **Tool call ordering** (Brief: MCP Fix Tool Call Ordering): Rewrote the `STATISTICS SEARCH` instruction — `search_statistics` is now explicitly called AFTER `search_graph`, not before. The prior wording ("call search_statistics BEFORE searching trends") caused Claude to call supplemental/stats tools first and graph search second, inverting the intended order. New instruction enforces: 1) `search_graph` → 2) `search_statistics` → 3) supplemental tools → 4) web search.
- **`get_evidence` parameter naming** (Brief: MCP Fix Tool Call Ordering): Updated `for_node_id` description to explicitly say "NOT trend_id" — Claude was occasionally passing `trend_id` instead, which caused tool-not-found errors. Added a reminder in `RESPONSE STRUCTURE` instructions as well.
- **Eliminated web search leakage**: Removed all instructions that encouraged Claude to do web searches. The prior instructions had "ADD COLOR with web-sourced context" as step 4 of every response and "Web search → only if needed" in the tool workflow — Claude followed these literally, leading with McKinsey/BCG/Sourcing Journal web results before graph data. Now: (1) `NO WEB SEARCH` rule explicitly bans web search unless the user asks for it, (2) response structure is 3 steps only (graph → stats → supplemental), (3) `SUPPLEMENTAL DATA RULE` tightened from "ALWAYS check all tools" to "pick ONE OR TWO most relevant," (4) `SOURCE ATTRIBUTION` no longer normalizes web-sourced data.
- Version bumped to 1.14.0.

---

## [1.16.0] - 2026-03-28

### Added
- **Supplemental Pairing Strategy** (Brief: MCP Graph Supplemental Pairing Strategy): Added `SUPPLEMENTAL PAIRING STRATEGY` block to the MCP server's `instructions` field. This provides AI agents with a graph-to-supplemental-tool mapping so they know which institutional data sources to call for each knowledge graph. Prior to this, tool descriptions were biased toward retail/beauty, leaving CE Design, Fashion, Sports, SIC, and Pew queries without appropriate supplemental context.
  - **Retail**: Census retail + BEA spending + FRED (primary); BLS + Census demographics + Wikipedia (secondary)
  - **Beauty**: FDA ingredient safety + PubMed + Clinical Trials (primary); BEA + Wikipedia (secondary)
  - **Sports**: Wikipedia + BEA + Pew graph (primary); FRED + Census demographics (secondary)
  - **Fashion**: BEA + BLS + Census retail (primary); Wikipedia + World Bank (secondary)
  - **CE Design**: Wikipedia + PubMed + World Bank (primary); BEA + Pew graph (secondary)
  - **SIC**: Pew graph + Wikipedia (primary); Census demographics + BEA (secondary)
  - **Pew**: Census demographics (primary); FRED (secondary)
- **Tools exclusion list**: Explicitly documents which tools are NOT universally paired (FDA, Clinical Trials, CDC → beauty only; FDA Recalls → on-demand only).
- Version bumped to 1.16.0.

---

## [1.15.0] - 2026-03-27

### Added
- **`search_insights` tool**: New MCP tool that searches for expert quotes, analyst interpretations, statistics, and qualitative evidence across Fodda's knowledge graphs. Calls the same `/v1/graphs/:graph_id/statistics` endpoint as `search_statistics` but defaults to `types=metric,quote,interpretation` for broader evidence retrieval. Supports `types`, `limit`, and `min_score` parameters.
- **Quality gate instructions**: Added `EXPERT VOICES & INSIGHTS` block to MCP server instructions with three quality gates: (1) Trend Strength Gate — only call `search_insights` when `evidence_count >= 3`, (2) QA Spot Check — evaluate each result for relevance, credibility, and substance before presenting, (3) Graceful Degradation — silently skip when no strong results are found.
- **Updated research workflow**: Added Step 2.5 (conditional) between evidence gathering and statistics: if a trend has `evidence_count >= 3`, call `search_insights` to find expert quotes and analysis. SIC graph note: `search_insights` may be more important than `get_supporting_evidence` for SIC queries.
- Version bumped to 1.15.0.

---

## [1.12.0] - 2026-03-24

### Changed
- **Anonymized supplemental data tool titles**: All 12 supplemental data tool `annotations.title` values now use generic, domain-descriptive labels instead of revealing specific data source names. For example, `get_pubmed_research_trends` now displays as "Query Medical Research Data" instead of "PubMed Research Trends" in Claude's UI. This prevents oversharing methodology while still attributing specific sources (PubMed, FDA, Census, etc.) in the actual results.
- **Added annotations to `server.tool()` calls**: All 20 tool registrations in `index.ts` now pass `ToolAnnotations` using the SDK's 5-argument overload (`name, description, paramsSchema, annotations, callback`), ensuring Claude displays the proper `title` field instead of auto-formatting the snake_case tool name with broken capitalization.
- Version bumped to 1.12.0.

### Tool Title Mapping
| Tool | Old Title | New Title |
|------|-----------|----------|
| `get_census_retail_snapshot` | Census Retail Sales Snapshot | Query Retail Market Data |
| `get_census_demographics_snapshot` | Census Demographics Snapshot | Query Demographics Data |
| `get_fred_economic_snapshot` | FRED Economic Snapshot | Query Economic Indicators |
| `get_wikipedia_pageviews` | Wikipedia Pageviews | Query Cultural Attention Data |
| `get_worldbank_global_snapshot` | World Bank Global Snapshot | Query Global Economic Data |
| `get_fda_ingredient_safety` | FDA Ingredient Safety | Query Ingredient Safety Data |
| `get_fda_recalls` | FDA Recalls | Query Product Recall Data |
| `get_clinical_trials` | Clinical Trials Search | Query Clinical Research Data |
| `get_bls_economic_snapshot` | BLS Economic Snapshot | Query Labor Market Data |
| `get_bea_spending_snapshot` | BEA Spending Snapshot | Query Consumer Spending Data |
| `get_cdc_health_data` | CDC Health Data | Query Public Health Data |
| `get_pubmed_research_trends` | PubMed Research Trends | Query Medical Research Data |

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

[Unreleased]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.12.0...HEAD
[1.12.0]: https://github.com/piers-fawkes/fodda-mcp/compare/v1.8.0...v1.12.0
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
