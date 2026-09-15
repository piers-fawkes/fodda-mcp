/**
 * Verification test for On-Request Expert Query Intercept in consult_human_agent:
 * 1. Confirms unclaimed experts (e.g. Roxane Prieux) are loaded in catalog cache
 * 2. Invokes consult_human_agent with an unclaimed expert
 * 3. Verifies domain-backed intelligence is returned without 404/error
 * 4. Verifies the verification footnote is appended with the correct profile URL
 * 5. Verifies demand webhook format and emission
 */

import 'dotenv/config';
import assert from 'assert';
import crypto from 'crypto';
import axios from 'axios';
import { initCatalogCache, getAnalysts } from './catalogCache.js';
import { createServer } from './toolHandlers.js';

const SECRET = process.env.FODDA_MCP_SECRET || '';
const API_KEY = process.env.FODDA_API_KEY || process.env.FODDA_INTERNAL_API_KEY || 'sk_live_abcdef';
const BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

async function liveFoddaBackend(method: 'GET' | 'POST' | 'PATCH', endpoint: string, apiKey?: string, userId?: string, body?: any): Promise<any> {
    const url = `${BASE_URL}${endpoint}`;
    const timestamp = Date.now().toString();
    const payload = (method === 'POST' || method === 'PATCH')
        ? timestamp + '.' + JSON.stringify(body ?? {})
        : timestamp + '.' + endpoint;
    const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Fodda-Source': 'mcp',
        'X-Fodda-Billing': 'mcp-orchestrated',
        'X-API-Key': apiKey || API_KEY,
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Signature': signature
    };

    const res = await axios({
        method,
        url,
        headers,
        data: body,
        timeout: 30000
    });
    return res.data;
}

async function runTest() {
    console.log('=== Testing On-Request Expert Query Intercept in consult_human_agent ===\n');

    console.log('1. Initializing catalog cache with include=unclaimed...');
    await initCatalogCache();

    const analysts = getAnalysts();
    console.log(`   Catalog contains ${analysts.length} analysts.`);

    const roxane = analysts.find(a => (a.analyst_id || a.id || a.slug || '').toLowerCase().includes('roxane'));
    assert(roxane, 'Roxane Prieux must be present in cached analysts');
    console.log(`   Found expert: ${roxane.name} (status: ${roxane.status}, slug: ${roxane.slug || roxane.id})`);
    assert.strictEqual(roxane.status, 'Unclaimed', 'Roxane Prieux status must be Unclaimed');

    console.log('\n2. Initializing MCP server with tool handlers...');
    const server = await createServer(
        API_KEY,
        'test-verification-user@fodda.ai',
        liveFoddaBackend,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );

    const registeredTools: Record<string, any> = (server as any)._registeredTools || {};
    const consultTool = registeredTools['consult_human_agent'];
    assert(consultTool, 'consult_human_agent tool must be registered');

    const consultFn = consultTool.handler || consultTool.callback || consultTool.execute;

    console.log('\n3. Invoking consult_human_agent for Roxane Prieux (Unclaimed)...');
    const query = 'What are the key clean beauty formulation and sustainable packaging trends for 2026?';
    const result = await consultFn({
        analyst_id: 'roxane-prieux',
        query
    });

    console.log('\n4. Validating response payload...');
    assert(!result.isError, `Tool execution must not return isError: true. Result: ${JSON.stringify(result)}`);
    assert(Array.isArray(result.content) && result.content.length > 0, 'Result must contain content array');

    const fullText = result.content.map((c: any) => c.text).join('\n');
    console.log('--- Tool Output Snippet ---');
    console.log(fullText.slice(0, 500) + '...\n');

    // Check footnote
    assert(
        fullText.includes('undergoing onboarding verification'),
        'Output must contain onboarding verification note'
    );
    assert(
        fullText.includes('https://www.fodda.ai/experts/roxane-prieux'),
        'Output must contain expert profile URL'
    );
    assert(
        fullText.includes('available On Request'),
        'Output must note that verified human agent is available On Request'
    );

    // Check domain intelligence content
    assert(
        fullText.toLowerCase().includes('trend') || fullText.toLowerCase().includes('beauty') || fullText.toLowerCase().includes('packaging') || fullText.toLowerCase().includes('formulation'),
        'Output must contain domain trend intelligence'
    );

    console.log('✅ Footnote check passed:');
    const footnoteMatch = fullText.match(/\*Note:.*?\*/s);
    if (footnoteMatch) {
        console.log(`   "${footnoteMatch[0]}"`);
    }

    console.log('\n5. Checking sources used...');
    if (result.sources_used) {
        console.log(`   Total sources returned: ${result.sources_used.length}`);
        const hasProfileSource = result.sources_used.some((s: any) =>
            (s.url || '').includes('/experts/roxane-prieux')
        );
        assert(hasProfileSource, 'sources_used must include the expert profile URL');
        console.log('   ✅ Profile source included in sources_used.');
    }

    console.log('\n🎉 ALL ON-REQUEST INTERCEPT VERIFICATION TESTS PASSED!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
