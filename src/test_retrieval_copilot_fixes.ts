import assert from 'node:assert';
import {
    extractHeadTerms,
    extractContrastedTerms,
    findCandidateExperts,
    countOnTopicRows,
    generateNextMoves,
    isGraphVocabularyMatch
} from './coverageRelevance.js';
import { initCatalogCache, getGraphs, getAnalysts } from './catalogCache.js';

console.log('=== Running Verification: Copilot Review Fixes (3 Queries, Expert Lanes & Thread Graphs) ===\n');

await initCatalogCache();
const catalog = getGraphs();
const analysts = getAnalysts();

// =========================================================================
// Query 1: "running clubs as social alternatives to bars for young adults"
// =========================================================================
console.log('--- Testing Query 1: "running clubs as social alternatives to bars for young adults" ---');
const q1 = "running clubs as social alternatives to bars for young adults";

// 1a. Contrasted terms extraction
const contrasted1 = extractContrastedTerms(q1);
console.log('Q1 Contrasted terms:', Array.from(contrasted1));
assert.ok(contrasted1.has('bars') || contrasted1.has('bar'), 'Q1 must identify "bars" as a contrasted entity');

// 1b. Head terms extraction: "social" and "bars" and "young adults" must NOT be primary head terms
const head1 = extractHeadTerms(q1);
console.log('Q1 Head terms:', head1);
assert.ok(head1.includes('running'), 'Q1 head terms must include "running"');
assert.ok(!head1.includes('social'), 'Q1 head terms must NOT include cross-cutting modifier "social"');
assert.ok(!head1.includes('bars'), 'Q1 head terms must NOT include contrasted entity "bars"');
assert.ok(!head1.includes('young'), 'Q1 head terms must NOT include demographic modifier "young"');

// 1c. Expert suggestions: MUST NOT recommend Ana Lucia Novak (social media) or Russell Davis (bars)
const experts1 = findCandidateExperts(q1, { analysts, catalog });
console.log('Q1 Candidate experts count:', experts1.length);
assert.strictEqual(
    experts1.some(e => e.analyst_id === 'ana-lucia-novak'),
    false,
    'Ana Lucia Novak (social media) MUST NOT be recommended for running clubs query'
);
assert.strictEqual(
    experts1.some(e => e.analyst_id === 'russell-davis'),
    false,
    'Russell Davis (bars/spirits) MUST NOT be recommended for running clubs query'
);
assert.strictEqual(
    experts1.length,
    0,
    'With no running/athletics expert in lane, show none rather than the nearest one'
);
console.log('✅ Q1 Expert Suggestions: Ana Lucia Novak & Russell Davis eliminated; returns 0 candidates when none in lane.');

// 1d. Row matching: Golf-bay bars, Pew online communities, and mobile games are NOT on-topic
const mockRowsQ1 = [
    { id: '1', title: 'Golf-bay bars see rise in evening traffic', summary: 'Topgolf and entertainment bars expanding drink sales', relevance_score: 0.85 },
    { id: '2', title: 'Pew: Online Communities and Social Media Use in 2026', summary: 'Survey of young adults using social platforms and digital spaces', relevance_score: 0.82 },
    { id: '3', title: 'Mobile Games Driving Casual Social Engagement', summary: 'Multiplayer gaming replaces traditional social gatherings', relevance_score: 0.80 },
    { id: '4', title: 'Runners Form Community Groups Across Major Cities', summary: 'Running clubs surging in popularity as morning social rituals', relevance_score: 0.88 },
    { id: '5', title: 'Beer and Cocktail Consumption Shifts in Nightlife', summary: 'Bars adapting to sober curious drinkers', relevance_score: 0.75 }
];
const q1Relevance = countOnTopicRows(mockRowsQ1, q1, [], catalog);
console.log(`Q1 On-topic rows: ${q1Relevance.onTopic}/${mockRowsQ1.length}`);
assert.strictEqual(q1Relevance.onTopic, 1, 'Only the running community row (#4) should match; bars/social rows must be excluded');
console.log('✅ Q1 Row Relevance: 1/5 on-topic (social and bars do not carry the match).');


// =========================================================================
// Query 2: "retail media network advertising spend growth"
// =========================================================================
console.log('\n--- Testing Query 2: "retail media network advertising spend growth" ---');
const q2 = "retail media network advertising spend growth";

// 2a. Head terms extraction: isolates retail & advertising (drops spend, growth, network)
const head2 = extractHeadTerms(q2);
console.log('Q2 Head terms:', head2);
assert.ok(head2.includes('retail'), 'Q2 head terms must include "retail"');
assert.ok(head2.includes('advertising'), 'Q2 head terms must include "advertising"');
assert.ok(!head2.includes('spend'), 'Q2 head terms must NOT include generic action "spend"');
assert.ok(!head2.includes('growth'), 'Q2 head terms must NOT include cross-cutting modifier "growth"');

// 2b. Row matching: Beauty GMV and luxury resale stats must NOT count as on-topic for retail media
const mockRowsQ2 = [
    { id: 'r1', title: 'Live Commerce Statistics By Sales, Revenue And Trend (2025)', summary: 'Rapid growth of live commerce channels forecast for 2025 in retail', relevance_score: 0.75 },
    { id: 'r2', title: 'Douyin beauty GMV reached nearly ¥20B in July 2025, up 31.7% YoY', summary: 'Gross merchandise volume generated by Douyin beauty category in retail', relevance_score: 0.74 },
    { id: 'r3', title: 'Delivery is too expensive is leading cause for online retailers being held back', summary: 'What is holding online retailers back from ecommerce expansion', relevance_score: 0.70 },
    { id: 'r4', title: 'Luxury resale market: USD 38.32B in 2025, projected to reach USD 55.88B by 2029', summary: 'Secondhand luxury market size and retail growth', relevance_score: 0.72 },
    { id: 'r5', title: 'Smaller dealers (under $250,000 turnover) posted 17% growth in retail sales', summary: 'Market base growth benefiting small retail shops', relevance_score: 0.68 }
];
const q2Relevance = countOnTopicRows(mockRowsQ2, q2, [], catalog);
console.log(`Q2 On-topic rows: ${q2Relevance.onTopic}/${mockRowsQ2.length}`);
assert.strictEqual(q2Relevance.onTopic, 0, 'Retail media query must judge beauty GMV and luxury resale as 0/5 on-topic (MISS)');
console.log('✅ Q2 Row Relevance: 0/5 on-topic (MISS); generic retail mentions do NOT match retail media.');

// 2c. Next moves thread: MUST NOT attach pew-economic-inequality-trends
const q2NextMoves = await generateNextMoves(
    mockRowsQ2,
    q2,
    ['retail'],
    'thin',
    q2Relevance.onTopic,
    null,
    catalog,
    analysts
);
console.log('Q2 Next moves thread:', q2NextMoves.thread);
assert.strictEqual(
    q2NextMoves.thread?.adjacent?.graph_id === 'pew-economic-inequality-trends',
    false,
    'Q2 MUST NOT attach unrelated pew-economic-inequality-trends'
);
console.log('✅ Q2 Next Moves: Unrelated Pew inequality graph eliminated from retail media next moves.');


// =========================================================================
// Query 3: "luxury resale market growth among Gen Z shoppers"
// =========================================================================
console.log('\n--- Testing Query 3: "luxury resale market growth among Gen Z shoppers" ---');
const q3 = "luxury resale market growth among Gen Z shoppers";

// 3a. Head terms extraction: "among" and "shoppers" must NOT be head terms; "resale" is primary
const head3 = extractHeadTerms(q3);
console.log('Q3 Head terms:', head3);
assert.ok(head3.includes('resale'), 'Q3 head terms must include "resale"');
assert.ok(head3.includes('luxury'), 'Q3 head terms must include "luxury"');
assert.ok(!head3.includes('among'), 'Q3 head terms must NOT include preposition "among"');
assert.ok(!head3.includes('shoppers'), 'Q3 head terms must NOT include generic cohort "shoppers"');

// 3b. Expert suggestions: MUST NOT recommend Laurent Delporte (luxury hotels)
const experts3 = findCandidateExperts(q3, { analysts, catalog });
console.log('Q3 Candidate experts count:', experts3.length);
assert.strictEqual(
    experts3.some(e => e.analyst_id === 'laurent-delporte'),
    false,
    'Laurent Delporte (luxury hotels) MUST NOT be recommended for luxury resale query'
);
assert.strictEqual(
    experts3.length,
    0,
    'With no luxury resale / recommerce expert in lane, show none rather than nearest one'
);
console.log('✅ Q3 Expert Suggestions: Laurent Delporte eliminated; returns 0 candidates when none in lane.');

// 3c. Next moves: status is "ok" -> kind "honest_thin" MUST NOT fire, and Newzoo games graph MUST NOT be recommended
const mockRowsQ3 = [
    { id: '1', title: 'Luxury resale market: USD 38.32B in 2025, projected to reach USD 55.88B by 2029 (9.9% CAGR)', summary: 'Secondhand luxury market size and retail growth among younger buyers', relevance_score: 0.95 },
    { id: '2', title: 'Gen Z driving circular fashion and recommerce adoption', summary: 'Secondhand luxury platforms expanding authentication services', relevance_score: 0.92 },
    { id: '3', title: 'Pre-owned designer goods market outpaces primary luxury sales', summary: 'Resale channels proving resilient amid broader luxury slowdown', relevance_score: 0.90 }
];
const q3NextMoves = await generateNextMoves(
    mockRowsQ3,
    q3,
    ['retail'],
    'ok',
    3,
    null,
    catalog,
    analysts
);
console.log('Q3 Next moves thread:', q3NextMoves.thread);
assert.notStrictEqual(
    q3NextMoves.thread?.kind,
    'honest_thin',
    'When status is "ok", nextMoves.thread.kind MUST NOT be "honest_thin"'
);
assert.notStrictEqual(
    q3NextMoves.thread?.adjacent?.graph_id,
    'newzoo-global-games-market-outlook',
    'Q3 MUST NOT recommend unrelated newzoo games graph'
);
console.log('✅ Q3 Next Moves: honest_thin does not fire on "ok" coverage; Newzoo games graph eliminated.');

// =========================================================================
// Vocabulary Matching helper check
// =========================================================================
console.log('\n--- Testing isGraphVocabularyMatch ---');
const newzooGraph = catalog.find(g => g.graph_id.includes('newzoo'));
if (newzooGraph) {
    const isNewzooMatch = isGraphVocabularyMatch(newzooGraph, ['luxury', 'resale'], new Set(['luxury', 'resale', 'recommerce', 'secondhand']));
    assert.strictEqual(isNewzooMatch, false, 'Newzoo games graph MUST NOT match luxury resale vocabulary');
    console.log('✅ isGraphVocabularyMatch correctly rejects Newzoo for luxury resale');
}

const pewGraph = catalog.find(g => g.graph_id.includes('inequality'));
if (pewGraph) {
    const isPewMatch = isGraphVocabularyMatch(pewGraph, ['tequila'], new Set(['tequila', 'spirits', 'cocktail', 'mezcal', 'agave']));
    assert.strictEqual(isPewMatch, false, 'Pew inequality graph MUST NOT match tequila vocabulary');
    console.log('✅ isGraphVocabularyMatch correctly rejects Pew inequality for tequila');
}

console.log('\n================================================================');
console.log(' ALL COPILOT REVIEW TESTS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
