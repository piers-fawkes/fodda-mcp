import axios from 'axios';
import assert from 'assert';

const TEST_PORT = 8994;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'development';
process.env.FODDA_SERVICE_URL = `http://localhost:${TEST_PORT}`;

// Boot MCP server on TEST_PORT
await import('./index.js');

async function runCleanupTests() {
    console.log('=== Connection Surface Cleanup Verification Suite ===\n');
    const baseUrl = `http://localhost:${TEST_PORT}`;

    // Wait for server /health to respond
    let ready = false;
    for (let i = 0; i < 30; i++) {
        try {
            const h = await axios.get(`${baseUrl}/health`);
            if (h.status === 200) {
                ready = true;
                break;
            }
        } catch {
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    assert(ready, 'Server failed to start on TEST_PORT');
    console.log(`[test-server] Verified server healthy on port ${TEST_PORT}\n`);

    try {
        // ── TEST 1: GET /sse -> 410 Gone ──
        console.log('--- Test 1: GET /sse returns 410 Gone ---');
        try {
            await axios.get(`${baseUrl}/sse`);
            assert.fail('Expected 410 for GET /sse');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 410, `Expected 410, got ${err.response?.status}`);
            assert.strictEqual(err.response?.data?.error, 'sse_retired');
            assert.strictEqual(err.response?.data?.message, 'Use Streamable HTTP at https://mcp.fodda.ai/mcp');
            assert.strictEqual(err.response?.data?.source, 'fodda-mcp');
            console.log('✅ PASS: GET /sse returns 410 with sse_retired JSON\n');
        }

        // ── TEST 2: POST /messages -> 410 Gone ──
        console.log('--- Test 2: POST /messages returns 410 Gone ---');
        try {
            await axios.post(`${baseUrl}/messages`, { test: 'message' });
            assert.fail('Expected 410 for POST /messages');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 410, `Expected 410, got ${err.response?.status}`);
            assert.strictEqual(err.response?.data?.error, 'sse_retired');
            assert.strictEqual(err.response?.data?.message, 'Use Streamable HTTP at https://mcp.fodda.ai/mcp');
            assert.strictEqual(err.response?.data?.source, 'fodda-mcp');
            console.log('✅ PASS: POST /messages returns 410 with sse_retired JSON\n');
        }

        // ── TEST 3: Invalid /c/:token -> 401 + WWW-Authenticate pointing at /mcp ──
        console.log('--- Test 3: POST /c/invalid returns 401 + WWW-Authenticate pointing to /mcp ---');
        try {
            await axios.post(`${baseUrl}/c/invalid_token_xyz`, {
                jsonrpc: '2.0',
                id: 101,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            assert.fail('Expected 401 for invalid /c/ token');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401, `Expected 401, got ${err.response?.status}`);
            const authHeader = err.response?.headers['www-authenticate'] || '';
            console.log('WWW-Authenticate header:', authHeader);
            assert(authHeader.includes('/.well-known/oauth-protected-resource/mcp'), `Expected header to point to /mcp resource_metadata, got: ${authHeader}`);
            assert(!authHeader.includes('/.well-known/oauth-protected-resource/c'), `Header must not point to /c: ${authHeader}`);
            assert(authHeader.includes('error="invalid_token"'), `Expected error="invalid_token" in WWW-Authenticate: ${authHeader}`);

            const body = err.response?.data;
            console.log('Response body:', body);
            assert.strictEqual(body?.jsonrpc, '2.0');
            assert.strictEqual(body?.id, 101);
            assert.strictEqual(body?.error?.code, -32000);
            assert(body?.error?.error === 'invalid_token' || body?.error?.data?.error === 'invalid_token', 'Expected error="invalid_token" in error body');
            console.log('✅ PASS: Invalid /c/ token returns 401 + WWW-Authenticate pointing at /mcp with invalid_token JSON-RPC\n');
        }

        // ── TEST 4: Invalid Clerk OAuth Bearer on /mcp -> 401 + WWW-Authenticate pointing at /mcp ──
        console.log('--- Test 4: POST /mcp with invalid bearer returns 401 + WWW-Authenticate ---');
        try {
            await axios.post(`${baseUrl}/mcp`, {
                jsonrpc: '2.0',
                id: 102,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer invalid_clerk_token_jwt'
                }
            });
            assert.fail('Expected 401 for invalid bearer');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401, `Expected 401, got ${err.response?.status}`);
            const authHeader = err.response?.headers['www-authenticate'] || '';
            console.log('WWW-Authenticate header:', authHeader);
            assert(authHeader.includes('/.well-known/oauth-protected-resource/mcp'), `Expected header to point to /mcp: ${authHeader}`);
            assert(authHeader.includes('error="invalid_token"'), `Expected error="invalid_token": ${authHeader}`);

            const body = err.response?.data;
            console.log('Response body:', body);
            assert.strictEqual(body?.jsonrpc, '2.0');
            assert.strictEqual(body?.id, 102);
            assert.strictEqual(body?.error?.code, -32000);
            assert(body?.error?.error === 'invalid_token' || body?.error?.data?.error === 'invalid_token');
            console.log('✅ PASS: Invalid bearer returns 401 + WWW-Authenticate + invalid_token JSON-RPC\n');
        }

        // ── TEST 5: Deprecation on /c/:token?api_key=junk and /grok-brand-context?api_key=junk ──
        console.log('--- Test 5: Outdated ?api_key= on /c/:token and /grok-brand-context returns 401 ---');
        try {
            await axios.post(`${baseUrl}/c/sometoken?api_key=junk_key`, {
                jsonrpc: '2.0',
                id: 103,
                method: 'tools/list'
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            assert.fail('Expected 401 for /c/:token?api_key=junk');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401);
            assert.strictEqual(err.response?.data?.error?.code, -32001);
            assert(err.response?.data?.error?.message?.includes('Fodda: this connection URL is outdated'));
            assert(err.response?.data?.error?.message?.includes('Connections'));
            assert(!err.response?.data?.error?.message?.includes('MCP Integration'));
            assert.strictEqual(err.response?.data?.error?.data?.docs, 'https://www.fodda.ai/connect');
            assert(err.response?.headers['www-authenticate']?.includes('/.well-known/oauth-protected-resource/mcp'));
            console.log('✅ PASS: /c/:token?api_key=junk returns deprecation 401 with Connections navigation');
        }

        try {
            await axios.post(`${baseUrl}/grok-brand-context?api_key=junk_key`, {
                jsonrpc: '2.0',
                id: 104,
                method: 'tools/list'
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            assert.fail('Expected 401 for /grok-brand-context?api_key=junk');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401);
            assert.strictEqual(err.response?.data?.error?.code, -32001);
            assert(err.response?.data?.error?.message?.includes('Fodda: this connection URL is outdated'));
            assert(err.response?.data?.error?.message?.includes('Connections'));
            console.log('✅ PASS: /grok-brand-context?api_key=junk returns deprecation 401 with Connections navigation\n');
        }

        // ── TEST 6: Unauthenticated handshake on /mcp -> 401 + WWW-Authenticate (without invalid_token) ──
        console.log('--- Test 6: Unauthenticated initialize returns 401 + WWW-Authenticate ---');
        try {
            await axios.post(`${baseUrl}/mcp`, {
                jsonrpc: '2.0',
                id: 105,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            assert.fail('Expected 401 for unauthenticated initialize');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401);
            const authHeader = err.response?.headers['www-authenticate'] || '';
            assert(authHeader.includes('/.well-known/oauth-protected-resource/mcp'));
            assert(!authHeader.includes('error="invalid_token"'), 'Unauthenticated should not set invalid_token');
            assert.strictEqual(err.response?.data?.error?.code, -32000);
            assert.strictEqual(err.response?.data?.id, 105);
            console.log('✅ PASS: Unauthenticated initialize returns 401 + WWW-Authenticate without invalid_token\n');
        }

        // ── TEST 7: Server card metadata does NOT contain mcpSse ──
        console.log('--- Test 7: Server cards omit mcpSse ---');
        const cardResp = await axios.get(`${baseUrl}/.well-known/mcp/server.json`);
        assert.strictEqual(cardResp.status, 200);
        assert(!('mcpSse' in (cardResp.data?.endpoints || {})), 'Server card must not have mcpSse');
        assert('mcpStreamableHttp' in (cardResp.data?.endpoints || {}), 'Server card must have mcpStreamableHttp');
        console.log('✅ PASS: Server card endpoints contains mcpStreamableHttp and omits mcpSse\n');

        console.log('=== ALL CONNECTION SURFACE CLEANUP TESTS PASSED ===');
    } finally {
        process.exit(0);
    }
}

runCleanupTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
