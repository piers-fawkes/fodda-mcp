import assert from 'assert';
import { normalizeAnalyst, setCachedCatalogForTesting, type CatalogAnalyst } from './catalogCache.js';
import { createServer } from './toolHandlers.js';
import { generateConsultNextMoves, findCandidateExperts } from './coverageRelevance.js';

async function runFourClassicAgentsVerification() {
    console.log('================================================================');
    console.log(' Running Verification: 4 Classic Agents Suite');
    console.log(' (Claude Hopkins, Nellie Bly, P.T. Barnum, Vidocq)');
    console.log('================================================================\n');

    const HOPKINS_ANCHOR = "Claude Hopkins's Classic Agent on Fodda acts as a modern critique that grounds contemporary performance marketing, direct attribution, and CAC economics in his foundational frameworks of scientific advertising, coupon testing, and reason-why copy. Claude C. Hopkins (1866–1932) was an American advertising pioneer, author of Scientific Advertising (1923) and My Life in Advertising (1927), and father of modern direct-response marketing.";
    const BLY_ANCHOR = "Nellie Bly's Classic Agent on Fodda acts as a modern critique that grounds contemporary operational audits, frontline labor conditions, and executive-floor divergence in her investigative methodology of immersive undercover reporting and gatekeeper confrontation. Nellie Bly (pen name of Elizabeth Cochrane Seaman, 1864–1922) was an American investigative journalist famous for exposing institutional abuses in Ten Days in a Mad-House (1887) and pioneering around-the-world speed records.";
    const BARNUM_ANCHOR = "P.T. Barnum's Classic Agent on Fodda acts as a modern critique that grounds contemporary retail visual merchandising, storefront theater, and experiential attention architecture in his foundational promotional principles of curiosity loops, exterior magnetism, and customer circulation. Phineas Taylor Barnum (1810–1891) was an American showman, retail innovator, and master promoter who revolutionized experiential entertainment, public curiosity psychology, and commercial spectacle.";
    const VIDOCQ_ANCHOR = "Eugène-François Vidocq's Classic Agent on Fodda acts as a modern critique that grounds contemporary adversarial security, forensic auditing, and zero-trust verification in his foundational methodologies of undercover infiltration, reformed threat actor recruitment, and controlled delivery stings. Eugène-François Vidocq (1775–1857) was a French criminalist, founder and first director of the Sûreté Nationale, and the father of modern criminal investigation and adversarial forensics.";

    const rawAgents = [
        {
            id: 'claude-hopkins',
            analyst_id: 'claude-hopkins',
            name: 'Claude C. Hopkins',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: HOPKINS_ANCHOR,
            topics: [
                'performance marketing',
                'attribution',
                'cac',
                'sampling economics',
                'reason-why copy specificity',
                'vanity metrics auditing',
                'pre-digital cac',
                'coupon testing',
                'salesmanship-in-print'
            ],
            expert_in: 'Performance marketing attribution, CAC economics, and reason-why copy.',
            description: 'Pioneering direct-response advertiser analyzing performance marketing attribution, pre-digital CAC economics, coupon testing, and reason-why copy.'
        },
        {
            id: 'nellie-bly',
            analyst_id: 'nellie-bly',
            name: 'Nellie Bly',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: BLY_ANCHOR,
            topics: [
                'undercover operational auditing',
                'frontline ground truth',
                'floor reality vs executive fiction',
                'speed as competitive moat',
                'breaking gatekeeper vetoes',
                'frontline labor conditions',
                'investigative whistleblowing',
                'logistical velocity'
            ],
            expert_in: 'Frontline operational ground-truth auditing and executive-floor reality divergence.',
            description: 'Pioneering investigative journalist and industrialist analyzing frontline labor conditions, executive fiction vs floor reality, and logistical velocity.'
        },
        {
            id: 'pt-barnum',
            analyst_id: 'pt-barnum',
            name: 'P.T. Barnum',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: BARNUM_ANCHOR,
            topics: [
                'retail visual merchandising',
                'storefront theater',
                'attention architecture',
                'exterior magnetism',
                'curiosity loops',
                'the brick-man',
                'customer circulation',
                'the egress',
                'harmless humbug',
                'experiential retail'
            ],
            expert_in: 'Retail visual merchandising, storefront theater, and attention architecture.',
            description: 'Master promoter and retail spectacle pioneer analyzing visual merchandising, storefront theater, curiosity loops, and customer circulation.'
        },
        {
            id: 'eugene-francois-vidocq',
            analyst_id: 'eugene-francois-vidocq',
            name: 'Eugène-François Vidocq',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: VIDOCQ_ANCHOR,
            topics: [
                'adversarial security',
                'criminal forensics',
                'undercover infiltration',
                'zero-trust',
                'reformed threat actors',
                'controlled delivery stings',
                'institutional corruption auditing',
                'the leather gloves rule',
                'forensic verification'
            ],
            expert_in: 'Adversarial security, forensic auditing, and zero-trust verification.',
            description: 'Founder of the Sûreté Nationale and father of criminalistics analyzing adversarial security, forensic verification, zero-trust, and institutional corruption.'
        }
    ];

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Catalog Normalization & Classification
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: normalizeAnalyst classification for all 4 Classic Agents ---');
    const normalizedList: CatalogAnalyst[] = [];

    for (const raw of rawAgents) {
        const norm = normalizeAnalyst(raw);
        assert.strictEqual(norm.category, 'classic_agent', `${raw.analyst_id} category must be classic_agent`);
        assert.strictEqual(norm.category_label, 'Classic Agent', `${raw.analyst_id} category_label must be Classic Agent`);
        assert.strictEqual(norm.twin_type, 'Classic Agent', `${raw.analyst_id} twin_type must be Classic Agent`);
        assert.strictEqual(norm.is_classic_agent, true, `${raw.analyst_id} is_classic_agent must be true`);
        assert.strictEqual(norm.is_human_agent, false, `${raw.analyst_id} is_human_agent must be false`);
        assert.strictEqual(norm.consult_tool, 'consult_analyst', `${raw.analyst_id} consult_tool must be consult_analyst`);
        normalizedList.push(norm);
        console.log(`  ✓ ${norm.name} (${norm.analyst_id}) -> ${norm.category_label} [${norm.consult_tool}]`);
    }
    console.log('✅ TEST 1 Passed: All 4 thinkers correctly normalized as Classic Agents with consult_analyst.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: consult_analyst Framing & Attribution Rules
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: consult_analyst framing & attribution guidance for all 4 Classic Agents ---');

    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 4, graphs: [] },
        normalizedList
    );

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        const aId = body?.analyst_id;
        const matched = normalizedList.find(a => a.analyst_id === aId || (a as any).id === aId);
        if (path.includes('/v1/analysts/consult')) {
            return {
                result: `Strategic analysis and critique from ${matched?.name || aId}.`,
                credibility_anchor: matched?.credibility_anchor,
                analyst: {
                    id: aId,
                    name: matched?.name,
                    credibility_anchor: matched?.credibility_anchor,
                    category: 'classic_agent',
                    is_classic_agent: true
                },
                coverage: 'FULL',
                sources_used: [
                    { title: `Historical treatise of ${matched?.name}`, url: 'https://archive.org/example' }
                ],
                // Simulate accidental upstream booking payload
                book_a_call: { url: `https://example.com/${aId}-book`, rate_display: '$500/hr' }
            };
        }
        if (path === '/v1/graphs') {
            return { graphs: [], disabled_graphs: [] };
        }
        return {};
    };

    const server = await createServer(
        'test_api_key',
        'test_user_four_classics',
        mockFoddaRequest as any,
        async () => ({}),
        () => '',
        () => ''
    );
    const registeredTools = (server as any)._registeredTools;
    const consultAnalystFn = registeredTools['consult_analyst']?.handler;
    assert.ok(consultAnalystFn, 'consult_analyst tool must be registered');

    for (const norm of normalizedList) {
        const res = await consultAnalystFn({
            analyst_id: norm.analyst_id,
            query: `Strategic inquiry for ${norm.name}`
        });
        const text = res.content?.[0]?.text || '';
        assert.ok(text.includes('--- EXPERT CREDIBILITY ANCHOR ---'), `${norm.analyst_id} text must include credibility anchor header`);
        assert.ok(text.includes(norm.credibility_anchor!), `${norm.analyst_id} text must include credibility anchor verbatim`);
        assert.ok(text.includes('When their Classic Agent on Fodda is consulted'), `${norm.analyst_id} must direct to use Classic Agent phrasing`);
        assert.ok(text.includes('NEVER refer to historical figures as a "Human Agent"'), `${norm.analyst_id} must prohibit Human Agent phrasing`);
        assert.ok(!text.includes('When their Human Agent on Fodda is consulted'), `${norm.analyst_id} must not say Human Agent`);
        assert.ok(!text.includes('--- BOOK A CALL'), `${norm.analyst_id} Book a Call must be suppressed`);
        assert.ok(!text.includes(`https://example.com/${norm.analyst_id}-book`), `${norm.analyst_id} booking URL must be suppressed`);
        console.log(`  ✓ ${norm.name}: Attribution guidance verified & Book a Call suppressed`);
    }
    console.log('✅ TEST 2 Passed: Attribution guidance enforced and Book a Call suppressed across all 4 thinkers.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Dynamic Next Moves Scoping
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: Dynamic Next Moves scoping for all 4 thinkers ---');

    for (const norm of normalizedList) {
        const nextMoves = generateConsultNextMoves(
            { coverage: 'FULL', report: `Report for ${norm.name}`, credibility_anchor: norm.credibility_anchor, analyst: norm, sources_used: [] },
            `Strategic inquiry for ${norm.name}`,
            norm.analyst_id,
            {},
            [],
            normalizedList
        );
        assert.ok(!nextMoves.scope?.includes('tell me the brand or brief'), `${norm.analyst_id} scope must not ask for brand or brief`);
        assert.ok(nextMoves.scope?.includes(`apply ${norm.name}'s framework to a specific modern case study`), `${norm.analyst_id} scope must offer modern case study, got: "${nextMoves.scope}"`);
        const move2 = nextMoves.moves?.find(m => m.id === 'modern_application');
        assert.ok(move2, `${norm.analyst_id} move 2 must be modern_application`);
        assert.strictEqual(nextMoves.moves?.find(m => m.id === 'book_call'), undefined, `${norm.analyst_id} move 3 must not be book_call`);
        console.log(`  ✓ ${norm.name}: Next moves scope -> "${nextMoves.scope}"`);
    }
    console.log('✅ TEST 3 Passed: Dynamic next moves preserves Classic Agent scoping for all 4 thinkers.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Candidate Expert Discovery Queries
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: Candidate expert discovery queries ---');

    const testQueries = [
        // Claude Hopkins trigger queries
        { query: 'performance marketing attribution cac economics', expectedId: 'claude-hopkins' },
        { query: 'sampling economics reason-why copy specificity vanity metrics auditing', expectedId: 'claude-hopkins' },
        // Nellie Bly trigger queries
        { query: 'undercover operational auditing frontline ground truth', expectedId: 'nellie-bly' },
        { query: 'floor reality vs executive fiction speed as competitive moat breaking gatekeeper vetoes', expectedId: 'nellie-bly' },
        // P.T. Barnum trigger queries
        { query: 'retail visual merchandising storefront theater attention architecture', expectedId: 'pt-barnum' },
        { query: 'exterior magnetism curiosity loops brick-man customer circulation the egress harmless humbug', expectedId: 'pt-barnum' },
        // Eugène-François Vidocq trigger queries
        { query: 'adversarial security criminal forensics undercover infiltration zero-trust', expectedId: 'eugene-francois-vidocq' },
        { query: 'reformed threat actors controlled delivery stings institutional corruption auditing leather gloves rule', expectedId: 'eugene-francois-vidocq' }
    ];

    for (const t of testQueries) {
        const candidates = findCandidateExperts(t.query, {
            limit: 3,
            analysts: normalizedList
        });
        assert.ok(candidates.length > 0, `Query "${t.query}" must return candidate`);
        assert.strictEqual(candidates[0]?.analyst_id, t.expectedId, `Top candidate for "${t.query}" must be ${t.expectedId}`);
        assert.strictEqual(candidates[0]?.category, 'classic_agent');
        assert.strictEqual(candidates[0]?.consult_tool, 'consult_analyst');
        console.log(`  ✓ Matched "${t.query.slice(0, 45)}..." -> ${candidates[0]?.display_name} (${candidates[0]?.category})`);
    }
    console.log('✅ TEST 4 Passed: All trigger queries route to their respective Classic Agents.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Cost Silence & Zero Pricing Emitted
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 5: Zero dollar figures or promo tags emitted ---');
    for (const norm of normalizedList) {
        const res = await consultAnalystFn({
            analyst_id: norm.analyst_id,
            query: `Pricing check for ${norm.name}`
        });
        const text = res.content?.[0]?.text || '';
        assert.ok(!text.includes('$'), `${norm.analyst_id} output must not emit dollar signs`);
        assert.ok(!text.includes('tokens'), `${norm.analyst_id} output must not mention tokens`);
        assert.ok(!text.includes('SPT'), `${norm.analyst_id} output must not mention SPT`);
        console.log(`  ✓ ${norm.name}: Cost silence verified (no $, tokens, or SPT)`);
    }
    console.log('✅ TEST 5 Passed: Zero dollar figures, tokens, or promo tags emitted across all 4 thinkers.\n');

    console.log('================================================================');
    console.log(' All 4 Classic Agents (Hopkins, Bly, Barnum, Vidocq) Passed!');
    console.log('================================================================');
}

runFourClassicAgentsVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
