import assert from 'assert';
import { normalizeAnalyst, setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';
import { generateConsultNextMoves, findCandidateExperts } from './coverageRelevance.js';

async function runFrederickAndTardeVerification() {
    console.log('================================================================');
    console.log(' Running Verification: Christine Frederick & Gabriel Tarde Suite');
    console.log('================================================================\n');

    const FREDERICK_ANCHOR = "Christine Frederick's Classic Agent on Fodda acts as a modern critique that grounds contemporary consumer hardware, smart home tech, and diagnostic beauty gadgets in her foundational frameworks of consumer engineering, domestic habit restructuring, and progressive obsolescence. Christine was a pioneering home economist, founder of the Applecroft Home Experiment Station, and author of Selling Mrs. Consumer (1929) and The New Housekeeping (1913).";
    const TARDE_ANCHOR = "Gabriel Tarde's Classic Agent on Fodda acts as a modern critique that grounds contemporary viral network dynamics, connected lifestyle platforms, and experiential brand valuation in his foundational frameworks of imitation, social somnambulism, and economic psychology. Gabriel was a pioneering French sociologist, criminologist, Professor at the Collège de France, and author of The Laws of Imitation (1890) and Economic Psychology (1902).";

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Catalog Normalization & Classification
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: normalizeAnalyst classification for Frederick & Tarde ---');
    const rawFrederick = {
        id: 'christine-frederick',
        analyst_id: 'christine-frederick',
        name: 'Christine Frederick',
        graphSubType: 'Classic Digital Twin',
        status: 'Active',
        credibility_anchor: FREDERICK_ANCHOR,
        topics: [
            'smart home hardware',
            'connected kitchen appliances',
            'diagnostic beauty tools',
            'razor-and-blade subscription refill models',
            'appliance churn',
            'home economics',
            'habit-engineering',
            'consumer engineering',
            'maintenance overhead paradox',
            'progressive obsolescence'
        ],
        expert_in: 'Domestic tech ecosystems, retail monetization, consumer habit engineering, appliance churn, and product obsolescence.',
        description: 'Pioneering home economist, author of Selling Mrs. Consumer (1929) and The New Housekeeping (1913), and architect of Consumer Engineering analyzing domestic tech ecosystems and habit restructuring.'
    };

    const rawTarde = {
        id: 'gabriel-tarde',
        analyst_id: 'gabriel-tarde',
        name: 'Gabriel Tarde',
        graphSubType: 'Classic Digital Twin',
        status: 'Active',
        credibility_anchor: TARDE_ANCHOR,
        topics: [
            'viral adoption',
            'social contagion',
            'influencer seeding',
            'mimetic desire',
            'experiential brand value',
            'connected lifestyle platforms',
            'community ritual hardware',
            'laws of imitation',
            'social somnambulism',
            'prestige cascades'
        ],
        expert_in: 'Behavioral contagion, networked lifestyle platforms, experiential value creation, and social rituals.',
        description: 'Foundational sociologist, Professor at the Collège de France, and author of The Laws of Imitation (1890) and Economic Psychology (1902) analyzing behavioral contagion and social networks.'
    };

    const normFrederick = normalizeAnalyst(rawFrederick);
    assert.strictEqual(normFrederick.category, 'classic_agent', 'Frederick category must be classic_agent');
    assert.strictEqual(normFrederick.category_label, 'Classic Agent', 'Frederick category_label must be Classic Agent');
    assert.strictEqual(normFrederick.twin_type, 'Classic Agent', 'Frederick twin_type must be Classic Agent');
    assert.strictEqual(normFrederick.is_classic_agent, true, 'Frederick is_classic_agent must be true');
    assert.strictEqual(normFrederick.is_human_agent, false, 'Frederick is_human_agent must be false');
    assert.strictEqual(normFrederick.consult_tool, 'consult_analyst', 'Frederick consult_tool must be consult_analyst');

    const normTarde = normalizeAnalyst(rawTarde);
    assert.strictEqual(normTarde.category, 'classic_agent', 'Tarde category must be classic_agent');
    assert.strictEqual(normTarde.category_label, 'Classic Agent', 'Tarde category_label must be Classic Agent');
    assert.strictEqual(normTarde.twin_type, 'Classic Agent', 'Tarde twin_type must be Classic Agent');
    assert.strictEqual(normTarde.is_classic_agent, true, 'Tarde is_classic_agent must be true');
    assert.strictEqual(normTarde.is_human_agent, false, 'Tarde is_human_agent must be false');
    assert.strictEqual(normTarde.consult_tool, 'consult_analyst', 'Tarde consult_tool must be consult_analyst');

    console.log('✅ TEST 1 Passed: Both Frederick and Tarde correctly normalized as Classic Agents with consult_analyst.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: consult_analyst Framing & Attribution Rules
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: consult_analyst framing & attribution guidance for Frederick & Tarde ---');

    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 2, graphs: [] },
        [normFrederick, normTarde]
    );

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        const aId = body?.analyst_id;
        if (path.includes('/v1/analysts/consult')) {
            if (aId === 'christine-frederick') {
                return {
                    result: "Audit of diagnostic beauty hardware indicates a recurring maintenance overhead paradox where cleanup time exceeds utility.",
                    credibility_anchor: FREDERICK_ANCHOR,
                    analyst: {
                        id: 'christine-frederick',
                        name: 'Christine Frederick',
                        credibility_anchor: FREDERICK_ANCHOR,
                        category: 'classic_agent',
                        is_classic_agent: true
                    },
                    coverage: 'FULL',
                    sources_used: [
                        { title: 'Selling Mrs. Consumer (1929)', url: 'https://archive.org/details/sellingmrsconsumer' }
                    ],
                    book_a_call: { url: 'https://example.com/frederick-book', rate_display: '$500/hr' }
                };
            }
            if (aId === 'gabriel-tarde') {
                return {
                    result: "Smart retail hardware functions as a material anchor capturing imitative waves across prestige cascades.",
                    credibility_anchor: TARDE_ANCHOR,
                    analyst: {
                        id: 'gabriel-tarde',
                        name: 'Gabriel Tarde',
                        credibility_anchor: TARDE_ANCHOR,
                        category: 'classic_agent',
                        is_classic_agent: true
                    },
                    coverage: 'FULL',
                    sources_used: [
                        { title: 'The Laws of Imitation (1890)', url: 'https://archive.org/details/lawsofimitation' }
                    ],
                    book_a_call: { url: 'https://example.com/tarde-book', rate_display: '$500/hr' }
                };
            }
        }
        if (path === '/v1/graphs') {
            return { graphs: [], disabled_graphs: [] };
        }
        return {};
    };

    const server = await createServer(
        'test_api_key',
        'test_user_frederick_tarde',
        mockFoddaRequest as any,
        async () => ({}),
        () => '',
        () => ''
    );
    const registeredTools = (server as any)._registeredTools;
    const consultAnalystFn = registeredTools['consult_analyst']?.handler;
    assert.ok(consultAnalystFn, 'consult_analyst tool must be registered');

    // Consult Christine Frederick
    const resF = await consultAnalystFn({
        analyst_id: 'christine-frederick',
        query: 'How does the maintenance overhead paradox diagnose smart beauty tool adoption?'
    });
    const textF = resF.content?.[0]?.text || '';
    assert.ok(textF.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include credibility anchor header');
    assert.ok(textF.includes(FREDERICK_ANCHOR), 'Text must include Christine Frederick anchor verbatim');
    assert.ok(textF.includes('When their Classic Agent on Fodda is consulted'), 'Must use Classic Agent phrasing');
    assert.ok(textF.includes('NEVER refer to historical figures as a "Human Agent"'), 'Must prohibit Human Agent phrasing');
    assert.ok(!textF.includes('When their Human Agent on Fodda is consulted'), 'Must not say Human Agent');
    assert.ok(!textF.includes('--- BOOK A CALL'), 'Book a Call must be suppressed for Frederick');
    assert.ok(!textF.includes('https://example.com/frederick-book'), 'Booking URL must be suppressed');

    // Consult Gabriel Tarde
    const resT = await consultAnalystFn({
        analyst_id: 'gabriel-tarde',
        query: 'How do prestige cascades drive smart connected hardware adoption?'
    });
    const textT = resT.content?.[0]?.text || '';
    assert.ok(textT.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include credibility anchor header');
    assert.ok(textT.includes(TARDE_ANCHOR), 'Text must include Gabriel Tarde anchor verbatim');
    assert.ok(textT.includes('When their Classic Agent on Fodda is consulted'), 'Must use Classic Agent phrasing');
    assert.ok(textT.includes('NEVER refer to historical figures as a "Human Agent"'), 'Must prohibit Human Agent phrasing');
    assert.ok(!textT.includes('--- BOOK A CALL'), 'Book a Call must be suppressed for Tarde');
    assert.ok(!textT.includes('https://example.com/tarde-book'), 'Booking URL must be suppressed');

    console.log('✅ TEST 2 Passed: consult_analyst enforces Classic Agent attribution rules and suppresses Book a Call for both thinkers.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Dynamic Next Moves Scoping
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: Dynamic Next Moves scoping for Frederick & Tarde ---');

    const nextMovesF = generateConsultNextMoves(
        { coverage: 'FULL', report: 'Maintenance overhead analysis', credibility_anchor: FREDERICK_ANCHOR, analyst: normFrederick, sources_used: [] },
        'Audit whether proprietary kitchen hardware creates genuine lifetime utility',
        'christine-frederick',
        {},
        [],
        [normFrederick, normTarde]
    );
    assert.ok(!nextMovesF.scope?.includes('tell me the brand or brief'), 'Frederick scope must not ask for brand or brief');
    assert.ok(nextMovesF.scope?.includes("apply Christine Frederick's framework to a specific modern case study"), 'Frederick scope must offer modern case study');
    const move2F = nextMovesF.moves?.find(m => m.id === 'modern_application');
    assert.ok(move2F, 'Frederick move 2 must be modern_application');
    assert.strictEqual(nextMovesF.moves?.find(m => m.id === 'book_call'), undefined, 'Frederick move 3 must not be book_call');

    const nextMovesT = generateConsultNextMoves(
        { coverage: 'FULL', report: 'Laws of imitation analysis', credibility_anchor: TARDE_ANCHOR, analyst: normTarde, sources_used: [] },
        'How does smart retail hardware rely on inter-subjective social imitation?',
        'gabriel-tarde',
        {},
        [],
        [normFrederick, normTarde]
    );
    assert.ok(!nextMovesT.scope?.includes('tell me the brand or brief'), 'Tarde scope must not ask for brand or brief');
    assert.ok(nextMovesT.scope?.includes("apply Gabriel Tarde's framework to a specific modern case study"), 'Tarde scope must offer modern case study');
    const move2T = nextMovesT.moves?.find(m => m.id === 'modern_application');
    assert.ok(move2T, 'Tarde move 2 must be modern_application');
    assert.strictEqual(nextMovesT.moves?.find(m => m.id === 'book_call'), undefined, 'Tarde move 3 must not be book_call');

    console.log('✅ TEST 3 Passed: Dynamic next moves preserves Classic Agent scoping and avoids brand brief demands.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Candidate expert discovery for Hollingworth domain queries
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: Candidate expert discovery queries ---');

    const frederickQueries = [
        'smart home hardware connected kitchen appliances',
        'diagnostic beauty tools razor-and-blade subscription refill models',
        'appliance churn and home economics',
        'domestic habit-engineering and maintenance overhead paradox'
    ];

    for (const q of frederickQueries) {
        const candidates = findCandidateExperts(q, {
            limit: 3,
            analysts: [normFrederick, normTarde]
        });
        assert.ok(candidates.length > 0, `Query "${q}" must match a candidate`);
        assert.strictEqual(candidates[0]?.analyst_id, 'christine-frederick', `Top candidate for "${q}" must be Christine Frederick`);
        assert.strictEqual(candidates[0]?.category, 'classic_agent');
        assert.strictEqual(candidates[0]?.consult_tool, 'consult_analyst');
        console.log(`  ✓ Matched "${q.slice(0, 45)}..." -> ${candidates[0]?.display_name} (${candidates[0]?.category})`);
    }

    const tardeQueries = [
        'viral adoption social contagion influencer seeding',
        'mimetic desire and experiential brand value',
        'connected lifestyle platforms community ritual hardware',
        'laws of imitation prestige cascades belief and desire'
    ];

    for (const q of tardeQueries) {
        const candidates = findCandidateExperts(q, {
            limit: 3,
            analysts: [normFrederick, normTarde]
        });
        assert.ok(candidates.length > 0, `Query "${q}" must match a candidate`);
        assert.strictEqual(candidates[0]?.analyst_id, 'gabriel-tarde', `Top candidate for "${q}" must be Gabriel Tarde`);
        assert.strictEqual(candidates[0]?.category, 'classic_agent');
        assert.strictEqual(candidates[0]?.consult_tool, 'consult_analyst');
        console.log(`  ✓ Matched "${q.slice(0, 45)}..." -> ${candidates[0]?.display_name} (${candidates[0]?.category})`);
    }

    console.log('✅ TEST 4 Passed: All discovery query archetypes route cleanly to Christine Frederick and Gabriel Tarde.\n');

    console.log('================================================================');
    console.log(' All Christine Frederick & Gabriel Tarde Tests Passed Successfully!');
    console.log('================================================================');
}

runFrederickAndTardeVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
