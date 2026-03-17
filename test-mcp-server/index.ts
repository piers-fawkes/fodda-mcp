/**
 * Test MCP server v3 — calls real Fodda API.
 * If this works with Claude → Fodda middleware is the issue.
 * If this fails → Fodda API response format is the issue.
 */
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const API_BASE_URL = 'https://api.fodda.ai';
const API_KEY = 'sk_live_abcdef'; // Same key used in Fodda MCP

// CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
});

const transports = new Map<string, StreamableHTTPServerTransport>();

function createServer(): McpServer {
    const server = new McpServer({
        name: 'test-mcp',
        version: '1.0.0'
    });

    // Simple test tool (always works)
    server.tool(
        'say_hello',
        'Returns a greeting.',
        { name: z.string().describe('Your name') },
        async ({ name }) => ({
            content: [{ type: 'text' as const, text: `Hello, ${name}!` }]
        })
    );

    // REAL Fodda API call — list_graphs
    server.tool(
        'list_graphs',
        'List available knowledge graphs from the real Fodda API.',
        { userId: z.string().describe('User ID') },
        async ({ userId }) => {
            try {
                console.error(`[list_graphs] Calling Fodda API...`);
                const resp = await fetch(`${API_BASE_URL}/v1/graphs`, {
                    headers: {
                        'X-API-Key': API_KEY,
                        'X-User-Id': userId,
                        'Accept': 'application/json'
                    }
                });
                const data = await resp.json();
                console.error(`[list_graphs] Got ${resp.status}, ${JSON.stringify(data).length} bytes`);
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
                };
            } catch (err: any) {
                console.error(`[list_graphs] Error:`, err.message);
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: `Error: ${err.message}` }]
                };
            }
        }
    );

    // REAL Fodda API call — search_graph
    server.tool(
        'search_graph',
        'Search a Fodda knowledge graph.',
        {
            graphId: z.string().describe('Graph ID (e.g. retail, beauty)'),
            query: z.string().describe('Search query'),
            userId: z.string().describe('User ID'),
            limit: z.number().optional().describe('Max results (default 10)')
        },
        async ({ graphId, query, userId, limit }) => {
            try {
                console.error(`[search_graph] Calling Fodda API: ${graphId} "${query}"...`);
                const params = new URLSearchParams({
                    q: query,
                    limit: String(limit || 10)
                });
                const resp = await fetch(`${API_BASE_URL}/v1/graphs/${graphId}/search?${params}`, {
                    headers: {
                        'X-API-Key': API_KEY,
                        'X-User-Id': userId,
                        'Accept': 'application/json'
                    }
                });
                const data = await resp.json();
                console.error(`[search_graph] Got ${resp.status}, ${JSON.stringify(data).length} bytes`);
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
                };
            } catch (err: any) {
                console.error(`[search_graph] Error:`, err.message);
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: `Error: ${err.message}` }]
                };
            }
        }
    );

    return server;
}

app.all('/mcp', async (req, res) => {
    try {
        const sessionId = req.headers['mcp-session-id'] as string;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports.has(sessionId)) {
            transport = transports.get(sessionId)!;
        } else if (!sessionId && req.method === 'POST') {
            const body = req.body;
            if (body?.method === 'initialize') {
                const server = createServer();
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                    onsessioninitialized: (sid) => {
                        console.error(`Session created: ${sid}`);
                        transports.set(sid, transport);
                    }
                });
                transport.onclose = () => {
                    const sid = (transport as any).sessionId;
                    if (sid) transports.delete(sid);
                };
                await server.connect(transport);
            } else {
                return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Session required' }, id: null });
            }
        } else {
            return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
        }

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

        console.error(`[REQ] ${req.method} session=${sessionId || 'new'} rpc=${req.body?.method || '?'}`);
        await transport!.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = parseInt(process.env.PORT || '8081');
app.listen(PORT, () => console.error(`Test MCP server v3 on port ${PORT} (real Fodda API)`));
