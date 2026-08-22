import assert from 'node:assert';
import { createSessionTracker } from './sessionTracker.js';
import type { NextMoves } from './coverageRelevance.js';

console.log('--- Running Session Tracker Next Moves Telemetry Tests ---');

const tracker = createSessionTracker();

// Initial state: no prior turns, evaluateNextMoveMatch returns undefined
assert.strictEqual(tracker.evaluateNextMoveMatch('Tell me about Nike', 'search_graph'), undefined);

// Turn 1 recommendation
const nextMovesTurn1: NextMoves = {
    thread: {
        kind: 'more_in_graph',
        graph_id: 'retail',
        graph_display: 'Retail Strategy & Innovation',
        remaining_count: 5,
        theme: 'Autonomous Checkout'
    },
    specific: {
        brands: ['Nike', 'Adidas'],
        statistics_source: 'Census retail trade reports',
        expert: {
            analyst_id: 'ben-dietz-sic',
            display_name: 'Ben Dietz',
            reason: 'cultural strategy and youth marketing'
        }
    },
    scope_prompt: true,
    known_brand: 'Nike',
    presentation: 'internal'
};

tracker.recordNextMoves(nextMovesTurn1, 'retail innovation trends');
assert.deepStrictEqual(tracker.getLastNextMoves(), nextMovesTurn1);

// Test Scope Match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Cut this specifically to Nike', 'search_graph'),
    'scope'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Working on a brief for our brand', 'search_graph'),
    'scope'
);

// Test Specific Brand Match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('What about Adidas in this space?', 'search_graph'),
    'specific_brand'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Look up Nike', 'brand_tracker', { brand_name: 'Nike' }),
    'specific_brand'
);

// Test Specific Expert Match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Can I consult Ben Dietz on this?', 'consult_analyst', { analyst_id: 'ben-dietz-sic' }),
    'specific_expert'
);

// Test Specific Stat Match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Search statistics for retail spending', 'search_statistics', { graph_id: 'retail' }),
    'specific_stat'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Get census retail trade reports data', 'get_supplemental_context'),
    'specific_stat'
);

// Test Thread Match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Pull the remaining signals on Autonomous Checkout', 'search_graph', { graphId: 'retail' }),
    'thread'
);

// Test None Match (unrelated query)
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Tell me the weather in Seattle', 'search_graph'),
    'none'
);

// Test that stat query returns none when statistics_source was NOT in recommendations
const nextMovesNoStats: NextMoves = {
    scope_prompt: true,
    presentation: 'internal'
};
tracker.recordNextMoves(nextMovesNoStats, 'some query');
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Search statistics for retail', 'search_statistics', { graph_id: 'retail' }),
    'none',
    'Should not classify as specific_stat if statistics_source was never offered'
);

// ── Consult-Specific Next Moves Telemetry Tests (Render Spec 1.3) ──
const consultNextMoves: NextMoves = {
    scope_prompt: true,
    presentation: 'internal',
    thread: {
        kind: 'expert_thread',
        graph_id: 'ben-dietz-sic',
        graph_display: 'Ben Dietz',
        next_angle: 'We can explore creator-led retail formats next.',
        uncited_themes: ['Discord Communities'],
        text: 'We can explore creator-led retail formats next.'
    },
    shelf: [
        { graph_id: 'retail', graph_display: 'Retail Strategy & Innovation', reason: 'Retail operations' },
        { graph_id: 'fashion', graph_display: 'Fashion & Luxury Systems', reason: 'Luxury circularity' }
    ],
    specific: {
        expert: {
            analyst_id: 'retail-lead',
            display_name: 'Retail Strategy Lead',
            reason: 'omnichannel retail'
        },
        shelf_graphs: [
            { graph_id: 'retail', graph_display: 'Retail Strategy & Innovation', reason: 'Retail operations' }
        ]
    },
    consult_envelope: {
        thread_line: 'We can explore creator-led retail formats next.',
        shelf_line: 'You can also explore related research in Retail Strategy & Innovation and Fashion & Luxury Systems.',
        scope_line: 'To turn this into an executive brief or project deliverable, ask me to scope a deliverable.'
    }
};

tracker.recordNextMoves(consultNextMoves, 'cultural commerce');

// 1. Thread match: continuing with current expert
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Tell me more about creator-led retail formats', 'consult_human_agent', { analyst_id: 'ben-dietz-sic' }),
    'thread',
    'Follow-up with same expert should match thread'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Let us look into Discord Communities', 'consult_analyst', { analyst_id: 'ben-dietz-sic' }),
    'thread',
    'Follow-up on uncited theme with same expert should match thread'
);

// 2. Shelf graph match: exploring shelf graphs recommended in sentence 2
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Show me retail operations research', 'search_graph', { graphId: 'retail' }),
    'specific_brand',
    'Exploring shelf graph should match specific_brand per telemetry spec'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Explore Fashion & Luxury Systems', 'get_domain_intelligence', { query: 'fashion luxury systems' }),
    'specific_brand',
    'Exploring shelf graph by name should match specific_brand'
);

// 3. Alternate expert referral match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('I want to consult Retail Strategy Lead', 'consult_analyst', { analyst_id: 'retail-lead' }),
    'specific_expert',
    'Consulting referred expert should match specific_expert'
);

// 4. Scope deliverable match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('Scope a deliverable on creator commerce', 'request_deliverable', { analyst_id: 'ben-dietz-sic', offering_key: 'brief' }),
    'scope',
    'Scoping deliverable should match scope'
);
assert.strictEqual(
    tracker.evaluateNextMoveMatch('To turn this into an executive brief, please scope a project deliverable', 'consult_human_agent', { analyst_id: 'ben-dietz-sic' }),
    'scope',
    'Scoping text prompt should match scope'
);

// 5. None match
assert.strictEqual(
    tracker.evaluateNextMoveMatch('How is the weather in Tokyo?', 'search_graph'),
    'none',
    'Unrelated topic should match none'
);

console.log('✅ All Session Tracker Next Moves Telemetry tests passed successfully!');
