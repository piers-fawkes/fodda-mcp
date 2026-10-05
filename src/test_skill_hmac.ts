import assert from 'assert';
import http from 'http';
import crypto from 'crypto';
import { discoverSkillTools, executeSkillTool } from './skillClient.js';

interface CapturedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: any;
}

async function runSkillHmacTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Signed Skill Client HMAC & Billing Mode');
    console.log('================================================================\n');

    const testSecret = 'test_mcp_secret_xyz123';
    process.env.FODDA_MCP_SECRET = testSecret;

    let lastRequest: CapturedRequest | null = null;

    const mockApiServer = http.createServer((req, res) => {
        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk; });
        req.on('end', () => {
            const parsedBody = bodyStr ? JSON.parse(bodyStr) : undefined;
            lastRequest = {
                method: req.method || '',
                url: req.url || '',
                headers: req.headers as Record<string, string>,
                body: parsedBody,
            };

            if (req.url === '/v1/skills/test-skill/tools') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'X-Fodda-Billing-Mode': 'mcp-orchestrated',
                });
                res.end(JSON.stringify({
                    skill_id: 'test-skill',
                    skill_name: 'Test Skill',
                    tools: [{ name: 'process', description: 'Test tool', inputSchema: {} }],
                    cost_per_call: 2,
                }));
            } else if (req.url === '/v1/skills/test-skill/execute') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'X-Fodda-Billing-Mode': 'mcp-orchestrated',
                });
                res.end(JSON.stringify({
                    result: 'Skill executed successfully',
                    usage: { billing_mode: 'mcp-orchestrated' }
                }));
            } else if (req.url === '/v1/skills/missing-skill/tools') {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { code: 'SKILL_NOT_FOUND', message: 'Not found' } }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
    });

    await new Promise<void>((resolve) => mockApiServer.listen(0, resolve));
    const port = (mockApiServer.address() as any).port;
    const originalApiBaseUrl = process.env.FODDA_API_URL;
    process.env.FODDA_API_URL = `http://localhost:${port}`;

    try {
        // ── Test 1: discoverSkillTools routes through foddaRequest with HMAC signing ──
        console.log('Test 1: discoverSkillTools HMAC signature and mcp-orchestrated billing...');
        const discovery = await discoverSkillTools('test-skill', 'sk_live_test_api_key');
        assert.ok(discovery, 'Discovery result should not be null');
        assert.strictEqual(discovery.skill_id, 'test-skill');
        assert.strictEqual(discovery.tools.length, 1);

        if (!lastRequest) throw new Error('Request should have been received by mock server');
        const req1: CapturedRequest = lastRequest;
        assert.strictEqual(req1.method, 'GET');
        assert.strictEqual(req1.url, '/v1/skills/test-skill/tools');
        assert.strictEqual(req1.headers['x-api-key'], 'sk_live_test_api_key');
        assert.strictEqual(req1.headers['x-fodda-billing'], 'mcp-orchestrated');
        assert.ok(req1.headers['x-fodda-timestamp'], 'Timestamp header must be present');
        assert.ok(req1.headers['x-fodda-signature'], 'Signature header must be present');

        // Verify HMAC signature matches payload: timestamp + '.' + path
        const expectedGetPayload = `${req1.headers['x-fodda-timestamp']}./v1/skills/test-skill/tools`;
        const expectedGetSig = crypto.createHmac('sha256', testSecret).update(expectedGetPayload).digest('hex');
        assert.strictEqual(req1.headers['x-fodda-signature'], expectedGetSig, 'HMAC signature must be valid');
        console.log('✅ Test 1 Passed: discoverSkillTools signed and billing mode verified.\n');

        // ── Test 2: executeSkillTool routes through foddaRequest with HMAC signing and body ──
        console.log('Test 2: executeSkillTool HMAC signature, body, and user ID...');
        const execResult = await executeSkillTool(
            'test-skill',
            'process',
            { query: 'test query' },
            'sk_live_test_api_key',
            'user@example.com'
        );
        assert.strictEqual(execResult.output, 'Skill executed successfully');
        assert.ok(execResult.durationMs >= 0);

        if (!lastRequest) throw new Error('Request 2 should have been received');
        const req2: CapturedRequest = lastRequest;
        assert.strictEqual(req2.method, 'POST');
        assert.strictEqual(req2.url, '/v1/skills/test-skill/execute');
        assert.strictEqual(req2.headers['x-api-key'], 'sk_live_test_api_key');
        assert.strictEqual(req2.headers['x-user-id'], 'user@example.com');
        assert.strictEqual(req2.headers['x-fodda-billing'], 'mcp-orchestrated');

        // Verify POST payload HMAC: timestamp + '.' + JSON.stringify(body)
        const expectedPostPayload = `${req2.headers['x-fodda-timestamp']}.${JSON.stringify({ tool: 'process', arguments: { query: 'test query' } })}`;
        const expectedPostSig = crypto.createHmac('sha256', testSecret).update(expectedPostPayload).digest('hex');
        assert.strictEqual(req2.headers['x-fodda-signature'], expectedPostSig, 'HMAC signature for POST body must be valid');
        console.log('✅ Test 2 Passed: executeSkillTool signed with valid POST body HMAC and billing mode.\n');

        // ── Test 3: Placeholder user ID omission in executeSkillTool ──
        console.log('Test 3: executeSkillTool placeholder user ID omission...');
        await executeSkillTool(
            'test-skill',
            'process',
            { query: 'another test' },
            'sk_live_test_api_key',
            'anonymous'
        );
        if (!lastRequest) throw new Error('Request 3 should have been received');
        const req3: CapturedRequest = lastRequest;
        assert.strictEqual(req3.headers['x-user-id'], undefined, 'Placeholder userId "anonymous" must be omitted');
        console.log('✅ Test 3 Passed: Placeholder user ID successfully omitted.\n');

        // ── Test 4: discoverSkillTools fail-open on 404 ──
        console.log('Test 4: discoverSkillTools fail-open on 404 error...');
        const missing = await discoverSkillTools('missing-skill', 'sk_live_test_api_key');
        assert.strictEqual(missing, null, 'discoverSkillTools should fail-open and return null on 404');
        console.log('✅ Test 4 Passed: Fail-open handled cleanly.\n');

        console.log('================================================================');
        console.log(' All Skill Client HMAC & Billing Mode Tests Passed Successfully!');
        console.log('================================================================');
    } finally {
        mockApiServer.close();
        if (originalApiBaseUrl) {
            process.env.FODDA_API_URL = originalApiBaseUrl;
        } else {
            delete process.env.FODDA_API_URL;
        }
    }
}

runSkillHmacTests().catch(err => {
    console.error('❌ Skill HMAC Test Failed:', err);
    process.exit(1);
});
