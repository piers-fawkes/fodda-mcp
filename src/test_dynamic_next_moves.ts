import assert from 'node:assert';
import { generateConsultNextMoves, generateNextMoves, cleanPromptTopic } from './coverageRelevance.js';
import { setCachedCatalogForTesting, type CatalogGraph, type CatalogAnalyst } from './catalogCache.js';

console.log('=== Running Dynamic Next Moves Rotation & Guidance Tests ===');

const mockGraphs: any[] = [
    {
        graph_id: 'retail',
        name: 'Retail Strategy & Innovation',
        graph_type: 'domain',
        status: 'live',
        topics: ['retail', 'commerce'],
        trend_count: 150,
        evidence_count: 600,
    },
    {
        graph_id: 'ben-dietz-sic',
        name: '[SIC] Weekly — Cultural Strategy',
        graph_type: 'expert',
        status: 'live',
        topics: ['culture', 'marketing'],
        trend_count: 80,
        evidence_count: 300,
    },
    {
        graph_id: 'luxury-goods',
        name: 'Luxury Goods & Heritage',
        graph_type: 'report',
        status: 'live',
        topics: ['luxury', 'fashion'],
        trend_count: 90,
        evidence_count: 400,
    },
];

const mockAnalysts: any[] = [
    {
        analyst_id: 'ben-dietz-sic',
        name: 'Ben Dietz',
        status: 'Active',
        category: 'human_agent',
        topics: ['culture', 'marketing', 'trends'],
        description: 'Cultural strategy and youth marketing',
        book_a_call: {
            url: 'https://cal.com/ben-dietz/strategy',
            rate_display: '$500 / 45 min',
        },
    },
    {
        analyst_id: 'retail-analyst',
        name: 'Retail Analyst',
        status: 'Active',
        category: 'synthetic_agent',
        topics: ['retail', 'omnichannel'],
        description: 'Omnichannel retail analysis',
        offerings: [
            { offering_key: 'retail_brief', display_name: 'Retail Executive Brief' }
        ],
    },
    {
        analyst_id: 'thorstein-veblen',
        name: 'Thorstein Veblen',
        status: 'Active',
        category: 'classic_agent',
        topics: ['conspicuous consumption', 'leisure class', 'status signaling'],
        description: 'Sociological theory of status and consumption',
    },
    {
        analyst_id: 'plain-analyst',
        name: 'Data Analyst',
        status: 'Active',
        category: 'synthetic_agent',
        topics: ['logistics', 'supply chain'],
        description: 'Supply chain analysis',
    },
];

setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphs.length, graphs: mockGraphs as any },
    mockAnalysts as any
);

// ── Test 1: Turn 1 open query yields Move 2 = "Scope to your brand or brief" ──
{
    const result = {
        coverage: 'ok',
        report: 'Cultural strategy findings.',
        expert_thread: {
            next_angle: 'We can explore streetwear drop cadence next.',
            on_topic_total: 5,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'cultural shifts in youth fashion',
        'ben-dietz-sic',
        {},
        mockGraphs,
        mockAnalysts
    );

    assert.strictEqual(nextMoves.presentation, 'user_facing');
    assert.strictEqual(nextMoves.heading, 'Next moves');
    assert.ok(Array.isArray(nextMoves.moves) && nextMoves.moves.length === 3, 'Must contain exactly 3 moves');

    const move2 = nextMoves.moves![1]!;
    assert.strictEqual(move2.id, 'scope_brand', 'Turn 1 open query must offer brand scoping');
    assert.strictEqual(move2.label, 'Scope to your brand or brief');
    assert.strictEqual(nextMoves.consult_envelope?.scope_line, "If you tell me the brand or brief you're working on, I'll cut this to that.");

    console.log('✅ Test 1 Passed: Turn 1 open query yields scope_brand');
}

// ── Test 2: Follow-up turn (sessionId present) suppresses brand scoping ──
{
    const result = {
        coverage: 'ok',
        report: 'Deep dive into streetwear drop mechanics.',
        expert_thread: {
            next_angle: 'We can examine regional differences across Asia-Pacific next.',
            on_topic_total: 4,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'what about resale platforms and secondary market dynamics?',
        'ben-dietz-sic',
        { sessionId: 'sess-abc-123' },
        mockGraphs,
        mockAnalysts
    );

    assert.ok(Array.isArray(nextMoves.moves) && nextMoves.moves.length === 3);
    const move2 = nextMoves.moves![1]!;
    assert.notStrictEqual(move2.id, 'scope_brand', 'Follow-up turn MUST NOT repeat brand scoping');
    assert.ok(
        move2.id === 'counter_signals' || move2.id === 'cross_category',
        `Follow-up turn must rotate to counter-signals or cross-category, got: ${move2.id}`
    );
    assert.ok(
        !nextMoves.consult_envelope?.scope_line?.includes('tell me the brand'),
        `Scope line must not prompt for brand on follow-up, got: ${nextMoves.consult_envelope?.scope_line}`
    );

    console.log(`✅ Test 2 Passed: Follow-up turn suppresses brand scoping (Move 2: ${move2.id})`);
}

// ── Test 3: Known brand yields competitor compare ──
{
    const result = {
        coverage: 'ok',
        report: 'Nike cultural positioning analysis.',
        expert_thread: {
            next_angle: 'We can explore Nike co-creation formats next.',
            on_topic_total: 5,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'Nike brand relevance in running communities',
        'ben-dietz-sic',
        { knownBrand: 'Nike' },
        mockGraphs,
        mockAnalysts
    );

    assert.ok(Array.isArray(nextMoves.moves) && nextMoves.moves.length === 3);
    const move2 = nextMoves.moves![1]!;
    assert.strictEqual(move2.id, 'competitor_compare', 'Known brand must rotate Move 2 to competitor compare');
    assert.strictEqual(move2.label, 'Compare key competitor responses');
    assert.ok(move2.prompt.includes('Nike'), 'Prompt must reference the known brand');
    assert.strictEqual(nextMoves.consult_envelope?.scope_line, 'Want this cut to Nike specifically?');

    console.log('✅ Test 3 Passed: Known brand rotates Move 2 to competitor_compare');
}

// ── Test 4: Classic/historical thinker suppresses brand scoping for modern application ──
{
    const result = {
        coverage: 'ok',
        report: 'Theory of the leisure class and pecuniary emulation.',
        expert_thread: {
            next_angle: 'We can examine vicarious consumption next.',
            on_topic_total: 3,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'conspicuous consumption in digital luxury goods',
        'thorstein-veblen',
        {},
        mockGraphs,
        mockAnalysts
    );

    assert.ok(Array.isArray(nextMoves.moves) && nextMoves.moves.length === 3);
    const move2 = nextMoves.moves![1]!;
    assert.strictEqual(move2.id, 'modern_application', 'Classic agent must rotate Move 2 to modern application');
    assert.strictEqual(move2.label, 'Apply to modern culture & commerce');
    assert.ok(
        !nextMoves.consult_envelope?.scope_line?.includes('tell me the brand'),
        'Classic agent must not ask for client brand or brief'
    );

    console.log('✅ Test 4 Passed: Classic agent rotates Move 2 to modern_application');
}

// ── Test 5: Move 3 Priority 1 — Book a call ──
{
    const resultWithCall = {
        coverage: 'ok',
        report: 'Expert analysis.',
        book_a_call: {
            url: 'https://cal.com/ben-dietz/strategy',
            rate_display: '$500 / 45 min',
        },
        expert_thread: {
            next_angle: 'Next angle.',
            on_topic_total: 2,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        resultWithCall,
        'cultural strategy',
        'ben-dietz-sic',
        {},
        mockGraphs,
        mockAnalysts
    );

    const move3 = nextMoves.moves![2]!;
    assert.strictEqual(move3.id, 'book_call', 'Must prioritize book_call when booking URL exists');
    assert.ok(move3.label.includes('Book strategy call'), 'Label must mention booking strategy call');
    assert.strictEqual(move3.link, 'https://cal.com/ben-dietz/strategy');

    console.log('✅ Test 5 Passed: Move 3 prioritizes book_call when available');
}

// ── Test 6: Move 3 Priority 2 — Commission deliverable (when no call URL, but offerings exist) ──
{
    const result = {
        coverage: 'ok',
        report: 'Retail store operations.',
        expert_thread: {
            next_angle: 'Next angle.',
            on_topic_total: 2,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'retail store operations and checkout automation',
        'retail-analyst',
        {},
        mockGraphs,
        mockAnalysts
    );

    const move3 = nextMoves.moves![2]!;
    assert.strictEqual(move3.id, 'commission_deliverable', 'Must prioritize commission_deliverable when analyst has offerings');
    assert.strictEqual(move3.tool, 'request_deliverable');

    console.log('✅ Test 6 Passed: Move 3 falls back to commission_deliverable');
}

// ── Test 7: Move 3 Priority 3 — Pressure-test perspective (no call, no offerings) ──
{
    const result = {
        coverage: 'ok',
        report: 'Supply chain logistics.',
        expert_thread: {
            next_angle: 'Next angle.',
            on_topic_total: 2,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        'supply chain resilience and freight rates',
        'plain-analyst',
        {},
        mockGraphs,
        mockAnalysts
    );

    const move3 = nextMoves.moves![2]!;
    assert.strictEqual(move3.id, 'pressure_test', 'Must fall back to pressure_test when no call or offerings');
    assert.strictEqual(move3.tool, 'verify_market_claim');

    console.log('✅ Test 7 Passed: Move 3 falls back to pressure_test');
}

// ── Test 8: Prompt Hygiene — Clean, concise prompts under 25 words ──
{
    const longQuery = 'Can you provide a deeply comprehensive analysis of how emerging luxury hospitality trends and high-end residential amenities will shape affluent consumer spending behaviors across North America over the next five years?';
    const cleaned = cleanPromptTopic(longQuery);
    const wordCount = cleaned.split(/\s+/).length;
    assert.ok(wordCount <= 8, `cleanPromptTopic must truncate to <= 8 words, got ${wordCount}: "${cleaned}"`);

    const result = {
        coverage: 'ok',
        report: 'Analysis.',
        expert_thread: {
            next_angle: 'We can explore private member clubs next.',
            on_topic_total: 5,
            cited_count: 1,
        }
    };

    const nextMoves = generateConsultNextMoves(
        result,
        longQuery,
        'ben-dietz-sic',
        {},
        mockGraphs,
        mockAnalysts
    );

    for (const move of nextMoves.moves!) {
        const moveWordCount = move.prompt.split(/\s+/).length;
        assert.ok(
            moveWordCount <= 25,
            `Prompt for ${move.id} must be <= 25 words, got ${moveWordCount}: "${move.prompt}"`
        );
    }

    console.log('✅ Test 8 Passed: Prompt hygiene maintains <= 25 words without repeating raw queries');
}

console.log('\nAll Dynamic Next Moves Rotation & Guidance tests passed successfully!');
