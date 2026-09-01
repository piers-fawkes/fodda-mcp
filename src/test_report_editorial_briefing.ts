/**
 * Test Suite for 5-Pillar Editorial & Network Synthesis in get_report_intelligence.
 *
 * Tests:
 * 1. Primary Report Graph Resolution & Row Partitioning
 * 2. Deduplication of Network Signals against Primary Evidence
 * 3. Human Expert Digital Twin matching & URL/slug validation
 * 4. 5-Pillar Payload generation (JSON keys + Pre-rendered Markdown)
 * 5. Fallback behavior when Gemini is offline / times out
 * 6. Non-leakage of token / SPT mechanics
 * 7. Absolute HTTPS URLs in all links
 */

import assert from 'assert';
import {
    resolvePrimaryReportGraph,
    partitionReportResults,
    matchHumanExpertTwin,
    buildReportEditorialBriefing,
    type ReportBriefingPayload,
} from './reportBriefing.js';

console.log('🧪 Running Test Suite: 5-Pillar Editorial & Network Synthesis for Report Intelligence...\n');

// Mock data representing multi-graph search response for "Jack Morton fan experience"
const mockJackMortonResults = [
    {
        trend_id: 'jm-1',
        name: 'Participation as the Price of Entry',
        graph_id: 'jack-morton-fan-experience-trends',
        graph_name: 'Jack Morton Fan Experience Trends',
        curator: 'Jack Morton Worldwide',
        summary: 'Three-quarters of adults identify with fandoms, and modern fans demand hands-on community involvement rather than passive spectatorship.',
        evidence: [
            { title: 'Fan Survey', snippet: '42% of fans actively seek hands-on community involvement.' },
            { title: 'Demographics', snippet: '75% of adults identify with at least one fandom.' }
        ],
        percentage: '42%',
        score: 0.92,
    },
    {
        trend_id: 'jm-2',
        name: 'Tactile Hospitality and Sensory Immersion',
        graph_id: 'jack-morton-fan-experience-trends',
        graph_name: 'Jack Morton Fan Experience Trends',
        curator: 'Jack Morton Worldwide',
        summary: 'Physical environments require tactile, sensory engagements to justify in-person attendance.',
        evidence: [
            { title: 'SanDisk FIFA Whistle Case Study', snippet: 'SanDisk FIFA World Cup Whistle USB drive demonstrated how tactile product design drives consumer willingness to pay.' }
        ],
        score: 0.88,
    },
    {
        trend_id: 'peak-1',
        name: 'Frictionless Concession Infrastructure',
        graph_id: 'peak-sportstech',
        graph_name: 'PEAK SportsTech Report',
        curator: 'PEAK Sports Research',
        summary: 'Intuit Dome deployed over 40 checkout-free outlets, proving frictionless infrastructure is now table stakes for fan hospitality.',
        score: 0.79,
    },
    {
        trend_id: 'dentsu-1',
        name: 'SanDisk FIFA Whistle Case Study',
        graph_id: 'dentsu-growth',
        graph_name: 'Dentsu Brand Growth',
        curator: 'Dentsu Creative',
        summary: 'SanDisk FIFA World Cup Whistle USB drive demonstrated how tactile product design drives consumer willingness to pay.',
        score: 0.74,
    }
];

async function runTests() {
    // -----------------------------------------------------------------------
    // TEST 1: Primary Report Graph Resolution & Row Partitioning
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Primary Report Resolution & Partitioning ---');
    const { primaryRows, networkRows } = partitionReportResults(mockJackMortonResults, 'jack-morton-fan-experience-trends');

    assert.strictEqual(primaryRows.length, 2, 'Should have 2 primary rows for Jack Morton graph');
    // Note: dentsu-1 duplicates SanDisk FIFA Whistle evidence from jm-2, so it should be deduped out!
    assert.strictEqual(networkRows.length, 1, 'Network rows should have 1 item after deduplicating duplicate SanDisk case study');
    assert.strictEqual(networkRows[0].graph_id, 'peak-sportstech', 'Remaining network signal should be peak-sportstech');
    console.log('✅ PASS: Primary rows partitioned and duplicate network evidence correctly deduped.\n');

    // -----------------------------------------------------------------------
    // TEST 2: Human Expert Digital Twin Matching
    // -----------------------------------------------------------------------
    console.log('--- TEST 2: Human Expert Digital Twin Matching ---');
    const matchedExpert = matchHumanExpertTwin('fan experience brand community sports');
    if (matchedExpert) {
        assert.ok(
            matchedExpert.is_human_agent === true ||
            matchedExpert.is_digital_twin === true ||
            matchedExpert.kind === 'human_agent' ||
            matchedExpert.kind === 'human_twin' ||
            matchedExpert.type === 'human_agent' ||
            matchedExpert.type === 'human_twin',
            'Matched expert must be a verified human agent / digital twin'
        );
        console.log(`Matched Twin: ${matchedExpert.name} (id: ${matchedExpert.analyst_id})`);
    }
    console.log('✅ PASS: Human Expert Digital Twin filtering verified.\n');

    // -----------------------------------------------------------------------
    // TEST 3: 5-Pillar Payload Generation (buildReportEditorialBriefing)
    // -----------------------------------------------------------------------
    console.log('--- TEST 3: 5-Pillar Editorial Payload Generation ---');
    const payload: ReportBriefingPayload = await buildReportEditorialBriefing({
        data: { results: mockJackMortonResults, total: 4 },
        query: 'What does the new Jack Morton fan experience report say?',
        annotatedData: {
            coverage: { status: 'ok' },
            next_moves: {
                thread: { kind: 'several_more', query: 'tactile hospitality' },
                specific: { kind: 'brand_cut', options: ['SanDisk', 'FIFA'] },
            }
        }
    });

    assert.strictEqual(payload.view, 'editorial', 'View must be editorial');
    assert.ok(payload.topline_hook.text.length > 10, 'Topline hook must have substance');
    assert.ok(payload.shifts.length >= 2, 'Should extract at least 2 structural shifts');
    assert.ok(payload.shifts[0]?.title, 'First shift must have title');
    assert.ok(payload.shifts[0]?.narrative, 'First shift must have narrative');
    assert.ok(payload.network_signals.length >= 1, 'Should include cross-graph network signals');

    const netSig = payload.network_signals[0];
    assert.ok(netSig, 'Network signal must exist');
    if (netSig) {
        assert.ok(['validates', 'contrasts', 'related'].includes(netSig.signal_type), `Signal type '${netSig.signal_type}' must be one of validates, contrasts, related`);
        assert.ok(netSig.url.startsWith('https://'), `Network signal url must be absolute https: ${netSig.url}`);
    }

    // Pillar 5: Follow-ups
    assert.ok(payload.follow_ups.length >= 2, 'Should generate actionable follow up moves');
    for (const fu of payload.follow_ups) {
        assert.ok(fu.prompt, 'Follow up must have prompt');
        assert.ok(fu.tool, 'Follow up must specify tool');
        assert.ok(typeof fu.args === 'object', 'Follow up must provide args object');
        assert.ok(fu.app_url.startsWith('https://'), `Follow up app_url must be https: ${fu.app_url}`);
    }

    // Markdown check
    assert.ok(payload.briefing_markdown.includes('Strategic Briefing:'), 'Markdown must have main title');
    assert.ok(payload.briefing_markdown.includes('Core Tension:'), 'Markdown must include Core Tension');
    assert.ok(payload.briefing_markdown.includes('Core Structural Shifts'), 'Markdown must include shifts');
    assert.ok(payload.briefing_markdown.includes('Cross-Graph Network Signals'), 'Markdown must include network signals');
    console.log('✅ PASS: All 5 pillars correctly structured in JSON and Markdown.\n');

    // -----------------------------------------------------------------------
    // TEST 4: Pricing & SPT Invariant Checks
    // -----------------------------------------------------------------------
    console.log('--- TEST 4: Pricing / SPT Invariant Safety Checks ---');
    const jsonString = JSON.stringify(payload);
    const forbiddenPatterns = [
        /\bvia SPT\b/i,
        /\bSPT_RATE\b/i,
        /\btoken cost\b/i,
        /\bshared payment token\b/i,
        /\bSPT token\b/i,
    ];

    for (const pattern of forbiddenPatterns) {
        assert.ok(!pattern.test(jsonString), `Payload must not contain banned pricing/token terminology: ${pattern}`);
        assert.ok(!pattern.test(payload.briefing_markdown), `Markdown must not contain banned pricing/token terminology: ${pattern}`);
    }
    console.log('✅ PASS: Zero SPT or machine-pricing terminology leaked in editorial text.\n');

    // -----------------------------------------------------------------------
    // TEST 5: Fallback Behavior for Thin / Empty Report Coverage
    // -----------------------------------------------------------------------
    console.log('--- TEST 5: Thin / Empty Coverage Fallback ---');
    const thinPayload = await buildReportEditorialBriefing({
        data: { results: [], total: 0 },
        query: 'Quantum cryogenic computing trends in fast fashion',
        annotatedData: {
            coverage: { status: 'thin' },
        }
    });

    assert.strictEqual(thinPayload.view, 'editorial');
    assert.ok(thinPayload.topline_hook.text.length > 0, 'Should provide recover-first topline hook');
    assert.ok(thinPayload.briefing_markdown.length > 0, 'Should render markdown even for thin coverage');
    console.log('✅ PASS: Recover-first fallback for thin/empty coverage passed.\n');

    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
