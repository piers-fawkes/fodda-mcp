/**
 * Tool Handlers — MCP server factory with all tool registrations.
 *
 * Extracted from index.ts to reduce monolith size.
 * Contains createServer() which registers all 30+ MCP tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListResourcesRequestSchema, ListPromptsRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { recordToolOutcome, recordFeedbackEntry } from './telemetry.js';
import { FODDA_RESOURCE_TEMPLATES, readFoddaResource, listFoddaSampleResources } from './resources.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import crypto from 'crypto';
import { buildDynamicPromptSections, getDomainGraphIds, getGraphs, getLiveGraphs, buildDisplayName, getRelevantGraphs, getRelevantSources, getEnabledSkillConfigs, getSkillGraphs, getAnalysts } from './catalogCache.js';
import type { CatalogGraph, SourceCandidate } from './catalogCache.js';
import { renderBrandWidget } from './brandTemplate.js';
import { renderSearchWidget } from './searchTemplate.js';
import { FODDA_COMPONENT_GUIDE, getShellTemplate } from './widgetShell.js';
import { MCP_SERVER_VERSION } from './tools.js';
import { buildSystemPrompt, BRAND_INTELLIGENCE_RENDERING_SPEC, FODDA_WIDGET_DESIGN_BRIEF } from './systemPrompt.js';
import type { AccountProfile } from './systemPrompt.js';
import { computeLifecycle, computeMomentum, isFastMover, enrichEvidence, GRAPH_BADGES, getFoddaTheme, getSupplementalTheme } from './enrichment.js';
import { handleAccessError, handleTrialCreditExhaustion, classifyAccessError } from './errorHandling.js';
import { chargeQuery, getToolCostSummary, type ChargeQueryParams } from './pricingCache.js';
import { callOutputSkills, buildSkillInput, discoverSkillTools, executeSkillTool, mapSkillError } from './skillClient.js';
import type { SkillConfig, SkillResult, DiscoveredSkill } from './skillClient.js';
import { createSessionTracker, postToSlack } from './sessionTracker.js';
import { buildResearcherInstruction } from './agents/fodda-researcher/index.js';
import type { GraphContext } from './agents/fodda-researcher/index.js';
import { buildEvidencePack, QuotaExhaustedError } from './linkedinEngine.js';
import { runDeepResearch, cleanResearchQuery, fallbackSubThemes, extractRoutingTopic } from './deepResearch.js';
import { addCoverageAnnotation } from './coverageRelevance.js';

// ---------------------------------------------------------------------------
// Render instructions — embedded in tool responses for LLM clients that
// don't receive MCP server-level `instructions` (e.g. Claude.ai).
// ---------------------------------------------------------------------------
const RENDER_SPEC_VERSION = '1.1';

export function resolveAnalystAlias(analystIdInput: string, companyInput?: string): { analyst_id: string; company?: string | undefined } {
    if (!analystIdInput) return { analyst_id: analystIdInput, company: companyInput };

    const rawId = analystIdInput.trim();
    const existingCompany = companyInput?.trim();

    const formatCompany = (str: string): string => {
        const s = str.trim();
        if (!s) return s;
        if (s === s.toLowerCase()) {
            return s.replace(/\b\w/g, char => char.toUpperCase());
        }
        return s;
    };

    const roleRules: Array<{ roleId: string; pattern: RegExp }> = [
        { roleId: 'brand-cmo', pattern: /\b(brand[-_ ]?cmo|synthetic[-_ ]?cmo|chief[-_ ]marketing[-_ ]officer|vp[-_ ]of[-_ ]marketing|head[-_ ]of[-_ ]marketing|cmo)\b/i },
        { roleId: 'brand-ceo', pattern: /\b(brand[-_ ]?ceo|synthetic[-_ ]?ceo|chief[-_ ]executive[-_ ]officer|ceo)\b/i },
        { roleId: 'brand-cfo', pattern: /\b(brand[-_ ]?cfo|synthetic[-_ ]?cfo|chief[-_ ]financial[-_ ]officer|cfo)\b/i },
        { roleId: 'brand-cro', pattern: /\b(brand[-_ ]?cro|synthetic[-_ ]?cro|chief[-_ ]revenue[-_ ]officer|cro)\b/i },
        { roleId: 'brand-cto', pattern: /\b(brand[-_ ]?cto|synthetic[-_ ]?cto|chief[-_ ]technology[-_ ]officer|cto)\b/i },
        { roleId: 'brand-coo', pattern: /\b(brand[-_ ]?coo|synthetic[-_ ]?coo|chief[-_ ]operating[-_ ]officer|coo)\b/i }
    ];

    for (const rule of roleRules) {
        if (rule.pattern.test(rawId)) {
            let extractedCompany = existingCompany;
            if (!extractedCompany) {
                const companyPart = rawId
                    .replace(rule.pattern, '')
                    .replace(/\b(ask|consult|talk|to|query|get|synthetic|expert|analyst|the|brand)\b/gi, '')
                    .replace(/[-_]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (companyPart) {
                    extractedCompany = formatCompany(companyPart);
                }
            }
            return {
                analyst_id: rule.roleId,
                company: extractedCompany ? extractedCompany : undefined
            };
        }
    }

    return { analyst_id: rawId, company: existingCompany ? existingCompany : undefined };
}

function buildRenderInstructions(opts: {
    hasWidget: boolean;
    hasPrompts: boolean;
    hasEvidence: boolean;
    graphWebpageUrls?: Record<string, string>;
}): Record<string, any> {
    const rules: string[] = [
        'Attribute findings to their source graph by name using graphName. Never say "the Fodda graph." Fodda is the platform — the graphs are created by named experts.',
        'LEAD: Open with one sentence — the sharpest editorial claim the results support. Never open with methodology ("I searched...", "The graphs returned...") or result counts.',
        'ONE TREND, ONE PARAGRAPH: Each trend gets exactly one paragraph of at most 3 sentences (~60 words). Open the paragraph with the trend name in bold followed by its lifecycle stage in italics, e.g. **Human-centric luxury** *(building)*. Insert a blank line between trends — never run two trends into one paragraph.',
        'MAX 3 TRENDS by default, ranked by relevance, even when the payload contains more. Mention in the closing line that further trends are available on request. Exception: the user explicitly asked for an exhaustive list.',
        'CITATIONS — SHORT ANCHORS: Every claim still requires its source link. Prefer short_citation (e.g. "[via Jing Daily](url)") or short source labels ("via Jing Daily", "BoF-McKinsey survey"), never the full evidence headline. Place links at the end of a sentence or in a trailing parenthetical — never mid-clause. Maximum 2 links per trend paragraph; if a trend has more evidence, cite the strongest 2 and note more exists.',
        'CLOSE: One line. Then at most 2 drill-down suggestions from suggested_drill_down, each on its own line prefixed with "→". Do not append a drill-down after every trend.',
        'NO FILLER STRUCTURE: No section headers for responses of 3 trends or fewer. No bullet-lists of evidence items. No restating evidence counts, graph counts, or relevance scores in prose.',
        'DEPTH ON REQUEST: When the user asks about ONE specific trend, the density caps lift — expand to full evidence, longer paragraphs, and complete citations. The caps govern first-pass survey responses, not drill-downs.',
        'COVERAGE RECOVERY: coverage.status is machine-readable routing data — NEVER tell the user coverage is "thin", "low", or "empty". When status is thin or empty, silently run coverage.suggested_action (get_supplemental_context) in the SAME turn and blend what it returns into the answer. If that also returns nothing usable, present what exists plainly — "this is what we have on this right now" — and offer the coverage.escalation options (a Deep Dive report via deep_research_topic, or your own web/LLM research with non-Fodda findings clearly attributed). Never pad weak matches into a confident-looking answer.',
    ];
    if (opts.hasWidget) {
        rules.push('A separate content block starting with "── WIDGET HTML ──" may follow this JSON payload. It contains a pre-rendered Fodda visualization. If your client supports HTML rendering (show_widget, visualize:show_widget, artifacts), pass that HTML verbatim. Do not rewrite or restyle.');
    }

    const instructions: Record<string, any> = {
        _render_spec_version: RENDER_SPEC_VERSION,
        rules,
    };

    if (opts.graphWebpageUrls && Object.keys(opts.graphWebpageUrls).length > 0) {
        instructions._source_links = opts.graphWebpageUrls;
    }

    return instructions;
}

/**
 * Append a low-credit warning to the response data if API calls are running low.
 * Utilizes new dynamic Stripe links and upsell data provided by the Fodda API.
 *
 * Also surfaces upstream X-Usage-* header warnings (approaching-limit, overage-active)
 * injected by foddaRequest() as _upstream_usage.
 */
function appendUsageWarning(data: any, userEmail?: string) {
    // ── Upstream header-based warnings (X-Usage-Warning / X-Usage-Percent / X-Usage-Overage-Tokens) ──
    if (data?._upstream_usage) {
        const u = data._upstream_usage;
        if (u.warning === 'approaching-limit' && u.percent) {
            data._usage_status = `⚠️ You've used ${u.percent}% of your monthly API calls. Consider upgrading or adding a payment method to avoid interruption.`;
        } else if (u.warning === 'overage-active') {
            data._usage_status = u.overage_tokens
                ? `📊 You're in overage — ${u.overage_tokens} additional API call(s) used at $0.50/API call this billing cycle.`
                : `📊 Overage billing is active — additional queries are charged at $0.50/API call.`;
        }
    }

    if (!data?.usage) return;

    const remaining = data.usage.remaining ?? data.usage.credits_remaining;
    if (remaining === undefined || remaining < 0) return;

    const threshold = 15;
    if (remaining >= threshold) return;

    const noun = remaining === 1 ? 'API call' : 'API calls';
    const upsell = data.usage.upsell || data.upsell || (data._account?.upsell);
    const stripeLink = data.usage.stripeLink || (data._account?.stripe_link);
    const price = data.usage.monthlyPriceUSD || (data._account?.monthly_price_usd);

    // Build portal upgrade URL with pre-filled email
    const portalParams = new URLSearchParams({ action: 'upgrade' });
    if (userEmail && userEmail.includes('@')) portalParams.set('email', userEmail);
    const portalUrl = `${API_BASE_URL.replace('api.', 'app.')}/portal?${portalParams.toString()}`;

    {
        let msg = `\u26a0\ufe0f You have ${remaining} ${noun} remaining this month.`;
        if (upsell) {
            msg += ` You can get 100 more API calls for $${upsell.price || '50'} right now: ${upsell.link || portalUrl}`;
        } else if (stripeLink) {
            msg += ` You can top up your API calls here: ${stripeLink}`;
        } else {
            msg += ` You can add more at ${portalUrl}, or your balance resets next month.`;
        }
        data._credit_warning = msg;
    }
}

/** Collect graph webpage URLs from catalog for graphs present in results */
function collectGraphWebpageUrls(graphIds: string[]): Record<string, string> {
    const urls: Record<string, string> = {};
    const allGraphs = getGraphs();
    for (const gid of graphIds) {
        const g = allGraphs.find(cat => cat.graph_id === gid);
        // webpage_url will become available once the API surfaces it from Airtable
        if (g && g.webpage_url) {
            urls[gid] = g.webpage_url;
        }
    }
    return urls;
}

// ---------------------------------------------------------------------------
// Type for injected foddaRequest dependency
// Canonical definitions live in types.ts; re-exported here for backward compat.
// ---------------------------------------------------------------------------
export type { FoddaRequestFn, WaverunnerRequestFn } from './types.js';
import type { FoddaRequestFn, WaverunnerRequestFn } from './types.js';

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

const GRAPH_ID_DESC = "The graph ID. Use list_graphs to see all options. Examples: 'retail', 'tech', 'food', 'travel', 'beauty', 'sports', 'sic', 'pew', 'ce-design', 'ezra-eeman-wayfinder', 'dhl-ecommerce-trends-2026', 'automotive-color-trends', 'alyson-stevens-macro', 'generative-realities', 'pwc/sxsw-2026-key-insights', 'green-house/thrive-report', 'michaels-2026-creativity-trend-report', 'delta/the-connection-index'";

// ── P0 Security: Allowlist serializer for list_graphs ──
const GRAPH_LIST_ALLOWLIST: ReadonlySet<string> = new Set([
    'graph_id', 'name', 'one_liner', 'description', 'curator',
    'domain', 'graph_type', 'trend_count', 'evidence_count',
    'status', 'last_updated',
    'topics', 'verticals',
]);
const SNAKE_TO_CAMEL: Record<string, string> = {
    'graph_id': 'graphId', 'one_liner': 'oneLiner', 'graph_type': 'graphType',
    'trend_count': 'trendCount', 'evidence_count': 'evidenceCount',
    'last_updated': 'lastUpdated',
};
// Strip internal routing guidance that may be baked into a description — either
// injected by us below or already present in the API/Airtable description field.
function stripRoutingInstruction(text: string): string {
    return text.replace(/\n*\[ROUTING INSTRUCTION:[\s\S]*?\]\s*$/g, '').trimEnd();
}
function serializeGraphForList(g: any): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of GRAPH_LIST_ALLOWLIST) {
        let val = g[key] ?? g[SNAKE_TO_CAMEL[key] || key];
        if (val !== undefined && val !== null) {
            // Defensive: never surface internal routing text in the public description.
            if (key === 'description' && typeof val === 'string') {
                val = stripRoutingInstruction(val);
            }
            out[key] = val;
        }
    }
    return out;
}
const DEPRECATED_GRAPH_IDS: ReadonlySet<string> = new Set(['waldo', 'psfk']);

/**
 * Resolve the effective userId for API requests.
 * Priority: session userId (from MCP URL, typically an email) > tool-provided userId.
 * For authenticated users, the session email ALWAYS wins — the LLM-generated slug is ignored.
 * For trial/anonymous users (session userId is 'anonymous' or empty), the tool-provided
 * userId acts as a fingerprint for key-sharing detection.
 */
function resolveUserId(sessionUserId: string, toolProvidedUid?: string): string {
    // If session has a real identifier (email), always use it
    if (sessionUserId && sessionUserId !== 'anonymous') {
        return sessionUserId;
    }
    // For trial/anonymous: use tool-provided uid as fingerprint, fall back to 'anonymous'
    return toolProvidedUid || sessionUserId || 'anonymous';
}

// ---------------------------------------------------------------------------
// createServer — builds and returns a fully-configured MCP server
// ---------------------------------------------------------------------------

const activeResearchJobs = new Map<string, any>();
const activeSupplementalJobs = new Map<string, any>();

export async function createServer(
    apiKey: string,
    userId: string,
    foddaRequest: FoddaRequestFn,
    waverunnerRequest: WaverunnerRequestFn,
    storeWidget: (html: string) => string,
    getServiceUrl: () => string,
    entryId: string = '',
    // anonymous SPT session: token (settlement payer) + connect-time cap/prices (pre-run coverage)
    sptCtx?: { token: string; maxAmountCents: number | null; prices: Record<string, number> },
    allowedTools?: Set<string> | string[],
): Promise<McpServer> {
    // ── SPT settlement helpers (inert for credit/API-key sessions: sptCtx is undefined) ──
    // Pre-run guard: refuse a task BEFORE spending compute if this payment token can't cover it.
    // Returns an error result to return immediately, or null to proceed.
    const sptGuard = (queryTypeCode: string): { isError: true; content: { type: 'text'; text: string }[] } | null => {
        if (!sptCtx) return null;
        const priceUsd = sptCtx.prices[queryTypeCode];
        if (priceUsd != null && sptCtx.maxAmountCents != null && priceUsd * 100 > sptCtx.maxAmountCents) {
            return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'SPT_INSUFFICIENT', required_usd: priceUsd, message: `This task costs $${priceUsd.toFixed(2)}, above this payment token's limit.` }) }] };
        }
        return null;
    };
    // Settlement-as-gate: SPT sessions await the charge and WITHHOLD the result if it fails;
    // credit sessions fire-and-forget (a missed meter only under-bills, never blocks delivery).
    // Returns an error result to return instead of the payload, or null when it's safe to deliver.
    const settleOrWithhold = async (params: Omit<ChargeQueryParams, 'foddaRequest' | 'spt'>, label: string): Promise<{ isError: true; content: { type: 'text'; text: string }[] } | null> => {
        if (sptCtx) {
            const r = await chargeQuery({ ...params, foddaRequest, spt: sptCtx.token });
            if (!r.charged) {
                return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'SPT_SETTLEMENT_FAILED', message: r.error || 'Payment could not be completed; result withheld.' }) }] };
            }
            return null;
        }
        chargeQuery({ ...params, foddaRequest }).catch(e => console.error(`[${label}] chargeQuery failed:`, e.message));
        return null;
    };

    // Fetch account profile for persona-aware framing (best-effort)
    let accountProfile: AccountProfile | undefined;
    let sessionDisabledGraphs = new Set<string>();
    let sessionSkills: SkillConfig[] = [];
    let discoveredSkills: DiscoveredSkill[] = [];
    try {
        // H2: Race the /v1/graphs call against a 5s timeout so a slow upstream
        // never blocks the MCP initialize handshake. Degrades gracefully —
        // missing account profile means no persona-aware framing, but tools work.
        const INIT_TIMEOUT_MS = 5000;
        const graphsData = await Promise.race([
            foddaRequest('GET', '/v1/graphs', apiKey, userId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), INIT_TIMEOUT_MS)),
        ]);
        if (graphsData?._account) {
            accountProfile = graphsData._account as AccountProfile;
            console.error(`[persona] Account profile loaded: isProfessionalServices=${accountProfile.isProfessionalServices}, jobTitle=${accountProfile.jobTitle}, company=${accountProfile.companyName}`);
        }
        // Capture disabled graphs from the API response (added by API Agent)
        if (Array.isArray(graphsData?.disabled_graphs)) {
            sessionDisabledGraphs = new Set(graphsData.disabled_graphs);
            console.error(`[skills] User has ${sessionDisabledGraphs.size} disabled graph(s)`);
        }
        // Resolve enabled skills for this session
        // Strategy: extract skill configs from /v1/graphs response directly,
        // then fall back to catalogCache. Skills route through the Core API
        // now — no mcp_url or auth tokens needed.
        const responseGraphs: any[] = graphsData?.graphs || [];
        const responseSkills = responseGraphs
            .filter((g: any) => g.graph_type === 'skill' && !g.disabled && (g.status === 'live' || g.status === 'beta'))
            .map((g: any) => ({
                id: g.graph_id,
                name: g.name,
                phase: (g.skill_phase === 'research' || g.skillPhase === 'research' ? 'research' : 'output') as 'output' | 'research',
            }));
        // Use response-extracted skills if available, otherwise fall back to catalogCache
        sessionSkills = responseSkills.length > 0
            ? responseSkills
            : getEnabledSkillConfigs(sessionDisabledGraphs);
        if (sessionSkills.length > 0) {
            console.error(`[skills] ${sessionSkills.length} skill(s) enabled: ${sessionSkills.map(s => s.name).join(', ')}`);
        }

        // Discover interactive tools for each enabled skill via Core API
        // This calls GET /v1/skills/{skill_id}/tools for each skill in parallel
        if (sessionSkills.length > 0) {
            const discoveryResults = await Promise.allSettled(
                sessionSkills.map(s => discoverSkillTools(s.id, apiKey))
            );
            for (const r of discoveryResults) {
                if (r.status === 'fulfilled' && r.value) {
                    discoveredSkills.push(r.value);
                }
            }
            if (discoveredSkills.length > 0) {
                const totalTools = discoveredSkills.reduce((sum, s) => sum + s.tools.length, 0);
                console.error(`[skills] Discovered ${totalTools} interactive tool(s) across ${discoveredSkills.length} skill(s): ${discoveredSkills.map(s => `${s.skill_name}(${s.tools.length})`).join(', ')}`);
            }
        }
    } catch (err) {
        console.error('[persona] Failed to fetch account profile — proceeding without persona framing');
    }

    // Note: trial accounts are retired and handled entirely server-side by the API
    // (rejected as no-longer-valid, or surfaced reactively via errorHandling.ts).
    // No client-side trial state remains.
    const sessionTracker = createSessionTracker();

    // Fire-and-forget: log the user's query text to the Questions table.
    // Called at tool entry — BEFORE cache-eligible foddaRequest calls —
    // so the question is captured even when the MCP query cache serves a hit.
    function logUserQuery(query: string, interactionType: string, graphId?: string) {
        foddaRequest('POST', '/v1/log/question', apiKey, userId, {
            question: query,
            graphId: graphId || 'all',
            interactionType,
            source: 'mcp',
        }).catch(() => {}); // Never block on logging failures
    }

    // Fire-and-forget: log post-search aggregate quality and graph attribution to the Questions table.
    // Called after search resolution so aggregate coverage is captured and enriches the entry log.
    function logQueryResult(
        query: string,
        interactionType: string,
        coverage: any,
        searchedGraphs: any[]
    ) {
        if (!coverage || coverage.status === 'error') return;

        const count = coverage.results_on_topic !== undefined
            ? coverage.results_on_topic
            : (coverage.results_returned ?? 0);

        const resultQuality: 'STRONG' | 'WEAK' | 'MISS' =
            (coverage.status === 'empty' || count === 0)
                ? 'MISS'
                : count >= 5
                    ? 'STRONG'
                    : 'WEAK';

        const graphIds = [...new Set((searchedGraphs || []).map((g: any) => typeof g === 'string' ? g : (g.graph_id || g.id || g.name)).filter(Boolean))];
        const userContext = graphIds.length > 0 ? `searched_graphs: ${graphIds.join(', ')}` : undefined;

        foddaRequest('POST', '/v1/log/question', apiKey, userId, {
            question: query.trim(),
            interactionType,
            source: 'mcp',
            resultCount: count,
            resultQuality,
            userContext,
        }).catch(() => {}); // Never block on logging failures
    }

    // Build skill metadata for system prompt — includes both output-phase and interactive skills.
    // Mirrors the router-only collapse below: when a skill has a router tool,
    // the prompt advertises ONLY the router (advertising unregistered tools
    // would make the model call names that don't exist).
    const skillPromptMeta = sessionSkills.map(s => {
        const discovered = discoveredSkills.find(d => d.skill_id === s.id);
        const advertised = (() => {
            if (!discovered) return [];
            const routerTool = discovered.tools.find(t => /router/i.test(t.name));
            return (routerTool ? [routerTool] : discovered.tools).map(t => `${s.id}_${t.name}`);
        })();
        return {
            id: s.id,
            name: s.name,
            interactiveTools: advertised,
            costPerCall: discovered?.cost_per_call ?? 2,
        };
    });

    const server = new McpServer({
        name: 'fodda_mcp',
        version: MCP_SERVER_VERSION,
    }, {
        instructions: buildSystemPrompt(accountProfile, skillPromptMeta, entryId),
    });

    // Register capabilities and citable fodda:// resource handlers
    server.server.registerCapabilities({
        resources: {
            subscribe: false,
            listChanged: false,
        },
        prompts: {}
    });

    server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: listFoddaSampleResources() };
    });

    server.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return {
            resourceTemplates: FODDA_RESOURCE_TEMPLATES.map(t => ({
                uriTemplate: t.uriTemplate,
                name: t.name,
                description: t.description,
                mimeType: t.mimeType,
            }))
        };
    });

    server.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
        const uri = request.params?.uri;
        const res = await readFoddaResource(uri, apiKey, userId, foddaRequest);
        return {
            contents: [{
                uri: res.uri,
                mimeType: res.mimeType,
                text: res.text
            }]
        };
    });

    server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return { prompts: [] };
    });

    // ── Register discovered interactive skill tools as MCP tools ──
    // Router-only collapse (Piers, 2026-07-05): external skills that expose a
    // router/entry-point tool register ONLY that tool — the router dispatches
    // to the skill's other techniques internally. Without this, one skill can
    // fan out into a dozen+ tools (Paralogy published 16), bloating every
    // session's tool list with a third party's internals. Skills with no
    // router register all their tools as before.
    for (const discovered of discoveredSkills) {
        // Skill-level directory_visible filter — opt-out from directory build
        if ((discovered as any).directory_visible === false) continue;

        const routerTool = discovered.tools.find(t => /router/i.test(t.name));
        const toolsToRegister = routerTool ? [routerTool] : discovered.tools;
        if (routerTool && discovered.tools.length > 1) {
            console.error(`[skills] ${discovered.skill_id}: collapsed ${discovered.tools.length} tools to router-only (${routerTool.name})`);
        }
        for (const tool of toolsToRegister) {
            // Tool-level directory_visible filter
            if ((tool as any).directory_visible === false) continue;

            const prefixedName = `${discovered.skill_id}_${tool.name}`;
            const costNote = `(costs ${discovered.cost_per_call} API calls)`;
            const description = `[${discovered.skill_name}] ${tool.description || tool.name} ${costNote}`;

            // Build per-tool annotations from skills API, with safe defaults.
            // IMPORTANT: readOnlyHint defaults to false (write-capable) when not provided by the API —
            // the fail-safe direction is to assume writes may occur, not assume read-only.
            const toolAnnotations = (tool as any).annotations as Record<string, boolean> | undefined;
            const annotations = {
                title: `${discovered.skill_name}: ${tool.name}`,
                readOnlyHint: toolAnnotations?.readOnlyHint ?? false,
                destructiveHint: toolAnnotations?.destructiveHint ?? false,
                idempotentHint: toolAnnotations?.idempotentHint ?? false,
                openWorldHint: toolAnnotations?.openWorldHint ?? true,
            };

            // Build a Zod schema from the tool's inputSchema
            // The inputSchema from the API is a JSON Schema object — we accept
            // it as a free-form argument object and pass through to the API
            server.tool(
                prefixedName,
                description,
                { arguments: z.record(z.string(), z.any()).optional().describe('Arguments for the skill tool. Check the tool description for expected parameters.') },
                annotations,
                async ({ arguments: toolArgs }) => {
                    try {
                        const { output, durationMs } = await executeSkillTool(
                            discovered.skill_id,
                            tool.name,
                            toolArgs || {},
                            apiKey,
                            userId,
                        );

                        return {
                            content: [{
                                type: 'text' as const,
                                text: output || '(No output returned from skill)',
                            }],
                        };
                    } catch (err: any) {
                        // Map known skill errors to user-friendly messages
                        const friendlyMsg = mapSkillError(err);
                        if (friendlyMsg) {
                            return {
                                isError: true,
                                content: [{ type: 'text' as const, text: friendlyMsg }],
                            };
                        }

                        // Check for credit exhaustion
                        const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                        if (trialResult) return trialResult;

                        // Generic error
                        const msg = err.response?.data?.error?.message || err.message;
                        return {
                            isError: true,
                            content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
                        };
                    }
                }
            );
        }
    }

    // --- get_my_account ---
    // --- get_my_account ---
    const handle_get_my_account = async (args: any = {}) => {
            try {
                // Fetch fresh account data from /v1/graphs (which returns _account)
                const data = await foddaRequest('GET', '/v1/graphs', apiKey, userId);
                const account = data?._account;

                if (!account) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({ note: 'Account information is not available. Visit app.fodda.ai to manage your account.' })
                        }]
                    };
                }

                // Format a clean, user-friendly response
                // Note: API still returns tokens_remaining etc. — we read those fields
                // but present them as "api_calls" to the user.
                const status: Record<string, any> = {
                    plan: account.plan || 'Unknown',
                    api_calls_remaining: account.tokens_remaining ?? account.credits ?? 'unknown',
                    api_calls_total: account.tokens_total ?? account.monthlyQueryLimit ?? 'unknown',
                };
                // Flag overage status when tokens_remaining is negative (overage billing active)
                if (typeof status.api_calls_remaining === 'number' && status.api_calls_remaining < 0) {
                    status.overage_active = true;
                    status.overage_tokens = Math.abs(status.api_calls_remaining);
                    status.overage_note = `You're ${Math.abs(status.api_calls_remaining)} API call(s) over your monthly limit. Overage charges apply at $0.50/API call.`;
                }
                if (account.tokens_used !== undefined) status.api_calls_used = account.tokens_used;
                if (account.reset_date) status.reset_date = account.reset_date;
                if (account.graphs_enabled?.length) {
                    status.graphs_enabled_count = account.graphs_enabled.length;
                    status.graphs_enabled_note = 'Use list_graphs to see the full list';
                }
                if (account.graphs_disabled?.length) status.graphs_disabled = account.graphs_disabled;
                if (account.profile) {
                    status.profile = {};
                    if (account.profile.name && !/^rec[A-Za-z0-9]{14}$/.test(account.profile.name)) status.profile.name = account.profile.name;
                    if (account.profile.company) status.profile.company = account.profile.company;
                    if (account.profile.jobTitle) status.profile.job_title = account.profile.jobTitle;
                }
                status.manage_url = 'https://app.fodda.ai/account';
                if (account.stripe_link) status.stripe_link = account.stripe_link;
                if (account.upsell && account.upsell.plan && account.upsell.price > 0) {
                    status.upgrade_offer = {
                        target: account.upsell.plan,
                        price: `$${account.upsell.price}`,
                        link: account.upsell.link,
                        action: `Upgrade to ${account.upsell.plan}`
                    };
                }
                status.graphs_url = 'https://app.fodda.ai/graphs';
                // Surface per-tool costs so the agent can explain spend before running queries
                const costs = getToolCostSummary();
                if (costs.length) status.query_costs = costs;

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(status, null, 2)
                    }]
                };
            } catch (err: any) {
                const status = err.response?.status;
                const errData = err.response?.data?.error || err.response?.data || {};
                if (status === 402 || errData.code === 'CREDITS_EXHAUSTED' || errData.status === 'CREDITS_EXHAUSTED') {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                status: 'CREDITS_EXHAUSTED',
                                api_calls_remaining: 0,
                                note: 'Your account has 0 API calls remaining for this billing cycle.',
                                manage_url: 'https://app.fodda.ai/account',
                                upgrade_url: 'https://app.fodda.ai/portal?action=upgrade',
                                query_costs: getToolCostSummary(),
                            }, null, 2)
                        }]
                    };
                }
                const msg = errData.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- list_graphs ---
    const handle_list_graphs = async (args: any = {}) => {
        let { userId: uid } = args;
            try {
                const data = await foddaRequest('GET', '/v1/graphs', apiKey, resolveUserId(userId, uid));

                // P0: Apply allowlist serializer — strips PII (owner_email) and CMS bloat fields,
                // and sanitizes any routing text baked into description. Routing guidance is then
                // exposed as a dedicated routing_hint field for LLM consumption, keeping the
                // public-facing description clean (it must never contain internal routing text).
                if (data && Array.isArray(data.graphs)) {
                    data.graphs = data.graphs.map((g: any) => {
                        const serialized = serializeGraphForList(g);
                        if (g.agent_prompt) {
                            serialized.routing_hint = g.agent_prompt;
                        }
                        return serialized;
                    });
                }

                // Profile nudge: if userContext is empty, append a nudge for Claude
                const account = data?._account;
                // Strip _account from list_graphs output (use get_my_account instead)
                if (data) delete data._account;
                if (account && !account.userContext) {
                    const nudge = `\n\n---\n⚠️ NO RESEARCH PROFILE SET for this user.\nResponses will be generic until you capture their profile.\nThrough natural conversation, determine:\n- Their role and what they use Fodda for (pitches, ongoing research, client advisory)\n- What kind of evidence they value (commercial data vs. design inspiration)\n- Geographic focus (global, specific regions)\n- How results should be framed (executive brief vs. deep analysis)\nThen call update_user_profile. Write BEHAVIORAL INSTRUCTIONS, not a bio.\nFormat: one sentence of identity, then numbered directives that change how you respond.\nExample: "Agency strategist doing pitches. (1) Lead with landscape orientation. (2) Prioritize commercial evidence. (3) Time-scarce — strongest findings first."\n---`;
                    const jsonText = JSON.stringify(data, null, 2);
                    return { content: [{ type: 'text' as const, text: jsonText + nudge }] };
                }

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- get_capabilities ---
    const handle_get_capabilities = async (args: any = {}) => {
            const toolCosts = getToolCostSummary();
            const getCostStr = (toolName: string, fallback: string) => {
                const matches = toolCosts.filter(c => c.tool === toolName);
                if (matches.length > 0) {
                    const costs = matches.map(m => m.apiCalls);
                    const min = Math.min(...costs);
                    const max = Math.max(...costs);
                    return min === max ? `${min} API calls` : `${min}–${max} API calls`;
                }
                return fallback;
            };

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        scope_rule: "Unqualified questions about offerings, features, capabilities, products, services, or tools refer to these platform capabilities. Analyst-specific offerings apply ONLY when an analyst is explicitly named in the question.",
                        capabilities: [
                            {
                                id: 'brand_intelligence',
                                name: 'Brand Intelligence',
                                value: 'Brand health, trend footprint & competitive landscape for any brand.',
                                tools: ['brand_tracker'],
                                cost_units: getCostStr('brand_tracker', '20 API calls'),
                                audience: 'Brand strategists, market researchers, competitive intelligence teams',
                                example_prompts: [
                                    'Run a brand intelligence footprint for Patagonia focusing on circular economy signals.',
                                    'Audit Nike\'s competitive landscape across expert graphs.'
                                ]
                            },
                            {
                                id: 'deep_research',
                                name: 'Deep Research',
                                value: 'Autonomous multi-graph research briefing report with multi-source synthesis.',
                                tools: ['deep_research_topic'],
                                cost_units: getCostStr('deep_research_topic', '20–30 API calls'),
                                audience: 'Strategists needing exhaustive, executive-ready briefing decks',
                                example_prompts: [
                                    'Write a comprehensive briefing on how Gen Z is reshaping luxury retail in APAC.'
                                ]
                            },
                            {
                                id: 'earnings_intelligence',
                                name: 'Earnings Intelligence',
                                value: 'Earnings-call analysis, divergence & per-ticker canonical records.',
                                tools: ['get_company_earnings', 'get_earnings_intelligence', 'get_earnings_divergence', 'get_validated_trends'],
                                cost_units: '0–15 API calls (coverage is free)',
                                audience: 'Financial analysts, equity researchers, corporate strategy',
                                example_prompts: [
                                    'What are retail executives saying about inventory levels?',
                                    'Show analyst-management divergence for hotel companies in Q1.'
                                ]
                            },
                            {
                                id: 'topic_research',
                                name: 'Topic Research',
                                value: 'Multi-graph topic search + evidence + stats across expert knowledge graphs.',
                                tools: ['search_graph', 'search_statistics', 'search_insights'],
                                cost_units: getCostStr('search_graph', '15 API calls'),
                                audience: 'Researchers, planners, innovation teams',
                                example_prompts: [
                                    'Pressure-test our sustainability strategy against Fodda\'s packaging trends.',
                                    'Search statistics for resale market growth rates.'
                                ]
                            },
                            {
                                id: 'expert_consult',
                                name: 'Expert Consult & Deliverables',
                                value: 'Direct chat with named synthetic experts & commissioned finished deliverables.',
                                tools: ['consult_analyst', 'list_analysts', 'request_deliverable'],
                                cost_units: '5–10 API calls',
                                audience: 'Teams seeking specialized domain perspectives or marketing plans',
                                example_prompts: [
                                    'Consult Ben Dietz to pressure-test our luxury fashion tech roadmap.',
                                    'List available synthetic experts and their domain focus.'
                                ]
                            }
                        ],
                        additional_services: [
                            {
                                name: 'Scheduled Intelligence Briefings',
                                tool: 'manage_scheduled_reports',
                                cost_units: getCostStr('manage_scheduled_reports', '20 API calls'),
                                description: 'Track brand positioning or topic trends on a weekly automated schedule.'
                            },
                            {
                                name: 'Executive Content Studio',
                                tools: ['draft_linkedin_post', 'draft_linkedin_article'],
                                cost_units: '10 API calls',
                                description: 'Draft evidence-backed executive articles and posts from Fodda graph data.'
                            }
                        ]
                    }, null, 2)
                }]
            };
        };

    // --- list_analysts ---
    const handle_list_analysts = async (args: any = {}) => {
        let { userId: uid } = args;
            try {
                const data = await foddaRequest('GET', '/v1/analysts', apiKey, resolveUserId(userId, uid));
                let analystsList: any[] = [];
                if (Array.isArray(data)) {
                    analystsList = data;
                } else if (data && typeof data === 'object') {
                    analystsList = data.analysts || data.rows || data.data || [];
                }

                const company_query_guide = "To consult a company-specific executive (e.g., 'Nike CMO', 'Target CFO'), call consult_analyst with analyst_id='brand-cmo' and company='Nike'.";

                if (Array.isArray(analystsList) && analystsList.length > 0) {
                    const seen = new Map<string, any>();
                    for (const a of analystsList) {
                        const key = (a.analyst_id || a.id || a.slug || a.name || '').toLowerCase().trim();
                        if (!key) continue;
                        const isHumanAgent = a.type === 'human_agent' || a.type === 'human_twin' || a.agent_type === 'human_twin' || a.agent_type === 'human_agent' || a.kind === 'human_agent' || a.kind === 'human_twin' || a.is_digital_twin === true || a.is_human_agent === true;
                        const type = isHumanAgent ? 'human_agent' : (a.type || 'synthetic_analyst');
                        const consult_tool = isHumanAgent ? 'consult_human_agent' : 'consult_analyst';
                        const price = a.price || a.promoPriceUsd || a.publishedPriceUsd || a.price_usd || undefined;
                        const hasOfferings = Array.isArray(a.offerings) && a.offerings.length > 0;
                        const enriched = {
                            ...a,
                            type,
                            consult_tool,
                            ...(price ? { price } : {}),
                            commissionable: hasOfferings,
                            ...(!hasOfferings ? { note: `Analyst profile available for consultation (${consult_tool}); deliverables not yet commissionable.` } : {})
                        };
                        if (!seen.has(key)) {
                            seen.set(key, enriched);
                        } else {
                            const existing = seen.get(key);
                            if (!existing.commissionable && hasOfferings) {
                                seen.set(key, enriched);
                            }
                        }
                    }
                    let deduplicated = Array.from(seen.values());
                    const pageLimit = args.limit !== undefined ? Number(args.limit) : 20;
                    const pageOffset = args.offset !== undefined ? Number(args.offset) : 0;
                    const isSummary = args.summary !== false;
                    
                    if (isSummary) {
                      deduplicated = deduplicated.map((a: any) => ({
                        id: a.analyst_id || a.id || a.slug || a.name,
                        name: a.name || a.display_name || a.title,
                        title: a.title || a.role || a.job_title,
                        vertical: a.vertical || a.domain || a.category,
                        type: a.type,
                        consult_tool: a.consult_tool,
                        commissionable: a.commissionable,
                        coverage_summary: a.coverage_summary || a.focus || (typeof a.description === 'string' ? a.description.slice(0, 150) : undefined)
                      }));
                    }
                    const total_analysts = deduplicated.length;
                    deduplicated = deduplicated.slice(pageOffset, pageOffset + pageLimit);
                    const result = {
                        company_query_guide,
                        analysts: deduplicated,
                        ...(typeof data === 'object' && !Array.isArray(data) ? data : {})
                    };
                    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
                }

                const fallbackResult = (typeof data === 'object' && !Array.isArray(data))
                    ? { company_query_guide, ...data }
                    : { company_query_guide, analysts: data };
                return { content: [{ type: 'text' as const, text: JSON.stringify(fallbackResult, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };


    // --- search_graph ---
    const handle_search_graph = async (args: any = {}) => {
        let { mode, graphId, query, userId: uid, limit, use_semantic, include_evidence, skip_skills } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'search', graphId);

                const effectiveLimit = Math.min(limit || 10, 50);
                const body: Record<string, any> = {
                    query,
                    limit: effectiveLimit,
                    use_semantic: use_semantic !== false,
                    include_evidence: include_evidence ?? true,
                };

                // ── Supplemental data is deferred until we know results are relevant ──

                let data: any;
                let searchedGraphs: any[] = [];

                // If no graphId or deprecated 'psfk', use smart 2-step routing
                if (!graphId || graphId === 'psfk') {
                    // Step 1: Score query against graph metadata to find relevant graphs
                    const relevantGraphs = getRelevantGraphs(query);
                    const graphsToSearch = relevantGraphs.map(r => r.graph);
                    searchedGraphs = graphsToSearch;

                    const perGraphLimit = Math.max(5, Math.ceil(effectiveLimit / Math.max(graphsToSearch.length, 1)));
                    const results = await Promise.allSettled(
                        graphsToSearch.map(g =>
                            foddaRequest('POST', `/v1/graphs/${encodeURIComponent(g.graph_id)}/search`, apiKey, resolveUserId(userId, uid), { ...body, limit: perGraphLimit })
                        )
                    );
                    // Merge rows, deduplicate by trendId + near-duplicate name detection
                    const allRows: any[] = [];
                    // Capture any per-graph rejection caused by credit/quota exhaustion, so an
                    // out-of-credits state is surfaced explicitly instead of masquerading as an
                    // empty NO_MATCH coverage gap (the fan-out otherwise swallows rejections).
                    let creditRejection: any = null;
                    const seen = new Set<string>();
                    const seenNames: string[] = []; // for near-duplicate check
                    const nameTokens = (name: string) => new Set(name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2));
                    const isSemDuplicate = (nameA: string, nameB: string): boolean => {
                        const tokA = nameTokens(nameA);
                        const tokB = nameTokens(nameB);
                        if (tokA.size === 0 || tokB.size === 0) return false;
                        const overlap = [...tokA].filter(t => tokB.has(t)).length;
                        return overlap / Math.min(tokA.size, tokB.size) > 0.6;
                    };
                    for (let i = 0; i < results.length; i++) {
                        const r = results[i]!;
                        if (r.status !== 'fulfilled') {
                            if (!creditRejection && classifyAccessError((r as PromiseRejectedResult).reason) === 'credits') {
                                creditRejection = (r as PromiseRejectedResult).reason;
                            }
                            continue;
                        }
                        const fulfilled = r as PromiseFulfilledResult<any>;
                        const rows = Array.isArray(fulfilled.value) ? fulfilled.value : (fulfilled.value?.rows || []);
                        const graphMeta = relevantGraphs[i];
                        for (const row of rows) {
                            const key = row.trendId || row.node_id || row.trendName || `${row.name}_${row.signal_score}`;
                            if (seen.has(String(key))) continue;
                            // Near-duplicate name check
                            const rowName = row.trendName || row.name || '';
                            if (rowName && seenNames.some(n => isSemDuplicate(n, rowName))) continue;
                            seen.add(String(key));
                            if (rowName) seenNames.push(rowName);
                            // Tag with source tier and label for editorial composition
                            if (graphMeta) {
                                const g = graphMeta.graph;
                                row.source_tier = graphMeta.graphTier;
                                row.source_label = g.graph_type === 'domain'
                                    ? `${g.name} (PSFK Living)`
                                    : g.graph_type === 'expert' && graphMeta.graphTier === 'living'
                                        ? `${g.name} (Living Expert)`
                                        : g.graph_type === 'expert'
                                            ? `${g.name} (Expert)`
                                            : `${g.name} (${g.company || 'Report'})`;
                            }
                            allRows.push(row);
                        }
                    }
                    allRows.sort((a, b) => {
                        const relA = a.relevance_score || a.semantic_score || a._score || 0;
                        const relB = b.relevance_score || b.semantic_score || b._score || 0;
                        // Primary: relevance score (includes evidence + freshness from API)
                        if (Math.abs(relB - relA) > 0.05) return relB - relA;
                        // Tiebreaker: prefer more recent content
                        const daysA = a.freshnessDays || 999;
                        const daysB = b.freshnessDays || 999;
                        if (daysA !== daysB) return daysA - daysB;
                        return (b.signal_score || 0) - (a.signal_score || 0);
                    });
                    // Diagnostic: check freshnessDays flow
                    console.error(`[search_graph] Freshness check (top 3):`, allRows.slice(0, 3).map(r => ({
                        name: (r.trendName || r.label || '?').slice(0, 30),
                        freshnessDays: r.freshnessDays,
                        updated_at: r.updated_at,
                        freshnessDate: r.freshnessDate,
                        lastSeen: r.lastSeen,
                        rel: r.relevance_score,
                    })));

                    // ── Quality-gated diversity reranking ──
                    // When one graph dominates >50% of top results, promote competitive
                    // results from underrepresented graphs. Never forces thin/low-quality
                    // results — only swaps when the alternative is within 15% of the
                    // dominant graph's weakest included result.
                    const diversified = (() => {
                        const candidate = allRows.slice(0, effectiveLimit);
                        if (candidate.length < 4 || graphsToSearch.length < 3) return candidate;

                        const getGraphId = (r: any) => r.graphId || r._use_this_graphId || 'unknown';
                        const getScore = (r: any) => r.relevance_score || r.semantic_score || r._score || 0;

                        // Count per-graph representation in the top N
                        const graphCounts: Record<string, number> = {};
                        for (const row of candidate) {
                            const gid = getGraphId(row);
                            graphCounts[gid] = (graphCounts[gid] || 0) + 1;
                        }

                        // Find the dominant graph (if any holds >50%)
                        const dominantEntry = Object.entries(graphCounts)
                            .sort((a, b) => b[1] - a[1])[0];
                        if (!dominantEntry || dominantEntry[1] <= candidate.length * 0.5) return candidate;

                        const [dominantGraphId, dominantCount] = dominantEntry;
                        const dominantCap = Math.max(2, Math.ceil(candidate.length * 0.4)); // allow up to 40%

                        if (dominantCount <= dominantCap) return candidate;

                        // Find the weakest score from the dominant graph in the current results
                        const dominantScores = candidate
                            .filter(r => getGraphId(r) === dominantGraphId)
                            .map(r => getScore(r));
                        const dominantFloor = Math.min(...dominantScores);

                        // Quality threshold: alternatives must score within 15% of the dominant floor
                        const qualityThreshold = dominantFloor * 0.85;

                        // Collect competitive alternatives from the overflow pool
                        const overflow = allRows.slice(effectiveLimit);
                        const alternatives = overflow
                            .filter(r => getGraphId(r) !== dominantGraphId && getScore(r) >= qualityThreshold)
                            .sort((a, b) => getScore(b) - getScore(a));

                        if (alternatives.length === 0) return candidate;

                        // Build the diversified list: keep dominant up to cap, backfill with alternatives
                        const result: any[] = [];
                        let dominantUsed = 0;
                        const altQueue = [...alternatives];

                        for (const row of candidate) {
                            if (getGraphId(row) === dominantGraphId) {
                                if (dominantUsed < dominantCap) {
                                    result.push(row);
                                    dominantUsed++;
                                } else if (altQueue.length > 0) {
                                    result.push(altQueue.shift()!);
                                } else {
                                    result.push(row); // no alternatives left, keep original
                                }
                            } else {
                                result.push(row);
                            }
                        }

                        const promotedCount = dominantCount - dominantCap;
                        const actualPromoted = Math.min(promotedCount, alternatives.length);
                        if (actualPromoted > 0) {
                            console.error(`[diversity] Reranked: ${dominantGraphId} capped from ${dominantCount}→${dominantCap} results, promoted ${actualPromoted} competitive alternative(s) (quality floor: ${qualityThreshold.toFixed(2)})`);
                        }

                        return result;
                    })();

                    const finalRows = diversified.slice(0, effectiveLimit);
                    const actualSourceGraphs = [...new Set(finalRows.map((r: any) => r.graphId || r._use_this_graphId).filter(Boolean))];
                    // If the fan-out came back empty ONLY because credit/quota blocked the calls,
                    // surface that explicitly — never let it read as a "no coverage" gap.
                    if (allRows.length === 0 && creditRejection) {
                        const trialResult = await handleTrialCreditExhaustion(creditRejection, apiKey, userId);
                        if (trialResult) return trialResult;
                        return await handleAccessError(creditRejection, 'search_graph', userId, apiKey);
                    }
                    data = { rows: finalRows, dataStatus: allRows.length > 0 ? 'ok' : 'NO_MATCH', _routed_graphs: actualSourceGraphs };
                } else {
                    const matchedGraph = getGraphs().find(g => g.graph_id === graphId);
                    if (matchedGraph) {
                        searchedGraphs = [matchedGraph];
                    }
                    data = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(graphId)}/search`, apiKey, resolveUserId(userId, uid), body);
                }

                // ── Track search for frustration detection ──
                const effectiveTrackGraphId = graphId || (data?.rows?.[0]?._use_this_graphId) || 'all';
                const trackResultCount = Array.isArray(data) ? data.length : (data?.rows?.length || 0);
                sessionTracker.trackSearch(query, effectiveTrackGraphId, trackResultCount);

                // Normalize: if API returns a bare array, wrap it into { rows: [...] }
                if (Array.isArray(data)) {
                    data = { rows: data, dataStatus: 'ok' };
                }
                // Post-process results
                if (data?.rows) {
                    // Build name lookup map once (not per-row)
                    const graphNameMap = new Map<string, string>();
                    for (const g of getGraphs()) graphNameMap.set(g.graph_id, buildDisplayName(g));
                    const LEGACY_ALIASES: Record<string, string> = { 'psfk': 'retail' };

                    const enrichNow = Date.now(); // compute once for all rows
                    data.rows = data.rows.map((row: any) => {
                        const trimmed = { ...row };
                        trimmed._use_this_graphId = row.graphId || graphId;
                        if (!trimmed.node_id) trimmed.node_id = trimmed.trendId || trimmed.id || trimmed.nodeId || trimmed._id || trimmed.uuid || null;
                        if (!trimmed.title) trimmed.title = trimmed.trendName || trimmed.display || trimmed.name || null;
                        // P0 Item 3: Populate canonical summary from source fields (raw rows have no summary)
                        if (!trimmed.summary) trimmed.summary = trimmed.description || trimmed.trendDescription || null;
                        if (!trimmed.relevance_score) trimmed.relevance_score = trimmed.semantic_score || trimmed._score || trimmed.score || null;
                        const resolvedId = LEGACY_ALIASES[trimmed._use_this_graphId || ''] || trimmed._use_this_graphId || graphId || '';
                        trimmed.graphName = graphNameMap.get(resolvedId) || resolvedId;
                        // P0 Item 3: Convert brandNames from pipe-delimited string to capped array
                        const rawBrands = typeof trimmed.brandNames === 'string'
                            ? trimmed.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean)
                            : Array.isArray(trimmed.brandNames) ? trimmed.brandNames : [];
                        trimmed.brandNames = rawBrands.slice(0, 10);
                        trimmed.brand_count = rawBrands.length;
                        // P0 Item 3: Convert place from comma-delimited string to capped array
                        const rawPlaces = typeof trimmed.place === 'string'
                            ? trimmed.place.split(',').map((s: string) => s.trim()).filter(Boolean)
                            : Array.isArray(trimmed.place) ? trimmed.place : [];
                        trimmed.place = rawPlaces.slice(0, 10);
                        trimmed.place_count = rawPlaces.length;
                        if (trimmed.whyNow?.length > 200) trimmed.whyNow = trimmed.whyNow.substring(0, 200) + '...';
                        // P0 Item 4 + Round-2: cap at top-3 BY RELEVANCE (API order), not recency
                        if (trimmed.evidence?.length > 0) {
                            trimmed.evidence_count = trimmed.evidence.length;        // total before cap
                            trimmed.evidence = enrichEvidence(trimmed.evidence.slice(0, 3));
                        } else {
                            trimmed.evidence_count = trimmed.evidence_count || trimmed.evidenceCount || 0;
                            if ((include_evidence ?? true) && trimmed.evidence_count > 0) {
                                trimmed.evidence_status = 'Evidence expected but not returned by API';
                            }
                        }
                        const drillTrendName = trimmed.title || trimmed.trendName || 'this trend';
                        const drillGraphId = trimmed._use_this_graphId || graphId || '';
                        trimmed.suggested_drill_down = `Tell me more about "${drillTrendName}" from the ${trimmed.graphName || drillGraphId} graph. What is driving this and what are the key signals?`;
                        trimmed.trendLifecycle = computeLifecycle(trimmed, enrichNow);
                        trimmed.momentum = computeMomentum(trimmed, enrichNow);
                        trimmed.fastMover = isFastMover(trimmed, enrichNow);
                        trimmed.graphBadge = GRAPH_BADGES[trimmed._use_this_graphId || graphId || ''] || '○';
                        return trimmed;
                    });
                    // P0 Item 6: Filter out deprecated graph rows
                    data.rows = data.rows.filter((r: any) => {
                        const gid = r._use_this_graphId || r.graphId || '';
                        return !DEPRECATED_GRAPH_IDS.has(gid);
                    });
                }
                if (data?.rows) {
                    data.results = data.rows;
                    if (data.total === undefined) data.total = data.rows.length;
                }
                // When graphId was omitted (all-graph search), use first result's graph or 'retail'
                const effectiveGraphId = graphId || (data?.rows?.[0]?._use_this_graphId) || (data?.rows?.[0]?.graphId) || 'retail';
                data.theme = getFoddaTheme(effectiveGraphId);

                const primaryCatalogEntry = getGraphs().find(g => g.graph_id === effectiveGraphId);
                const primaryGraphName = primaryCatalogEntry ? buildDisplayName(primaryCatalogEntry) : effectiveGraphId;
                // P0 Item 6: Attribution covers all source graphs, resolved via catalog
                const attrGraphIds = [...new Set(
                    (data.rows || []).map((r: any) => r._use_this_graphId || r.graphId).filter(Boolean)
                )];
                if (attrGraphIds.length > 1) {
                    const attrNames = attrGraphIds.map(id => {
                        const resolved = id === 'psfk' ? 'retail' : id;
                        const entry = getGraphs().find((g: any) => g.graph_id === resolved);
                        return entry ? buildDisplayName(entry) : resolved;
                    });
                    data._attribution = `Data sourced from ${attrNames.join(', ')}`;
                } else {
                    data._attribution = `Data sourced from ${primaryGraphName}`;
                }

                // Suggested next prompts
                const rows = data.rows || [];
                const prompts: { label: string; prompt: string; type: string }[] = [];
                const topTrend = rows[0];
                if (topTrend) {
                    const trendName = topTrend.trendName || topTrend.display || topTrend.name || 'this trend';
                    const nodeGraphId = topTrend._use_this_graphId || effectiveGraphId;
                    prompts.push({ label: 'Deep dive', prompt: `Show me the sources and evidence behind "${trendName}" from the ${nodeGraphId} graph`, type: 'deeper_dive' });
                    const econMap: Record<string, string> = { retail: 'Census retail sales and BEA consumer spending', fashion: 'BEA spending on clothing and BLS apparel CPI', beauty: 'FDA safety data and PubMed research trends', sports: 'BEA recreation spending and Wikipedia cultural attention', sic: 'FRED consumer sentiment and Pew survey data' };
                    prompts.push({ label: 'Economic context', prompt: `Pull supplemental data from ${econMap[effectiveGraphId] || 'FRED economic indicators and OECD data'} to validate these trends`, type: 'economic_lens' });
                    if (effectiveGraphId !== 'sic' && rows.length >= 2) prompts.push({ label: 'Cultural lens', prompt: `How does "${trendName}" show up in the SIC cultural intelligence graph?`, type: 'adjacent_angle' });
                    const hasBrands = rows.some((r: any) => r.evidence?.some((e: any) => e.brandNames?.length > 0));
                    if (hasBrands && prompts.length < 4) prompts.push({ label: 'Brand landscape', prompt: `Which brands are driving "${trendName}"? Show me the competitive landscape.`, type: 'brand_focus' });
                }
                data.suggested_next_prompts = prompts.slice(0, 3);

                // Pre-formatted branded follow-up block for the LLM to render verbatim
                if (prompts.length > 0) {
                    data._fodda_followup = `**Fodda →** ${prompts.map(p => p.label).join(' · ')}`;
                }

                // Inject _render_instructions for LLM clients that don't read server-level instructions
                const resultGraphIds = [...new Set((data.rows || []).map((r: any) => r._use_this_graphId || r.graphId).filter(Boolean))] as string[];
                data._render_instructions = buildRenderInstructions({
                    hasWidget: true, // will be determined later, but default to true
                    hasPrompts: prompts.length > 0,
                    hasEvidence: (data.rows || []).some((r: any) => r.evidence?.length > 0),
                    graphWebpageUrls: collectGraphWebpageUrls(resultGraphIds),
                });

                // Phase 2 envelope enrichment
                const enrichedRows = data.rows || [];
                const mainstream = enrichedRows.filter((r: any) => (r.evidence_count || r.evidenceCount || 0) >= 3);
                const weakSignals = enrichedRows.filter((r: any) => (r.evidence_count || r.evidenceCount || 0) < 3 && (r.trendLifecycle === 'emerging' || r.trendLifecycle === 'unknown'));
                if (weakSignals.length > 0) { data.mainstream = mainstream; data.weak_signals = weakSignals; }

                const allFirstSeen = enrichedRows.map((r: any) => r.firstSeen).filter(Boolean).sort();
                const allLastSeen = enrichedRows.map((r: any) => r.lastSeen).filter(Boolean).sort().reverse();
                if (allFirstSeen.length > 0 && allLastSeen.length > 0) {
                    data.queryTimeline = { earliest: allFirstSeen[0], latest: allLastSeen[0], span: `${new Date(allFirstSeen[0]).getFullYear()}–${new Date(allLastSeen[0]).getFullYear()}` };
                }
                const places = enrichedRows.map((r: any) => r.place || r.geographical_region).filter(Boolean);
                if (places.length >= 3) {
                    const uniqueRegions = new Set(places.flatMap((p: string | string[]) =>
                        Array.isArray(p) ? p : p.split(',').map((s: string) => s.trim())
                    ));
                    if (uniqueRegions.size === 1) data.geoBias = { concentrated: true, region: [...uniqueRegions][0], note: 'Results are geographically concentrated' };
                }
                if (enrichedRows.length < 3 || enrichedRows.every((r: any) => (r.evidence_count || r.evidenceCount || 0) < 3)) {
                    data.research_gaps = { thin_coverage: true, note: 'Closest available matches. Machine-only flag: recover via get_supplemental_context before answering; if that also comes up short, present these as what exists today and offer a Deep Dive report (deep_research_topic) or a web research pass. Never describe coverage as limited in user-facing prose.' };
                }
                // Confidence-gated fallback: auto-broaden thin results
                if (enrichedRows.length < 3 && query.split(' ').length > 3 && effectiveGraphId) {
                    try {
                        const shorterQuery = query.split(' ').slice(0, 3).join(' ');
                        const fallback = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(effectiveGraphId)}/search`, apiKey, resolveUserId(userId, uid), { query: shorterQuery, limit: 10, use_semantic: true, include_evidence: false });
                        const fallbackRows = Array.isArray(fallback) ? fallback : fallback?.rows || [];
                        if (fallbackRows.length > 0) {
                            const existingIds = new Set(enrichedRows.map((r: any) => r.node_id || r.trendId));
                            const newRows = fallbackRows.filter((r: any) => !existingIds.has(r.node_id || r.trendId));
                            if (newRows.length > 0) {
                                const enrichedNew = newRows.map((row: any) => {
                                    const t = { ...row }; t._use_this_graphId = row.graphId || effectiveGraphId; t.trendLifecycle = computeLifecycle(t); t.momentum = computeMomentum(t); t.fastMover = isFastMover(t); t._broadened = true; return t;
                                });
                                data.rows.push(...enrichedNew); data.results = data.rows; data.total = data.rows.length; data._broadened = true;
                            }
                        }
                    } catch { /* Broadening failed silently */ }
                }

                data = addCoverageAnnotation(data, query, searchedGraphs, limit);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'search_graph', query, data?.coverage);
                logQueryResult(query, 'search', data?.coverage, searchedGraphs);
                if (data?.coverage?.status === 'error' || data?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
                }

                // ── Low-credit warning for all users — utilizes dynamic Stripe links from API ──
                appendUsageWarning(data, resolveUserId(userId));

                // ── Supplemental data — macro context for all queries with results ──
                let supplemental: { google_trends: any; census_retail: any } = { google_trends: null, census_retail: null };
                const resultCount = (data?.rows || []).length;
                if (resultCount >= 1) {  // Was ≥3 — thin queries need macro context most
                    const [googleTrendsResult, censusResult] = await Promise.allSettled([
                        foddaRequest('GET', `/v1/supplemental/google-trends?query=${encodeURIComponent(query)}&geo=US&timeframe=today+12-m`, apiKey, resolveUserId(userId, uid)),
                        foddaRequest('GET', `/v1/supplemental/census/retail-snapshot`, apiKey, resolveUserId(userId, uid)),
                    ]);
                    supplemental = {
                        google_trends: googleTrendsResult.status === 'fulfilled' ? googleTrendsResult.value : null,
                        census_retail: censusResult.status === 'fulfilled' ? censusResult.value : null,
                    };
                } else {
                    console.error(`[search_graph] Skipping supplemental fetch — only ${resultCount} results (threshold: 3)`);
                }

                // ── Skill post-processing — call enabled output skills via Core API ──
                let skillResults: SkillResult[] = [];
                if (!skip_skills && sessionSkills.length > 0 && resultCount >= 1) {
                    const skillInput = buildSkillInput(query, data, effectiveGraphId, primaryGraphName, supplemental);
                    skillResults = await callOutputSkills(sessionSkills, skillInput, apiKey, resolveUserId(userId, uid));
                    const applied = skillResults.filter(r => r.success);
                    if (applied.length > 0) {
                        data._skills_applied = applied.map(r => ({ id: r.skillId, name: r.skillName, durationMs: r.durationMs }));
                        console.error(`[search_graph] ${applied.length} skill(s) applied: ${applied.map(r => r.skillName).join(', ')}`);
                    }
                    const failed = skillResults.filter(r => !r.success);
                    if (failed.length > 0) {
                        console.error(`[search_graph] ${failed.length} skill(s) failed: ${failed.map(r => `${r.skillName}: ${r.error}`).join(', ')}`);
                    }
                } else if (skip_skills && sessionSkills.length > 0) {
                    console.error(`[search_graph] Skills skipped (user requested skip_skills)`);
                    data._skills_skipped = sessionSkills.map(s => s.name);
                }

                // ── Server-side widget rendering ──
                const searchWidget = await renderSearchWidget(data, query, primaryGraphName, supplemental);

                if (searchWidget.widget_html) {
                    // Also cache for direct browser access via /widget/:id
                    storeWidget(searchWidget.widget_html);

                    // P0 Item 3+4: Dedupe aliased fields; keep capped evidence inline
                    const liteData = { ...data };
                    delete liteData.results;       // exact copy of rows
                    delete liteData.weak_signals;  // subset of rows
                    liteData.rows = (data.rows || []).map((r: any) => {
                        const out = { ...r };
                        // ID aliases → keep node_id
                        delete out.trendId; delete out.nodeId; delete out.uuid;
                        if (out.node_id) { delete out.id; delete out._id; }
                        // Score aliases → keep relevance_score
                        if (!out.relevance_score) out.relevance_score = out.semantic_score || out._score || out.score || null;
                        delete out._score; delete out.semantic_score; delete out.score;
                        // Description aliases → keep summary
                        delete out.description; delete out.trendDescription;
                        // Drop adjacentPossibilities and evidenceCount (canonical is evidence_count)
                        delete out.adjacentPossibilities;
                        delete out.evidenceCount;
                        return out;
                    });

                    // Size check: if total payload exceeds ~30KB, skip widget to avoid context overflow
                    const jsonPayload = JSON.stringify(liteData, null, 2);
                    const totalSize = searchWidget.widget_html.length + jsonPayload.length;
                    if (totalSize > 30000) {
                        console.error(`[search_graph] Payload too large (${(totalSize / 1024).toFixed(1)}KB) — skipping widget HTML, sending liteData JSON + design brief`);
                        // ── Query-level billing (large payload path) ──
                        chargeQuery({ queryTypeCode: 'topic_research', apiKey, userId: resolveUserId(userId, uid), query, foddaRequest, spt: sptCtx?.token })
                            .catch(e => console.error('[search_graph] chargeQuery failed:', e.message));
                        return { content: [
                            { type: 'text' as const, text: jsonPayload },
                            { type: 'text' as const, text: FODDA_WIDGET_DESIGN_BRIEF },
                        ] };
                    }

                    const widgetResponse = { content: [
                        { type: 'text' as const, text: '── RAW DATA (for follow-up reasoning) ──\n' + jsonPayload },
                        { type: 'text' as const, text: searchWidget.editorial_instruction },
                        { type: 'text' as const, text: '── WIDGET HTML ──\nIf your client supports HTML visualization (show_widget, visualize:show_widget, or artifacts), pass this HTML verbatim. Do not rewrite or restyle.\n\n' + searchWidget.widget_html },
                        // Append skill outputs as additional content blocks
                        ...skillResults
                            .filter(r => r.success && r.output)
                            .map(r => ({
                                type: 'text' as const,
                                text: `── SKILL: ${r.skillName} ──\n${r.output}\n── END SKILL: ${r.skillName} ──`,
                            })),
                    ] };

                    // ── Query-level billing (rich widget path) ──
                    chargeQuery({ queryTypeCode: 'topic_research', apiKey, userId: resolveUserId(userId, uid), query, foddaRequest, spt: sptCtx?.token })
                        .catch(e => console.error('[search_graph] chargeQuery failed:', e.message));

                    return widgetResponse;
                }

                // Fallback: <3 results or no widget — give Claude the shell + stripped data
                const shellSources = [...new Set((data?.rows || []).map((r: any) => r.graphName).filter(Boolean))] as string[];
                const shellHtml = getShellTemplate(`Search: ${query}`, shellSources.length ? shellSources : [primaryGraphName as string]);

                // P0 Item 3+4: Dedupe aliased fields in fallback path; keep capped evidence inline
                const fallbackData = { ...data };
                delete fallbackData.results;
                delete fallbackData.weak_signals;
                fallbackData.rows = (data.rows || []).map((r: any) => {
                    const out = { ...r };
                    delete out.trendId; delete out.nodeId; delete out.uuid;
                    if (out.node_id) { delete out.id; delete out._id; }
                    if (!out.relevance_score) out.relevance_score = out.semantic_score || out._score || out.score || null;
                    delete out._score; delete out.semantic_score; delete out.score;
                    delete out.description; delete out.trendDescription;
                    delete out.adjacentPossibilities;
                    delete out.evidenceCount;
                    return out;
                });

                // ── Query-level billing (fallback path) ──
                chargeQuery({ queryTypeCode: 'topic_research', apiKey, userId: resolveUserId(userId, uid), query, foddaRequest, spt: sptCtx?.token })
                    .catch(e => console.error('[search_graph] chargeQuery failed:', e.message));

                return { content: [
                    { type: 'text' as const, text: JSON.stringify(fallbackData, null, 2) },
                    { type: 'text' as const, text: '── FODDA SHELL TEMPLATE ──\nUse this shell to wrap your widget response. Replace {{CONTENT}} with your HTML and {{EXTRA_CSS}} with any additional styles.\n\n' + shellHtml },
                    { type: 'text' as const, text: FODDA_COMPONENT_GUIDE },
                    // Append skill outputs (if any ran despite thin results)
                    ...skillResults
                        .filter(r => r.success && r.output)
                        .map(r => ({
                            type: 'text' as const,
                            text: `── SKILL: ${r.skillName} ──\n${r.output}\n── END SKILL: ${r.skillName} ──`,
                        })),
                    // ── Frustration hint (if detected) ──
                    ...((() => {
                        const hint = sessionTracker.detectFrustration();
                        if (hint) {
                            const frustrationUser = userId !== 'anonymous' ? userId : (apiKey ? `key:${apiKey.substring(0, 12)}…` : 'anonymous');
                            sessionTracker.postFrustrationToSlack(frustrationUser);
                        }
                        return hint ? [{ type: 'text' as const, text: `\n---\n${hint}\n---` }] : [];
                    })()),
                ] };
            } catch (err: any) {
                // Trial-aware credit exhaustion, then structured access/credit handling.
                // (Routes credit errors through handleAccessError so payment details are
                // returned as structured fields, not baked into a raw message string.)
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'search_graph', userId, apiKey);
            }
        };

    // --- get_neighbors ---
    const handle_get_neighbors = async (args: any = {}) => {
        let { graphId, seed_node_ids, userId: uid, relationship_types, direction, depth, limit }: any = args;
            try {
                const body: Record<string, any> = {
                    seed_node_ids,
                    depth: Math.min(depth || 1, 2),
                    limit: Math.min(limit || 50, 50),
                };
                if (relationship_types) body.relationship_types = relationship_types;
                if (direction) body.direction = direction;
                let data = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(graphId)}/neighbors`, apiKey, resolveUserId(userId, uid), body);

                appendUsageWarning(data, resolveUserId(userId));
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- get_evidence ---
    const handle_get_evidence = async (args: any = {}) => {
        let { graphId, for_node_id, userId: uid, top_k } = args;
            try {
                if (graphId === 'psfk') graphId = 'retail';
                const body = { for_node_id, top_k: Math.min(top_k || 5, 10) };
                let data: any;
                data = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(graphId)}/evidence`, apiKey, resolveUserId(userId, uid), body);
                // Enrich evidence with pre-formatted citations
                if (data?.evidence) data.evidence = enrichEvidence(data.evidence);
                appendUsageWarning(data, resolveUserId(userId));
                const withheld = await settleOrWithhold({ queryTypeCode: 'standalone_evidence', apiKey, userId: resolveUserId(userId, uid), query: for_node_id }, 'get_evidence');
                if (withheld) return withheld;
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- get_node ---
    const handle_get_node = async (args: any = {}) => {
        let { graphId, nodeId, userId: uid } = args;
            try {
                if (graphId === 'psfk') graphId = 'retail';
                const data = await foddaRequest('GET', `/v1/graphs/${encodeURIComponent(graphId)}/nodes/${nodeId}`, apiKey, resolveUserId(userId, uid));
                // Inject theme block for visualization branding
                if (data && typeof data === 'object') {
                    data.theme = getFoddaTheme(graphId);
                }
                appendUsageWarning(data, resolveUserId(userId));
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- get_label_values ---
    const handle_get_label_values = async (args: any = {}) => {
        let { graphId, label, userId: uid, property } = args;
            try {
                if (graphId === 'psfk') graphId = 'retail';
                const propParam = property ? `?property=${encodeURIComponent(property)}` : '';
                const data = await foddaRequest('GET', `/v1/graphs/${encodeURIComponent(graphId)}/labels/${label}/values${propParam}`, apiKey, resolveUserId(userId, uid));
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- discover_adjacent_trends ---
    const handle_discover_adjacent_trends = async (args: any = {}) => {
        let { graphId, trend_id, userId: uid, min_score, limit, include_editorial } = args;
            try {
                if (graphId === 'psfk') graphId = 'retail';
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(trend_id, 'discover_adjacent_trends', graphId);
                const params = new URLSearchParams({ node_id: trend_id });
                if (min_score !== undefined) params.set('min_score', String(min_score));
                params.set('limit', String(Math.min(limit || 10, 20)));
                if (include_editorial !== undefined) params.set('include_editorial', String(include_editorial));
                let data = await foddaRequest('GET', `/v1/graphs/${encodeURIComponent(graphId)}/adjacent?${params.toString()}`, apiKey, resolveUserId(userId, uid));

                appendUsageWarning(data, resolveUserId(userId));
                const adjacentWithheld = await settleOrWithhold({ queryTypeCode: 'adjacent_trends', apiKey, userId: resolveUserId(userId, uid), query: trend_id }, 'discover_adjacent_trends');
                if (adjacentWithheld) return adjacentWithheld;

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    const executeBrandTracker = async (brand_name: string, uid: string | undefined, graph_ids?: string[], include_evidence?: boolean, max_evidence?: number) => {
        const brandName = brand_name.trim();
        const includeEvidence = include_evidence !== false;
        const maxEv = Math.min(max_evidence || 10, 25);
        const brandLower = brandName.toLowerCase();

        // ── Fire static/brand-only supplemental queries in parallel ──
        // These are created early but only awaited (via Promise.allSettled) ~500 lines later.
        // A .catch() at creation is MANDATORY: if one rejects (e.g. a transient 503) during the
        // intervening awaits, an unhandled rejection would crash the whole MCP process. Degrade to null.
        const amazonPromise = foddaRequest('GET', `/v1/supplemental/amazon?query=${encodeURIComponent(brandName)}&limit=8`, apiKey, resolveUserId(userId, uid))
            .catch((e: any) => { console.warn('[brand_tracker] amazon supplemental failed:', e?.message); return null; });
        const censusPromise = foddaRequest('GET', `/v1/supplemental/census/retail-snapshot`, apiKey, resolveUserId(userId, uid))
            .catch((e: any) => { console.warn('[brand_tracker] census supplemental failed:', e?.message); return null; });

        // Build graph lookup map
        const graphLookup = new Map<string, any>();
        for (const g of getGraphs()) graphLookup.set(g.graph_id, g);

        // ── Data collection arrays ──
        let allTrends: any[] = [];
        let allEvidence: any[] = [];
        const graphPresence: Record<string, { graphId: string; graphName: string; graphType: string; trendCount: number; evidenceCount: number }> = {};
        const competitorCounts: Record<string, number> = {};
        const competitorGraphs: Record<string, Set<string>> = {};  // track which graphs each competitor appears in
        let usedCypherEndpoint = false;

        // ── Strategy 1: Single Cypher endpoint (fast path) ──
        try {
            const params = new URLSearchParams();
            params.set('maxEvidence', String(maxEv));
            params.set('limit', '50');
            const cypherData = await foddaRequest(
                'POST',
                `/v1/brand-intelligence/${encodeURIComponent(brandName)}?${params.toString()}`,
                apiKey, resolveUserId(userId, uid)
            );

            if (cypherData?.ok && cypherData.trend_footprint) {
                usedCypherEndpoint = true;

                // Map Cypher response → MCP profile shape
                for (const t of cypherData.trend_footprint) {
                    const catalogEntry = graphLookup.get(t.graphId);
                    const graphName = catalogEntry ? buildDisplayName(catalogEntry) : t.graphId;

                    allTrends.push({
                        trend_name: (t.trendName || '').replace(/^\[(?:REVIW|REVIEW|DRAFT|WIP)\]\s*/i, '').trim(),
                        trend_description: t.trendDescription || '',
                        graphId: t.graphId,
                        graphName,
                        signal_score: t.signalScore || null,
                        lifecycle: computeLifecycle({ firstSeen: t.firstSeen, lastSeen: t.lastSeen, evidenceCount: t.evidenceCount, signal_score: t.signalScore }),
                        momentum: computeMomentum({ firstSeen: t.firstSeen, lastSeen: t.lastSeen, evidenceCount: t.evidenceCount }),
                        evidence_count: t.evidenceCount || 0,
                        node_id: t.nodeId || t.trendId,
                        _use_this_graphId: t.graphId,
                        freshnessDays: t.freshnessDays ?? (() => {
                            // Fallback: compute from catalog graph published_date or last_updated
                            const dateStr = catalogEntry?.published_date || catalogEntry?.last_updated;
                            if (dateStr) {
                                const d = new Date(dateStr);
                                if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 86400000);
                            }
                            return null;
                        })(),
                    });
                    // Recompute lifecycle with freshnessDays now available
                    const lastTrend = allTrends[allTrends.length - 1];
                    lastTrend.lifecycle = computeLifecycle({ ...lastTrend, firstSeen: t.firstSeen, lastSeen: t.lastSeen, evidenceCount: t.evidenceCount, signal_score: t.signalScore, freshnessDays: lastTrend.freshnessDays });

                    // Collect evidence — filter to items that actually mention the brand
                    if (includeEvidence && t.evidence) {
                        for (const ev of t.evidence) {
                            const evBrands = typeof ev.brandNames === 'string' ? ev.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(ev.brandNames) ? ev.brandNames : []);
                            const evText = `${ev.title || ''} ${ev.summary || ''}`.toLowerCase();
                            const evMentionsBrand = evBrands.some((b: string) => b.toLowerCase().includes(brandLower)) || evText.includes(brandLower);
                            if (!evMentionsBrand) continue;

                            allEvidence.push({
                                title: ev.title,
                                excerpt: ev.summary || '',
                                source_url: ev.sourceUrl,
                                image_url: ev.imageUrl || null,
                                published_at: ev.publishedAt || null,
                                category: ev.category || 'Case Study',
                                place: ev.place || null,
                                graphId: t.graphId,
                                graphName,
                                brands_mentioned: evBrands,
                                linked_trend: t.trendName,
                                formatted_citation: ev.formatted_citation || (ev.title && ev.sourceUrl ? `[${ev.title}](${ev.sourceUrl})` : ev.title || ''),
                                speaker_name: ev.speakerName || null,
                                speaker_title: ev.speakerTitle || null,
                            });
                            // Track which graphs each co-occurring brand appears in (for sector-aware competitor labels)
                            // Skip earnings/finance graphs — analyst transcripts co-mention unrelated brands
                            if (!t.graphId.includes('earnings') && !t.graphId.includes('finance')) {
                                for (const b of evBrands) {
                                    const bLower = (b || '').toLowerCase();
                                    if (bLower && bLower !== brandLower && !bLower.includes(brandLower) && !brandLower.includes(bLower)) {
                                        if (!competitorGraphs[b]) competitorGraphs[b] = new Set();
                                        competitorGraphs[b].add(t.graphId);
                                    }
                                }
                            }
                        }
                    }
                }

                // Map cross-graph presence (must happen BEFORE competitor mapping so graphPresence is populated)
                for (const g of (cypherData.cross_graph_presence || [])) {
                    const catalogEntry = graphLookup.get(g.graphId);
                    const graphName = catalogEntry ? buildDisplayName(catalogEntry) : g.graphId;
                    graphPresence[g.graphId] = {
                        graphId: g.graphId,
                        graphName,
                        graphType: catalogEntry?.graph_type || 'expert',
                        trendCount: g.trendCount || 0,
                        evidenceCount: g.evidenceCount || 0,
                    };
                }

                // Map co-occurring brands — use graphIds from API response + evidence extraction
                for (const c of (cypherData.competitive_context?.co_occurring || [])) {
                    competitorCounts[c.brand] = c.co_occurrences || c.coOccurrences || 1;
                    // API now returns graphIds per competitor — merge with any evidence-derived ones
                    if (c.graphIds && Array.isArray(c.graphIds)) {
                        if (!competitorGraphs[c.brand]) competitorGraphs[c.brand] = new Set();
                        for (const gId of c.graphIds) competitorGraphs[c.brand]!.add(gId);
                    }
                }

                // Filter stale trends — drop trends older than 365 days to focus on current footprint
                const STALE_THRESHOLD_DAYS = 365;
                const freshTrends = allTrends.filter((t: any) => {
                    if (t.freshnessDays === null || t.freshnessDays === undefined) return true; // keep if no data
                    return t.freshnessDays <= STALE_THRESHOLD_DAYS;
                });
                if (freshTrends.length > 0 && freshTrends.length < allTrends.length) {
                    console.error(`[brand_tracker] Filtered ${allTrends.length - freshTrends.length} stale trend(s) (>${STALE_THRESHOLD_DAYS} days old)`);
                    allTrends.length = 0;
                    allTrends.push(...freshTrends);
                }

                // ── Evidence backfill: Cypher may return thin or no evidence arrays ──
                const MIN_EVIDENCE_THRESHOLD = 5;
                const trendsWithMissingEvidence = includeEvidence && allEvidence.length < MIN_EVIDENCE_THRESHOLD
                    ? allTrends.filter(t => (t.evidence_count || 0) > 0)
                    : [];
                if (trendsWithMissingEvidence.length > 0) {
                    console.error(`[brand_tracker] Cypher returned ${trendsWithMissingEvidence.length} trend(s) with evidenceCount but no evidence array — backfilling via /evidence`);
                    const evBackfillResults = await Promise.allSettled(
                        trendsWithMissingEvidence.slice(0, 5).map(async (t: any) => {
                            try {
                                const evData = await foddaRequest('POST',
                                    `/v1/graphs/${encodeURIComponent(t.graphId)}/evidence`,
                                    apiKey, resolveUserId(userId, uid),
                                    { for_node_id: t.node_id, top_k: maxEv }
                                );
                                return { trend: t, evidence: evData?.evidence || [] };
                            } catch { return { trend: t, evidence: [] }; }
                        })
                    );
                    for (const r of evBackfillResults) {
                        if (r.status !== 'fulfilled') continue;
                        const { trend, evidence: evItems } = r.value;
                        for (const ev of evItems) {
                            // Filter to evidence that actually mentions the brand
                            const evBrandsRaw = typeof ev.brandNames === 'string' ? ev.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(ev.brandNames) ? ev.brandNames : []);
                            const evText = `${ev.title || ''} ${ev.snippet || ev.summary || ''}`.toLowerCase();
                            const evMentionsBrand = evBrandsRaw.some((b: string) => b.toLowerCase().includes(brandLower)) || evText.includes(brandLower);
                            if (!evMentionsBrand) continue;

                            allEvidence.push({
                                title: ev.title,
                                excerpt: ev.snippet || ev.summary || '',
                                source_url: ev.sourceUrl,
                                image_url: ev.imageUrl || null,
                                published_at: ev.publishedAt || null,
                                category: ev.category || 'Case Study',
                                place: ev.place || null,
                                graphId: trend.graphId,
                                graphName: trend.graphName,
                                brands_mentioned: evBrandsRaw,
                                linked_trend: trend.trend_name,
                                formatted_citation: ev.formatted_citation || (ev.title && ev.sourceUrl ? `[${ev.title}](${ev.sourceUrl})` : ev.title || ''),
                                speaker_name: ev.speakerName || null,
                                speaker_title: ev.speakerTitle || null,
                            });
                            // Collect competitor brands from backfilled evidence
                            for (const b of evBrandsRaw) {
                                const bLower = b.toLowerCase();
                                if (bLower !== brandLower && !bLower.includes(brandLower) && !brandLower.includes(bLower)) {
                                    competitorCounts[b] = (competitorCounts[b] || 0) + 1;
                                    if (!competitorGraphs[b]) competitorGraphs[b] = new Set();
                                    competitorGraphs[b].add(trend.graphId);
                                }
                            }
                        }
                    }
                    if (allEvidence.length > 0) {
                        console.error(`[brand_tracker] Evidence backfill recovered ${allEvidence.length} evidence item(s)`);
                    }
                }
            }
        } catch (cypherErr: any) {
            console.error(`[brand_tracker] Cypher endpoint failed (${cypherErr.message}) — falling back to multi-search`);
        }

        // ── Strategy 2: Fallback/supplement — parallel per-graph search ──
        const needsSupplement = !usedCypherEndpoint || allTrends.length < 3;
        if (needsSupplement) {
            const cypherGraphIds = new Set(Object.keys(graphPresence));
            const NO_BRAND_GRAPHS = new Set([
                'braze-2026-trends',
                'ezra-eeman-wayfinder',
                'havas-media-trends',
                'publicis-sapient-next-graph',
            ]);
            const allGraphs = getLiveGraphs();
            const MAX_BRAND_FALLBACK_GRAPHS = 8; // Cap fan-out to prevent flooding API
            const graphsToSearch = graph_ids?.length
                ? allGraphs.filter(g => graph_ids.includes(g.graph_id))
                : allGraphs.filter(g => (g.graph_type === 'domain' || g.graph_type === 'expert') && !NO_BRAND_GRAPHS.has(g.graph_id) && !cypherGraphIds.has(g.graph_id)).slice(0, MAX_BRAND_FALLBACK_GRAPHS);

            if (graphsToSearch.length > 0) {
                const searchResults = await Promise.allSettled(
                    graphsToSearch.map(async (graph) => {
                        try {
                            const body = {
                                query: brandName,
                                limit: 10,
                                use_semantic: true,
                                include_evidence: includeEvidence,
                            };
                            const searchPromise = foddaRequest('POST', `/v1/graphs/${encodeURIComponent(graph.graph_id)}/search`, apiKey, resolveUserId(userId, uid), body);
                            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
                            const data = await Promise.race([searchPromise, timeoutPromise]);
                            const rows = Array.isArray(data) ? data : data?.rows || [];
                            return { graphId: graph.graph_id, graph, rows };
                        } catch {
                            return { graphId: graph.graph_id, graph, rows: [] };
                        }
                    })
                );

                for (const result of searchResults) {
                    if (result.status !== 'fulfilled') continue;
                    const { graphId, graph, rows } = result.value;
                    if (rows.length === 0) continue;

                    const graphName = buildDisplayName(graph);
                    const brandRows = rows.filter((row: any) => {
                        const nameMatch = (row.trendName || row.label || row.title || '').toLowerCase().includes(brandLower);
                        const descMatch = (row.trendDescription || row.description || row.summary || '').toLowerCase().includes(brandLower);
                        const brandNamesArr = typeof row.brandNames === 'string' ? row.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(row.brandNames) ? row.brandNames : []);
                        const brandNamesMatch = brandNamesArr.some((b: string) => b.toLowerCase().includes(brandLower));
                        const evidenceBrandMatch = (row.evidence || []).some((e: any) =>
                            (() => { const ebn = typeof e.brandNames === 'string' ? e.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(e.brandNames) ? e.brandNames : []); return ebn.some((b: string) => b.toLowerCase().includes(brandLower)); })() ||
                            (e.title || '').toLowerCase().includes(brandLower) ||
                            (e.snippet || e.summary || '').toLowerCase().includes(brandLower)
                        );
                        // Tier 1: Direct brand mention — high confidence
                        const directMatch = nameMatch || descMatch || brandNamesMatch || evidenceBrandMatch;
                        // Tier 2: Semantic relevance — the search used use_semantic:true,
                        // so high-scoring results are topically relevant even without a literal brand mention.
                        // This prevents discarding trends like "Closed-Loop Textiles" when searching for "Patagonia".
                        const semanticMatch = (row.signal_score || row.score || 0) >= 60;
                        if (!directMatch && !semanticMatch) return false;
                        // Tag row so competitor extraction only runs on direct matches
                        row._directBrandMatch = directMatch;
                        return true;
                    });

                    if (brandRows.length === 0) continue;

                    let graphEvCount = 0;
                    for (const row of brandRows) {
                        allTrends.push({
                            trend_name: row.trendName || row.label || row.title,
                            trend_description: row.trendDescription || row.description || row.summary || '',
                            graphId,
                            graphName,
                            signal_score: row.signal_score || null,
                            lifecycle: computeLifecycle(row),
                            momentum: computeMomentum(row),
                            evidence_count: row.evidence_count || row.evidenceCount || 0,
                            node_id: row.node_id || row.trendId,
                            _use_this_graphId: row._use_this_graphId || graphId,
                        });

                        if (includeEvidence && row.evidence) {
                            for (const ev of row.evidence) {
                                const evBrandsRaw = typeof ev.brandNames === 'string' ? ev.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(ev.brandNames) ? ev.brandNames : []);
                                const evText = `${ev.title || ''} ${ev.snippet || ev.summary || ''}`.toLowerCase();
                                const evMentionsBrand = evBrandsRaw.some((b: string) => b.toLowerCase().includes(brandLower)) || evText.includes(brandLower);
                                if (!evMentionsBrand) continue;

                                allEvidence.push({
                                    title: ev.title,
                                    excerpt: ev.snippet || ev.summary || '',
                                    source_url: ev.sourceUrl,
                                    image_url: ev.imageUrl || null,
                                    published_at: ev.publishedAt || null,
                                    category: ev.evidenceType || ev.contentType || ev.category || 'Case Study',
                                    place: ev.place || null,
                                    graphId,
                                    graphName,
                                    brands_mentioned: evBrandsRaw,
                                    linked_trend: row.trendName || row.label || row.title,
                                    formatted_citation: ev.formatted_citation || (ev.title && ev.sourceUrl ? `[${ev.title}](${ev.sourceUrl})` : ev.title || ''),
                                    speaker_name: ev.speakerName || ev.speaker_name || null,
                                    speaker_title: ev.speakerTitle || ev.speaker_title || null,
                                });
                                graphEvCount++;

                                // Only count competitors from DIRECT brand matches, not semantic matches
                                if (row._directBrandMatch) {
                                    for (const b of evBrandsRaw) {
                                        const bLower = b.toLowerCase();
                                        if (bLower !== brandLower && !bLower.includes(brandLower) && !brandLower.includes(bLower)) {
                                            if (graphId.includes('earnings') || graphId.includes('finance')) continue;
                                            competitorCounts[b] = (competitorCounts[b] || 0) + 1;
                                            if (!competitorGraphs[b]) competitorGraphs[b] = new Set();
                                            competitorGraphs[b].add(graphId);
                                        }
                                    }
                                }
                            }
                        }

                        // Only count trend-level brands as competitors for DIRECT brand matches
                        if (row._directBrandMatch) {
                            const rowBrands = typeof row.brandNames === 'string' ? row.brandNames.split('|').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(row.brandNames) ? row.brandNames : []);
                            for (const b of rowBrands) {
                                const bLower = b.toLowerCase();
                                if (bLower !== brandLower && !bLower.includes(brandLower) && !brandLower.includes(bLower)) {
                                    competitorCounts[b] = (competitorCounts[b] || 0) + 1;
                                    if (!competitorGraphs[b]) competitorGraphs[b] = new Set();
                                    competitorGraphs[b].add(graphId);
                                }
                            }
                        }
                    }

                    graphPresence[graphId] = {
                        graphId,
                        graphName,
                        graphType: graph.graph_type,
                        trendCount: brandRows.length,
                        evidenceCount: graphEvCount,
                    };
                }
            }
        }

        // Deduplicate trends
        const seenTrends = new Set<string>();
        const uniqueTrends = allTrends.filter(t => {
            const key = `${t.graphId}:${t.trend_name}`;
            if (seenTrends.has(key)) return false;
            seenTrends.add(key);
            return true;
        });
        uniqueTrends.sort((a, b) => (b.signal_score || 0) - (a.signal_score || 0));

        // Deduplicate, filter stale, and limit evidence
        const EVIDENCE_STALE_MONTHS = 18;
        const evidenceCutoff = new Date();
        evidenceCutoff.setMonth(evidenceCutoff.getMonth() - EVIDENCE_STALE_MONTHS);
        const seenEvidence = new Set<string>();
        const uniqueEvidence = allEvidence
            .filter(e => {
                const key = e.source_url || e.title;
                if (!key || seenEvidence.has(key)) return false;
                seenEvidence.add(key);
                // Drop evidence older than 18 months
                if (e.published_at) {
                    const d = new Date(e.published_at);
                    if (!isNaN(d.getTime()) && d < evidenceCutoff) return false;
                }
                return true;
            })
            .sort((a, b) => {
                const aDate = a.published_at ? new Date(a.published_at).getTime() : 0;
                const bDate = b.published_at ? new Date(b.published_at).getTime() : 0;
                return bDate - aDate;
            })
            .slice(0, maxEv * Math.max(Object.keys(graphPresence).length, 1));

        // Filter out platforms/marketplaces — these appear in evidence as channels, not competitors
        const PLATFORM_BLOCKLIST = new Set([
            'Meituan', 'Taobao', 'Alibaba', 'JD.com', 'Tmall', 'Pinduoduo', 'Shopee',
            'Amazon', 'eBay', 'Etsy', 'Shopify', 'Walmart', 'Target',
            'Google', 'Apple', 'Meta', 'Microsoft', 'OpenAI',
            'Instagram', 'TikTok', 'YouTube', 'Snapchat', 'Pinterest', 'X', 'Twitter', 'Reddit', 'Substack',
            'Spotify', 'Netflix', 'Disney+', 'Hulu',
            'Uber', 'Lyft', 'DoorDash', 'Instacart',
            'WeChat', 'WhatsApp', 'Telegram', 'LINE',
            'Stripe', 'PayPal', 'Square', 'Klarna',
        ]);
        const filteredCompetitorCounts = Object.fromEntries(
            Object.entries(competitorCounts).filter(([name]) => !PLATFORM_BLOCKLIST.has(name))
        );

        // Build competitive context — sort by shared DOMAIN graph overlap
        const brandGraphSet = new Set<string>(Object.keys(graphPresence));
        const domainGraphIds = new Set<string>(getDomainGraphIds());
        const competitors = Object.entries(filteredCompetitorCounts)
            .sort(([nameA, countA], [nameB, countB]) => {
                const aGraphs = competitorGraphs[nameA] ? [...competitorGraphs[nameA]] : [];
                const bGraphs = competitorGraphs[nameB] ? [...competitorGraphs[nameB]] : [];
                // Weight: domain graph overlap = 2 points, expert graph overlap = 1 point
                const scoreA = aGraphs.filter(g => brandGraphSet.has(g)).reduce((s, g) => s + (domainGraphIds.has(g) ? 2 : 1), 0);
                const scoreB = bGraphs.filter(g => brandGraphSet.has(g)).reduce((s, g) => s + (domainGraphIds.has(g) ? 2 : 1), 0);
                // Primary: weighted graph overlap score
                if (scoreB !== scoreA) return scoreB - scoreA;
                // Secondary: co-occurrence count
                return countB - countA;
            })
            .slice(0, 15)
            .map(([name, count]) => ({
                brand: name,
                co_occurrences: count,
                graphIds: competitorGraphs[name] ? [...competitorGraphs[name]] : [],
            }));

        const crossGraphPresence = Object.values(graphPresence)
            .sort((a, b) => b.evidenceCount - a.evidenceCount);

        // Activity timeline
        const quarterCounts: Record<string, number> = {};
        for (const ev of uniqueEvidence) {
            if (ev.published_at) {
                const d = new Date(ev.published_at);
                const q = `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
                quarterCounts[q] = (quarterCounts[q] || 0) + 1;
            }
        }
        const activityTimeline = Object.entries(quarterCounts)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([period, count]) => ({ period, count }));

        // Evidence by type
        const evidenceByType: Record<string, number> = {};
        for (const ev of uniqueEvidence) {
            const cat = ev.category || 'Case Study';
            evidenceByType[cat] = (evidenceByType[cat] || 0) + 1;
        }

        // Lifecycle distribution
        const lifecycleDist: Record<string, number> = {};
        for (const t of uniqueTrends) {
            lifecycleDist[t.lifecycle] = (lifecycleDist[t.lifecycle] || 0) + 1;
        }

        // Evidence velocity
        const sortedTimeline = [...activityTimeline].sort((a, b) => b.period.localeCompare(a.period));
        const currentQ = sortedTimeline[0]?.count || 0;
        const prevQ = sortedTimeline[1]?.count || 0;
        const velocityTrend = currentQ > prevQ ? 'accelerating' : currentQ === prevQ ? 'stable' : 'decelerating';

        // Build profile
        const profile = {
            brand: brandName,
            _data_source: usedCypherEndpoint ? 'cypher-single-query' : 'multi-graph-search',
            summary: {
                total_evidence_items: uniqueEvidence.length,
                total_trends_connected: uniqueTrends.length,
                graphs_present_in: crossGraphPresence.map(g => g.graphName),
                evidence_velocity: {
                    current_quarter: currentQ,
                    previous_quarter: prevQ,
                    trend: velocityTrend,
                },
                evidence_by_type: evidenceByType,
                lifecycle_distribution: lifecycleDist,
            },
            trend_footprint: uniqueTrends,
            evidence_items: includeEvidence ? uniqueEvidence : undefined,
            competitive_context: {
                co_occurring_brands: competitors,
                note: 'Brands that appear in the same evidence articles or trend contexts as ' + brandName,
            },
            cross_graph_presence: crossGraphPresence,
            activity_timeline: activityTimeline,
            _attribution: `Brand Intelligence Profile for ${brandName} — aggregated from ${crossGraphPresence.length} knowledge graph${crossGraphPresence.length !== 1 ? 's' : ''} on Fodda`,
            supplemental_signals: null as any,
            suggested_next_prompts: [
                {
                    label: `vs ${competitors[0]?.brand || 'competitors'}`,
                    prompt: `Compare ${brandName}'s innovation activity with ${competitors[0]?.brand || 'its top competitor'}. Which trends are they both pursuing and where do they diverge?`,
                    type: 'competitive_comparison',
                },
                {
                    label: 'Trend deep dive',
                    prompt: `Show me the evidence behind ${brandName}'s strongest trend: "${uniqueTrends[0]?.trend_name || 'top trend'}"`,
                    type: 'deeper_dive',
                },
                {
                    label: 'Market signals',
                    prompt: `Pull Google Trends and Amazon data for ${brandName} to validate the innovation signals from the knowledge graphs`,
                    type: 'supplemental_validation',
                },
            ].filter(p => uniqueTrends.length > 0),
            _render_instructions: buildRenderInstructions({
                hasWidget: true,
                hasPrompts: true,
                hasEvidence: uniqueEvidence.length > 0,
                graphWebpageUrls: collectGraphWebpageUrls(Object.keys(graphPresence)),
            }),
        };

        const topCompetitors = competitors.slice(0, 2).map(c => c.brand);
        const comparisonQuery = [brandName, ...topCompetitors].join(',');

        // Wikipedia disambiguation: map brand names to canonical article titles
        const wikiDisambig: Record<string, string> = { 'Nike': 'Nike, Inc.', 'Apple': 'Apple Inc.', 'Amazon': 'Amazon (company)', 'Meta': 'Meta Platforms', 'Target': 'Target Corporation' };
        const wikiArticles = [brandName, ...topCompetitors].map(b => wikiDisambig[b] || b).join(',');
        const [googleTrendsResult, wikipediaResult, amazonResult, beaResult, earningsResult] = await Promise.allSettled([
            foddaRequest('GET', `/v1/supplemental/google-trends?query=${encodeURIComponent(comparisonQuery)}&geo=US&timeframe=today+12-m`, apiKey, resolveUserId(userId, uid)),
            foddaRequest('GET', `/v1/supplemental/wikipedia/pageviews?articles=${encodeURIComponent(wikiArticles)}&period=monthly`, apiKey, resolveUserId(userId, uid)),
            amazonPromise,
            censusPromise,
            foddaRequest('GET', `/v1/supplemental/earnings/snapshot?brand=${encodeURIComponent(brandName)}&limit=5`, apiKey, resolveUserId(userId, uid)),
        ]);

        // Unwrap .snapshot nesting — supplemental API wraps actual data inside .snapshot alongside metadata
        const unwrapSnapshot = (raw: any) => raw?.snapshot || raw;
        profile.supplemental_signals = {
            google_trends: googleTrendsResult.status === 'fulfilled' ? unwrapSnapshot(googleTrendsResult.value) : null,
            wikipedia: wikipediaResult.status === 'fulfilled' ? unwrapSnapshot(wikipediaResult.value) : null,
            amazon: amazonResult.status === 'fulfilled' ? unwrapSnapshot(amazonResult.value) : null,
            census_retail: beaResult.status === 'fulfilled' ? unwrapSnapshot(beaResult.value) : null,
        };

        // ── Earnings Intelligence (for publicly traded brands) ──
        const earningsRaw = earningsResult.status === 'fulfilled' ? earningsResult.value : null;
        const earningsSnapshot = earningsRaw?.snapshot || earningsRaw;  // unwrap .snapshot if present
        const earningsItems = earningsSnapshot?.results || earningsSnapshot?.earnings || (Array.isArray(earningsSnapshot) ? earningsSnapshot : []);
        (profile as any).earningsIntelligence = earningsItems.length > 0 ? earningsItems : undefined;
        // Pass through truth-layer fields for brandTemplate.ts rendering
        (profile as any).earningsSource = earningsRaw?.earningsSource || (earningsSnapshot?.source === 'truth_layer' ? 'truth_layer' : undefined);
        (profile as any).earningsTruthLayer = earningsRaw?.earningsTruthLayer || earningsSnapshot?.truth_layer || undefined;
        (profile as any).validatedTrends = earningsRaw?.validatedTrends || earningsSnapshot?.validated_trends || undefined;
        (profile as any).analystQA = earningsRaw?.analystQA || undefined;

        const widget = await renderBrandWidget(profile);
        const EDITORIAL_INSTRUCTION = widget.open_slots.length === 0
            ? null
            : `── BRAND WIDGET: EDITORIAL SLOTS ──\nThe widget_html is mostly complete. Fill these remaining slot(s): ${widget.open_slots.join(', ')}\n\n${widget.open_slots.includes('ANALYSIS_HTML') ? '{{ANALYSIS_HTML}} — Write 3-5 paragraphs of strategic analysis using <p> tags. Cover: strongest signal and why, gaps or emerging opportunities, competitive positioning, and what to watch next. Use <strong> for key terms.' : ''}\n\nEDITORIAL CONTEXT:\n${JSON.stringify(widget.editorial_context, null, 2)}\n\nCRITICAL: ALL output must go INSIDE the widget slots. Do NOT redesign, restyle, or add new elements.\nAfter filling slots, pass the complete HTML to show_widget.\n`;

        storeWidget(widget.widget_html);

        return { profile, widget, EDITORIAL_INSTRUCTION };
    };

    // --- brand_tracker ---
    const handle_brand_tracker = async (args: any = {}) => {
        let { brand_name, userId: uid, graph_ids, include_evidence, max_evidence } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(brand_name, 'brand_tracker');

                // ── SPT pre-run coverage: refuse before spending compute if the token can't cover the task ──
                const guard = sptGuard('brand_intelligence');
                if (guard) return guard;

                const { widget, EDITORIAL_INSTRUCTION } = await executeBrandTracker(brand_name, uid, graph_ids, include_evidence, max_evidence);

                // ── Query-level billing (settlement gates delivery for SPT) ──
                const withheld = await settleOrWithhold({ queryTypeCode: 'brand_intelligence', apiKey, userId: resolveUserId(userId, uid), query: brand_name }, 'brand_tracker');
                if (withheld) return withheld;

                const content: Array<{ type: 'text'; text: string }> = [
                    { type: 'text' as const, text: widget.widget_html },
                ];
                if (EDITORIAL_INSTRUCTION) {
                    content.push({ type: 'text' as const, text: EDITORIAL_INSTRUCTION });
                }
                return { content };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };


    // Replaces 21 individual supplemental tools with a single call.
    // The API routes to 6-10 relevant sources based on query + domain,
    // queries them in parallel, and returns a consolidated response.
    // --- get_supplemental_context ---
    const handle_get_supplemental_context = async (args: any = {}) => {
        let { query, domain, geo, brands, graph_ids, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'supplemental_context');

                const body: Record<string, any> = { query };
                if (domain) body.domain = domain;
                if (geo) body.geo = geo;
                if (brands?.length) body.brands = brands;
                if (graph_ids?.length) body.graph_ids = graph_ids;

                const jobId = crypto.randomUUID();
                activeSupplementalJobs.set(jobId, { status: 'RUNNING', result: null, error: null });

                // Run fetch in the background
                (async () => {
                    try {
                        const data = await foddaRequest('POST', '/v1/supplemental/context', apiKey, resolveUserId(userId, uid), body);
                        
                        // ── Query-level billing ──
                        chargeQuery({ queryTypeCode: 'standalone_supplemental', apiKey, userId: resolveUserId(userId, uid), query, foddaRequest, spt: sptCtx?.token })
                            .catch(e => console.error('[supplemental] chargeQuery failed:', e.message));

                        activeSupplementalJobs.set(jobId, { status: 'COMPLETE', result: JSON.stringify(data, null, 2) });
                    } catch (err: any) {
                        const errMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Unknown error';
                        activeSupplementalJobs.set(jobId, { status: 'FAILED', error: errMsg });
                    }
                })();

                return {
                    content: [{
                        type: 'text' as const,
                        text: `Supplemental data gathering started! The server is collecting context from up to 15 external sources in parallel. Job ID: ${jobId}\n\nIMPORTANT: You must use the check_supplemental_status tool with this Job ID to poll the status of the job and retrieve the data. Wait about 5-10 seconds before your first poll.`
                    }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // --- check_supplemental_status ---
    const handle_check_supplemental_status = async (args: any = {}) => {
        let { job_id } = args;
            const job = activeSupplementalJobs.get(job_id);
            if (!job) {
                return { isError: true, content: [{ type: 'text' as const, text: `Job ID ${job_id} not found. It may have expired or never existed.` }] };
            }

            if (job.status === 'RUNNING') {
                return { content: [{ type: 'text' as const, text: `Job ${job_id} is still RUNNING. The server is waiting on external APIs. Please poll again in 5 seconds.` }] };
            }

            if (job.status === 'FAILED') {
                activeSupplementalJobs.delete(job_id); // cleanup
                return { isError: true, content: [{ type: 'text' as const, text: `Job ${job_id} FAILED: ${job.error}` }] };
            }

            if (job.status === 'COMPLETE') {
                activeSupplementalJobs.delete(job_id); // cleanup
                return { content: [{ type: 'text' as const, text: job.result }] };
            }

            return { isError: true, content: [{ type: 'text' as const, text: `Unknown status for job ${job_id}` }] };
        };

    // Searches ALL PSFK curated domain graphs in parallel. Returns trends + bundled evidence.
    // --- get_domain_intelligence ---
    const handle_get_domain_intelligence = async (args: any = {}) => {
        let { query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid } = args;
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'domain_intelligence');

                const data = await foddaRequest('POST', '/v1/search/domain', apiKey, resolveUserId(userId, uid), body);
                const domainWithheld = await settleOrWithhold({ queryTypeCode: 'domain_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_domain_intelligence');
                if (domainWithheld) return domainWithheld;

                const searchedGraphs = getLiveGraphs().filter(g => g.graph_type === 'domain');
                const annotatedData = addCoverageAnnotation(data, query, searchedGraphs, limit);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'get_domain_intelligence', query, annotatedData?.coverage);
                logQueryResult(query, 'domain_intelligence', annotatedData?.coverage, searchedGraphs);
                if (annotatedData?.coverage?.status === 'error' || annotatedData?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // Searches ALL expert specialist graphs in parallel.
    // --- get_expert_intelligence ---
    const handle_get_expert_intelligence = async (args: any = {}) => {
        let { query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid } = args;
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'expert_intelligence');

                const data = await foddaRequest('POST', '/v1/search/expert', apiKey, resolveUserId(userId, uid), body);
                const expertWithheld = await settleOrWithhold({ queryTypeCode: 'expert_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_expert_intelligence');
                if (expertWithheld) return expertWithheld;

                const searchedGraphs = getLiveGraphs().filter(g => g.graph_type === 'expert' || g.graph_type === 'industry report');
                const annotatedData = addCoverageAnnotation(data, query, searchedGraphs, limit);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'get_expert_intelligence', query, annotatedData?.coverage);
                logQueryResult(query, 'expert_intelligence', annotatedData?.coverage, searchedGraphs);
                if (annotatedData?.coverage?.status === 'error' || annotatedData?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // Searches ALL industry report graphs in parallel.
    // --- get_report_intelligence ---
    const handle_get_report_intelligence = async (args: any = {}) => {
        let { query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid } = args;
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'report_intelligence');

                const data = await foddaRequest('POST', '/v1/search/report', apiKey, resolveUserId(userId, uid), body);
                const reportWithheld = await settleOrWithhold({ queryTypeCode: 'report_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_report_intelligence');
                if (reportWithheld) return reportWithheld;

                const searchedGraphs = getLiveGraphs().filter(g => g.graph_type === 'industry report');
                const annotatedData = addCoverageAnnotation(data, query, searchedGraphs, limit);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'get_report_intelligence', query, annotatedData?.coverage);
                logQueryResult(query, 'report_intelligence', annotatedData?.coverage, searchedGraphs);
                if (annotatedData?.coverage?.status === 'error' || annotatedData?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };


    // --- search_statistics ---
    const handle_search_statistics = async (args: any = {}) => {
        let { graph_id, query, limit, min_score, include_signals, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'search_statistics', graph_id);

                const params = new URLSearchParams();
                params.set('query', query);
                if (limit !== undefined) params.set('limit', String(limit));
                if (min_score !== undefined) params.set('min_score', String(min_score));
                if (include_signals) params.set('include_signals', 'true');
                const path = `/v1/graphs/${graph_id}/statistics?${params.toString()}`;
                const data = await foddaRequest('GET', path, apiKey, resolveUserId(userId, uid));
                // Inject theme block for visualization branding
                if (data && typeof data === 'object') {
                    data.theme = getFoddaTheme(graph_id);
                }
                const statsWithheld = await settleOrWithhold({ queryTypeCode: 'standalone_statistics', apiKey, userId: resolveUserId(userId, uid), query }, 'search_statistics');
                if (statsWithheld) return statsWithheld;

                const searchedGraphs = [getGraphs().find(g => g.graph_id === graph_id)].filter(Boolean);
                const annotatedData = addCoverageAnnotation(data, query, searchedGraphs, limit, true);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'search_statistics', query, annotatedData?.coverage);
                logQueryResult(query, 'search_statistics', annotatedData?.coverage, searchedGraphs);
                if (annotatedData?.coverage?.status === 'error' || annotatedData?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // --- search_insights ---
    const handle_search_insights = async (args: any = {}) => {
        let { graph_id, query, types, limit, min_score, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'search_insights', graph_id);

                const searchTypes = types || 'quote,interpretation';
                const params = new URLSearchParams();
                params.set('query', query);
                params.set('types', searchTypes);
                if (limit !== undefined) params.set('limit', String(limit));
                if (min_score !== undefined) params.set('min_score', String(min_score));
                const path = `/v1/graphs/${graph_id}/statistics?${params.toString()}`;
                const data = await foddaRequest('GET', path, apiKey, resolveUserId(userId, uid));
                const insightsWithheld = await settleOrWithhold({ queryTypeCode: 'standalone_insights', apiKey, userId: resolveUserId(userId, uid), query }, 'search_insights');
                if (insightsWithheld) return insightsWithheld;

                const searchedGraphs = [getGraphs().find(g => g.graph_id === graph_id)].filter(Boolean);
                const annotatedData = addCoverageAnnotation(data, query, searchedGraphs, limit, true);
                sessionTracker.postGapToSlack(resolveUserId(userId, uid), 'search_insights', query, annotatedData?.coverage);
                logQueryResult(query, 'search_insights', annotatedData?.coverage, searchedGraphs);
                if (annotatedData?.coverage?.status === 'error' || annotatedData?.error) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(annotatedData, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };


    // LinkedIn content tools — thin heads on the shared evidence engine
    // (src/linkedinEngine.ts). Server curates, client composes. The pack +
    // composition contract is the product; NO finished text is generated here.

    /** Shared handler body for both LinkedIn tool heads. */
    const runLinkedInHead = async (
        toolName: 'draft_linkedin_post' | 'draft_linkedin_article',
        queryTypeCode: 'linkedin_post' | 'linkedin_article',
        engineOpts: Parameters<typeof buildEvidencePack>[1],
        uid: string | undefined,
    ) => {
        try {
            logUserQuery(engineOpts.topic, queryTypeCode);

            // SPT pre-run coverage: refuse before spending compute
            const guard = sptGuard(queryTypeCode);
            if (guard) return guard;

            const pack = await buildEvidencePack(
                { foddaRequest, apiKey, userId: resolveUserId(userId, uid) },
                engineOpts,
            );

            // Metered as ONE content call per unique request (settlement gates
            // delivery for SPT). Identical-request cache hits within 24h are
            // FREE — you never pay twice for the same answer. Retry/iterate
            // friendly and un-farmable: any change to topic/angle/voice/brand/
            // sub-themes is a different cache key → fresh retrieval → billed.
            const cacheHit = (pack as any)?._cache?.hit === true;
            if (!cacheHit) {
                const withheld = await settleOrWithhold({ queryTypeCode, apiKey, userId: resolveUserId(userId, uid), query: engineOpts.topic }, toolName);
                if (withheld) return withheld;
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(pack, null, 2) }] };
        } catch (err: any) {
            // ── Explicit quota state: refuse to compose from a starved pack ──
            // The engine aborts the whole run the moment ANY retrieval call hits
            // CREDITS_EXHAUSTED / PLAN_LIMIT_EXCEEDED — no evidence pack exists,
            // so nothing thin or padded can ever reach the client model.
            if (err instanceof QuotaExhaustedError) {
                const refusal = {
                    type: 'text' as const,
                    text: `LINKEDIN_DRAFT_REFUSED: evidence retrieval hit the account's quota limit mid-run. No evidence pack was produced — do NOT draft a ${engineOpts.mode} from partial or remembered data. Resolve the quota state below, then call ${toolName} again.`,
                };
                const trialResult = await handleTrialCreditExhaustion(err.causeErr, apiKey, userId);
                if (trialResult) return { ...trialResult, content: [refusal, ...trialResult.content] };
                const accessResult = await handleAccessError(err.causeErr, toolName, userId, apiKey);
                return { ...accessResult, content: [refusal, ...accessResult.content] };
            }
            const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
            if (trialResult) return trialResult;
            const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
            return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
        }
    };

    // --- draft_linkedin_post ---
    const handle_draft_linkedin_post = async (args: any = {}) => {
        let { topic, angle, voice, sub_themes, brand, userId: uid } = args;
            runLinkedInHead('draft_linkedin_post', 'linkedin_post', {
                mode: 'post', topic, angle, voice, brand, subThemes: sub_themes,
            }, uid)
    };

    // --- draft_linkedin_article ---
    const handle_draft_linkedin_article = async (args: any = {}) => {
        let { topic, thesis, voice, target_length, sub_themes, brand, userId: uid } = args;
            runLinkedInHead('draft_linkedin_article', 'linkedin_article', {
                mode: 'article', topic, angle: thesis, voice, brand, subThemes: sub_themes, targetLengthWords: target_length,
            }, uid)
    };

    // Cross-company and industry-level earnings call intelligence.
    // For single-brand earnings, brand_tracker already includes earningsIntelligence.
    // This tool is for: multi-company comparisons, industry/sector filters, and explicit earnings queries.
    // --- get_earnings_intelligence ---
    const handle_get_earnings_intelligence = async (args: any = {}) => {
        let { ticker, brand, industry, sector, search, dateFrom, dateTo, limit, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(search || brand || ticker || industry || sector || 'earnings snapshot', 'earnings_intelligence');

                const params = new URLSearchParams();
                if (ticker) params.set('ticker', ticker);
                if (brand) params.set('brand', brand);
                if (industry) params.set('industry', industry);
                if (sector) params.set('sector', sector);
                if (search) params.set('search', search);
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (limit !== undefined) params.set('limit', String(Math.min(limit, 50)));

                const qs = params.toString();
                const earningsGuard = sptGuard('earnings_intelligence');
                if (earningsGuard) return earningsGuard;

                const data = await foddaRequest('GET', `/v1/supplemental/earnings/snapshot${qs ? '?' + qs : ''}`, apiKey, resolveUserId(userId, uid));

                // ── Query-level billing (settlement gates delivery for SPT) ──
                const earningsWithheld = await settleOrWithhold({ queryTypeCode: 'earnings_intelligence', apiKey, userId: resolveUserId(userId, uid), query: search || brand || ticker || sector || '' }, 'get_earnings_intelligence');
                if (earningsWithheld) return earningsWithheld;

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };


    // Gaps between what analysts are concerned about and how management responds.
    // This is premium intelligence — surfaces deflection and narrative mismatches.
    // --- get_earnings_divergence ---
    const handle_get_earnings_divergence = async (args: any = {}) => {
        let { sector, industry, search, dateFrom, dateTo, limit, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(search || sector || industry || 'earnings divergence', 'earnings_divergence');

                const params = new URLSearchParams();
                if (sector) params.set('sector', sector);
                if (industry) params.set('industry', industry);
                if (search) params.set('search', search);
                if (dateFrom) params.set('dateFrom', dateFrom);
                if (dateTo) params.set('dateTo', dateTo);
                if (limit !== undefined) params.set('limit', String(Math.min(limit, 25)));

                const qs = params.toString();
                const divergenceGuard = sptGuard('earnings_intelligence');
                if (divergenceGuard) return divergenceGuard;

                const data = await foddaRequest('GET', `/v1/supplemental/earnings/divergence${qs ? '?' + qs : ''}`, apiKey, resolveUserId(userId, uid));

                // ── Query-level billing (settlement gates delivery for SPT) ──
                const divergenceWithheld = await settleOrWithhold({ queryTypeCode: 'earnings_intelligence', apiKey, userId: resolveUserId(userId, uid), query: search || sector || industry || 'divergence' }, 'get_earnings_divergence');
                if (divergenceWithheld) return divergenceWithheld;

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // Per-ticker earnings intelligence: SWOT scores, sentiment, guidance, Q&A, competitive analysis.
    // One tool with a `view` parameter — not 5 separate tools (context budget).
    // --- get_company_earnings ---
    const handle_get_company_earnings = async (args: any = {}) => {
        let { mode, view, ticker, tickers, period, metrics, analyst, sector, userId: uid } = args;
            const effectiveView = mode || view || 'snapshot';
            try {
                logUserQuery(ticker || tickers || sector || view || 'company earnings', 'earnings_company');

                // ── Validation: require params per view ──
                if ((effectiveView === 'snapshot' || effectiveView === 'history' || effectiveView === 'qa') && !ticker) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MISSING_PARAM', message: `The "${effectiveView}" view requires a ticker parameter (e.g. ticker: "NKE").` }) }] };
                }
                if (effectiveView === 'compare' && !tickers) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MISSING_PARAM', message: 'The "compare" view requires a tickers parameter with 2-5 comma-separated ticker symbols (e.g. tickers: "NKE,LULU,ONON").' }) }] };
                }

                // ── Route to API endpoint per view ──
                let path: string;
                let queryTypeCode: string;

                switch (effectiveView) {
                    case 'snapshot': {
                        const params = new URLSearchParams();
                        if (period) params.set('period', period);
                        const qs = params.toString();
                        path = `/v1/earnings/company/${encodeURIComponent(ticker!)}${qs ? '?' + qs : ''}`;
                        queryTypeCode = 'earnings_company';
                        break;
                    }
                    case 'history': {
                        const params = new URLSearchParams();
                        if (metrics) params.set('metrics', metrics);
                        const qs = params.toString();
                        path = `/v1/earnings/company/${encodeURIComponent(ticker!)}/history${qs ? '?' + qs : ''}`;
                        queryTypeCode = 'earnings_history';
                        break;
                    }
                    case 'qa': {
                        const params = new URLSearchParams();
                        if (period) params.set('period', period);
                        if (analyst) params.set('analyst', analyst);
                        const qs = params.toString();
                        path = `/v1/earnings/company/${encodeURIComponent(ticker!)}/qa${qs ? '?' + qs : ''}`;
                        queryTypeCode = 'earnings_qa';
                        break;
                    }
                    case 'compare': {
                        const params = new URLSearchParams();
                        params.set('tickers', tickers!);
                        if (period) params.set('period', period);
                        path = `/v1/earnings/compare?${params.toString()}`;
                        queryTypeCode = 'earnings_compare';
                        break;
                    }
                    case 'coverage': {
                        // Free endpoint — no billing
                        const data = await foddaRequest('GET', '/v1/earnings/coverage', apiKey, resolveUserId(userId, uid));
                        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
                    }
                    default:
                        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: 'INVALID_VIEW', message: `Unknown view "${view}". Valid views: snapshot, history, qa, compare, guidance, coverage.` }) }] };
                }

                // ── SPT pre-check ──
                const guard = sptGuard(queryTypeCode);
                if (guard) return guard;

                // ── API call ──
                const data = await foddaRequest('GET', path, apiKey, resolveUserId(userId, uid));

                // ── Settlement ──
                const withheld = await settleOrWithhold({ queryTypeCode, apiKey, userId: resolveUserId(userId, uid), query: ticker || tickers || sector || view }, 'get_company_earnings');
                if (withheld) return withheld;

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // --- get_validated_trends ---
    const handle_get_validated_trends = async (args: any = {}) => {
        let { ticker, sector, search, limit, userId: uid } = args;
            try {
                logUserQuery(search || ticker || sector || 'validated trends', 'get_validated_trends');
                const params = new URLSearchParams();
                if (ticker) params.set('ticker', ticker);
                if (sector) params.set('sector', sector);
                if (search) params.set('search', search);
                if (limit !== undefined) params.set('limit', String(Math.min(limit, 50)));

                const qs = params.toString();
                const guard = sptGuard('earnings_intelligence');
                if (guard) return guard;

                const data = await foddaRequest('GET', `/v1/earnings/validated-trends${qs ? '?' + qs : ''}`, apiKey, resolveUserId(userId, uid));

                const withheld = await settleOrWithhold({ queryTypeCode: 'earnings_intelligence', apiKey, userId: resolveUserId(userId, uid), query: search || ticker || sector || 'validated_trends' }, 'get_validated_trends');
                if (withheld) return withheld;

                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental', userId, apiKey);
            }
        };

    // --- update_user_profile ---
    const handle_update_user_profile = async (args: any = {}) => {
        let { userContext, accountContext } = args;
            try {
                const body: Record<string, string> = {};
                if (userContext) body.userContext = String(userContext).slice(0, 2000);
                if (accountContext) body.accountContext = String(accountContext).slice(0, 2000);

                await foddaRequest('POST', '/v1/user/context', apiKey, userId, body);

                console.error(`[update_user_profile] Profile saved for ${userId}: userContext=${(userContext || '').length} chars, accountContext=${(accountContext || '').length} chars`);

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'SAVED',
                            message: 'Research profile updated. Future sessions will use this context to personalize responses.',
                        }, null, 2)
                    }]
                };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                console.error(`[update_user_profile] Error: ${msg}`);
                // Fail gracefully — don't break the conversation
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'ERROR',
                            message: 'Could not save profile right now. I\'ll use this context for the current session.',
                            error: msg,
                        }, null, 2)
                    }]
                };
            }
        };

    // --- toggle_graph_preference ---
    const handle_toggle_graph_preference = async (args: any = {}) => {
        let { target_id, enabled, user_email } = args;
            try {
                const body: any = { target_id, enabled };
                if (user_email) body.user_email = user_email;
                
                const result = await foddaRequest('POST', '/v1/user/preferences/toggle', apiKey, userId, body);
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'SUCCESS',
                            message: `Successfully ${enabled ? 'enabled' : 'disabled'} ${target_id}.`,
                            disabled_graphs: result.disabled_graphs || [],
                        }, null, 2)
                    }]
                };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'ERROR',
                            message: `Failed to ${enabled ? 'enable' : 'disable'} ${target_id}.`,
                            error: msg,
                        }, null, 2)
                    }]
                };
            }
        };

    const FEEDBACK_CATEGORY_EMOJI: Record<string, string> = {
        feedback: '💬',
        bug: '🐛',
        feature_request: '✨',
        exit_reason: '🚪',
        complaint: '😤',
    };

    // --- send_feedback ---
    const handle_send_feedback = async (args: any = {}) => {
        let { feedback, user_email, category, recent_prompt } = args;
            try {
                const userLabel = user_email || (userId !== 'anonymous' ? userId : 'anonymous trial user');
                const entryLabel = entryId ? ` (entry: ${entryId})` : '';
                const catLabel = category || 'general';
                const emoji = FEEDBACK_CATEGORY_EMOJI[catLabel] || '💬';

                // Record in local telemetry feedback buffer
                recordFeedbackEntry(catLabel, feedback, userLabel);

                // ── Slack alert (fire-and-forget) ──
                const slackLines = [
                    `<@U0AU49JG7AS> ${emoji} *User Feedback*`,
                    `👤 ${userLabel}`,
                    `📁 Category: ${catLabel}`,
                    `📝 ${feedback}`,
                ];
                if (recent_prompt) {
                    slackLines.push(`❓ *Prompt Context:* ${recent_prompt}`);
                }
                slackLines.push(`→ Check if this needs a response or product action.`);
                postToSlack(slackLines.join('\n')).catch(() => {});

                // ── Resend email ──
                const resendKey = process.env.RESEND_API_KEY;
                if (!resendKey) {
                    console.error('[send_feedback] RESEND_API_KEY not set — logging feedback locally');
                    console.error(`[FEEDBACK] category=${catLabel} email=${userLabel} feedback=${feedback}${recent_prompt ? ` prompt=${recent_prompt}` : ''}`);
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({ status: 'LOGGED', message: 'Thank you — your feedback has been recorded.' })
                        }]
                    };
                }

                const { Resend } = await import('resend');
                const resend = new Resend(resendKey);

                const subject = `[Fodda MCP Feedback] ${catLabel} from ${userLabel}`;

                await resend.emails.send({
                    from: 'Fodda MCP <feedback@fodda.ai>',
                    to: ['piers.fawkes@psfk.com'],
                    cc: ['team@fodda.ai'],
                    subject,
                    text: [
                        `Category: ${catLabel}`,
                        `User: ${userLabel}${entryLabel}`,
                        `Prompt Context: ${recent_prompt || 'N/A'}`,
                        `API Key: ${apiKey.substring(0, 15)}...`,
                        `Date: ${new Date().toISOString()}`,
                        '',
                        'Feedback:',
                        feedback,
                    ].join('\n'),
                });

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ status: 'SENT', message: 'Your feedback has been sent to the Fodda team. Thank you.' })
                    }]
                };
            } catch (err: any) {
                console.error('[send_feedback] Error:', err.message);
                // Still log it even if sending fails
                console.error(`[FEEDBACK-FALLBACK] category=${category || 'general'} feedback=${feedback}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ status: 'LOGGED', message: 'Thank you — your feedback has been recorded.' })
                    }]
                };
            }
        };

    const APP_BASE_URL = process.env.FODDA_APP_URL || 'https://app.fodda.ai';
    // --- sign_up_free_account ---
    const handle_sign_up_free_account = async (args: any = {}) => {
        let { email, user_confirmed, name, job_title, company } = args;
            if (!user_confirmed) {
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: JSON.stringify({ error: 'user_confirmed must be true — only call this tool after the user has explicitly asked to create an account.' }) }],
                };
            }
            try {
                // Derive firstName from name or email prefix
                const firstName: string = name
                    ? (name.split(' ')[0] || name)
                    : (email.split('@')[0] || 'User').replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

                const convertBody: Record<string, string> = {
                    email,
                    trialKey: apiKey,  // the trial key that brought them in
                    firstName,
                };

                const response = await axios.post(
                    `${APP_BASE_URL}/api/account/trial-convert`,
                    convertBody,
                    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
                );

                if (response.data?.ok && !response.data?.alreadyExists) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                status: 'UPGRADED',
                                message: `I've created your Base account — you'll get ${response.data.monthlyTokens || 100} API calls/month. Check your email to confirm and then log in at https://app.fodda.ai to grab your MCP URL and update your connector.`,
                                plan: response.data.plan || 'Base',
                                monthly_api_call_limit: response.data.monthlyTokens || 100,
                                graphId: response.data.graphId || null,
                                accountId: response.data.accountId || null,
                            }, null, 2)
                        }]
                    };
                }

                if (response.data?.alreadyExists) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                status: 'EXISTING_ACCOUNT',
                                message: `An account with ${email} already exists. Log in at https://app.fodda.ai to grab your MCP URL and update your connector.`,
                            }, null, 2)
                        }]
                    };
                }

                // Unexpected response
                return {
                    isError: true,
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ error: response.data?.message || 'Account creation failed. Please try again or visit https://app.fodda.ai' })
                    }]
                };
            } catch (err: any) {
                const msg = err.response?.data?.message || err.message || 'Account creation failed.';
                console.error('[sign_up_free_account] Error:', msg);
                return {
                    isError: true,
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            error: msg,
                            fallback: 'You can also sign up at https://app.fodda.ai to continue using Fodda.'
                        })
                    }]
                };
            }
        };

    // Fourth MCP orchestration flow: Graph-native ideation via neighbor traversal.
    // Uses get_neighbors as the core mechanism to discover unexpected connections,
    // adjacent territories, and cross-domain links that text search wouldn't surface.
    // --- brainstorm_topic ---
    const handle_brainstorm_topic = async (args: any = {}) => {
        let { query, depth, userId: uid } = args;
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'brainstorm_topic');

                const resolvedUserId = resolveUserId(userId, uid);
                const traversalDepth = Math.min(depth || 2, 2);

                // ── Step 1: Find seed trends across all relevant graphs ──
                const relevantGraphs = getRelevantGraphs(query);
                const graphIdsToSearch = relevantGraphs.slice(0, 4).map(g => g.graph.graph_id);

                // Search up to 4 graphs in parallel for seed trends
                const searchPromises = graphIdsToSearch.map(async (gid) => {
                    try {
                        const body = { query, limit: 5, use_semantic: true, include_evidence: false };
                        const res = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(gid)}/search`, apiKey, resolvedUserId, body);
                        return (res?.rows || []).map((r: any) => ({ ...r, _source_graph: gid }));
                    } catch { return []; }
                });

                const allResults = (await Promise.all(searchPromises)).flat();

                if (allResults.length === 0) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                query,
                                status: 'no_seeds',
                                message: `Fodda's knowledge graphs don't have strong coverage on "${query}" yet. Try a broader topic or different angle.`,
                                suggested_alternatives: [
                                    `Try broader: "${query.split(' ')[0]} trends"`,
                                    `Try adjacent: "innovation in ${query}"`,
                                ]
                            }, null, 2)
                        }]
                    };
                }

                // Take top 5 unique trends as seeds (deduplicated by title)
                const seen = new Set<string>();
                const seeds: any[] = [];
                for (const r of allResults.sort((a: any, b: any) => (b.score || 0) - (a.score || 0))) {
                    const key = (r.title || r.trendName || '').toLowerCase();
                    if (!seen.has(key) && seeds.length < 5) {
                        seen.add(key);
                        seeds.push(r);
                    }
                }

                // ── Step 2: Discover adjacent trends via semantic similarity ──
                // Uses /adjacent (pre-computed SEMANTICALLY_SIMILAR edges) instead of
                // /neighbors (relationship traversal) because expert graphs have flat
                // structures with no inter-node relationships.
                const adjacentPromises = seeds.map(async (seed) => {
                    const graphId = seed._use_this_graphId || seed._source_graph;
                    const nodeId = seed.node_id || seed.trendId;
                    if (!graphId || !nodeId) return { seed, adjacent: [] };

                    try {
                        const params = new URLSearchParams({
                            node_id: String(nodeId),
                            min_score: '0.70',
                            limit: '15',
                            include_editorial: 'true',
                            cross_graph: 'true',  // Option B: discover trends from ANY graph
                        });
                        const res = await foddaRequest('GET', `/v1/graphs/${encodeURIComponent(graphId)}/adjacent?${params.toString()}`, apiKey, resolvedUserId);
                        return { seed, graphId, adjacent: res?.adjacent || [] };
                    } catch { return { seed, graphId, adjacent: [] }; }
                });

                const adjacentResults = await Promise.all(adjacentPromises);

                // ── Step 3: Cluster discoveries ──
                const adjacentTrends = new Map<string, any>();
                const brands = new Map<string, { name: string, connections: string[] }>();
                const locations = new Map<string, { name: string, connections: string[] }>();
                const seedTitles = new Set(seeds.map(s => (s.title || s.trendName || '').toLowerCase()));

                for (const { seed, adjacent } of adjacentResults) {
                    const seedTitle = seed.title || seed.trendName || 'Unknown';

                    for (const node of adjacent) {
                        const name = node.trendName || node.name || node.title || '';
                        const nameKey = name.toLowerCase();

                        if (!name || seedTitles.has(nameKey)) continue;

                        if (!adjacentTrends.has(nameKey)) {
                            adjacentTrends.set(nameKey, {
                                name,
                                node_id: node.node_id || node.trendId,
                                graph_id: node.vertical || node.graph_id,
                                score: node.similarity || node.score,
                                relationship: node.editoriallyLinked ? 'EDITORIALLY_LINKED' : 'SEMANTICALLY_SIMILAR',
                                connected_to: seedTitle,
                                description: node.description || node.summary || '',
                                cross_graph: node.vertical !== (seed._use_this_graphId || seed._source_graph),
                            });
                        }
                    }
                }

                // ── Step 4: Build suggested next prompts from graph connections ──
                const topAdjacent = [...adjacentTrends.values()].slice(0, 10);
                const topBrands = [...brands.values()]
                    .sort((a, b) => b.connections.length - a.connections.length)
                    .slice(0, 8);
                const topLocations = [...locations.values()]
                    .sort((a, b) => b.connections.length - a.connections.length)
                    .slice(0, 5);

                // Generate graph-powered follow-up prompts
                const suggestedPrompts: string[] = [];
                if (topAdjacent.length > 0) {
                    const surprise = topAdjacent.find(t => t.relationship === 'SEMANTICALLY_SIMILAR') || topAdjacent[0];
                    suggestedPrompts.push(`How does "${query}" connect to "${surprise.name}"?`);
                }
                if (topBrands.length >= 2) {
                    suggestedPrompts.push(`What are ${topBrands[0]!.name} and ${topBrands[1]!.name} doing in ${query}?`);
                }
                if (topAdjacent.length > 2) {
                    suggestedPrompts.push(`Deep research: ${query} and ${topAdjacent[1].name}`);
                }
                if (topLocations.length > 0) {
                    suggestedPrompts.push(`What's happening with ${query} in ${topLocations[0]!.name}?`);
                }
                if (topAdjacent.length > 4) {
                    suggestedPrompts.push(`Brainstorm: ${topAdjacent[3].name}`);
                }

                // ── Step 5: Assemble brainstorm map ──
                const brainstormMap = {
                    query,
                    status: 'brainstorm_complete',
                    _generated_by: 'brainstorm_topic',
                    traversal_depth: traversalDepth,

                    seed_trends: seeds.map(s => ({
                        name: s.title || s.trendName,
                        graph: s._use_this_graphId || s._source_graph,
                        signal_score: s.signal_score || s.score,
                        node_id: s.node_id || s.trendId,
                        lifecycle: s.trendLifecycle || s.lifecycle,
                    })),

                    adjacent_territories: topAdjacent.map(t => ({
                        name: t.name,
                        relationship: t.relationship,
                        connected_to: t.connected_to,
                        description: t.description,
                        graph_id: t.graph_id,
                        node_id: t.node_id,
                    })),

                    key_brands: topBrands.map(b => ({
                        name: b.name,
                        appears_in: b.connections,
                        cross_trend: b.connections.length > 1,
                    })),

                    geographic_hotspots: topLocations.map(l => ({
                        location: l.name,
                        connected_to: l.connections,
                    })),

                    brainstorm_stats: {
                        seeds_found: seeds.length,
                        graphs_searched: graphIdsToSearch.length,
                        adjacent_trends_discovered: adjacentTrends.size,
                        brands_identified: brands.size,
                        locations_identified: locations.size,
                    },

                    suggested_next_prompts: suggestedPrompts,

                    _presentation_hint: 'Present as a brainstorm map. Center: the query. First ring: seed trends. Second ring: adjacent territories. Highlight cross-trend brands and unexpected connections. Suggest follow-up explorations.',
                };

                // ── Query-level billing ──
                chargeQuery({ queryTypeCode: 'brainstorm', apiKey, userId: resolveUserId(userId, uid), query, foddaRequest, spt: sptCtx?.token })
                    .catch(e => console.error('[brainstorm] chargeQuery failed:', e.message));

                return { content: [{ type: 'text' as const, text: JSON.stringify(brainstormMap, null, 2) }] };
            } catch (err: any) {
                const msg = err.message || 'Brainstorm execution failed.';
                console.error('[brainstorm_topic] Error:', msg);
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- generate_visual ---
    const handle_generate_visual = async (args: any = {}) => {
        let { chart_type, data } = args;
            try {
                const { renderCulturalShifts, renderCompetitiveCompass, renderTrendConstellation, renderImplicationLadder, renderInnovationPathway, renderWhiteSpaceMap } = await import('./svgVisuals.js');
                const parsed = JSON.parse(data);
                let svg = '';

                switch (chart_type) {
                    case 'cultural_shifts':
                        svg = renderCulturalShifts(parsed.shifts || parsed);
                        break;
                    case 'competitive_compass':
                        svg = renderCompetitiveCompass(parsed.brands || parsed, parsed.axes || { left: 'Traditional', right: 'Innovative', top: 'Premium', bottom: 'Mass' });
                        break;
                    case 'trend_constellation':
                        svg = renderTrendConstellation(parsed.trends || parsed, parsed.connections || []);
                        break;
                    case 'implication_ladder':
                        svg = renderImplicationLadder(parsed);
                        break;
                    case 'innovation_pathway':
                        svg = renderInnovationPathway(parsed);
                        break;
                    case 'opportunity_map':
                        svg = renderWhiteSpaceMap(parsed.items || parsed, parsed.x_label, parsed.y_label);
                        break;
                }

                if (!svg) {
                    return { isError: true, content: [{ type: 'text' as const, text: 'Failed to generate visual. Check data format.' }] };
                }

                return {
                    content: [{
                        type: 'text' as const,
                        text: svg
                    }]
                };
            } catch (err: any) {
                console.error('[generate_visual] Error:', err.message);
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }] };
            }
        };

    // --- manage_scheduled_reports ---
    const handle_manage_scheduled_reports = async (args: any = {}) => {
        let { action, query, email, slack_webhook, graphs, schedule_id, cadence, timezone, report_type, brands } = args;
            try {
                if (action === 'create') {
                    if (!query) return { isError: true, content: [{ type: 'text' as const, text: 'A research query is required to create a schedule.' }] };
                    if (!email) return { isError: true, content: [{ type: 'text' as const, text: 'An email address is required for report delivery.' }] };
                    const day_of_week = cadence === 'daily' ? 'weekdays' : 'monday';
                    const body = {
                        query,
                        cadence: cadence || 'weekly',
                        day_of_week,
                        hour_utc: 9,  // Always 9am local
                        timezone: timezone || 'new_york',
                        report_type: report_type || 'topic_research',
                        brands: brands || [],
                        graphs: graphs || [],
                        delivery: { email, slack_webhook, format: 'markdown' },
                        name: query.substring(0, 80),
                    };
                    const result = await foddaRequest('POST', '/v1/research/schedules', apiKey, resolveUserId('', ''), body);
                    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) + '\n\n✅ Briefing created! Your first report will arrive within 24 hours as a preview.' }] };
                } else if (action === 'list') {
                    const result = await foddaRequest('GET', '/v1/research/schedules', apiKey, resolveUserId('', ''));
                    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
                } else if (action === 'cancel') {
                    if (!schedule_id) return { isError: true, content: [{ type: 'text' as const, text: 'A schedule_id is required to cancel.' }] };
                    const result = await foddaRequest('POST', `/v1/research/schedules/${encodeURIComponent(schedule_id)}/cancel`, apiKey, resolveUserId('', ''), {});
                    return { content: [{ type: 'text' as const, text: '✅ Schedule cancelled. Already-consumed API calls are not refunded.' }] };
                } else if (action === 'pause') {
                    if (!schedule_id) return { isError: true, content: [{ type: 'text' as const, text: 'A schedule_id is required to pause.' }] };
                    const result = await foddaRequest('PATCH', `/v1/research/schedules/${encodeURIComponent(schedule_id)}`, apiKey, resolveUserId('', ''), { status: 'paused' });
                    return { content: [{ type: 'text' as const, text: '⏸️ Briefing paused. Say "resume my briefing" to restart.' }] };
                } else if (action === 'resume') {
                    if (!schedule_id) return { isError: true, content: [{ type: 'text' as const, text: 'A schedule_id is required to resume.' }] };
                    const result = await foddaRequest('PATCH', `/v1/research/schedules/${encodeURIComponent(schedule_id)}`, apiKey, resolveUserId('', ''), { status: 'active' });
                    return { content: [{ type: 'text' as const, text: `✅ Briefing resumed! Next delivery: ${result.next_run}` }] };
                } else if (action === 'update') {
                    if (!schedule_id) return { isError: true, content: [{ type: 'text' as const, text: 'A schedule_id is required to update.' }] };
                    const body: any = {};
                    if (cadence) body.cadence = cadence;
                    if (timezone) body.timezone = timezone;
                    if (email) body.delivery = { email };
                    if (brands) body.brands = brands;
                    if (report_type) body.report_type = report_type;
                    const result = await foddaRequest('PATCH', `/v1/research/schedules/${encodeURIComponent(schedule_id)}`, apiKey, resolveUserId('', ''), body);
                    return { content: [{ type: 'text' as const, text: `✅ Briefing updated: ${result.changes.join(', ')}. Next delivery: ${result.next_run}` }] };
                }
                return { isError: true, content: [{ type: 'text' as const, text: 'Unknown action.' }] };
            } catch (err: any) {
                console.error('[manage_scheduled_reports] Error:', err.message);
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }] };
            }
        };

    // --- read_url ---
    const handle_read_url = async (args: any = {}) => {
        let { url, userId: uid } = args;
            try {
                const result = await waverunnerRequest(
                    'search', // Uses standard search pool
                    1,
                    apiKey,
                    resolveUserId(userId, uid),
                    {
                        model: 'gemini-2.5-flash',
                        input: [
                            { type: 'text', text: `Extract and return the full text content from this URL. Return ONLY the extracted text, preserving headings and structure. Do not add commentary or analysis. URL: ${url}` }
                        ],
                        tools: [{ type: 'url_context' }]
                    }
                );

                const outputs = result.outputs || [];
                const textParts = outputs.filter((o: any) => o.type === 'text').map((o: any) => o.text);
                const extractedText = textParts.join('\n');

                // A model that cannot fetch the page replies with a refusal — non-empty
                // text that would otherwise pass as success and bill 15 calls for no
                // content. Only treat retrieval as failed on positive evidence: metadata
                // present and no URL reporting success.
                const urlMetadata = result.urlContextMetadata?.urlMetadata || [];
                const retrievalFailed = urlMetadata.length > 0
                    && !urlMetadata.some((m: any) => m.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS');

                if (!extractedText || retrievalFailed) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Could not extract content from this URL. It may be behind a login or paywall.' }) }] };
                }

                // ── Query-level billing ──
                chargeQuery({ queryTypeCode: 'url_as_prompt', apiKey, userId: resolveUserId(userId, uid), query: url, foddaRequest, spt: sptCtx?.token })
                    .catch(e => console.error('[read_url] chargeQuery failed:', e.message));

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            url,
                            content: extractedText,
                            content_length: extractedText.length,
                            api_calls_charged: 15,
                            hint: 'You now have the full text from this URL. Cross-reference it against Fodda knowledge graphs using search_graph or deep_research_topic to find relevant trends and insights.'
                        }, null, 2)
                    }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.message || 'URL extraction failed.';
                console.error('[read_url] Error:', msg);
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // Uses the fodda-researcher agent with 5 skill instruction files.
    // Flow: Pre-fetch graph data → Build skill-loaded system instruction → 
    // Call Gemini directly via waverunnerRequest → Stream progress via sendLoggingMessage.
    // --- deep_research_topic ---
    const handle_deep_research_topic = async (args: any = {}) => {
        let { query, sub_themes, graphId, mode, depth, userId: uid } = args;
            const resolvedUserId = resolveUserId(userId, uid);
            const effectiveDepth = mode || depth || 'light';
            const isHeavy = effectiveDepth === 'heavy';
            const queryTypeCode = isHeavy ? 'deep_research_heavy' : 'deep_research_light';

            // ── SPT pre-run coverage: refuse before kicking off the (long, expensive) job ──
            const researchGuard = sptGuard(queryTypeCode);
            if (researchGuard) return researchGuard;

            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'deep_research');

                const jobId = crypto.randomUUID();
                activeResearchJobs.set(jobId, { status: 'RUNNING', result: null, error: null });

                const jobTimeoutTimer = setTimeout(() => {
                    const current = activeResearchJobs.get(jobId);
                    if (current && current.status === 'RUNNING') {
                        console.error(`[deep_research_topic] Job ${jobId} exceeded hard 240s execution ceiling — setting status to FAILED`);
                        activeResearchJobs.set(jobId, {
                            status: 'FAILED',
                            error: 'Research job exceeded the 240-second maximum execution timeout.'
                        });
                    }
                }, 240000);

                // Run the extracted pipeline in the background to avoid Claude Web timeout
                (async () => {
                    try {
                        const result = await runDeepResearch({
                            query,
                            subThemes: sub_themes,
                            apiKey,
                            userId: resolvedUserId,
                            depth: effectiveDepth,
                            graphId,
                            foddaRequest,
                            waverunnerRequest,
                            onProgress: (msg) => {
                                server.sendLoggingMessage({ level: 'info', data: msg }).catch(() => {});
                            },
                        });

                        clearTimeout(jobTimeoutTimer);

                        // ── Settlement gates delivery for SPT: only mark COMPLETE once the charge succeeds. ──
                        if (sptCtx) {
                            const r = await chargeQuery({ queryTypeCode, apiKey, userId: resolvedUserId, query, graphsSearched: result.graphs_searched, foddaRequest, spt: sptCtx.token });
                            if (!r.charged) {
                                activeResearchJobs.set(jobId, { status: 'FAILED', error: r.error || 'Payment could not be completed; report withheld.' });
                                return;
                            }
                        } else {
                            chargeQuery({ queryTypeCode, apiKey, userId: resolvedUserId, query, graphsSearched: result.graphs_searched, foddaRequest })
                                .catch(e => console.error('[deep_research_topic] chargeQuery failed:', e.message));
                        }

                        activeResearchJobs.set(jobId, { status: 'COMPLETE', result });
                    } catch (err: any) {
                        clearTimeout(jobTimeoutTimer);
                        const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                        activeResearchJobs.set(jobId, { status: 'FAILED', error: msg });
                    }
                })();

                // Return source_plan immediately so the caller knows what's happening.
                const maxGraphs = isHeavy ? 15 : 8;
                const routingTopic = extractRoutingTopic(query);
                const previewCandidates: SourceCandidate[] = graphId ? [] : getRelevantSources(routingTopic, { minGraphs: isHeavy ? 6 : 4, maxGraphs });
                const previewGraphs = previewCandidates
                    .filter((c): c is Extract<SourceCandidate, { kind: 'graph' }> => c.kind === 'graph')
                    .slice(0, maxGraphs);
                const previewEarnings = previewCandidates.find(
                    (c): c is Extract<SourceCandidate, { kind: 'earnings' }> => c.kind === 'earnings');
                const previewSupp = previewCandidates.filter(
                    (c): c is Extract<SourceCandidate, { kind: 'supplemental' }> => c.kind === 'supplemental');
                const sourcePlan: Record<string, any>[] = [
                    ...(graphId
                        ? [{ kind: 'graph', id: graphId, reason: 'explicitly requested via graphId' }]
                        : previewGraphs.map(c => ({ kind: 'graph', id: c.graphId, reason: c.reason }))),
                    ...(previewEarnings ? [{
                        kind: 'earnings',
                        ...(previewEarnings.ticker ? { ticker: previewEarnings.ticker } : {}),
                        ...(previewEarnings.brand ? { brand: previewEarnings.brand } : {}),
                        ...(previewEarnings.sector ? { sector: previewEarnings.sector } : {}),
                        reason: previewEarnings.reason,
                    }] : []),
                    ...previewSupp.slice(0, 2).map(c => ({
                        kind: 'supplemental', category: c.category,
                        reason: `${c.reason} — auto-fetched`,
                    })),
                ];

                const subThemesPreview = (sub_themes && sub_themes.length > 0)
                    ? sub_themes
                    : fallbackSubThemes(routingTopic, isHeavy);

                return {
                    content: [{
                        type: 'text' as const,
                        text: `Deep research job started! The agent is performing tiered graph searches and live web synthesis. Job ID: ${jobId}\n\nserver_version: 1.35.4\nsub_themes_used:\n${JSON.stringify(subThemesPreview, null, 2)}\n\nsource_plan (sources the router selected and why):\n${JSON.stringify(sourcePlan, null, 2)}\n\nIMPORTANT: Use the check_research_status tool with Job ID ${jobId} to poll status (every 10-15s, max execution time 240s) until status is COMPLETE or FAILED.`
                    }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- check_research_status ---
    const handle_check_research_status = async (args: any = {}) => {
        let { job_id } = args;
            const job = activeResearchJobs.get(job_id);
            if (!job) {
                return { isError: true, content: [{ type: 'text' as const, text: `Job ID ${job_id} not found. It may have expired or never existed.` }] };
            }

            if (job.status === 'RUNNING') {
                return { content: [{ type: 'text' as const, text: `Job ${job_id} is still RUNNING. The agent is gathering and synthesizing data. Please poll again in 10 seconds.` }] };
            }

            if (job.status === 'FAILED') {
                activeResearchJobs.delete(job_id); // cleanup
                return { isError: true, content: [{ type: 'text' as const, text: `Job ${job_id} FAILED: ${job.error}` }] };
            }

            if (job.status === 'COMPLETE') {
                activeResearchJobs.delete(job_id); // cleanup
                const res = typeof job.result === 'object' && job.result !== null ? job.result : { report: String(job.result), sub_themes_used: [] };
                const payloadText = [
                    `sub_themes_used:\n${JSON.stringify(res.sub_themes_used || [], null, 2)}`,
                    '',
                    res.report
                ].join('\n\n');
                return { content: [{ type: 'text' as const, text: payloadText }] };
            }

            return { isError: true, content: [{ type: 'text' as const, text: `Unknown status for job ${job_id}` }] };
        };

    // --- consult_analyst ---
    const handle_consult_analyst = async (args: any = {}) => {
        let { analyst_id, query, company, session_id, userId: uid } = args;
            try {
                // Resolve potential alias IDs (e.g., "Nike CMO" -> analyst_id: "brand-cmo", company: "Nike")
                const { analyst_id: resolvedAnalystId, company: resolvedCompany } = resolveAnalystAlias(analyst_id, company);

                // Proactive check: if analyst is known to be a Human Agent (Digital Twin), return referral
                const match = getAnalysts().find((a: any) => {
                    const idKey = (a.analyst_id || a.id || a.slug || '').toLowerCase().trim();
                    const nameKey = (a.name || '').toLowerCase().trim();
                    const queryKey = resolvedAnalystId.toLowerCase().trim();
                    return idKey === queryKey || nameKey === queryKey;
                });
                const isTwinMatch = match && (
                    match.type === 'human_agent' ||
                    match.type === 'human_twin' ||
                    match.agent_type === 'human_twin' ||
                    match.agent_type === 'human_agent' ||
                    match.kind === 'human_agent' ||
                    match.kind === 'human_twin' ||
                    match.is_digital_twin === true ||
                    match.is_human_agent === true
                );
                if (isTwinMatch) {
                    const analystName = match.name || resolvedAnalystId;
                    return {
                        content: [{
                            type: 'text' as const,
                            text: `${analystName} is a Human Agent (Digital Twin). To consult this expert, please call consult_human_agent with analyst_id "${resolvedAnalystId}". (Internal guidance: analyst_id is an internal tool parameter — refer to the expert strictly as "${analystName}" in any user-facing output; do NOT output or highlight raw technical IDs/slugs).`
                        }]
                    };
                }

                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'consult_analyst');

                const result = await foddaRequest('POST', `/v1/analysts/consult`, apiKey, resolveUserId(userId, uid), {
                    analyst_id: resolvedAnalystId,
                    query,
                    company: resolvedCompany,
                    session_id
                });
                
                // If API indicates target is a Human Agent, return referral
                const isTwinResult = result?.is_human_agent ||
                    result?.type === 'human_agent' ||
                    result?.type === 'human_twin' ||
                    result?.agent_type === 'human_twin' ||
                    result?.agent_type === 'human_agent' ||
                    result?.analyst?.agent_type === 'human_twin' ||
                    result?.analyst?.type === 'human_agent' ||
                    result?.analyst?.type === 'human_twin';

                if (isTwinResult) {
                    const analystName = result.analyst_name || result.analyst?.name || result.name || resolvedAnalystId;
                    return {
                        content: [{
                            type: 'text' as const,
                            text: `${analystName} is a Human Agent (Digital Twin). To consult this expert, please call consult_human_agent with analyst_id "${resolvedAnalystId}". (Internal guidance: analyst_id is an internal tool parameter — refer to the expert strictly as "${analystName}" in any user-facing output; do NOT output or highlight raw technical IDs/slugs).`
                        }]
                    };
                }

                // Extract the expert's answer text (legacy-compatible)
                const reportText = typeof result.result === 'string'
                    ? result.result
                    : (typeof result.report === 'string' ? result.report : JSON.stringify(result, null, 2));

                // 1. Capture initial raw sources returned by upstream API
                const rawSources: any[] = Array.isArray(result.sources_used) ? result.sources_used : [];
                const seenUrls = new Set<string>();

                for (const s of rawSources) {
                    if (typeof s === 'object' && s?.url) {
                        seenUrls.add(s.url.trim());
                    } else if (typeof s === 'string') {
                        seenUrls.add(s.trim());
                    }
                }

                // 2. Extract markdown links [Title](https://url) from response prose text and tag with origin: 'prose', type: 'web'
                const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                const extractedSources: Array<{ title: string; url: string; origin: string; type: string }> = [];
                let mMatch: RegExpExecArray | null;
                while ((mMatch = markdownLinkRegex.exec(reportText)) !== null) {
                    const rawTitle = mMatch[1];
                    const rawUrl = mMatch[2];
                    if (rawTitle && rawUrl) {
                        const title = rawTitle.trim();
                        const url = rawUrl.trim();
                        if (url && !seenUrls.has(url)) {
                            seenUrls.add(url);
                            extractedSources.push({ title, url, origin: 'prose', type: 'web' });
                        }
                    }
                }

                const mergedSources = [...rawSources, ...extractedSources];

                // 3. Fallback profile source if 0 sources exist
                if (mergedSources.length === 0) {
                    const expertObj = result.expert || result.analyst || match || {};
                    const expertName = expertObj.name || result.analyst_name || result.name || resolvedAnalystId;
                    const cleanName = (expertName || '').replace(/\^\s*\[HA\]/gi, '').replace(/\^\[HA\]/g, '').trim();
                    const rawSlug = expertObj.expertSlug || expertObj.slug || expertObj.url || expertObj.webpage_url || expertObj.analyst_id || expertObj.id || resolvedAnalystId;
                    const expertSlug = typeof rawSlug === 'string' ? rawSlug.split('/experts/').pop()?.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '') : resolvedAnalystId;

                    mergedSources.push({
                        title: `${cleanName} Human Agent — Official and Verified Digital Twin`,
                        url: `https://www.fodda.ai/experts/${expertSlug}`,
                        origin: 'profile',
                        type: 'web'
                    });
                }

                result.sources_used = mergedSources;

                // 4. Source Tiering & Honest Coverage Calculation
                // FULL requires at least 1 graph-tier source (own_graph, library_graph, or graph evidence node from upstream)
                const classifyTier = (s: any): 'graph' | 'supplemental' | 'web' => {
                    if (typeof s === 'string') {
                        if (s.includes('/experts/')) return 'web';
                        if (s.includes('fodda.ai/graphs/') || s.includes('graph_id=')) return 'graph';
                        return rawSources.includes(s) ? 'graph' : 'web';
                    }
                    const origin = (s.origin || '').toLowerCase();
                    const type = (s.type || s.kind || '').toLowerCase();
                    const url = (s.url || '').toLowerCase();

                    if (origin === 'prose' || origin === 'profile') return 'web';
                    if (type === 'own_graph' || type === 'library_graph' || type === 'graph' || origin === 'graph') return 'graph';
                    if (type === 'supplemental' || type === 'financial' || type === 'sec') return 'supplemental';
                    if (type === 'web' || origin === 'web' || url.includes('/experts/')) return 'web';

                    if (rawSources.includes(s) && !url.includes('/experts/')) return 'graph';
                    if (url) return 'web';
                    return 'graph';
                };

                const graphSources = result.sources_used.filter((s: any) => classifyTier(s) === 'graph');
                const suppSources = result.sources_used.filter((s: any) => classifyTier(s) === 'supplemental');
                const webSources = result.sources_used.filter((s: any) => classifyTier(s) === 'web');

                const hasGraphTierSources = graphSources.length > 0;
                result.coverage = hasGraphTierSources ? "FULL" : "PARTIAL";

                const parts: string[] = [reportText];

                // Surface server-side timing for observability
                if (result.timing_ms != null) {
                    parts.push(`\n--- TIMING: ${result.timing_ms}ms server-side ---`);
                }

                // --- Structured envelope fields (Phase 2 Digital Twin) ---
                if (result.coverage) {
                    parts.push(`\n--- COVERAGE: ${result.coverage} ---`);
                }

                if (!hasGraphTierSources) {
                    parts.push(`--- PLATFORM NOTE (Deliver in third-person platform voice) ---\nThis Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database.`);
                }

                if (result.sources_used && Array.isArray(result.sources_used) && result.sources_used.length > 0) {
                    const formatLine = (s: any) => {
                        if (typeof s === 'string') return `- ${s}`;
                        const name = s.title || s.label || s.name || s.id || s.slug || 'Source';
                        return s.url ? `- ${name}: ${s.url}` : `- ${name}`;
                    };

                    const sourceSections: string[] = ['--- SOURCES USED ---'];
                    if (graphSources.length > 0) {
                        sourceSections.push(`[Graph Sources]\n${graphSources.map(formatLine).join('\n')}`);
                    }
                    if (suppSources.length > 0) {
                        sourceSections.push(`[Supplemental Data]\n${suppSources.map(formatLine).join('\n')}`);
                    }
                    if (webSources.length > 0) {
                        sourceSections.push(`[Web Sources]\n${webSources.map(formatLine).join('\n')}`);
                    }
                    parts.push(sourceSections.join('\n\n'));
                }
                if (result.referrals && Array.isArray(result.referrals) && result.referrals.length > 0) {
                    const activeAnalysts = getAnalysts();
                    const activeReferrals = result.referrals.filter((r: any) => {
                        const refId = (r.id || r.analyst_id || r.slug || r.name || '').toLowerCase().trim();
                        const found = activeAnalysts.find((a: any) => {
                            const aId = (a.analyst_id || a.id || a.slug || a.name || '').toLowerCase().trim();
                            return aId === refId || (a.name && a.name.toLowerCase().trim() === refId);
                        });
                        if (found) {
                            const st = (found.status || (found as any).Status || '').toLowerCase().trim();
                            if (st && st !== 'active') return false;
                        }
                        const rStatus = (r.status || r.Status || '').toLowerCase().trim();
                        if (rStatus && rStatus !== 'active') return false;
                        return true;
                    });

                    if (activeReferrals.length > 0) {
                        const refLines = activeReferrals.map((r: any, i: number) =>
                            `${i + 1}. ${r.name} by ${r.curator || 'unknown'} — ${r.reason || 'related expertise'}`
                        );
                        parts.push(`--- REFERRALS (deliver these in 3rd person as the platform, NOT in the expert's voice) ---\n${refLines.join('\n')}`);
                    }
                }
                if (result.speaker_note) {
                    parts.push(`--- SPEAKER NOTE: ${result.speaker_note} ---`);
                }

                // --- Engagement continuation (Agentic Analysts Phase B) ---
                if (result.partial_credit_warning || result.credit_note) {
                    parts.push(`\n> ℹ️ **Note on Deeper Fodda Graph Sweep**: ${result.partial_credit_warning || result.credit_note}`);
                }
                if (result.session_id) {
                    parts.push(`--- SESSION: ${result.session_id}${result.session_note ? ` — ${result.session_note}` : ''} ---`);
                }

                const consultWithheld = await settleOrWithhold({ queryTypeCode: 'expert_agent', apiKey, userId: resolveUserId(userId, uid), query }, 'consult_analyst');
                if (consultWithheld) return consultWithheld;
                return {
                    coverage: result.coverage,
                    sources_used: result.sources_used,
                    content: [{ type: 'text' as const, text: parts.join('\n') }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const errData = err.response?.data;
                const isTwinError = errData?.is_human_agent ||
                    errData?.error?.is_human_agent ||
                    errData?.agent_type === 'human_twin' ||
                    errData?.type === 'human_twin' ||
                    errData?.type === 'human_agent' ||
                    errData?.error?.agent_type === 'human_twin';
                if (isTwinError) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: `${analyst_id} is a Human Agent (Digital Twin). To consult this expert, please call consult_human_agent with analyst_id "${analyst_id}". (Internal guidance: analyst_id is an internal tool parameter — refer to the expert by display name in any user-facing output; do NOT output or highlight raw technical IDs/slugs).`
                        }]
                    };
                }
                // Surface timeout explicitly so clients get actionable guidance
                if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
                        error: `Analyst consultation timed out (90s). The upstream API is processing a complex query with tool calls. Retry in a moment, or use search_graph / get_expert_intelligence for faster results.`,
                        analyst_id,
                        timeout: true
                    }) }] };
                }
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- consult_human_agent ---
    const handle_consult_human_agent = async (args: any = {}) => {
        let { analyst_id, query, company, session_id, userId: uid } = args;
            try {
                const { analyst_id: resolvedAnalystId, company: resolvedCompany } = resolveAnalystAlias(analyst_id, company);

                const match = getAnalysts().find((a: any) => {
                    const idKey = (a.analyst_id || a.id || a.slug || '').toLowerCase().trim();
                    const nameKey = (a.name || '').toLowerCase().trim();
                    const queryKey = resolvedAnalystId.toLowerCase().trim();
                    return idKey === queryKey || nameKey === queryKey;
                });

                logUserQuery(query, 'consult_human_agent');

                const result = await foddaRequest('POST', `/v1/human-agents/consult`, apiKey, resolveUserId(userId, uid), {
                    analyst_id: resolvedAnalystId,
                    query,
                    company: resolvedCompany,
                    session_id
                });
                
                const reportText = typeof result.result === 'string'
                    ? result.result
                    : (typeof result.report === 'string' ? result.report : JSON.stringify(result, null, 2));

                // 1. Capture initial raw sources returned by upstream API
                const rawSources: any[] = Array.isArray(result.sources_used) ? result.sources_used : [];
                const seenUrls = new Set<string>();

                for (const s of rawSources) {
                    if (typeof s === 'object' && s?.url) {
                        seenUrls.add(s.url.trim());
                    } else if (typeof s === 'string') {
                        seenUrls.add(s.trim());
                    }
                }

                // 2. Extract markdown links [Title](https://url) from response prose text and tag with origin: 'prose', type: 'web'
                const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                const extractedSources: Array<{ title: string; url: string; origin: string; type: string }> = [];
                let mMatch: RegExpExecArray | null;
                while ((mMatch = markdownLinkRegex.exec(reportText)) !== null) {
                    const rawTitle = mMatch[1];
                    const rawUrl = mMatch[2];
                    if (rawTitle && rawUrl) {
                        const title = rawTitle.trim();
                        const url = rawUrl.trim();
                        if (url && !seenUrls.has(url)) {
                            seenUrls.add(url);
                            extractedSources.push({ title, url, origin: 'prose', type: 'web' });
                        }
                    }
                }

                const mergedSources = [...rawSources, ...extractedSources];

                // 3. Fallback profile source if 0 sources exist
                if (mergedSources.length === 0) {
                    const expertObj = result.expert || result.analyst || match || {};
                    const expertName = expertObj.name || result.analyst_name || result.name || resolvedAnalystId;
                    const cleanName = (expertName || '').replace(/\^\s*\[HA\]/gi, '').replace(/\^\[HA\]/g, '').trim();
                    const rawSlug = expertObj.expertSlug || expertObj.slug || expertObj.url || expertObj.webpage_url || expertObj.analyst_id || expertObj.id || resolvedAnalystId;
                    const expertSlug = typeof rawSlug === 'string' ? rawSlug.split('/experts/').pop()?.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '') : resolvedAnalystId;

                    mergedSources.push({
                        title: `${cleanName} Human Agent — Official and Verified Digital Twin`,
                        url: `https://www.fodda.ai/experts/${expertSlug}`,
                        origin: 'profile',
                        type: 'web'
                    });
                }

                result.sources_used = mergedSources;

                // 4. Source Tiering & Honest Coverage Calculation
                // FULL requires at least 1 graph-tier source (own_graph, library_graph, or graph evidence node from upstream)
                const classifyTier = (s: any): 'graph' | 'supplemental' | 'web' => {
                    if (typeof s === 'string') {
                        if (s.includes('/experts/')) return 'web';
                        if (s.includes('fodda.ai/graphs/') || s.includes('graph_id=')) return 'graph';
                        return rawSources.includes(s) ? 'graph' : 'web';
                    }
                    const origin = (s.origin || '').toLowerCase();
                    const type = (s.type || s.kind || '').toLowerCase();
                    const url = (s.url || '').toLowerCase();

                    if (origin === 'prose' || origin === 'profile') return 'web';
                    if (type === 'own_graph' || type === 'library_graph' || type === 'graph' || origin === 'graph') return 'graph';
                    if (type === 'supplemental' || type === 'financial' || type === 'sec') return 'supplemental';
                    if (type === 'web' || origin === 'web' || url.includes('/experts/')) return 'web';

                    if (rawSources.includes(s) && !url.includes('/experts/')) return 'graph';
                    if (url) return 'web';
                    return 'graph';
                };

                const graphSources = result.sources_used.filter((s: any) => classifyTier(s) === 'graph');
                const suppSources = result.sources_used.filter((s: any) => classifyTier(s) === 'supplemental');
                const webSources = result.sources_used.filter((s: any) => classifyTier(s) === 'web');

                const hasGraphTierSources = graphSources.length > 0;
                result.coverage = hasGraphTierSources ? "FULL" : "PARTIAL";

                const parts: string[] = [reportText];

                if (result.timing_ms != null) {
                    parts.push(`\n--- TIMING: ${result.timing_ms}ms server-side ---`);
                }

                if (result.coverage) {
                    parts.push(`\n--- COVERAGE: ${result.coverage} ---`);
                }

                if (!hasGraphTierSources) {
                    parts.push(`--- PLATFORM NOTE (Deliver in third-person platform voice) ---\nThis Human Agent doesn't have a lot of information to respond to that request — and we didn't find a lot of new insights from the Fodda database.`);
                }

                if (result.sources_used && Array.isArray(result.sources_used) && result.sources_used.length > 0) {
                    const formatLine = (s: any) => {
                        if (typeof s === 'string') return `- ${s}`;
                        const name = s.title || s.label || s.name || s.id || s.slug || 'Source';
                        return s.url ? `- ${name}: ${s.url}` : `- ${name}`;
                    };

                    const sourceSections: string[] = ['--- SOURCES USED ---'];
                    if (graphSources.length > 0) {
                        sourceSections.push(`[Graph Sources]\n${graphSources.map(formatLine).join('\n')}`);
                    }
                    if (suppSources.length > 0) {
                        sourceSections.push(`[Supplemental Data]\n${suppSources.map(formatLine).join('\n')}`);
                    }
                    if (webSources.length > 0) {
                        sourceSections.push(`[Web Sources]\n${webSources.map(formatLine).join('\n')}`);
                    }
                    parts.push(sourceSections.join('\n\n'));
                }
                if (result.referrals && Array.isArray(result.referrals) && result.referrals.length > 0) {
                    const activeAnalysts = getAnalysts();
                    const activeReferrals = result.referrals.filter((r: any) => {
                        const refId = (r.id || r.analyst_id || r.slug || r.name || '').toLowerCase().trim();
                        const found = activeAnalysts.find((a: any) => {
                            const aId = (a.analyst_id || a.id || a.slug || a.name || '').toLowerCase().trim();
                            return aId === refId || (a.name && a.name.toLowerCase().trim() === refId);
                        });
                        if (found) {
                            const st = (found.status || (found as any).Status || '').toLowerCase().trim();
                            if (st && st !== 'active') return false;
                        }
                        const rStatus = (r.status || r.Status || '').toLowerCase().trim();
                        if (rStatus && rStatus !== 'active') return false;
                        return true;
                    });

                    if (activeReferrals.length > 0) {
                        const refLines = activeReferrals.map((r: any, i: number) =>
                            `${i + 1}. ${r.name} by ${r.curator || 'unknown'} — ${r.reason || 'related expertise'}`
                        );
                        parts.push(`--- REFERRALS (deliver these in 3rd person as the platform, NOT in the expert's voice) ---\n${refLines.join('\n')}`);
                    }
                }
                if (result.speaker_note) {
                    parts.push(`--- SPEAKER NOTE: ${result.speaker_note} ---`);
                }

                if (result.partial_credit_warning || result.credit_note) {
                    parts.push(`\n> ℹ️ **Note on Deeper Fodda Graph Sweep**: ${result.partial_credit_warning || result.credit_note}`);
                }
                if (result.session_id) {
                    parts.push(`--- SESSION: ${result.session_id}${result.session_note ? ` — ${result.session_note}` : ''} ---`);
                }

                const consultWithheld = await settleOrWithhold({ queryTypeCode: 'human_agent_consult', apiKey, userId: resolveUserId(userId, uid), query }, 'consult_human_agent');
                if (consultWithheld) return consultWithheld;
                return {
                    coverage: result.coverage,
                    sources_used: result.sources_used,
                    content: [{ type: 'text' as const, text: parts.join('\n') }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
                        error: `Human Agent consultation timed out (90s). The upstream API is processing a complex query with tool calls. Retry in a moment, or use search_graph / get_expert_intelligence for faster results.`,
                        analyst_id,
                        timeout: true
                    }) }] };
                }
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- request_deliverable ---
    const handle_request_deliverable = async (args: any = {}) => {
        let { analyst_id, offering_key, brief, attachments, userId: uid } = args;
            try {
                logUserQuery(brief, 'skill_deliverable');

                // Billing is server-side in POST /deliver (the offering's published
                // price is charged up-front there — authoritative, and the meter
                // path can't express a per-offering price). The MCP does not settle
                // here, so there's no double-charge.
                const result = await foddaRequest(
                    'POST',
                    `/v1/human-agents/${encodeURIComponent(analyst_id)}/deliver`,
                    apiKey,
                    resolveUserId(userId, uid),
                    { offering_key, brief, attachments },
                );

                const lines = [
                    `Deliverable commissioned from ${result?.offering?.name || offering_key}.`,
                    `Job ID: ${result?.job_id}`,
                    `Status: ${result?.status || 'working'}`,
                    result?.price_usd != null ? `Price: $${result.price_usd}` : '',
                    `The analyst is producing this in the background. Poll with check_deliverable_status(job_id: "${result?.job_id}") until status is "completed", then present the artifact links.`,
                ].filter(Boolean);
                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    // --- check_deliverable_status ---
    const handle_check_deliverable_status = async (args: any = {}) => {
        let { job_id, userId: uid } = args;
            try {
                const result = await foddaRequest(
                    'GET',
                    `/v1/human-agents/deliverables/${encodeURIComponent(job_id)}`,
                    apiKey,
                    resolveUserId(userId, uid),
                );
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    const parseWebsiteError = (err: any): string => {
        const d = err.response?.data;
        return (typeof d?.error === 'string' ? d.error : d?.error?.message) || d?.message || err.message;
    };

    // --- begin_expert_onboarding ---
    const handle_begin_expert_onboarding = async (args: any = {}) => {
        let { userId: uid } = args;
            if (!apiKey) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: 'Welcome to Fodda Human Agent Onboarding!\n\nTo build your digital twin directly inside Claude, your Fodda account needs to be connected.\n\n👉 **Next Step:** Please visit https://www.fodda.ai/join-experts to link your account or sign in. Once linked, reply "continue" and we will kick off your background research and voice study.'
                    }]
                };
            }
            try {
                const userEmail = resolveUserId(userId, uid);
                const result = await foddaRequest('GET', '/api/onboarding-prompts', apiKey, userEmail);
                const sanitizeOnboardingPrompts = (text: string): string => {
                    return text
                        .replace(/On the recency window:\s*older material isn't thrown away[^\n"\\]*/gi, '')
                        .replace(/Anything outside the window gets demoted to legacy canon[^\n"\\]*/gi, '')
                        .replace(/State in the framing line that older material is demoted to legacy canon[^\n"\\]*/gi, '')
                        .replace(/With this information we'll run a background research project on your public work, run an AI probe of your expertise and tone of voice, and later run a short AI audio interview\. You'll get to review everything before anything is submitted\./gi, "Second, here's the flow: you provide answers in this chat session, then we'll run a background research project on your public work, then we run an AI probe of your expertise and tone of voice, and later run a short AI audio interview. You'll get to review everything before anything is submitted.")
                        .replace(/Iteration Feedback Invitation/gi, "Expertise Review - Step 1")
                        .replace(/Please review this summary\. If you are not happy about something I have included, just provide the feedback and I will run the exercise again to update the document\./gi, "This JSON file contains our analysis of your expertise - and is a file format that we use to help AI get to answers quicker. The details reflect the themes above. If you are not happy about something I have included, just provide the feedback and I will run the exercise again to update the document.");
                };
                if (result.alreadyActive) {
                    return { content: [{ type: 'text' as const, text: sanitizeOnboardingPrompts(result.message || '') }] };
                }
                const identityWarning = `[IDENTITY WARNING]\nFirst, identity: I'll register this profile under **${userEmail}**. If you want it tied to a different account, stop here and re-provision at https://www.fodda.ai/join-experts. Otherwise we're good.\nSecond, here's the flow: you provide answers in this chat session, then we'll run a background research project on your public work, then we run an AI probe of your expertise and tone of voice, and later run a short AI audio interview. You'll get to review everything before anything is submitted.\n\n`;
                const cleanedResult = sanitizeOnboardingPrompts(JSON.stringify(result, null, 2));
                return { content: [{ type: 'text' as const, text: identityWarning + cleanedResult }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- submit_basic_info ---
    const handle_submit_basic_info = async (args: any = {}) => {
        let { name, role, knowledgeArea, callPrice, userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const result = await foddaRequest('POST', '/api/prepare-voice-interview', apiKey, resolveUserId(userId, uid), { action: 'basic_info', name, role, knowledgeArea, callPrice });
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- expert_onboarding_research ---
    const handle_expert_onboarding_research = async (args: any = {}) => {
        let { userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const result = await foddaRequest('POST', '/api/deep-research', apiKey, resolveUserId(userId, uid));
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- submit_expertise_analysis ---
    const handle_submit_expertise_analysis = async (args: any = {}) => {
        let { voiceStudy, expertTopics, termsAccepted, userId: uid } = args;
            if (!termsAccepted) {
                return { isError: true, content: [{ type: 'text' as const, text: 'You must explicitly accept the Fodda Terms of Service and Privacy Policy to proceed.' }] };
            }
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const result = await foddaRequest('POST', '/api/prepare-voice-interview', apiKey, resolveUserId(userId, uid), { 
                    action: 'expertise_analysis', 
                    voiceStudyRaw: voiceStudy, 
                    expertTopicsRaw: expertTopics,
                    termsAccepted: true
                });
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- get_detected_themes ---
    const handle_get_detected_themes = async (args: any = {}) => {
        let { userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const result = await foddaRequest('GET', '/api/onboarding-themes', apiKey, resolveUserId(userId, uid));
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- confirm_themes ---
    const handle_confirm_themes = async (args: any = {}) => {
        let { themes, userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const result = await foddaRequest('POST', '/api/generate-questions', apiKey, resolveUserId(userId, uid), { confirmedThemes: themes });
                if (!result || result.success === false) {
                    return {
                        isError: true,
                        content: [{
                            type: 'text' as const,
                            text: "Theme confirmation didn't complete — the interview questionnaire wasn't generated. Please call confirm_themes again to retry. Do NOT proceed to schedule_interview yet."
                        }]
                    };
                }
                const extendedResult = {
                    ...result,
                    next: 'schedule_interview',
                    message: 'The voice interview is your next step — please schedule it by calling the schedule_interview tool.'
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(extendedResult, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- get_onboarding_status ---
    const handle_get_onboarding_status = async (args: any = {}) => {
        let { analystId, userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const userEmail = resolveUserId(userId, uid);
                let path = '/api/onboarding-status';
                if (analystId) {
                    path += `?analystId=${encodeURIComponent(analystId)}`;
                }
                const result = await foddaRequest('GET', path, apiKey, userEmail);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- schedule_interview ---
    const handle_schedule_interview = async (args: any = {}) => {
        let { datetime, localTimeStr, now, userId: uid } = args;
            if (!apiKey) {
                return { content: [{ type: 'text' as const, text: 'Your Fodda credentials are missing. Add Fodda as a connector to begin (or continue) onboarding: https://www.fodda.ai/join-experts' }] };
            }
            try {
                const userEmail = resolveUserId(userId, uid);
                const result = await foddaRequest('POST', '/api/voice-interview/request', apiKey, userEmail, {
                    datetime,
                    localTimeStr,
                    now
                });
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: 'text' as const, text: parseWebsiteError(err) }] };
            }
        };

    // --- get_my_earnings ---
    const handle_get_my_earnings = async (args: any = {}) => {
        let { userId: uid } = args;
            try {
                // Mapped to /v1/analysts/me/earnings as requested by Brief 402 + Agentic Access constraints
                const result = await foddaRequest('GET', '/v1/analysts/me/earnings', apiKey, resolveUserId(userId, uid));
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        };

    if (allowedTools && (Array.isArray(allowedTools) ? allowedTools.length > 0 : allowedTools.size > 0)) {
        const allowedSet = allowedTools instanceof Set ? allowedTools : new Set(allowedTools);
        const registered = (server as any)._registeredTools || {};
        for (const [name, tool] of Object.entries(registered)) {
            if (!allowedSet.has(name)) {
                if (typeof (tool as any).disable === 'function') {
                    (tool as any).disable();
                } else {
                    delete registered[name];
                }
            }
        }
    }

    return server;

    // =========================================================================
    // CONSOLIDATED TOOLS (7 INTENT-LEVEL TOOLS)
    // =========================================================================

    // 1. fodda_search
    server.tool(
        'fodda_search',
        'Find trends, signals, and expert insights across 100+ curated knowledge graphs (retail, beauty, tech, food, travel, sports, 30+ specialist domains), domain intelligence, published report research, brand footprints, company earnings transcripts, quantitative statistics, expert insights, source evidence, or list accessible graphs. Price: $20 per graph/earnings query, $30 per brand report, $35 for domain intelligence, $55 for report intelligence, $0.50 per evidence/insight/statistic lookup, free for graph listing.',
        {
            view: z.enum(['graph', 'domain', 'report', 'brand', 'earnings', 'statistics', 'insights', 'evidence', 'list_graphs']).optional().default('graph').describe('Search view mode.'),
            query: z.string().optional().describe('Search query, topic, brand, or stock ticker.'),
            graph_id: z.string().optional().describe('Optional specific graph ID (e.g. "psfk_retail").'),
            company: z.string().optional().describe('Optional target company name or stock ticker.'),
            limit: z.number().optional().default(30).describe('Pagination limit for list_graphs (default 30).'),
            offset: z.number().optional().default(0).describe('Pagination offset for list_graphs (default 0).'),
            max_evidence: z.number().optional().default(5).describe('Maximum evidence items per node (default 5).'),
            node_id: z.string().optional().describe('Node ID for evidence or graph detail lookups.'),
        },
        { title: 'Search Knowledge Graphs & Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        async (args: any) => {
            const view = args.view || 'graph';
            if (view === 'list_graphs') {
                return await handle_list_graphs(args);
            } else if (view === 'domain') {
                return await handle_get_domain_intelligence(args);
            } else if (view === 'report') {
                return await handle_get_report_intelligence(args);
            } else if (view === 'brand') {
                return await handle_brand_tracker({ brand: args.query || args.company, company: args.company || args.query, ...args });
            } else if (view === 'earnings') {
                if (args.company || (args.query && /^[A-Z0-9.\-]{1,6}$/i.test(args.query.trim()))) {
                    return await handle_get_company_earnings({ ticker: args.company || args.query, company: args.company || args.query, ...args });
                }
                return await handle_get_earnings_intelligence(args);
            } else if (view === 'statistics') {
                return await handle_search_statistics(args);
            } else if (view === 'insights') {
                return await handle_search_insights(args);
            } else if (view === 'evidence') {
                return await handle_get_evidence(args);
            } else {
                return await handle_search_graph({ graphId: args.graph_id, ...args });
            }
        }
    );

    // 2. fodda_consult
    server.tool(
        'fodda_consult',
        'Consult Synthetic Analyst personas, Human Agent digital twins, specialist strategist frameworks, or list available expert personas. Price: $15 per analyst/human consult, $45 per expert graph lookup, free for listing experts.',
        {
            type: z.enum(['synthetic', 'human', 'list']).optional().default('synthetic').describe('Consultation type. "synthetic": consult a synthetic expert persona ($15); "human": consult a human agent digital twin ($15); "list": list available analysts and digital twins (free).'),
            analyst_id: z.string().optional().describe('ID of the analyst or expert to consult (e.g. "brand-cmo", "anu-lingala-macro"). Call type="list" first to discover IDs.'),
            query: z.string().optional().describe('Question or prompt for the analyst.'),
            company: z.string().optional().describe('Target company name when consulting role-based experts (e.g. company: "Nike" with analyst_id: "brand-cmo").'),
            session_id: z.string().optional().describe('Session ID to maintain multi-turn context.'),
            limit: z.number().optional().default(20).describe('Pagination limit for type="list" (default 20).'),
            offset: z.number().optional().default(0).describe('Pagination offset for type="list" (default 0).'),
            summary: z.boolean().optional().default(true).describe('Returns compact analyst profiles to save context when true (default).'),
        },
        { title: 'Consult Analysts & Human Agents', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async (args: any) => {
            const type = args.type || 'synthetic';
            if (type === 'list') {
                return await handle_list_analysts({ limit: args.limit || 20, offset: args.offset || 0, summary: args.summary ?? true, ...args });
            } else if (type === 'human') {
                return await handle_consult_human_agent(args);
            } else {
                return await handle_consult_analyst(args);
            }
        }
    );

    // 3. fodda_research
    server.tool(
        'fodda_research',
        'Launch autonomous deep research sessions, extract structured content from web URLs, brainstorm connected concepts, discover cross-domain trend adjacencies, or pull real-time institutional market data. Price: $55 (light mode) / $100 (heavy mode) for deep research, $20 per URL lookup, $35 for brainstorm, $15 for adjacent trends, $10 for market data, free for status polling.',
        {
            action: z.enum(['deep_research', 'read_url', 'brainstorm', 'discover_adjacencies', 'supplemental_context', 'check_status']).optional().default('deep_research').describe('Research action to take.'),
            topic: z.string().optional().describe('Research topic, question, or concept.'),
            url: z.string().optional().describe('Target web URL for read_url.'),
            depth: z.enum(['light', 'heavy']).optional().default('light').describe('Research depth for deep_research: "light" ($55) or "heavy" ($100).'),
            job_id: z.string().optional().describe('Job ID for check_status action.'),
            trend_name: z.string().optional().describe('Trend name for discover_adjacencies.'),
        },
        { title: 'Autonomous Research & Web Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async (args: any) => {
            const action = args.action || 'deep_research';
            if (action === 'read_url') {
                return await handle_read_url(args);
            } else if (action === 'brainstorm') {
                return await handle_brainstorm_topic(args);
            } else if (action === 'discover_adjacencies') {
                return await handle_discover_adjacent_trends({ trendName: args.trend_name || args.topic, ...args });
            } else if (action === 'supplemental_context') {
                return await handle_get_supplemental_context({ query: args.topic, ...args });
            } else if (action === 'check_status') {
                if (args.job_id && args.job_id.startsWith('supp_')) {
                    return await handle_check_supplemental_status(args);
                }
                return await handle_check_research_status(args);
            } else {
                return await handle_deep_research_topic(args);
            }
        }
    );

    // 4. fodda_content
    server.tool(
        'fodda_content',
        'Turn knowledge graph research into structured LinkedIn content (posts or long-form articles) backed by verifiable evidence packs, or generate presentation-ready SVG chart visualizations. Price: $5 per LinkedIn post, $2.50 per LinkedIn article, free for SVG visual generation.',
        {
            type: z.enum(['linkedin_post', 'linkedin_article', 'svg_visual']).optional().default('linkedin_post').describe('Content type.'),
            topic: z.string().optional().describe('Topic or thesis for content/visualization.'),
            chart_type: z.enum(['cultural_shifts', 'competitive_compass', 'trend_constellation', 'implication_ladder', 'innovation_pathway', 'opportunity_map']).optional().describe('Chart type for svg_visual.'),
            evidence_pack: z.record(z.string(), z.any()).optional().describe('Optional evidence pack object.'),
        },
        { title: 'Content Drafting & Visualizations', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async (args: any) => {
            const type = args.type || 'linkedin_post';
            if (type === 'linkedin_article') {
                return await handle_draft_linkedin_article(args);
            } else if (type === 'svg_visual') {
                return (await handle_generate_visual({ chartType: args.chart_type, ...args })) as any;
            } else {
                return await handle_draft_linkedin_post(args);
            }
        }
    );

    // 5. fodda_deliverables
    server.tool(
        'fodda_deliverables',
        'Commission finished strategy documents from expert analysts (e.g. marketing plans, deck reviews, trend briefings) or poll deliverable job status. Billed on deliverable acceptance; job status polling is free.',
        {
            action: z.enum(['commission', 'check_status']).optional().default('commission').describe('Deliverable action.'),
            offering_key: z.string().optional().describe('Offering key (e.g. "marketing_plan", "deck_review", "trend_briefing").'),
            analyst_id: z.string().optional().describe('Target analyst ID.'),
            brief: z.string().optional().describe('Brief describing audience, goals, and constraints.'),
            job_id: z.string().optional().describe('Job ID for check_status.'),
        },
        { title: 'Expert Deliverables & Document Generation', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async (args: any) => {
            const action = args.action || 'commission';
            if (action === 'check_status') {
                return await handle_check_deliverable_status(args);
            } else {
                return await handle_request_deliverable({ offeringKey: args.offering_key, analystId: args.analyst_id, ...args });
            }
        }
    );

    // 6. fodda_account
    server.tool(
        'fodda_account',
        'Manage user profile, check account balance and plan limits, query Fodda capabilities, toggle knowledge graph preferences, manage scheduled intelligence briefings, send feedback, or sign up for a free account. Free ($0).',
        {
            action: z.enum(['get_profile', 'update_profile', 'get_capabilities', 'toggle_graph', 'schedule_reports', 'send_feedback', 'sign_up']).optional().default('get_profile').describe('Account action.'),
            graph_id: z.string().optional().describe('Target graph ID for toggle_graph.'),
            enabled: z.boolean().optional().describe('Enable (true) or disable (false) for toggle_graph.'),
            profile: z.record(z.string(), z.any()).optional().describe('Profile fields for update_profile.'),
            feedback_text: z.string().optional().describe('Feedback text for send_feedback.'),
            email: z.string().optional().describe('User email for sign_up.'),
            report_config: z.record(z.string(), z.any()).optional().describe('Config for schedule_reports.'),
        },
        { title: 'Account Management & Preferences', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async (args: any) => {
            const action = args.action || 'get_profile';
            if (action === 'update_profile') {
                return await handle_update_user_profile(args);
            } else if (action === 'get_capabilities') {
                return await handle_get_capabilities(args);
            } else if (action === 'toggle_graph') {
                return await handle_toggle_graph_preference({ graphId: args.graph_id, ...args });
            } else if (action === 'schedule_reports') {
                return await handle_manage_scheduled_reports(args);
            } else if (action === 'send_feedback') {
                return await handle_send_feedback({ feedback: args.feedback_text, ...args });
            } else if (action === 'sign_up') {
                return await handle_sign_up_free_account(args);
            } else {
                return await handle_get_my_account(args);
            }
        }
    );

    // 7. fodda_onboarding
    server.tool(
        'fodda_onboarding',
        'Guide experts through the Fodda Human Agent onboarding pipeline: initialization, basic info submission, background research execution, voice study & expertise analysis submission, detected theme review, theme confirmation, onboarding status tracking, audio interview booking, and earnings check. Free ($0).',
        {
            action: z.enum(['begin', 'submit_info', 'submit_analysis', 'get_themes', 'confirm_themes', 'check_status', 'schedule_interview', 'my_earnings']).optional().default('begin').describe('Onboarding stage.'),
            data: z.record(z.string(), z.any()).optional().describe('Payload data for the stage.'),
        },
        { title: 'Expert Onboarding Stepper Pipeline', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async (args: any) => {
            const action = args.action || 'begin';
            const payload = args.data || args;
            if (action === 'submit_info') {
                return await handle_submit_basic_info(payload);
            } else if (action === 'submit_analysis') {
                return await handle_submit_expertise_analysis(payload);
            } else if (action === 'get_themes') {
                return await handle_get_detected_themes(payload);
            } else if (action === 'confirm_themes') {
                return await handle_confirm_themes(payload);
            } else if (action === 'check_status') {
                return await handle_get_onboarding_status(payload);
            } else if (action === 'schedule_interview') {
                return await handle_schedule_interview(payload);
            } else if (action === 'my_earnings') {
                return await handle_get_my_earnings(payload);
            } else {
                return await handle_begin_expert_onboarding(payload);
            }
        }
    );

}
