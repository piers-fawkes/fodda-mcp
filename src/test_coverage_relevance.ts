/**
 * Verification for relevance-aware coverage thinness (v1.41.0).
 *
 * Replays the QA failure: query "Chinese automotive trends EV brands China car
 * market" returned 10 rows and coverage "ok", but most rows were off-topic
 * cross-graph fan-out noise (women's health, GLP-1 aesthetics, TikTok
 * minimalism) — so the get_supplemental_context nudge was never emitted.
 *
 * Run: npx tsx src/test_coverage_relevance.ts
 */

import { addCoverageAnnotation, countOnTopicRows, specificQueryTokens } from './coverageRelevance.js';
import type { CatalogGraph } from './catalogCache.js';

const CATALOG = [
    { graph_id: 'retail', name: 'Retail', domain: 'retail', graph_type: 'domain', topics: ['retail', 'commerce'] },
    { graph_id: 'automotive-color-trends', name: 'Automotive Color Trends', domain: 'automotive', graph_type: 'industry report', topics: ['automotive', 'design'] },
    { graph_id: 'womens-health-expert', name: 'Womens Health Futures', domain: 'health', graph_type: 'expert', topics: ['health', 'wellness'] },
    { graph_id: 'beauty-expert', name: 'Beauty Aesthetics', domain: 'beauty', graph_type: 'expert', topics: ['beauty'] },
    { graph_id: 'social-report', name: 'Social Media Culture', domain: 'media', graph_type: 'industry report', topics: ['social media'] },
] as unknown as CatalogGraph[];

const QA_QUERY = 'Chinese automotive trends EV brands China car market';

// Tier scales in play: domain composite ~2.0, expert ~1.0, report ~0.8.
const row = (graphId: string, title: string, summary: string, score: number, extra: any = {}) => ({
    _use_this_graphId: graphId,
    title,
    summary,
    relevance_score: score,
    evidence_count: 5, // keep the evidence-thinness check out of the way
    ...extra,
});

// QA-shaped payload: 2 clearly on-topic rows, 8 off-topic fan-out rows whose
// scores are respectable within their own graphs but well below their tier's
// on-topic scale.
const qaRows = [
    row('retail', 'EV Brand Loyalty in China', 'Chinese consumers switching to domestic EV marques', 2.1),
    row('automotive-color-trends', 'China Car Exterior Palettes', 'Color direction for the Chinese automotive market', 0.82),
    row('womens-health-expert', 'Hormonal Wellness Platforms', 'Femtech products for menopause support', 0.68),
    row('womens-health-expert', 'Cycle-Synced Nutrition', 'Personalized supplements by cycle phase', 0.64),
    row('beauty-expert', 'GLP-1 Aesthetics Boom', 'Injectable-adjacent skincare positioning', 0.62),
    row('beauty-expert', 'Clinical Skinimalism', 'Derm-approved minimal routines', 0.6),
    row('social-report', 'TikTok 90s Minimalism', 'Nostalgia-core aesthetic on short video', 0.55),
    row('social-report', 'Deinfluencing 2.0', 'Creators monetizing anti-haul content', 0.52),
    row('womens-health-expert', 'Longevity Clinics for Women', 'Preventive diagnostics memberships', 0.58),
    row('beauty-expert', 'Scalp Care Premiumization', 'Serums migrating from skin to scalp', 0.5),
];

let failures = 0;
function check(label: string, actual: any, expected: any) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

async function runTests() {
    // ── Tokenizer strips generic research vocabulary ──
    check('tokens keep only specific terms', specificQueryTokens(QA_QUERY), ['chinese', 'automotive', 'ev', 'china', 'car']);

    // ── Case A: QA replica — 10 rows, 2 on-topic → thin + suggested_action ──
    const a = await addCoverageAnnotation({ rows: [...qaRows] }, QA_QUERY, [], 10, false, CATALOG);
    check('A: status', a.coverage.status, 'thin');
    check('A: results_returned', a.coverage.results_returned, 10);
    check('A: results_on_topic', a.coverage.results_on_topic, 2);
    check('A: suggested_action tool', a.coverage.suggested_action?.tool, 'get_supplemental_context');
    check('A: reason names the on-topic share', a.coverage.suggested_action?.reason?.includes('only 2 of 10 results are on-topic'), true);
    check('A: presentation is internal', a.coverage.presentation, 'internal');
    check('A: escalation offers Deep Dive', a.coverage.escalation?.options?.[0]?.tool, 'deep_research_topic');
    check('A: escalation offers web/LLM research', a.coverage.escalation?.options?.[1]?.action, 'web_llm_research');
    check('A: escalation gated on failed recovery', a.coverage.escalation?.when?.includes('suggested_action'), true);
    check('A: escalation phrasing', a.coverage.escalation?.say, 'This is what we have on this right now.');

    // ── Case B: healthy — 6 on-topic rows among the same noise → ok, no nudge ──
    const onTopicSix = [
        row('retail', 'EV Brand Loyalty in China', 'Chinese consumers switching to domestic EV marques', 2.1),
        row('retail', 'Chinese Auto Retail Formats', 'Direct-to-consumer car showrooms in China', 1.9),
        row('retail', 'BYD Global Push', 'Dealership expansion strategy', 1.8), // no literal token; rescued by domain score
        row('automotive-color-trends', 'China Car Exterior Palettes', 'Color direction for the Chinese automotive market', 0.82),
        row('automotive-color-trends', 'EV Interior Materials', 'Cabin material direction for electric vehicles', 0.78),
        row('retail', 'NEV Charging Retail', 'Charging-station adjacent commerce in Chinese cities', 1.7),
    ];
    const b = await addCoverageAnnotation({ rows: [...onTopicSix, ...qaRows.slice(2, 6)] }, QA_QUERY, [], 10, false, CATALOG);
    check('B: status', b.coverage.status, 'ok');
    check('B: results_on_topic', b.coverage.results_on_topic, 6);
    check('B: no suggested_action', b.coverage.suggested_action === undefined, true);
    check('B: no escalation on ok', b.coverage.escalation === undefined, true);

    // ── Case F: empty result set → escalation ladder also present ──
    const f = await addCoverageAnnotation({ rows: [] }, QA_QUERY, [], 10, false, CATALOG);
    check('F: status', f.coverage.status, 'empty');
    check('F: suggested_action tool', f.coverage.suggested_action?.tool, 'get_supplemental_context');
    check('F: escalation offers Deep Dive', f.coverage.escalation?.options?.[0]?.tool, 'deep_research_topic');

    // ── Case C: generic query — relevance not judgeable, legacy behavior only ──
    const c = await addCoverageAnnotation({ rows: [...qaRows] }, 'top emerging trends', [], 10, false, CATALOG);
    check('C: status', c.coverage.status, 'ok');
    check('C: results_on_topic absent', c.coverage.results_on_topic === undefined, true);

    // ── Case D: score-less rows need a token match to count on-topic ──
    // (2026-08-20 fix: a row with no score AND no lexical overlap is off-topic;
    // previously score-less rows were counted on-topic unconditionally, which let
    // fully off-topic result sets report status "ok".)
    const statsRows = qaRows.slice(2).map(r => ({ ...r, relevance_score: null }));
    const d = await addCoverageAnnotation({ rows: statsRows }, QA_QUERY, [], 10, true, CATALOG);
    check('D: status', d.coverage.status, 'thin');
    check('D: score-less off-topic rows not counted', d.coverage.results_on_topic, 0);
    // Score-less rows WITH a token match still count on-topic.
    const statsOnTopic = onTopicSix.slice(0, 2).map(r => ({ ...r, relevance_score: null }));
    const d2 = await addCoverageAnnotation({ rows: [...statsOnTopic, ...statsRows] }, QA_QUERY, [], 10, true, CATALOG);
    check('D2: matching score-less rows counted', d2.coverage.results_on_topic, 2);

    // ── Case E: limit < 3 with all rows on-topic — no false thin ──
    const e = await addCoverageAnnotation({ rows: onTopicSix.slice(0, 2) }, QA_QUERY, [], 2, false, CATALOG);
    check('E: status', e.coverage.status, 'ok');

    // ── Case G: Jeff Squires QA replica (2026-08-20) — deliberately off-topic
    // query against retail/skincare fan-out rows must NOT report ok with
    // results_on_topic == raw count ──
    const JEFF_QUERY = 'financial planning reinvention retirement Easter egg hunt';
    const jeffRows = [
        row('retail', 'Retailer-Operated Value-Recovery Programs', 'Trade-in and resale programs run by retailers', 1.45),
        row('retail', 'Ambient Commerce Storefronts', 'Sensor-based checkout-free formats', 1.4),
        row('womens-health-expert', 'Hormonal Wellness Platforms', 'Femtech products for menopause support', 0.7),
        row('beauty-expert', 'Clinical Skinimalism', 'Derm-approved minimal routines', 0.66),
        row('social-report', 'Deinfluencing 2.0', 'Creators monetizing anti-haul content', 0.5),
    ];
    const g = await addCoverageAnnotation({ rows: jeffRows }, JEFF_QUERY, [], 10, false, CATALOG);
    check('G: status not ok for fully off-topic set', g.coverage.status, 'thin');
    check('G: results_on_topic is 0', g.coverage.results_on_topic, 0);

    // ── Direct unit check on the counter ──
    check('countOnTopicRows on QA replica', countOnTopicRows(qaRows, QA_QUERY, [], CATALOG), { onTopic: 2, evaluated: true });

    // ── Case H: Backend dataStatus: 'TREND_MATCH' with 10 rows without evidence arrays ──
    // Specialist search (e.g. Peter Abraham cycling search) returns 10 trends confirmed
    // by backend vector search. Should NOT be downgraded to 'thin' or attach suggested_action.
    const cyclingRows = [
        { _use_this_graphId: 'peter-abraham-bicycles-cycling', title: 'digital wall', summary: 'Chinese cycling market', relevance_score: 0.726, evidence: [] },
        { _use_this_graphId: 'peter-abraham-bicycles-cycling', title: 'eventization of the weekly ride', summary: 'Group rides', relevance_score: 0.569, evidence: [] },
        { _use_this_graphId: 'peter-abraham-bicycles-cycling', title: 'post-Justin generation', summary: 'Young cyclists', relevance_score: 0.566, evidence: [] },
        { _use_this_graphId: 'peter-abraham-bicycles-cycling', title: 'Ride LA Together', summary: 'LA bike infrastructure', relevance_score: 0.56, evidence: [] },
        { _use_this_graphId: 'havas-marketing', title: 'Gaming Culture', summary: 'Niche fandoms', relevance_score: 0.632, evidence: [] },
        { _use_this_graphId: 'pinterest-hobbies-trend-report-2026', title: 'Collecting As Identity', summary: 'Hobby collection', relevance_score: 0.615, evidence: [] },
        { _use_this_graphId: 'collectibles-alt-assets', title: 'Live Commerce', summary: 'Discovery layer', relevance_score: 0.516, evidence: [] },
        { _use_this_graphId: '2026-macro-trend-graph', title: 'BIOADAPTIVE BALANCE', summary: 'Health balance', relevance_score: 0.496, evidence: [] },
        { _use_this_graphId: '2026-macro-trend-graph', title: 'ANALOG SOUL', summary: 'Physical touchpoints', relevance_score: 0.493, evidence: [] },
        { _use_this_graphId: 'edelman-marketing', title: 'Finance Eats Culture', summary: 'Financialization', relevance_score: 0.448, evidence: [] },
    ];
    const h = await addCoverageAnnotation({
        dataStatus: 'TREND_MATCH',
        on_topic_total: 4,
        rows: cyclingRows
    }, 'cycling and bicycle culture trends', [], 10, false, CATALOG);
    check('H: backend TREND_MATCH status', h.coverage.status, 'ok');
    check('H: results_returned', h.coverage.results_returned, 10);
    check('H: no suggested_action on TREND_MATCH', h.coverage.suggested_action, undefined);

    // ── Case I: Multi-graph fanout with on_topic_total: 4 and 10 rows ──
    const i = await addCoverageAnnotation({
        dataStatus: 'ok',
        on_topic_total: 4,
        rows: cyclingRows
    }, 'cycling and bicycle culture trends', [], 10, false, CATALOG, { onTopicTotal: 4 });
    check('I: on_topic_total >= 3 status', i.coverage.status, 'ok');
    check('I: no suggested_action when on_topic_total >= 3', i.coverage.suggested_action, undefined);

    // ── Case J: include_evidence: false with 10 rows does not trigger isThinEvidence ──
    const j = await addCoverageAnnotation({
        dataStatus: 'ok',
        rows: cyclingRows
    }, 'top emerging trends', [], 10, false, CATALOG, { include_evidence: false });
    check('J: include_evidence: false does not flag thin on generic query', j.coverage.status, 'ok');
    check('J: no suggested_action on healthy results without evidence', j.coverage.suggested_action, undefined);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
}

runTests();
