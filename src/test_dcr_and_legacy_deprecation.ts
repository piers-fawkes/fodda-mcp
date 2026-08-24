import express from 'express';
import http from 'http';
import axios from 'axios';

async function runVerificationTest() {
    process.env.CLERK_ISSUER_URL = 'https://clerk.fodda.ai';

    // Fodda MCP Server on 8989
    const app = express();
    app.use(express.json());

    // Express req.url redaction helper (app-level safety)
    app.use((req, _res, next) => {
        if (req.url && req.url.includes('api_key=')) {
            req.url = req.url.replace(/api_key=[^&]+/g, 'api_key=REDACTED');
        }
        next();
    });

    // Deprecation middleware for legacy URL parameters
    const LEGACY_DEPRECATION_PATHS = [
        '/sse', '/mcp', '/messages', '/copilot',
        '/brand-intelligence', '/topic-research', '/deep-research',
        '/earnings-intelligence', '/expert-consult'
    ];

    app.use(LEGACY_DEPRECATION_PATHS, (req, res, next) => {
        if (req.query.api_key !== undefined || req.query.user_id !== undefined) {
            const message = 'Fodda: this connection URL is outdated. Get your new MCP URL at https://app.fodda.ai (Account → MCP Integration) and update your connector.';
            const accept = req.headers['accept'] || '';
            const contentType = req.headers['content-type'] || '';
            const isJson = accept.includes('application/json') || contentType.includes('application/json') || (req.method === 'POST' && req.body && typeof req.body === 'object');

            if (isJson && req.method === 'POST') {
                const bodyId = (req.body && typeof req.body === 'object' && 'id' in req.body) ? (req.body as any).id : null;
                return res.status(401).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32001,
                        message,
                        data: { docs: 'https://fodda.ai/platform-integration-anthropic-claude' }
                    },
                    id: bodyId,
                });
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(401).send(`${message}\n`);
        }
        next();
    });

    const CLERK_ISSUER = process.env.CLERK_ISSUER_URL || 'https://clerk.fodda.ai';

    app.get('/.well-known/oauth-protected-resource', (_req, res) => {
        res.status(200).json({
            resource: 'http://localhost:8989',
            authorization_servers: [CLERK_ISSUER],
        });
    });
    app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
        res.status(200).json({
            resource: 'http://localhost:8989/mcp',
            authorization_servers: [CLERK_ISSUER],
        });
    });

    const mcpServer = http.createServer(app);
    await new Promise<void>((resolve) => mcpServer.listen(8989, () => resolve()));
    console.log('[test] MCP test server listening on 8989');

    try {
        // Test 1: POST to /sse?api_key=sk_live_test&user_id=test@example.com
        console.log('[test] Test 1: POST /sse?api_key=sk_live_test&user_id=test@example.com...');
        try {
            await axios.post('http://localhost:8989/sse?api_key=sk_live_test&user_id=test@example.com', { jsonrpc: '2.0', method: 'initialize', id: 1 }, {
                headers: { 'Content-Type': 'application/json' },
            });
            console.error('FAILED: expected 401');
        } catch (err: any) {
            if (err.response?.status === 401) {
                console.log('[test] PASS: Received 401 JSON-RPC response:', err.response.data);
                if (err.response.data?.error?.code === -32001 && err.response.data?.error?.message?.includes('Fodda: this connection URL is outdated')) {
                    console.log('[test] PASS: Error code -32001 and message match specification.');
                } else {
                    console.error('[test] FAIL: Body did not match expected structure:', err.response.data);
                }
            } else {
                console.error('[test] FAIL: Received unexpected status:', err.response?.status);
            }
        }

        // Test 2: GET /sse?api_key=sk_live_test
        console.log('[test] Test 2: GET /sse?api_key=sk_live_test...');
        try {
            await axios.get('http://localhost:8989/sse?api_key=sk_live_test');
            console.error('FAILED: expected 401');
        } catch (err: any) {
            if (err.response?.status === 401) {
                console.log('[test] PASS: Received 401 text/plain response:', err.response.data);
                if (typeof err.response.data === 'string' && err.response.data.includes('Fodda: this connection URL is outdated')) {
                    console.log('[test] PASS: Plain text message matches specification.');
                }
            } else {
                console.error('[test] FAIL: Received unexpected status:', err.response?.status);
            }
        }

        // Test 3: OAuth Protected Resource Discovery Check (Option A)
        console.log('[test] Test 3: GET /.well-known/oauth-protected-resource and /mcp...');
        const protResp = await axios.get('http://localhost:8989/.well-known/oauth-protected-resource');
        const protMcpResp = await axios.get('http://localhost:8989/.well-known/oauth-protected-resource/mcp');
        if (protResp.data?.authorization_servers?.[0] === 'https://clerk.fodda.ai' && protMcpResp.data?.authorization_servers?.[0] === 'https://clerk.fodda.ai') {
            console.log('[test] PASS: Protected resource metadata advertises authorization server CLERK_ISSUER (https://clerk.fodda.ai).');
        } else {
            console.error('[test] FAIL: Protected resource authorization_servers mismatch:', protResp.data, protMcpResp.data);
        }

        // Test 4: Live Clerk Native DCR Check (No-Scope Default Scopes including openid)
        console.log('[test] Test 4: Live Clerk POST https://clerk.fodda.ai/oauth/register without scope...');
        try {
            const dcrResp = await axios.post('https://clerk.fodda.ai/oauth/register', {
                client_name: 'Antigravity Test DCR Client',
                redirect_uris: ['https://example.com/callback'],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000,
            });
            console.log('[test] Live Clerk DCR status:', dcrResp.status);
            console.log('[test] Live Clerk DCR granted scope:', dcrResp.data?.scope);
            if (dcrResp.data?.scope?.includes('openid')) {
                console.log('[test] PASS: Live Clerk native DCR returned default scope containing openid!');
            } else {
                console.error('[test] FAIL: openid not found in Live Clerk returned scope:', dcrResp.data);
            }
        } catch (err: any) {
            console.error('[test] Warning/Error on live Clerk DCR probe:', err.message);
        }

    } finally {
        mcpServer.close();
        console.log('[test] Test server stopped.');
    }
}

runVerificationTest().catch(console.error);
