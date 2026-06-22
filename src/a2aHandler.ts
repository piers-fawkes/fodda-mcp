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
    documentationUrl: 'https://fodda.ai/llms.txt',
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
            description: "Synthesize a multi-trend research summary across Fodda's graph network for a topic.",
            tags: ['research', 'report', 'analysis'],
            examples: ['comprehensive report on Gen Z luxury', 'detailed analysis of the resale market'],
        },
        {
            id: 'earnings-intelligence',
            name: 'Earnings Intelligence',
            description: 'Surface what public companies say on earnings calls — guidance, key topics, and analyst Q&A.',
            tags: ['earnings', 'financial', 'intelligence'],
            examples: ['what are hotel companies saying about labor costs', 'Nike earnings highlights'],
        },
    ],
};

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
    kind: 'text' | 'data' | 'file';
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
    | { tool: 'earnings'; params: { query: string } };

function classifyIntent(text: string): ToolRoute {
    const lower = text.toLowerCase();

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

    // Earnings triggers
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

type FoddaRequestFn = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
) => Promise<any>;

async function executeQuery(
    route: ToolRoute,
    apiKey: string,
    userId: string,
    foddaRequest: FoddaRequestFn,
): Promise<{ text: string; data?: any }> {
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

        case 'earnings': {
            const body = { query: route.params.query, limit: 10 };
            const result = await foddaRequest('POST', '/v1/earnings/search', apiKey, userId, body);
            return {
                text: result?.summary || JSON.stringify(result, null, 2),
                data: result,
            };
        }

        case 'deep_research': {
            // For A2A MVP, we do a synchronous search (not the async deep_research job)
            // because A2A registries expect a timely response for health probes.
            const body = {
                query: route.params.query,
                limit: 15,
                use_semantic: true,
                include_evidence: true,
            };
            const result = await foddaRequest('POST', '/v1/graphs/search', apiKey, userId, body);
            const rows = result?.rows || [];
            const lines: string[] = [];
            lines.push(`## Research Summary: ${route.params.query}\n`);
            lines.push(`_${rows.length} trends analyzed from Fodda's knowledge graph network._\n`);

            for (const row of rows.slice(0, 10)) {
                const score = row.signal_score ? ` (signal: ${row.signal_score})` : '';
                lines.push(`### ${row.title || row.trendName}${score}`);
                if (row.summary || row.description) {
                    lines.push((row.summary || row.description).substring(0, 400));
                }
                lines.push('');
            }

            return { text: lines.join('\n'), data: result };
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

            // Stubs for future methods — return Method Not Found
            case 'message/stream':
            case 'tasks/get':
            case 'tasks/cancel':
            case 'tasks/list':
                return res.json(
                    jsonRpcError(requestId, -32601, `Method not found: ${body.method}. Only message/send is supported in this version.`)
                );

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

        const textPart = message.parts.find(p => p.kind === 'text' && p.text);
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
