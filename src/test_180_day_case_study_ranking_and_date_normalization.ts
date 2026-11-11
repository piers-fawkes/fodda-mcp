import assert from 'assert';
import { enrichEvidence, rankAndFilterEvidence, reconcileFreshnessDays, resolveItemDate, MASS_MARKETPLACE_BRANDS, MASS_BUDGET_BRANDS } from './enrichment.js';
import { generateNextMoves } from './coverageRelevance.js';

console.log('--- Running 180-Day-First Case Study Ranking & Date Normalization Suite ---\n');

const NOW_NOV_2026 = new Date('2026-11-10T19:00:00.000Z').getTime();

// ---------------------------------------------------------------------------
// Test 1: published_at property normalization and citation date rendering
// ---------------------------------------------------------------------------
console.log('Test 1: published_at property normalization & human-readable citation');
{
    const rawArticle = {
        title: 'Victoria Beckham Opens Multi-Room Flagship on Mercer Street',
        summary: 'Victoria Beckham opened a new luxury flagship boutique in SoHo featuring curated rooms and ornate interior architecture.',
        contentType: 'case_study',
        sourceUrl: 'https://www.businessoffashion.com/articles/luxury/victoria-beckham-mercer-street',
        publication: 'Business of Fashion',
        published_at: '2026-09-04T09:06:53.000Z',
        brandNames: ['Victoria Beckham']
    };

    const resolved = resolveItemDate(rawArticle, NOW_NOV_2026);
    assert.strictEqual(resolved.isoDate, '2026-09-04T09:06:53.000Z', 'resolveItemDate must extract ISO string from published_at');
    assert.strictEqual(resolved.monthYear, 'September 2026', 'resolveItemDate must format Month YYYY');
    assert.ok(resolved.daysAgo !== undefined && resolved.daysAgo < 100, `daysAgo should be ~67 days, got ${resolved.daysAgo}`);

    const [enriched] = enrichEvidence([rawArticle], { now: NOW_NOV_2026 });
    assert.strictEqual(enriched.publishedAt, '2026-09-04T09:06:53.000Z', 'enrichEvidence must normalize published_at to camelCase publishedAt');
    assert.ok(enriched.short_citation.includes('September 2026'), `short_citation must include "September 2026", got "${enriched.short_citation}"`);
    assert.ok(enriched.formatted_citation.includes('September 2026'), `formatted_citation must include "September 2026", got "${enriched.formatted_citation}"`);

    // Verify published_date fallback
    const rawDateOnly = {
        title: 'Tuckernuck Opens First Permanent NYC Boutique',
        summary: 'Tuckernuck opened an intimate multi-room townhouse store in New York City with ornate classic decor.',
        contentType: 'case_study',
        sourceUrl: 'https://wwd.com/fashion-news/retail/tuckernuck-nyc-boutique',
        publication: 'WWD',
        published_date: '2026-02-18',
        brandNames: ['Tuckernuck']
    };
    const [enrichedDateOnly] = enrichEvidence([rawDateOnly], { now: NOW_NOV_2026 });
    assert.ok(enrichedDateOnly.publishedAt.startsWith('2026-02-18'), 'enrichEvidence must normalize published_date to publishedAt');
    assert.ok(enrichedDateOnly.short_citation.includes('February 2026'), `short_citation must include "February 2026", got "${enrichedDateOnly.short_citation}"`);

    // Verify reconcileFreshnessDays with published_at
    const rowWithPublishedAt = {
        title: 'Luxury Retail Experience',
        published_at: '2026-09-04T09:06:53.000Z'
    };
    const days = reconcileFreshnessDays(rowWithPublishedAt, NOW_NOV_2026);
    assert.ok(days !== null && days >= 66 && days <= 68, `reconcileFreshnessDays should return ~67 days, got ${days}`);

    console.log('✅ Test 1 Passed: Article snake_case published_at normalized and Month YYYY added to citations');
}

// ---------------------------------------------------------------------------
// Test 2: Standard discovery query with 3+ <180d case studies returns recent first
// ---------------------------------------------------------------------------
console.log('\nTest 2: Standard discovery query with 3+ <180d case studies returns recent first');
{
    const items = [
        {
            title: 'Store Concept A from 2025 (Archive)',
            summary: 'Retail store discovery format from early 2025.',
            contentType: 'case_study',
            published_at: '2025-06-01T00:00:00.000Z' // ~527 days ago (>180d)
        },
        {
            title: 'Store Concept B from 2025 (Archive)',
            summary: 'Retail store discovery format from late 2025.',
            contentType: 'case_study',
            published_at: '2025-10-15T00:00:00.000Z' // ~391 days ago (>180d)
        },
        {
            title: 'Store Concept C from August 2026 (Recent)',
            summary: 'Retail store discovery format from August 2026.',
            contentType: 'case_study',
            published_at: '2026-08-10T00:00:00.000Z' // ~92 days ago (<=180d)
        },
        {
            title: 'Store Concept D from September 2026 (Recent)',
            summary: 'Retail store discovery format from September 2026.',
            contentType: 'case_study',
            published_at: '2026-09-20T00:00:00.000Z' // ~51 days ago (<=180d)
        },
        {
            title: 'Store Concept E from October 2026 (Recent)',
            summary: 'Retail store discovery format from October 2026.',
            contentType: 'case_study',
            published_at: '2026-10-05T00:00:00.000Z' // ~36 days ago (<=180d)
        }
    ];

    const ranked = rankAndFilterEvidence(items, 'retail store discovery format', undefined, { maxItems: 3, now: NOW_NOV_2026 });
    assert.strictEqual(ranked.length, 3, 'Should return exactly 3 items');
    const returnedTitles = ranked.map(e => e.title);

    assert.ok(returnedTitles.includes('Store Concept C from August 2026 (Recent)'), 'Must include Concept C');
    assert.ok(returnedTitles.includes('Store Concept D from September 2026 (Recent)'), 'Must include Concept D');
    assert.ok(returnedTitles.includes('Store Concept E from October 2026 (Recent)'), 'Must include Concept E');
    assert.ok(!returnedTitles.some(t => t.includes('Archive')), 'Older archive items must not displace recent items when >=3 recent items exist');

    console.log('✅ Test 2 Passed: 3+ <180d case studies returned first without older archive pollution');
}

// ---------------------------------------------------------------------------
// Test 3: Standard query auto-widens to older archive when <3 recent case studies exist
// ---------------------------------------------------------------------------
console.log('\nTest 3: Standard query auto-widens to older archive when <3 recent items exist');
{
    const items = [
        {
            title: 'Victoria Beckham Mercer Street Luxury Flagship Boutique',
            summary: 'Victoria Beckham opened a luxury flagship boutique in SoHo New York with ornate rooms.',
            contentType: 'case_study',
            brandNames: ['Victoria Beckham'],
            published_at: '2026-09-04T09:06:53.000Z' // ~67 days ago (<=180d)
        },
        {
            title: 'Tuckernuck Intimate Multi-Room Townhouse Store in New York',
            summary: 'Tuckernuck opened a permanent boutique featuring smallish rooms that are ornately decorated.',
            contentType: 'case_study',
            brandNames: ['Tuckernuck'],
            published_at: '2026-02-18T00:00:00.000Z' // ~265 days ago (>180d)
        }
    ];

    const query = 'retail store concept with ornately decorated rooms in new york';
    const ranked = rankAndFilterEvidence(items, query, undefined, { maxItems: 3, now: NOW_NOV_2026 });

    assert.strictEqual(ranked.length, 2, 'Both items must be returned via automatic backfill');
    assert.strictEqual(ranked[0].title, 'Victoria Beckham Mercer Street Luxury Flagship Boutique', 'Recent item (<180d) ranked first');
    assert.strictEqual(ranked[1].title, 'Tuckernuck Intimate Multi-Room Townhouse Store in New York', 'Older item (~265d) auto-backfilled into remaining slot');

    console.log('✅ Test 3 Passed: 1 recent (<180d) + 1 older (265d) returned both via automatic backfill');
}

// ---------------------------------------------------------------------------
// Test 4: Recall query preserves topical relevance over recency
// ---------------------------------------------------------------------------
console.log('\nTest 4: Recall query preserves exact topical match over weaker recent item');
{
    const items = [
        {
            title: 'Tuckernuck Intimate Multi-Room Townhouse Store in New York',
            summary: 'In a past newsletter PSFK featured Tuckernuck, a store in New York with smallish rooms that was ornately decorated.',
            contentType: 'case_study',
            brandNames: ['Tuckernuck'],
            published_at: '2026-02-18T00:00:00.000Z' // ~265 days ago (>180d)
        },
        {
            title: 'Generic Retail Chain Expands Store Footprint',
            summary: 'A fast retail chain opened standard store units.',
            contentType: 'case_study',
            brandNames: ['SomeBrand'],
            published_at: '2026-10-25T00:00:00.000Z' // ~16 days ago (<=180d)
        }
    ];

    const recallQuery = 'in one newsletter you featured this really cool Retail store in New York... smallish rooms that was ornately decorated do you remember';
    const ranked = rankAndFilterEvidence(items, recallQuery, undefined, { maxItems: 3, now: NOW_NOV_2026 });

    assert.strictEqual(ranked[0].title, 'Tuckernuck Intimate Multi-Room Townhouse Store in New York', 'Tuckernuck must rank #1 on recall query despite being >180d old');

    console.log('✅ Test 4 Passed: Recall query correctly ranks older exact match ahead of weaker recent match');
}

// ---------------------------------------------------------------------------
// Test 5: Luxury boutique query hygiene suppresses mass marketplaces (Amazon) in specific.brands
// ---------------------------------------------------------------------------
console.log('\nTest 5: Luxury boutique query hygiene suppresses Amazon from next_moves.specific.brands');
{
    const mockCatalog: any[] = [
        { graph_id: 'retail', name: 'PSFK Retail', graph_type: 'domain', status: 'live' },
        { graph_id: 'fashion', name: 'PSFK Fashion', graph_type: 'domain', status: 'live' },
        { graph_id: 'mckinsey-agentic-commerce-trends', name: 'McKinsey Agentic Commerce', graph_type: 'report', status: 'live' }
    ];

    const rows: any[] = [
        // Row 0: Top ranked luxury boutique (with selected evidence)
        {
            trendName: 'Residential-Inspired Multi-Room Retail Salons',
            summary: 'Luxury brands design flagship boutiques as intimate multi-room residences with ornate decor.',
            brandNames: ['Tuckernuck'],
            graphId: 'retail',
            relevanceScore: 2.1,
            evidence: [
                {
                    title: 'Tuckernuck Multi-Room Townhouse Boutique',
                    summary: 'Smallish rooms with ornate furnishings.',
                    brandNames: ['Tuckernuck'],
                    published_at: '2026-02-18T00:00:00.000Z'
                }
            ]
        },
        // Row 1: Second top ranked luxury boutique (with selected evidence)
        {
            trendName: 'Curated Architecture in Fashion Flagships',
            summary: 'High-end designer boutiques create ornate architectural spaces.',
            brandNames: ['Victoria Beckham'],
            graphId: 'fashion',
            relevanceScore: 1.95,
            evidence: [
                {
                    title: 'Victoria Beckham Mercer Street Store',
                    summary: 'Designer luxury boutique in SoHo.',
                    brandNames: ['Victoria Beckham'],
                    published_at: '2026-09-04T09:06:53.000Z'
                }
            ]
        },
        // Lower ranked / adjacent report rows from McKinsey mention Amazon
        {
            trendName: 'Agentic Commerce Shopping Infrastructure',
            summary: 'Mass marketplace platforms test autonomous shopping agents and delivery networks.',
            brandNames: ['Amazon', 'Walmart', 'Temu'],
            graphId: 'mckinsey-agentic-commerce-trends',
            relevanceScore: 0.82
        }
    ];

    const luxuryQuery = 'in one newsletter you featured this really cool Retail store in New York... smallish rooms that was ornately decorated';
    const nextMoves = await generateNextMoves(
        rows,
        luxuryQuery,
        mockCatalog,
        'ok',
        2,
        undefined,
        mockCatalog,
        []
    );

    const brands = nextMoves.specific?.brands || [];
    assert.ok(!brands.includes('Amazon'), `Amazon must NOT appear in specific.brands on luxury boutique query, got: ${JSON.stringify(brands)}`);
    assert.ok(!brands.includes('Walmart'), `Walmart must NOT appear in specific.brands on luxury boutique query, got: ${JSON.stringify(brands)}`);
    assert.ok(!brands.includes('Temu'), `Temu must NOT appear in specific.brands on luxury boutique query, got: ${JSON.stringify(brands)}`);
    assert.ok(brands.includes('Tuckernuck') || brands.includes('Victoria Beckham'), `Specific brands should feature Tuckernuck or Victoria Beckham, got: ${JSON.stringify(brands)}`);

    console.log(`✅ Test 5 Passed: specific.brands clean (${JSON.stringify(brands)}), Amazon/Walmart/Temu successfully excluded`);
}

console.log('\n--- All 180-Day Case Study Ranking & Date Normalization tests passed cleanly! ---');
