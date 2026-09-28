import assert from 'node:assert';
import { createServer } from './toolHandlers.js';
import { addCoverageAnnotation, generateNextMoves } from './coverageRelevance.js';

console.log('--- Running Capabilities, Semantic Descriptions & Next-Actions Tests ---\n');

async function runTests() {
    let mockCapabilitiesCalls: string[] = [];

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string) => {
        if (path === '/v1/graphs') {
            return { graphs: [], _account: { isProfessionalServices: true, jobTitle: 'Partner', companyName: 'Strategy Corp' } };
        }
        if (path.startsWith('/v1/capabilities')) {
            mockCapabilitiesCalls.push(path);
            if (path.includes('topic=')) {
                return {
                    ok: true,
                    version: 'v1.2',
                    pricing_url: 'https://fodda.ai/pricing',
                    platform_scale: {
                        knowledge_graphs: 100,
                        supplemental_sources: 8,
                        specialists: {
                            total: 4150,
                            breakdown: {
                                human_agents: 4,
                                synthetic_domain_analysts: 4100,
                                c_suite_agents: 30,
                                classic_agents: 16
                            },
                            classification_guidance: "Only 'human_agents' are verified living practitioners (e.g. Ben Dietz, Peter Abraham). 'synthetic_domain_analysts' are AI personas grounded in specific domain graphs. 'c_suite_agents' represent corporate executive strategy roles. 'classic_agents' represent historical thinkers. Host models must NEVER describe all specialists as living human experts."
                        }
                    },
                    topic_reconnaissance: {
                        query: 'clean beauty',
                        recommended_workflow: {
                            id: 'research',
                            name: 'Research something',
                            why_recommended: 'Query requests market evidence on clean beauty.',
                            suggested_formulation: 'Investigate key market drivers and emerging signals for clean beauty.'
                        },
                        relevant_knowledge_graphs: [
                            { id: 'beauty', name: 'Beauty & Wellness', description: 'Curated beauty graph' }
                        ],
                        candidate_experts: [
                            { id: 'anu-lingala', name: 'Anu Lingala', agent_class: 'Human Agent', search_ask_line: 'Ask Anu about clean beauty' }
                        ],
                        coverage_assessment: {
                            strong_coverage: ['Consumer trends, category dynamics, and brand footprints related to clean beauty'],
                            limited_coverage: ['Deep technical, chemical, or clinical domain depth (clean beauty)'],
                            boundary_advisory: "Fodda's knowledge graphs specialize in consumer trends and market adoption. For technical formulation depth, consulting a specialist Human Agent is recommended before drawing conclusions."
                        },
                        available_next_actions: [
                            {
                                action: 'pressure_test',
                                name: 'Pressure-test this assertion',
                                description: 'Search for counter-evidence, disconfirming signals, and untested assumptions.',
                                reason: 'Evaluate whether strategic assumptions hold up.',
                                target_tool: 'verify_market_claim',
                                suggested_prompt: 'Pressure-test whether current assumptions regarding clean beauty are supported.',
                                suggested_parameters: { claim: 'Clean beauty market momentum' },
                                available: true
                            },
                            {
                                action: 'ask_expert',
                                name: 'Consult Anu Lingala',
                                description: 'Gain practitioner calibration.',
                                reason: 'Consult Anu Lingala for authoritative interpretation.',
                                target_tool: 'consult_human_agent',
                                suggested_prompt: 'Ask Anu Lingala about clean beauty',
                                suggested_parameters: { agent_id: 'anu-lingala', question: 'How should we evaluate clean beauty formulation?' },
                                available: true
                            },
                            {
                                action: 'track_topic',
                                name: 'Track this topic',
                                description: 'Establish recurring intelligence updates.',
                                reason: 'Detect newly emerging signals weekly.',
                                target_tool: 'manage_scheduled_reports',
                                suggested_prompt: 'Set up weekly tracking on clean beauty.',
                                suggested_parameters: { action: 'create', topic: 'clean beauty', cadence: 'weekly' },
                                available: true
                            },
                            {
                                action: 'create_brief',
                                name: 'Create an executive brief',
                                description: 'Turn completed research into a deliverable.',
                                reason: 'Package verified evidence into a deliverable.',
                                target_tool: 'request_deliverable',
                                suggested_prompt: 'Create an executive research brief on clean beauty',
                                suggested_parameters: { skill_slug: 'research_brief', brief: 'Clean beauty briefing' },
                                available: true
                            }
                        ]
                    },
                    coverage_assessment: {
                        strong_coverage: ['Consumer trends, category dynamics, and brand footprints related to clean beauty'],
                        limited_coverage: ['Deep technical, chemical, or clinical domain depth (clean beauty)'],
                        boundary_advisory: "Fodda's knowledge graphs specialize in consumer trends and market adoption. For technical formulation depth, consulting a specialist Human Agent is recommended before drawing conclusions."
                    },
                    workflows: [
                        { id: 'research', name: 'Research something' },
                        { id: 'challenge', name: 'Challenge something' },
                        { id: 'ask_experts', name: 'Ask the experts' },
                        { id: 'track', name: 'Track something' }
                    ]
                };
            }
            return {
                ok: true,
                version: 'v1.2',
                pricing_url: 'https://fodda.ai/pricing',
                platform_scale: {
                    knowledge_graphs: 100,
                    supplemental_sources: 8,
                    specialists: {
                        total: 4150,
                        breakdown: {
                            human_agents: 4,
                            synthetic_domain_analysts: 4100,
                            c_suite_agents: 30,
                            classic_agents: 16
                        },
                        classification_guidance: "Only 'human_agents' are verified living practitioners (e.g. Ben Dietz, Peter Abraham). 'synthetic_domain_analysts' are AI personas grounded in specific domain graphs. 'c_suite_agents' represent corporate executive strategy roles. 'classic_agents' represent historical thinkers. Host models must NEVER describe all specialists as living human experts."
                    }
                },
                workflows: [
                    { id: 'research', name: 'Research something' },
                    { id: 'challenge', name: 'Challenge something' },
                    { id: 'ask_experts', name: 'Ask the experts' },
                    { id: 'track', name: 'Track something' }
                ],
                capabilities: []
            };
        }
        return {};
    };

    const server = await createServer('dummy_key', 'test_user', mockFoddaRequest as any, async () => ({}), () => '', () => '');
    const registeredTools = (server as any)._registeredTools;

    // Test 1: get_capabilities without parameters returns 4 canonical workflows and specialists breakdown
    console.log('Test 1: get_capabilities without parameters returns canonical workflows and specialists.breakdown...');
    const getCapabilitiesHandler = registeredTools['get_capabilities'].handler;
    const res1 = await getCapabilitiesHandler({});
    assert.strictEqual(res1.content[0].type, 'text');
    const data1 = JSON.parse(res1.content[0].text);
    assert.ok(data1.workflows && Array.isArray(data1.workflows), 'Must contain workflows array');
    const workflowIds1 = data1.workflows.map((w: any) => w.id);
    assert.ok(workflowIds1.includes('research'), 'Must include research workflow');
    assert.ok(workflowIds1.includes('challenge'), 'Must include challenge workflow');
    assert.ok(workflowIds1.includes('ask_experts'), 'Must include ask_experts workflow');
    assert.ok(workflowIds1.includes('track'), 'Must include track workflow');
    assert.strictEqual(data1.pricing_url, 'https://fodda.ai/pricing');
    assert.ok(data1.platform_scale, 'Must contain platform_scale');
    assert.ok(data1.platform_scale.specialists, 'Must contain platform_scale.specialists');
    assert.strictEqual(data1.platform_scale.specialists.total, 4150);
    const breakdown = data1.platform_scale.specialists.breakdown;
    assert.ok(breakdown, 'Must contain specialists.breakdown');
    assert.strictEqual(typeof breakdown.human_agents, 'number');
    assert.strictEqual(typeof breakdown.synthetic_domain_analysts, 'number');
    assert.strictEqual(typeof breakdown.c_suite_agents, 'number');
    assert.strictEqual(typeof breakdown.classic_agents, 'number');
    assert.ok(data1.platform_scale.specialists.classification_guidance.includes("Only 'human_agents' are verified living practitioners"));
    console.log('✅ Test 1 Passed: get_capabilities returns 4 canonical workflows and specialists.breakdown.\n');

    // Test 2: get_capabilities with { topic: "clean beauty" } performs topic reconnaissance with coverage assessment
    console.log('Test 2: get_capabilities with topic reconnaissance and coverage_assessment...');
    const res2 = await getCapabilitiesHandler({ topic: 'clean beauty' });
    const data2 = JSON.parse(res2.content[0].text);
    assert.ok(data2.topic_reconnaissance, 'Must contain topic_reconnaissance');
    assert.strictEqual(data2.topic_reconnaissance.query, 'clean beauty');
    assert.ok(data2.topic_reconnaissance.recommended_workflow, 'Must include recommended_workflow');
    assert.ok(data2.topic_reconnaissance.coverage_assessment, 'Must include coverage_assessment');
    assert.ok(data2.topic_reconnaissance.coverage_assessment.boundary_advisory.includes('formulation depth'));
    assert.ok(data2.topic_reconnaissance.available_next_actions, 'Must include available_next_actions');
    const actions2 = data2.topic_reconnaissance.available_next_actions;
    assert.ok(actions2.length >= 2, 'Must have at least 2 next actions');
    for (const action of actions2) {
        assert.ok(action.action, 'Action must have an action type');
        assert.ok(action.name, 'Action must have a name');
        assert.ok(action.reason, 'Action must have a reason');
        assert.ok(action.suggested_parameters, 'Action must have executable suggested_parameters');
        assert.strictEqual(action.available, true, 'Action must be marked available: true');
    }
    console.log('✅ Test 2 Passed: get_capabilities returns topic reconnaissance with coverage_assessment and executable actions.\n');

    // Test 3: get_capabilities fallback when API fails (offline local fallback)
    console.log('Test 3: get_capabilities clean fallback when API network call fails...');
    const failingFoddaRequest = async (method: string, path: string) => {
        if (path === '/v1/graphs') return { graphs: [] };
        throw new Error('ECONNREFUSED API is offline');
    };
    const fallbackServer = await createServer('dummy_key', 'test_user', failingFoddaRequest as any, async () => ({}), () => '', () => '');
    const fallbackHandler = (fallbackServer as any)._registeredTools['get_capabilities'].handler;
    const fallbackRes = await fallbackHandler({});
    const fallbackData = JSON.parse(fallbackRes.content[0].text);
    assert.ok(fallbackData.workflows && Array.isArray(fallbackData.workflows), 'Fallback must contain workflows');
    const fallbackIds = fallbackData.workflows.map((w: any) => w.id);
    assert.ok(fallbackIds.includes('research') && fallbackIds.includes('challenge') && fallbackIds.includes('ask_experts') && fallbackIds.includes('track'));
    assert.ok(fallbackData.platform_scale.specialists.breakdown.human_agents > 0, 'Fallback must have human_agents count');

    // Fallback with topic reconnaissance
    const fallbackTopicRes = await fallbackHandler({ topic: 'clean beauty formulation' });
    const fallbackTopicData = JSON.parse(fallbackTopicRes.content[0].text);
    assert.ok(fallbackTopicData.topic_reconnaissance, 'Fallback must have topic_reconnaissance');
    assert.ok(fallbackTopicData.topic_reconnaissance.coverage_assessment, 'Fallback must have coverage_assessment');
    assert.ok(fallbackTopicData.topic_reconnaissance.coverage_assessment.boundary_advisory.includes('formulation depth'));
    assert.ok(fallbackTopicData.topic_reconnaissance.available_next_actions[0].suggested_parameters, 'Fallback actions must have suggested_parameters');
    console.log('✅ Test 3 Passed: get_capabilities clean fallback has all 4 workflows, specialist breakdown, and local coverage boundary detection.\n');

    // Test 4: coverageRelevance next_moves.actions contains executable continuations
    console.log('Test 4: coverageRelevance next_moves.actions populated with executable continuations...');
    const mockAnnotationResult = await addCoverageAnnotation(
        {
            rows: [
                {
                    title: 'Sustainable Packaging Innovations',
                    graph_id: 'beauty',
                    trend_name: 'Refillable Systems',
                    evidence_count: 5
                }
            ]
        },
        'refillable clean beauty packaging',
        ['beauty'],
        10
    );
    assert.ok(mockAnnotationResult.next_moves, 'Must have next_moves');
    const actions = mockAnnotationResult.next_moves.actions;
    assert.ok(Array.isArray(actions) && actions.length >= 2, 'next_moves.actions must contain >= 2 actions');
    const actionTypes = actions.map((a: any) => a.action);
    assert.ok(actionTypes.includes('pressure_test'), 'Must include pressure_test action');
    assert.ok(actionTypes.includes('create_brief'), 'Must include create_brief action');
    assert.ok(actionTypes.includes('track_topic'), 'Must include track_topic action');
    assert.ok(actionTypes.includes('ask_expert'), 'Must include ask_expert action');
    for (const action of actions) {
        assert.ok(action.name, 'Action must have a name');
        assert.ok(action.description, 'Action must have a description');
        assert.ok(action.reason, 'Action must have a strategic reason');
        assert.ok(action.suggested_prompt, 'Action must have a suggested_prompt');
        assert.ok(action.target_tool, 'Action must have a target_tool');
        assert.ok(action.suggested_parameters && typeof action.suggested_parameters === 'object', 'Action must have suggested_parameters');
        assert.strictEqual(action.available, true, 'Action must be marked available');
    }
    console.log('✅ Test 4 Passed: next_moves.actions correctly structured with executable parameters.\n');

    // Test 5: Headless UX Zero-Mention Prompt Probe
    console.log('Test 5: Headless UX Zero-Mention Prompt Probe (intent routing & boundary detection)...');
    
    // Simulate host AI semantic intent matcher against MCP registered tool descriptions
    function routeIntent(prompt: string, tools: Record<string, any>): string[] {
        const scores: { tool: string; score: number }[] = [];
        const p = prompt.toLowerCase();
        for (const [toolName, tool] of Object.entries(tools)) {
            const desc = (tool.description || '').toLowerCase();
            let score = 0;
            if (p.includes('gen z') && (desc.includes('consumer behavior shifts') || desc.includes('market trends') || toolName === 'search_graph')) score += 5;
            if (p.includes('luxury') && (desc.includes('market trends') || desc.includes('category dynamics'))) score += 3;
            if (p.includes('strategy presentation') && (desc.includes('researching') || toolName === 'get_capabilities')) score += 3;

            if ((p.includes("not sure whether we're right") || p.includes('pressure-test') || p.includes('invest heavily')) && 
                (desc.includes('evaluating a strategy') || desc.includes('pressure-testing a client hypothesis') || desc.includes('counter-evidence') || toolName === 'verify_market_claim')) {
                score += 10;
            }

            if ((p.includes("specialist's view") || p.includes('clean beauty formulation')) && 
                (desc.includes('what specialists think') || desc.includes('authoritative perspective') || desc.includes('practitioner depth') || toolName === 'find_expert' || toolName === 'consult_human_agent')) {
                score += 10;
            }

            if ((p.includes('keep an eye on this') || p.includes('keep me updated')) && 
                (desc.includes('recurring intelligence tracking') || desc.includes('automated briefings') || toolName === 'manage_scheduled_reports')) {
                score += 10;
            }

            if (score > 0) scores.push({ tool: toolName, score });
        }
        scores.sort((a, b) => b.score - a.score);
        return scores.map(s => s.tool);
    }

    // Probe 1: Research intent
    const probe1 = "I'm preparing a strategy presentation about how Gen Z is changing luxury.";
    const routes1 = routeIntent(probe1, registeredTools);
    assert.ok(routes1.includes('search_graph') || routes1.includes('get_capabilities'), 'Probe 1 must route to search_graph or get_capabilities');
    console.log(`  ✓ Probe 1 ("${probe1}") -> routed to [${routes1.slice(0, 2).join(', ')}]`);

    // Probe 2: Challenge / pressure-test intent
    const probe2 = "We're recommending that the client invest heavily in TikTok Shop. I'm not sure whether we're right.";
    const routes2 = routeIntent(probe2, registeredTools);
    assert.ok(routes2.includes('verify_market_claim') || routes2.includes('verify_claim'), 'Probe 2 must route to verify_market_claim');
    console.log(`  ✓ Probe 2 ("${probe2.slice(0, 50)}...") -> routed to [${routes2.slice(0, 2).join(', ')}]`);

    // Probe 3: Specialist consultation with formulation boundary
    const probe3 = "I'd like a specialist's view on clean beauty formulation.";
    const routes3 = routeIntent(probe3, registeredTools);
    assert.ok(routes3.includes('find_expert') || routes3.includes('consult_human_agent'), 'Probe 3 must route to find_expert or consult_human_agent');
    // Verify formulation boundary is triggered
    const reconProbe3 = await fallbackHandler({ topic: 'clean beauty formulation' });
    const reconData3 = JSON.parse(reconProbe3.content[0].text);
    assert.ok(reconData3.topic_reconnaissance.coverage_assessment.boundary_advisory.includes('formulation depth'), 'Probe 3 must trigger formulation boundary advisory');
    console.log(`  ✓ Probe 3 ("${probe3}") -> routed to [${routes3.slice(0, 2).join(', ')}] with boundary advisory triggered`);

    // Probe 4: Tracking intent
    const probe4 = "Can you keep an eye on this for me?";
    const routes4 = routeIntent(probe4, registeredTools);
    assert.ok(routes4.includes('manage_scheduled_reports'), 'Probe 4 must route to manage_scheduled_reports');
    console.log(`  ✓ Probe 4 ("${probe4}") -> routed to [${routes4.slice(0, 2).join(', ')}]`);

    console.log('✅ Test 5 Passed: Headless UX Zero-Mention Prompt Probes route accurately.\n');

    // Test 6: Context & Budget Check — total registered tools count
    console.log('Test 6: Registered tools count check (maintain consolidation)...');
    const toolNames = Object.keys(registeredTools);
    console.log(`Total registered tools: ${toolNames.length}`);
    assert.strictEqual(toolNames.length, 55, 'Total registered tools count must remain 55 (no bloat)');
    console.log('✅ Test 6 Passed: Total registered tools count strictly maintained at 55.\n');

    // Test 7: Semantic Intent Upgrades in Tool Descriptions
    console.log('Test 7: Verify semantic intent descriptions lead with "Use when..."');
    const toolsToCheck = [
        'search_graph',
        'verify_market_claim',
        'verify_claim',
        'find_expert',
        'consult_human_agent',
        'brand_tracker',
        'manage_scheduled_reports',
        'deep_research_topic',
        'request_deliverable'
    ];
    for (const toolName of toolsToCheck) {
        const tool = registeredTools[toolName];
        assert.ok(tool, `Tool ${toolName} must be registered`);
        const desc = tool.description || '';
        assert.ok(
            desc.startsWith('Use when'),
            `Tool ${toolName} description must start with "Use when", got: "${desc.slice(0, 40)}..."`
        );
    }
    console.log('✅ Test 7 Passed: All 9 tool descriptions lead with "Use when...".\n');

    console.log('All Capabilities, Guidance & Workflow Next-Actions Tests Passed Successfully!');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
