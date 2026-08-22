import assert from 'node:assert';
import { createServer } from './toolHandlers.js';
import { setCachedCatalogForTesting } from './catalogCache.js';
import { renderClosingBlock } from './coverageRelevance.js';
import type { NextMoves } from './coverageRelevance.js';

console.log('=== Running Next Moves Live Transcripts & Verification (Render Spec 1.3) ===\n');

const mockGraphsList = [
    {
        graph_id: 'retail',
        name: 'Retail Strategy & Innovation',
        domain: 'retail',
        graph_type: 'domain',
        status: 'live',
        topics: ['retail', 'commerce'],
        trend_count: 150,
        evidence_count: 500,
        headline: 'Future of retail operations and omnichannel commerce'
    },
    {
        graph_id: 'ben-dietz-sic',
        name: '[SIC] Weekly — Cultural Strategy',
        domain: 'culture',
        graph_type: 'expert',
        status: 'live',
        curator: 'Ben Dietz',
        topics: ['culture', 'marketing'],
        trend_count: 80,
        evidence_count: 320,
        headline: 'Youth culture, street culture, and brand relevance'
    },
    {
        graph_id: 'beauty',
        name: 'Beauty & Wellness',
        domain: 'beauty',
        graph_type: 'domain',
        status: 'live',
        topics: ['beauty', 'wellness'],
        trend_count: 120,
        evidence_count: 450,
        headline: 'Clean beauty, longevity, and self-care rituals'
    },
    {
        graph_id: 'fashion',
        name: 'Fashion & Luxury Systems',
        domain: 'fashion',
        graph_type: 'domain',
        status: 'live',
        topics: ['fashion', 'luxury'],
        trend_count: 110,
        evidence_count: 400,
        headline: 'Sustainable apparel, circularity, and runway innovation'
    },
    {
        graph_id: 'sports',
        name: 'Sports & Active Culture',
        domain: 'sports',
        graph_type: 'domain',
        status: 'live',
        topics: ['sports', 'footwear'],
        trend_count: 95,
        evidence_count: 380,
        headline: 'Athletic performance, footwear innovations, and fan engagement'
    }
];

const mockAnalystsList = [
    {
        analyst_id: 'ben-dietz-sic',
        name: 'Ben Dietz',
        status: 'Active',
        topics: ['culture', 'marketing'],
        description: 'Cultural strategy and youth marketing',
        graph_type: 'expert'
    },
    {
        analyst_id: 'retail-lead',
        name: 'Retail Strategy Lead',
        status: 'Active',
        topics: ['retail', 'commerce'],
        description: 'Omnichannel retail innovation',
        graph_type: 'expert'
    }
];

// Initialize catalog cache for testing
setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphsList.length, graphs: mockGraphsList as any },
    mockAnalystsList as any
);

// Mock data generator for realistic API responses
async function mockFoddaBackend(method: string, endpoint: string, apiKey?: string, userId?: string, body?: any): Promise<any> {
    if (endpoint.includes('/v1/graphs/catalog') || endpoint === '/v1/graphs') {
        return { graphs: mockGraphsList };
    }

    if (endpoint.includes('/v1/analysts') || endpoint.includes('/v1/human-agents')) {
        if (endpoint.includes('/consult')) {
            return {
                coverage: 'in',
                report: 'Cultural brands must anchor community-led commerce around authentic rituals and creator collaborations rather than standard discounts.',
                sources_used: [
                    { title: 'Community Rituals and Creator Retail in Streetwear', graphId: 'ben-dietz-sic', brandNames: ['Supreme', 'Aimé Leon Dore'] }
                ],
                expert_thread: {
                    on_topic_total: 8,
                    cited_count: 1,
                    uncited_themes: ['Zines & Subcultures', 'Discord Councils'],
                    brands: ['Supreme', 'Aimé Leon Dore'],
                    next_angle: 'We can explore how creator-led retail formats differ across European luxury markets next.'
                },
                session_id: 'sess_12345'
            };
        }
        return mockAnalystsList;
    }

    // Mock adjacent endpoint for discover_adjacent_trends & brainstorm_topic
    if (endpoint.includes('/adjacent')) {
        return {
            seed_trend: { title: 'Functional Hydration Beverages', node_id: '2507.0', graph_id: 'retail' },
            matches: [
                { title: 'Electrolyte Micro-Dosing', graph_id: 'retail', score: 1.6, brandNames: ['Waterdrop'] },
                { title: 'Adaptogenic Sparkling Waters', graph_id: 'retail', score: 1.7, brandNames: ['Recess', 'Kin'] }
            ],
            total: 5,
            on_topic_total: 5
        };
    }

    // Search Graph / Domain / Expert / Report
    if (endpoint.includes('/search') || endpoint.includes('/statistics')) {
        const q = (body?.query || '').toLowerCase();

        // Thin/Empty case
        if (q.includes('underground subaquatic') || q.includes('subaquatic')) {
            return {
                rows: [],
                total: 0,
                on_topic_total: 0
            };
        }

        if (q.includes('beverage') || q.includes('hydration')) {
            return {
                rows: [
                    { title: 'Functional Hydration Beverages', brandNames: ['Liquid IV', 'Gatorade'], graphId: 'retail', score: 1.8, topics: ['beverage', 'retail'] },
                    { title: 'Electrolyte Micro-Dosing', brandNames: ['Waterdrop'], graphId: 'retail', score: 1.6, topics: ['wellness'] },
                    { title: 'Adaptogenic Sparkling Waters', brandNames: ['Recess', 'Kin'], graphId: 'retail', score: 1.7, topics: ['beverage'] },
                    { title: 'Plant-Based Electrolytes', brandNames: ['Cure Hydration'], graphId: 'retail', score: 1.5, topics: ['retail'] }
                ],
                total: 12,
                on_topic_total: 8
            };
        }

        if (q.includes('circular fashion') || q.includes('resale')) {
            return {
                rows: [
                    { title: 'Peer-to-Peer Resale Portals', brandNames: ['Vestiaire Collective', 'The RealReal'], graphId: 'fashion', score: 1.9, topics: ['fashion', 'circularity'] },
                    { title: 'Brand-Certified Pre-Owned Programs', brandNames: ['Patagonia', 'Eileen Fisher'], graphId: 'fashion', score: 1.7, topics: ['resale'] },
                    { title: 'Digital Product Passports in Luxury', brandNames: ['Chloé'], graphId: 'fashion', score: 1.8, topics: ['circularity'] },
                    { title: 'Textile Upcycling Hubs', brandNames: ['Renewcell'], graphId: 'fashion', score: 1.6, topics: ['fashion'] }
                ],
                total: 4,
                on_topic_total: 4
            };
        }

        if (q.includes('packaging')) {
            return {
                rows: [
                    { title: 'Mushroom Mycelium Luxury Boxes', brandNames: ['Ecovative', 'LVMH'], graphId: 'retail', score: 1.8, topics: ['packaging'] },
                    { title: 'Seaweed Dissolvable Sachets', brandNames: ['Notpla'], graphId: 'retail', score: 1.7, topics: ['retail'] },
                    { title: 'Refillable Luxury Glass Formats', brandNames: ['Chanel'], graphId: 'retail', score: 1.6, topics: ['packaging'] },
                    { title: 'Fibre-Based Secondary Cartons', brandNames: ['Kering'], graphId: 'retail', score: 1.5, topics: ['retail'] }
                ],
                total: 7,
                on_topic_total: 7
            };
        }

        if (q.includes('cultural strategy') || q.includes('youth marketing')) {
            return {
                rows: [
                    { title: 'Micro-Community Commerce Drops', brandNames: ['Corteiz', 'Stussy'], graphId: 'ben-dietz-sic', score: 1.9, topics: ['culture'] },
                    { title: 'Archive Curation as Brand Equity', brandNames: ['Arcteryx'], graphId: 'ben-dietz-sic', score: 1.8, topics: ['culture'] },
                    { title: 'Discord Fan Councils', brandNames: ['Brain Dead'], graphId: 'ben-dietz-sic', score: 1.7, topics: ['culture'] },
                    { title: 'Subcultural Print Zines', brandNames: ['Aimé Leon Dore'], graphId: 'ben-dietz-sic', score: 1.6, topics: ['culture'] }
                ],
                total: 9,
                on_topic_total: 6
            };
        }

        if (q.includes('electric vehicle') || q.includes('adoption')) {
            return {
                rows: [
                    { metric_name: 'EV Market Share Projection', value: '33% by 2028', graphId: 'retail', score: 1.7 },
                    { metric_name: 'Fast-Charging Infrastructure Growth', value: '+42% YoY', graphId: 'retail', score: 1.6 },
                    { metric_name: 'Battery Pack Cost Decline', value: '-14% in 2025', graphId: 'retail', score: 1.5 }
                ],
                total: 6,
                on_topic_total: 6
            };
        }

        if (q.includes('footwear') || q.includes('sneaker')) {
            return {
                rows: [
                    { metric_name: 'Global Sneaker Resale Value', value: '$30 Billion by 2030', brandNames: ['Nike', 'Jordan'], graphId: 'sports', score: 1.8 },
                    { metric_name: 'Running Footwear Category Growth', value: '+8.4% YoY', brandNames: ['On Running', 'Hoka'], graphId: 'sports', score: 1.7 },
                    { metric_name: 'Trail & Outdoor Footwear Share', value: '18% of athletic market', brandNames: ['Salomon'], graphId: 'sports', score: 1.6 }
                ],
                total: 7,
                on_topic_total: 7
            };
        }

        if (q.includes('nike')) {
            return {
                rows: [
                    { title: 'Digital Athlete Ecosystems', brandNames: ['Nike', 'Apple'], graphId: 'sports', score: 1.9, topics: ['sports', 'technology'] },
                    { title: 'Direct-to-Consumer Innovation', brandNames: ['Nike', 'Adidas'], graphId: 'retail', score: 1.7, topics: ['retail'] },
                    { title: 'Sustainable Performance Materials', brandNames: ['Nike', 'Lululemon'], graphId: 'sports', score: 1.6, topics: ['sustainability'] }
                ],
                total: 8,
                on_topic_total: 8
            };
        }

        if (q.includes('patagonia')) {
            return {
                rows: [
                    { title: 'Circular Apparel Programs', brandNames: ['Patagonia', 'Eileen Fisher'], graphId: 'fashion', score: 1.9, topics: ['circularity'] },
                    { title: 'Worn Wear Repair Ecosystems', brandNames: ['Patagonia', 'Arc\'teryx'], graphId: 'sports', score: 1.8, topics: ['sustainability'] },
                    { title: 'Regenerative Organic Agriculture', brandNames: ['Patagonia', 'North Face'], graphId: 'retail', score: 1.6, topics: ['agriculture'] }
                ],
                total: 6,
                on_topic_total: 6
            };
        }

        return {
            rows: [
                { title: 'Sample Innovation Trend 1', brandNames: ['SampleCorp'], graphId: 'retail', score: 1.5 },
                { title: 'Sample Innovation Trend 2', brandNames: ['BetaCo'], graphId: 'retail', score: 1.5 },
                { title: 'Sample Innovation Trend 3', brandNames: ['GammaInc'], graphId: 'retail', score: 1.5 }
            ],
            total: 3,
            on_topic_total: 3
        };
    }

    if (endpoint.includes('/supplemental/earnings')) {
        const brandParam = endpoint.includes('brand=') ? decodeURIComponent(endpoint.split('brand=')[1]?.split('&')[0] || '') : 'Nike';
        if (brandParam.toLowerCase().includes('nike')) {
            return {
                source: 'truth_layer',
                truth_layer: { ticker: 'NKE', company: 'Nike, Inc.', headline: 'Direct channel growth and inventory normalization' }
            };
        }
        return { source: 'truth_layer', results: [] };
    }

    if (endpoint.includes('/brand-intelligence') || endpoint.includes('/graphs/')) {
        const brandName = endpoint.includes('/v1/brand-intelligence/')
            ? decodeURIComponent(endpoint.split('/v1/brand-intelligence/')[1]?.split('?')[0] || '')
            : (body?.brand || 'Nike');

        if (brandName.toLowerCase().includes('patagonia')) {
            return {
                brand: 'Patagonia',
                trend_footprint: [
                    { title: 'Circular Apparel Programs', graphId: 'fashion', score: 1.9, brandNames: ['Patagonia', 'Eileen Fisher'] },
                    { title: 'Worn Wear Repair Ecosystems', graphId: 'sports', score: 1.8, brandNames: ['Patagonia', 'Arc\'teryx'] },
                    { title: 'Regenerative Organic Agriculture', graphId: 'retail', score: 1.6, brandNames: ['Patagonia', 'North Face'] }
                ],
                competitive_context: {
                    co_occurring: [
                        { brand: 'Eileen Fisher', co_occurrences: 4, graphIds: ['fashion'] },
                        { brand: 'Arc\'teryx', co_occurrences: 3, graphIds: ['sports'] },
                        { brand: 'La Mer', co_occurrences: 2, graphIds: ['beauty'] }
                    ]
                },
                summary: {
                    total_evidence_items: 18,
                    total_trends_connected: 6,
                    graphs_present_in: ['fashion', 'sports', 'retail']
                }
            };
        }

        return {
            brand: brandName,
            trend_footprint: [
                { title: 'Digital Athlete Ecosystems', graphId: 'sports', score: 1.9, brandNames: [brandName, 'Apple'] },
                { title: 'Direct-to-Consumer Innovation', graphId: 'retail', score: 1.7, brandNames: [brandName, 'Adidas'] },
                { title: 'Sustainable Performance Materials', graphId: 'sports', score: 1.6, brandNames: [brandName] }
            ],
            competitive_context: {
                co_occurring: [
                    { brand: 'Adidas', co_occurrences: 6, graphIds: ['retail', 'sports'] },
                    { brand: 'Lululemon', co_occurrences: 4, graphIds: ['sports'] },
                    { brand: 'NCR', co_occurrences: 3, graphIds: ['finance'] }
                ]
            },
            summary: {
                total_evidence_items: 24,
                total_trends_connected: 8,
                graphs_present_in: ['sports', 'retail']
            }
        };
    }

    return {};
}

// Banned words checker
function verifyZeroCountBannedTerms(block: string): void {
    const bannedPatterns: Array<{ name: string; regex: RegExp }> = [
        { name: 'Cost / Token terms', regex: /\b(cost|price|token|tokens|spt|\$|cents?)\b/i },
        { name: 'Technical slugs', regex: /\b(ben-dietz-sic|peter-abraham-bicycles-cycling|brand-cmo|retail-lead)\b/i },
        { name: 'Tool names', regex: /\b(search_graph|get_domain_intelligence|get_expert_intelligence|consult_analyst|consult_human_agent|get_supplemental_context|search_statistics|brand_tracker)\b/i },
        { name: 'Emojis', regex: /[\u{1F300}-\u{1F9FF}]/u },
        { name: 'Section headers', regex: /(^|\n)#{1,6}\s+|(\*\*Next Steps\*\*|\*\*Closing\*\*)/i },
        { name: 'Apologies', regex: /\b(sorry|apologize|apologies|unfortunately)\b/i },
        { name: 'ROIC vendor term', regex: /\bROIC\b/i },
        { name: 'Bare-ticker pattern in stats clause', regex: /(?:from|for)\s+earnings.*?\b[A-Z]{2,5}\b/i },
        { name: 'Bare ticker in stats source', regex: /\bearnings and financial performance data for [A-Z]{2,5}\b/i },
        { name: 'Generic ungrounded shelf clause', regex: /across domain and industry report graphs/i }
    ];

    for (const pat of bannedPatterns) {
        assert.strictEqual(
            pat.regex.test(block),
            false,
            `Banned term violation in closing block: ${pat.name} matched in: "${block}"`
        );
    }
}

async function runTranscripts() {
    const server = await createServer(
        'sk_live_test_key',
        'user_test_123',
        mockFoddaBackend as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );

    const testQueries = [
        { tool: 'search_graph', args: { query: 'Gen Z beverage hydration trends' }, title: 'Query 1: search_graph — Beverage Hydration (OK coverage, more in graph)' },
        { tool: 'search_graph', args: { query: 'circular fashion resale models' }, title: 'Query 2: search_graph — Circular Fashion Resale (OK coverage, brands returned)' },
        { tool: 'search_graph', args: { query: 'underground subaquatic urban farming techniques' }, title: 'Query 3: search_graph — Subaquatic Farming (Thin/Empty coverage case)' },
        { tool: 'get_domain_intelligence', args: { query: 'sustainable luxury retail packaging innovation' }, title: 'Query 4: get_domain_intelligence — Sustainable Packaging' },
        { tool: 'get_expert_intelligence', args: { query: 'cultural strategy and youth marketing shifts' }, title: 'Query 5: get_expert_intelligence — Cultural Strategy' },
        { tool: 'search_statistics', args: { graph_id: 'retail', query: 'electric vehicle adoption rates and market growth' }, title: 'Query 6: search_statistics — EV Market Growth' },
        { tool: 'search_statistics', args: { graph_id: 'sports', query: 'global footwear market size and sneaker sales' }, title: 'Query 7: search_statistics — Footwear Market Size' },
        { tool: 'brand_tracker', args: { brand_name: 'Nike' }, title: 'Query 8: brand_tracker — Nike' },
        { tool: 'brand_tracker', args: { brand_name: 'Patagonia' }, title: 'Query 9: brand_tracker — Patagonia' },
        { tool: 'discover_adjacent_trends', args: { graphId: 'retail', trend_id: '2507.0' }, title: 'Query 10: discover_adjacent_trends — Retail Adjacent' },
        { tool: 'brainstorm_topic', args: { query: 'sustainable luxury retail packaging innovation' }, title: 'Query 11: brainstorm_topic — Luxury Packaging' },
        { tool: 'consult_analyst', args: { analyst_id: 'ben-dietz-sic', query: 'How should cultural brands approach community-led commerce in 2026?' }, title: 'Query 12: consult_analyst — Ben Dietz (Expert Consult)' },
        { tool: 'consult_human_agent', args: { analyst_id: 'ben-dietz-sic', query: 'What is the future of creator-led retail?' }, title: 'Query 13: consult_human_agent — Ben Dietz (Human Agent Consult)' }
    ];

    const transcripts: string[] = [];

    for (const [index, tq] of testQueries.entries()) {
        const reg: any = (server as any)._registeredTools[tq.tool];
        assert.ok(reg, `Tool ${tq.tool} must be registered`);
        const fn = reg.handler || reg.callback || reg.execute;

        const res = await fn(tq.args, { authInfo: {} });
        
        // Assert strictly on res.content — MCP clients only receive content in production
        assert.ok(Array.isArray(res.content) && res.content.length > 0, `Tool ${tq.tool} must return a non-empty content array`);

        const allContentTexts = res.content.map((c: any) => c.text || '');
        const fullContentText = allContentTexts.join('\n');

        let nextMoves: NextMoves | undefined;

        // Parse next_moves strictly from JSON / RAW DATA blocks within res.content
        for (const txt of allContentTexts) {
            if (txt.includes('── RAW DATA (for follow-up reasoning) ──\n') || txt.trim().startsWith('{')) {
                try {
                    const cleanJson = txt.replace('── RAW DATA (for follow-up reasoning) ──\n', '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed?.next_moves) {
                        nextMoves = parsed.next_moves;
                        break;
                    }
                } catch {
                    // Not valid JSON block, continue
                }
            }
        }

        let lines: string[] = [];
        let closingBlock = '';

        if (nextMoves) {
            assert.strictEqual(nextMoves.presentation, 'internal', 'next_moves presentation must be internal');
            assert.strictEqual(nextMoves.scope_prompt, true, 'scope_prompt must be true');

            const closing = renderClosingBlock(nextMoves);
            lines = closing.lines;
            closingBlock = closing.text;
        } else if (tq.tool === 'consult_analyst' || tq.tool === 'consult_human_agent') {
            // For consult tools, closing lines are rendered as a single paragraph at the end of content[0].text
            const paragraphs = (res.content[0]?.text || '').trim().split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean);
            const closingParagraph = paragraphs[paragraphs.length - 1] || '';
            
            // Verify single paragraph: no newlines inside closing paragraph
            assert.ok(!closingParagraph.includes('\n'), `Consult closing block must be a single paragraph without line breaks: "${closingParagraph}"`);

            // Extract sentences from closing paragraph
            lines = closingParagraph.split(/(?<=[.!?])\s+/).map((s: string) => s.trim()).filter(Boolean);
            closingBlock = closingParagraph;

            // Shelf check: if 3 sentences, sentence 2 is shelf line and must name a real catalog graph
            if (lines.length === 3 && lines[1]) {
                const shelfLine = lines[1];
                const namesGraph = mockGraphsList.some(g => shelfLine.includes(g.name));
                assert.ok(namesGraph, `Shelf line in consult must name a real graph from catalog: "${shelfLine}"`);
            }
        }

        assert.ok(closingBlock.length > 0, `Closing block must not be empty for ${tq.tool}`);

        // Verify 2 or 3 sentences
        assert.ok(
            lines.length === 2 || lines.length === 3,
            `Expected 2 or 3 sentences for ${tq.tool}, got ${lines.length}: "${closingBlock}"`
        );

        // For tools where closing block is server-rendered into content text, verify lines appear in content
        if (['brand_tracker', 'discover_adjacent_trends', 'brainstorm_topic', 'consult_analyst', 'consult_human_agent'].includes(tq.tool)) {
            for (const line of lines) {
                assert.ok(
                    fullContentText.includes(line),
                    `Tool ${tq.tool} content must contain rendered closing line: "${line}"`
                );
            }
        }

        // Zero-count check for banned terms
        verifyZeroCountBannedTerms(closingBlock);

        const transcript = `#### ${tq.title}
- **Tool Call:** \`${tq.tool}(${JSON.stringify(tq.args)})\`
- **\`next_moves\` Envelope (from \`res.content\`):**
\`\`\`json
${nextMoves ? JSON.stringify(nextMoves, null, 2) : '{\n  "note": "Rendered in prose content envelope"\n}'}
\`\`\`
- **Rendered Next Moves Closing Block (${lines.length} sentences):**
  > "${closingBlock}"
${lines.map((l, i) => `- **Line ${i + 1}:** ${l}`).join('\n')}
- **Zero-Count Verification:** PASSED (0 costs, 0 token/SPT mentions, 0 technical slugs, 0 tool names, 0 emojis, 0 headers, 0 apologies, 0 ROIC, 0 bare tickers)
`;

        transcripts.push(transcript);
        console.log(`✅ [${index + 1}/${testQueries.length}] ${tq.title} passed content verification.`);
    }

    console.log(`\n=== ALL ${testQueries.length} NOVEL-QUERY TRANSCRIPTS PASSED ZERO-COUNT, 3-LINE, & CONTENT TEXT CHECKS ===\n`);
    console.log(transcripts.join('\n---\n\n'));
    return transcripts;
}

runTranscripts().catch(err => {
    console.error('❌ Transcript runner failed:', err);
    process.exit(1);
});
