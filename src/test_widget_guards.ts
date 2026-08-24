import assert from 'node:assert';
import {
    isRowBrandEligible,
    buildPublisherExclusionSet,
    extractCleanRowBrands,
    rowHasDirectTokenMatch,
    specificQueryTokens,
    rowMatchesQueryTokens,
    rowScore,
    TIER_NOMINAL_SCORE,
    resolveRowTier
} from './coverageRelevance.js';
import { renderSearchWidget } from './searchTemplate.js';
import { setCachedCatalogForTesting } from './catalogCache.js';

console.log('--- Running Widget Guards & Niche Ranking Unit Tests ---');

// Mock graphs
const mockGraphs: any[] = [
    {
        graph_id: 'retail',
        name: 'Retail Strategy & Innovation',
        graph_type: 'domain',
        status: 'live',
        curator: 'PSFK',
        company: 'PSFK',
        topics: ['retail', 'commerce', 'loyalty'],
        trend_count: 150,
        evidence_count: 600,
    },
    {
        graph_id: 'culture',
        name: 'Cultural Strategy',
        graph_type: 'expert',
        status: 'live',
        curator: 'Ben Dietz',
        company: '[SIC] Weekly',
        topics: ['culture', 'marketing'],
        trend_count: 80,
        evidence_count: 300,
    }
];

setCachedCatalogForTesting({ version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphs.length, graphs: mockGraphs as any }, []);

// ── Test 1: Brand Guard Helper (Shared Logic) ──
console.log('\n[Test 1] Brand Guard Helper (Mega-trend suppression & publisher filtering)');
{
    // Mega-trend with brand_count > 30
    const megaTrendRow = {
        trendName: 'Experiential Loyalty',
        brand_count: 734,
        brandNames: ['PlayStation', 'Hermès', 'Louis Vuitton', 'Coach', 'Nike'],
    };
    assert.strictEqual(isRowBrandEligible(megaTrendRow), false, 'Row with brand_count > 30 should not be brand-eligible');
    assert.deepStrictEqual(extractCleanRowBrands(megaTrendRow), [], 'Extracting brands from mega-trend should return empty array');

    // Mega-trend with brandCount > 30
    const megaTrendRowCamel = {
        trendName: 'Experiential Loyalty',
        brandCount: 50,
        brandNames: ['PlayStation', 'Hermès'],
    };
    assert.strictEqual(isRowBrandEligible(megaTrendRowCamel), false, 'Row with brandCount > 30 should not be brand-eligible');

    // Mega-trend with brandNames.length >= 10 when brand_count absent
    const rosterRow = {
        trendName: 'Broad Retail Trend',
        brandNames: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
    };
    assert.strictEqual(isRowBrandEligible(rosterRow), false, 'Row with 10+ brandNames without brand_count should not be brand-eligible');

    // Eligible niche row
    const nicheRow = {
        trendName: 'Collector Booster Packs',
        brand_count: 3,
        brandNames: ['Topps', 'Fanatics', 'Pokemon', 'PSFK'],
    };
    assert.strictEqual(isRowBrandEligible(nicheRow), true, 'Row with brand_count <= 30 should be brand-eligible');

    const publisherTokens = buildPublisherExclusionSet(['retail'], mockGraphs, [nicheRow]);
    const cleanBrands = extractCleanRowBrands(nicheRow, publisherTokens, 4);
    assert.deepStrictEqual(cleanBrands, ['Topps', 'Fanatics', 'Pokemon'], 'Should extract clean brands and filter out publisher token PSFK');
    console.log('✅ Test 1 Passed: Brand guard correctly suppresses mega-trend rosters and filters publisher tokens.');
}

// ── Test 2: Stat Card Zero-Value Clean Omission & Sources Reconciliation ──
console.log('\n[Test 2] Stat Card Emission Guard & Sources Reconciliation');
(async () => {
    const testRows = [
        { trendName: 'Signal A', signal_score: 80, graphName: 'Retail Strategy & Innovation', brand_count: 50, brandNames: ['PlayStation'] },
        { trendName: 'Signal B', signal_score: 75, graphName: 'Retail Strategy & Innovation', brand_count: 60, brandNames: ['Hermès'] },
        { trendName: 'Signal C', signal_score: 70, graphName: 'Retail Strategy & Innovation', brand_count: 70, brandNames: ['Gucci'] },
    ];

    // Case A: Zero-value Census data ("Gasoline Stations $0.0B")
    const zeroCensus = {
        snapshot: {
            total_retail: { value: 0, mom_change: 0 },
            subcategories: [
                { name: 'Gasoline Stations', value: 0, mom_change: 0 }
            ]
        }
    };

    const resA = await renderSearchWidget(
        { rows: testRows, _routed_graphs: ['retail'] },
        'trading cards',
        'Retail Strategy & Innovation',
        { census_retail: zeroCensus }
    );

    // Assert Market section is completely omitted
    assert.ok(!resA.widget_html.includes('Gasoline Stations'), 'Widget HTML should not render zero-value Gasoline Stations card');
    assert.ok(!resA.widget_html.includes('<div class="sec">Market</div>'), 'Market section should be clean-omitted when all values are 0');
    assert.ok(!resA.widget_html.includes('Census Bureau'), 'Sources footer should NOT include Census Bureau when Market section is omitted');

    // Assert Companies section is completely omitted because all rows failed the brand guard
    assert.ok(!resA.widget_html.includes('<div class="sec">Companies</div>'), 'Companies section should be clean-omitted when no brands pass guard');
    assert.ok(!resA.widget_html.includes('PlayStation'), 'No PlayStation brand chip should appear in widget cards or companies section');

    // Case B: Valid non-zero Census data
    const validCensus = {
        snapshot: {
            total_retail: { value: 700000000000, mom_change: 1.2 },
            subcategories: [
                { name: 'Hobby & Collectibles', value: 15000000000, mom_change: 3.4 }
            ]
        }
    };

    const resB = await renderSearchWidget(
        { rows: testRows, _routed_graphs: ['retail'] },
        'trading cards',
        'Retail Strategy & Innovation',
        { census_retail: validCensus }
    );

    assert.ok(resB.widget_html.includes('US retail sales — Census Bureau'), 'Valid Census data should render Census card');
    assert.ok(resB.widget_html.includes('$700.0B'), 'Valid Census total should render $700.0B');
    assert.ok(resB.widget_html.includes('Census Bureau'), 'Sources footer SHOULD include Census Bureau when rendered');
    console.log('✅ Test 2 Passed: Stat cards and Market section cleanly omit zero values and sources footer aligns.');
})();

// ── Test 3: Niche-Query Direct Token Match Reranking Tier ──
console.log('\n[Test 3] Niche-Query Direct Token Match Reranking Tier');
{
    const query = 'collectible trading cards booster mechanics';
    const tokens = specificQueryTokens(query);

    const genericMegaTrend1 = {
        trendName: 'Experiential Loyalty',
        trendSlug: 'experiential-loyalty',
        sectorNames: 'Retail|Customer Loyalty',
        relevance_score: 1.364,
        signal_score: 95,
        brand_count: 734,
    };
    const genericMegaTrend2 = {
        trendName: 'Retail as a Destination',
        trendSlug: 'retail-as-destination',
        sectorNames: 'Retail|Physical Stores',
        relevance_score: 1.200,
        signal_score: 90,
        brand_count: 400,
    };
    const nicheTrend = {
        trendName: 'Mass-Market Brands Ship Premium Collector Editions with Booster/Variation Mechanics',
        trendSlug: 'mass-market-brands-collector-editions-booster-mechanics',
        sectorNames: 'Collectibles|Toys & Hobby',
        relevance_score: 0.644,
        signal_score: 75,
        brand_count: 2,
        brandNames: ['Topps', 'Fanatics'],
    };

    assert.strictEqual(rowHasDirectTokenMatch(nicheTrend, tokens), true, 'Niche trend should direct-match query tokens (collector, booster, collectibles, cards)');
    assert.strictEqual(rowHasDirectTokenMatch(genericMegaTrend1, tokens), false, 'Generic mega-trend 1 should NOT direct-match query tokens');
    assert.strictEqual(rowHasDirectTokenMatch(genericMegaTrend2, tokens), false, 'Generic mega-trend 2 should NOT direct-match query tokens');

    const rows = [genericMegaTrend1, genericMegaTrend2, nicheTrend];

    const isRowDirectMatch = (row: any) => rowHasDirectTokenMatch(row, tokens);
    const isRowOnTopic = (row: any) =>
        rowMatchesQueryTokens(row, tokens, mockGraphs) ||
        (rowScore(row) >= 0.75 * (TIER_NOMINAL_SCORE[resolveRowTier(row, mockGraphs, mockGraphs)] ?? 0.8));

    rows.sort((a, b) => {
        const directA = isRowDirectMatch(a) ? 1 : 0;
        const directB = isRowDirectMatch(b) ? 1 : 0;
        if (directA !== directB) return directB - directA;

        const onTopicA = isRowOnTopic(a) ? 1 : 0;
        const onTopicB = isRowOnTopic(b) ? 1 : 0;
        if (onTopicA !== onTopicB) return onTopicB - onTopicA;

        const relA = a.relevance_score || 0;
        const relB = b.relevance_score || 0;
        if (Math.abs(relB - relA) > 0.05) return relB - relA;

        return (b.signal_score || 0) - (a.signal_score || 0);
    });

    assert.strictEqual(rows[0]?.trendName, nicheTrend.trendName, 'Niche trend MUST rank #1 above high-scoring generic mega-trends');
    console.log('✅ Test 3 Passed: Direct token match tier places niche trend at rank #1.');
}

// ── Test 4: Generic Query Regression Check ──
console.log('\n[Test 4] Generic Query Regression Check (Broad query preserves existing order)');
{
    const broadQuery = 'retail trends 2026';
    const tokens = specificQueryTokens(broadQuery);

    const trendA = {
        trendName: 'Unified Commerce Orchestration',
        trendSlug: 'unified-commerce-orchestration',
        sectorNames: 'Retail|Technology',
        relevance_score: 1.100,
        signal_score: 85,
    };
    const trendB = {
        trendName: 'Autonomous Checkout Solutions',
        trendSlug: 'autonomous-checkout-solutions',
        sectorNames: 'Retail|In-Store Tech',
        relevance_score: 0.950,
        signal_score: 80,
    };

    const rows = [trendB, trendA];

    const isRowDirectMatch = (row: any) => rowHasDirectTokenMatch(row, tokens);
    const isRowOnTopic = (row: any) =>
        rowMatchesQueryTokens(row, tokens, mockGraphs) ||
        (rowScore(row) >= 0.75 * (TIER_NOMINAL_SCORE[resolveRowTier(row, mockGraphs, mockGraphs)] ?? 0.8));

    rows.sort((a, b) => {
        const directA = isRowDirectMatch(a) ? 1 : 0;
        const directB = isRowDirectMatch(b) ? 1 : 0;
        if (directA !== directB) return directB - directA;

        const onTopicA = isRowOnTopic(a) ? 1 : 0;
        const onTopicB = isRowOnTopic(b) ? 1 : 0;
        if (onTopicA !== onTopicB) return onTopicB - onTopicA;

        const relA = a.relevance_score || 0;
        const relB = b.relevance_score || 0;
        if (Math.abs(relB - relA) > 0.05) return relB - relA;

        return (b.signal_score || 0) - (a.signal_score || 0);
    });

    assert.strictEqual(rows[0]?.trendName, trendA.trendName, 'Trend with higher relevance score must stay #1 for generic queries');
    console.log('✅ Test 4 Passed: Broad query ranking behaves identically without regressions.');
}
