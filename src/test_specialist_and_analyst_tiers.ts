import assert from 'assert';
import { createServer } from './toolHandlers.js';

async function mockFoddaRequest(method: 'GET' | 'POST', path: string, apiKey: string, userId: string, body?: any) {
    if (path === '/v1/graphs/catalog') return { graphs: [] };
    if (path === '/v1/analysts') return [
        {
            analyst_id: 'ben-dietz-sic',
            name: 'Ben Dietz',
            graphSubType: 'Digital Twin',
            expertIn: 'youth culture, streetwear, underground music',
            description: 'Cultural strategist and host of [SIC] Weekly',
            topics: ['streetwear', 'culture']
        },
        {
            analyst_id: 'brand-cmo',
            name: 'Brand CMO',
            graphSubType: 'Executive',
            expertIn: 'enterprise brand marketing, corporate governance',
            description: 'Corporate CMO lens grounded in SEC filings',
            topics: ['brand', 'marketing', 'earnings']
        },
        {
            analyst_id: 'john-ruskin',
            name: 'John Ruskin',
            graphSubType: 'Classic Digital Twin',
            expertIn: 'craftsmanship, aesthetic philosophy, moral critique',
            description: 'Victorian art critic and social thinker',
            topics: ['art', 'craftsmanship', 'philosophy']
        },
        {
            analyst_id: 'retail-synthetic',
            name: 'Retail Synthetic Analyst',
            graphSubType: 'Synthetic Expert',
            expertIn: 'omnichannel retail logistics',
            description: 'Synthetic retail domain lens',
            topics: ['retail', 'logistics']
        }
    ];
    if (path === '/v1/human-agents/book-a-call-map') return {};
    if (path === '/v1/search/expert') {
        return {
            total: 3,
            on_topic_total: 3,
            results: [
                { id: '1', title: 'Streetwear drop model evolving', graphId: 'ben-dietz-sic', score: 0.85 }
            ]
        };
    }
    if (path === '/v1/human-agents/consult') {
        return {
            result: 'Deep research into youth streetwear indicates emerging micro-communities.',
            coverage: 'in',
            sources_used: [
                { title: 'Subculture Signal', url: 'https://fodda.ai/signals/1' }
            ],
            receivedBody: body
        };
    }
    return {};
}

async function mockWaverunnerRequest() { return {}; }

async function runTests() {
    console.log('--- Testing Specialist Intelligence & 4-Tier Analyst Classification ---');

    const server = await createServer(
        'sk_test',
        'test_user',
        mockFoddaRequest as any,
        mockWaverunnerRequest as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    // @ts-ignore
    const tools = server._registeredTools;

    // 1. Verify get_specialist_intelligence and get_expert_intelligence exist
    assert.ok(tools['get_specialist_intelligence'], 'get_specialist_intelligence must be registered');
    assert.ok(tools['get_expert_intelligence'], 'get_expert_intelligence legacy alias must be registered');
    console.log('✅ Tool Registration Passed: get_specialist_intelligence & get_expert_intelligence alias present');

    // 2. Call list_analysts with no filter (all)
    const listTool = tools['list_analysts'];
    const allRes = await listTool.handler({});
    const allData = JSON.parse(allRes.content[0].text);
    assert.strictEqual(allData.analysts.length, 4, 'Should return 4 analysts');

    const ben = allData.analysts.find((a: any) => a.analyst_id === 'ben-dietz-sic');
    assert.strictEqual(ben.category, 'human_agent');
    assert.strictEqual(ben.is_verified_real_person, true);
    assert.strictEqual(ben.consult_tool, 'consult_human_agent');

    const cmo = allData.analysts.find((a: any) => a.analyst_id === 'brand-cmo');
    assert.strictEqual(cmo.category, 'c_suite_agent');
    assert.strictEqual(cmo.is_verified_real_person, false);
    assert.strictEqual(cmo.consult_tool, 'consult_analyst');

    const ruskin = allData.analysts.find((a: any) => a.analyst_id === 'john-ruskin');
    assert.strictEqual(ruskin.category, 'classic_agent');
    assert.strictEqual(ruskin.is_verified_real_person, false);
    assert.strictEqual(ruskin.consult_tool, 'consult_analyst');

    const synthetic = allData.analysts.find((a: any) => a.analyst_id === 'retail-synthetic');
    assert.strictEqual(synthetic.category, 'synthetic_agent');
    assert.strictEqual(synthetic.is_verified_real_person, false);

    console.log('✅ 4-Tier Categorization Passed: Living human, C-Suite, Classic, and Synthetic agents correctly classified');

    // 3. Test list_analysts category filtering
    const humanOnlyRes = await listTool.handler({ category: 'human_agent' });
    const humanOnlyData = JSON.parse(humanOnlyRes.content[0].text);
    assert.strictEqual(humanOnlyData.analysts.length, 1);
    assert.strictEqual(humanOnlyData.analysts[0].analyst_id, 'ben-dietz-sic');

    const cSuiteOnlyRes = await listTool.handler({ category: 'c_suite_agent' });
    const cSuiteData = JSON.parse(cSuiteOnlyRes.content[0].text);
    assert.strictEqual(cSuiteData.analysts.length, 1);
    assert.strictEqual(cSuiteData.analysts[0].analyst_id, 'brand-cmo');

    console.log('✅ Category Filtering Passed: list_analysts correctly filters by category');

    // 4. Test list_analysts natural query filtering
    const queryRes = await listTool.handler({ query: 'underground streetwear' });
    const queryData = JSON.parse(queryRes.content[0].text);
    assert.strictEqual(queryData.analysts.length, 1);
    assert.strictEqual(queryData.analysts[0].analyst_id, 'ben-dietz-sic');
    console.log('✅ Query Filtering Passed: list_analysts matches natural language query to analyst lane');

    // 5. Test consult_human_agent deep / homework mode
    let lastConsultBody: any = null;
    const customFoddaRequest = async (method: string, path: string, key: string, uid: string, body?: any) => {
        if (path === '/v1/human-agents/consult') {
            lastConsultBody = body;
            return {
                result: 'Detailed breakdown with evidence',
                coverage: 'in',
                sources_used: []
            };
        }
        return mockFoddaRequest(method as any, path, key, uid, body);
    };

    const consultServer = await createServer(
        'sk_test',
        'test_user',
        customFoddaRequest as any,
        mockWaverunnerRequest as any,
        () => 'widget_1',
        () => 'http://localhost'
    );
    // @ts-ignore
    const consultTools = consultServer._registeredTools;
    const consultTool = consultTools['consult_human_agent'];

    // Case A: explicit deep: true
    await consultTool.handler({
        analyst_id: 'ben-dietz-sic',
        query: 'Analyze luxury streetwear collaboration trends',
        deep: true
    });
    assert.strictEqual(lastConsultBody?.deep, true, 'Must pass deep: true when deep param is set');

    // Case B: natural query "do your homework"
    lastConsultBody = null;
    await consultTool.handler({
        analyst_id: 'ben-dietz-sic',
        query: 'Can you do your homework and find concrete data on streetwear drops?'
    });
    assert.strictEqual(lastConsultBody?.deep, true, 'Must auto-detect homework intent from query and pass deep: true');

    console.log('✅ Multi-Turn Homework Passed: consult_human_agent triggers deep background research');

    console.log('\nAll Specialist & 4-Tier Agent tests passed successfully!');
}

runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
