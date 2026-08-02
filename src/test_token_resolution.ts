import express from 'express';
import { Server } from 'http';
import { resolveMcpToken } from './index.js';

async function main() {
    console.log('--- Verification: resolveMcpToken header auth ---');

    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    let mockStatusCode = 200;
    let mockResponseBody: any = { apiKey: 'test_key_123', email: 'user@example.com', name: 'Test User' };

    const app = express();
    app.get('/api/mcp-tokens/:token', (req, res) => {
        receivedHeaders = req.headers;
        if (mockStatusCode !== 200) {
            res.status(mockStatusCode).json({ error: 'Unauthorized' });
            return;
        }
        res.json(mockResponseBody);
    });

    const server: Server = await new Promise((res) => {
        const s = app.listen(0, () => res(s));
    });
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    try {
        // Test 1: FODDA_MCP_SECRET set
        process.env.FODDA_MCP_SECRET = 'test-secret-999';
        delete process.env.ONBOARD_SECRET;

        const res1 = await resolveMcpToken('token_abc_1', baseUrl);
        if (res1.apiKey !== 'test_key_123' || res1.email !== 'user@example.com') {
            throw new Error(`Test 1 Failed: unexpected response payload ${JSON.stringify(res1)}`);
        }
        const h1 = String(receivedHeaders['x-fodda-mcp-secret'] || '');
        if (h1 !== 'test-secret-999') {
            throw new Error(`Test 1 Failed: header X-Fodda-Mcp-Secret was '${h1}', expected 'test-secret-999'`);
        }
        console.log('✅ Test 1 Passed: Outbound token resolution attaches X-Fodda-Mcp-Secret header when configured.');

        // Test 2: ONBOARD_SECRET fallback
        delete process.env.FODDA_MCP_SECRET;
        process.env.ONBOARD_SECRET = 'onboard-secret-777';

        const res2 = await resolveMcpToken('token_abc_2', baseUrl);
        const h2 = String(receivedHeaders['x-fodda-mcp-secret'] || '');
        if (h2 !== 'onboard-secret-777') {
            throw new Error(`Test 2 Failed: header X-Fodda-Mcp-Secret was '${h2}', expected 'onboard-secret-777'`);
        }
        console.log('✅ Test 2 Passed: Outbound token resolution falls back to ONBOARD_SECRET.');

        // Test 3: Secret missing fallback warning
        delete process.env.FODDA_MCP_SECRET;
        delete process.env.ONBOARD_SECRET;

        const res3 = await resolveMcpToken('token_abc_3', baseUrl);
        const h3 = receivedHeaders['x-fodda-mcp-secret'];
        if (h3) {
            throw new Error(`Test 3 Failed: expected no X-Fodda-Mcp-Secret header when secrets unset, got '${h3}'`);
        }
        console.log('✅ Test 3 Passed: Outbound token resolution handles missing secrets gracefully with debug warning.');

        // Test 4: 401 Unauthorized handling
        process.env.FODDA_MCP_SECRET = 'invalid-secret';
        mockStatusCode = 401;

        let caughtError = false;
        try {
            await resolveMcpToken('token_abc_4', baseUrl);
        } catch (err: any) {
            caughtError = true;
            if (!err.message.includes('unauthorized (HTTP 401)')) {
                throw new Error(`Test 4 Failed: unexpected error message: ${err.message}`);
            }
        }
        if (!caughtError) {
            throw new Error('Test 4 Failed: expected 401 error to be thrown');
        }
        console.log('✅ Test 4 Passed: 401 Unauthorized handled cleanly with informative error.');

        console.log('\nAll resolveMcpToken tests passed successfully! 🎉');
    } finally {
        server.close();
        process.exit(0);
    }
}

main().catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
