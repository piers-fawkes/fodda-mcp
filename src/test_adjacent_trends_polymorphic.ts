import assert from 'node:assert';
import { createServer } from './toolHandlers.js';
import { setCachedCatalogForTesting } from './catalogCache.js';

console.log('=== Running Verification: Polymorphic discover_adjacent_trends ===\n');

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

const mockGraphsList = [
    {
        graph_id: 'retail',
        name: 'Retail Strategy & Innovation',
        domain: 'retail',
        graph_type: 'domain',
        status: 'live',
        topics: ['retail', 'freight', 'logistics', 'capacity', 'peak season', 'packaging'],
        trend_count: 150,
        evidence_count: 500,
        headline: 'Future of retail operations and omnichannel commerce'
    }
];

const mockAnalystsList: any[] = [];

setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphsList.length, graphs: mockGraphsList as any },
    mockAnalystsList as any
);

async function mockFoddaBackend(method: string, endpoint: string, apiKey?: string, userId?: string, body?: any): Promise<any> {
    if (endpoint.includes('/v1/graphs/catalog') || endpoint === '/v1/graphs') {
        return { graphs: mockGraphsList };
    }

    if (endpoint.includes('/search')) {
        return {
            total: 2,
            on_topic_total: 2,
            rows: [
                {
                    title: 'Peak Season Freight Guarantee Contracts',
                    trendName: 'Peak Season Freight Guarantee Contracts',
                    node_id: '2507.0',
                    score: 0.95,
                    trendLifecycle: 'emerging',
                    signal_score: 88,
                    brandNames: ['Walmart', 'Target']
                },
                {
                    title: 'Dedicated Fleet Capacity Reserves',
                    trendName: 'Dedicated Fleet Capacity Reserves',
                    node_id: '2508.0',
                    score: 0.89,
                    trendLifecycle: 'building',
                    signal_score: 82,
                    brandNames: ['Amazon']
                }
            ]
        };
    }

    if (endpoint.includes('/adjacent')) {
        return {
            adjacent: [
                {
                    name: 'Dynamic Intermodal Route Optimization',
                    trendName: 'Dynamic Intermodal Route Optimization',
                    node_id: '3101.0',
                    similarity: 0.86,
                    vertical: 'retail',
                    description: 'Retailers re-routing supply chains dynamically around bottlenecked ports.'
                },
                {
                    name: 'Shared Warehousing Cooperatives',
                    trendName: 'Shared Warehousing Cooperatives',
                    node_id: '3102.0',
                    similarity: 0.81,
                    vertical: 'retail',
                    description: 'Mid-sized retailers pooling distribution facilities to buffer volume spikes.'
                }
            ]
        };
    }

    return {};
}

async function runTests() {
    const server = await createServer(
        'sk_live_test_key',
        'user_test_123',
        mockFoddaBackend as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );

    const toolReg: any = (server as any)._registeredTools['discover_adjacent_trends'];
    assert.ok(toolReg, 'discover_adjacent_trends tool must be registered');
    const toolFn = toolReg.handler || toolReg.callback || toolReg.execute;

    // ---------------------------------------------------------------------------
    // Test 1: Calling with seed_query (repro of user prompt)
    // ---------------------------------------------------------------------------
    console.log('1. Testing call with { seed_query: "retailers paying to guarantee freight capacity ahead of peak season" }...');
    const res1 = await toolFn({
        seed_query: 'retailers paying to guarantee freight capacity ahead of peak season'
    }, { authInfo: {} });

    check(!res1.isError, 'Call with seed_query does not error');
    assert.ok(Array.isArray(res1.content) && res1.content.length > 0, 'Must return content array');
    const text1 = res1.content[0].text;
    check(text1.includes('topic_adjacency_cascade'), 'Payload indicates topic_adjacency_cascade mode');
    check(text1.includes('Peak Season Freight Guarantee Contracts'), 'Found seed trend in response');
    check(text1.includes('Dynamic Intermodal Route Optimization'), 'Found adjacent trend in response');
    check(!!res1.next_moves, 'Returns structured next_moves metadata');

    // ---------------------------------------------------------------------------
    // Test 2: Calling with query alias
    // ---------------------------------------------------------------------------
    console.log('\n2. Testing call with { query: "sustainable luxury packaging" }...');
    const res2 = await toolFn({
        query: 'sustainable luxury packaging'
    }, { authInfo: {} });

    check(!res2.isError, 'Call with query does not error');
    const text2 = res2.content[0].text;
    check(text2.includes('topic_adjacency_cascade'), 'Payload indicates topic_adjacency_cascade mode');
    check(!!res2.next_moves, 'Returns structured next_moves metadata');

    // ---------------------------------------------------------------------------
    // Test 3: Calling with text phrase passed into trend_id
    // ---------------------------------------------------------------------------
    console.log('\n3. Testing call with text phrase passed into trend_id...');
    const res3 = await toolFn({
        trend_id: 'retailers paying to guarantee freight capacity ahead of peak season'
    }, { authInfo: {} });

    check(!res3.isError, 'Call with phrase trend_id does not error');
    const text3 = res3.content[0].text;
    check(text3.includes('topic_adjacency_cascade'), 'Phrase trend_id auto-routes to topic cascade');

    // ---------------------------------------------------------------------------
    // Test 4: Legacy node lookup with graphId and trend_id
    // ---------------------------------------------------------------------------
    console.log('\n4. Testing legacy node ID lookup with { graphId: "retail", trend_id: "2507.0" }...');
    const res4 = await toolFn({
        graphId: 'retail',
        trend_id: '2507.0'
    }, { authInfo: {} });

    check(!res4.isError, 'Legacy node lookup does not error');
    const text4 = res4.content[0].text;
    check(!text4.includes('topic_adjacency_cascade'), 'Legacy node lookup runs single-node lookup');
    check(text4.includes('Dynamic Intermodal Route Optimization'), 'Returns adjacent nodes');
    check(!!res4.next_moves, 'Returns structured next_moves metadata');

    // ---------------------------------------------------------------------------
    // Test 5: Empty arguments error handling
    // ---------------------------------------------------------------------------
    console.log('\n5. Testing empty argument call...');
    const res5 = await toolFn({}, { authInfo: {} });
    check(res5.isError === true, 'Empty argument call returns error');
    check(res5.content[0].text.includes('discover_adjacent_trends requires either'), 'Error contains helpful guidance');

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
