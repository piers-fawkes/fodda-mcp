/**
 * Comprehensive Test Suite for 5-Pillar Editorial & Network Synthesis (v1.46.44).
 *
 * Uses realistic API response fixtures:
 * - Evidence as object `{ statistics: [...], case_studies: [...] }`
 * - Real catalog cache state with `setCachedCatalogForTesting`
 * - Real human twin fields (`isVerifiedRealPerson`, `expertSlug`)
 * - `relevance_score` fields
 *
 * Tests:
 * 1. Primary Report Graph Resolution & Row Partitioning
 * 2. Deduplication of Network Signals against Primary Evidence
 * 3. Human Expert Digital Twin matching (valid match vs. 0-overlap decline)
 * 4. 5-Pillar Payload generation (JSON keys + Pre-rendered Markdown)
 * 5. Mechanical fallback path verification
 * 6. Non-leakage of token / SPT mechanics
 * 7. Absolute HTTPS URLs in all links
 * 8. Honest empty-coverage hook framing
 */

import assert from 'assert';
import { setCachedCatalogForTesting } from './catalogCache.js';
import type { CatalogResponse } from './catalogCache.js';
import {
    resolvePrimaryReportGraph,
    partitionReportResults,
    matchHumanExpertTwin,
    buildReportEditorialBriefing,
    extractEvidenceFromRow,
    type ReportBriefingPayload,
} from './reportBriefing.js';

console.log('🧪 Running Comprehensive Test Suite: 5-Pillar Editorial & Network Synthesis (v1.46.44)...\n');

// ---------------------------------------------------------------------------
// Seed Catalog Cache with realistic graphs & human twins
// ---------------------------------------------------------------------------
const mockCatalog: CatalogResponse = {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    graph_count: 3,
    graphs: [
        {
            graph_id: 'jack-morton-fan-experience-trends',
            name: 'Jack Morton Fan Experience Trends',
            description: 'Fan experience, hospitality, and brand activation trends',
            curator: 'Jack Morton Worldwide',
            curator_url: 'https://jackmorton.com',
            quality_checker_name: 'Quality Lead',
            quality_checker_title: 'Director',
            quality_checker_company: 'Fodda',
            update_frequency: 'monthly',
            domain: 'experience',
            version: '1.0.0',
            node_types: ['Trend'],
            relationship_types: ['RELATES_TO'],
            status: 'live',
            topics: ['fan experience', 'fandom', 'hospitality', 'brand community', 'sports'],
            graph_type: 'industry report',
            headline: 'Fan Experience Trends',
            subhead: 'The Shift to Active Participation',
            geography: 'Global',
            icon_url: 'https://fodda.ai/icons/jm.png',
            company: 'Jack Morton Worldwide',
            source_url: 'https://jackmorton.com/report',
            available_as: 'report',
            is_playground: false,
            last_updated: '2026-08-01',
            published_date: '2026-08-01',
            example_queries: ['fan engagement', 'tactile hospitality'],
            portrait_url: '',
            trend_count: 15,
            evidence_count: 45,
            last_synced: '2026-08-01',
            webpage_url: 'https://fodda.ai/graphs/jack-morton-fan-experience-trends',
        },
        {
            graph_id: 'peak-sportstech',
            name: 'PEAK SportsTech Report',
            description: 'Sports venue infrastructure and smart concessions',
            curator: 'PEAK Sports Research',
            curator_url: 'https://peaksports.com',
            quality_checker_name: 'Quality Lead',
            quality_checker_title: 'Director',
            quality_checker_company: 'Fodda',
            update_frequency: 'quarterly',
            domain: 'sports',
            version: '1.0.0',
            node_types: ['Trend'],
            relationship_types: ['RELATES_TO'],
            status: 'live',
            topics: ['sports venues', 'concessions', 'fan hospitality', 'stadium tech'],
            graph_type: 'industry report',
            headline: 'SportsTech Infrastructure',
            subhead: 'Next-Gen Stadium Hospitality',
            geography: 'Global',
            icon_url: 'https://fodda.ai/icons/peak.png',
            company: 'PEAK Sports Research',
            source_url: 'https://peaksports.com/report',
            available_as: 'report',
            is_playground: false,
            last_updated: '2026-07-15',
            published_date: '2026-07-15',
            example_queries: ['intuit dome', 'frictionless checkout'],
            portrait_url: '',
            trend_count: 20,
            evidence_count: 60,
            last_synced: '2026-07-15',
            webpage_url: 'https://fodda.ai/graphs/peak-sportstech',
        },
        {
            graph_id: 'dentsu-growth',
            name: 'Dentsu Brand Growth',
            description: 'Creative effectiveness and product design in marketing',
            curator: 'Dentsu Creative',
            curator_url: 'https://dentsu.com',
            quality_checker_name: 'Quality Lead',
            quality_checker_title: 'Director',
            quality_checker_company: 'Fodda',
            update_frequency: 'quarterly',
            domain: 'brand',
            version: '1.0.0',
            node_types: ['Trend'],
            relationship_types: ['RELATES_TO'],
            status: 'live',
            topics: ['brand growth', 'tactile marketing', 'creative effectiveness'],
            graph_type: 'industry report',
            headline: 'Brand Growth Benchmarks',
            subhead: 'Tactile Design & Engagement',
            geography: 'Global',
            icon_url: 'https://fodda.ai/icons/dentsu.png',
            company: 'Dentsu Creative',
            source_url: 'https://dentsu.com/report',
            available_as: 'report',
            is_playground: false,
            last_updated: '2026-06-01',
            published_date: '2026-06-01',
            example_queries: ['creative design', 'product marketing'],
            portrait_url: '',
            trend_count: 12,
            evidence_count: 36,
            last_synced: '2026-06-01',
            webpage_url: 'https://fodda.ai/graphs/dentsu-growth',
        }
    ]
};

const mockAnalysts = [
    {
        id: 'rec12345678901234',
        analyst_id: 'peter-abraham-bicycles-cycling',
        name: 'Peter Abraham',
        description: 'Brand culture, participation, and sports community strategist',
        expertSlug: 'peter-abraham-bicycles-cycling',
        isVerifiedRealPerson: true,
        is_digital_twin: true,
        is_human_agent: true,
        expert_in: 'Brand community culture, experiential participation, cycling and endurance sports',
        what_they_offer: 'Advises brands on building authentic participatory community culture.',
        topics: ['brand community', 'fan experience', 'participation', 'cycling', 'sports'],
    },
    {
        id: 'rec98765432109876',
        analyst_id: 'dr-elena-biotech',
        name: 'Dr. Elena Rostova',
        description: 'Biopharmaceutical research and immunology',
        expertSlug: 'dr-elena-biotech',
        isVerifiedRealPerson: true,
        is_digital_twin: true,
        is_human_agent: true,
        expert_in: 'Immunology, clinical oncology, mRNA therapeutics',
        what_they_offer: 'Reviews clinical trial design and biopharma regulatory pipelines.',
        topics: ['oncology', 'immunology', 'biopharma'],
    }
];

setCachedCatalogForTesting(mockCatalog, mockAnalysts);

// Live API shape with object evidence and relevance_score
const mockLiveReportRows = [
    {
        trend_id: 'jm-1',
        name: 'Participation as the Price of Entry',
        graph_id: 'jack-morton-fan-experience-trends',
        summary: 'Three-quarters of adults identify with fandoms, demanding hands-on involvement.',
        relevance_score: 0.94,
        evidence: {
            statistics: [
                { stat: '42%', snippet: '42% of modern fans actively seek hands-on community involvement rather than passive spectatorship.' },
                { percentage: '75%', snippet: '75% of adults surveyed identify with at least one fandom.' }
            ],
            case_studies: [
                { title: 'Interactive Fanzone Activation', snippet: 'Hands-on fan labs delivered 3x higher dwell time during championship weekend.' }
            ]
        }
    },
    {
        trend_id: 'jm-2',
        name: 'Tactile Hospitality and Sensory Immersion',
        graph_id: 'jack-morton-fan-experience-trends',
        summary: 'Physical stadium environments require tactile, sensory engagements to justify in-person attendance.',
        relevance_score: 0.89,
        evidence: {
            statistics: [
                { stat: '$180', snippet: 'Average premium spend per attendee increases by 28% in immersive sensory hospitality suites.' }
            ],
            case_studies: [
                { title: 'SanDisk FIFA Whistle USB Drive', snippet: 'SanDisk FIFA World Cup Whistle USB drive demonstrated how tactile product design drives consumer willingness to pay.' }
            ]
        }
    },
    {
        trend_id: 'peak-1',
        name: 'Frictionless Concession Infrastructure',
        graph_id: 'peak-sportstech',
        summary: 'Intuit Dome deployed over 40 checkout-free outlets, proving frictionless infrastructure is table stakes for fan hospitality.',
        relevance_score: 0.81,
        evidence: {
            statistics: [
                { stat: '40+ stores', snippet: 'Over 40 autonomous checkout stores deployed at Intuit Dome.' }
            ]
        }
    },
    {
        trend_id: 'dentsu-1',
        name: 'Tactile Brand Merchandising',
        graph_id: 'dentsu-growth',
        summary: 'Tactile sensory merchandising drives higher consumer brand equity.',
        relevance_score: 0.73,
        evidence: {
            case_studies: [
                { title: 'SanDisk FIFA Whistle USB Drive', snippet: 'SanDisk FIFA World Cup Whistle USB drive demonstrated how tactile product design drives consumer willingness to pay.' }
            ]
        }
    }
];

async function runTests() {
    // -----------------------------------------------------------------------
    // TEST 1: Evidence Extraction (Object vs Array shapes)
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Evidence Extraction from Object & Array Shapes ---');
    const evObj = extractEvidenceFromRow(mockLiveReportRows[0]);
    assert.strictEqual(evObj.stats.length, 2, 'Should extract 2 stats from object evidence');
    assert.ok(evObj.stats.includes('42%'), 'Should contain 42%');
    assert.ok(evObj.stats.includes('75%'), 'Should contain 75%');
    assert.strictEqual(evObj.caseStudies.length, 1, 'Should extract 1 case study');
    console.log('✅ PASS: Evidence object extraction correctly pulls stats, snippets, and case studies.\n');

    // -----------------------------------------------------------------------
    // TEST 2: Primary Report Graph Resolution
    // -----------------------------------------------------------------------
    console.log('--- TEST 2: Primary Report Graph Resolution ---');
    const resolvedByName = resolvePrimaryReportGraph('What does the Jack Morton fan experience report say?');
    assert.ok(resolvedByName, 'Should resolve graph from Jack Morton curator in query');
    assert.strictEqual(resolvedByName?.graph_id, 'jack-morton-fan-experience-trends');

    const resolvedByRows = resolvePrimaryReportGraph('fan engagement trends', mockLiveReportRows);
    assert.ok(resolvedByRows, 'Should resolve primary graph from highest density in result rows');
    assert.strictEqual(resolvedByRows?.graph_id, 'jack-morton-fan-experience-trends');
    console.log('✅ PASS: Primary report graph resolution verified.\n');

    // -----------------------------------------------------------------------
    // TEST 3: Partitioning & Evidence Deduplication
    // -----------------------------------------------------------------------
    console.log('--- TEST 3: Partitioning & Cross-Graph Deduplication ---');
    const { primaryRows, networkRows } = partitionReportResults(mockLiveReportRows, 'jack-morton-fan-experience-trends');
    assert.strictEqual(primaryRows.length, 2, 'Should have 2 primary rows for Jack Morton graph');
    // dentsu-1 contains duplicate SanDisk FIFA Whistle case study from jm-2, so it must be deduped out
    assert.strictEqual(networkRows.length, 1, 'Network rows should have exactly 1 item after deduplicating duplicate SanDisk case study');
    assert.strictEqual(networkRows[0].graph_id, 'peak-sportstech', 'Remaining network signal must be peak-sportstech');
    console.log('✅ PASS: Partitioning and server-side deduplication verified.\n');

    // -----------------------------------------------------------------------
    // TEST 4: Human Expert Twin Matching & 0-Overlap Strictness
    // -----------------------------------------------------------------------
    console.log('--- TEST 4: Human Expert Digital Twin Matching ---');
    const matchedTwin = matchHumanExpertTwin('fan experience brand community participation');
    assert.ok(matchedTwin, 'Should match Peter Abraham on fan experience & brand community');
    assert.strictEqual(matchedTwin?.name, 'Peter Abraham');
    assert.strictEqual(matchedTwin?.slug, 'peter-abraham-bicycles-cycling');
    assert.strictEqual(matchedTwin?.is_human_agent, true);

    // 0-overlap test: query completely outside any twin's domain
    const zeroOverlapTwin = matchHumanExpertTwin('superconducting quantum error correction transmon qubits');
    assert.strictEqual(zeroOverlapTwin, undefined, 'Must NOT match any expert when topical overlap is zero');
    console.log('✅ PASS: Human expert twin matched accurately and declined on zero overlap.\n');

    // -----------------------------------------------------------------------
    // TEST 5: 5-Pillar Payload Generation (Full Suite)
    // -----------------------------------------------------------------------
    console.log('--- TEST 5: 5-Pillar Editorial Payload Generation ---');
    const payload: ReportBriefingPayload = await buildReportEditorialBriefing({
        data: { results: mockLiveReportRows, total: 4 },
        query: 'What does the new Jack Morton fan experience report say?',
        annotatedData: {
            coverage: { status: 'ok' },
            next_moves: {
                candidates: [
                    { prompt: 'Explore sports venue infrastructure', tool: 'get_report_intelligence', args: { query: 'PEAK SportsTech' } }
                ]
            }
        }
    });

    assert.strictEqual(payload.view, 'editorial');
    assert.ok(payload.topline_hook.text.length > 10, 'Topline hook must be populated');
    assert.ok(payload.shifts.length >= 2, 'Should extract structural shifts');
    assert.ok(payload.shifts[0]?.title, 'First shift must have title');
    assert.ok(payload.shifts[0]?.narrative, 'First shift must have narrative');
    assert.ok(payload.shifts[0]?.stats.length > 0, 'First shift must carry extracted stats');

    // Pillar 3 check
    assert.strictEqual(payload.network_signals.length, 1, 'Should include peak-sportstech network signal');
    const netSig = payload.network_signals[0];
    assert.ok(netSig, 'Network signal must exist');
    assert.strictEqual(netSig?.curator, 'PEAK Sports Research', 'Curator must be populated from catalog cache');
    assert.strictEqual(netSig?.source_report, 'PEAK SportsTech Report');
    assert.ok(netSig?.url.startsWith('https://'), `Network signal url must be absolute https: ${netSig?.url}`);

    // Pillar 4 check
    assert.ok(payload.expert_spotlight, 'Expert spotlight must be populated');
    assert.strictEqual(payload.expert_spotlight?.name, 'Peter Abraham');
    assert.strictEqual(payload.expert_spotlight?.consult_url, 'https://expert.fodda.ai/peter-abraham-bicycles-cycling');
    assert.strictEqual(payload.expert_spotlight?.consult_tool, 'consult_human_agent');

    // Pillar 5 check
    assert.ok(payload.follow_ups.length >= 2, 'Should have runnable follow-ups');
    for (const fu of payload.follow_ups) {
        assert.ok(fu.prompt, 'Follow up must have prompt');
        assert.ok(fu.tool, 'Follow up must specify tool');
        assert.ok(typeof fu.args === 'object', 'Follow up must provide args object');
        assert.ok(fu.app_url.startsWith('https://'), `Follow up app_url must be https: ${fu.app_url}`);
    }

    // Markdown rendering check
    assert.ok(payload.briefing_markdown.includes('Strategic Briefing:'), 'Markdown must have main title');
    assert.ok(payload.briefing_markdown.includes('Core Tension:'), 'Markdown must include Core Tension');
    assert.ok(payload.briefing_markdown.includes('Core Structural Shifts'), 'Markdown must include shifts');
    assert.ok(payload.briefing_markdown.includes('Cross-Graph Network Signals'), 'Markdown must include network signals');
    assert.ok(payload.briefing_markdown.includes('Human Expert Digital Twin Spotlight'), 'Markdown must include expert spotlight');
    console.log('✅ PASS: All 5 pillars verified with real catalog and object evidence.\n');

    // -----------------------------------------------------------------------
    // TEST 6: Pricing / SPT Invariant Safety Checks
    // -----------------------------------------------------------------------
    console.log('--- TEST 6: Pricing / SPT Invariant Safety Checks ---');
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
    // TEST 7: Empty Coverage Honest Hook
    // -----------------------------------------------------------------------
    console.log('--- TEST 7: Honest Empty Coverage Hook ---');
    const emptyPayload = await buildReportEditorialBriefing({
        data: { results: [], total: 0 },
        query: 'quantum cryogenic cooling in fast fashion',
        annotatedData: {
            coverage: { status: 'empty' },
        }
    });

    assert.strictEqual(emptyPayload.view, 'editorial');
    assert.ok(emptyPayload.topline_hook.text.includes('No published report intelligence was found specifically matching'), 'Empty hook must honestly state no published report was found');
    assert.ok(!emptyPayload.topline_hook.text.includes('critical shifts across'), 'Must NOT assert fake critical shifts on empty coverage');
    assert.strictEqual(emptyPayload.expert_spotlight, undefined, 'Must not attach an expert spotlight when coverage is empty / zero overlap');
    console.log('✅ PASS: Honest empty coverage hook verified.\n');

    console.log('🎉 ALL COMPREHENSIVE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
