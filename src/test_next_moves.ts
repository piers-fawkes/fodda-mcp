import assert from 'node:assert';
import { generateNextMoves } from './coverageRelevance.js';
import type { CatalogGraph, CatalogAnalyst } from './catalogCache.js';

console.log('--- Running Next Moves Unit Tests ---');

// Mock graphs
const mockGraphs: any[] = [
    {
        graph_id: 'retail',
        name: 'Retail Strategy & Innovation',
        graph_type: 'domain',
        status: 'live',
        topics: ['retail'],
        trend_count: 150,
        evidence_count: 600,
    },
    {
        graph_id: 'ben-dietz-sic',
        name: '[SIC] Weekly — Cultural Strategy',
        graph_type: 'expert',
        status: 'live',
        topics: ['culture'],
        curator: 'Ben Dietz',
        trend_count: 80,
        evidence_count: 300,
    },
    {
        graph_id: 'beauty',
        name: 'Beauty & Wellness',
        graph_type: 'domain',
        status: 'live',
        topics: ['beauty'],
        trend_count: 120,
        evidence_count: 450,
    }
];

// Mock analysts
const mockAnalysts: any[] = [
    {
        analyst_id: 'ben-dietz-sic',
        name: 'Ben Dietz',
        status: 'Active',
        topics: ['culture', 'marketing', 'trends'],
        description: 'Cultural strategy and youth marketing',
        graph_type: 'expert',
    },
    {
        analyst_id: 'retail-lead',
        name: 'Retail Strategy Lead',
        status: 'Active',
        topics: ['retail', 'commerce', 'omnichannel'],
        description: 'Omnichannel retail innovation',
        graph_type: 'expert',
    },
    {
        analyst_id: 'inactive-expert',
        name: 'Inactive Guy',
        status: 'Paused',
        topics: ['retail'],
        description: 'Old retail',
        graph_type: 'expert',
    }
];

// Test 1: Full coverage with more signals remaining
{
    const rows = [
        { title: 'AI in store operations', brandNames: ['Nike', 'Adidas'], graphId: 'retail', theme: 'AI in retail' },
        { title: 'Smart checkout systems', brands: ['Amazon'], graphId: 'retail', theme: 'AI in retail' },
    ];
    const nextMoves = generateNextMoves(
        rows,
        'AI in retail stores',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { total: 10, onTopicTotal: 10, knownBrand: 'Nike' }
    );

    assert.ok(nextMoves, 'nextMoves should be defined');
    assert.strictEqual(nextMoves.presentation, 'internal');
    assert.strictEqual(nextMoves.scope_prompt, true);
    assert.strictEqual(nextMoves.known_brand, 'Nike');
    assert.strictEqual(nextMoves.thread?.kind, 'more_in_graph');
    assert.strictEqual(nextMoves.thread?.graph_id, 'retail');
    assert.strictEqual(nextMoves.thread?.remaining_count, 8);
    assert.ok(nextMoves.specific?.brands?.includes('Nike'));
    assert.ok(nextMoves.specific?.brands?.includes('Adidas'));
    console.log('✅ Test 1 Passed: Full coverage with remaining signals');
}

// Test 2: Thin coverage with adjacent room
{
    const rows = [
        { title: 'Underground fashion drops', graphId: 'ben-dietz-sic' }
    ];
    const nextMoves = generateNextMoves(
        rows,
        'underground streetwear subcultures',
        ['retail'],
        'thin',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves, 'nextMoves should be defined');
    assert.ok(nextMoves.thread?.kind === 'adjacent_room' || nextMoves.thread?.kind === 'honest_thin');
    assert.ok(nextMoves.specific?.expert?.display_name, 'Should recommend a relevant active expert');
    assert.notStrictEqual(nextMoves.specific?.expert?.analyst_id, 'inactive-expert', 'Never recommend inactive expert');
    console.log('✅ Test 2 Passed: Thin coverage with adjacent room & expert match');
}

// Test 3: Expert consult exclusion
{
    const rows = [
        { title: 'Streetwear culture shift', brands: ['Supreme', 'Stussy'], graphId: 'ben-dietz-sic' }
    ];
    const nextMoves = generateNextMoves(
        rows,
        'streetwear trends',
        ['ben-dietz-sic'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { currentAnalystId: 'ben-dietz-sic' }
    );

    assert.ok(nextMoves, 'nextMoves should be defined');
    if (nextMoves.specific?.expert) {
        assert.notStrictEqual(nextMoves.specific.expert.analyst_id, 'ben-dietz-sic', 'Should not recommend the analyst currently being consulted');
    }
    assert.deepStrictEqual(nextMoves.specific?.brands, ['Supreme', 'Stussy']);
    console.log('✅ Test 3 Passed: Expert consult does not recommend self');
}

// Test 4: OK coverage with 0 remainder and all relevant graphs searched -> thread should be undefined
{
    const rows = [
        { title: 'Trend 1', graphId: 'retail' },
        { title: 'Trend 2', graphId: 'ben-dietz-sic' },
        { title: 'Trend 3', graphId: 'beauty' },
    ];
    const nextMoves = generateNextMoves(
        rows,
        'retail strategy and cultural trends',
        ['retail', 'ben-dietz-sic', 'beauty'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { total: 3, onTopicTotal: 3 }
    );

    assert.ok(nextMoves, 'nextMoves should be defined');
    assert.strictEqual(nextMoves.thread, undefined, 'Thread should be dropped when ok coverage has 0 remainder and no unsearched room');
    console.log('✅ Test 4 Passed: OK coverage with 0 remainder drops thread line');
}

// Test 5: Statistics source populated on market/retail queries
{
    const rows = [{ title: 'Retail spending surge', graphId: 'retail' }];
    const nextMoves = generateNextMoves(
        rows,
        'retail consumer spending market trends',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.specific?.statistics_source, 'Should recommend a statistics source for retail spending queries');
    assert.ok(nextMoves.specific.statistics_source.includes('Census'), 'Should recommend Census for retail spending');
    console.log('✅ Test 5 Passed: Statistics source populated for market query');
}

console.log('All Next Moves unit tests passed successfully!');
