import axios from 'axios';
import crypto from 'crypto';
import assert from 'assert';

const TEST_PORT = 8991;
const FODDA_INTERNAL_API_KEY = 'test_internal_secret_key_12345';
const FODDA_MCP_SECRET = 'test_mcp_hmac_secret_67890';
process.env.PORT = String(TEST_PORT);
process.env.FODDA_INTERNAL_API_KEY = FODDA_INTERNAL_API_KEY;
process.env.FODDA_MCP_SECRET = FODDA_MCP_SECRET;

// Import index.js to boot the MCP server on TEST_PORT
await import('./index.js');

function parseMcpResponse(data: any): any {
    if (typeof data === 'object' && data !== null) return data;
    if (typeof data === 'string') {
        const line = data.split('\n').find((l: string) => l.startsWith('data: '));
        if (line) {
            return JSON.parse(line.slice(6));
        }
        return JSON.parse(data);
    }
    return data;
}

async function runServiceToServiceAuthTests() {
    console.log('=== Service-to-Service Connection & Bearer Auth Verification Suite ===\n');

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
        // ── TEST 1: Pure Legacy Query String (Should fail with -32001) ──
        console.log('--- Test 1: Legacy Query-String Request (No Headers) ---');
        try {
            await axios.post(`${baseUrl}/mcp?api_key=sk_live_legacy&user_id=legacy@example.com`, {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list'
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            assert.fail('Expected 401 for pure legacy URL query parameters');
        } catch (err: any) {
            assert.strictEqual(err.response?.status, 401, 'Status must be 401');
            assert.strictEqual(err.response?.data?.error?.code, -32001, 'Error code must be -32001');
            assert(err.response?.data?.error?.message?.includes('this connection URL is outdated'), 'Message must indicate outdated URL');
            console.log('  ✅ Correctly rejected legacy query-string client with -32001');
        }

        // ── TEST 2: Authorization: Bearer <apiKey> on /mcp (Stateless tools/list direct curl test) ──
        console.log('\n--- Test 2: Stateless tools/list with Authorization: Bearer Header ---');
        const res2 = await axios.post(`${baseUrl}/mcp`, {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk_live_test_analyst'
            }
        });
        assert.strictEqual(res2.status, 200, 'Status must be 200 OK');
        const parsed2 = parseMcpResponse(res2.data);
        assert(Array.isArray(parsed2?.result?.tools), 'Must return tools array');
        assert(parsed2.result.tools.length > 0, 'Must have registered tools');
        console.log(`  ✅ Successfully returned ${parsed2.result.tools.length} tools via direct Bearer auth`);

        // ── TEST 3: Bearer Header with legacy query params present (Bypass check) ──
        console.log('\n--- Test 3: Bearer Header overriding legacy query params on /mcp ---');
        const res3 = await axios.post(`${baseUrl}/mcp?api_key=sk_live_test_analyst&user_id=user@example.com`, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk_live_test_analyst'
            }
        });
        assert.strictEqual(res3.status, 200, 'Status must be 200 OK');
        const parsed3 = parseMcpResponse(res3.data);
        assert.strictEqual(parsed3?.error, undefined, 'Must not return JSON-RPC error');
        assert(parsed3?.result?.tools?.length > 0, 'Must return tools');
        console.log('  ✅ Bearer header cleanly bypassed -32001 deprecation error');

        // ── TEST 4: Internal Service Auth via X-Internal-Key ──
        console.log('\n--- Test 4: Internal Service Auth via X-Internal-Key ---');
        const res4 = await axios.post(`${baseUrl}/mcp?api_key=internal_call&user_id=service@fodda.ai`, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Key': FODDA_INTERNAL_API_KEY,
                'X-User-Email': 'researcher@fodda.ai'
            }
        });
        assert.strictEqual(res4.status, 200, 'Status must be 200 OK');
        const parsed4 = parseMcpResponse(res4.data);
        assert(parsed4?.result?.tools?.length > 0, 'Must list tools for internal key');
        console.log('  ✅ X-Internal-Key successfully authenticated and bypassed deprecation');

        // ── TEST 5: Internal Service Auth via HMAC X-Fodda-Signature ──
        console.log('\n--- Test 5: Internal Service Auth via HMAC X-Fodda-Signature ---');
        const timestamp = Date.now().toString();
        const body5 = {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/list'
        };
        const payload5 = `${timestamp}.${JSON.stringify(body5)}`;
        const signature5 = crypto.createHmac('sha256', FODDA_MCP_SECRET).update(payload5).digest('hex');

        const res5 = await axios.post(`${baseUrl}/mcp?api_key=system&user_id=system@fodda.ai`, body5, {
            headers: {
                'Content-Type': 'application/json',
                'X-Fodda-Timestamp': timestamp,
                'X-Fodda-Signature': signature5
            }
        });
        assert.strictEqual(res5.status, 200, 'Status must be 200 OK');
        const parsed5 = parseMcpResponse(res5.data);
        assert(parsed5?.result?.tools?.length > 0, 'Must list tools for valid HMAC');
        console.log('  ✅ Valid HMAC signature successfully authenticated and bypassed deprecation');

        // ── TEST 6: User Identity Resolution from X-User-Email & X-User-Id in stateful session ──
        console.log('\n--- Test 6: Stateful initialize handshake with X-User-Email ---');
        const res6 = await axios.post(`${baseUrl}/mcp`, {
            jsonrpc: '2.0',
            id: 5,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'fodda-sandbox', version: '1.0.0' }
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk_live_test_sandbox',
                'X-User-Email': 'sandbox_tester@example.com'
            }
        });
        assert.strictEqual(res6.status, 200, 'Status must be 200 OK');
        const sessionId = res6.headers['mcp-session-id'];
        assert(sessionId, 'Server must emit Mcp-Session-Id header');
        console.log(`  ✅ Initialized stateful session with session ID: ${sessionId}`);

        // Call tools/list with session ID
        const res6b = await axios.post(`${baseUrl}/mcp`, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/list'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Mcp-Session-Id': sessionId
            }
        });
        assert.strictEqual(res6b.status, 200, 'Status must be 200 OK');
        const parsed6b = parseMcpResponse(res6b.data);
        assert(parsed6b?.result?.tools?.length > 0, 'Must list tools with session ID');
        console.log('  ✅ Subsequent tool listing succeeded on initialized session');

        // ── TEST 7: SDK StreamableHTTPClientTransport connection (Matching mcpChatService) ──
        console.log('\n--- Test 7: StreamableHTTPClientTransport SDK with Authorization Header ---');
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

        const clientTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
            requestInit: {
                headers: {
                    'Authorization': 'Bearer sk_live_test_sandbox_sdk',
                    'X-User-Email': 'sdk_user@example.com'
                }
            }
        });
        const mcpClient = new Client({ name: 'fodda-sandbox', version: '1.0.0' });
        await mcpClient.connect(clientTransport as any);
        const toolsResult = await mcpClient.listTools();
        assert(Array.isArray(toolsResult.tools), 'SDK listTools must return tools array');
        assert(toolsResult.tools.length > 0, 'SDK must receive tools');
        console.log(`  ✅ SDK Client connected and listed ${toolsResult.tools.length} tools via StreamableHTTPClientTransport`);
        await mcpClient.close();

        console.log('\n🎉 ALL SERVICE-TO-SERVICE AUTH TESTS PASSED CLEANLY! 🎉');
        process.exit(0);
    } catch (err) {
        console.error('Test Suite Failed:', err);
        process.exit(1);
    }
}

runServiceToServiceAuthTests();
