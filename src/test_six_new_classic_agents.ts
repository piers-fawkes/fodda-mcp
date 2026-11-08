import assert from 'assert';
import { normalizeAnalyst, setCachedCatalogForTesting, type CatalogAnalyst } from './catalogCache.js';
import { createServer } from './toolHandlers.js';
import { generateConsultNextMoves, findCandidateExperts } from './coverageRelevance.js';

async function runSixNewClassicAgentsVerification() {
    console.log('================================================================');
    console.log(' Running Verification: 6 New Classic Agents Suite');
    console.log(' (Ibn Khaldun, Kautilya, Walker, Follett, Gilbreth, Simmel)');
    console.log('================================================================\n');

    const KHALDUN_ANCHOR = "Ibn Khaldun's Classic Agent on Fodda acts as a modern critique that grounds contemporary corporate culture, platform take-rates, and enterprise lifecycles in his foundational frameworks of Asabiyyah, dynastic decay, and incentive economics. Ibn Khaldun was a 14th-century North African scholar, widely regarded as the foundational father of sociology, historiography, and political economy, and author of The Muqaddimah (1377).";
    const KAUTILYA_ANCHOR = "Kautilya's Classic Agent on Fodda grounds modern supply chain defense, marketplace governance, and corporate realpolitik in his masterwork, the Arthashastra (c. 300 BCE). Chanakya engineered the Mauryan Empire, the largest and most prosperous empire in classical Indian history, through unsparing economic realism and institutional discipline.";
    const WALKER_ANCHOR = "Madam C.J. Walker's Classic Agent on Fodda models the strategic economics of direct-to-consumer sales, decentralized creator networks, and community brand equity. Born Sarah Breedlove to formerly enslaved parents in 1867, she built an international manufacturing and distribution empire employing over 20,000 independent sales agents across North America and the Caribbean, becoming America's first self-made female millionaire.";
    const FOLLETT_ANCHOR = "Mary Parker Follett's Classic Agent on Fodda models organizational dynamics, flat hierarchy, and constructive conflict resolution. Decades before contemporary agile management, Follett advised British and American industrial leaders, establishing the principles of 'power-with,' integration over compromise, and the Law of the Situation in works like Creative Experience (1924) and Dynamic Administration (1941).";
    const GILBRETH_ANCHOR = "Lillian Moller Gilbreth's Classic Agent on Fodda grounds UX design, workplace ergonomics, and operational efficiency in human psychology and motion study. With a PhD in psychology from Brown University, she was America's first industrial/organizational psychologist, holder of numerous appliance patents (including the foot-pedal trash can and refrigerator door shelves), and co-creator of modern motion study.";
    const SIMMEL_ANCHOR = "Georg Simmel's Classic Agent on Fodda grounds attention economics, crypto tokenization, and cultural fashion cascades in foundational sociological theory. A leading thinker of the German intellectual golden age alongside Max Weber, Simmel analyzed how abstract currency and metropolitan sensory overload rewired human consciousness and social network structures.";

    const rawAgents = [
        {
            id: 'ibn-khaldun',
            analyst_id: 'ibn-khaldun',
            name: 'Ibn Khaldun',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: KHALDUN_ANCHOR,
            topics: ['organizational culture', 'asabiyyah', 'team cohesion', 'enterprise lifecycle decay', 'platform take-rate', 'tax curve', 'luxury trap', 'cooperative labor'],
            expert_in: 'Organizational cohesion (asabiyyah) and institutional lifecycle decay.',
            description: 'Preeminent Arab historian, sociologist, and economic pioneer analyzing organizational culture, Asabiyyah, and lifecycle decay.'
        },
        {
            id: 'kautilya',
            analyst_id: 'kautilya',
            name: 'Kautilya (Chanakya)',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: KAUTILYA_ANCHOR,
            topics: ['economic realism', 'artha', 'supply chain resilience', 'buffer stocks', 'fraud detection', 'marketplace surveillance', 'institutional anatomy', 'competitive realpolitik'],
            expert_in: 'Supply chain resilience and marketplace fraud oversight.',
            description: 'Ancient Indian statesman, prime minister, and master of political economy analyzing supply chain resilience, fraud detection, and realpolitik.'
        },
        {
            id: 'madam-cj-walker',
            analyst_id: 'madam-cj-walker',
            name: 'Madam C.J. Walker',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: WALKER_ANCHOR,
            topics: ['decentralized agent networks', 'creator networks', 'direct-to-consumer distribution', 'beauty culture', 'brand trust', 'community wealth creation', 'vocational certification'],
            expert_in: 'Decentralized agent networks and direct-to-consumer distribution.',
            description: 'America\'s first self-made female millionaire and beauty industrialist analyzing decentralized sales agent networks and DTC distribution.'
        },
        {
            id: 'mary-parker-follett',
            analyst_id: 'mary-parker-follett',
            name: 'Mary Parker Follett',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: FOLLETT_ANCHOR,
            topics: ['organizational design', 'lateral authority', 'constructive conflict', 'integration over compromise', 'power-with', 'the law of the situation', 'cross-functional coordination'],
            expert_in: 'Organizational design and constructive conflict resolution.',
            description: 'Pioneering management philosopher analyzing organizational design, lateral authority, and integration over compromise.'
        },
        {
            id: 'lillian-gilbreth',
            analyst_id: 'lillian-gilbreth',
            name: 'Lillian Moller Gilbreth',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: GILBRETH_ANCHOR,
            topics: ['human factors engineering', 'workplace ergonomics', 'motion study', 'therbligs', 'the kitchen work triangle', 'process charting', 'fatigue reduction', 'human-centered efficiency'],
            expert_in: 'Workplace ergonomics and human factors engineering.',
            description: 'Industrial engineer and human factors pioneer analyzing workplace ergonomics, motion study, and fatigue elimination.'
        },
        {
            id: 'georg-simmel',
            analyst_id: 'georg-simmel',
            name: 'Georg Simmel',
            graphSubType: 'Classic Digital Twin',
            status: 'Active',
            credibility_anchor: SIMMEL_ANCHOR,
            topics: ['philosophy of money', 'abstract quantification', 'sensory overload', 'blase attitude', 'fashion dialectic', 'the stranger', 'triad network dynamics', 'tertius gaudens'],
            expert_in: 'The philosophy of money and attention economics (blasé attitude).',
            description: 'Foundational sociologist and philosopher analyzing the philosophy of money, pricing abstractions, and metropolitan sensory overload.'
        }
    ];

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Catalog Normalization & Classification
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: normalizeAnalyst classification for all 6 thinkers ---');
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
    console.log('✅ TEST 1 Passed: All 6 thinkers correctly normalized as Classic Agents with consult_analyst.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: consult_analyst Framing & Attribution Rules
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: consult_analyst framing & attribution guidance for all 6 thinkers ---');

    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 6, graphs: [] },
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
        'test_user_six_classics',
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
    console.log('✅ TEST 2 Passed: Attribution guidance enforced and Book a Call suppressed across all 6 thinkers.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Dynamic Next Moves Scoping
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: Dynamic Next Moves scoping across all 6 thinkers ---');

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
    console.log('✅ TEST 3 Passed: Dynamic next moves preserves Classic Agent scoping for all 6 thinkers.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Candidate Expert Discovery Queries
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: Candidate expert discovery queries ---');

    const testQueries = [
        { query: 'organizational culture asabiyyah team cohesion lifecycle decay platform take-rate', expectedId: 'ibn-khaldun' },
        { query: 'supply chain resilience buffer stocks marketplace fraud controls realpolitik', expectedId: 'kautilya' },
        { query: 'decentralized sales agent creator networks direct-to-consumer distribution', expectedId: 'madam-cj-walker' },
        { query: 'lateral authority constructive conflict integration over compromise law of the situation', expectedId: 'mary-parker-follett' },
        { query: 'human factors engineering workplace ergonomics motion study therbligs kitchen work triangle', expectedId: 'lillian-gilbreth' },
        { query: 'philosophy of money abstract pricing sensory overload blase attitude fashion dialectic', expectedId: 'georg-simmel' }
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
    console.log('✅ TEST 4 Passed: All 6 discovery queries route to their respective Classic Agents.\n');

    console.log('================================================================');
    console.log(' All 6 New Classic Agent Verification Tests Passed Successfully!');
    console.log('================================================================');
}

runSixNewClassicAgentsVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
