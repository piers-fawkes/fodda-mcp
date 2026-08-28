/**
 * Verification for data-gap Slack alerts (v1.42.0).
 *
 * postGapToSlack fires a #fodda-research alert when coverage is thin/empty,
 * deduped per query topic per session. Runs without SLACK_BOT_TOKEN — the
 * poster logs a skip instead of hitting the network, so this exercises the
 * gating/dedupe/message logic only.
 *
 * Run: npx tsx src/test_gap_alert.ts
 */

import { createSessionTracker, buildGapAlertText } from './sessionTracker.js';

delete process.env.SLACK_BOT_TOKEN; // ensure no live post from a local .env

let failures = 0;
function check(label: string, actual: any, expected: any) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

const thinCoverage = { status: 'thin', results_returned: 10, results_on_topic: 2, layers_searched: ['domain', 'expert', 'report'] };
const okCoverage = { status: 'ok', results_returned: 10, results_on_topic: 8, layers_searched: ['domain'] };
const emptyCoverage = { status: 'empty', results_returned: 0, layers_searched: ['expert'] };

// ── Message composition ──
const text = buildGapAlertText('piers.fawkes@psfk.com', 'search_graph', 'Chinese automotive trends EV brands China car market', thinCoverage);
check('text: identifies user', text.includes('piers.fawkes@psfk.com'), true);
check('text: identifies tool', text.includes('search_graph'), true);
check('text: quotes query', text.includes('"Chinese automotive trends EV brands China car market"'), true);
check('text: on-topic share', text.includes('thin — 2 of 10 results on-topic'), true);
check('text: layers', text.includes('domain, expert, report'), true);
check('text: empty variant', buildGapAlertText('u', 't', 'q', emptyCoverage).includes('empty — 0 results'), true);

// ── Zero retention message composition ──
const zeroText = buildGapAlertText('piers.fawkes@psfk.com', 'search_graph', 'Secret Project XYZ Query', thinCoverage, true);
check('zero text: redacts query', zeroText.includes('[zero-retention contract]'), true);
check('zero text: does not include raw query', zeroText.includes('Secret Project XYZ Query'), false);

// ── Gating and dedupe ──
const tracker = createSessionTracker();
check('ok coverage: no alert', tracker.postGapToSlack('u', 'search_graph', 'chinese ev market', okCoverage), false);
check('undefined coverage: no alert', tracker.postGapToSlack('u', 'search_graph', 'chinese ev market', undefined), false);
check('thin coverage: alert fires', tracker.postGapToSlack('u', 'search_graph', 'chinese ev market', thinCoverage), true);
check('same query again: deduped', tracker.postGapToSlack('u', 'search_graph', 'chinese ev market', thinCoverage), false);
check('same query, different tool: still deduped', tracker.postGapToSlack('u', 'search_insights', 'chinese ev market', thinCoverage), false);
check('whitespace/case variant: deduped', tracker.postGapToSlack('u', 'search_graph', '  Chinese  EV  Market ', thinCoverage), false);
check('new query: fires', tracker.postGapToSlack('u', 'search_graph', 'peruvian surf tourism', emptyCoverage), true);
check('new session: fires again', createSessionTracker().postGapToSlack('u', 'search_graph', 'chinese ev market', thinCoverage), true);

// ── Zero retention session tracker ──
const zeroTracker = createSessionTracker({ zeroQueryRetention: true });
check('zero tracker isZeroQueryRetention', zeroTracker.isZeroQueryRetention(), true);
check('zero tracker fires alert', zeroTracker.postGapToSlack('u', 'search_graph', 'confidential query', thinCoverage), true);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
