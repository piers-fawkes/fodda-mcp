/**
 * Verification Test: verify_market_claim & get_intelligence_dossier (5-Beat PSFK Newsletter Mode)
 *
 * Verifies:
 * 1. Pricing cache registration, tools-manifest.json tool count invariance, and Cost Silence compliance
 * 2. MCP handler for get_intelligence_dossier in 'blueprint' mode (default for Claude/ChatGPT when include_editorial: true)
 *    - 5-Beat PSFK Weekly & Retail Innovation Week blueprint + strict composition contract + ### Query Fodda
 *    - Beat 1: Story and consumer behavior first in 2 breathable paragraphs, max 1 contrast stat per company
 *    - Beat 2: Woven published reports + macro stats + quotable: false commentary (never in "...")
 *    - Beat 3: Company-first earnings call openers + quotable: true verbatim quotes
 *    - Beat 4: Varied PSFK trend framing + 4-part Human Agent attribution arc (never in "...")
 *    - Beat 5 + ### Query Fodda: 4 executive takeaways + canonical https://www.fodda.ai links
 *    - Zero em dashes, zero bare dollar signs, zero footnote brackets
 * 3. MCP handler for get_intelligence_dossier in 'full' mode (5-beat editorial rendering + ### Query Fodda + escaping)
 * 4. Live API verification on POST /v1/intelligence/dossier
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initPricingCache, getToolCostSummary } from './pricingCache.js';
import { createServer } from './toolHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

async function callApi(method: 'GET' | 'POST', endpoint: string, body?: any) {
    const secret = process.env.FODDA_MCP_SECRET;
    const baseUrl = process.env.FODDA_API_URL || 'https://api.fodda.ai';
    const timestamp = Date.now().toString();
    const payload = method === 'POST' ? `${timestamp}.${JSON.stringify(body ?? {})}` : `${timestamp}.${endpoint}`;
    const signature = secret ? crypto.createHmac('sha256', secret).update(payload).digest('hex') : '';

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Signature': signature,
        'X-Fodda-Billing': 'mcp-orchestrated',
        'X-API-Key': process.env.FODDA_API_KEY || 'sk_live_abcdef',
    };

    const res = await axios({
        method,
        url: `${baseUrl}${endpoint}`,
        data: body,
        headers,
        timeout: 90000,
    });
    return res.data;
}

const MOCK_DOSSIER_RESPONSE = {
    ok: true,
    dossier: {
        adversarial_critique: 'Incumbents face margin compression when discounting $5 meal bundles — yet premium experiential operators expand gross margins.',
        evidence_items: [
            {
                title: 'Target Dealworthy Private Label Architecture',
                company: 'Target',
                trend_name: 'Two-Tiered Own-Brand Architecture',
                summary: 'Target launched Dealworthy at sub-$10 price points — defending entry traffic in 2026.',
                source_url: 'https://www.fodda.ai/?q=Target+Dealworthy',
            },
            {
                title: 'Givaudan Fine Fragrance Sensory Surge',
                company: 'Givaudan',
                trend_name: 'Affordable Sensory Indulgence',
                summary: 'Givaudan grew fine fragrance sales 17.8% in Q3 2026 as shoppers traded up on small luxuries.',
                source_url: 'https://www.fodda.ai/?q=Givaudan+Fine+Fragrance',
            },
            {
                title: 'Domino\'s Renowned Value Platform',
                company: 'Domino\'s Pizza',
                trend_name: 'Transparent Value Lock-Ins',
                summary: 'Domino\'s locked in $6.99 unbundled pricing during Q3 2026 to capture casual dining defectors.',
                source_url: 'https://www.fodda.ai/?q=Dominos+Renowned+Value',
            },
        ],
        psfk_trends: [
            { name: 'Two-Tiered Own-Brand Architecture', description: 'Retailers bifurcating private label into opening price and premium tiers.' },
            { name: 'Affordable Sensory Indulgence', description: 'Consumers substituting big-ticket luxury with accessible sensory rituals.' },
            { name: 'Transparent Value Lock-Ins', description: 'Predictable unbundled value mechanics replacing coupon fatigue.' },
        ],
        statistics: [
            { metric: 'Food Away From Home CPI', value: '4.1', unit: '% YoY', period: 'Q3 2026', source: 'Bureau of Labor Statistics' },
            { metric: 'US Food Services & Drinking Places Sales', value: '$96.4B', unit: '', period: 'Q3 2026', source: 'U.S. Census Bureau' },
        ],
        report_citations: [
            {
                firm: 'McKinsey',
                report_title: 'State of the Consumer 2026: Barbell Spending',
                finding: 'Middle-market aspirational traffic contracted 15% while value and luxury poles expanded.',
                year: '2026',
                graph_slug: 'mckinsey-consumer',
                source_url: 'https://www.fodda.ai/graphs/mckinsey-consumer',
            },
        ],
        voices: [
            {
                id: 'v_verbatim_1',
                speaker: { name: 'Brian Niccol', title: 'CEO', org: 'Chipotle' },
                quote: 'We refuse to enter a $5 discount war — our culinary hospitality drives sustainable transaction growth.',
                claim: 'Chipotle protects margins through culinary hospitality rather than discounting.',
                quote_kind: 'verbatim',
                verified: 'verified',
                stance: 'supports',
                source: { publication: 'Chipotle Q3 2026 Earnings Call', date: 'Q3 2026', url: 'https://www.fodda.ai/?q=Chipotle+Q3+2026' },
                display: { quotable: true, attribution: 'Brian Niccol, CEO, Chipotle' },
            },
            {
                id: 'v_paraphrase_1',
                speaker: { name: 'Sarah Quinlan', title: 'Retail Analyst', org: 'Retail Dive' },
                quote: '"Promotional meal bundles create a brand gravity trap that erodes franchisee unit economics."',
                claim: 'Promotional meal bundles create a brand gravity trap that erodes franchisee unit economics.',
                quote_kind: 'paraphrase',
                verified: 'verified',
                stance: 'challenges',
                source: { publication: 'Retail Dive', date: 'Q3 2026', url: 'https://www.fodda.ai/?q=Retail+Dive+value+wars' },
                display: { quotable: false, attribution: 'Sarah Quinlan, Retail Analyst, Retail Dive' },
            },
        ],
        perspectives: [
            {
                label: 'Human Agent Perspective',
                agent_name: 'Ben Dietz',
                agent_slug: 'ben-dietz',
                agent_type: 'human_agent',
                text: '"When legacy dining chains discount core combos by $2, they commoditize the brand ritual and destroy guest loyalty."',
            },
        ],
        earnings_divergences: [
            {
                company_name: 'Chipotle',
                temporal_period: 'Q3 2026',
                anchor_metric: 'Restaurant-level operating margin expanded to 27.5% in Q3 2026 without discounting',
            },
            {
                company_name: 'Target',
                temporal_period: 'Q3 2026',
                anchor_metric: 'Discretionary comparable sales shifted +2.1% in Q3 2026 behind two-tiered private label',
            },
        ],
    },
};

async function run() {
    console.log('\n=== 1. Pricing Cache, Manifest Tool Count & Cost Silence Guards ===');
    await initPricingCache();
    const costs = getToolCostSummary();

    const dossierTool = costs.find(c => c.tool === 'get_intelligence_dossier');
    assert(dossierTool !== undefined, 'get_intelligence_dossier is registered in pricing cache');

    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(manifest.count === 56, `Tool count in tools-manifest.json remains unchanged at 56 (got: ${manifest.count})`);

    const mDossier = manifest.tools.find((t: any) => t.name === 'get_intelligence_dossier');
    assert(mDossier !== undefined, 'get_intelligence_dossier exists in tools-manifest.json');
    if (mDossier) {
        assert(mDossier.bills_as === 'topic_research', 'get_intelligence_dossier bills_as is "topic_research"');
        assert(mDossier.category === 'Intelligence', 'get_intelligence_dossier category is "Intelligence"');
        assert(mDossier.description.includes('5-beat') && mDossier.description.includes('PSFK Weekly') && mDossier.description.includes('Retail Innovation Week'), 'Description routes 5-beat PSFK Weekly & Retail Innovation Week prompts to get_intelligence_dossier');
        assert(!/\b(?:tokens?|via SPT)\b/i.test(mDossier.description), 'get_intelligence_dossier description has NO token/SPT phrasing');
        assert(!/\$[0-9]/.test(mDossier.description), 'get_intelligence_dossier description has NO price figures');
    }

    console.log('\n=== 2. Claude/ChatGPT Interactive Blueprint Mode & 5-Beat Composition Contract ===');
    let capturedRequestBody: any = null;
    const mockFoddaRequest = async (method: string, endpoint: string, _apiKey?: string, _userId?: string, body?: any) => {
        if (endpoint === '/v1/intelligence/dossier') {
            capturedRequestBody = body;
            return JSON.parse(JSON.stringify(MOCK_DOSSIER_RESPONSE));
        }
        return {};
    };

    const claudeServer = await createServer(
        'sk_test_mock',
        'user_test_claude',
        mockFoddaRequest as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai',
        '',
        undefined,
        undefined,
        'claude'
    );
    const claudeHandler = (claudeServer as any)._registeredTools['get_intelligence_dossier']?.handler;
    assert(typeof claudeHandler === 'function', 'get_intelligence_dossier handler is registered on MCP server');

    const blueprintRes = await claudeHandler({
        topic: 'Restaurant and retail pricing power vs discounting',
        sector: 'retail',
        tickers: ['CMG', 'TGT'],
        include_editorial: true,
        publication_style: 'retail_innovation_week',
    });

    assert(capturedRequestBody?.editorial_mode === 'blueprint', `Claude session with include_editorial: true defaults editorial_mode to "blueprint" (got: ${capturedRequestBody?.editorial_mode})`);
    assert(capturedRequestBody?.publication_style === 'retail_innovation_week', `Passes publication_style: "retail_innovation_week" to API`);
    assert(blueprintRes.editorial_mode === 'blueprint', 'Response payload marks editorial_mode: "blueprint"');
    assert(Boolean(blueprintRes.newsletter_blueprint), 'Response payload includes structured newsletter_blueprint');

    const bpMd: string = blueprintRes.formatted_markdown || '';
    assert(bpMd.includes('## 5-Beat Retail Innovation Week Newsletter Blueprint & Strict Composition Contract'), 'Blueprint header names Retail Innovation Week');
    assert(bpMd.includes('### 1. [Section Title] (Beat 1: Market Condition & The Numbers)'), 'Blueprint renders Beat 1 header');
    assert(bpMd.includes('story and consumer behavior FIRST in 2 breathable paragraphs') && bpMd.includes('at most 1 sharp contrast metric per company'), 'Beat 1 enforces story-first 2 paragraphs & max 1 stat per company');
    assert(bpMd.includes('### 2. [Section Title] (Beat 2: Core Tension & Published Research)'), 'Blueprint renders Beat 2 header');
    assert(bpMd.includes('https://www.fodda.ai/graphs/mckinsey-consumer?q='), 'Beat 2 links published report to canonical https://www.fodda.ai/graphs/:slug?q=...');
    assert(!bpMd.includes('"Promotional meal bundles create a brand gravity trap'), 'quotable: false voice is NEVER rendered in quotation marks ("...")');
    assert(bpMd.includes('### 3. [Section Title] (Beat 3: Competing Corporate Playbooks)'), 'Blueprint renders Beat 3 header');
    assert(bpMd.includes('[During Chipotle\'s Q3 2026 earnings call](https://www.fodda.ai/?q='), 'Beat 3 renders company-first hyperlinked earnings call opener');
    assert(bpMd.includes('"We refuse to enter a \\$5 discount war, our culinary hospitality drives sustainable transaction growth."'), 'Beat 3 quotes quotable: true executive verbatim with escaped dollar sign and cleaned em dash');
    assert(bpMd.includes('### 4. [Section Title] (Beat 4: Cross-Domain Case Studies & Expert Frameworks)'), 'Blueprint renders Beat 4 header');
    assert(bpMd.includes('Under the PSFK trend *Two-Tiered Own-Brand Architecture* found in the Fodda graph'), 'Beat 4 includes varied PSFK trend framing #1');
    assert(bpMd.includes('Within the trend *Affordable Sensory Indulgence*, PSFK researchers highlight how'), 'Beat 4 includes varied PSFK trend framing #2');
    assert(bpMd.includes('Under another PSFK identified trend, *Transparent Value Lock-Ins*'), 'Beat 4 includes varied PSFK trend framing #3');
    assert(bpMd.includes('[When their Human Agent is queried through Fodda](https://www.fodda.ai/experts/ben-dietz)'), 'Beat 4 includes 4-part Human Agent attribution arc link');
    assert(!bpMd.includes('"When legacy dining chains discount core combos'), 'Human Agent perspective is NEVER rendered in quotation marks ("...")');
    assert(bpMd.includes('### 5. [Section Title] (Beat 5: Strategic Stakes & Executive Playbook)'), 'Blueprint renders Beat 5 header');
    assert(bpMd.includes('### Query Fodda'), 'Blueprint renders canonical ### Query Fodda footer');
    assert(!/[—–]/.test(bpMd), 'Zero unicode em/en dashes in formatted blueprint markdown');
    assert(!/(?<!\\)\$[0-9]/.test(bpMd), 'Zero unescaped bare dollar signs before digits in formatted blueprint markdown');

    console.log('\n=== 3. Full 5-Beat Editorial Rendering Mode (editorial_mode: "full") ===');
    const mockFullFoddaRequest = async (_method: string, endpoint: string, _apiKey?: string, _userId?: string, body?: any) => {
        if (endpoint === '/v1/intelligence/dossier') {
            capturedRequestBody = body;
            return {
                ...JSON.parse(JSON.stringify(MOCK_DOSSIER_RESPONSE)),
                editorial: {
                    headline: 'Why Hospitality Operators Refuse the $5 Bundle Trap',
                    subtitle: 'Inside the Q3 2026 Margin Divide — Experience vs. Discount Volume',
                    summary: 'In this PSFK Weekly briefing, operators protecting culinary craft are outperforming chains trapped in $5 value wars [1].',
                    sections: {
                        market_lede: {
                            section_title: 'The High Cost of Cheap Traffic',
                            content: 'Chipotle refused to discount in Q3 2026 — expanding restaurant margins to 27.5% [1](https://claude.ai/new?q=Chipotle+Q3+2026).\n\nMeanwhile, Target used a $10 price ceiling on Dealworthy to defend traffic in Q3 2026.',
                        },
                        core_debate: {
                            section_title: 'Structural Barbell or Temporary Hedge',
                            content: 'Citing [McKinsey research](https://www.fodda.ai/graphs/mckinsey-consumer?q=McKinsey+barbell+spending), middle-tier traffic dropped 15% while BLS CPI hit 4.1% in Q3 2026.',
                        },
                        competing_playbooks: {
                            section_title: 'Hospitality Moats vs. Unbundled Value',
                            content: '[During Chipotle\'s Q3 2026 earnings call](https://www.fodda.ai/?q=Chipotle+Q3+2026+earnings+call), CEO Brian Niccol stated: "We refuse to enter a $5 discount war."',
                        },
                        graph_fan_out: {
                            section_title: 'PSFK Trend Innovations & Human Agent Lens',
                            content: 'Under the PSFK trend *Two-Tiered Own-Brand Architecture* found in the Fodda graph, [Target Dealworthy](https://www.fodda.ai/?q=Target+Dealworthy) defends entry price points in 2026.\n\nBrand strategist [Ben Dietz](https://www.fodda.ai/experts/ben-dietz?q=Ben+Dietz+pricing+power) defines discounting as a gravity trap. [When his Human Agent is queried through Fodda](https://www.fodda.ai/experts/ben-dietz), it explains that brand ritual outlasts couponing.',
                        },
                        strategic_stakes: {
                            section_title: 'Executive Playbook for 2026',
                            content: '* **[Wall Off Premium Sanctuaries](https://www.fodda.ai/?q=premium+tier+margin+defense):** Protect full-price brand equity.\n* **[Deploy Two-Tiered Price Packs](https://www.fodda.ai/?q=two+tiered+price+architecture):** Pair entry tiers with sensory upgrades.\n* **[Elevate Physical Rituals](https://www.fodda.ai/?q=PSFK+trend+brand+ritual):** Invest in experience over markdowns.\n* **[Benchmark Q3 2026 Margin Reality](https://www.fodda.ai/?q=Q3+2026+margin+comparison):** Audit unit economics quarterly.',
                        },
                    },
                },
            };
        }
        return {};
    };

    const fullServer = await createServer(
        'sk_test_mock',
        'user_test_full',
        mockFullFoddaRequest as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai',
        '',
        undefined,
        undefined,
        'claude'
    );
    const fullHandler = (fullServer as any)._registeredTools['get_intelligence_dossier']?.handler;
    const fullRes = await fullHandler({
        topic: 'Restaurant and retail pricing power vs discounting',
        sector: 'food',
        tickers: ['CMG', 'TGT'],
        include_editorial: true,
        editorial_mode: 'full',
        publication_style: 'psfk_weekly',
    });

    assert(capturedRequestBody?.editorial_mode === 'full' && capturedRequestBody?.include_editorial === true, 'Explicit editorial_mode: "full" overrides blueprint default and sends include_editorial: true');
    const fullMd: string = fullRes.formatted_markdown || '';
    assert(fullMd.includes('## 5-Beat PSFK Weekly Executive Briefing:'), 'Full mode renders 5-Beat PSFK Weekly Executive Briefing header');
    assert(fullMd.includes('### 1. The High Cost of Cheap Traffic'), 'Full mode renders Beat 1');
    assert(fullMd.includes('### 2. Structural Barbell or Temporary Hedge'), 'Full mode renders Beat 2');
    assert(fullMd.includes('### 3. Hospitality Moats vs. Unbundled Value'), 'Full mode renders Beat 3');
    assert(fullMd.includes('### 4. PSFK Trend Innovations & Human Agent Lens'), 'Full mode renders Beat 4');
    assert(fullMd.includes('### 5. Executive Playbook for 2026'), 'Full mode renders Beat 5');
    assert(fullMd.includes('### Query Fodda'), 'Full mode appends canonical ### Query Fodda footer');
    assert(!fullMd.includes('claude.ai/new'), 'Legacy claude.ai links are normalized to canonical https://www.fodda.ai links');
    assert(!/\[\d+\]/.test(fullMd), 'Bracketed footnote numbers ([1]) are stripped from editorial prose');
    assert(!/[—–]/.test(fullMd), 'Zero unicode em/en dashes in full mode markdown');
    assert(!/(?<!\\)\$[0-9]/.test(fullMd), 'Zero unescaped bare dollar signs before digits in full mode markdown');

    console.log('\n=== 4. Live API Verification: POST /v1/intelligence/dossier (Fast Blueprint Call) ===');
    try {
        const liveDossier = await callApi('POST', '/v1/intelligence/dossier', {
            topic: 'functional soda prebiotic growth US sales',
            sector: 'food',
            include_editorial: false,
            editorial_mode: 'blueprint',
        });
        assert(liveDossier.ok === true, 'Live POST /v1/intelligence/dossier returned ok: true');
        assert(Boolean(liveDossier.dossier), 'Live dossier object is present');
        const evidence = liveDossier.dossier?.evidence_items || [];
        assert(evidence.length > 0, `Live evidence items returned (${evidence.length} items)`);
    } catch (err: any) {
        assert(false, `Live POST /v1/intelligence/dossier call failed: ${err.response?.data?.message || err.message}`);
    }

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

run().catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
