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
                        available_next_actions: [
                            { action: 'challenge', name: 'Pressure-test this', target_tool: 'verify_market_claim' },
                            { action: 'ask_experts', name: 'Ask an expert', target_tool: 'find_expert' },
                            { action: 'track', name: 'Track this topic', target_tool: 'manage_scheduled_reports' },
                            { action: 'create_brief', name: 'Create a brief', target_tool: 'request_deliverable' }
                        ]
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

    // Test 1: get_capabilities without parameters returns 4 canonical workflows
    console.log('Test 1: get_capabilities without parameters returns canonical workflows...');
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
    console.log('✅ Test 1 Passed: get_capabilities returns 4 canonical workflows.\n');

    // Test 2: get_capabilities with { topic: "clean beauty" } performs topic reconnaissance
    console.log('Test 2: get_capabilities with topic reconnaissance...');
    const res2 = await getCapabilitiesHandler({ topic: 'clean beauty' });
    const data2 = JSON.parse(res2.content[0].text);
    assert.ok(data2.topic_reconnaissance, 'Must contain topic_reconnaissance');
    assert.strictEqual(data2.topic_reconnaissance.query, 'clean beauty');
    assert.ok(data2.topic_reconnaissance.recommended_workflow, 'Must include recommended_workflow');
    assert.ok(data2.topic_reconnaissance.available_next_actions, 'Must include available_next_actions');
    console.log('✅ Test 2 Passed: get_capabilities returns topic reconnaissance.\n');

    // Test 3: get_capabilities fallback when API fails
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
    console.log('✅ Test 3 Passed: get_capabilities clean fallback has all 4 workflows.\n');

    // Test 4: coverageRelevance next_moves.actions contains valid next actions
    console.log('Test 4: coverageRelevance next_moves.actions populated with strategic workflow steps...');
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
        assert.ok(action.suggested_prompt, 'Action must have a suggested_prompt');
        assert.ok(action.target_tool, 'Action must have a target_tool');
    }
    console.log('✅ Test 4 Passed: next_moves.actions correctly structured and populated.\n');

    // Test 5: Context & Budget Check — total registered tools count
    console.log('Test 5: Registered tools count check (maintain consolidation)...');
    const toolNames = Object.keys(registeredTools);
    console.log(`Total registered tools: ${toolNames.length}`);
    assert.strictEqual(toolNames.length, 55, 'Total registered tools count must remain 55 (no bloat)');
    console.log('✅ Test 5 Passed: Total registered tools count strictly maintained at 55.\n');

    // Test 6: Semantic Intent Upgrades in Tool Descriptions
    console.log('Test 6: Verify semantic intent descriptions lead with "Use when..."');
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
    console.log('✅ Test 6 Passed: All 9 tool descriptions lead with "Use when...".\n');

    console.log('All Capabilities, Guidance & Workflow Next-Actions Tests Passed Successfully!');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
