/**
 * Test suite for Zero Retention Alert Suppression and Query Privacy.
 *
 * Verifies:
 * 1. buildGapAlertText redacts raw query to '[zero-retention contract]' when zeroQueryRetention is true.
 * 2. buildFrustrationAlertText redacts queries to '[zero-retention contract]' when zeroQueryRetention is true.
 * 3. Standard unflagged accounts continue to emit original query strings.
 * 4. createSessionTracker tracks and updates zeroQueryRetention state correctly.
 * 5. get_my_account status mapping logic surfaces queryRetention correctly.
 *
 * Run: node dist/test_zero_retention_alerts.js
 */

import {
    createSessionTracker,
    buildGapAlertText,
    buildFrustrationAlertText,
} from './sessionTracker.js';
import type { FrustrationDetails } from './sessionTracker.js';

delete process.env.SLACK_BOT_TOKEN; // prevent accidental live posts

let failures = 0;
function check(label: string, actual: any, expected: any) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

console.log('--- TEST: Data Gap Alert Suppression ---');
const thinCoverage = { status: 'thin', results_returned: 5, results_on_topic: 1, layers_searched: ['retail', 'technology'] };

// Standard account data gap
const standardGapText = buildGapAlertText('user@enterprise.com', 'search_graph', 'Internal M&A Strategy 2026', thinCoverage, false);
check('Standard gap alert includes raw query', standardGapText.includes('"Internal M&A Strategy 2026"'), true);
check('Standard gap alert does not have redacted placeholder', standardGapText.includes('[zero-retention contract]'), false);

// Zero retention account data gap
const zeroGapText = buildGapAlertText('user@enterprise.com', 'search_graph', 'Internal M&A Strategy 2026', thinCoverage, true);
check('Zero retention gap alert has redacted placeholder', zeroGapText.includes('🔎 Query: [zero-retention contract]'), true);
check('Zero retention gap alert omits raw query text', zeroGapText.includes('Internal M&A Strategy 2026'), false);
check('Zero retention gap alert preserves coverage metrics', zeroGapText.includes('thin — 1 of 5 results on-topic'), true);
check('Zero retention gap alert preserves searched layers', zeroGapText.includes('retail, technology'), true);

console.log('\n--- TEST: Frustration Alert Suppression ---');
const frustrationDetails: FrustrationDetails = {
    pattern: 'LOW_YIELD',
    graphsTried: ['retail', 'finance'],
    recentQueries: ['secret initiative project titan', 'titan roadmap Q3'],
    score: 2,
};

// Standard frustration alert
const standardFrustrationText = buildFrustrationAlertText('user@enterprise.com', frustrationDetails, false);
check('Standard frustration alert includes queries', standardFrustrationText.includes('secret initiative project titan, titan roadmap Q3'), true);
check('Standard frustration alert does not have redacted placeholder', standardFrustrationText.includes('[zero-retention contract]'), false);

// Zero retention frustration alert
const zeroFrustrationText = buildFrustrationAlertText('user@enterprise.com', frustrationDetails, true);
check('Zero retention frustration alert has redacted placeholder', zeroFrustrationText.includes('🔎 Queries: [zero-retention contract]'), true);
check('Zero retention frustration alert omits raw queries', zeroFrustrationText.includes('secret initiative project titan'), false);
check('Zero retention frustration alert preserves pattern', zeroFrustrationText.includes('🔍 Pattern: LOW_YIELD'), true);
check('Zero retention frustration alert preserves graphs tried', zeroFrustrationText.includes('📊 Graphs tried: retail, finance'), true);
check('Zero retention frustration alert preserves score', zeroFrustrationText.includes('📈 Frustration score: 2/3'), true);

console.log('\n--- TEST: SessionTracker State Management ---');
const defaultTracker = createSessionTracker();
check('Default tracker zeroQueryRetention is false', defaultTracker.isZeroQueryRetention(), false);

const flaggedTracker = createSessionTracker({ zeroQueryRetention: true });
check('Flagged tracker zeroQueryRetention is true', flaggedTracker.isZeroQueryRetention(), true);

defaultTracker.setZeroQueryRetention(true);
check('Dynamically updated tracker zeroQueryRetention is true', defaultTracker.isZeroQueryRetention(), true);

console.log('\n--- TEST: get_my_account queryRetention Resolution ---');
function resolveQueryRetention(account: any): string {
    const isZero = Boolean(
        account?.zero_query_retention ||
        account?.zeroQueryRetention ||
        account?.query_retention === 'zero (contract)' ||
        (typeof account?.query_retention === 'string' && account.query_retention.startsWith('zero')) ||
        account?.queryRetention === 'zero (contract)' ||
        (typeof account?.queryRetention === 'string' && account.queryRetention.startsWith('zero'))
    );
    return account?.query_retention || (isZero ? 'zero (contract)' : 'standard');
}

check('Standard account without flags resolves to standard', resolveQueryRetention({ plan: 'Pro' }), 'standard');
check('Explicit query_retention: "standard" resolves to standard', resolveQueryRetention({ query_retention: 'standard' }), 'standard');
check('Account with zero_query_retention: true resolves to zero (contract)', resolveQueryRetention({ zero_query_retention: true }), 'zero (contract)');
check('Account with zeroQueryRetention: true resolves to zero (contract)', resolveQueryRetention({ zeroQueryRetention: true }), 'zero (contract)');
check('Account with query_retention: "zero (contract)" resolves to zero (contract)', resolveQueryRetention({ query_retention: 'zero (contract)' }), 'zero (contract)');

console.log(failures === 0 ? '\nALL ZERO RETENTION TESTS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
