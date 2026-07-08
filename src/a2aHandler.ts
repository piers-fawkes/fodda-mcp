/**
 * A2A (Agent-to-Agent) Protocol Handler
 *
 * Implements JSON-RPC 2.0 over HTTP per the A2A v1.0 specification.
 * MVP: Supports `message/send` only — receives a natural language task,
 * routes it through Fodda's existing tool handlers, and returns
 * structured results as A2A Task artifacts.
 *
 * A2A vs MCP:
 *  - MCP: client agent calls Fodda tools directly (tool-level granularity)
 *  - A2A: client agent delegates a *task* in natural language; Fodda decides
 *         which tools to use and returns the synthesized result
 *
 * Spec: https://a2a-protocol.org/latest/specification/
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { MCP_SERVER_VERSION } from './tools.js';
import type { FoddaRequestFn, WaverunnerRequestFn } from './types.js';
import { runDeepResearch } from './deepResearch.js';
import { chargeQuery } from './pricingCache.js';

// ---------------------------------------------------------------------------
// A2A Agent Card — the discovery document agents/registries fetch to learn
// what Fodda can do. Served at /.well-known/agent-card.json (A2A standard).
// Skills reflect what the /a2a endpoint can actually fulfil (the classifier's
// routes), so we never advertise a capability we can't deliver.
// ---------------------------------------------------------------------------
const AGENT_CARD = {
    protocolVersion: '0.3.0',
    name: 'Fodda Research Agent',
    description:
        "Expert-curated trend, brand, research, and earnings intelligence from named experts' knowledge graphs (220+ graphs across retail, beauty, sports, finance, and institutional data). Delegate a task in natural language — Fodda selects the right tools and returns a synthesized result. Pay per task via Stripe Shared Payment Token; no account required.",
    url: 'https://mcp.fodda.ai/a2a',
    preferredTransport: 'JSONRPC',
    version: MCP_SERVER_VERSION,
    provider: { organization: 'Fodda (PSFK)', url: 'https://www.fodda.ai' },
    documentationUrl: 'https://www.fodda.ai/llms.txt',
    iconUrl: 'https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddafavicon.png',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
        {
            id: 'brand-intelligence',
            name: 'Brand Intelligence',
            description: "Track a brand's trend footprint, competitive context, and market signals across expert-curated graphs.",
            tags: ['brand', 'competitive', 'intelligence'],
            examples: ['What is Nike doing?', 'Brand intelligence for Patagonia'],
        },
        {
            id: 'trend-search',
            name: 'Trend Search',
            description: 'Search expert-curated knowledge graphs for trends with supporting evidence and source attribution.',
            tags: ['trends', 'search', 'research'],
            examples: ['sustainable packaging trends', 'Gen Z beauty habits'],
        },
        {
            id: 'deep-research',
            name: 'Deep Research',
            description: 'Full multi-source autonomous research: expert-curated knowledge graphs, '
                + 'earnings-call intelligence, and institutional data, synthesized into a cited '
                + 'editorial report. Returned as an async task — poll tasks/get for the result. '
                + 'API key required; SPT support coming.',
            tags: ['research', 'report', 'analysis'],
            examples: ['comprehensive report on Gen Z luxury', 'detailed analysis of the resale market'],
        },
        {
            id: 'earnings-intelligence',
            name: 'Cross-Company Earnings Themes',
            description: 'Surface cross-company and industry-level themes from earnings calls — analyst concerns, management commentary, guidance trends, and divergence detection across sectors.',
            tags: ['earnings', 'financial', 'intelligence', 'cross-company'],
            examples: ['what are hotel companies saying about labor costs', 'where are executives deflecting on margins'],
        },
        {
            id: 'per-ticker-earnings',
            name: 'Per-Ticker Earnings Intelligence',
            description: 'The strategic truth layer per company: what analysts pressed on, where management deflected, marketing/retail/tech/sustainability activity, CEO intelligence, and market-validated consumer trends — quarterly records with multi-quarter history for 500+ consumer-sector companies.',
            tags: ['earnings', 'analyst-pressure', 'activity', 'validated-trends'],
            examples: [
                "What are analysts pressing Nike on?",
                'Compare how Lululemon and On Running talk about growth',
                "Show me Costco's analyst Q&A themes",
                'Which consumer trends do KR\'s earnings validate?',
            ],
        },
        {
            id: 'expert-consult',
            name: 'Expert Consult',
            description: "Consult a named Human Agent — a real expert's digital twin that answers in their voice and researches across expert graphs, earnings calls, and market data on your behalf.",
            tags: ['expert', 'consult', 'analyst'],
            examples: ['Consult Ben Dietz about culture-led brand strategy', 'Ask Anu Lingala about 2026 macro trends'],
        },
        {
            // Phase C: skill-based deliverables. One static capability skill for
            // now; once offerings are seeded (C1), derive one card skill per live
            // offering (key, price, example_brief) from the analyst offerings.
            id: 'commissioned-deliverable',
            name: 'Commissioned Deliverable',
            description: 'Commission a finished document from an analyst — a marketing plan, deck review, or trend briefing. The analyst researches, then produces the document in the background; returned as an async job (poll for the artifact). Priced per offering; see each analyst\'s offerings.',
            tags: ['deliverable', 'document', 'analyst', 'async'],
            examples: ['Commission a marketing plan from Ben Dietz for a Gen-Z skincare launch', 'Ask for a trend briefing deliverable on resale'],
        },
    ],
};

// ---------------------------------------------------------------------------
// A2A Task Store — in-memory, same pattern as activeResearchJobs in toolHandlers.
// Known limitation: tasks lost on restart/redeploy (in-memory under min-instances=1).
// ---------------------------------------------------------------------------

interface A2ATaskRecord {
    task: A2ATask;
    createdAt: number;
}
const a2aTasks = new Map<string, A2ATaskRecord>();

// TTL sweep: terminal tasks (completed/failed/canceled) evicted after 30 min;
// non-terminal tasks (working/submitted) auto-failed after 15 min (pipeline hung).
const A2A_TERMINAL_TTL_MS = 30 * 60 * 1000;
const A2A_WORKING_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [id, record] of a2aTasks) {
        const age = now - record.createdAt;
        const state = record.task.status.state;
        const isTerminal = state === 'completed' || state === 'failed' || state === 'canceled';
        if (isTerminal && age > A2A_TERMINAL_TTL_MS) {
            a2aTasks.delete(id);
        } else if (!isTerminal && age > A2A_WORKING_TTL_MS) {
            record.task.status = {
                state: 'failed',
                message: { role: 'agent', parts: [{ kind: 'text', text: 'Research timed out after 15 minutes.' }] },
            };
            console.error(`[a2a] Task ${id} auto-failed: exceeded ${A2A_WORKING_TTL_MS / 60000}min working TTL`);
        }
    }
}, 60_000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface A2AJsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number | null;
    method: string;
    params?: any;
}

interface A2APart {
    kind?: 'text' | 'data' | 'file';   // A2A v1.0 spec
    type?: 'text' | 'data' | 'file';   // Google / older A2A variants
    text?: string;
    data?: any;
    mimeType?: string;
}

interface A2AMessage {
    role: 'user' | 'agent';
    parts: A2APart[];
}

interface A2ATask {
    id: string;
    contextId: string;
    status: {
        state: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
        message?: A2AMessage;
    };
    artifacts?: Array<{
        name?: string;
        description?: string;
        parts: A2APart[];
    }>;
}

// ---------------------------------------------------------------------------
// Query intent classifier — decides which Fodda tool to invoke
// ---------------------------------------------------------------------------

type ToolRoute =
    | { tool: 'search_graph'; params: { query: string; graphId?: string } }
    | { tool: 'brand_tracker'; params: { brand_name: string } }
    | { tool: 'deep_research'; params: { query: string; depth: 'light' | 'heavy' } }
    | { tool: 'earnings'; params: { query: string } }
    | { tool: 'company_earnings'; params: { ticker: string; query: string } }
    | { tool: 'consult'; params: { expert_name: string; query: string } };

function classifyIntent(text: string): ToolRoute {
    const lower = text.toLowerCase();

    // Expert consult triggers: "Consult Ben Dietz about X", "Ask Anu Lingala: ..."
    const consultMatch = text.match(/^\s*(?:consult|ask)\s+([A-Z][A-Za-z .'-]{2,40}?)\s*(?:about|on|regarding|:)\s+(.+)/i);
    if (consultMatch && consultMatch[1] && consultMatch[2]) {
        return { tool: 'consult', params: { expert_name: consultMatch[1].trim(), query: consultMatch[2].trim() } };
    }

    // Brand-focused queries
    const brandMatch = lower.match(
        /(?:what is |what's |tell me about |brand (?:intelligence|profile|tracker) (?:for |on )?|track )([a-z][a-z0-9 &'.-]{1,30}?)(?:\s+(?:doing|strategy|innovation|positioning|trends?))?$/i
    );
    if (brandMatch && brandMatch[1]) {
        return { tool: 'brand_tracker', params: { brand_name: brandMatch[1].trim() } };
    }

    // Explicit brand mentions with "what is X doing" pattern
    const doingMatch = text.match(/what (?:is|are) ([A-Z][A-Za-z0-9 &'.-]{1,30}?) doing/);
    if (doingMatch && doingMatch[1]) {
        return { tool: 'brand_tracker', params: { brand_name: doingMatch[1].trim() } };
    }

    // Deep research triggers
    if (lower.includes('deep research') || lower.includes('comprehensive report') ||
        lower.includes('write me a report') || lower.includes('detailed analysis')) {
        return { tool: 'deep_research', params: { query: text, depth: 'light' } };
    }

    // Per-ticker earnings triggers: SWOT, sentiment, guidance, "[ticker] earnings", compare tickers
    // Must be BEFORE the generic earnings trigger to catch specific per-company queries.
    const tickerMatch = lower.match(/(?:earnings|swot|sentiment|guidance|q\&?a)\s+(?:for\s+)?([A-Z]{1,5})\b/i)
        || lower.match(/\b([A-Z]{1,5})(?:'s)?\s+(?:earnings|swot|sentiment|guidance|q\&?a)\b/i);
    if (tickerMatch && tickerMatch[1]) {
        return { tool: 'company_earnings', params: { ticker: tickerMatch[1].toUpperCase(), query: text } };
    }
    if (lower.includes('swot') || lower.includes('ceo sentiment') || lower.includes('analyst sentiment') ||
        lower.match(/(?:raised|cut|withdrawn)\s+guidance/) || lower.includes('guidance changes') ||
        lower.match(/compare\s+(?:earnings|swot|sentiment)/)) {
        return { tool: 'company_earnings', params: { ticker: '', query: text } };
    }

    // Cross-company / thematic earnings triggers
    if (lower.includes('earnings') || lower.includes('q1 ') || lower.includes('q2 ') ||
        lower.includes('q3 ') || lower.includes('q4 ') || lower.match(/what (?:are|did) .+ (?:companies|brands) say/)) {
        return { tool: 'earnings', params: { query: text } };
    }

    // Default: search_graph (the most general tool)
    return { tool: 'search_graph', params: { query: text } };
}

// ---------------------------------------------------------------------------
// Tool execution — calls existing Fodda API endpoints
// ---------------------------------------------------------------------------

// FoddaRequestFn imported from ./types.js above

async function executeQuery(
    route: ToolRoute,
    apiKey: string,
    userId: string,
    foddaRequest: FoddaRequestFn,
): Promise<{ text: string; data?: any; asyncDeepResearch?: any }> {
    switch (route.tool) {
        case 'search_graph': {
            // Search ALL graphs (no graphId = all-graph parallel search)
            const body = {
                query: route.params.query,
                limit: 10,
                use_semantic: true,
                include_evidence: true,
            };
            const result = await foddaRequest('POST', '/v1/graphs/search', apiKey, userId, body);
            const rows = result?.rows || [];
            if (rows.length === 0) {
                return { text: `No trends found for: "${route.params.query}". Fodda's knowledge graphs may not have coverage on this specific topic.`, data: result };
            }

            // Build a concise markdown summary
            const lines: string[] = [];
            lines.push(`## Fodda Trend Intelligence: ${route.params.query}\n`);
            lines.push(`_${rows.length} trends found across Fodda's expert-curated knowledge graphs._\n`);

            for (const row of rows.slice(0, 8)) {
                const score = row.signal_score ? ` (signal: ${row.signal_score})` : '';
                const lifecycle = row.trendLifecycle ? ` · ${row.trendLifecycle}` : '';
                const graph = row.graphName ? ` — _${row.graphName}_` : '';
                lines.push(`### ${row.title || row.trendName}${score}${lifecycle}`);
                if (row.summary || row.description) {
                    lines.push((row.summary || row.description).substring(0, 300));
                }
                if (row.evidence && row.evidence.length > 0) {
                    lines.push('');
                    for (const ev of row.evidence.slice(0, 3)) {
                        const link = ev.sourceUrl ? ` — [source](${ev.sourceUrl})` : '';
                        lines.push(`- ${(ev.title || ev.snippet || '').substring(0, 150)}${link}`);
                    }
                }
                lines.push(`${graph}\n`);
            }

            return { text: lines.join('\n'), data: result };
        }

        case 'brand_tracker': {
            const body = { brand_name: route.params.brand_name };
            const result = await foddaRequest('POST', '/v1/brands/intelligence', apiKey, userId, body);

            const lines: string[] = [];
            lines.push(`## Brand Intelligence: ${route.params.brand_name}\n`);

            if (result?.trend_footprint) {
                lines.push(`_Appears in ${result.trend_footprint.length} trends across ${result.cross_graph_presence?.length || 0} knowledge graphs._\n`);
                for (const t of (result.trend_footprint || []).slice(0, 6)) {
                    const score = t.signal_score ? ` (signal: ${t.signal_score})` : '';
                    lines.push(`- **${t.trend_name}**${score} · ${t.lifecycle || 'unknown'} — ${t.graph_name || ''}`);
                }
            }

            if (result?.competitive_context?.co_occurring?.length > 0) {
                lines.push(`\n### Competitive Context`);
                for (const c of result.competitive_context.co_occurring.slice(0, 5)) {
                    lines.push(`- ${c.brand} (${c.pressure_type})`);
                }
            }

            return { text: lines.join('\n') || JSON.stringify(result, null, 2), data: result };
        }

        case 'company_earnings': {
            // Per-ticker earnings — route to the snapshot endpoint if a ticker was captured,
            // otherwise fall through to the guidance-changes endpoint for thematic queries.
            if (route.params.ticker) {
                const result = await foddaRequest('GET', `/v1/earnings/company/${encodeURIComponent(route.params.ticker)}`, apiKey, userId);
                const lines: string[] = [];
                lines.push(`## Earnings Intelligence: ${route.params.ticker}\n`);
                if (result?.swot) lines.push(`**SWOT Score:** ${result.swot.total || 'N/A'}`);
                if (result?.sentiment) lines.push(`**CEO Sentiment:** ${result.sentiment.ceo || 'N/A'} · **Analyst Sentiment:** ${result.sentiment.analyst || 'N/A'}`);
                if (result?.guidance?.status) lines.push(`**Guidance:** ${result.guidance.status}`);
                if (result?.period) lines.push(`\n_Period: ${result.period}_`);
                return { text: lines.join('\n') || JSON.stringify(result, null, 2), data: result };
            }
            // No ticker — likely a guidance/compare query, use guidance-changes
            const result = await foddaRequest('GET', '/v1/earnings/guidance-changes', apiKey, userId);
            return { text: result?.summary || JSON.stringify(result, null, 2), data: result };
        }

        case 'earnings': {
            const body = { query: route.params.query, limit: 10 };
            const result = await foddaRequest('POST', '/v1/earnings/search', apiKey, userId, body);
            return {
                text: result?.summary || JSON.stringify(result, null, 2),
                data: result,
            };
        }

        case 'consult': {
            // Resolve the free-text expert name against the public analyst roster
            const roster = await foddaRequest('GET', '/v1/analysts', apiKey, userId);
            const analysts: any[] = Array.isArray(roster?.analysts) ? roster.analysts
                : Array.isArray(roster) ? roster : [];
            const wanted = route.params.expert_name.toLowerCase();
            const match = analysts.find(a => {
                const name = String(a?.name || '').toLowerCase();
                return name && (name.includes(wanted) || wanted.includes(name));
            });
            if (!match) {
                const names = analysts.map(a => a?.name).filter(Boolean).slice(0, 10).join(', ');
                return { text: `No Fodda expert matched "${route.params.expert_name}". Available experts include: ${names || 'none listed'}.` };
            }
            const result = await foddaRequest('POST', '/v1/analysts/consult', apiKey, userId, {
                analyst_id: match.id,
                query: route.params.query,
            });
            const lines: string[] = [];
            lines.push(`## Consulting ${match.name}\n`);
            if (result?.result) lines.push(result.result);
            if (Array.isArray(result?.referrals) && result.referrals.length > 0) {
                const refs = result.referrals.map((r: any) => r?.name).filter(Boolean).join(', ');
                if (refs) lines.push(`\n_Also worth checking: ${refs}_`);
            }
            return { text: lines.join('\n') || JSON.stringify(result, null, 2), data: result };
        }

        case 'deep_research': {
            // Deep research returns source_plan synchronously for routing
            // visibility, but the report itself is async — caller must poll
            // tasks/get. This replaces the sync MVP that just ran graphs/search.
            return { text: '__ASYNC_DEEP_RESEARCH__', data: null, asyncDeepResearch: route.params };
        }
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function jsonRpcSuccess(id: string | number | null, result: any) {
    return { jsonrpc: '2.0' as const, id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any) {
    return { jsonrpc: '2.0' as const, id, error: { code, message, ...(data ? { data } : {}) } };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerA2ARoute(
    app: Express,
    foddaRequest: FoddaRequestFn,
    waverunnerRequest: WaverunnerRequestFn,
): void {
    // ── A2A Agent Card discovery (skills catalog) ──
    const serveAgentCard = (_req: Request, res: Response) => res.json(AGENT_CARD);
    app.get('/.well-known/agent-card.json', serveAgentCard); // A2A current standard
    app.get('/.well-known/agent.json', serveAgentCard);      // legacy alias

    app.post('/a2a', async (req: Request, res: Response) => {
        // ── Parse & validate JSON-RPC envelope ──
        const body = req.body as A2AJsonRpcRequest;

        if (!body || body.jsonrpc !== '2.0') {
            return res.status(400).json(
                jsonRpcError(body?.id ?? null, -32600, 'Invalid Request: missing jsonrpc 2.0 field')
            );
        }

        const requestId = body.id ?? null;

        // ── Method dispatch ──
        switch (body.method) {
            case 'message/send':
                break; // handled below

            case 'message/stream':
            case 'tasks/list':
                return res.json(
                    jsonRpcError(requestId, -32601, `Method not found: ${body.method}. Supported: message/send, tasks/get, tasks/cancel.`)
                );

            case 'tasks/get': {
                const taskId = body.params?.id;
                if (!taskId) {
                    return res.json(jsonRpcError(requestId, -32602, 'Invalid params: id is required'));
                }
                const record = a2aTasks.get(taskId);
                if (!record) {
                    return res.json(jsonRpcError(requestId, -32602, `Task not found: ${taskId}`));
                }
                return res.json(jsonRpcSuccess(requestId, record.task));
            }

            case 'tasks/cancel': {
                const taskId = body.params?.id;
                if (!taskId) {
                    return res.json(jsonRpcError(requestId, -32602, 'Invalid params: id is required'));
                }
                const record = a2aTasks.get(taskId);
                if (!record) {
                    return res.json(jsonRpcError(requestId, -32602, `Task not found: ${taskId}`));
                }
                // Only cancel if still working
                if (record.task.status.state === 'working' || record.task.status.state === 'submitted') {
                    record.task.status = {
                        state: 'canceled',
                        message: { role: 'agent', parts: [{ kind: 'text', text: 'Task canceled by caller.' }] },
                    };
                    console.error(`[a2a] Task ${taskId} canceled`);
                }
                return res.json(jsonRpcSuccess(requestId, record.task));
            }

            default:
                return res.json(
                    jsonRpcError(requestId, -32601, `Method not found: ${body.method}`)
                );
        }

        // ── Extract user text from message parts ──
        const message = body.params?.message as A2AMessage | undefined;
        if (!message?.parts?.length) {
            return res.json(
                jsonRpcError(requestId, -32602, 'Invalid params: message.parts is required and must be non-empty')
            );
        }

        // Accept the three A2A part shapes seen in the wild: A2A v1.0 spec ({ kind:'text' }),
        // the Google/older variant ({ type:'text' }), and bare ({ text }) — see Brief A2A Part Format Fix.
        const textPart = message.parts.find(p => {
            if (!p.text) return false;
            if (p.kind === 'text') return true;   // A2A v1.0 spec
            if (p.type === 'text') return true;   // Google variant
            if (!p.kind && !p.type) return true;  // bare { text: "..." }
            return false;
        });
        if (!textPart?.text) {
            return res.json(
                jsonRpcError(requestId, -32602, 'Invalid params: no text part found in message')
            );
        }

        const queryText = textPart.text;

        // ── Authentication ──
        // Accept: Authorization: Bearer <key>, X-API-Key header, or api_key query param
        const apiKey = (req.headers['authorization']?.toString().replace(/^Bearer\s+/i, ''))
            || (req.headers['x-api-key'] as string)
            || (req.query.api_key as string)
            || '';

        const userId = (req.headers['x-user-id'] as string)
            || (req.query.user_id as string)
            || 'a2a-agent';

        // For unauthenticated requests (health probes), return a minimal valid response
        if (!apiKey) {
            const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;
            const contextId = `ctx-${crypto.randomUUID().slice(0, 8)}`;

            return res.json(jsonRpcSuccess(requestId, {
                id: taskId,
                contextId,
                status: { state: 'completed' },
                artifacts: [{
                    name: 'health_check',
                    parts: [{
                        kind: 'text',
                        text: 'Fodda A2A endpoint is operational. Provide an API key via Authorization: Bearer <key> for full access to trend intelligence. Get a key at https://app.fodda.ai',
                    }],
                }],
            } as A2ATask));
        }

        // ── Route and execute ──
        try {
            const route = classifyIntent(queryText);
            console.error(`[a2a] message/send: "${queryText.substring(0, 80)}" → ${route.tool}`);

            const result = await executeQuery(route, apiKey, userId, foddaRequest);

            // ── Async deep research path ──
            if (result.asyncDeepResearch) {
                const drParams = result.asyncDeepResearch as { query: string; depth: 'light' | 'heavy' };
                const queryTypeCode = drParams.depth === 'heavy' ? 'deep_research_heavy' : 'deep_research_light';

                // Log to Questions ledger (fire-and-forget, same as MCP)
                foddaRequest('POST', '/v1/log/question', apiKey, userId, {
                    question: drParams.query,
                    graphId: 'all',
                    interactionType: 'deep_research',
                    source: 'a2a',
                }).catch(() => {});

                // Pre-authorize billing — refuse before spending compute
                const billingResult = await chargeQuery({
                    queryTypeCode,
                    apiKey,
                    userId,
                    query: drParams.query,
                    foddaRequest,
                });
                if (!billingResult.charged) {
                    const errMsg = billingResult.error || 'Billing pre-authorization failed';
                    console.error(`[a2a] Deep research billing rejected: ${errMsg}`);
                    return res.json(
                        jsonRpcError(requestId, -32001, `Billing failed: ${errMsg}`)
                    );
                }

                // Create task in working state
                const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;
                const contextId = `ctx-${crypto.randomUUID().slice(0, 8)}`;
                const task: A2ATask = {
                    id: taskId,
                    contextId,
                    status: {
                        state: 'working',
                        message: { role: 'agent', parts: [{ kind: 'text', text: 'Deep research in progress — poll tasks/get for the result.' }] },
                    },
                };
                a2aTasks.set(taskId, { task, createdAt: Date.now() });

                // Run the real pipeline in the background
                (async () => {
                    try {
                        const drResult = await runDeepResearch({
                            query: drParams.query,
                            apiKey,
                            userId,
                            depth: drParams.depth,
                            foddaRequest,
                            waverunnerRequest,
                            onProgress: (msg) => console.error(`[a2a][${taskId}] ${msg}`),
                        });

                        // Check if canceled during run
                        const current = a2aTasks.get(taskId);
                        if (current && current.task.status.state === 'canceled') {
                            console.error(`[a2a] Task ${taskId} was canceled during research — discarding result`);
                            return;
                        }

                        // Mark completed with artifacts
                        if (current) {
                            current.task.status = { state: 'completed' };
                            current.task.artifacts = [
                                {
                                    name: 'research_report',
                                    description: `Deep research report: ${drParams.query.substring(0, 100)}`,
                                    parts: [{ kind: 'text', text: drResult.report }],
                                },
                                {
                                    name: 'source_plan',
                                    description: 'Source routing plan — which graphs, earnings, and supplemental sources were selected and why',
                                    parts: [{ kind: 'data', data: drResult.source_plan, mimeType: 'application/json' }],
                                },
                            ];
                        }
                        console.error(`[a2a] Task ${taskId} completed (${drResult.duration_sec}s, ${drResult.graphs_searched.length} graphs)`);

                    } catch (err: any) {
                        const errMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Research failed';
                        const current = a2aTasks.get(taskId);
                        if (current && current.task.status.state !== 'canceled') {
                            current.task.status = {
                                state: 'failed',
                                message: { role: 'agent', parts: [{ kind: 'text', text: errMsg }] },
                            };
                        }
                        console.error(`[a2a] Task ${taskId} failed: ${errMsg}`);
                    }
                })();

                return res.json(jsonRpcSuccess(requestId, task));
            }

            // ── Synchronous path (trend-search, brand, earnings, consult) ──
            const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;
            const contextId = `ctx-${crypto.randomUUID().slice(0, 8)}`;

            // Build artifacts — always include markdown text, optionally raw JSON
            const artifacts: A2ATask['artifacts'] = [
                {
                    name: 'research_result',
                    description: `Fodda intelligence for: ${queryText.substring(0, 100)}`,
                    parts: [{ kind: 'text', text: result.text }],
                },
            ];

            // Include raw data as a structured artifact if the client accepts JSON
            const acceptedOutputs = body.params?.configuration?.acceptedOutputModes || [];
            if (acceptedOutputs.includes('application/json') && result.data) {
                artifacts.push({
                    name: 'raw_data',
                    description: 'Structured JSON data from Fodda knowledge graphs',
                    parts: [{ kind: 'data', data: result.data, mimeType: 'application/json' }],
                });
            }

            return res.json(jsonRpcSuccess(requestId, {
                id: taskId,
                contextId,
                status: { state: 'completed' },
                artifacts,
            } as A2ATask));

        } catch (err: any) {
            const statusCode = err.response?.status;
            const errMsg = err.response?.data?.error?.message || err.message || 'Internal error';

            console.error(`[a2a] Error: ${errMsg}`);

            // Map known error types to appropriate JSON-RPC error codes
            if (statusCode === 401 || statusCode === 403) {
                return res.json(
                    jsonRpcError(requestId, -32001, `Unauthorized: ${errMsg}`)
                );
            }

            return res.json(
                jsonRpcError(requestId, -32603, `Fodda query failed: ${errMsg}`)
            );
        }
    });

    console.error('[a2a] A2A endpoint registered at POST /a2a (+ agent card at /.well-known/agent-card.json)');
}
