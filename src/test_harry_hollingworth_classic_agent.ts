import assert from 'assert';
import { normalizeAnalyst, setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';
import { generateConsultNextMoves, findCandidateExperts } from './coverageRelevance.js';

async function runHarryHollingworthVerification() {
    console.log('================================================================');
    console.log(' Running Verification: Harry Hollingworth Classic Agent Suite');
    console.log('================================================================\n');

    const HOLLINGWORTH_ANCHOR = "Harry Hollingworth's Classic Agent on Fodda provides rigorous experimental psychology grounded in cognitive architecture, redintegration, and the empirical science of human work performance.";

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Catalog Normalization & Classification
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: normalizeAnalyst classification for harry-hollingworth ---');
    const rawAnalyst = {
        id: 'harry-hollingworth',
        analyst_id: 'harry-hollingworth',
        name: 'Harry Hollingworth',
        graphSubType: 'Classic Digital Twin',
        status: 'Active',
        credibility_anchor: HOLLINGWORTH_ANCHOR,
        topics: [
            'cognitive architecture',
            'mental models',
            'redintegration',
            'sensory triggers',
            'hiring methods',
            'unstructured interview bias',
            'unstructured interview fallacy',
            'aptitude tests',
            'work-sample evaluations',
            'work-sample testing',
            'corporate research integrity',
            'double-blind testing',
            'placebo controls',
            'benchmark bias',
            'high-stress performance breakdown',
            'acute operational burnout',
            'traumatic panic triggers',
            'wwi shell shock',
            'functional neurosis',
            'cognitive fatigue curves',
            'stimulant limits',
            'workforce aging'
        ],
        expert_in: 'Applied psychology, cognitive architecture (redintegration), unstructured interview fallacy, double-blind trial controls, high-stress operational burnout, panic triggers, and cognitive fatigue curves.',
        description: 'Pioneering applied psychologist, 1927 APA President, analyzing cognitive architecture (redintegration), talent selection methods, research integrity controls, high-stress operational burnout, and cognitive fatigue.'
    };

    const normalized = normalizeAnalyst(rawAnalyst);
    assert.strictEqual(normalized.category, 'classic_agent', 'Category must be classic_agent');
    assert.strictEqual(normalized.category_label, 'Classic Agent', 'Category label must be Classic Agent');
    assert.strictEqual(normalized.twin_type, 'Classic Agent', 'twin_type must be Classic Agent');
    assert.strictEqual(normalized.is_classic_agent, true, 'is_classic_agent must be true');
    assert.strictEqual(normalized.is_human_agent, false, 'is_human_agent must be false');
    assert.strictEqual(normalized.consult_tool, 'consult_analyst', 'consult_tool must be consult_analyst');
    console.log('✅ TEST 1 Passed: harry-hollingworth correctly normalized as Classic Agent with consult_analyst.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: consult_analyst Framing & Attribution Rules
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: consult_analyst framing & attribution guidance for Harry Hollingworth ---');

    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 1, graphs: [] },
        [normalized]
    );

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        if (path.includes('/v1/analysts/consult')) {
            return {
                result: "When assessing human performance, Hollingworth's experiments show that unstructured interviews correlate almost randomly with actual job success; standardized work-sample testing is required.",
                credibility_anchor: HOLLINGWORTH_ANCHOR,
                analyst: {
                    id: 'harry-hollingworth',
                    name: 'Harry Hollingworth',
                    credibility_anchor: HOLLINGWORTH_ANCHOR,
                    category: 'classic_agent',
                    is_classic_agent: true
                },
                coverage: 'FULL',
                sources_used: [
                    { title: 'Vocational Psychology (1916)', url: 'https://archive.org/details/vocationalpsychology1916' }
                ],
                // Simulate accidental or legacy upstream book_a_call payload
                book_a_call: {
                    url: 'https://example.com/book',
                    rate_display: '$500/hr'
                }
            };
        }
        if (path === '/v1/graphs') {
            return { graphs: [], disabled_graphs: [] };
        }
        return {};
    };

    const server = await createServer(
        'test_api_key',
        'test_user_hollingworth',
        mockFoddaRequest as any,
        async () => ({}),
        () => '',
        () => ''
    );
    const registeredTools = (server as any)._registeredTools;

    const consultAnalystFn = registeredTools['consult_analyst']?.handler;
    assert.ok(consultAnalystFn, 'consult_analyst tool must be registered');

    const res = await consultAnalystFn({
        analyst_id: 'harry-hollingworth',
        query: 'How do your 1916 findings on sales manager interviews apply to modern unstructured tech hiring?'
    });

    assert.ok(res, 'consult_analyst must return a valid response');
    assert.strictEqual(res.credibility_anchor, HOLLINGWORTH_ANCHOR, 'Structured response must contain credibility_anchor');

    const text = res.content?.[0]?.text || '';
    assert.ok(text.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include EXPERT CREDIBILITY ANCHOR section header');
    assert.ok(text.includes(HOLLINGWORTH_ANCHOR), 'Text section must include Harry Hollingworth credibility anchor');
    assert.ok(text.includes('When their Classic Agent on Fodda is consulted'), 'Must direct host model to use Classic Agent phrasing');
    assert.ok(text.includes('NEVER refer to historical figures as a "Human Agent"'), 'Must explicitly forbid Human Agent phrasing for historical figures');
    assert.ok(text.includes('as a "Classic Agent"'), 'Must direct to refer as Classic Agent');
    assert.ok(!text.includes('When their Human Agent on Fodda is consulted'), 'Must NOT say When their Human Agent on Fodda is consulted');

    // Verify Book a Call suppression
    assert.ok(!text.includes('--- BOOK A CALL'), 'Book a Call section must be strictly suppressed for Classic Agent');
    assert.ok(!text.includes('https://example.com/book'), 'Booking URL must not appear in output');
    console.log('✅ TEST 2 Passed: consult_analyst applies Classic Agent attribution rules and suppresses Book a Call.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Dynamic Next Moves Scoping for Harry Hollingworth
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: Dynamic Next Moves scoping for Harry Hollingworth ---');
    const mockConsultResult = {
        coverage: 'FULL',
        report: 'Cognitive redintegration demonstrates that an isolated sensory cue or UI change can reinstate the entire antecedent psychological state.',
        credibility_anchor: HOLLINGWORTH_ANCHOR,
        analyst: normalized,
        sources_used: []
    };

    const nextMoves = generateConsultNextMoves(
        mockConsultResult,
        'Consult Harry Hollingworth on how cognitive redintegration explains why sudden UI redesigns break user mental models',
        'harry-hollingworth',
        {},
        [],
        [normalized]
    );

    assert.ok(nextMoves, 'Next moves must be generated');
    assert.ok(
        !nextMoves.scope?.includes('tell me the brand or brief'),
        'Classic Agent scope must NOT ask for client brand or brief'
    );
    assert.ok(
        nextMoves.scope?.includes("apply Harry Hollingworth's framework to a specific modern case study"),
        `Scope line must offer application to modern case study, got: "${nextMoves.scope}"`
    );

    const move2 = nextMoves.moves?.find(m => m.id === 'modern_application');
    assert.ok(move2, 'Move 2 must be modern_application for Classic Agent');
    assert.strictEqual(move2?.label, 'Apply to modern culture & commerce');
    assert.ok(
        move2?.prompt.includes("Harry Hollingworth's framework apply to current consumer behavior"),
        `Move 2 prompt must reference expert framework, got: "${move2?.prompt}"`
    );

    // Ensure move 3 is not book_call
    const bookMove = nextMoves.moves?.find(m => m.id === 'book_call');
    assert.strictEqual(bookMove, undefined, 'Move 3 must NOT be book_call for Classic Agent');
    console.log('✅ TEST 3 Passed: Dynamic next moves preserves Classic Agent scoping and avoids brand brief demands.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: findCandidateExperts Local Discovery Queries
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: Candidate expert discovery for Hollingworth domain queries ---');

    const discoveryQueries = [
        'cognitive architecture mental models redintegration sensory triggers',
        'hiring methods unstructured interview bias aptitude tests work-sample evaluations',
        'corporate research integrity double-blind testing placebo controls benchmark bias',
        'high-stress performance breakdown acute operational burnout traumatic panic triggers',
        'knowledge-worker cognitive fatigue curves stimulant limits workforce aging'
    ];

    for (const q of discoveryQueries) {
        const candidates = findCandidateExperts(q, {
            limit: 3,
            analysts: [normalized]
        });
        assert.ok(candidates.length > 0, `Query "${q}" must match Harry Hollingworth`);
        const top = candidates[0];
        assert.strictEqual(top.analyst_id, 'harry-hollingworth');
        assert.strictEqual(top.category, 'classic_agent');
        assert.strictEqual(top.consult_tool, 'consult_analyst');
        console.log(`  ✓ Matched "${q.slice(0, 45)}..." -> ${top.display_name} (${top.category})`);
    }
    console.log('✅ TEST 4 Passed: All 5 discovery query archetypes successfully route to Harry Hollingworth.\n');

    console.log('================================================================');
    console.log(' All Harry Hollingworth Classic Agent Verification Tests Passed!');
    console.log('================================================================');
}

runHarryHollingworthVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
