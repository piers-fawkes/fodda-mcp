import assert from 'node:assert';
import { generateNextMoves, generateConsultNextMoves, renderConsultClosingEnvelope } from './coverageRelevance.js';
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

// ── Consult-Specific Next Moves Unit Tests (Render Spec 1.3) ──

// Test 6: Consult with explicit expert_thread.next_angle
{
    const mockResult = {
        coverage: 'in',
        report: 'In my cultural strategy framework, community commerce requires authentic creator alignment.',
        sources_used: [{ title: 'Creator Collectives and Community Commerce', type: 'own_graph', graph_id: 'ben-dietz-sic' }],
        expert_thread: {
            on_topic_total: 8,
            cited_count: 1,
            uncited_themes: ['Zines & Subcultures', 'Discord Councils'],
            brands: ['Supreme', 'Aimé Leon Dore'],
            next_angle: 'We can explore how creator collectives differ across European luxury markets next.'
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'cultural community commerce and luxury retail',
        'ben-dietz-sic',
        { knownBrand: 'Aimé Leon Dore' },
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(
        nextMoves.consult_envelope.thread_line,
        'We can explore how creator collectives differ across European luxury markets next.'
    );
    // Shelf must exclude Ben Dietz's own graph
    assert.ok(
        !nextMoves.consult_envelope.shelf_line.includes('Ben Dietz'),
        'Shelf must strictly exclude current expert'
    );
    assert.ok(
        nextMoves.consult_envelope.shelf_line.startsWith('Fodda also holds trend signals on this in'),
        'Shelf must use standard platform phrasing'
    );
    assert.strictEqual(
        nextMoves.consult_envelope.scope_line,
        'Want this cut to Aimé Leon Dore specifically?'
    );

    const rendered = renderConsultClosingEnvelope(nextMoves);
    assert.strictEqual(rendered.lines.length, 3, 'Must render exactly 3 sentences');
    console.log('✅ Test 6 Passed: Consult with explicit next_angle and 1.2 scope copy');
}

// Test 7: Consult fallback to uncited_themes when next_angle is absent
{
    const mockResult = {
        coverage: 'in',
        report: 'Community commerce analysis.',
        sources_used: [{ title: 'Creator Collectives', type: 'own_graph', graph_id: 'ben-dietz-sic' }],
        expert_thread: {
            on_topic_total: 5,
            cited_count: 1,
            uncited_themes: ['Discord Councils', 'Zines & Subcultures'],
            brands: ['Supreme'],
            next_angle: null
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'cultural community commerce',
        'ben-dietz-sic',
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(
        nextMoves.consult_envelope.thread_line,
        'If you want to stay on this, we can look into Discord Councils in my graph.'
    );
    assert.strictEqual(
        nextMoves.consult_envelope.scope_line,
        "If you tell me the brand or brief you're working on, I'll cut this to that."
    );
    console.log('✅ Test 7 Passed: Consult fallback to uncited_themes with 1.2 scope copy');
}

// Test 8: Consult fallback to graph remainder when next_angle and uncited_themes are absent
{
    const mockResult = {
        coverage: 'in',
        report: 'Community commerce analysis.',
        sources_used: [{ title: 'Creator Collectives', type: 'own_graph', graph_id: 'ben-dietz-sic' }],
        expert_thread: {
            on_topic_total: 6,
            cited_count: 1,
            uncited_themes: [],
            brands: [],
            next_angle: null
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'cultural community commerce',
        'ben-dietz-sic',
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(
        nextMoves.consult_envelope.thread_line,
        'There are several more trends in my graph exploring this topic — want me to pull those?'
    );
    assert.strictEqual(
        nextMoves.consult_envelope.scope_line,
        "If you tell me the brand or brief you're working on, I'll cut this to that."
    );
    console.log('✅ Test 8 Passed: Consult fallback to graph remainder');
}

// Test 9: Out-of-lane / decline consult with referrals
{
    const mockResult = {
        coverage: 'out',
        report: 'This Human Agent does not cover technical retail logistics.',
        sources_used: [],
        referrals: [
            { id: 'retail-lead', name: 'Retail Strategy Lead', curator: 'Retail Strategy Lead', reason: 'omnichannel retail logistics directly', status: 'Active' }
        ],
        expert_thread: {
            on_topic_total: 0,
            cited_count: 0,
            uncited_themes: [],
            brands: [],
            next_angle: null
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'warehouse logistics automation',
        'ben-dietz-sic',
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(
        nextMoves.consult_envelope.thread_line,
        "For inquiries on this topic, I'd recommend connecting with Retail Strategy Lead who covers omnichannel retail logistics directly."
    );
    console.log('✅ Test 9 Passed: Out-of-lane consult with peer referral');
}

// Test 10: next_angle token check failure triggers fallback per §2.A.5
{
    const mockResult = {
        coverage: 'in',
        report: 'Cultural brands analysis.',
        sources_used: [{ title: 'Streetwear Dynamics', type: 'own_graph', graph_id: 'ben-dietz-sic' }],
        expert_thread: {
            on_topic_total: 5,
            cited_count: 1,
            uncited_themes: ['Underground Music'],
            brands: [],
            // Hallucinated / completely unrelated angle sharing no tokens with sources or uncited themes:
            next_angle: 'We should look into quantum computing aerospace satellites.'
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'streetwear dynamics',
        'ben-dietz-sic',
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(
        nextMoves.consult_envelope.thread_line,
        'If you want to stay on this, we can look into Underground Music in my graph.',
        'Ungrounded next_angle must fail token check and fall back to uncited_themes'
    );
    console.log('✅ Test 10 Passed: next_angle token check failure triggers clean fallback');
}

console.log('All Next Moves unit tests passed successfully!');
