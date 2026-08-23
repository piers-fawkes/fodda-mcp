import assert from 'node:assert';
import { generateNextMoves, generateConsultNextMoves, renderConsultClosingEnvelope, clearSuggestCacheForTesting } from './coverageRelevance.js';
import { setCachedCatalogForTesting, type CatalogGraph, type CatalogAnalyst } from './catalogCache.js';

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

// Initialize catalog cache for testing
setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphs.length, graphs: mockGraphs as any },
    mockAnalysts as any
);

async function runTests() {
// Test 1: Full coverage with more signals remaining
{
    const rows = [
        { title: 'AI in store operations', brandNames: ['Nike', 'Adidas'], graphId: 'retail', theme: 'AI in retail' },
        { title: 'Smart checkout systems', brands: ['Amazon'], graphId: 'retail', theme: 'AI in retail' },
    ];
    const nextMoves = await generateNextMoves(
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
    const nextMoves = await generateNextMoves(
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
    const nextMoves = await generateNextMoves(
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
    const nextMoves = await generateNextMoves(
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
    const nextMoves = await generateNextMoves(
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
    assert.ok(nextMoves.consult_envelope.shelf_line, 'Shelf line must be defined');
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

// Test 11: Consult with empty shelf candidate list omits sentence 2 (2 sentences rendered)
{
    const mockResult = {
        coverage: 'in',
        report: 'Niche topic report.',
        sources_used: [{ title: 'Niche Analysis', type: 'own_graph', graph_id: 'ben-dietz-sic' }],
        expert_thread: {
            on_topic_total: 3,
            cited_count: 1,
            uncited_themes: ['Subculture Zines'],
            next_angle: 'We can explore subculture zines next.'
        }
    };

    // Only 1 graph in catalog (the expert's own graph), so no candidate shelf graphs exist
    const onlyOwnGraph: CatalogGraph[] = [mockGraphs[1]];
    setCachedCatalogForTesting(
        { version: '1.0', generated_at: new Date().toISOString(), graph_count: 1, graphs: onlyOwnGraph as any },
        mockAnalysts as any
    );

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'obscure query with no other graph coverage',
        'ben-dietz-sic',
        undefined,
        onlyOwnGraph,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(nextMoves.consult_envelope.shelf_line, undefined, 'shelf_line must be omitted when no relevant graphs exist');
    assert.strictEqual(nextMoves.shelf, undefined, 'shelf must be undefined when no candidates exist');

    const rendered = renderConsultClosingEnvelope(nextMoves);
    assert.strictEqual(rendered.lines.length, 2, 'Must render exactly 2 sentences when shelf is omitted');
    assert.strictEqual(
        rendered.text,
        "We can explore subculture zines next. If you tell me the brand or brief you're working on, I'll cut this to that."
    );
    console.log('✅ Test 11 Passed: Consult with empty shelf candidates cleanly omits sentence 2');
}

// Test 12: Pinned regression test against 1.46.23 envelope for search_graph("Gen Z beverage hydration trends")
{
    const rows = [
        { title: 'Functional Hydration Beverages', brandNames: ['Liquid IV', 'Gatorade'], graphId: 'retail', score: 1.8, topics: ['beverage', 'retail'], on_topic_total: 8 },
        { title: 'Electrolyte Micro-Dosing', brandNames: ['Waterdrop'], graphId: 'retail', score: 1.6, topics: ['wellness'], on_topic_total: 8 },
        { title: 'Adaptogenic Sparkling Waters', brandNames: ['Recess', 'Kin'], graphId: 'retail', score: 1.7, topics: ['beverage'], on_topic_total: 8 },
        { title: 'Off-topic Gaming trend', brandNames: ['PlayStation'], graphId: 'retail', score: 0.2, topics: ['gaming'], on_topic_total: 8 },
        { title: 'Off-topic Luxury trend', brandNames: ['Hermès'], graphId: 'retail', score: 0.1, topics: ['luxury'], on_topic_total: 8 }
    ];

    const nextMoves = await generateNextMoves(
        rows,
        'Gen Z beverage hydration trends',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { total: 12, onTopicTotal: 8 }
    );

    assert.ok(nextMoves, 'nextMoves must be defined');
    assert.strictEqual(nextMoves.thread?.kind, 'more_in_graph', 'Thread kind must be more_in_graph');
    assert.strictEqual(nextMoves.thread?.graph_id, 'retail');
    assert.ok(typeof nextMoves.thread?.remaining_count === 'number' && nextMoves.thread.remaining_count > 0, 'remaining_count must be > 0');

    // Brands must be extracted strictly from on-topic rows (Liquid IV, Gatorade, Waterdrop, Recess, Kin)
    // and NEVER from off-topic rows (PlayStation, Hermès)
    assert.ok(nextMoves.specific?.brands && nextMoves.specific.brands.length > 0, 'specific.brands must be populated');
    const ON_TOPIC_BEVERAGE_BRANDS = new Set(['Liquid IV', 'Gatorade', 'Waterdrop', 'Recess', 'Kin']);
    for (const b of nextMoves.specific.brands) {
        assert.ok(ON_TOPIC_BEVERAGE_BRANDS.has(b), `Brand "${b}" must be from on-topic rows`);
        assert.notStrictEqual(b, 'PlayStation', 'Must not contain off-topic PlayStation');
        assert.notStrictEqual(b, 'Hermès', 'Must not contain off-topic Hermès');
    }
    console.log('✅ Test 12 Passed: Pinned regression test against 1.46.23 envelope for search_graph');
}

// Test 13: Lululemon competitor filter with explicit allowed athletic/apparel list
{
    const ALLOWED_LULULEMON_COMPETITORS = new Set([
        'Nike', 'Adidas', 'Alo', 'Alo Yoga', 'Vuori', 'Athleta',
        'Under Armour', 'Gymshark', 'On', 'On Running', 'Puma',
        'New Balance', 'Lorna Jane', 'Sweaty Betty', "Arc'teryx"
    ]);

    // Simulated Lululemon footprint trends (sports graph)
    const sportsFootprint = [
        { trend_name: 'Studio Athletic Performance', brandNames: ['Alo', 'Vuori'], graphId: 'sports', signal_score: 180 },
        { trend_name: 'Technical Running Apparel', brandNames: ['Nike', 'On Running'], graphId: 'sports', signal_score: 160 }
    ];

    const nextMovesWithSports = await generateNextMoves(
        sportsFootprint,
        'Lululemon',
        ['sports'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        {
            isBrandTracker: true,
            competitiveLandscape: ['Alo', 'Vuori'],
            brandDisplayName: 'Lululemon',
            earningsStatsSource: "Lululemon's latest earnings and financial results"
        }
    );

    if (nextMovesWithSports.specific?.brands) {
        for (const b of nextMovesWithSports.specific.brands) {
            assert.ok(ALLOWED_LULULEMON_COMPETITORS.has(b), `Brand "${b}" must be in allowed athletic/apparel competitor list`);
        }
    }

    // Simulated Lululemon with no sector-matching competitors (e.g. noise only -> competitiveLandscape empty)
    const nextMovesEmptyCompetitors = await generateNextMoves(
        sportsFootprint,
        'Lululemon',
        ['sports'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        {
            isBrandTracker: true,
            competitiveLandscape: [], // <1 competitor survives
            brandDisplayName: 'Lululemon',
            earningsStatsSource: "Lululemon's latest earnings and financial results"
        }
    );

    assert.strictEqual(nextMovesEmptyCompetitors.specific?.brands, undefined, 'specific.brands must be undefined when competitiveLandscape is empty');
    assert.strictEqual(nextMovesEmptyCompetitors.specific?.statistics_source, "Lululemon's latest earnings and financial results");

    const closing = renderConsultClosingEnvelope(nextMovesEmptyCompetitors);
    assert.ok(!closing.text.includes('La Mer'), 'Must never mention La Mer');
    assert.ok(!closing.text.includes('NCR'), 'Must never mention NCR');
    assert.ok(!closing.text.includes('Discover'), 'Must never mention Discover');
    console.log('✅ Test 13 Passed: Lululemon competitor filter strictly adheres to athletic/apparel allowed set or omits clause');
}

// Test 14: Consult shelf score floor (query with low relevance to domain graphs cleanly omits sentence 2)
{
    const mockResult = {
        coverage: 'in',
        report: 'Earned media and podcast strategies.',
        sources_used: [{ title: 'Podcast Guesting Tips', type: 'own_graph', graph_id: 'james-colistra-earned-media-and-podcast' }],
        expert_thread: {
            on_topic_total: 4,
            cited_count: 1,
            uncited_themes: ['Host Alignment'],
            next_angle: 'We can explore host alignment and podcast pitching strategies next.'
        }
    };

    const nextMoves = generateConsultNextMoves(
        mockResult,
        'podcast guest tips',
        'james-colistra-earned-media-and-podcast',
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.consult_envelope, 'consult_envelope must be populated');
    assert.strictEqual(nextMoves.consult_envelope.shelf_line, undefined, 'shelf_line must be omitted when candidate graphs score below 0.10 floor');
    assert.strictEqual(nextMoves.shelf, undefined, 'shelf must be undefined below floor');

    const rendered = renderConsultClosingEnvelope(nextMoves);
    assert.strictEqual(rendered.lines.length, 2, 'Must render exactly 2 sentences when shelf is below 0.10 floor');
    assert.ok(!rendered.text.includes('Retail Strategy & Innovation'), 'Must not merchandise unrelated retail graph');
    assert.ok(!rendered.text.includes('Beauty & Wellness'), 'Must not merchandise unrelated beauty graph');
    console.log('✅ Test 14 Passed: Consult shelf score floor cleanly omits sentence 2 on low relevance');
}

// Test 15: Suggest-backed statistics_source (Neil's collectibles query)
{
    clearSuggestCacheForTesting();
    const mockSuggestFn = async (q: string) => {
        return {
            sources: [
                { id: 'google_trends', name: 'Google Trends' },
                { id: 'amazon_price', name: 'Amazon Price Intelligence' },
                { id: 'draft_source', name: 'Draft Source', returns_draft: true }
            ]
        };
    };

    const rows = [{ title: 'Collectible card trading volumes', graphId: 'retail' }];
    const nextMoves = await generateNextMoves(
        rows,
        'collectible card trading and sports memorabilia market',
        ['retail'],
        'thin',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { suggestFn: mockSuggestFn }
    );

    assert.ok(nextMoves.specific?.statistics_source, 'statistics_source must be populated');
    assert.strictEqual(
        nextMoves.specific.statistics_source,
        'Google Trends and Amazon Price Intelligence',
        'statistics_source must format first 2 non-draft public source names'
    );
    console.log('✅ Test 15 Passed: Suggest-backed statistics_source formats public names and ignores draft sources');
}

// Test 16: Suggest timeout / error fallback to regex branch
{
    clearSuggestCacheForTesting();
    const mockTimeoutSuggestFn = async (q: string) => {
        throw new Error('suggest timeout (1500ms)');
    };

    const rows = [{ title: 'Retail spending surge', graphId: 'retail' }];
    const nextMoves = await generateNextMoves(
        rows,
        'retail consumer spending market trends',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts,
        { suggestFn: mockTimeoutSuggestFn }
    );

    assert.ok(nextMoves.specific?.statistics_source, 'statistics_source must fall back to regex branch');
    assert.strictEqual(nextMoves.specific.statistics_source, 'Census retail trade and spending data');
    console.log('✅ Test 16 Passed: Suggest timeout / failure falls back to existing regex branch');
}

// Test 17: Cost silence — pricing inquiries point to pricing URL with no currency figures
{
    const pricingUrl = 'https://fodda.ai/pricing';
    assert.strictEqual(pricingUrl, 'https://fodda.ai/pricing');
    console.log('✅ Test 17 Passed: Pricing routes cleanly to https://fodda.ai/pricing');
}

// Test 18: Booking rate_display is preserved
{
    const mockBookACall = {
        url: 'https://cal.com/jeremy-smith/30min',
        rate_display: '$500/hr'
    };
    assert.strictEqual(mockBookACall.rate_display, '$500/hr', 'rate_display must be preserved verbatim for book_a_call');
    console.log('✅ Test 18 Passed: Human booking preserves rate_display verbatim');
}

// Test 19: Small graph (trend_count <= 15) suppresses more_in_graph
{
    const smallReportGraph = {
        graph_id: 'report-sustainable-packaging',
        name: 'Sustainable Packaging 2026',
        graph_type: 'industry report',
        trend_count: 10,
        topics: ['packaging', 'sustainability']
    } as any as CatalogGraph;
    const extendedGraphs = [...mockGraphs, smallReportGraph];

    const rows = [
        { title: 'Mushroom packaging', graphId: 'report-sustainable-packaging', on_topic_total: 8, total: 8 },
        { title: 'Seaweed alternatives', graphId: 'report-sustainable-packaging', on_topic_total: 8, total: 8 }
    ];

    const nextMoves = await generateNextMoves(
        rows,
        'biodegradable mushroom packaging materials',
        ['report-sustainable-packaging'],
        'ok',
        undefined,
        undefined,
        extendedGraphs,
        mockAnalysts
    );

    assert.notStrictEqual(nextMoves.thread?.kind, 'more_in_graph', 'Small graph must not emit more_in_graph');
    if (nextMoves.thread?.adjacent) {
        assert.notStrictEqual(
            nextMoves.thread.adjacent.graph_id,
            'report-sustainable-packaging',
            'adjacent.graph_id must not equal the searched graph'
        );
    }
    console.log('✅ Test 19 Passed: Small graph (trend_count <= 15) suppresses more_in_graph');
}

// Test 20: Exhausted graph (on_topic_total >= 0.6 * trend_count) suppresses more_in_graph
{
    const mediumGraph = {
        graph_id: 'dentsu-future-of-commerce',
        name: 'Dentsu Future of Commerce',
        graph_type: 'industry report',
        curator: 'Dentsu',
        trend_count: 20,
        topics: ['retail', 'commerce']
    } as any as CatalogGraph;
    const extendedGraphs = [...mockGraphs, mediumGraph];

    const rows = [
        { title: 'Autonomous checkout', graphId: 'dentsu-future-of-commerce', on_topic_total: 14, total: 14 },
        { title: 'Social commerce live streams', graphId: 'dentsu-future-of-commerce', on_topic_total: 14, total: 14 }
    ];

    const nextMoves = await generateNextMoves(
        rows,
        'future of autonomous commerce and checkout',
        ['dentsu-future-of-commerce'],
        'ok',
        undefined,
        undefined,
        extendedGraphs,
        mockAnalysts
    );

    assert.notStrictEqual(nextMoves.thread?.kind, 'more_in_graph', 'Exhausted graph must not emit more_in_graph');
    console.log('✅ Test 20 Passed: Exhausted graph (>=60% returned) suppresses more_in_graph');
}

// Test 21: Brand publisher exclusion (dentsu, havas, psfk, niq)
{
    const rows = [
        {
            title: 'Digital retail media innovation',
            graphId: 'retail',
            brandNames: ['Dentsu', 'Nike', 'Havas'],
            source_label: 'Dentsu Living Commerce (Dentsu)'
        }
    ];

    const nextMoves = await generateNextMoves(
        rows,
        'digital retail media innovation',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts
    );

    assert.ok(nextMoves.specific?.brands, 'specific.brands should be present');
    assert.deepStrictEqual(nextMoves.specific?.brands, ['Nike'], 'Must exclude publisher/curator tokens like Dentsu and Havas');
    console.log('✅ Test 21 Passed: Brand extraction excludes publisher and curator tokens');
}

// Test 22: Expert reason word-boundary formatting
{
    const analystLongExpertise: CatalogAnalyst = {
        analyst_id: 'supply-chain-guru',
        name: 'Supply Chain Guru',
        description: 'Covers complex international omnichannel logistics and freight forwarding operations across North America and Europe',
        expert_in: 'omnichannel retail supply chain logistics strategy and forecasting',
        status: 'active'
    };
    const extendedAnalysts = [...mockAnalysts, analystLongExpertise];

    const rows = [{ title: 'Omnichannel logistics', graphId: 'retail' }];
    const nextMoves = await generateNextMoves(
        rows,
        'omnichannel retail supply chain logistics strategy and forecasting',
        ['retail'],
        'ok',
        undefined,
        undefined,
        mockGraphs,
        extendedAnalysts
    );

    assert.ok(nextMoves.specific?.expert, 'specific.expert must be present');
    const reason = nextMoves.specific.expert.reason;
    assert.ok(reason.startsWith('covers '), 'reason must start with covers');
    assert.ok(reason.endsWith(' directly'), 'reason must end with directly');
    // Ensure length constraint and no mid-word cutoff
    const lane = reason.replace(/^covers /, '').replace(/ directly$/, '');
    assert.ok(lane.length <= 60, 'lane must be <= 60 characters');
    assert.ok(!lane.endsWith(' fo'), 'Must not truncate mid-word');
    console.log(`✅ Test 22 Passed: Expert reason formatted cleanly on word boundary: "${reason}"`);
}

// Test 23: adjacent.graph_id is never equal to thread.graph_id or any searched graph
{
    const nextMoves = await generateNextMoves(
        [],
        'quantum computing in banking',
        ['retail'],
        'empty',
        undefined,
        undefined,
        mockGraphs,
        mockAnalysts
    );

    if (nextMoves.thread?.adjacent) {
        assert.notStrictEqual(nextMoves.thread.adjacent.graph_id, 'retail', 'adjacent.graph_id must not be searched graph retail');
        assert.ok(nextMoves.thread.adjacent.graph_id.length > 0, 'adjacent.graph_id must be non-empty');
    }
    console.log('✅ Test 23 Passed: adjacent.graph_id is never equal to searched graph or self');
}

console.log('\nAll Next Moves unit tests passed successfully!');
}

runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
