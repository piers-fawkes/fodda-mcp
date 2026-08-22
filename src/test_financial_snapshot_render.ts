import assert from 'assert';
import { renderBrandWidget } from './brandTemplate.js';

async function runTests() {
    console.log('=== Test 1: Public Company (Microchip Technology / NASDAQ:MCHP) with full market_data ===');
    const publicProfile = {
        brand: 'Microchip Technology',
        trend_footprint: [
            {
                trend_name: 'Edge AI Microcontrollers',
                trend_description: 'Low-power microcontrollers optimized for on-device machine learning inference.',
                graphName: 'Semiconductors 2026',
                evidence_count: 5,
                signal_score: 82,
                lifecycle: 'building',
            }
        ],
        evidence_items: [
            {
                title: 'Microchip Announces Next-Gen MCU',
                excerpt: 'Microchip Technology unveiled its latest 32-bit microcontroller line.',
                published_at: '2026-07-15T00:00:00.000Z',
                category: 'Case Study',
                graphName: 'Semiconductors 2026'
            }
        ],
        competitive_context: {
            co_occurring_brands: [{ brand: 'STMicroelectronics', co_occurrences: 4 }]
        },
        cross_graph_presence: [{ graphName: 'Semiconductors 2026', graphId: 'semiconductors-2026', evidenceCount: 5 }],
        market_data: {
            source: 'roic_market',
            ticker: 'MCHP',
            primary_symbol: 'NASDAQ:MCHP',
            company_profile: {
                primary_symbol: 'NASDAQ:MCHP',
                ticker: 'MCHP',
                company_name: 'Microchip Technology Incorporated',
                sector: 'Technology',
                industry: 'Semiconductors',
                exchange: 'NASDAQ',
                currency: 'USD'
            },
            quarterly_financials: [
                {
                    period: 'Q1 FY2027 (2026-06-30)',
                    period_end_date: '2026-06-30',
                    fiscal_year: 2027,
                    period_label: 'Q1',
                    revenue: 1484700000,
                    operating_income: 292400000,
                    net_income: 182300000,
                    eps: 0.34,
                    diluted_eps: 0.33
                },
                {
                    period: 'Q4 FY2026 (2026-03-31)',
                    period_end_date: '2026-03-31',
                    fiscal_year: 2026,
                    period_label: 'Q4',
                    revenue: 1325000000,
                    operating_income: 260000000,
                    net_income: 155000000,
                    eps: 0.29,
                    diluted_eps: 0.28
                }
            ],
            price_window: {
                current_price: 78.42,
                as_of_date: '2026-08-21'
            },
            data_status: 'ok'
        }
    };

    const resPublic = await renderBrandWidget(publicProfile);
    const htmlPublic = resPublic.widget_html;

    // Assertions for Public Company
    assert.ok(htmlPublic.includes('Institutional Financial Snapshot'), 'Must contain Institutional Financial Snapshot heading');
    assert.ok(htmlPublic.includes('Microchip Technology Incorporated'), 'Must contain company name');
    assert.ok(htmlPublic.includes('NASDAQ:MCHP'), 'Must contain symbol');
    assert.ok(htmlPublic.includes('Sector: Technology'), 'Must contain sector');
    assert.ok(htmlPublic.includes('Industry: Semiconductors'), 'Must contain industry');
    assert.ok(htmlPublic.includes('$78.42 (as of 2026-08-21)'), 'Must contain stock price with as_of date');
    assert.ok(htmlPublic.includes('Q1 FY2027 (2026-06-30)'), 'Must contain Q1 period');
    assert.ok(htmlPublic.includes('$1.48B'), 'Must format revenue as $1.48B');
    assert.ok(htmlPublic.includes('$292.4M'), 'Must format operating income as $292.4M');
    assert.ok(htmlPublic.includes('$182.3M'), 'Must format net income as $182.3M');
    assert.ok(htmlPublic.includes('$0.34 (Diluted $0.33)'), 'Must format EPS / Diluted EPS');
    assert.ok(htmlPublic.includes('Q4 FY2026 (2026-03-31)'), 'Must contain Q4 period');
    assert.ok(htmlPublic.includes('$1.33B') || htmlPublic.includes('$1.32B'), 'Must format Q4 revenue');
    assert.ok(htmlPublic.includes('Source: Institutional SEC & Market Financial Filings.'), 'Must cite standard institutional filings note');

    // Strict Privacy Invariant: NEVER contain "ROIC"
    assert.strictEqual(htmlPublic.includes('ROIC'), false, 'Strict Privacy Invariant: "ROIC" must never appear in rendered widget HTML');
    assert.strictEqual(htmlPublic.includes('roic'), false, 'Strict Privacy Invariant: "roic" must never appear in rendered widget HTML');

    console.log('✅ PASS: Public company snapshot rendered with accurate formatting and 0 ROIC mentions.');

    console.log('\n=== Test 2: Private Company (Chobani) with no market_data / no_signal ===');
    const privateProfile = {
        brand: 'Chobani',
        trend_footprint: [
            {
                trend_name: 'High-Protein Dairy',
                trend_description: 'Consumer shift toward high protein dairy formats.',
                graphName: 'Food & Beverage',
                evidence_count: 4,
                signal_score: 75,
                lifecycle: 'mature'
            }
        ],
        evidence_items: [],
        competitive_context: { co_occurring_brands: [] },
        cross_graph_presence: [{ graphName: 'Food & Beverage', graphId: 'food-beverage', evidenceCount: 4 }],
        market_data: {
            data_status: 'no_signal'
        }
    };

    const resPrivate = await renderBrandWidget(privateProfile);
    const htmlPrivate = resPrivate.widget_html;

    assert.strictEqual(htmlPrivate.includes('Institutional Financial Snapshot'), false, 'Private company must NOT render Financial Snapshot header');
    assert.strictEqual(htmlPrivate.includes('{{FINANCIAL_SNAPSHOT_SECTION_HTML}}'), false, 'Template placeholder must be cleanly removed');
    assert.strictEqual(htmlPrivate.includes('ROIC') || htmlPrivate.includes('roic'), false, 'No ROIC mentions');

    console.log('✅ PASS: Private company omitted Financial Snapshot cleanly without empty headers or broken placeholders.');

    console.log('\n=== Test 3: Edge Case Formatting (Negative Net Income, Single Quarter, Scaling) ===');
    const edgeProfile = {
        brand: 'Rivian',
        trend_footprint: [],
        evidence_items: [],
        cross_graph_presence: [],
        market_data: {
            ticker: 'RIVN',
            primary_symbol: 'NASDAQ:RIVN',
            company_profile: {
                company_name: 'Rivian Automotive, Inc.',
                sector: 'Consumer Cyclical',
                industry: 'Auto Manufacturers',
                exchange: 'NASDAQ'
            },
            quarterly_financials: [
                {
                    period: 'Q2 2026',
                    revenue: 850000000,
                    operating_income: -1200000000,
                    net_income: -1450000000,
                    eps: -1.45,
                    diluted_eps: -1.45
                }
            ],
            price_window: {
                current_price: 14.25
            },
            data_status: 'ok'
        }
    };

    const resEdge = await renderBrandWidget(edgeProfile);
    const htmlEdge = resEdge.widget_html;

    assert.ok(htmlEdge.includes('Rivian Automotive, Inc. (NASDAQ:RIVN)'), 'Must render header with symbol');
    assert.ok(htmlEdge.includes('$850.0M'), 'Must format $850M revenue');
    assert.ok(htmlEdge.includes('-$1.20B'), 'Must format negative operating income as -$1.20B');
    assert.ok(htmlEdge.includes('-$1.45B'), 'Must format negative net income as -$1.45B');
    assert.ok(htmlEdge.includes('-$1.45 (Diluted -$1.45)'), 'Must format negative EPS');
    assert.ok(htmlEdge.includes('Stock Price: <span style="font-family:var(--font-mono);font-weight:600;">$14.25</span>'), 'Must format price without date gracefully');

    console.log('✅ PASS: Edge cases formatted correctly (negatives, scaling, single quarter).');

    console.log('\n🎉 All Financial Snapshot rendering tests passed successfully!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
