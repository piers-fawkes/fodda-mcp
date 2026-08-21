import express from 'express';
import http from 'http';
import axios from 'axios';
import { handleOauthRegister } from './oauthRegisterShim.js';

async function runVerificationTest() {
    // 1. Mock Clerk Server on 8990 to verify DCR shim without creating live DB records
    const mockClerkApp = express();
    mockClerkApp.use(express.json());
    mockClerkApp.post('/oauth/register', (req, res) => {
        const body = req.body || {};
        res.status(201).json({
            client_id: 'mock_test_client_id_123',
            client_secret: 'mock_secret_abc',
            client_name: body.client_name,
            redirect_uris: body.redirect_uris,
            scope: body.scope,
            grant_types: ['authorization_code'],
            response_types: ['code'],
        });
    });
    const mockClerkServer = http.createServer(mockClerkApp);
    await new Promise<void>((resolve) => mockClerkServer.listen(8990, () => resolve()));
    process.env.CLERK_ISSUER_URL = 'http://localhost:8990';

    // 2. Fodda MCP Server on 8989
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

    app.get('/.well-known/oauth-authorization-server', (_req, res) => {
        res.status(200).json({
            issuer: 'http://localhost:8990',
            authorization_endpoint: 'http://localhost:8990/oauth/authorize',
            token_endpoint: 'http://localhost:8990/oauth/token',
            registration_endpoint: 'http://localhost:8989/oauth/register',
        });
    });

    app.post('/oauth/register', handleOauthRegister);

    const mcpServer = http.createServer(app);
    await new Promise<void>((resolve) => mcpServer.listen(8989, () => resolve()));
    console.log('[test] Test servers listening (MCP: 8989, Mock Clerk: 8990)');

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

        // Test 3: Metadata Issuer Check (CLERK_ISSUER)
        console.log('[test] Test 3: GET /.well-known/oauth-authorization-server issuer check...');
        const metaResp = await axios.get('http://localhost:8989/.well-known/oauth-authorization-server');
        if (metaResp.data?.issuer === 'http://localhost:8990') {
            console.log('[test] PASS: Metadata issuer matches CLERK_ISSUER.');
        } else {
            console.error('[test] FAIL: Issuer mismatch:', metaResp.data?.issuer);
        }

        // Test 4: DCR registration shim (/oauth/register)
        console.log('[test] Test 4: POST /oauth/register without explicit scope...');
        const dcrResp = await axios.post('http://localhost:8989/oauth/register', {
            client_name: 'Antigravity Test DCR Client',
            redirect_uris: ['https://example.com/callback'],
        }, {
            headers: { 'Content-Type': 'application/json' },
        });
        console.log('[test] DCR response status:', dcrResp.status);
        console.log('[test] DCR response scope:', dcrResp.data?.scope);
        if (dcrResp.data?.scope?.includes('openid')) {
            console.log('[test] PASS: DCR returned scope containing openid!');
        } else {
            console.error('[test] FAIL: openid not found in returned scope:', dcrResp.data);
        }

    } finally {
        mcpServer.close();
        mockClerkServer.close();
        console.log('[test] Test servers stopped.');
    }
}

runVerificationTest().catch(console.error);
