/**
 * Fodda MCP Server — Clean Architecture
 * Uses McpServer (high-level API) which is proven to work with Claude.
 * NO middleware, NO AsyncLocalStorage, NO response interceptors.
 * API key is extracted from URL query params and passed to tool handlers.
 */
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import crypto from 'crypto';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { TOOLS, MCP_SERVER_VERSION } from './tools.js';

dotenv.config();

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

const app = express();
app.use(express.json());

// CORS — minimal, matching test server
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// OAuth discovery endpoints — return 404 to indicate no OAuth support
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported. Use API key auth via URL: ?api_key=YOUR_KEY' });
});
app.get('/.well-known/oauth-protected-resource/:path', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});
app.post('/register', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});

const transports = new Map<string, StreamableHTTPServerTransport>();
const sessionApiKeys = new Map<string, string>();
const sessionUserIds = new Map<string, string>();

const GRAPH_ID_DESC = "Select which graph to query. Use list_graphs to discover all available options including PSFK curated graphs and community Pattern Graphs. Common curated values: 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo', 'pew'. Community graphs use unique slugs (e.g., 'sarah-clean-beauty').";

/** Check if an error is an access/upgrade error (403) vs a not-found error (404). */
function isAccessError(err: any): boolean {
    const status = err.response?.status;
    const msg = (err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || '').toString().toLowerCase();
    return status === 403 || msg.includes('upgrade') || msg.includes('plan covers') || msg.includes('access');
}

/**
 * Make an authenticated request to the Fodda API.
 */
async function foddaRequest(
    method: 'GET' | 'POST',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string
): Promise<any> {
    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
        'X-API-Key': apiKey,
        'X-User-Id': userId,
        'X-Fodda-Timestamp': timestamp,
        'Content-Type': 'application/json',
    };
    if (requestId) headers['X-Request-Id'] = requestId;

    // HMAC sign the request
    const secret = process.env.FODDA_MCP_SECRET;
    if (secret) {
        const payload = method === 'POST' && body
            ? timestamp + '.' + JSON.stringify(body)
            : timestamp + '.' + path;
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        headers['X-Fodda-Signature'] = signature;
    }

    const url = `${API_BASE_URL}${path}`;
    const response = method === 'POST'
        ? await axios.post(url, body, { headers })
        : await axios.get(url, { headers });
    return response.data;
}

function createServer(apiKey: string, userId: string): McpServer {
    const server = new McpServer({
        name: 'fodda-mcp',
        version: MCP_SERVER_VERSION,
    }, {
        instructions: `You are connected to Fodda — a platform of expert-curated knowledge graphs built by PSFK.

ATTRIBUTION: When presenting insights from Fodda, always attribute clearly:
- Lead with: "According to the [Graph Name] Graph in Fodda..." or "Insights from the PSFK [Graph Name] Graph via Fodda show..."
- For the PSFK graph: "According to the PSFK Retail Intelligence Graph in Fodda..."
- For vertical graphs like SIC: "According to insights found in the SIC Graph in Fodda..."
- When summarizing multiple results: "Based on analysis of the PSFK knowledge graph via Fodda..."

CITATIONS & LINKS: Always include source URLs and hyperlinks:
- Every evidence article has a sourceUrl field — ALWAYS hyperlink the article title to its sourceUrl
- Format as: [Article Title](sourceUrl) — never show raw URLs
- When mentioning brands or examples, hyperlink to the source article
- If an article lacks a sourceUrl, note the article title and published date instead
- Group evidence by theme and present as a bulleted list with hyperlinked titles

FORMATTING: Present Fodda data professionally:
- Use headers to organize by trend cluster or theme
- Show relevance scores as context (e.g., "highly relevant, score: 0.92")
- Include geographic context when the 'place' field is present
- Mention brand names from the brandNames field when relevant
- Always suggest exploring related trends using discover_adjacent_trends

GRAPH TYPES: Fodda serves two types of knowledge graphs:
- CURATED GRAPHS: Expert-curated by PSFK (Retail, Beauty, Sports) and partners (SIC, Pew). These use deep editorial curation and AI-powered embeddings.
- COMMUNITY PATTERN GRAPHS: Contributed by strategists via Google Sheets. These follow the Fodda Pattern Standard (Signals → Patterns → Entities). Attribute as "According to [creator]'s [Graph Name] Pattern Graph on Fodda..."

When presenting results from community graphs, use the creator's name in attribution rather than "PSFK".

HELPFUL LINKS: If the user wants to adjust their settings, explore other available graphs, or learn more about Fodda, suggest they visit https://app.fodda.ai`
    });

    // --- list_graphs ---
    server.tool(
        'list_graphs',
        'Discover all available knowledge graphs — both expert-curated PSFK graphs and community-contributed Pattern Graphs. Returns graph IDs, descriptions, authors, sectors, and signal/pattern counts. Use this tool first to find valid graphId values for other tools.',
        { userId: z.string().describe('Unique identifier for the user (Required)') },
        async ({ userId: uid }) => {
            try {
                const data = await foddaRequest('GET', '/v1/graphs', apiKey, uid || userId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- search_graph ---
    server.tool(
        'search_graph',
        'Search across expert-curated PSFK knowledge graphs and community-contributed Pattern Graphs to retrieve structured trend clusters, signals, and supporting articles relevant to a query. IMPORTANT: Each result includes a `_use_this_graphId` field — always use THIS value (not the search graphId) when calling get_evidence, get_node, or get_neighbors for a specific result. PRESENTATION: Attribute results as "According to the [graphId] Graph in Fodda..." and hyperlink any evidence articles using their sourceUrl field: [Article Title](sourceUrl). Include geographic context from the place field when present.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            query: z.string().describe('The search query. Location terms are auto-detected and used to filter results geographically.'),
            userId: z.string().describe('Unique identifier for the user (Required)'),
            limit: z.number().optional().describe('Maximum number of results (default 25, max 50)'),
            use_semantic: z.boolean().optional().describe('Whether to use semantic search (default true)'),
            include_evidence: z.boolean().optional().describe('If true, batch-fetch supporting evidence articles inline with results. Default: true.')
        },
        async ({ graphId, query, userId: uid, limit, use_semantic, include_evidence }) => {
            try {
                const body: Record<string, any> = {
                    query,
                    limit: Math.min(limit || 10, 50),
                    use_semantic: use_semantic !== false,
                    include_evidence: include_evidence ?? true,
                };
                const data = await foddaRequest('POST', `/v1/graphs/${graphId}/search`, apiKey, uid || userId, body);
                // Post-process results
                if (data?.rows) {
                    data.rows = data.rows.map((row: any) => {
                        const trimmed = { ...row };
                        // Add explicit hint for follow-up calls — the node may live in a different graph than the one searched
                        trimmed._use_this_graphId = row.graphId || graphId;
                        // Trim verbose fields
                        if (trimmed.adjacentPossibilities?.length > 200) trimmed.adjacentPossibilities = trimmed.adjacentPossibilities.substring(0, 200) + '...';
                        if (trimmed.whyNow?.length > 200) trimmed.whyNow = trimmed.whyNow.substring(0, 200) + '...';
                        return trimmed;
                    });
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- get_neighbors ---
    server.tool(
        'get_neighbors',
        'Explore how a trend, brand, or technology connects to related signals within the selected graph. Use the _use_this_graphId from search results.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            seed_node_ids: z.array(z.string()).describe('Array of node IDs to start traversal from'),
            userId: z.string().describe('Unique identifier for the user (Required)'),
            relationship_types: z.array(z.string()).optional().describe("Filter by relationship types: 'EVIDENCED_BY', 'RELATED_TO', 'SEMANTICALLY_SIMILAR', 'ASSOCIATED_BRAND', 'MENTIONS_BRAND', 'IN_LOCATION'"),
            direction: z.enum(['in', 'out']).optional().describe("Traversal direction: 'out' (default) follows outgoing edges, 'in' follows incoming edges"),
            depth: z.number().optional().describe('Traversal depth (default 1, max 2)'),
            limit: z.number().optional().describe('Maximum results (default 50)')
        },
        async ({ graphId, seed_node_ids, userId: uid, relationship_types, direction, depth, limit }) => {
            try {
                const body: Record<string, any> = {
                    seed_node_ids,
                    depth: Math.min(depth || 1, 2),
                    limit: Math.min(limit || 50, 50),
                };
                if (relationship_types) body.relationship_types = relationship_types;
                if (direction) body.direction = direction;
                let data = await foddaRequest('POST', `/v1/graphs/${graphId}/neighbors`, apiKey, uid || userId, body);
                // Fallback to psfk if empty — vertical graphs are views on psfk
                if ((!data.neighbors || data.neighbors.length === 0) && graphId !== 'psfk') {
                    try {
                        const psfkData = await foddaRequest('POST', `/v1/graphs/psfk/neighbors`, apiKey, uid || userId, body);
                        if (psfkData.neighbors?.length > 0) {
                            data = psfkData;
                            data._note = `Results found in psfk graph (${graphId} returned empty)`;
                        }
                    } catch { /* user may not have psfk access — ignore fallback failure */ }
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- get_evidence ---
    server.tool(
        'get_evidence',
        'Retrieve supporting signals, source articles, and structured evidence for a specific trend or concept. Use the _use_this_graphId from search results. PRESENTATION: Each evidence item includes a sourceUrl — always present articles as hyperlinks: [title](sourceUrl). Include the place (location), brandNames, and publishedAt fields to provide rich context. Group articles thematically when presenting multiple evidence items.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            for_node_id: z.string().describe('The ID of the node (Trend or Article)'),
            userId: z.string().describe('Unique identifier for the user (Required)'),
            top_k: z.number().optional().describe('Number of evidence items to return (default 5)')
        },
        async ({ graphId, for_node_id, userId: uid, top_k }) => {
            try {
                const body = { for_node_id, top_k: Math.min(top_k || 5, 10) };
                let data: any;
                try {
                    data = await foddaRequest('POST', `/v1/graphs/${graphId}/evidence`, apiKey, uid || userId, body);
                } catch (primaryErr: any) {
                    // If not-found (not access error), try psfk fallback
                    if (graphId !== 'psfk' && !isAccessError(primaryErr)) {
                        try {
                            data = await foddaRequest('POST', `/v1/graphs/psfk/evidence`, apiKey, uid || userId, body);
                            if (data.evidence?.length > 0) data._note = `Evidence found in psfk graph (${graphId} returned error)`;
                        } catch { /* fallback failed too — rethrow original */ }
                    }
                    if (!data) throw primaryErr;
                }
                // Also fallback on empty results (success but no evidence)
                if ((!data.evidence || data.evidence.length === 0) && graphId !== 'psfk') {
                    try {
                        const psfkData = await foddaRequest('POST', `/v1/graphs/psfk/evidence`, apiKey, uid || userId, body);
                        if (psfkData.evidence?.length > 0) {
                            data = psfkData;
                            data._note = `Evidence found in psfk graph (${graphId} returned empty)`;
                        }
                    } catch { /* user may not have psfk access — ignore fallback failure */ }
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- get_node ---
    server.tool(
        'get_node',
        'Retrieve the full metadata and properties of a specific node within the knowledge graph. Use the _use_this_graphId from search results.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            nodeId: z.string().describe('The ID of the node'),
            userId: z.string().describe('Unique identifier for the user (Required)')
        },
        async ({ graphId, nodeId, userId: uid }) => {
            try {
                const data = await foddaRequest('GET', `/v1/graphs/${graphId}/nodes/${nodeId}`, apiKey, uid || userId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                // Fallback to psfk if node not found — but NOT if it's an access/upgrade error
                if (graphId !== 'psfk' && !isAccessError(err) && (err.response?.status === 404 || err.message?.includes('not found'))) {
                    try {
                        const data = await foddaRequest('GET', `/v1/graphs/psfk/nodes/${nodeId}`, apiKey, uid || userId);
                        (data as any)._note = `Node found in psfk graph (${graphId} returned 404)`;
                        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
                    } catch { /* fall through to original error */ }
                }
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- get_label_values ---
    server.tool(
        'get_label_values',
        'Discover available values for a specific category (e.g., Brand, Location, Technology, Audience) to support structured filtering.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            label: z.string().describe("The label to fetch values for (e.g., 'Brand', 'Location', 'Technology', 'Audience', 'RetailerType', 'Trend')"),
            userId: z.string().describe('Unique identifier for the user (Required)'),
            property: z.string().optional().describe('Optional property to return values for. Defaults vary by label.')
        },
        async ({ graphId, label, userId: uid, property }) => {
            try {
                const propParam = property ? `?property=${encodeURIComponent(property)}` : '';
                const data = await foddaRequest('GET', `/v1/graphs/${graphId}/labels/${label}/values${propParam}`, apiKey, uid || userId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    // --- discover_adjacent_trends ---
    server.tool(
        'discover_adjacent_trends',
        'Find trends that are semantically similar to a given trend — useful for discovering related signals and expanding research briefs.',
        {
            graphId: z.string().describe(GRAPH_ID_DESC),
            trend_id: z.string().describe('The trendId of the seed trend to find adjacent possibilities for'),
            userId: z.string().describe('Unique identifier for the user (Required)'),
            min_score: z.number().optional().describe('Minimum similarity score threshold (0-1). Default: 0.80'),
            limit: z.number().optional().describe('Maximum number of adjacent trends to return. Default: 10'),
            include_editorial: z.boolean().optional().describe('If true, also include editorially linked trends. Default: false')
        },
        async ({ graphId, trend_id, userId: uid, min_score, limit, include_editorial }) => {
            try {
                const params = new URLSearchParams({ node_id: trend_id });
                if (min_score !== undefined) params.set('min_score', String(min_score));
                params.set('limit', String(Math.min(limit || 10, 20)));
                if (include_editorial !== undefined) params.set('include_editorial', String(include_editorial));
                let data = await foddaRequest('GET', `/v1/graphs/${graphId}/adjacent?${params.toString()}`, apiKey, uid || userId);
                // Fallback to psfk if empty — vertical graphs are views on psfk
                if ((!data.adjacent || data.adjacent.length === 0) && graphId !== 'psfk') {
                    try {
                        const psfkData = await foddaRequest('GET', `/v1/graphs/psfk/adjacent?${params.toString()}`, apiKey, uid || userId);
                        if (psfkData.adjacent?.length > 0) {
                            data = psfkData;
                            data._note = `Adjacent trends found in psfk graph (${graphId} returned empty)`;
                        }
                    } catch { /* user may not have psfk access — ignore fallback failure */ }
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
            } catch (err: any) {
                // On error, try psfk fallback if not an access error
                if (graphId !== 'psfk' && !isAccessError(err)) {
                    try {
                        const params = new URLSearchParams({ node_id: trend_id });
                        if (min_score !== undefined) params.set('min_score', String(min_score));
                        params.set('limit', String(Math.min(limit || 10, 20)));
                        if (include_editorial !== undefined) params.set('include_editorial', String(include_editorial));
                        const data = await foddaRequest('GET', `/v1/graphs/psfk/adjacent?${params.toString()}`, apiKey, uid || userId);
                        if (data.adjacent?.length > 0) data._note = `Adjacent trends found in psfk graph (${graphId} returned error)`;
                        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
                    } catch { /* fallback also failed — fall through to original error */ }
                }
                const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
                return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
            }
        }
    );

    return server;
}

// --- MCP Transport Handler ---
app.all('/mcp', async (req, res) => {
    try {
        const sessionId = req.headers['mcp-session-id'] as string;
        let transport: StreamableHTTPServerTransport;

        // Extract API key and userId from URL
        const apiKey = (req.query.api_key as string) || '';
        const userId = (req.query.user_id as string) || 'anonymous';

        if (sessionId && transports.has(sessionId)) {
            transport = transports.get(sessionId)!;
        } else if (!sessionId && req.method === 'POST') {
            const body = req.body;
            if (body?.method === 'initialize') {
                // Store API key/userId for this session
                const server = createServer(apiKey, userId);
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                    onsessioninitialized: (sid) => {
                        console.error(`Session created: ${sid}`);
                        transports.set(sid, transport);
                        sessionApiKeys.set(sid, apiKey);
                        sessionUserIds.set(sid, userId);
                    }
                });
                transport.onclose = () => {
                    const sid = (transport as any).sessionId;
                    if (sid) {
                        transports.delete(sid);
                        sessionApiKeys.delete(sid);
                        sessionUserIds.delete(sid);
                    }
                };
                await server.connect(transport as any);
            } else {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Bad Request: Session required' },
                    id: null
                });
            }
        } else {
            return res.status(404).json({
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Session not found' },
                id: null
            });
        }

        // Inject Accept: text/event-stream if missing (prevents SDK 406)
        const accept = req.headers['accept'] || '';
        if (!accept.includes('text/event-stream')) {
            req.headers['accept'] = accept ? `${accept}, text/event-stream` : 'application/json, text/event-stream';
            const idx = req.rawHeaders?.findIndex((h: string) => h.toLowerCase() === 'accept');
            if (idx !== undefined && idx >= 0 && req.rawHeaders) {
                req.rawHeaders[idx + 1] = req.headers['accept'] as string;
            } else if (req.rawHeaders) {
                req.rawHeaders.push('Accept', req.headers['accept'] as string);
            }
        }

        await transport!.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

// Legacy SSE transport
app.get('/sse', async (req, res) => {
    const apiKey = (req.query.api_key as string) || '';
    const userId = (req.query.user_id as string) || 'anonymous';
    const sessionId = crypto.randomUUID();
    const transport = new SSEServerTransport('/messages', res);
    const server = createServer(apiKey, userId);
    await server.connect(transport as any);
    console.error(`SSE session: ${sessionId}`);
});

app.post('/messages', async (req, res) => {
    // SSE message handler would go here
    res.status(404).json({ error: 'Use /mcp endpoint' });
});

// Favicon — required for Anthropic Connectors Directory (Google favicon API)
const FAVICON_SVG = 'https://ucarecdn.com/e3ce77f2-661e-48a1-a294-c7c01039aed4/foddaminilogo.svg';
const FAVICON_PNG = 'https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddafavicon.png';

app.get('/favicon.ico', (_req, res) => { res.redirect(301, FAVICON_PNG); });
app.get('/favicon.svg', (_req, res) => { res.redirect(301, FAVICON_SVG); });

// Root — minimal HTML so Google's favicon crawler can find the icon
app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head>
<title>Fodda MCP Server</title>
<link rel="icon" type="image/png" href="${FAVICON_PNG}">
<link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}">
</head><body>
<h1>Fodda MCP Server v${MCP_SERVER_VERSION}</h1>
<p>Expert-curated knowledge graphs for AI agents.</p>
<p>Connect via <a href="https://app.fodda.ai">app.fodda.ai</a></p>
</body></html>`);
});

app.get('/health', (_req, res) => res.json({ status: 'ok', version: MCP_SERVER_VERSION }));

const PORT = parseInt(process.env.PORT || '8080');
app.listen(PORT, () => console.error(`Fodda MCP server v${MCP_SERVER_VERSION} on port ${PORT}`));
