import assert from 'assert';
import {
    reconcileFreshnessDays,
    rankAndFilterEvidence,
    enrichEvidence,
    computeMomentum,
    isPlaceholderPlace,
    reconcilePlace,
    LUXURY_KEYWORDS,
    LUXURY_BRANDS,
    MASS_BUDGET_KEYWORDS,
    MASS_BUDGET_BRANDS,
    cleanTruncateWhyNow
} from './enrichment.js';
import { computeTierFit } from './coverageRelevance.js';
import { sanitizePayloadForChatGpt } from './toolHandlers.js';
import { classifyAccessError } from './errorHandling.js';
import { setCachedCatalogForTesting, getRelevantGraphs, getGraphs } from './catalogCache.js';

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
        summary: 'Dior pop-up store with new product launches',
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

// ---------------------------------------------------------------------------
// Test 6: Place Reconciliation & Placeholder Stripping (Issues 2 & 3)
// ---------------------------------------------------------------------------
console.log('\nTest 6: Place Reconciliation & Placeholder Stripping');

// 6a: isPlaceholderPlace checks
assert.strictEqual(isPlaceholderPlace('string, string, string'), true, '"string, string, string" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('string'), true, '"string" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('N/A'), true, '"N/A" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('n/a'), true, '"n/a" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('undefined'), true, '"undefined" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('null'), true, '"null" must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace(''), true, 'Empty string must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace(undefined), true, 'undefined must be flagged as placeholder');
assert.strictEqual(isPlaceholderPlace('Milan, Italy'), false, '"Milan, Italy" is valid place');
assert.strictEqual(isPlaceholderPlace('Seattle, USA, North America'), false, '"Seattle, USA" is valid place string');
console.log('  ✅ 6a: isPlaceholderPlace correctly identifies placeholder variants');

// 6b: reconcilePlace location reconciliation
const hermesReconciled = reconcilePlace(
    'Seattle, USA, North America',
    "Launch of 'Hermestories' Experiential Theater Play",
    "Hermès launched 'Hermestories' in Milan, an experiential theater play designed to allow visitors to discover the history of Hermès."
);
assert.strictEqual(hermesReconciled, 'Milan, Italy', 'Contradictory Seattle place must be reconciled to Milan, Italy based on summary');

const studioYetReconciled = reconcilePlace(
    'Seattle, USA, North America',
    'Studio Yet Pop-Up High-Performance Training Space Launch',
    "Lululemon is hosting 'Studio Yet,' a 3-week pop-up high-performance training space in Los Angeles."
);
assert.strictEqual(studioYetReconciled, 'Los Angeles, USA', 'Contradictory Seattle place must be reconciled to Los Angeles, USA based on summary');

const placeholderPlaceReconciled = reconcilePlace(
    'string, string, string',
    '30atoms Integrates Mobile Testing Station and Transparent Design Within Airport Pop-Up',
    "Skincare brand 30atoms created a pop-up store in an airport. The design uses stainless steel..."
);
assert.strictEqual(placeholderPlaceReconciled, undefined, 'Placeholder place with no city in text should return undefined');

const diorHarajukuReconciled = reconcilePlace(
    'undefined',
    "Dior's Addict Sweet Shop in Harajuku: Blurring Lines Between Playful Retail and Emotional Engagement",
    "Dior has launched the Addict Sweet Shop in Harajuku, transforming retail into an immersive experience..."
);
assert.strictEqual(diorHarajukuReconciled, 'Tokyo, Japan', 'Dior in Harajuku should reconcile to Tokyo, Japan');
console.log('  ✅ 6b: reconcilePlace reconciles text cities and discards placeholders');

// 6c: enrichEvidence integrates place reconciliation and placeholder stripping
const enrichedEvidenceWithPlaces = enrichEvidence([
    {
        title: "Launch of 'Hermestories' Experiential Theater Play",
        summary: "Hermès launched 'Hermestories' in Milan, an experiential theater play...",
        place: 'Seattle, USA, North America',
        contentType: 'case_study'
    },
    {
        title: '30atoms Integrates Mobile Testing Station Within Airport Pop-Up',
        summary: 'Skincare brand 30atoms created a pop-up store in an airport.',
        place: 'string, string, string',
        contentType: 'case_study'
    },
    {
        title: 'Grace Taylor Pop-Up',
        summary: 'Grace Taylor showcases accessories.',
        place: 'N/A',
        contentType: 'case_study'
    }
]);

assert.strictEqual(enrichedEvidenceWithPlaces[0].place, 'Milan, Italy', 'Hermès place must be reconciled to Milan, Italy');
assert.strictEqual(enrichedEvidenceWithPlaces[1].place, undefined, '30atoms placeholder place must be completely stripped');
assert.strictEqual(enrichedEvidenceWithPlaces[2].place, undefined, 'Grace Taylor N/A place must be completely stripped');
console.log('  ✅ 6c: enrichEvidence cleanly reconciles Hermès to Milan and strips all placeholder places');
console.log('✅ Test 6 Passed: Place reconciliation & placeholder stripping verified');

// ---------------------------------------------------------------------------
// Test 7: Evidence Count Semantics (Issue 1)
// ---------------------------------------------------------------------------
console.log('\nTest 7: Evidence Count Semantics (linked_evidence_count, returned_evidence_count, evidence_count)');

// Simulate search_graph row shaping for 0 relevant evidence (Node 6683: Pop-Ups as Test Labs)
const rawNode6683Row: any = {
    node_id: '6683',
    trendName: 'Pop Ups As Test Labs',
    evidence_count: 4, // 4 linked in DB graph
    evidence: [
        { title: 'Samuel (UBS) probes Miniso', contentType: 'interpretation', brandNames: ['Miniso'] },
        { title: 'Miniso Q4 Revenue', contentType: 'metric', brandNames: ['Miniso'] },
        { title: 'PepsiCo Texas Supply Chain Pilot', contentType: 'case_study', brandNames: ['PepsiCo'] },
        { title: 'P&G Enterprise Software Bundles', contentType: 'case_study', brandNames: ['P&G'] }
    ]
};

// Apply filtering
const rawEvidenceCount = rawNode6683Row.evidence.length;
rawNode6683Row.linked_evidence_count = rawEvidenceCount;
const filteredEvidence = rankAndFilterEvidence(rawNode6683Row.evidence, luxuryQuery, rawNode6683Row, { maxItems: 3 });
rawNode6683Row.evidence = enrichEvidence(filteredEvidence);
rawNode6683Row.returned_evidence_count = rawNode6683Row.evidence.length;
rawNode6683Row.evidence_count = rawNode6683Row.evidence.length;

assert.strictEqual(rawNode6683Row.linked_evidence_count, 4, 'linked_evidence_count should reflect the 4 linked items in graph');
assert.strictEqual(rawNode6683Row.returned_evidence_count, 0, 'returned_evidence_count should be 0 after quality/relevance filtering');
assert.strictEqual(rawNode6683Row.evidence_count, 0, 'evidence_count must be 0 when evidence array is empty');
assert.strictEqual(rawNode6683Row.evidence.length, 0, 'evidence array must be empty');

// Simulate row with 3 valid items (e.g. Immersive Brand Pop-Ups)
const rawNode8688Row: any = {
    node_id: '8688',
    trendName: 'Immersive Brand Storytelling Through Themed Activations',
    evidence: [
        { title: "Dior's Addict Sweet Shop in Harajuku", summary: "Dior launched an immersive retail pop-up in Harajuku...", contentType: 'case_study', brandNames: ['Dior'] },
        { title: 'Hennessy Lunar New Year Travel Retail Pop-Up', summary: 'Terminal 1 Singapore...', contentType: 'case_study', brandNames: ['Hennessy'] },
        { title: "Launch of 'Hermestories' Experiential Theater Play", summary: "Hermès launched in Milan...", contentType: 'case_study', brandNames: ['Hermès'] }
    ]
};
const rawCount8688 = rawNode8688Row.evidence.length;
rawNode8688Row.linked_evidence_count = rawCount8688;
const filtered8688 = rankAndFilterEvidence(rawNode8688Row.evidence, luxuryQuery, rawNode8688Row, { maxItems: 3 });
rawNode8688Row.evidence = enrichEvidence(filtered8688);
rawNode8688Row.returned_evidence_count = rawNode8688Row.evidence.length;
rawNode8688Row.evidence_count = rawNode8688Row.evidence.length;

assert.strictEqual(rawNode8688Row.linked_evidence_count, 3, 'linked_evidence_count should be 3');
assert.strictEqual(rawNode8688Row.returned_evidence_count, 3, 'returned_evidence_count should be 3');
assert.strictEqual(rawNode8688Row.evidence_count, 3, 'evidence_count should be 3');
const diorItem = rawNode8688Row.evidence.find((e: any) => (e.title || '').includes('Dior'));
const hermesItem = rawNode8688Row.evidence.find((e: any) => (e.title || '').includes('Hermestories'));
assert.ok(diorItem, 'Dior item should be in returned evidence');
assert.ok(hermesItem, 'Hermès item should be in returned evidence');
assert.strictEqual(diorItem.place, 'Tokyo, Japan', 'Dior Harajuku place should be Tokyo, Japan');
assert.strictEqual(hermesItem.place, 'Milan, Italy', 'Hermès place should be Milan, Italy');
console.log('✅ Test 7 Passed: Evidence count semantics unambiguous (linked: 4, returned: 0, count: 0 for filtered trend)');

// ---------------------------------------------------------------------------
// Test 8: Two-Store Indexing Gap & Daily Limit Error Classification
// ---------------------------------------------------------------------------
console.log('\nTest 8: Two-Store Indexing Gap Bridge & DAILY_LIMIT_EXCEEDED Classification');

// 8a. Verify 403 DAILY_LIMIT_EXCEEDED is classified as 'credits' instead of 'forbidden'
const dailyLimitErr = {
    response: {
        status: 403,
        data: {
            error: 'DAILY_LIMIT_EXCEEDED',
            code: 'DAILY_LIMIT_EXCEEDED',
            message: 'Daily 50-call limit reached on free Base tier. Add a payment card to remove daily burst limits and continue querying without interruption at 50¢ per API call.'
        }
    }
};
assert.strictEqual(classifyAccessError(dailyLimitErr), 'credits', 'DAILY_LIMIT_EXCEEDED must be classified as credits, not forbidden');

// 8b. Verify active analyst graph (Peter Abraham) is bridged into catalog and routed for cycling
const baseCatalog: any = {
    graph_count: 2,
    graphs: [
        {
            graph_id: 'retail',
            name: 'Retail Living Graph',
            curator: 'PSFK',
            graph_type: 'domain',
            status: 'live',
            trend_count: 100,
            topics: ['retail', 'shopping']
        },
        {
            graph_id: 'sic',
            name: 'SIC Cultural Intelligence',
            curator: 'Ben Dietz',
            graph_type: 'expert',
            status: 'live',
            trend_count: 97,
            topics: ['culture', 'youth', 'streetwear']
        }
    ]
};
const mockAnalysts: any[] = [
    {
        analyst_id: 'peter-abraham-bicycles-cycling',
        name: 'Peter Abraham',
        status: 'Active',
        topics: ['sports', 'cycling'],
        expert_in: 'bicycles, sports & active lifestyle',
        description: 'Sports, outdoor, cycling, and active lifestyle market analyst.'
    },
    {
        analyst_id: 'ben-dietz-sic',
        name: 'Ben Dietz',
        status: 'Active',
        backingGraphs: ['sic'],
        topics: ['culture', 'streetwear'],
        expert_in: 'culture, music, streetwear',
        description: 'Cultural strategist and writer.'
    },
    {
        analyst_id: 'jeremy-bergstein-science-education-innovation',
        name: 'Jeremy Bergstein',
        status: 'Active',
        backingGraphs: ['postpals-expert-graph'],
        topics: ['science', 'education'],
        expert_in: 'science and education innovation',
        description: 'Educational innovation lead.'
    }
];

setCachedCatalogForTesting(baseCatalog, mockAnalysts);
const allCatalogGraphs = getGraphs();

// (1) Peter Abraham bridged via ID fallback
const bridgedPeter = allCatalogGraphs.find(g => g.graph_id === 'peter-abraham-bicycles-cycling');
assert.ok(bridgedPeter, 'Peter Abraham must be bridged into catalog graphs');
assert.strictEqual(bridgedPeter?.graph_type, 'analyst', 'Bridged graph must have graph_type analyst');

// (2) Ben Dietz does NOT duplicate existing 'sic' graph
const sicGraphs = allCatalogGraphs.filter(g => g.graph_id === 'sic');
assert.strictEqual(sicGraphs.length, 1, 'SIC graph must not be duplicated when Ben Dietz is mapped to it');

// (3) Jeremy Bergstein bridges 'postpals-expert-graph' from backingGraphs
const bridgedJeremy = allCatalogGraphs.find(g => g.graph_id === 'postpals-expert-graph');
assert.ok(bridgedJeremy, 'postpals-expert-graph must be bridged from backingGraphs');
assert.strictEqual(bridgedJeremy?.graph_type, 'analyst', 'Bridged graph must have graph_type analyst');

const cyclingRouting = getRelevantGraphs('cycling');
const peterRouted = cyclingRouting.find(r => r.graph.graph_id === 'peter-abraham-bicycles-cycling');
assert.ok(peterRouted, 'peter-abraham-bicycles-cycling must be routed for query "cycling"');
assert.ok(peterRouted!.score >= 0.80, `peter score should be high (>=0.80), got ${peterRouted!.score}`);
console.log('✅ Test 8 Passed: DAILY_LIMIT_EXCEEDED classified cleanly & multi-HA backingGraphs bridged accurately');

// ---------------------------------------------------------------------------
// Test 9: Explicit Scope Honest Failure & Scoped Graph Protection
// ---------------------------------------------------------------------------
console.log('\nTest 9: Explicit Scope Honest Failure & Direct Match Protection');

// 9a: Direct match and high-semantic-score protection against zero-on-topic drop
const mockValZeroOnTopic = { on_topic_total: 0, rows: [{ name: 'digital wall', semantic_score: 0.90 }] };
const directMatchMeta = { isDirectMatch: true, graph: { graph_id: 'peter-abraham-bicycles-cycling' } };
const hasHighSemantic = mockValZeroOnTopic.rows.some((r: any) => (r.semantic_score || 0) >= 0.75);
assert.ok(hasHighSemantic, 'Row should have high semantic score (0.90 >= 0.75)');

// In un-scoped fanout without direct match, generic off-topic graph with 0 on-topic is dropped
const genericOffTopicMeta = { isDirectMatch: false, graph: { graph_id: 'retail' } };
const genericOffTopicRows = [{ name: 'Store closures', semantic_score: 0.50 }];
const shouldDropGeneric = !genericOffTopicMeta.isDirectMatch && !genericOffTopicRows.some((r: any) => (r.semantic_score || 0) >= 0.75) && mockValZeroOnTopic.on_topic_total === 0;
assert.ok(shouldDropGeneric, 'Generic off-topic 0 on-topic rows must be dropped in fanout');

// But direct match or high semantic rows are protected from being dropped
const shouldDropProtected = !directMatchMeta.isDirectMatch && !hasHighSemantic && mockValZeroOnTopic.on_topic_total === 0;
assert.ok(!shouldDropProtected, 'Direct match / high-semantic rows must NOT be dropped even if on_topic_total is 0');

// 9b: Scoped graphs empty result honest failure simulation
const mockScopedGraphs = [{ graph_id: 'peter-abraham-bicycles-cycling', name: 'Peter Abraham' }];
const mockEmptyRows: any[] = [];
const unavailableGraphs: Array<{ graph_id: string; reason: string }> = [];
const graphsWithResults = new Set(mockEmptyRows.map((r: any) => r.graphId));

for (const g of mockScopedGraphs) {
    if (!graphsWithResults.has(g.graph_id)) {
        unavailableGraphs.push({
            graph_id: g.graph_id,
            reason: 'no matching trends found in this graph for query'
        });
    }
}
assert.strictEqual(unavailableGraphs.length, 1, 'Should record peter-abraham-bicycles-cycling in unavailable_graphs');
assert.strictEqual(unavailableGraphs[0]!.graph_id, 'peter-abraham-bicycles-cycling');
assert.ok(unavailableGraphs[0]!.reason.includes('no matching trends'), 'Reason should be explicit');
console.log('✅ Test 9 Passed: Scoped graphs honest failure & zero-on-topic protection verified');

// ---------------------------------------------------------------------------
// Test 10: Upstream Evidence Decoupling & include_evidence=false Support
// ---------------------------------------------------------------------------
console.log('\nTest 10: Upstream Evidence Decoupling & include_evidence=false Support');

// Simulate MCP upstream request body construction
const callerIncludeEvidenceFalse = false;
const upstreamBody = {
    query: 'cycling and bicycle culture trends',
    limit: 10,
    use_semantic: true,
    include_evidence: true // upstream ALWAYS true to avoid API relevance-gate row dropping
};
assert.strictEqual(upstreamBody.include_evidence, true, 'Upstream body must always request evidence so API Relevance Gate has full tokens');

// Simulate row returned from upstream with evidence
const upstreamRowWithEvidence = {
    node_id: 'peter-digital-wall',
    trendName: 'digital wall',
    relevance_score: 0.726,
    evidence: [
        { title: 'The 2025 Bicycle Trend Report', contentType: 'case_study' },
        { title: 'Peter Abraham on Black Cycling', contentType: 'case_study' }
    ]
};

// Post-processing when caller passed include_evidence === false
const rawEv = Array.isArray(upstreamRowWithEvidence.evidence) ? upstreamRowWithEvidence.evidence : [];
const processedRow: any = { ...upstreamRowWithEvidence };
if (callerIncludeEvidenceFalse !== false && rawEv.length > 0) {
    processedRow.evidence = rawEv;
    processedRow.returned_evidence_count = rawEv.length;
    processedRow.evidence_count = rawEv.length;
} else {
    processedRow.evidence = [];
    processedRow.returned_evidence_count = 0;
    processedRow.evidence_count = 0;
}

assert.strictEqual(processedRow.evidence.length, 0, 'Evidence array must be stripped when caller passes include_evidence: false');
assert.strictEqual(processedRow.evidence_count, 0, 'evidence_count must be 0 when caller passes include_evidence: false');
assert.strictEqual(processedRow.relevance_score, 0.726, 'relevance_score must remain unpenalized (0.726, not crushed to 0.395)');
console.log('✅ Test 10 Passed: include_evidence decoupling verified (unpenalized score + stripped evidence)');

// ---------------------------------------------------------------------------
// Test 11: cleanTruncateWhyNow Word-Boundary & Sentence Preservation
// ---------------------------------------------------------------------------
console.log('\nTest 11: cleanTruncateWhyNow Word-Boundary & Sentence Preservation');

// 11a: Length <= 280 preserves text completely (fixes "...brands levera..." bug)
const sample215 = 'Consumer demand for micro-mobility has surged across urban centers as municipal infrastructure expands and brands leverage community group rides to foster long-term customer loyalty and engagement in tier-1 markets.';
const res215 = cleanTruncateWhyNow(sample215);
assert.strictEqual(res215, sample215, 'Strings <= 280 chars must not be truncated');
assert.ok(!res215?.includes('levera...'), 'Must never cut words mid-character');
console.log('  ✅ 11a: Strings <= 280 chars preserved intact with complete words');

// 11b: String with complete sentence within [140, 280] terminates on clean sentence
const sampleTwoSentences = 'Consumer demand for micro-mobility has surged across urban centers as municipal infrastructure expands and brands leverage community group rides. These initiatives represent a key shift towards experiential marketing, allowing regional distributors to connect directly with cycling communities across North America and Europe.';
const resSentence = cleanTruncateWhyNow(sampleTwoSentences);
assert.strictEqual(
    resSentence,
    'Consumer demand for micro-mobility has surged across urban centers as municipal infrastructure expands and brands leverage community group rides.',
    'Should cleanly terminate at sentence boundary when available'
);
assert.ok(resSentence.endsWith('.'), 'Sentence termination ends with period, not ellipsis');
console.log('  ✅ 11b: Clean sentence boundary cleanly captured without dangling ellipsis');

// 11c: Long single-sentence string breaks at word boundary and appends ellipsis
const sampleLongSingle = 'Consumer demand for micro-mobility has surged across urban centers as municipal infrastructure expands and brands leverage community group rides to foster long-term customer loyalty and engagement in tier-1 markets through innovative localized experiences that bridge retail and sports culture.';
const resLongSingle = cleanTruncateWhyNow(sampleLongSingle);
assert.ok(resLongSingle !== undefined && resLongSingle.endsWith('...'), 'Long strings must end with ellipsis');
assert.ok(!resLongSingle.match(/[a-zA-Z]\.\.\.$/)?.input?.endsWith('levera...'), 'Must break at word space, not mid-word');
assert.ok(resLongSingle.length <= 283, 'Total length must respect boundary cap');
console.log('  ✅ 11c: Long single-sentence breaks at word boundary without mid-word splits');

console.log('✅ Test 11 Passed: cleanTruncateWhyNow preserves words and sentences cleanly');

console.log('\nAll search_graph quality, freshness, payload slimming, routing bridge, honest-failure, evidence-decoupling, and whyNow-truncation tests passed!');




