import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import assert from 'assert';
import axios from 'axios';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = 8998;
const CLERK_ISSUER = 'https://clerk.fodda.ai';

console.log('Starting live Fodda MCP server on port', PORT, '...');
const serverProc = spawn('node', ['dist/index.js'], {
    env: {
        ...process.env,
        PORT: String(PORT),
        CLERK_ISSUER_URL: CLERK_ISSUER,
        FODDA_MCP_SECRET: 'test_secret_claude',
        FODDA_INTERNAL_API_KEY: 'sk_internal_service_test_key',
        FODDA_SERVICE_URL: `http://localhost:${PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

serverProc.stdout.on('data', d => process.stdout.write(`[server stdout] ${d}`));
serverProc.stderr.on('data', d => process.stderr.write(`[server stderr] ${d}`));

async function fetchHttp(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path,
            method,
            headers,
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: data,
            }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetchHttp('GET', '/health');
            if (res.status === 200) return true;
        } catch (e) {
            // wait
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Server did not start in time');
}

async function run() {
    try {
        await waitForServer();
        console.log('\nServer is UP! Running Claude connector verification suite...\n');

        // ── 1. RFC 9728 Discovery Metadata ──
        console.log('--- 1. Testing GET /.well-known/oauth-protected-resource/claude ---');
        const discRes = await fetchHttp('GET', '/.well-known/oauth-protected-resource/claude', { 'Accept': 'application/json' });
        assert.strictEqual(discRes.status, 200);
        const discJson = JSON.parse(discRes.body);
        assert.strictEqual(discJson.resource, `http://localhost:${PORT}/claude`);
        assert(Array.isArray(discJson.authorization_servers));
        assert.strictEqual(discJson.authorization_servers[0], CLERK_ISSUER);
        console.log(`  ✅ Resource: ${discJson.resource}`);
        console.log(`  ✅ Authorization Server: ${discJson.authorization_servers[0]}`);

        // ── 2. Discovery Card Metadata ──
        console.log('\n--- 2. Testing GET /.well-known/claude and /.well-known/claude.json ---');
        const card1 = await fetchHttp('GET', '/.well-known/claude');
        const card2 = await fetchHttp('GET', '/.well-known/claude.json');
        assert.strictEqual(card1.status, 200);
        assert.strictEqual(card2.status, 200);
        const card1Json = JSON.parse(card1.body);
        assert.strictEqual(card1Json.name, 'ai.fodda/claude');
        assert.strictEqual(card1Json.title, 'Fodda Market & Earnings Intelligence for Claude');
        assert.strictEqual(card1Json.endpoints?.mcpStreamableHttp, `http://localhost:${PORT}/claude`);
        console.log(`  ✅ Card Name: ${card1Json.name}`);
        console.log(`  ✅ Card Title: ${card1Json.title}`);
        console.log(`  ✅ Streamable HTTP: ${card1Json.endpoints?.mcpStreamableHttp}`);

        // ── 3. 401 Unauthenticated Challenge on /claude ──
        console.log('\n--- 3. Testing 401 unauthenticated initialize on /claude ---');
        const initPayload = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'claude-desktop', version: '1.0.0' }
            }
        });
        const postRes = await fetchHttp('POST', '/claude', {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }, initPayload);

        assert.strictEqual(postRes.status, 401, `Route /claude must return 401, got ${postRes.status}`);
        const authHeader = postRes.headers['www-authenticate'] || '';
        assert(authHeader.includes('Bearer resource_metadata='), 'Missing Bearer resource_metadata in WWW-Authenticate');
        assert(authHeader.includes(`/.well-known/oauth-protected-resource/claude`), `Header must point to /.well-known/oauth-protected-resource/claude, got: ${authHeader}`);
        const errJson = JSON.parse(postRes.body);
        assert.strictEqual(errJson.error.code, -32000);
        console.log(`  ✅ 401 challenge header: ${authHeader}`);

        // ── 4. Browser Landing Page on /claude ──
        console.log('\n--- 4. Testing browser GET /claude with Accept: text/html ---');
        const htmlRes = await fetchHttp('GET', '/claude', {
            'Accept': 'text/html,application/xhtml+xml'
        });
        assert.strictEqual(htmlRes.status, 200);
        assert(htmlRes.body.includes('Fodda — This URL is for AI Systems'));
        console.log('  ✅ Browser access to /claude renders human-friendly landing card');

        // ── 5. Legacy Query Parameter Rejection on /claude ──
        console.log('\n--- 5. Testing legacy query parameter deprecation on /claude?api_key=... ---');
        const legacyRes = await fetchHttp('GET', '/claude?api_key=legacy_key');
        assert.strictEqual(legacyRes.status, 401);
        assert(legacyRes.body.includes('Fodda: this connection URL is outdated'));
        console.log('  ✅ Legacy query parameters on /claude rejected with 401 guidance');

        // ── 6. Authenticated MCP Session & Tool Listing on /claude ──
        console.log('\n--- 6. Testing authenticated MCP Client session on /claude ---');
        const clientTransport = new StreamableHTTPClientTransport(
            new URL(`http://localhost:${PORT}/claude`),
            {
                requestInit: {
                    headers: {
                        'Authorization': 'Bearer sk_internal_service_test_key',
                        'X-Fodda-Session-Kind': 'internal-test',
                        'User-Agent': 'Claude-User/1.0 (Anthropic/Directory-Review)'
                    }
                }
            }
        );
        const mcpClient = new Client({ name: 'claude-test-client', version: '1.0.0' });
        await mcpClient.connect(clientTransport);

        const listRes = await mcpClient.listTools();
        const returnedTools = listRes.tools.map((t) => t.name).sort();
        console.log(`  ✅ /claude returned ${returnedTools.length} tools`);
        console.log(`  Tools list: [${returnedTools.join(', ')}]`);

        // Check against tools-manifest.json
        const manifest = JSON.parse(fs.readFileSync('tools-manifest.json', 'utf8'));
        const expectedTools = manifest.tools
            .filter((t) => t.profiles.includes('claude'))
            .map((t) => t.name)
            .sort();

        assert.strictEqual(returnedTools.length, expectedTools.length, `Expected ${expectedTools.length} tools, got ${returnedTools.length}`);
        assert.deepStrictEqual(returnedTools, expectedTools, 'Returned tools do not match expected manifest claude tools');

        // Verify all 11 onboarding tools are strictly excluded
        const ONBOARDING_TOOLS = [
            'begin_expert_onboarding',
            'expert_onboarding_research',
            'get_onboarding_status',
            'submit_basic_info',
            'submit_expertise_analysis',
            'get_detected_themes',
            'confirm_themes',
            'schedule_interview',
            'request_deliverable',
            'check_deliverable_status',
            'get_my_earnings',
        ];
        const MUTATING_TOOLS = [
            'sign_up_free_account',
            'update_user_profile',
            'toggle_graph_preference',
            'manage_scheduled_reports',
            'send_feedback',
        ];

        for (const tool of ONBOARDING_TOOLS) {
            assert.strictEqual(returnedTools.includes(tool), false, `Onboarding tool "${tool}" leaked into /claude!`);
        }
        for (const tool of MUTATING_TOOLS) {
            assert.strictEqual(returnedTools.includes(tool), false, `Mutating tool "${tool}" leaked into /claude!`);
        }
        console.log(`  ✅ Excluded 11 onboarding tools and 5 mutating account tools`);
        await mcpClient.close();

        // ── 7. Root /mcp Gateway Isolation ──
        console.log('\n--- 7. Testing root /mcp isolation (55 tools preserved) ---');
        const rootTransport = new StreamableHTTPClientTransport(
            new URL(`http://localhost:${PORT}/mcp`),
            {
                requestInit: {
                    headers: {
                        'Authorization': 'Bearer sk_internal_service_test_key',
                        'X-Fodda-Session-Kind': 'internal-test'
                    }
                }
            }
        );
        const rootClient = new Client({ name: 'root-client', version: '1.0.0' });
        await rootClient.connect(rootTransport);
        const rootListRes = await rootClient.listTools();
        console.log(`  ✅ Root /mcp returned ${rootListRes.tools.length} tools`);
        assert(rootListRes.tools.length >= 50, `Expected root /mcp to have 50+ tools, got ${rootListRes.tools.length}`);
        assert(rootListRes.tools.some(t => t.name === 'begin_expert_onboarding'), 'Root /mcp must preserve begin_expert_onboarding');
        await rootClient.close();

        // ── 8. Live Clerk DCR & Consent Screen Audit ──
        console.log('\n--- 8. Testing Live Clerk DCR & Consent Screen ---');
        // Clerk DCR
        const dcrResp = await axios.post('https://clerk.fodda.ai/oauth/register', {
            client_name: 'Claude Test Verifier Suite',
            redirect_uris: ['https://claude.ai/api/mcp/oauth_callback']
        }, { timeout: 10000 });
        assert.strictEqual(dcrResp.status, 201, `Expected 201 from Clerk DCR, got ${dcrResp.status}`);
        assert(dcrResp.data?.client_id, 'Clerk DCR response missing client_id');
        assert(dcrResp.data?.client_secret, 'Clerk DCR response missing client_secret');
        console.log(`  ✅ Live Clerk DCR succeeded: client_id=${dcrResp.data.client_id}`);

        // Clerk Consent Screen
        const consentResp = await axios.get('https://app.fodda.ai/oauth-consent', { timeout: 10000 });
        assert.strictEqual(consentResp.status, 200, `Expected 200 from oauth-consent, got ${consentResp.status}`);
        const csp = (consentResp.headers['content-security-policy'] || '');
        assert(csp.includes('claude.ai'), 'Consent screen CSP must allow claude.ai');
        console.log('  ✅ Live OAuth Consent screen renders and allows claude.ai redirect');

        console.log('\n=============================================================');
        console.log('🎉 ALL CLAUDE OFFERING & OAUTH VERIFICATION TESTS PASSED!');
        console.log('=============================================================\n');

        serverProc.kill('SIGTERM');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err);
        serverProc.kill('SIGTERM');
        process.exit(1);
    }
}

run();
