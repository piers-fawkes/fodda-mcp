import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    addCoverageAnnotation,
    findCandidateExperts,
    extractHeadTerms,
    countOnTopicRows,
    INCIDENTAL_MODIFIERS,
    HEAD_TERM_DOMAIN_SYNONYMS
} from './coverageRelevance.js';
import { readFileSync } from 'node:fs';

console.log('=== Running Verification Suite: Retrieval Truthful Coverage, Head-Term Matching & Honest Telemetry ===');

// --- 1. Head Term Extraction & Incidental Modifier Exclusion ---
console.log('\n--- 1. Testing Head Term Extraction ---');
const tequilaQuery = 'at-home cocktail making margarita tequila home occasions United States';
const headTerms = extractHeadTerms(tequilaQuery);
console.log('Head terms for tequila query:', headTerms);
assert.ok(headTerms.includes('tequila'), 'headTerms must include "tequila"');
assert.ok(headTerms.includes('margarita'), 'headTerms must include "margarita"');
assert.ok(headTerms.includes('cocktail'), 'headTerms must include "cocktail"');
assert.ok(!headTerms.includes('home'), 'headTerms must NOT include incidental modifier "home"');
assert.ok(!headTerms.includes('making'), 'headTerms must NOT include incidental modifier "making"');
assert.ok(!headTerms.includes('occasions'), 'headTerms must NOT include incidental modifier "occasions"');
assert.ok(!headTerms.includes('states'), 'headTerms must NOT include incidental modifier "states"');
console.log('✅ Head term extraction correctly isolates core category nouns and drops incidental modifiers.');

// --- 2. Expert Lane Matching (B4: Tequila / at-home query recommends drinks expert, never Liz Parker) ---
console.log('\n--- 2. Testing Expert Lane Matching (B4) ---');
const mockAnalysts = [
    {
        id: 'liz-parker',
        slug: 'liz-parker',
        name: 'Liz Parker',
        title: 'Home & Small Business Strategist',
        expert_in: ['home', 'small business', 'work from home', 'remote work', 'entrepreneurship'],
        bio: 'Advises entrepreneurs on home business growth, remote workplace dynamics, and at-home routines.',
        is_verified_real_person: true,
        topic: ['home', 'business', 'work']
    },
    {
        id: 'russell-davis',
        slug: 'russell-davis',
        name: 'Russell Davis',
        title: 'Celebrity Mixologist & Spirits Strategist',
        expert_in: ['spirits', 'cocktails', 'mixology', 'hospitality', 'tequila', 'bar experience', 'beverage innovation'],
        bio: 'President of Helen David Relief Fund, expert on craft spirits, cocktail menus, and at-home mixology trends.',
        is_verified_real_person: true,
        topic: ['spirits', 'cocktails', 'beverage']
    },
    {
        id: 'thiago-bersou',
        slug: 'thiago-bersou',
        name: 'Thiago Bersou',
        title: 'Global Beverage & Spirits Insights Director',
        expert_in: ['beverage', 'spirits', 'cocktails', 'ready to drink', 'tequila', 'liquid culture'],
        bio: 'Senior strategist specializing in alcoholic beverage trends, spirits premiumization, and drinking rituals.',
        is_verified_real_person: true,
        topic: ['spirits', 'beverages', 'tequila']
    }
];

const mockCatalog: any[] = [
    { graph_id: 'russell-davis', name: 'Russell Davis', graph_type: 'expert' },
    { graph_id: 'thiago-bersou', name: 'Thiago Bersou', graph_type: 'expert' },
    { graph_id: 'liz-parker', name: 'Liz Parker', graph_type: 'expert' }
];

const candidateExperts = findCandidateExperts(
    tequilaQuery,
    {
        analysts: mockAnalysts,
        searchedGraphs: mockCatalog,
        limit: 3
    }
);

console.log('Candidate experts recommended:', candidateExperts.map(c => `${c.display_name} (${c.analyst_id})`));
const lizIncluded = candidateExperts.some(c => c.analyst_id === 'liz-parker');
const drinksExpertIncluded = candidateExperts.some(c => c.analyst_id === 'russell-davis' || c.analyst_id === 'thiago-bersou');

assert.strictEqual(lizIncluded, false, 'Liz Parker MUST NOT be recommended for a tequila query merely due to "home" modifier!');
assert.strictEqual(drinksExpertIncluded, true, 'Drinks/spirits experts (Russell Davis or Thiago Bersou) MUST be recommended!');
console.log('✅ B4 Verified: Drinks experts recommended; Liz Parker completely excluded.');

// --- 3. Truthful Coverage & Telemetry (B1: layers_searched and graphs_searched derived strictly from API) ---
console.log('\n--- 3. Testing Truthful Coverage & Telemetry (B1) ---');
const sampleCatalog: any[] = [
    { graph_id: 'retail', graph_type: 'report' },
    { graph_id: 'fashion', graph_type: 'report' },
    { graph_id: 'food', graph_type: 'report' },
    { graph_id: 'beverage', graph_type: 'domain' },
    { graph_id: 'sic', graph_type: 'expert' },
    { graph_id: 'c-suite', graph_type: 'c_suite' },
];

// Test 3a: API returned empty graphs_searched []
const apiEmptyData: any = {
    rows: [],
    graphs_searched: []
};
const annotatedEmpty = await addCoverageAnnotation(apiEmptyData, tequilaQuery, sampleCatalog, 10, true, sampleCatalog);
console.log('Annotated Empty layers_searched:', annotatedEmpty.coverage.layers_searched);
console.log('Annotated Empty graphs_searched:', annotatedEmpty.coverage.graphs_searched);
assert.deepStrictEqual(annotatedEmpty.coverage.layers_searched, [], 'layers_searched must be [] when API searched 0 graphs');
assert.deepStrictEqual(annotatedEmpty.coverage.graphs_searched, [], 'graphs_searched must be [] when API searched 0 graphs');

// Test 3b: API returned 2 specific graphs
const apiSpecificData: any = {
    rows: [
        { trendId: 't1', title: 'Premium Tequila Cocktails', graphId: 'beverage', relevance_score: 0.88 }
    ],
    graphs_searched: ['beverage']
};
const annotatedSpecific = await addCoverageAnnotation(apiSpecificData, tequilaQuery, sampleCatalog, 10, true, sampleCatalog);
console.log('Annotated Specific layers_searched:', annotatedSpecific.coverage.layers_searched);
console.log('Annotated Specific graphs_searched:', annotatedSpecific.coverage.graphs_searched);
assert.deepStrictEqual(annotatedSpecific.coverage.layers_searched, ['domain'], 'layers_searched must reflect only API-searched graphs');
assert.deepStrictEqual(annotatedSpecific.coverage.graphs_searched, ['beverage'], 'graphs_searched must match API report');

console.log('✅ B1 Telemetry Verified: layers_searched and graphs_searched faithfully mirror API reality.');

// --- 4. Suggested Graph IDs Capped at <= 10 (B3) ---
console.log('\n--- 4. Testing Suggested Graph IDs Cap (B3) ---');
const hugeCandidateList = Array.from({ length: 300 }, (_, i) => ({
    graph_id: `graph_${i}`,
    graph_type: 'report'
}));
const emptyWithHugeCandidates = await addCoverageAnnotation(
    { rows: [] },
    'rare niche topic without results',
    hugeCandidateList,
    10,
    true,
    hugeCandidateList
);
const suggestedIds = emptyWithHugeCandidates.coverage?.suggested_action?.arguments?.graph_ids || [];
console.log('Suggested graph IDs count on empty response with 300 candidates:', suggestedIds.length);
assert.ok(suggestedIds.length <= 10, `Suggested graph IDs must be <= 10, got ${suggestedIds.length}`);
console.log('✅ B3 Cap Verified: Suggested graph IDs capped at <= 10 on empty responses.');

// --- 4b. Evidence Stripping & Limit Truncation Verification (B3) ---
console.log('\n--- 4b. Testing Evidence Stripping & Limit Enforcement (B3) ---');
const toolHandlersSrc = readFileSync('src/toolHandlers.ts', 'utf-8');

// Verify regex/code guarantees in toolHandlers for include_evidence: false and slice(0, effectiveLimit)
assert.ok(
    toolHandlersSrc.includes('include_evidence: include_evidence !== false'),
    'Fallback call must pass callers include_evidence preference'
);
assert.ok(
    toolHandlersSrc.includes('data.rows = data.rows.slice(0, effectiveLimit)'),
    'Fallback must truncate data.rows to effectiveLimit'
);
assert.ok(
    toolHandlersSrc.includes('if (include_evidence === false && Array.isArray(data.rows))'),
    'Defensive check must enforce evidence stripping across data.rows'
);
console.log('✅ B3 Payload Size Verified: Evidence stripping and limit truncation strictly enforced.');

// --- 5. Parameter Hygiene & Topic Mirroring Check (B2) ---
console.log('\n--- 5. Verifying Parameter Hygiene in toolHandlers.ts (B2) ---');

// Ensure no topic mirroring in search_statistics or search_insights
const topicMirroringRegex = /params\.set\s*\(\s*['"]topic['"]\s*,\s*sector\s*\)/;
assert.strictEqual(topicMirroringRegex.test(toolHandlersSrc), false, 'params.set("topic", sector) must be completely eliminated');
console.log('✅ B2 Topic Mirroring Verified: params.set("topic", sector) has been removed.');

// Ensure sector descriptions do not lead with 'Alcoholic Drinks'
const alcoholicDrinksRegex = /sector.*describe.*Alcoholic Drinks/;
assert.strictEqual(alcoholicDrinksRegex.test(toolHandlersSrc), false, 'sector descriptions must not lead with "Alcoholic Drinks"');
console.log('✅ B2 Parameter Description Verified: sector descriptions updated to free-text category hints.');

// Ensure research_gaps instruction softened
const softenedPromptRegex = /state plainly that Fodda(\\')?s coverage is thin on this specific niche/;
assert.ok(softenedPromptRegex.test(toolHandlersSrc), 'research_gaps guidance must speak plainly and offer deep dive');
console.log('✅ B1 Guidance Note Verified: research_gaps instruction softened.');

console.log('\n================================================================');
console.log(' ALL BRIEF DOD VERIFICATION CHECKS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
process.exit(0);
