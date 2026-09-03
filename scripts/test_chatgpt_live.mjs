import { spawn } from 'child_process';
import http from 'http';
import assert from 'assert';
import fs from 'fs';
import { sanitizePayloadForChatGpt } from '../dist/toolHandlers.js';
import { handleAccessError } from '../dist/errorHandling.js';

const PORT = 8999;
const CHALLENGE_TOKEN = 'test-challenge-token-xyz-12345';
const ROUTES = [
    'mcp',
    'copilot',
    'chatgpt',
    'brand-intelligence',
    'topic-research',
    'deep-research',
    'earnings-intelligence',
    'expert-consult'
];

console.log('Starting live Fodda MCP server on port', PORT, '...');
const serverProc = spawn('node', ['dist/index.js'], {
    env: {
        ...process.env,
        PORT: String(PORT),
        OPENAI_APPS_CHALLENGE: CHALLENGE_TOKEN,
        CLERK_ISSUER_URL: 'https://clerk.fodda.ai',
        FODDA_MCP_SECRET: 'test_secret_chatgpt',
        FODDA_API_URL: 'https://api.fodda.ai',
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
    for (let i = 0; i < 30; i++) {
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
        console.log('Server is UP! Running test matrix...\n');

        // 1. Test OPENAI_APPS_CHALLENGE
        console.log('--- 1. Testing /.well-known/openai-apps-challenge ---');
        const challengeRes = await fetchHttp('GET', '/.well-known/openai-apps-challenge');
        assert.strictEqual(challengeRes.status, 200);
        assert(challengeRes.headers['content-type'].includes('text/plain'));
        assert.strictEqual(challengeRes.body.trim(), CHALLENGE_TOKEN);
        console.log('  PASS: Challenge token returned correctly:', challengeRes.body.trim());

        // 2. Test RFC 9728 Discovery Metadata for all 8 routes
        console.log('\n--- 2. Testing /.well-known/oauth-protected-resource/:slug ---');
        for (const route of ROUTES) {
            const discRes = await fetchHttp('GET', `/.well-known/oauth-protected-resource/${route}`);
            assert.strictEqual(discRes.status, 200);
            assert(discRes.headers['content-type'].includes('application/json'));
            const json = JSON.parse(discRes.body);
            assert(json.resource.endsWith(`/${route}`), `Resource URL must end with /${route}, got ${json.resource}`);
            assert(Array.isArray(json.authorization_servers) && json.authorization_servers.includes('https://clerk.fodda.ai'));
            console.log(`  PASS: /${route} metadata -> resource: ${json.resource}, auth: ${json.authorization_servers[0]}`);
        }

        // 3. Test 401 initialize matrix on all 8 routes
        console.log('\n--- 3. Testing 401 unauthenticated initialize on all 8 routes ---');
        const matrixRows = [];
        const initPayload = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'test-client', version: '1.0.0' }
            }
        });

        for (const route of ROUTES) {
            const postRes = await fetchHttp('POST', `/${route}`, {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }, initPayload);

            assert.strictEqual(postRes.status, 401, `Route /${route} must return 401, got ${postRes.status}`);
            const authHeader = postRes.headers['www-authenticate'] || '';
            assert(authHeader.includes('Bearer resource_metadata='), `Route /${route} must return WWW-Authenticate with resource_metadata`);
            assert(authHeader.includes(`/.well-known/oauth-protected-resource/${route}`), `Route /${route} metadata URL mismatch: ${authHeader}`);
            
            const errJson = JSON.parse(postRes.body);
            assert.strictEqual(errJson.error.code, -32000);
            console.log(`  PASS: /${route} -> 401 WWW-Authenticate: ${authHeader}`);

            matrixRows.push({
                route: `/${route}`,
                status: postRes.status,
                www_authenticate: authHeader,
                jsonrpc_error: errJson.error.code
            });
        }

        // 4. Test legacy deprecation path on /chatgpt
        console.log('\n--- 4. Testing legacy deprecation on /chatgpt?api_key=test ---');
        const legacyRes = await fetchHttp('GET', '/chatgpt?api_key=legacy_key');
        assert.strictEqual(legacyRes.status, 401);
        assert(legacyRes.body.includes('Fodda: this connection URL is outdated'));
        console.log('  PASS: /chatgpt?api_key=... correctly deprecated with 401');

        // 5. Test unit logic: sanitizePayloadForChatGpt
        console.log('\n--- 5. Testing sanitizePayloadForChatGpt ---');
        const testPayload = {
            id: 'node_123',
            analyst_id: 'analyst_piers',
            job_id: 'job_abc',
            trend_id: 'trend_999',
            _account: { email: 'test@example.com' },
            _upstream_usage: { warning: 'overage-active' },
            record_id: 'rec1234567890ABCD',
            airtable_record: 'rec9999999999ABCD',
            debug_info: 'verbose stack',
            trace_id: 'trace_123',
            internal_note: 'do not show',
            normal_field: 'valid value',
            nested: {
                _secret: 'hidden',
                node_id: 'node_nested_456',
                airtable_ref: 'rec0000000000ABCD',
                normal_child: 'valid child',
                airtable_id: 'rec1111111111ABCD'
            },
            array_field: [
                { id: 'item_1', _hidden: 123, rec_field: 'rec5555555555ABCD' },
                'normal string',
                'rec7777777777ABCD' // airtable string in array
            ]
        };
        const cleaned = sanitizePayloadForChatGpt(testPayload);
        // Preserved keys
        assert.strictEqual(cleaned.id, 'node_123');
        assert.strictEqual(cleaned.analyst_id, 'analyst_piers');
        assert.strictEqual(cleaned.job_id, 'job_abc');
        assert.strictEqual(cleaned.trend_id, 'trend_999');
        assert.strictEqual(cleaned.normal_field, 'valid value');
        assert.strictEqual(cleaned.nested.node_id, 'node_nested_456');
        assert.strictEqual(cleaned.nested.normal_child, 'valid child');
        assert.strictEqual(cleaned.array_field[0].id, 'item_1');
        // Dropped keys
        assert.strictEqual(cleaned._account, undefined);
        assert.strictEqual(cleaned._upstream_usage, undefined);
        assert.strictEqual(cleaned.record_id, undefined);
        assert.strictEqual(cleaned.airtable_record, undefined);
        assert.strictEqual(cleaned.debug_info, undefined);
        assert.strictEqual(cleaned.trace_id, undefined);
        assert.strictEqual(cleaned.internal_note, undefined);
        assert.strictEqual(cleaned.nested._secret, undefined);
        assert.strictEqual(cleaned.nested.airtable_ref, undefined);
        assert.strictEqual(cleaned.nested.airtable_id, undefined);
        assert.strictEqual(cleaned.array_field[0]._hidden, undefined);
        assert.strictEqual(cleaned.array_field[0].rec_field, undefined);
        assert.strictEqual(cleaned.array_field.length, 2); // 'rec7777777777ABCD' was removed
        console.log('  PASS: sanitizePayloadForChatGpt preserves *_id and strips internal/Airtable keys/values');

        // 6. Test unit logic: handleAccessError on chatgpt source
        console.log('\n--- 6. Testing handleAccessError on source=chatgpt ---');
        const creditError = {
            response: {
                status: 402,
                data: { error: { code: 'CREDITS_EXHAUSTED', message: 'Credits exhausted' } }
            }
        };
        const accessErrResult = await handleAccessError(creditError, 'search_graph', 'usr_123', 'sk_live_123', 'chatgpt');
        assert.strictEqual(accessErrResult.isError, true);
        const errObj = JSON.parse(accessErrResult.content[0].text);
        assert.strictEqual(errObj.error, 'QUOTA_EXHAUSTED');
        assert.strictEqual(errObj.manage_url, 'https://app.fodda.ai/account');
        assert.strictEqual(errObj.stripe_link, undefined);
        assert.strictEqual(errObj.top_up_url, undefined);
        assert.strictEqual(errObj.action, undefined);
        assert(!JSON.stringify(errObj).includes('stripe.com'));
        assert(!JSON.stringify(errObj).includes('$'));
        console.log('  PASS: handleAccessError returns clean commerce-free QUOTA_EXHAUSTED for chatgpt');

        // 7. Verify tools-manifest.json
        console.log('\n--- 7. Verifying tools-manifest.json profile count ---');
        const manifest = JSON.parse(fs.readFileSync('tools-manifest.json', 'utf8'));
        const chatgptTools = manifest.tools.filter(t => t.profiles.includes('chatgpt'));
        assert.strictEqual(chatgptTools.length, 24, `Expected exactly 24 tools in chatgpt profile, got ${chatgptTools.length}`);
        console.log('  PASS: tools-manifest.json has exactly 24 tools under chatgpt profile');

        console.log('\n========================================');
        console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
        console.log('========================================\n');

        console.log('LIVE CURL 401 MATRIX (for CHANGELOG.md):');
        console.log('| Route | HTTP Status | WWW-Authenticate Header | JSON-RPC Error |');
        console.log('|---|---|---|---|');
        for (const row of matrixRows) {
            console.log(`| \`${row.route}\` | \`${row.status}\` | \`${row.www_authenticate}\` | \`${row.jsonrpc_error}\` |`);
        }

    } finally {
        serverProc.kill('SIGTERM');
    }
}

run().catch(err => {
    console.error('TEST FAILED:', err);
    serverProc.kill('SIGKILL');
    process.exit(1);
});
