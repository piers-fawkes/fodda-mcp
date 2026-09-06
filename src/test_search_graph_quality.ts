import assert from 'assert';
import {
    reconcileFreshnessDays,
    rankAndFilterEvidence,
    enrichEvidence,
    computeMomentum,
    LUXURY_KEYWORDS,
    LUXURY_BRANDS,
    MASS_BUDGET_KEYWORDS,
    MASS_BUDGET_BRANDS
} from './enrichment.js';
import { computeTierFit } from './coverageRelevance.js';
import { sanitizePayloadForChatGpt } from './toolHandlers.js';

console.log('--- Running search_graph Quality, Freshness & Payload Slimming Suite ---\n');

// ---------------------------------------------------------------------------
// Test 1: Freshness Reconciliation (Issue 2)
// ---------------------------------------------------------------------------
console.log('Test 1: Freshness Reconciliation overrides database updated_at');
const rowWithStaleUpdatedAt = {
    trendName: 'Pop Ups As Test Labs',
    freshnessDays: 16, // Returned from API based on August updated_at
    freshnessDate: '2026-02-26T06:02:34.000Z', // Actual substantive date (~192 days ago)
    updated_at: '2026-08-22T04:17:59.538Z',
    lastSeen: '2026-05-08T00:00:00.000Z'
};

const fixedFreshnessDays = reconcileFreshnessDays(rowWithStaleUpdatedAt, new Date('2026-09-06T12:00:00Z').getTime());
assert.ok(fixedFreshnessDays !== null, 'freshnessDays should not be null');
assert.ok(fixedFreshnessDays >= 190, `freshnessDays should reflect Feb 2026 date (~192 days), got ${fixedFreshnessDays}`);
assert.ok(fixedFreshnessDays !== 16, 'freshnessDays should NOT be 16 from DB updated_at');

const momentum = computeMomentum(rowWithStaleUpdatedAt, new Date('2026-09-06T12:00:00Z').getTime());
assert.strictEqual(momentum, 'building', 'Momentum should be building (~192 days), NOT accelerating (<45 days)');
console.log('✅ Test 1 Passed: Freshness correctly reconciled to substantive editorial date');

// ---------------------------------------------------------------------------
// Test 2: Evidence Relevance Ranking & Miniso/Earnings Suppression (Issue 1)
// ---------------------------------------------------------------------------
console.log('\nTest 2: Evidence Relevance Ranking filters generic earnings & boosts luxury');
const mockEvidenceItems = [
    {
        title: 'Samuel (UBS) probes Miniso',
        summary: 'First, Mr. Ye, in your prepared remarks, you mentioned something regarding IP. I want to ask about Mexico...',
        contentType: 'interpretation',
        brandNames: ['Miniso', 'UBS'],
        publishedAt: '2026-03-31T00:00:00.000Z'
    },
    {
        title: 'Miniso Q4 2025 Revenue',
        summary: 'Miniso reported revenue of Q4 2025 Group Revenue: RMB 6.25 billion; Full Year 2025...',
        contentType: 'metric',
        brandNames: ['Miniso'],
        publishedAt: '2026-03-31T00:00:00.000Z'
    },
    {
        title: 'KFC Japan Christmas-Themed Pop-Up Restaurant Reworking Core Menu Items',
        summary: 'KFC Japan is hosting a temporary restaurant at Hills Café in Roppongi Hills...',
        contentType: 'case_study',
        brandNames: ['KFC'],
        publishedAt: '2026-02-18T00:00:00.000Z'
    },
    {
        title: 'Dior Temporary Retail Space Activating Personalized Consultations and Product Offerings',
        summary: 'Dior established a temporary retail space, an exclusive luxury pop-up store in Oakland Place...',
        contentType: 'case_study',
        brandNames: ['Dior'],
        publishedAt: '2026-02-24T04:09:00.813Z'
    },
    {
        title: "Macy's Bloomingdale's Repositions as Local Leader for Premium/Luxury Customers",
        summary: "Bloomingdale's strategy is anchored on becoming a local destination for luxury pop-ups and discovery...",
        contentType: 'case_study',
        brandNames: ["Bloomingdale's"],
        publishedAt: '2026-03-18T00:00:00.000Z'
    },
    {
        title: 'Hermès Ephemeral Store and Fragrance Pop-Up in Kyoto',
        summary: 'Hermès opened an ephemeral retail space and craft pop-up activation...',
        contentType: 'case_study',
        brandNames: ['Hermès'],
        publishedAt: '2026-03-01T00:00:00.000Z'
    }
];

const luxuryQuery = 'Emerging trends in luxury retail activations and pop-up experiences';
const rankedEvidence = rankAndFilterEvidence(mockEvidenceItems, luxuryQuery, { trendName: 'Pop Ups As Test Labs' }, { maxItems: 3 });

assert.strictEqual(rankedEvidence.length, 3, 'Should return top 3 items');
const topTitles = rankedEvidence.map(e => e.title);
assert.ok(topTitles.some(t => t.includes('Dior')), 'Dior pop-up should be in top items');
assert.ok(topTitles.some(t => t.includes("Bloomingdale's")), "Bloomingdale's should be in top items");
assert.ok(topTitles.some(t => t.includes('Hermès')), 'Hermès should be in top items');

// Verify Miniso earnings call and Miniso revenue are completely excluded
const hasMiniso = rankedEvidence.some(e => (e.title || '').includes('Miniso'));
assert.strictEqual(hasMiniso, false, 'Miniso earnings/revenue items must be suppressed');
const hasKfc = rankedEvidence.some(e => (e.title || '').includes('KFC'));
assert.strictEqual(hasKfc, false, 'Mass-market KFC must be suppressed for luxury query');
console.log('✅ Test 2 Passed: Luxury activations ranked first, Miniso earnings & KFC suppressed');

// ---------------------------------------------------------------------------
// Test 3: Category & Market Tier Qualifier Weighting (Issue 3)
// ---------------------------------------------------------------------------
console.log('\nTest 3: Category & Market Tier Fit Scoring');
const luxuryRow = {
    trendName: 'City-Specific Pop-Ups Co-Produced With Local Operators',
    summary: 'Brands create temporary experiential pop-ups with local luxury operators.',
    brandNames: ['Louis Vuitton', 'Dior', 'Hennessy', 'LVMH']
};

const massMarketRow = {
    trendName: 'Pop Ups As Test Labs',
    summary: 'Brands use temporary spaces to test new formats.',
    brandNames: ['Miniso', 'KFC', 'Taco Bell', 'McDonald\'s']
};

const luxuryFit = computeTierFit(luxuryRow, luxuryQuery);
const massFit = computeTierFit(massMarketRow, luxuryQuery);

assert.ok(luxuryFit > 0.20, `Luxury trend should get positive boost (got ${luxuryFit})`);
assert.ok(massFit < 0, `Mass-market trend should get demoted on luxury query (got ${massFit})`);
assert.ok(luxuryFit - massFit > 0.30, 'Tier fit spread should strongly favor luxury row');
console.log(`✅ Test 3 Passed: Tier fit scores properly separated (luxury: +${luxuryFit.toFixed(2)}, mass: ${massFit.toFixed(2)})`);

// ---------------------------------------------------------------------------
// Test 4: Null Field Stripping in Evidence Citations (Issue 5)
// ---------------------------------------------------------------------------
console.log('\nTest 4: Null Field Stripping in enrichEvidence');
const enriched = enrichEvidence([
    {
        id: 'rec12345678901234',
        node_id: 'rec12345678901234',
        title: 'Dior Pop-Up',
        summary: 'Dior pop-up store in Paris',
        sourceUrl: 'https://fodda.ai/article/dior',
        imageUrl: null,
        speakerName: null,
        speakerTitle: null,
        publication: null,
        place: '',
        brandNames: [],
        contentType: 'case_study'
    }
]);

const cleanedItem = enriched[0];
assert.strictEqual(cleanedItem.imageUrl, undefined, 'Null imageUrl should be stripped');
assert.strictEqual(cleanedItem.speakerName, undefined, 'Null speakerName should be stripped');
assert.strictEqual(cleanedItem.speakerTitle, undefined, 'Null speakerTitle should be stripped');
assert.strictEqual(cleanedItem.publication, undefined, 'Null publication should be stripped');
assert.strictEqual(cleanedItem.id, undefined, 'Duplicate id matching node_id should be stripped');
assert.strictEqual(cleanedItem.place, undefined, 'Empty place string should be stripped');
assert.strictEqual(cleanedItem.brandNames, undefined, 'Empty brandNames array should be stripped');
assert.strictEqual(cleanedItem.node_id, 'rec12345678901234', 'node_id should be preserved');
console.log('✅ Test 4 Passed: Dead null/empty fields cleanly stripped from evidence');

// ---------------------------------------------------------------------------
// Test 5: ChatGPT Payload Sanitization & Slimming (Issue 4)
// ---------------------------------------------------------------------------
console.log('\nTest 5: ChatGPT Payload Sanitization');
const mockLitePayload = {
    total: 5,
    dataStatus: 'ok',
    _render_instructions: { rules: ['Rule 1', 'Rule 2'] },
    _attribution: 'Data sourced from Retail',
    rows: [
        {
            node_id: '6575',
            title: 'Location-as-Media Activations',
            summary: 'Brands use spaces as media.',
            relevance_score: 1.18,
            freshnessDays: 192,
            brandNames: ['Dior', 'Louis Vuitton']
        }
    ]
};

const sanitizedForChatGpt = sanitizePayloadForChatGpt(mockLitePayload);
assert.strictEqual(sanitizedForChatGpt._render_instructions, undefined, '_render_instructions should be omitted for ChatGPT');
assert.strictEqual(sanitizedForChatGpt._attribution, undefined, '_attribution should be omitted for ChatGPT');
assert.strictEqual(sanitizedForChatGpt.theme, undefined, 'theme should be omitted');
assert.strictEqual(sanitizedForChatGpt.total, 5, 'total should be preserved');
assert.strictEqual(sanitizedForChatGpt.rows.length, 1, 'rows should be preserved');
assert.strictEqual(sanitizedForChatGpt.rows[0].node_id, '6575', 'node_id should be preserved');
console.log('✅ Test 5 Passed: ChatGPT payload cleanly sanitized and slimmed');

console.log('\nAll search_graph quality, freshness, and payload slimming tests passed!');
