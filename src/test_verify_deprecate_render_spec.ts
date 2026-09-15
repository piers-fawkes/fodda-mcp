import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './toolHandlers.js';
import { setCachedCatalogForTesting } from './catalogCache.js';
import type { NextMoves } from './coverageRelevance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Running Verification: Deprecate Imperative Render Spec & Migrate to Structured Next Moves ===\n');

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

// ---------------------------------------------------------------------------
// 1. Static Invariant Grep Check: Zero occurrences in toolHandlers.ts & systemPrompt.ts
// ---------------------------------------------------------------------------
console.log('1. Verifying Zero Imperative Closing Directives in Source Files...');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = fs.existsSync(path.resolve(__dirname, 'toolHandlers.ts')) ? __dirname : path.resolve(projectRoot, 'src');
const toolHandlersPath = path.resolve(srcDir, 'toolHandlers.ts');
const systemPromptPath = path.resolve(srcDir, 'systemPrompt.ts');

const toolHandlersContent = fs.readFileSync(toolHandlersPath, 'utf8');
const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');

const forbiddenImperatives = [
    '── NEXT MOVES CLOSING BLOCK',
    'Reproduce this exact 3-sentence closing block verbatim',
    'Reproduce this exact',
    'closingBlockInstruction'
];

for (const phrase of forbiddenImperatives) {
    const thCount = (toolHandlersContent.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    check(thCount === 0, `Zero occurrences of "${phrase}" in toolHandlers.ts (found ${thCount})`);
}

const spBannerCount = (systemPromptContent.match(/NEXT MOVES CLOSING BLOCK \(Render Spec 1\.3\)/g) || []).length;
check(spBannerCount === 0, `Zero occurrences of "NEXT MOVES CLOSING BLOCK (Render Spec 1.3)" in systemPrompt.ts (found ${spBannerCount})`);

// ---------------------------------------------------------------------------
// 2. Runtime Invocation Verification: brand_tracker and consult_human_agent
// ---------------------------------------------------------------------------
console.log('\n2. Verifying Runtime Tool Outputs & Structured next_moves...');

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
        graph_id: 'sports',
        name: 'Sports & Active Culture',
        domain: 'sports',
        graph_type: 'domain',
        status: 'live',
        topics: ['sports', 'footwear'],
        trend_count: 95,
        evidence_count: 400,
        headline: 'Performance footwear, digital athletics, and fan engagement'
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
    }
];

setCachedCatalogForTesting(
    { version: '1.0', generated_at: new Date().toISOString(), graph_count: mockGraphsList.length, graphs: mockGraphsList as any },
    mockAnalystsList as any
);

async function mockFoddaBackend(method: string, endpoint: string, apiKey?: string, userId?: string, body?: any): Promise<any> {
    if (endpoint.includes('/v1/graphs/catalog') || endpoint === '/v1/graphs') {
        return { graphs: mockGraphsList };
    }

    if (endpoint.includes('/v1/analysts') || endpoint.includes('/v1/human-agents')) {
        if (endpoint.includes('/consult')) {
            return {
                coverage: 'in',
                report: 'Cultural brands must anchor community-led commerce around authentic rituals.',
                sources_used: [
                    { title: 'Community Rituals in Streetwear', graphId: 'ben-dietz-sic', brandNames: ['Supreme', 'Aimé Leon Dore'] }
                ],
                expert_thread: {
                    on_topic_total: 8,
                    cited_count: 1,
                    uncited_themes: ['Zines & Subcultures', 'Discord Councils'],
                    brands: ['Supreme', 'Aimé Leon Dore'],
                    next_angle: 'We can explore how creator-led retail formats differ across European luxury markets next.'
                },
                session_id: 'sess_test_123'
            };
        }
        return mockAnalystsList;
    }

    if (endpoint.includes('/v1/supplemental/truth/')) {
        return {
            source: 'truth_layer',
            truth_layer: { ticker: 'NKE', company: 'Nike, Inc.', headline: 'Direct channel growth and inventory normalization' }
        };
    }

    if (endpoint.includes('/brand-intelligence') || endpoint.includes('/graphs/')) {
        return {
            brand: 'Nike',
            trend_footprint: [
                { title: 'Digital Athlete Ecosystems', graphId: 'sports', score: 1.9, brandNames: ['Nike', 'Apple'] },
                { title: 'Direct-to-Consumer Innovation', graphId: 'retail', score: 1.7, brandNames: ['Nike', 'Adidas'] },
                { title: 'Sustainable Performance Materials', graphId: 'sports', score: 1.6, brandNames: ['Nike'] }
            ],
            competitive_context: {
                co_occurring: [
                    { brand: 'Adidas', co_occurrences: 6, graphIds: ['retail', 'sports'] },
                    { brand: 'Lululemon', co_occurrences: 4, graphIds: ['sports'] }
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

async function runRuntimeTests() {
    const server = await createServer(
        'sk_live_test_key',
        'user_test_123',
        mockFoddaBackend as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );

    // Test A: brand_tracker("Nike")
    const brandTrackerReg: any = (server as any)._registeredTools['brand_tracker'];
    assert.ok(brandTrackerReg, 'brand_tracker tool must be registered');
    const brandTrackerFn = brandTrackerReg.handler || brandTrackerReg.callback || brandTrackerReg.execute;

    const btRes = await brandTrackerFn({ brand_name: 'Nike' }, { authInfo: {} });
    assert.ok(Array.isArray(btRes.content) && btRes.content.length > 0, 'brand_tracker must return content array');

    const btFullText = btRes.content.map((c: any) => c.text || '').join('\n');
    check(!btFullText.includes('── NEXT MOVES CLOSING BLOCK'), 'brand_tracker content does not contain NEXT MOVES CLOSING BLOCK banner');
    check(!btFullText.includes('Reproduce this exact 3-sentence closing block verbatim'), 'brand_tracker content does not contain imperative reproduction directive');

    // Extract next_moves
    let btNextMoves: NextMoves | undefined = btRes.next_moves;
    if (!btNextMoves) {
        for (const c of btRes.content) {
            if (c.text?.startsWith('{') || c.text?.includes('── RAW DATA')) {
                const raw = c.text.replace('── RAW DATA (for follow-up reasoning) ──\n', '').trim();
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.next_moves) btNextMoves = parsed.next_moves;
                } catch {}
            }
        }
    }
    check(!!btNextMoves, 'brand_tracker returns structured next_moves metadata');
    check(!!btNextMoves?.thread, 'brand_tracker next_moves has thread');
    check(!!(btNextMoves?.specific || btNextMoves?.shelf), 'brand_tracker next_moves has specific or shelf');
    check(typeof btNextMoves?.scope === 'string' && btNextMoves.scope.length > 0, `brand_tracker next_moves has scope string: "${btNextMoves?.scope}"`);

    // Test B: consult_human_agent
    const consultReg: any = (server as any)._registeredTools['consult_human_agent'];
    assert.ok(consultReg, 'consult_human_agent tool must be registered');
    const consultFn = consultReg.handler || consultReg.callback || consultReg.execute;

    const consultRes = await consultFn({ analyst_id: 'ben-dietz-sic', query: 'What is the future of creator-led retail?' }, { authInfo: {} });
    assert.ok(Array.isArray(consultRes.content) && consultRes.content.length > 0, 'consult_human_agent must return content array');

    const consultFullText = consultRes.content.map((c: any) => c.text || '').join('\n');
    check(!consultFullText.includes('── NEXT MOVES CLOSING BLOCK'), 'consult_human_agent content does not contain NEXT MOVES CLOSING BLOCK banner');
    check(!consultFullText.includes('Reproduce this exact 3-sentence closing block verbatim'), 'consult_human_agent content does not contain imperative reproduction directive');

    const consultNextMoves: NextMoves | undefined = consultRes.next_moves;
    check(!!consultNextMoves, 'consult_human_agent returns structured next_moves metadata');
    check(!!consultNextMoves?.thread, 'consult_human_agent next_moves has thread');
    check(typeof consultNextMoves?.scope === 'string' && consultNextMoves.scope.length > 0, `consult_human_agent next_moves has scope string: "${consultNextMoves?.scope}"`);
    check(!!consultNextMoves?.consult_envelope, 'consult_human_agent next_moves has consult_envelope');
    check(typeof consultNextMoves?.consult_envelope?.thread_line === 'string', 'consult_human_agent consult_envelope has thread_line');
    check(typeof consultNextMoves?.consult_envelope?.shelf_line === 'string', 'consult_human_agent consult_envelope has shelf_line');
    check(typeof consultNextMoves?.consult_envelope?.scope_line === 'string', 'consult_human_agent consult_envelope has scope_line');

    console.log(`\nVerification Summary: ${passed} checks passed, ${failed} checks failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runRuntimeTests().catch(err => {
    console.error('Verification run failed:', err);
    process.exit(1);
});
