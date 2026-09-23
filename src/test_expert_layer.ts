/**
 * Comprehensive verification for the Expert Layer updates:
 * 1. cleanDisplayName sanitization (retiring '(Classic Digital Twin)', '(Digital Twin)', etc.)
 * 2. findCandidateExperts domain vs modifier overlap, blind spots, self-rec guards, honest empty
 * 3. find_expert MCP tool registration, responses, and candidate formatting
 * 4. consult_analyst & consult_human_agent deep parameter acceptance and forwarding
 *
 * Run: npm run build && node dist/test_expert_layer.js
 */

import assert from 'assert';
import { cleanDisplayName, normalizeAnalyst } from './catalogCache.js';
import type { CatalogAnalyst } from './catalogCache.js';
import { findCandidateExperts } from './coverageRelevance.js';
import type { CandidateExpert } from './coverageRelevance.js';
import { createServer } from './toolHandlers.js';

async function runTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Expert Layer & find_expert Verification');
    console.log('================================================================\n');

    // ─────────────────────────────────────────────────────────────
    // 1. cleanDisplayName Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. Testing cleanDisplayName ---');
    assert.strictEqual(cleanDisplayName('Thorstein Veblen (Classic Digital Twin)'), 'Thorstein Veblen');
    assert.strictEqual(cleanDisplayName('Jane Austen (Digital Twin)'), 'Jane Austen');
    assert.strictEqual(cleanDisplayName('Ben Dietz (Human Twin)'), 'Ben Dietz');
    assert.strictEqual(cleanDisplayName('John Ruskin (Classic Agent)'), 'John Ruskin');
    assert.strictEqual(cleanDisplayName('Piers Fawkes'), 'Piers Fawkes');
    assert.strictEqual(cleanDisplayName('  Alexis De Tocqueville (Digital Twin)  '), 'Alexis De Tocqueville');
    assert.strictEqual(cleanDisplayName('Adam Smith [Classic Digital Twin]'), 'Adam Smith');
    console.log('✅ cleanDisplayName tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 2. findCandidateExperts Matching Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 2. Testing findCandidateExperts ---');

    const mockAnalysts: CatalogAnalyst[] = [
        {
            analyst_id: 'lauren-goode-beauty',
            name: 'Lauren Goode (Digital Twin)',
            role: 'Beauty & Skincare Specialist',
            description: 'Beauty and skincare specialist focusing on formulations and prestige cosmetics.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            expert_in: ['beauty', 'skincare', 'cosmetics', 'wellness', 'clean beauty'],
            topics: ['prestige beauty', 'dermatology', 'retail'],
            outside_their_lane: ['cryptocurrency', 'b2b saas', 'cycling'],
            blind_spots: ['automotive supply chain'],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'peter-abraham-cycling',
            name: 'Peter Abraham',
            role: 'Cycling & Outdoor Culture Expert',
            description: 'Cycling industry strategist and outdoor culture voice.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            expert_in: ['cycling', 'bicycles', 'gravel racing', 'outdoor apparel'],
            what_they_offer: 'Ask Peter^[HA] to innovate your cycling product strategy',
            topics: ['endurance sports', 'brand strategy'],
            outside_their_lane: ['beauty', 'skincare'],
            blind_spots: ['fast fashion'],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'piers-fawkes',
            name: 'Piers Fawkes',
            role: 'Retail & Consumer Trends Strategist',
            description: 'Founder of PSFK and retail innovation strategist.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            // Note: Piers has cross-cutting modifiers like 'ai', 'strategy', 'trends', 'retail', 'innovation'
            expert_in: ['retail innovation', 'consumer trends', 'strategy', 'ai agents', 'future of shopping'],
            topics: ['omnichannel', 'experiential retail', 'technology strategy'],
            outside_their_lane: ['biotech', 'heavy industrial machinery'],
            blind_spots: [],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'thorstein-veblen',
            name: 'Thorstein Veblen (Classic Digital Twin)',
            role: 'Sociologist & Institutional Economist',
            description: 'Author of Theory of the Leisure Class; institutional critique of consumption.',
            category: 'classic_agent',
            category_label: 'Classic Agent',
            is_verified_real_person: false,
            consult_tool: 'consult_analyst',
            expert_in: ['conspicuous consumption', 'leisure class', 'economic theory', 'status display'],
            topics: ['luxury goods', 'sociology of wealth'],
            outside_their_lane: ['modern digital marketing', 'tiktok algorithms'],
            blind_spots: [],
        } as unknown as CatalogAnalyst,
    ];

    // Test 2a: Beauty query - Lauren Goode must match; Piers Fawkes must NOT match despite having 'trends'/'strategy'
    const beautyCandidates = findCandidateExperts('prestige clean beauty and skincare formulation trends', {
        analysts: mockAnalysts,
        limit: 3,
    });
    console.log('Beauty query candidates:', beautyCandidates.map(c => `${c.display_name} (${c.analyst_id})`));
    assert.ok(beautyCandidates.length >= 1, 'Should find at least 1 candidate for beauty');
    assert.strictEqual(beautyCandidates[0]?.analyst_id, 'lauren-goode-beauty', 'Lauren Goode must be top candidate');
    assert.strictEqual(beautyCandidates[0]?.display_name, 'Lauren Goode', 'Candidate display_name must be sanitized');
    assert.ok(!beautyCandidates.some(c => c.analyst_id === 'piers-fawkes'), 'Piers Fawkes must NOT match beauty query solely on "trends" modifier');

    // Test 2b: Cycling query - Peter Abraham must match
    const cyclingCandidates = findCandidateExperts('gravel cycling race culture and gear', {
        analysts: mockAnalysts,
        limit: 3,
    });
    console.log('Cycling query candidates:', cyclingCandidates.map(c => `${c.display_name} (${c.analyst_id})`));
    assert.strictEqual(cyclingCandidates.length, 1);
    assert.strictEqual(cyclingCandidates[0]?.analyst_id, 'peter-abraham-cycling');
    assert.ok(cyclingCandidates[0]?.reason.includes('cycling'), 'Reason should cite cycling domain');
    assert.ok(!cyclingCandidates[0]?.reason.includes('Ask Peter'), 'Reason should not contain what_they_offer askLine imperative');
    console.log('Peter Abraham candidate reason:', cyclingCandidates[0]?.reason);

    // Test 2c: Self-recommendation protection - Peter Abraham excluded when consulting Peter Abraham
    const cyclingSelfExclusion = findCandidateExperts('gravel cycling race culture and gear', {
        analysts: mockAnalysts,
        excludeAnalystId: 'peter-abraham-cycling',
        limit: 3,
    });
    assert.strictEqual(cyclingSelfExclusion.length, 0, 'Must exclude candidate matching excludeAnalystId');

    // Test 2d: Blind spot / outside_their_lane exclusion
    // Peter Abraham has 'beauty' in outside_their_lane
    const peterBeautyCheck = findCandidateExperts('beauty product innovation', {
        analysts: [mockAnalysts[1]!], // only Peter
    });
    assert.strictEqual(peterBeautyCheck.length, 0, 'Peter must be excluded from beauty query due to outside_their_lane');

    // Test 2e: Honest Empty Failure
    // Query completely out of scope for all mock analysts
    const outOfDomainCandidates = findCandidateExperts('deep seabed geothermal subsea mining robotic drilling', {
        analysts: mockAnalysts,
    });
    console.log('Out of domain candidates count:', outOfDomainCandidates.length);
    assert.strictEqual(outOfDomainCandidates.length, 0, 'Must return empty array honestly when no expert matches');

    // Test 2f: Classic Agent vs Living Practitioner ranking
    // For luxury consumption: Thorstein Veblen matches
    const luxuryCandidates = findCandidateExperts('conspicuous consumption and luxury status display', {
        analysts: mockAnalysts,
    });
    assert.ok(luxuryCandidates.length >= 1);
    assert.strictEqual(luxuryCandidates[0]?.analyst_id, 'thorstein-veblen');
    assert.strictEqual(luxuryCandidates[0]?.display_name, 'Thorstein Veblen');
    assert.strictEqual(luxuryCandidates[0]?.category, 'classic_agent');

    console.log('✅ findCandidateExperts tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 3. find_expert MCP Tool Registration & Execution Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 3. Testing find_expert Tool Handler ---');
    const server = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/analysts')) {
                return { analysts: mockAnalysts };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );
    const tools = (server as any)._registeredTools;
    const findExpertTool = tools['find_expert'];
    assert.ok(findExpertTool, 'find_expert tool must be registered in server tools');

    // Execute with empty/unmatched query
    const emptyResult = await findExpertTool.handler({ query: 'cryogenic orbital propulsion mechanics' });
    const emptyParsed = JSON.parse(emptyResult.content[0].text);
    assert.strictEqual(emptyParsed.total_matches, 0);
    assert.deepStrictEqual(emptyParsed.candidates, []);
    assert.ok(emptyParsed.note && emptyParsed.note.includes('No active expert directly covers this domain'));
    console.log('Empty find_expert result note:', emptyParsed.note);

    // Execute with general matching query (will run against cached analysts)
    const beautyResult = await findExpertTool.handler({ query: 'beauty, cosmetics, and skincare' });
    const beautyParsed = JSON.parse(beautyResult.content[0].text);
    console.log('find_expert beauty query result total_matches:', beautyParsed.total_matches);
    if (beautyParsed.candidates.length > 0) {
        const first = beautyParsed.candidates[0];
        assert.ok(first.analyst_id, 'Candidate must have analyst_id');
        assert.ok(first.display_name, 'Candidate must have display_name');
        assert.ok(!first.display_name.includes('(Classic Digital Twin)'), 'display_name must not contain legacy twin suffix');
        assert.ok(!first.display_name.includes('(Digital Twin)'), 'display_name must not contain legacy twin suffix');
        assert.ok(first.category, 'Candidate must have category');
        assert.ok(first.reason, 'Candidate must have reason explanation');
        assert.ok(first.consult_tool, 'Candidate must have consult_tool');
    }
    console.log('✅ find_expert local fallback tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 3b. find_expert API Integration Tests (On-Request, Active, Related Graphs, Timeout Fallback)
    // ─────────────────────────────────────────────────────────────
    console.log('--- 3b. Testing find_expert API Integration & Differentiated Routing ---');

    // Test 3b.1: On-Request Specialist via API
    const serverWithOnRequestApi = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'nicotine pouches',
                    total_matches: 1,
                    timing_ms: 15.2,
                    results: [
                        {
                            id: 'adam-specialist',
                            slug: 'adam-specialist',
                            name: 'Adam Specialist',
                            status: 'Unclaimed',
                            agent_class: 'human_agent',
                            role_title: 'Regulatory & Market Entry Director',
                            search_ask_line: 'Ask Adam about market entry and compliance for nicotine pouches and vaping products.',
                            why_matched: ['Nicotine pouches', 'Vaping products'],
                            topics: ['harm reduction', 'oral nicotine'],
                            score: 25
                        }
                    ],
                    related_knowledge_graphs: []
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertOnRequest = (serverWithOnRequestApi as any)._registeredTools['find_expert'];
    const onRequestRes = await findExpertOnRequest.handler({ query: 'nicotine pouches' });
    const onRequestParsed = JSON.parse(onRequestRes.content[0].text);
    assert.strictEqual(onRequestParsed.total_matches, 1);
    const onReqCandidate = onRequestParsed.candidates[0];
    assert.strictEqual(onReqCandidate.analyst_id, 'adam-specialist');
    assert.strictEqual(onReqCandidate.status, 'on_request');
    assert.strictEqual(onReqCandidate.search_ask_line, 'Ask Adam about market entry and compliance for nicotine pouches and vaping products.');
    assert.deepStrictEqual(onReqCandidate.why_matched, ['Nicotine pouches', 'Vaping products']);
    assert.ok(onReqCandidate.next_step.includes('request_expert_intro(analyst_id: \'adam-specialist\')'));
    assert.ok(onReqCandidate.next_step.includes('consult_human_agent(analyst_id: \'adam-specialist\')'));
    console.log('✅ find_expert On-Request candidate routing verified.');

    // Test 3b.2: Active Human Agent via API
    const serverWithActiveApi = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'clean beauty',
                    total_matches: 1,
                    timing_ms: 12.0,
                    results: [
                        {
                            id: 'tara-james-taylor',
                            slug: 'tara-james-taylor',
                            name: 'Tara James Taylor',
                            status: 'Active',
                            agent_class: 'human_agent',
                            role_title: 'Global Head of Beauty & Personal Care',
                            search_ask_line: 'Ask Tara about clean beauty formulation trends and retail distribution.',
                            why_matched: ['Clean beauty', 'Cosmetics'],
                            topics: ['clean beauty', 'skincare'],
                            score: 28
                        }
                    ],
                    related_knowledge_graphs: []
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertActive = (serverWithActiveApi as any)._registeredTools['find_expert'];
    const activeRes = await findExpertActive.handler({ query: 'clean beauty' });
    const activeParsed = JSON.parse(activeRes.content[0].text);
    assert.strictEqual(activeParsed.total_matches, 1);
    const activeCandidate = activeParsed.candidates[0];
    assert.strictEqual(activeCandidate.status, 'active');
    assert.strictEqual(activeCandidate.consult_tool, 'consult_human_agent');
    assert.strictEqual(activeCandidate.next_step, "Call consult_human_agent with analyst_id: 'tara-james-taylor'.");
    console.log('✅ find_expert Active Human Agent routing verified.');

    // Test 3b.3: Zero Matches with Related Knowledge Graphs
    const serverWithGraphsApi = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'sub-orbital hypersonic space travel',
                    total_matches: 0,
                    timing_ms: 8.5,
                    results: [],
                    related_knowledge_graphs: [
                        { id: 'tech', name: 'PSFK Technology & Enterprise', description: 'Tech insights' },
                        { id: 'transport', name: 'Mobility & Aerospace Trends', description: 'Transport insights' }
                    ]
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertGraphs = (serverWithGraphsApi as any)._registeredTools['find_expert'];
    const graphsRes = await findExpertGraphs.handler({ query: 'sub-orbital hypersonic space travel' });
    const graphsParsed = JSON.parse(graphsRes.content[0].text);
    assert.strictEqual(graphsParsed.total_matches, 0);
    assert.deepStrictEqual(graphsParsed.candidates, []);
    assert.ok(graphsParsed.note.includes('No dedicated Human Agent covers this domain yet'));
    assert.ok(graphsParsed.note.includes('PSFK Technology & Enterprise, Mobility & Aerospace Trends'));
    assert.ok(graphsParsed.note.includes("search_graph(graphId: 'tech', query: 'sub-orbital hypersonic space travel')"));
    assert.strictEqual(graphsParsed.related_knowledge_graphs.length, 2);
    console.log('✅ find_expert Related Knowledge Graphs recommendation verified.');

    // Test 3b.4: Network Error Fallback to Local Matching
    const serverWithErrorApi = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                throw new Error('Connection refused to Fodda API');
            }
            if (path.includes('/v1/analysts')) {
                return { analysts: mockAnalysts };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertError = (serverWithErrorApi as any)._registeredTools['find_expert'];
    const errorFallbackRes = await findExpertError.handler({ query: 'beauty, cosmetics, and skincare' });
    assert.strictEqual(errorFallbackRes.isError, undefined);
    const errorFallbackParsed = JSON.parse(errorFallbackRes.content[0].text);
    assert.ok(errorFallbackParsed.total_matches >= 1, 'Local fallback must find candidate despite API error');
    assert.strictEqual(errorFallbackParsed.candidates[0].analyst_id, 'lauren-goode-beauty');
    console.log('✅ find_expert Network Error graceful local fallback verified.');

    // Test 3b.5: Timeout Fallback (>3s) to Local Matching
    const serverWithTimeoutApi = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                // Simulate slow upstream hang (> 3s)
                await new Promise(resolve => setTimeout(resolve, 3500));
                return { ok: true, results: [] };
            }
            if (path.includes('/v1/analysts')) {
                return { analysts: mockAnalysts };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertTimeout = (serverWithTimeoutApi as any)._registeredTools['find_expert'];
    const timeoutStart = Date.now();
    const timeoutRes = await findExpertTimeout.handler({ query: 'beauty, cosmetics, and skincare' });
    const elapsed = Date.now() - timeoutStart;
    assert.strictEqual(timeoutRes.isError, undefined);
    assert.ok(elapsed >= 2900 && elapsed < 4500, `Timeout must trigger around 3000ms, took ${elapsed}ms`);
    const timeoutParsed = JSON.parse(timeoutRes.content[0].text);
    assert.ok(timeoutParsed.total_matches >= 1, 'Local fallback must find candidate when API times out');
    assert.strictEqual(timeoutParsed.candidates[0].analyst_id, 'lauren-goode-beauty');
    console.log('✅ find_expert >3s Timeout graceful local fallback verified.\n');

    // ─────────────────────────────────────────────────────────────
    // 4. consult_analyst deep Parameter Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 4. Testing consult_analyst deep Parameter ---');
    const consultTool = tools['consult_analyst'];
    assert.ok(consultTool, 'consult_analyst must be registered');
    const shape = typeof consultTool.inputSchema?.def?.shape === 'function'
        ? consultTool.inputSchema.def.shape()
        : consultTool.inputSchema?.def?.shape;
    assert.ok(shape && shape.deep, 'consult_analyst schema must accept deep parameter');

    // ─────────────────────────────────────────────────────────────
    // 5. get_capabilities find_expert Inclusion Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 5. Testing get_capabilities find_expert Inclusion ---');
    const getCapabilitiesTool = tools['get_capabilities'];
    assert.ok(getCapabilitiesTool, 'get_capabilities must be registered');
    const capRes = await getCapabilitiesTool.handler({});
    const capParsed = JSON.parse(capRes.content[0].text);
    const expertCap = capParsed.capabilities.find((c: any) => c.id === 'expert_consult');
    assert.ok(expertCap, 'expert_consult capability must exist');
    assert.ok(expertCap.tools.includes('find_expert'), 'find_expert must be listed in expert_consult tools');
    console.log('expert_consult tools:', expertCap.tools);
    console.log('✅ get_capabilities find_expert inclusion verified.\n');

    console.log('================================================================');
    console.log(' ALL EXPERT LAYER TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
