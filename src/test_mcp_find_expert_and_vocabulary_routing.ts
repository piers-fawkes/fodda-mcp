import assert from 'assert';
import { getRelevantGraphs, initCatalogCache, setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';

console.log('--- Running Unit Tests: find_expert Limit Enforcement & Vocabulary Routing ---');

async function runTests() {
    // ---------------------------------------------------------------------------
    // Test 1: find_expert Limit Enforcement (API returns > limit items)
    // ---------------------------------------------------------------------------
    console.log('\nTest 1: find_expert limit enforcement when API returns many candidates');

    // Create 24 mock results
    const mock24Results = Array.from({ length: 24 }, (_, i) => ({
        id: `expert-${i + 1}`,
        slug: `expert-${i + 1}`,
        name: `Expert Candidate ${i + 1}`,
        status: 'Unclaimed',
        agent_class: 'human_agent',
        role_title: `Specialist ${i + 1}`,
        why_matched: ['Growth', 'Consumer Apps']
    }));

    const mockServer = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'growing consumer app',
                    total_matches: 24,
                    results: mock24Results,
                    related_knowledge_graphs: []
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertTool = (mockServer as any)._registeredTools['find_expert'];
    assert.ok(findExpertTool, 'find_expert tool must be registered');

    const result = await findExpertTool.handler({
        query: 'Which experts should I talk to about growing a consumer app from 40,000 to 400,000 users?',
        limit: 3
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.candidates.length, 3, `Expected exactly 3 candidates matching limit: 3, got ${parsed.candidates.length}`);
    assert.strictEqual(parsed.total_matches, 3, `Expected total_matches to be 3, got ${parsed.total_matches}`);
    console.log('✅ Test 1 Passed: find_expert output sliced to limit (3 candidates out of 24 returned by API)');

    // ---------------------------------------------------------------------------
    // Test 2: Vocabulary Routing Overrides for "creator economy"
    // ---------------------------------------------------------------------------
    console.log('\nTest 2: Vocabulary routing overrides for "creator economy"');

    // Mock catalog for routing test
    setCachedCatalogForTesting({
        version: '1.0',
        generated_at: '2026-09-29',
        graph_count: 5,
        graphs: [
        {
            graph_id: 'visa-creators_report-2025',
            name: 'Visa State of the Creator Economy Report 2025',
            domain: 'creator economy',
            graph_type: 'industry report',
            status: 'live',
            trend_count: 50,
            last_synced: '2026-09-01T00:00:00Z',
            topics: ['creator economy', 'content creators', 'monetization'],
            routing_keywords: ['creator', 'monetization', 'sponsorship']
        },
        {
            graph_id: 'youtube-eoy_cats_trends_report_2025',
            name: 'YouTube End of Year Category Trends 2025',
            domain: 'video & podcasts',
            graph_type: 'industry report',
            status: 'live',
            trend_count: 40,
            last_synced: '2026-09-01T00:00:00Z',
            topics: ['podcasting', 'creators', 'youtube'],
            routing_keywords: ['podcasts', 'youtube', 'creators']
        },
        {
            graph_id: 'mary-shelley',
            name: 'Frankenstein & The Creator Duty of Care',
            curator: 'Mary Shelley',
            domain: 'classic literature',
            graph_type: 'expert',
            status: 'live',
            trend_count: 15,
            last_synced: '2026-09-01T00:00:00Z',
            topics: ['creator duty of care', 'frankenstein', 'ethics'],
            routing_keywords: ['creator', 'ethics']
        },
        {
            graph_id: 'bompasparr-future-of-p-leisure-2026-nightlife',
            name: 'Bompas & Parr Future of Leisure & Nightlife 2026',
            domain: 'hospitality & nightlife',
            graph_type: 'industry report',
            status: 'live',
            trend_count: 35,
            last_synced: '2026-09-01T00:00:00Z',
            topics: ['nightlife', 'going out', 'shared experiences'],
            routing_keywords: ['nightlife', 'going out', 'leisure']
        },
        {
            graph_id: 'retail',
            name: 'Retail Strategy Anchor',
            domain: 'retail',
            graph_type: 'domain',
            status: 'live',
            trend_count: 100,
            last_synced: '2026-09-01T00:00:00Z',
            topics: ['retail', 'commerce'],
        }
    ] as any});

    const creatorRouting = getRelevantGraphs('creator economy and podcasting trends');
    const creatorRoutedIds = creatorRouting.map(r => r.graph.graph_id);
    console.log('Creator query routed graphs:', creatorRoutedIds);

    assert.ok(creatorRoutedIds.includes('visa-creators_report-2025'), 'visa-creators_report-2025 must be routed for creator economy query');
    assert.ok(creatorRoutedIds.includes('youtube-eoy_cats_trends_report_2025'), 'youtube-eoy_cats_trends_report_2025 must be routed for podcasting query');
    assert.strictEqual(creatorRoutedIds.includes('mary-shelley'), false, 'mary-shelley must be excluded from creator economy query');
    console.log('✅ Test 2 Passed: "creator economy" routes to visa-creators & youtube graphs; mary-shelley excluded');

    // ---------------------------------------------------------------------------
    // Test 3: Vocabulary Routing Overrides for "nightlife" and "going out"
    // ---------------------------------------------------------------------------
    console.log('\nTest 3: Vocabulary routing overrides for "nightlife" and "going out"');

    const nightlifeRouting = getRelevantGraphs('Gen Z going out, nightlife and shared social experiences');
    const nightlifeRoutedIds = nightlifeRouting.map(r => r.graph.graph_id);
    console.log('Nightlife query routed graphs:', nightlifeRoutedIds);

    assert.ok(nightlifeRoutedIds.includes('bompasparr-future-of-p-leisure-2026-nightlife'), 'bompasparr nightlife graph must be routed for nightlife & going out query');
    console.log('✅ Test 3 Passed: "going out" and "nightlife" route to bompasparr nightlife graph');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
