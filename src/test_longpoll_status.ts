import assert from 'assert';
import { setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';

async function runLongPollTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Long-Poll Slow Calls & Deep Consults as Jobs');
    console.log('================================================================\n');

    setCachedCatalogForTesting({ version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 2, graphs: [] }, [
        { id: 'ben-dietz-sic', name: 'Ben Dietz', graphSubType: 'Digital Twin' },
        { id: 'retail-strategy-innovation', name: 'Retail Strategy & Innovation Lead', graphSubType: 'Synthetic Expert' }
    ]);

    let slowJobCompleted = false;

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        if (path.includes('/v1/analysts/consult')) {
            if (body.deep) {
                // Simulate slow job execution in background
                await new Promise((resolve) => setTimeout(resolve, 2000));
                return {
                    result: 'Deep Synthetic Analyst response after rigorous multi-graph synthesis.',
                    coverage: 'FULL',
                    sources_used: [{ title: 'Retail Tech 2026', url: 'https://example.com/retail-2026' }],
                    timing_ms: 2000
                };
            }
            return {
                result: 'Fast inline Synthetic Analyst response.',
                coverage: 'FULL',
                sources_used: []
            };
        }
        if (path.includes('/v1/human-agents/consult')) {
            if (body.deep) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return {
                    result: 'Deep Human Agent response after deep homework.',
                    coverage: 'FULL',
                    sources_used: [{ title: 'Substack SIC', url: 'https://sic.substack.com' }]
                };
            }
            return {
                result: 'Fast inline Human Agent response.',
                coverage: 'FULL',
                sources_used: []
            };
        }
        if (path === '/v1/graphs') {
            return { graphs: [], disabled_graphs: [] };
        }
        return {};
    };

    const server = await createServer('dummy_key', 'test_user', mockFoddaRequest as any, async () => ({}), () => '', () => '');
    const registeredTools = (server as any)._registeredTools;

    // Test 1: Normal (non-deep) consult_analyst runs inline and instant
    console.log('Test 1: Normal consult_analyst runs inline and instant (regression check)...');
    const normalRes = await registeredTools['consult_analyst'].handler({
        analyst_id: 'retail-strategy-innovation',
        query: 'What is retail media?'
    });
    assert.strictEqual(normalRes.isError, undefined);
    assert.ok(normalRes.content[0].text.includes('Fast inline Synthetic Analyst response.'));
    assert.ok(!normalRes.content[0].text.includes('Job ID:'), 'Normal consult must not return Job ID');
    console.log('✅ Test 1 Passed: Normal consult runs inline and instant.\n');

    // Test 2: Deep consult_analyst (deep: true) returns Job ID immediately
    console.log('Test 2: Deep consult_analyst (deep: true) returns Job ID immediately...');
    const startDeepTime = Date.now();
    const deepRes = await registeredTools['consult_analyst'].handler({
        analyst_id: 'retail-strategy-innovation',
        query: 'Provide a rigorous breakdown of store traffic trends',
        deep: true
    });
    const deepDuration = Date.now() - startDeepTime;
    assert.ok(deepDuration < 500, `Initial response should be immediate (took ${deepDuration}ms)`);
    assert.ok(deepRes.content[0].text.includes('Job ID:'), 'Deep consult must return Job ID');
    assert.ok(deepRes.content[0].text.includes('check_research_status'), 'Must direct caller to check_research_status');

    const jobIdMatch = deepRes.content[0].text.match(/Job ID:\s*([a-f0-9\-]+)/i);
    assert.ok(jobIdMatch, 'Should find Job ID in response');
    const jobId = jobIdMatch[1];
    console.log(`Deep Job dispatched: ${jobId}`);
    console.log('✅ Test 2 Passed: Deep consult returns Job ID immediately.\n');

    // Test 3: Long-poll check_research_status waits server-side and returns completed result
    console.log('Test 3: check_research_status long-polls and retrieves completed deep consult...');
    const pollStart = Date.now();
    const pollRes = await registeredTools['check_research_status'].handler({ job_id: jobId });
    const pollDuration = Date.now() - pollStart;
    console.log(`Long-poll returned after ${pollDuration}ms`);
    assert.ok(pollDuration >= 1500, `Long-poll should hold until job completion (held ${pollDuration}ms)`);
    assert.ok(pollRes.content[0].text.includes('Deep Synthetic Analyst response after rigorous multi-graph synthesis.'));
    console.log('✅ Test 3 Passed: check_research_status long-polls and delivers final answer.\n');

    // Test 4: Deep consult via natural language "do your homework" on consult_human_agent
    console.log('Test 4: consult_human_agent with "do your homework" triggers async deep job...');
    const haRes = await registeredTools['consult_human_agent'].handler({
        analyst_id: 'ben-dietz-sic',
        query: 'Do your homework and give me a comprehensive breakdown on brand community'
    });
    assert.ok(haRes.content[0].text.includes('Job ID:'), 'Homework intent must trigger deep job');
    const haJobIdMatch = haRes.content[0].text.match(/Job ID:\s*([a-f0-9\-]+)/i);
    assert.ok(haJobIdMatch, 'Should find Job ID in response');
    const haJobId = haJobIdMatch[1];

    console.log(`Polling check_research_status for Human Agent job: ${haJobId}...`);
    const haPollRes = await registeredTools['check_research_status'].handler({ job_id: haJobId });
    assert.ok(haPollRes.content[0].text.includes('Deep Human Agent response after deep homework.'));
    console.log('✅ Test 4 Passed: Homework intent triggers deep job and resolves via check_research_status.\n');

    // Test 5: check_research_status with unknown job returns error
    console.log('Test 5: check_research_status with non-existent job ID returns error...');
    const unknownRes = await registeredTools['check_research_status'].handler({ job_id: 'non-existent-uuid' });
    assert.strictEqual(unknownRes.isError, true);
    assert.ok(unknownRes.content[0].text.includes('not found'));
    console.log('✅ Test 5 Passed: Unknown job ID cleanly returns not found.\n');

    console.log('================================================================');
    console.log(' All P2 Long-Poll & Deep Consult Tests Passed Successfully!');
    console.log('================================================================\n');
}

runLongPollTests().catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
