import assert from 'assert';
import { createServer } from './toolHandlers.js';
import { setCachedCatalogForTesting } from './catalogCache.js';

console.log('--- Running search_graph Timeout Mitigation & Request Bounding Test Suite ---\n');

// Mock catalog with food graph
const mockGraphs = [
    {
        graph_id: 'food',
        name: 'Food & Beverage Intelligence',
        topics: ['food', 'beverage', 'alcohol', 'spirits', 'wine', 'beer', 'retail'],
        graph_type: 'domain',
        status: 'live',
        trend_count: 50,
        signal_count: 200,
        author: 'PSFK',
        company: 'PSFK',
        last_synced: '2026-04-01T00:00:00.000Z'
    }
];

setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphs.length, graphs: mockGraphs as any },
    []
);

async function runTests() {
    // ---------------------------------------------------------------------------
    // Test 1: Query with targetGraphId "food" completes fast (<10,000 ms)
    // ---------------------------------------------------------------------------
    console.log('Test 1: search_graph("alcoholic beverages retail spirits wine beer", "food") completes quickly');
    {
        const startTime = Date.now();
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path.includes('/v1/graphs/food/search')) {
                return {
                    rows: [
                        {
                            trendId: 'trend_craft_spirits',
                            trendName: 'RTD Craft Spirits in Modern Retail',
                            summary: 'Premixed premium cocktails expanding in shelf space.',
                            relevance_score: 0.92,
                            signal_score: 85,
                            graphId: 'food',
                            evidence: [
                                { title: 'RTD Retail Surge', url: 'https://example.com/rtd', source: 'Beverage Daily' }
                            ]
                        }
                    ],
                    total: 1,
                    on_topic_total: 1,
                    dataStatus: 'ok'
                };
            }
            if (path.includes('/v1/supplemental/suggest')) {
                return [];
            }
            if (path.includes('/v1/supplemental/')) {
                return null;
            }
            return { ok: true };
        };

        const server = await createServer(
            'sk_live_test_key',
            'test_user@example.com',
            mockFoddaRequest as any,
            (async () => ({})) as any,
            () => 'widget_html',
            () => 'http://localhost'
        );

        const tools = (server as any)._registeredTools;
        assert.ok(tools.search_graph, 'search_graph tool should exist');

        const result = await tools.search_graph.handler({
            query: 'alcoholic beverages retail spirits wine beer',
            graphId: 'food'
        });

        const duration = Date.now() - startTime;
        console.log(`  Completed in ${duration}ms`);
        assert.ok(duration < 10000, `Expected duration < 10,000 ms, took ${duration}ms`);
        assert.ok(result.content && result.content.length > 0, 'Should return content');

        const textContent = result.content[0].text;
        assert.ok(textContent.includes('RTD Craft Spirits') || textContent.includes('trend_craft_spirits'), 'Should contain returned trend');
        console.log('  ✅ Test 1 Passed: Fast execution under 10,000 ms verified');
    }

    // ---------------------------------------------------------------------------
    // Test 2: Bounded supplemental macro fetch: 4,000 ms max timeout
    // ---------------------------------------------------------------------------
    console.log('\nTest 2: Supplemental macro fetch is bounded and does not hang');
    {
        const startTime = Date.now();
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path.includes('/v1/graphs/food/search')) {
                return {
                    rows: [
                        {
                            trendId: 'trend_beer_retail',
                            trendName: 'Non-Alcoholic Craft Beer Growth in US Supermarkets',
                            summary: 'NA beer retail growth exceeds 25% year over year.',
                            relevance_score: 0.88,
                            signal_score: 80,
                            graphId: 'food'
                        }
                    ],
                    total: 1,
                    on_topic_total: 1,
                    dataStatus: 'ok'
                };
            }
            if (path.includes('/v1/supplemental/google-trends') || path.includes('/v1/supplemental/census/')) {
                // Simulate slow / hanging supplemental macro endpoint (> 10s)
                return new Promise((resolve) => setTimeout(() => resolve({ delayed: true }), 10000));
            }
            return { ok: true };
        };

        const server = await createServer(
            'sk_live_test_key',
            'test_user@example.com',
            mockFoddaRequest as any,
            (async () => ({})) as any,
            () => 'widget_html',
            () => 'http://localhost'
        );

        const tools = (server as any)._registeredTools;
        const result = await tools.search_graph.handler({
            query: 'alcoholic beverages retail stats market size',
            graphId: 'food'
        });

        const duration = Date.now() - startTime;
        console.log(`  Completed in ${duration}ms with simulated hanging supplemental fetch`);
        // Bounded by 4,000ms supplemental timeout instead of 35,000ms axios timeout
        assert.ok(duration < 8000, `Expected duration < 8,000 ms, took ${duration}ms`);
        assert.ok(duration >= 3800, `Expected supplemental timeout around 4,000 ms, took ${duration}ms`);
        assert.ok(result.content && result.content.length > 0, 'Should return content without error');
        console.log('  ✅ Test 2 Passed: 4,000ms supplemental macro fetch bound verified');
    }

    // ---------------------------------------------------------------------------
    // Test 3: Primary search timeout (15,000 ms) returns graceful error without throwing -32001
    // ---------------------------------------------------------------------------
    console.log('\nTest 3: Primary search timeout handles hanging backend gracefully');
    {
        const startTime = Date.now();
        const mockFoddaRequest = async (method: string, path: string) => {
            if (path.includes('/v1/graphs/food/search')) {
                // Hang primary search
                return new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 40000));
            }
            return { ok: true };
        };

        const server = await createServer(
            'sk_live_test_key',
            'test_user@example.com',
            mockFoddaRequest as any,
            (async () => ({})) as any,
            () => 'widget_html',
            () => 'http://localhost'
        );

        const tools = (server as any)._registeredTools;
        const result = await tools.search_graph.handler({
            query: 'hanging test query',
            graphId: 'food'
        });

        const duration = Date.now() - startTime;
        console.log(`  Completed in ${duration}ms with hanging primary search`);
        assert.ok(duration < 28000, `Expected duration < 28,000 ms, took ${duration}ms`);
        const textContent = result.content[0].text;
        assert.ok(textContent.includes('TIMEOUT') || textContent.includes('error') || textContent.includes('exceeded time limit'), 'Response should communicate timeout/error cleanly');
        console.log('  ✅ Test 3 Passed: Graceful response on primary backend hang verified');
    }

    console.log('\nAll search_graph timeout mitigation tests passed successfully!');
}

runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
