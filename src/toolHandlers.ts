/**
 * Tool Handlers — MCP server factory with all tool registrations.
 *
 * Extracted from index.ts to reduce monolith size.
 * Contains createServer() which registers all 30+ MCP tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListResourcesRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import crypto from 'crypto';
import { buildDynamicPromptSections, getDomainGraphIds, getGraphs, getLiveGraphs, buildDisplayName, getRelevantGraphs, getEnabledSkillConfigs, getSkillGraphs, getAnalysts } from './catalogCache.js';
import type { CatalogGraph } from './catalogCache.js';
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

// ---------------------------------------------------------------------------
// Render instructions — embedded in tool responses for LLM clients that
// don't receive MCP server-level `instructions` (e.g. Claude.ai).
// ---------------------------------------------------------------------------
const RENDER_SPEC_VERSION = '1.0';

function buildRenderInstructions(opts: {
    hasWidget: boolean;
    hasPrompts: boolean;
    hasEvidence: boolean;
    graphWebpageUrls?: Record<string, string>;
}): Record<string, any> {
    const rules: string[] = [
        'Attribute findings to their source graph by name using graphName. Never say "the Fodda graph." Fodda is the platform — the graphs are created by named experts.',
    ];
    if (opts.hasEvidence) {
        rules.push('Use formatted_citation from evidence items as inline markdown links. Never present a claim without its source link.');
    }
    if (opts.hasPrompts) {
        rules.push('Surface suggested_next_prompts to the user as numbered follow-up suggestions.');
    }
    rules.push('Each trend result has a suggested_drill_down field containing a ready-to-use follow-up prompt. After presenting each trend, show its drill-down as a clickable suggestion (e.g. "→ Tell me more about X"). This lets the user explore individual trends without typing.');
    if (opts.hasWidget) {
        rules.push('A separate content block starting with "── WIDGET HTML ──" may follow this JSON payload. It contains a pre-rendered Fodda visualization. If your client supports HTML rendering (show_widget, visualize:show_widget, artifacts), pass that HTML verbatim. Do not rewrite or restyle.');
    }
    rules.push('Keep responses clean and structured. Lead with a sharp editorial claim, not a summary of data methodology.');

    const instructions: Record<string, any> = {
        _render_spec_version: RENDER_SPEC_VERSION,
        rules,
    };

    // Graph-level link templates (populated when catalog has webpage_url)
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
// ---------------------------------------------------------------------------
export type FoddaRequestFn = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string
) => Promise<any>;

export type WaverunnerRequestFn = (
    interactionType: import('./trialTracker.js').TrialInteractionType,
    tokenCost: number,
    apiKey: string,
    userId: string,
    waverunnerPayload: any
) => Promise<any>;

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

const GRAPH_ID_DESC = "The graph ID. Use list_graphs to see all options. Examples: 'retail', 'tech', 'food', 'travel', 'beauty', 'sports', 'sic', 'pew', 'ce-design', 'ezra-eeman-wayfinder', 'dhl-ecommerce-trends-2026', 'automotive-color-trends', 'alyson-stevens-macro', 'generative-realities', 'pwc/sxsw-2026-key-insights', 'green-house/thrive-report', 'michaels-2026-creativity-trend-report', 'delta/the-connection-index'";

// ── P0 Security: Allowlist serializer for list_graphs ──
const GRAPH_LIST_ALLOWLIST: ReadonlySet<string> = new Set([
    'graph_id', 'name', 'one_liner', 'description', 'curator',
    'domain', 'graph_type', 'trend_count', 'evidence_count',
    'status', 'last_updated',
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

    // Build skill metadata for system prompt — includes both output-phase and interactive skills
    const skillPromptMeta = sessionSkills.map(s => {
        const discovered = discoveredSkills.find(d => d.skill_id === s.id);
        return {
            id: s.id,
            name: s.name,
            interactiveTools: discovered?.tools.map(t => `${s.id}_${t.name}`) || [],
            costPerCall: discovered?.cost_per_call ?? 2,
        };
    });

    const server = new McpServer({
        name: 'fodda_mcp',
        version: MCP_SERVER_VERSION,
    }, {
        instructions: buildSystemPrompt(accountProfile, skillPromptMeta, entryId),
    });

    // Register empty capabilities and handlers to silence directory warnings
    server.server.registerCapabilities({
        resources: {},
        prompts: {}
    });

    server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: [] };
    });

    server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return { prompts: [] };
    });

    // ── Register discovered interactive skill tools as MCP tools ──
    for (const discovered of discoveredSkills) {
        for (const tool of discovered.tools) {
            const prefixedName = `${discovered.skill_id}_${tool.name}`;
            const costNote = `(costs ${discovered.cost_per_call} API calls)`;
            const description = `[${discovered.skill_name}] ${tool.description || tool.name} ${costNote}`;

            // Build a Zod schema from the tool's inputSchema
            // The inputSchema from the API is a JSON Schema object — we accept
            // it as a free-form argument object and pass through to the API
            server.tool(
                prefixedName,
                description,
                { arguments: z.record(z.string(), z.any()).optional().describe('Arguments for the skill tool. Check the tool description for expected parameters.') },
                { title: `${discovered.skill_name}: ${tool.name}`, readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
    server.tool(
        'get_my_account',
        'Check the current user\'s account status: API call balance, plan, enabled/disabled graphs, and profile info. Use when the user asks "how many API calls do I have?", "what plan am I on?", "what graphs can I access?", or similar account questions. Returns live data — not cached from session start.',
        {},
        { title: 'Check Account Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async () => {
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
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- list_graphs ---
    server.tool(
        'list_graphs',
        'List all knowledge graphs the user can access — IDs, descriptions, authors, sectors, signal counts. Use FIRST in any session to discover available sources before searching. Returns graph metadata needed for graphId parameters in other tools. Deprecated: waldo, psfk (use retail/tech/food/travel/fashion/beauty/sports instead).',
        { userId: z.string().optional().describe('Optional user identifier. Authenticated users are identified automatically via API key. For trial users, this helps track usage.') },
        { title: 'List Knowledge Graphs', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ userId: uid }) => {
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
        }
    );

    // --- list_analysts ---
    server.tool(
        'list_analysts',
        'List available Synthetic Analysts — named expert personas grounded in specific knowledge graphs. Each analyst has a unique voice, methodology, and domain expertise that cannot be replicated by web search. Use when user asks to "talk to" or "consult" an expert, or when you need specialist depth on culture, strategy, or innovation topics.',
        { userId: z.string().optional().describe('Optional user identifier.') },
        { title: 'List Synthetic Analysts', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ userId: uid }) => {
            try {
                const data = await foddaRequest('GET', '/v1/analysts', apiKey, resolveUserId(userId, uid));
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- search_graph ---
    server.tool(
        'search_graph',
        'Search expert-curated knowledge graphs for trend clusters, signals, and consumer behavior evidence across retail, beauty, luxury, fashion, sport, consumer electronics, F&B, travel, and 30+ specialist domains. Returns structured trend data with cited evidence chains, source attribution, lifecycle signals (emerging/building/mature/fading), and momentum indicators — not generic web summaries. If graphId is omitted, searches ALL accessible graphs in parallel (recommended default). Use when the query involves market trends, competitor analysis, innovation signals, consumer behavior, cultural shifts, or any topic where curated expert intelligence outperforms web search.',
        {
            graphId: z.string().optional().describe("Optional graph ID. If omitted, searches ALL accessible graphs. Examples: 'retail', 'tech', 'food', 'travel', 'beauty', 'sports', 'sic', 'pew', 'ce-design', 'ezra-eeman-wayfinder', 'dhl-ecommerce-trends-2026', 'automotive-color-trends', 'alyson-stevens-macro', 'generative-realities', 'pwc/sxsw-2026-key-insights', 'green-house/thrive-report', 'delta/the-connection-index'"),
            query: z.string().describe('The search query. Location terms are auto-detected and used to filter results geographically.'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            limit: z.number().optional().describe('Maximum number of results (default 10, max 50)'),
            use_semantic: z.boolean().optional().describe('Whether to use semantic search (default true)'),
            include_evidence: z.boolean().optional().describe('If true, batch-fetch supporting evidence articles inline with results. Default: true.'),
            skip_skills: z.boolean().optional().describe('If true, skip applying any enabled skills (Paralogy, Igloo, etc.) for this query only. Use when the user says "without skills", "skip Paralogy", or "just the raw results". Default: false.')
        },
        { title: 'Search Knowledge Graph', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ graphId, query, userId: uid, limit, use_semantic, include_evidence, skip_skills }) => {
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

                // If no graphId or deprecated 'psfk', use smart 2-step routing
                if (!graphId || graphId === 'psfk') {
                    // Step 1: Score query against graph metadata to find relevant graphs
                    const relevantGraphs = getRelevantGraphs(query);
                    const graphsToSearch = relevantGraphs.map(r => r.graph);

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
                        return await handleAccessError(creditRejection, 'search_graph');
                    }
                    data = { rows: finalRows, dataStatus: allRows.length > 0 ? 'ok' : 'NO_MATCH', _routed_graphs: actualSourceGraphs };
                } else {
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
                    data.research_gaps = { thin_coverage: true, note: 'The graph has limited coverage on this topic. These are the closest matches.' };
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
                return await handleAccessError(err, 'search_graph');
            }
        }
    );

    // --- get_neighbors ---
    server.tool(
        'get_neighbors',
        'Traverse graph relationships from a specific trend node to discover connected signals, brands, technologies, and locations. Returns structured relationship data that web search cannot provide — the curated editorial connections between trends. Use after search_graph to map the territory around a specific trend, find which brands are connected, or understand cross-domain links. Requires node_id from a prior search_graph result.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            seed_node_ids: z.array(z.string()).describe('Array of node IDs to start traversal from. MUST be actual node_id values from a prior search_graph result (e.g. ["2507.0"]). Node IDs are NOT sequential integers — do NOT guess or invent IDs like "1", "2", "3". Always call search_graph first to obtain valid IDs.'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            relationship_types: z.array(z.string()).optional().describe("Filter by relationship types: 'EVIDENCED_BY', 'RELATED_TO', 'SEMANTICALLY_SIMILAR', 'ASSOCIATED_BRAND', 'MENTIONS_BRAND', 'IN_LOCATION'"),
            direction: z.enum(['in', 'out']).optional().describe("Traversal direction: 'out' (default) follows outgoing edges, 'in' follows incoming edges"),
            depth: z.number().optional().describe('Traversal depth (default 1, max 2)'),
            limit: z.number().optional().describe('Maximum results (default 50)')
        },
        { title: 'Explore Graph Neighbors', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ graphId, seed_node_ids, userId: uid, relationship_types, direction, depth, limit }: any) => {
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
        }
    );

    // --- get_evidence ---
    server.tool(
        'get_evidence',
        'Retrieve curated source articles and structured evidence for a specific trend node — case studies, statistics, expert quotes, and analysis with full source attribution. Returns evidence that has been editorially selected and categorized, not raw web results. Each item includes sourceUrl, place, brandNames, publishedAt, category, and formatted_citation. Use after search_graph when you need the supporting proof behind a specific trend. This is a node lookup — not a text search tool.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            for_node_id: z.string().describe("The node_id from a prior search_graph result (e.g. '2507.0'). MUST come from the search result's node_id field. Node IDs are NOT sequential integers — do NOT guess or invent IDs like '1', '2', '3'. Do NOT pass the trend name."),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            top_k: z.number().optional().describe('Number of evidence items to return (default 5)')
        },
        { title: 'Get Supporting Evidence', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ graphId, for_node_id, userId: uid, top_k }) => {
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
        }
    );

    // --- get_node ---
    server.tool(
        'get_node',
        'Retrieve complete metadata for a specific trend node — full description, signal score, lifecycle, geographic scope, adjacent possibilities, and all properties. Use when you need the full detail on a single trend after search_graph returned a summary. Requires node_id from a prior search_graph result.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            nodeId: z.string().describe("The node_id from a prior search_graph result (e.g. '2507.0'). MUST come from the search result's node_id field. Node IDs are NOT sequential integers — do NOT guess or invent IDs like '1', '2', '3'. Do NOT pass the trend name."),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.')
        },
        { title: 'Get Node Details', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ graphId, nodeId, userId: uid }) => {
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
        }
    );

    // --- get_label_values ---
    server.tool(
        'get_label_values',
        'List all values for a structured category within a graph — Brand names, Locations, Technologies, Audiences, RetailerTypes, or Trend names. Use when you need to enumerate what entities exist in a graph before filtering, or when the user asks "what brands are in the retail graph?" or "what locations does the fashion graph cover?". To enumerate every trend in a graph (especially industry-report graphs, where semantic search/search_insights may return only the top match or nothing if evidence is unlinked), call with label="Trend" — this returns the complete, deterministic list of trend names.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            label: z.string().describe("The label to fetch values for (e.g., 'Brand', 'Location', 'Technology', 'Audience', 'RetailerType', 'Trend')"),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            property: z.string().optional().describe('Optional property to return values for. Defaults vary by label.')
        },
        { title: 'Get Category Values', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ graphId, label, userId: uid, property }) => {
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
        }
    );

    // --- discover_adjacent_trends ---
    server.tool(
        'discover_adjacent_trends',
        'Find trends semantically similar to a given trend using pre-computed embeddings — surfaces connections that keyword search would miss. Returns scored similarity matches and optionally editorial links across graphs. Use to expand research briefs, discover unexpected cross-domain connections, or map the territory around a strong signal. Web search cannot replicate this — it uses Fodda\'s internal embedding space.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            trend_id: z.string().describe("The node_id from a prior search_graph result (e.g. '2507.0'). MUST come from the search result's node_id field. Node IDs are NOT sequential integers — do NOT guess or invent IDs like '1', '2', '3'. Do NOT pass the trend name."),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            min_score: z.number().optional().describe('Minimum similarity score threshold (0-1). Default: 0.80'),
            limit: z.number().optional().describe('Maximum number of adjacent trends to return. Default: 10'),
            include_editorial: z.boolean().optional().describe('If true, also include editorially linked trends. Default: false')
        },
        { title: 'Discover Adjacent Trends', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ graphId, trend_id, userId: uid, min_score, limit, include_editorial }) => {
            try {
                if (graphId === 'psfk') graphId = 'retail';
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
        }
    );

    // --- brand_tracker ---
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

        const widget = await renderBrandWidget(profile);
        const EDITORIAL_INSTRUCTION = widget.open_slots.length === 0
            ? `── BRAND WIDGET: READY ──\nThe widget is fully populated. Call show_widget with the widget_html as-is. Do NOT modify the HTML.`
            : `── BRAND WIDGET: EDITORIAL SLOTS ──\nThe widget_html is mostly complete. Fill these remaining slot(s): ${widget.open_slots.join(', ')}\n\n${widget.open_slots.includes('ANALYSIS_HTML') ? '{{ANALYSIS_HTML}} — Write 3-5 paragraphs of strategic analysis using <p> tags. Cover: strongest signal and why, gaps or emerging opportunities, competitive positioning, and what to watch next. Use <strong> for key terms.' : ''}\n\nEDITORIAL CONTEXT:\n${JSON.stringify(widget.editorial_context, null, 2)}\n\nCRITICAL: ALL output must go INSIDE the widget slots. Do NOT redesign, restyle, or add new elements.\nAfter filling slots, pass the complete HTML to show_widget.\n`;

        storeWidget(widget.widget_html);

        return { profile, widget, EDITORIAL_INSTRUCTION };
    };

    server.tool(
        'brand_tracker',
        'Build a complete Brand Intelligence Profile by searching ALL knowledge graphs for a specific brand. Returns trend footprint (which trends the brand appears in), competitive landscape (co-occurring brands ranked by overlap), cross-graph presence, evidence timeline, lifecycle distribution, and bundled supplemental signals (Google Trends, Wikipedia, Amazon, earnings). Use when the query is about a specific company or brand — "What is Nike doing?", "Patagonia\'s innovation strategy", "How is Apple positioned?". This aggregates intelligence that would require dozens of separate web searches to assemble.',
        {
            brand_name: z.string().describe("The brand name to look up (e.g. 'Nike', 'Adidas', 'Apple'). Case-insensitive."),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
            graph_ids: z.array(z.string()).optional().describe('Optional: specific graph IDs to search. If omitted, searches ALL accessible graphs.'),
            include_evidence: z.boolean().optional().describe('If true (default), include individual evidence items. Set to false for summary-only.'),
            max_evidence: z.number().optional().describe('Maximum evidence items per graph. Default: 10. Max: 25.'),
        },
        { title: 'Brand Intelligence Profile', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ brand_name, userId: uid, graph_ids, include_evidence, max_evidence }) => {
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

                return { content: [
                    { type: 'text' as const, text: '── WIDGET HTML ──\nIf your client supports HTML visualization (show_widget, visualize:show_widget, or artifacts), pass this HTML verbatim. Do not rewrite or restyle.\n\n' + widget.widget_html },
                    { type: 'text' as const, text: EDITORIAL_INSTRUCTION },
                ] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );


    // --- get_supplemental_context (Unified Supplemental Endpoint) ---
    // Replaces 21 individual supplemental tools with a single call.
    // The API routes to 6-10 relevant sources based on query + domain,
    // queries them in parallel, and returns a consolidated response.
    server.tool(
        'get_supplemental_context',
        'Get institutional market data from up to 10 sources in a single call. The server automatically selects the most relevant sources based on your query and domain — economic indicators, trade data, product landscape, food economics, agricultural production, nutritional composition, commodity pricing, research signals, demographic surveys, and more. Use this AFTER graph searches to add macro context, or standalone for quantitative market intelligence. Returns categorized data blocks (demand_signals, economic_context, market_data, research_signals, demographic_context) with source attribution for citations. 5 API calls per standalone use.',
        {
            query: z.string().describe("The topic or query to get supplemental data for (e.g., 'sustainable packaging', 'tequila spirits market', 'Gen Z beauty')"),
            domain: z.string().optional().describe("Domain hint to improve source routing: 'retail', 'beauty', 'fashion', 'sports', 'food', 'technology', 'culture', 'travel', 'design'. If omitted, inferred from query."),
            brands: z.array(z.string()).optional().describe("Brand names to include in demand/product lookups (e.g., ['Nike', 'Adidas']). Triggers Google Trends comparison and Amazon product search."),
            graph_ids: z.array(z.string()).optional().describe("Graph IDs from prior search results — helps refine domain inference."),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Get Market Context Data', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ query, domain, brands, graph_ids, userId: uid }) => {
            try {
                const body: Record<string, any> = { query };
                if (domain) body.domain = domain;
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
                return await handleAccessError(err, 'supplemental');
            }
        }
    );

    // --- check_supplemental_status ---
    server.tool(
        'check_supplemental_status',
        'Check the status of a long-running supplemental data gathering job. If complete, this tool returns the full JSON data payload. You MUST poll this periodically until the status is COMPLETE or FAILED.',
        {
            job_id: z.string().describe('The Job ID returned by get_supplemental_context'),
        },
        { title: 'Check Supplemental Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ job_id }) => {
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
        }
    );

    // --- get_domain_intelligence ---
    // Searches ALL PSFK curated domain graphs in parallel. Returns trends + bundled evidence.
    server.tool(
        'get_domain_intelligence',
        "Search PSFK-curated domain graphs (retail, beauty, fashion, sports, consumer electronics, F&B) for trend intelligence with bundled evidence. No graph ID needed — searches all relevant domain graphs in parallel. Returns expert-curated trends with categorized evidence (statistics, case studies, analysis, interviews) and source attribution. Use for broad industry trend research, sector analysis, or when the query spans multiple consumer categories. Preferred over web search for trend-level intelligence because results are editorially structured, not algorithmically ranked.",
        {
            query: z.string().describe("Natural language search query (e.g., 'sustainable packaging trends', 'Gen Z beauty habits')"),
            limit: z.number().optional().describe('Max trends to return (default: 10, max: 50)'),
            include_evidence: z.boolean().optional().describe('Bundle evidence for each trend (default: true)'),
            max_evidence_per_trend: z.number().optional().describe('Evidence items per trend (default: 5, max: 20)'),
            min_score: z.number().optional().describe('Minimum relevance threshold (default: 0.6)'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Search Domain Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid }) => {
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                const data = await foddaRequest('POST', '/v1/search/domain', apiKey, resolveUserId(userId, uid), body);
                const domainWithheld = await settleOrWithhold({ queryTypeCode: 'domain_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_domain_intelligence');
                if (domainWithheld) return domainWithheld;
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental');
            }
        }
    );

    // --- get_expert_intelligence ---
    // Searches ALL expert specialist graphs in parallel.
    server.tool(
        'get_expert_intelligence',
        "Search specialist knowledge graphs built by named strategists and industry leaders — contains proprietary analysis, expert interviews, and high-density statistics not available via web search. No graph ID needed — searches all expert graphs in parallel. Use when the query requires specialist depth, named-expert perspectives, or strategic frameworks beyond mainstream coverage. Expert graphs cover domains like macro strategy, wayfinding, design innovation, SXSW insights, and sector-specific research reports.",
        {
            query: z.string().describe("Natural language search query (e.g., 'tequila spirits market', 'future of work')"),
            limit: z.number().optional().describe('Max trends to return (default: 10, max: 50)'),
            include_evidence: z.boolean().optional().describe('Bundle evidence for each trend (default: true)'),
            max_evidence_per_trend: z.number().optional().describe('Evidence items per trend (default: 5, max: 20)'),
            min_score: z.number().optional().describe('Minimum relevance threshold (default: 0.6)'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Search Expert Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid }) => {
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                const data = await foddaRequest('POST', '/v1/search/expert', apiKey, resolveUserId(userId, uid), body);
                const expertWithheld = await settleOrWithhold({ queryTypeCode: 'expert_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_expert_intelligence');
                if (expertWithheld) return expertWithheld;
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental');
            }
        }
    );

    // --- get_report_intelligence ---
    // Searches ALL industry report graphs in parallel.
    server.tool(
        'get_report_intelligence',
        "Search industry report knowledge graphs for published research findings, market forecasts, and quantitative projections from organizations like DHL, PwC, Delta, and specialist research firms. Returns structured findings with bundled evidence — not raw PDFs or summaries, but editorially extracted trend data with source attribution. No graph ID needed. Use for market sizing, competitive landscape analysis, and data-heavy research where published report intelligence is more authoritative than web search results.",
        {
            query: z.string().describe("Natural language search query (e.g., 'luxury resale market size', 'electric vehicle adoption rates')"),
            limit: z.number().optional().describe('Max trends to return (default: 10, max: 50)'),
            include_evidence: z.boolean().optional().describe('Bundle evidence for each trend (default: true)'),
            max_evidence_per_trend: z.number().optional().describe('Evidence items per trend (default: 5, max: 20)'),
            min_score: z.number().optional().describe('Minimum relevance threshold (default: 0.6)'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Search Report Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ query, limit, include_evidence, max_evidence_per_trend, min_score, userId: uid }) => {
            try {
                const body: Record<string, any> = { query };
                if (limit !== undefined) body.limit = limit;
                if (include_evidence !== undefined) body.include_evidence = include_evidence;
                if (max_evidence_per_trend !== undefined) body.max_evidence_per_trend = max_evidence_per_trend;
                if (min_score !== undefined) body.min_score = min_score;

                const data = await foddaRequest('POST', '/v1/search/report', apiKey, resolveUserId(userId, uid), body);
                const reportWithheld = await settleOrWithhold({ queryTypeCode: 'report_intelligence', apiKey, userId: resolveUserId(userId, uid), query }, 'get_report_intelligence');
                if (reportWithheld) return reportWithheld;
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental');
            }
        }
    );


    // --- search_statistics ---
    server.tool(
        'search_statistics',
        "Search for specific quantitative data points — market sizes, growth rates, expert quotes, and brand case studies — directly in Fodda's knowledge graphs. Each result includes its parent trend context, enabling reverse lookup: data point → expert trend. Use this BEFORE supplemental tools when a query asks for specific numbers or statistics that Fodda's experts may have covered. Works on ALL graphs — PSFK curated graphs AND expert graphs. Try multiple graphs for coverage.",
        {
            graph_id: z.string().describe("Graph ID to search. Works on ALL graphs — PSFK curated ('retail', 'fashion', 'beauty', 'sports', 'sic', 'ce-design', 'pew') AND expert graphs. Search across multiple graphs for best coverage."),
            query: z.string().describe("What data to search for (e.g., 'luxury resale market size', 'secondhand clothing sales volume', 'Gen Z spending behavior')"),
            limit: z.number().optional().describe('Max results to return (default: 10, max: 50)'),
            min_score: z.number().optional().describe('Minimum relevance threshold, 0-1 (default: 0.60). Use 0.60 for broad queries, 0.70+ only for precise data lookups.'),
            include_signals: z.boolean().optional().describe('Also include Signal nodes (case studies, brand examples). Default: false'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.')
        },
        { title: 'Search Statistics & Data Points', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ graph_id, query, limit, min_score, include_signals, userId: uid }) => {
            try {
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
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental');
            }
        }
    );

    // --- search_insights ---
    server.tool(
        'search_insights',
        'Search for expert quotes, editorial interpretations, and qualitative evidence across knowledge graphs. Returns categorized evidence (metric, quote, interpretation, signal) with source attribution and parent trend context. Works on ALL graphs. Use when you need named-expert voices, strategic framing, or analytical perspectives on a topic — the kind of curated qualitative intelligence that web search cannot surface because it lives inside structured knowledge graphs, not on public web pages.',
        {
            graph_id: z.string().describe("Graph ID to search. Works on ALL graphs — PSFK curated ('retail', 'sic', 'beauty', 'sports', 'fashion', 'ce-design', 'pew') AND expert graphs. Search across multiple graphs for best coverage."),
            query: z.string().describe("Natural language search query. E.g. 'expert views on Gen Z luxury' or 'resale market statistics'"),
            types: z.string().optional().describe("Comma-separated evidence types to search: metric, quote, interpretation, signal, or 'all' (default: 'metric,quote,interpretation')"),
            limit: z.number().optional().describe('Max results to return (default: 10, max: 50)'),
            min_score: z.number().optional().describe('Minimum relevance threshold 0-1 (default: 0.60). Use 0.60 for broad queries, 0.70+ for precise lookups.'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.')
        },
        { title: 'Search Expert Insights', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ graph_id, query, types, limit, min_score, userId: uid }) => {
            try {
                const searchTypes = types || 'metric,quote,interpretation';
                const params = new URLSearchParams();
                params.set('query', query);
                params.set('types', searchTypes);
                if (limit !== undefined) params.set('limit', String(limit));
                if (min_score !== undefined) params.set('min_score', String(min_score));
                const path = `/v1/graphs/${graph_id}/statistics?${params.toString()}`;
                const data = await foddaRequest('GET', path, apiKey, resolveUserId(userId, uid));
                const insightsWithheld = await settleOrWithhold({ queryTypeCode: 'standalone_insights', apiKey, userId: resolveUserId(userId, uid), query }, 'search_insights');
                if (insightsWithheld) return insightsWithheld;
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                return await handleAccessError(err, 'supplemental');
            }
        }
    );


    // --- get_earnings_intelligence ---
    // Cross-company and industry-level earnings call intelligence.
    // For single-brand earnings, brand_tracker already includes earningsIntelligence.
    // This tool is for: multi-company comparisons, industry/sector filters, and explicit earnings queries.
    server.tool(
        'get_earnings_intelligence',
        'Query earnings call intelligence across companies, industries, or sectors. Returns structured evidence from public company earnings calls — management commentary, guidance, key topics, and analyst Q&A. Use for cross-company comparisons ("what are hotel companies saying about labor costs?"), industry-level queries ("earnings intelligence for consumer electronics"), or explicit earnings requests. For single-brand earnings, use brand_tracker instead — it includes earningsIntelligence automatically. Results include a source field: "knowledge_graph" (high confidence, structured Neo4j data) or "web_supplemental" (backfilled via web search). 5 API calls per use.',
        {
            ticker: z.string().optional().describe("Company stock ticker (e.g., 'NKE', 'LVMUY', 'HLT'). At least one filter required."),
            brand: z.string().optional().describe("Brand name for fuzzy matching (e.g., 'Nike', 'Marriott')"),
            industry: z.string().optional().describe("Industry filter (e.g., 'hotels', 'sportswear', 'consumer electronics')"),
            sector: z.string().optional().describe("Sector filter (e.g., 'retail', 'technology', 'travel')"),
            search: z.string().optional().describe("Free text search in earnings summaries (e.g., 'labor costs', 'tariff guidance', 'AI investment')"),
            dateFrom: z.string().optional().describe("ISO date range start (e.g., '2025-01-01')"),
            dateTo: z.string().optional().describe("ISO date range end (e.g., '2026-06-01')"),
            limit: z.number().int().optional().describe('Max results to return (default 20, max 50)'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Query Earnings Call Intelligence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ ticker, brand, industry, sector, search, dateFrom, dateTo, limit, userId: uid }) => {
            try {
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
                return await handleAccessError(err, 'supplemental');
            }
        }
    );


    // --- get_earnings_divergence ---
    // Gaps between what analysts are concerned about and how management responds.
    // This is premium intelligence — surfaces deflection and narrative mismatches.
    server.tool(
        'get_earnings_divergence',
        'Detect divergence between analyst concerns and management responses in earnings calls. Surfaces where executives are deflecting, reframing, or avoiding specific topics. Premium intelligence — shows the gap between what Wall Street is worried about and what companies are saying. Results include deflected topics, concern-vs-response framing, and connections to Fodda trends via :VALIDATES edges. Use for "where are executives deflecting?" or "divergence in [sector] earnings." 5 API calls per use.',
        {
            sector: z.string().optional().describe("Sector filter (e.g., 'retail', 'technology', 'travel')"),
            industry: z.string().optional().describe("Industry filter (e.g., 'hotels', 'sportswear', 'luxury')"),
            search: z.string().optional().describe("Free text search (e.g., 'tariffs', 'AI capex', 'margin erosion')"),
            dateFrom: z.string().optional().describe("ISO date range start"),
            dateTo: z.string().optional().describe("ISO date range end"),
            limit: z.number().int().optional().describe('Max results to return (default 10, max 25)'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Detect Earnings Call Divergence', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ sector, industry, search, dateFrom, dateTo, limit, userId: uid }) => {
            try {
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
                return await handleAccessError(err, 'supplemental');
            }
        }
    );

    // --- update_user_profile ---
    server.tool(
        'update_user_profile',
        'Save the user\'s research profile to improve the relevance of future responses. Call this after you understand the user\'s role, industry, and research needs. The profile persists across sessions — you only need to set it once, then update if their focus changes. Write BEHAVIORAL INSTRUCTIONS, not a bio. Format: one sentence of identity (who they are and how they use Fodda), then numbered directives that change how you synthesize and frame responses. Include: what evidence to prioritize, how to frame conclusions, geographic needs, and output structure preferences. Max 2000 chars per field.',
        {
            userContext: z.string().describe('Behavioral framing instructions for this person. Format: one sentence of identity, then numbered FRAMING INSTRUCTIONS. Example: "Agency strategist doing time-pressured pitches. (1) Lead with landscape orientation — top 3-5 macro forces. (2) Prioritize commercially validated signals over design concepts. (3) ALWAYS differentiate by geography. (4) Executive-ready framing — concise, pitch-deck-ready. (5) Strongest findings first, not exhaustive lists." Max 2000 chars.'),
            accountContext: z.string().optional().describe('Description of their company: industry, size, key markets, competitive position, mission. Shared across all users on this account. Max 2000 chars.'),
        },
        { title: 'Update Research Profile', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        async ({ userContext, accountContext }) => {
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
        }
    );

    // --- toggle_graph_preference ---
    server.tool(
        'toggle_graph_preference',
        'Enable or disable any knowledge graph, supplemental data source, or skill for the user. Use this when the user says "Turn off Paralogy", "Enable igloo", "Disable the economics data", or similar. The change is permanent until toggled again.',
        {
            target_id: z.string().describe('The ID of the graph, skill, or data source to toggle (e.g., "paralogy", "igloo", "retail", "get_bea_spending_snapshot"). Use the exact ID from list_graphs.'),
            enabled: z.boolean().describe('true to enable (turn on), false to disable (turn off).'),
            user_email: z.string().optional().describe('Optional. Use ONLY when operating as an Admin on behalf of another user to specify their email.')
        },
        { title: 'Toggle Graph or Skill', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        async ({ target_id, enabled, user_email }) => {
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
        }
    );

    // --- send_feedback ---
    const FEEDBACK_CATEGORY_EMOJI: Record<string, string> = {
        feedback: '💬',
        bug: '🐛',
        feature_request: '✨',
        exit_reason: '🚪',
        complaint: '😤',
    };

    server.tool(
        'send_feedback',
        'Forward user feedback, feature requests, complaints, or exit reasons to the Fodda team via email and Slack. Call this whenever a user shares feedback — including when they want to leave, report a problem, or suggest an improvement.',
        {
            feedback: z.string().describe('The user\'s feedback, complaint, suggestion, or exit reason'),
            user_email: z.string().optional().describe('User\'s email if known (for follow-up)'),
            category: z.string().optional().describe("Category: 'feedback', 'bug', 'feature_request', 'exit_reason', 'complaint'"),
        },
        { title: 'Send Feedback', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ feedback, user_email, category }) => {
            try {
                const userLabel = user_email || (userId !== 'anonymous' ? userId : 'anonymous trial user');
                const entryLabel = entryId ? ` (entry: ${entryId})` : '';
                const catLabel = category || 'general';
                const emoji = FEEDBACK_CATEGORY_EMOJI[catLabel] || '💬';

                // ── Slack alert (fire-and-forget) ──
                const slackText = [
                    `<@U0AU49JG7AS> ${emoji} *User Feedback*`,
                    `👤 ${userLabel}`,
                    `📁 Category: ${catLabel}`,
                    `📝 ${feedback}`,
                    `→ Check if this needs a response or product action.`,
                ].join('\n');
                postToSlack(slackText).catch(() => {});

                // ── Resend email ──
                const resendKey = process.env.RESEND_API_KEY;
                if (!resendKey) {
                    console.error('[send_feedback] RESEND_API_KEY not set — logging feedback locally');
                    console.error(`[FEEDBACK] category=${catLabel} email=${userLabel} feedback=${feedback}`);
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
                    to: ['piers@fodda.ai'],
                    subject,
                    text: [
                        `Category: ${catLabel}`,
                        `User: ${userLabel}${entryLabel}`,
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
        }
    );

    // --- sign_up_free_account ---
    const APP_BASE_URL = process.env.FODDA_APP_URL || 'https://app.fodda.ai';
    server.tool(
        'sign_up_free_account',
        'Create a free Fodda Base account (100 API calls/month across ALL knowledge graphs) and send a confirmation email. GUARDRAIL: only call this AFTER the user has explicitly provided their email and asked to create an account — never sign someone up proactively or with an email inferred from earlier context. Can also pass profile fields (name, job_title, company).',
        {
            email: z.string().describe('User\'s email address (required)'),
            name: z.string().optional().describe('User\'s full name (optional — collect conversationally after signup)'),
            job_title: z.string().optional().describe('User\'s job title (optional)'),
            company: z.string().optional().describe('User\'s company name (optional)'),
        },
        { title: 'Create Base Account', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ email, name, job_title, company }) => {
            try {
                // Derive firstName from name or email prefix
                const firstName: string = name
                    ? (name.split(' ')[0] || name)
                    : (email.split('@')[0] || 'User').replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

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
                                message: `I've created your Base account — you'll get ${response.data.monthlyTokens || 100} tokens/month. Check your email to confirm and then log in at https://app.fodda.ai to grab your MCP URL and update your connector.`,
                                plan: response.data.plan || 'Base',
                                monthly_token_limit: response.data.monthlyTokens || 100,
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
        }
    );

    // --- brainstorm_topic ---
    // Fourth MCP orchestration flow: Graph-native ideation via neighbor traversal.
    // Uses get_neighbors as the core mechanism to discover unexpected connections,
    // adjacent territories, and cross-domain links that text search wouldn't surface.
    server.tool(
        'brainstorm_topic',
        'Explore and brainstorm around a topic using knowledge graph connections. Unlike search (which finds what matches), this tool discovers what CONNECTS — adjacent trends, unexpected cross-domain links, key brands, and geographic hotspots. Use when the user wants to brainstorm, explore adjacencies, find inspiration, or understand the landscape around a topic. Returns a structured brainstorm map with territories to explore.',
        {
            query: z.string().describe("The topic or theme to brainstorm around (e.g., 'tequila', 'sustainable packaging', 'Gen Z beauty')"),
            depth: z.number().optional().describe('Traversal depth: 1 (immediate connections) or 2 (connections of connections). Default: 2. Use 1 for focused brainstorms, 2 for wider exploration.'),
            userId: z.string().optional().describe('Optional user identifier for trial usage tracking.'),
        },
        { title: 'Brainstorm & Explore Topic', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ query, depth, userId: uid }) => {
            try {
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
        }
    );

    // --- generate_visual ---
    server.tool(
        'generate_visual',
        'Generate a branded SVG data visualization from structured insight data. Use after research to create presentation-ready visuals. Available chart types: "cultural_shifts" (From→To transitions), "competitive_compass" (brands on 2 axes), "trend_constellation" (network of related trends), "implication_ladder" (Signal→Trend→So What→Do What), "innovation_pathway" (Now→Near-Term→Future), "opportunity_map" (2×2 white space analysis). Returns inline SVG that renders directly in the chat.',
        {
            chart_type: z.enum(['cultural_shifts', 'competitive_compass', 'trend_constellation', 'implication_ladder', 'innovation_pathway', 'opportunity_map']).describe('The type of visualization to generate'),
            data: z.string().describe('JSON string containing the chart data. Structure depends on chart_type. cultural_shifts: {shifts:[{from,to}]}. competitive_compass: {brands:[{name,x,y}], axes:{left,right,top,bottom}}. trend_constellation: {trends:[{name,x,y}], connections:[{from,to,strength}]}. implication_ladder: {signal,trend,so_what,do_what}. innovation_pathway: {now,near_term,future}. opportunity_map: {items:[{name,consumer_desire,market_activity}]}'),
        },
        { title: 'Generate Visual', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ chart_type, data }) => {
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
        }
    );

    // --- manage_scheduled_reports ---
    server.tool(
        'manage_scheduled_reports',
        'Create, list, cancel, update, pause, or resume scheduled intelligence briefings. Users can set up autonomous research that runs weekly (Mondays) or daily (Mon-Fri) at 9am in their timezone, delivered via email or Slack. Costs 20 API calls per run. Supports topic research or brand intelligence report types.',
        {
            action: z.enum(['create', 'list', 'cancel', 'update', 'pause', 'resume']),
            query: z.string().optional().describe('For "create": the research query to run'),
            email: z.string().optional().describe('Email address to deliver reports to'),
            slack_webhook: z.string().optional().describe('Optional Slack webhook URL for delivery'),
            graphs: z.array(z.string()).optional().describe('Specific graph IDs to search. Default: all accessible'),
            schedule_id: z.string().optional().describe('For cancel/update/pause/resume: the schedule ID'),
            cadence: z.enum(['weekly', 'daily']).optional()
                .describe('weekly or daily (Mon-Fri). Default: weekly'),
            timezone: z.enum(['london', 'new_york', 'san_francisco', 'sydney']).optional()
                .describe('Delivery timezone for 9am delivery. Default: new_york'),
            report_type: z.enum(['topic_research', 'brand_intelligence']).optional()
                .describe('topic_research for sector trends, brand_intelligence for competitive tracking'),
            brands: z.array(z.string()).optional()
                .describe('For brand_intelligence: brand names to track (e.g., ["Nike", "Patagonia"])'),
        },
        { title: 'Manage Scheduled Reports', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
        async ({ action, query, email, slack_webhook, graphs, schedule_id, cadence, timezone, report_type, brands }) => {
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
        }
    );

    // --- read_url ---
    server.tool(
        'read_url',
        'Extract clean text content from any URL. Use this when a user shares a link (competitor site, news article, client brief, trend report) and wants to cross-reference it against Fodda knowledge graphs. Returns structured text ready for analysis. Costs 15 API calls.',
        {
            url: z.string().describe('The URL to read and extract content from'),
            userId: z.string().optional().describe('Optional user identifier for usage tracking.')
        },
        { title: 'Read URL Content', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        async ({ url, userId: uid }) => {
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
                        tools: [{ type: 'url_context' as any }]
                    }
                );

                const outputs = result.outputs || [];
                const textParts = outputs.filter((o: any) => o.type === 'text').map((o: any) => o.text);
                const extractedText = textParts.join('\n');

                if (!extractedText) {
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
        }
    );

    // --- deep_research_topic (Skills-Based Agent via Waverunner) ---
    // Uses the fodda-researcher agent with 5 skill instruction files.
    // Flow: Pre-fetch graph data → Build skill-loaded system instruction → 
    // Call Gemini directly via waverunnerRequest → Stream progress via sendLoggingMessage.
    server.tool(
        'deep_research_topic',
        'Launch an autonomous Deep Research session that combines Fodda knowledge graph intelligence with live web research to produce a comprehensive editorial-quality report. The Research Agent plans its own strategy, searches multiple graphs, validates with institutional data, and synthesizes into a narrative brief with inline source citations. Use for complex, multi-faceted questions that need both curated expert intelligence AND current web context — e.g., strategic briefings, market landscape reports, competitive deep dives. Depth: "light" (20 API calls, faster single-pass) or "heavy" (30 API calls, comprehensive multi-pass with validation).',
        {
            query: z.string().describe('The research query/topic'),
            graphId: z.string().optional().describe('Optional specific graph ID to limit the research to'),
            depth: z.enum(['light', 'heavy']).optional().describe('Research depth: "light" for faster single-pass (20 API calls), "heavy" for comprehensive multi-pass (30 API calls). Defaults to "light".'),
            userId: z.string().optional().describe('Optional user identifier.')
        },
        { title: 'Deep Research Topic', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async ({ query, graphId, depth, userId: uid }) => {
            const resolvedUserId = resolveUserId(userId, uid);
            const isHeavy = depth === 'heavy';
            const tokenCost = isHeavy ? 3 : 2; // Waverunner trial pool tokens
            const queryTypeCode = isHeavy ? 'deep_research_heavy' : 'deep_research_light';
            const maxGraphs = isHeavy ? 15 : 8;
            const startTime = Date.now();

            // ── SPT pre-run coverage: refuse before kicking off the (long, expensive) job ──
            const researchGuard = sptGuard(queryTypeCode);
            if (researchGuard) return researchGuard;

            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'deep_research');

                // ── Phase 1: Planning ──
                await server.sendLoggingMessage({
                    level: 'info',
                    data: `📋 Phase 1/5: Planning research approach for "${query.slice(0, 80)}"...`,
                });
                console.error(`[deep_research_topic] Starting ${isHeavy ? 'heavy' : 'light'} research: "${query}"`);

                // Determine relevant graphs
                const relevantGraphs = graphId
                    ? [{ graph: { graph_id: graphId } as any }]
                    : getRelevantGraphs(query).slice(0, maxGraphs);
                const graphIds = relevantGraphs.map(g => g.graph.graph_id);

                // ── Phase 2: Searching Fodda Knowledge Graphs ──
                await server.sendLoggingMessage({
                    level: 'info',
                    data: `🔍 Phase 2/5: Searching ${graphIds.length} knowledge graph${graphIds.length !== 1 ? 's' : ''}...`,
                });

                // Pre-fetch graph data in parallel
                const graphSearchPromises = graphIds.map(async (gid) => {
                    try {
                        const searchBody = { query, limit: isHeavy ? 10 : 5, use_semantic: true, include_evidence: true };
                        const res = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(gid)}/search`, apiKey, resolvedUserId, searchBody);
                        const rows = res?.rows || [];
                        const evidence = rows.flatMap((r: any) => r.evidence || []);
                        return { graphId: gid, rows, evidence };
                    } catch {
                        return { graphId: gid, rows: [], evidence: [] };
                    }
                });

                const graphResults = await Promise.all(graphSearchPromises);
                const totalTrends = graphResults.reduce((sum, g) => sum + g.rows.length, 0);
                const totalEvidence = graphResults.reduce((sum, g) => sum + g.evidence.length, 0);
                const activeGraphs = graphResults.filter(g => g.rows.length > 0);

                // Graceful degradation: if all graph searches failed, the agent
                // proceeds using ONLY Google Search + URL Context. The report will
                // be web-only but still useful — no hard failure.
                if (activeGraphs.length === 0) {
                    console.error(`[deep_research_topic] All ${graphIds.length} graph searches failed — proceeding with web-only research`);
                    await server.sendLoggingMessage({
                        level: 'warning',
                        data: `⚠️ Knowledge graph search returned no results — proceeding with web-only research...`,
                    });
                } else {
                    await server.sendLoggingMessage({
                        level: 'info',
                        data: `📊 Found ${totalTrends} trend${totalTrends !== 1 ? 's' : ''} and ${totalEvidence} evidence pieces across ${activeGraphs.length} graph${activeGraphs.length !== 1 ? 's' : ''}. Launching deep analysis...`,
                    });
                }

                // ── Phase 3: Deep Analysis via Gemini ──
                await server.sendLoggingMessage({
                    level: 'info',
                    data: `🧠 Phase 3/5: Deep analysis with web research — this takes 1-3 minutes...`,
                });

                // Build graph context for the agent
                const graphContext: GraphContext = {
                    graphResults: JSON.stringify(graphResults.map(g => ({
                        graph_id: g.graphId,
                        trends: g.rows.map((r: any) => ({
                            name: String(r.title || r.trendName || '').substring(0, 150),
                            summary: String(r.summary || r.description || '').substring(0, 600),
                            signal_score: r.signal_score || r.score,
                            lifecycle: r.trendLifecycle || r.lifecycle,
                            evidence: (r.evidence || []).slice(0, 3).map((e: any) => ({
                                title: String(e.title || '').substring(0, 150),
                                snippet: String(e.snippet || e.summary || '').substring(0, 400),
                                source_url: e.sourceUrl || e.url,
                                category: e.category || e.type,
                            }))
                        })),
                        // Top-level evidence sample for cross-trend validation
                        evidence: g.evidence.slice(0, isHeavy ? 10 : 5).map((e: any) => ({
                            title: String(e.title || '').substring(0, 150),
                            snippet: String(e.snippet || e.summary || '').substring(0, 400),
                            source_url: e.sourceUrl || e.url,
                            category: e.category || e.type,
                            brand: e.brandNames?.[0] || e.brand,
                        })),
                    })), null, 2),
                    graphsSearched: activeGraphs.map(g => g.graphId),
                    totalTrends,
                    totalEvidence,
                    focusGraphId: graphId,
                };

                // Build skill-loaded system instruction
                const systemInstruction = buildResearcherInstruction(query, graphContext);

                // Call Gemini directly via Waverunner with a timeout guard.
                // Without a timeout, a stuck Gemini call hangs the MCP tool response
                // indefinitely — the user sees silence until their client times out.
                const geminiModel = isHeavy ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

                // Build the Interactions API payload.
                // SDK type: BaseCreateModelInteractionParams supports system_instruction
                // (snake_case) as a top-level parameter alongside model, input, tools.
                const interactionPayload = {
                    model: geminiModel,
                    system_instruction: systemInstruction,
                    input: [
                        {
                            type: 'text',
                            text: `Research query: ${query}\n\nProduce a comprehensive research report following the skills in your system instruction. Write in editorial narrative style — like a senior strategist briefing a CMO. IMPORTANT: At the end of the report, you MUST include a "## Sources" section listing all the source URLs you used from the provided context.`,
                        },
                    ],
                    tools: [
                        { type: 'google_search' as const },
                        { type: 'url_context' as const },
                    ],
                };

                const jobId = crypto.randomUUID();
                activeResearchJobs.set(jobId, { status: 'RUNNING', result: null, error: null });

                // Run research in the background to avoid Claude Web timeout
                (async () => {
                    try {
                        let geminiPromise = waverunnerRequest(
                            'deep_dive', tokenCost, apiKey, resolvedUserId, interactionPayload
                        );

                        let result: any;
                        try {
                            result = await geminiPromise;
                        } catch (primaryErr: any) {
                            const errMsg = primaryErr?.response?.data?.error?.message || primaryErr?.message || '';
                            const isCapacity = errMsg.includes('high demand') || errMsg.includes('overloaded') || errMsg.includes('503');
                            if (isCapacity && geminiModel !== 'gemini-2.5-flash') {
                                console.error(`[deep_research_topic] ${geminiModel} capacity error — retrying with gemini-2.5-flash`);
                                interactionPayload.model = 'gemini-2.5-flash';
                                geminiPromise = waverunnerRequest(
                                    'deep_dive', tokenCost, apiKey, resolvedUserId, interactionPayload
                                );
                                result = await geminiPromise;
                            } else {
                                throw primaryErr;
                            }
                        }

                        // Extract text from Gemini response
                        const outputs = result?.outputs || [];
                        const textParts = outputs
                            .filter((o: any) => o.type === 'text')
                            .map((o: any) => o.text);
                        let reportText = textParts.join('\n\n');

                        // Extract URLs
                        const seenUrls = new Set<string>();
                        const sourceUrls: { title: string; url: string }[] = [];

                        for (const output of outputs) {
                            if (output.type === 'text' && Array.isArray(output.annotations)) {
                                for (const ann of output.annotations) {
                                    if (ann.type === 'url_citation' && ann.url && !seenUrls.has(ann.url)) {
                                        if (ann.url.includes('vertexaisearch.cloud.google.com')) continue;
                                        seenUrls.add(ann.url);
                                        sourceUrls.push({ title: ann.title || '', url: ann.url });
                                    }
                                }
                            }
                            if (output.type === 'url_context_result' && Array.isArray(output.result)) {
                                for (const ctx of output.result) {
                                    if (ctx.url && ctx.status === 'success' && !seenUrls.has(ctx.url)) {
                                        seenUrls.add(ctx.url);
                                        sourceUrls.push({ title: '', url: ctx.url });
                                    }
                                }
                            }
                        }

                        const groundingChunks = result?.groundingMetadata?.groundingChunks || [];
                        for (const chunk of groundingChunks) {
                            if (chunk?.web?.uri && !seenUrls.has(chunk.web.uri)) {
                                seenUrls.add(chunk.web.uri);
                                sourceUrls.push({ title: chunk.web.title || '', url: chunk.web.uri });
                            }
                        }

                        if (sourceUrls.length > 0) {
                            reportText += '\n\n## Sources\n' + sourceUrls.map(s =>
                                s.title ? `- [${s.title}](${s.url})` : `- ${s.url}`
                            ).join('\n');
                        }

                        if (!reportText) {
                            activeResearchJobs.set(jobId, { status: 'FAILED', error: 'Research agent returned no output.' });
                            return;
                        }

                        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

                        // ── Settlement gates delivery for SPT: only mark COMPLETE once the charge succeeds. ──
                        if (sptCtx) {
                            const r = await chargeQuery({ queryTypeCode, apiKey, userId: resolvedUserId, query, graphsSearched: graphIds, foddaRequest, spt: sptCtx.token });
                            if (!r.charged) {
                                activeResearchJobs.set(jobId, { status: 'FAILED', error: r.error || 'Payment could not be completed; report withheld.' });
                                return;
                            }
                        } else {
                            chargeQuery({ queryTypeCode, apiKey, userId: resolvedUserId, query, graphsSearched: graphIds, foddaRequest })
                                .catch(e => console.error('[deep_research_topic] chargeQuery failed:', e.message));
                        }

                        const header = [
                            `_Research by Fodda Research Agent • ${activeGraphs.length} graph${activeGraphs.length !== 1 ? 's' : ''} searched • ${totalTrends} trends analyzed • ${durationSec}s_`,
                            '',
                        ].join('\n');

                        activeResearchJobs.set(jobId, { status: 'COMPLETE', result: header + reportText });

                    } catch (err: any) {
                        const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                        activeResearchJobs.set(jobId, { status: 'FAILED', error: msg });
                    }
                })();

                return {
                    content: [{
                        type: 'text' as const,
                        text: `Deep research job started! The agent is searching the graph and the live web. Job ID: ${jobId}\n\nIMPORTANT: You must use the check_research_status tool with this Job ID to poll the status of the job and retrieve the report.`
                    }]
                };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                const msg = err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- check_research_status ---
    server.tool(
        'check_research_status',
        'Check the status of a long-running deep research job. If complete, this tool returns the final report. You MUST poll this periodically until the status is COMPLETE or FAILED.',
        {
            job_id: z.string().describe('The Job ID returned by deep_research_topic'),
        },
        { title: 'Check Research Status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ job_id }) => {
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
                return { content: [{ type: 'text' as const, text: job.result }] };
            }

            return { isError: true, content: [{ type: 'text' as const, text: `Unknown status for job ${job_id}` }] };
        }
    );

    // --- consult_analyst ---
    server.tool(
        'consult_analyst',
        'Consult a named Synthetic Analyst who answers in their expert voice using their curated knowledge graph. Each analyst has a unique methodology, domain expertise, and analytical lens that produces insights distinct from generic search or standard graph queries. Use when the user asks to talk to or consult a specific expert, or when you need a specialist perspective on culture, strategy, or innovation topics. Call list_analysts first to discover available analyst_id values. Responses may include a coverage status (in/adjacent/out), source attribution, and referrals to other expert graphs. Referrals MUST be presented in third-person platform voice (not the expert\'s voice) with an offer to query the referred graph.',
        {
            analyst_id: z.string().describe("The analyst ID (e.g., 'ben-dietz-sic')"),
            query: z.string().describe("The question or topic to discuss with the analyst"),
            company: z.string().optional().describe("Optional company name or stock ticker (e.g., 'Tesla' or 'TSLA') to bind the analyst to a specific brand context."),
            userId: z.string().optional().describe('Optional user identifier.')
        },
        { title: 'Consult Synthetic Analyst', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ analyst_id, query, company, userId: uid }) => {
            try {
                // Log query to Questions table (fire-and-forget, before cache)
                logUserQuery(query, 'consult_analyst');

                const result = await foddaRequest('POST', `/v1/analysts/consult`, apiKey, resolveUserId(userId, uid), {
                    analyst_id,
                    query,
                    company
                });
                
                // Extract the expert's answer text (legacy-compatible)
                const reportText = typeof result.result === 'string'
                    ? result.result
                    : (typeof result.report === 'string' ? result.report : JSON.stringify(result, null, 2));

                const parts: string[] = [reportText];

                // Surface server-side timing for observability
                if (result.timing_ms != null) {
                    parts.push(`\n--- TIMING: ${result.timing_ms}ms server-side ---`);
                }

                // --- Structured envelope fields (Phase 2 Digital Twin) ---
                if (result.coverage) {
                    parts.push(`\n--- COVERAGE: ${result.coverage} ---`);
                }
                if (result.sources_used && Array.isArray(result.sources_used) && result.sources_used.length > 0) {
                    const sourceLines = result.sources_used.map((s: any) =>
                        s.url ? `- ${s.label || s.name || 'Source'}: ${s.url}` : `- ${s.label || s.name || 'Source'}`
                    );
                    parts.push(`--- SOURCES USED ---\n${sourceLines.join('\n')}`);
                }
                if (result.referrals && Array.isArray(result.referrals) && result.referrals.length > 0) {
                    const refLines = result.referrals.map((r: any, i: number) =>
                        `${i + 1}. ${r.name} by ${r.curator || 'unknown'} — ${r.reason || 'related expertise'}`
                    );
                    parts.push(`--- REFERRALS (deliver these in 3rd person as the platform, NOT in the expert's voice) ---\n${refLines.join('\n')}`);
                }
                if (result.speaker_note) {
                    parts.push(`--- SPEAKER NOTE: ${result.speaker_note} ---`);
                }

                const consultWithheld = await settleOrWithhold({ queryTypeCode: 'expert_agent', apiKey, userId: resolveUserId(userId, uid), query }, 'consult_analyst');
                if (consultWithheld) return consultWithheld;
                return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
            } catch (err: any) {
                const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
                if (trialResult) return trialResult;
                // Surface timeout explicitly so clients get actionable guidance
                if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
                        error: `Analyst consultation timed out (60s). The upstream API is processing a complex query with tool calls. Retry in a moment, or use search_graph / get_expert_intelligence for faster results.`,
                        analyst_id,
                        timeout: true
                    }) }] };
                }
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    return server;
}
