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

console.log('✅ All Session Tracker Next Moves Telemetry tests passed successfully!');
