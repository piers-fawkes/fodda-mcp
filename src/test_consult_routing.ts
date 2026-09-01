import assert from 'assert';
import { setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';

async function runRoutingTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Consult Routing & Dispatch Verification');
    console.log('================================================================\n');

    // 1. Setup mock catalog with Digital Twin and Synthetic Expert
    setCachedCatalogForTesting({ version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 2, graphs: [] }, [
        { id: 'ben-dietz-sic', name: 'Ben Dietz', graphSubType: 'Digital Twin' },
        { id: 'jane-austen', name: 'Jane Austen', graphSubType: 'Classic Digital Twin' },
        { id: 'retail-strategy-innovation', name: 'Retail Strategy & Innovation Lead', graphSubType: 'Synthetic Expert' },
        { id: 'marketing-media-strategy', name: 'Marketing & Media Strategy Lead', graphSubType: 'Synthetic Expert' }
    ]);

    let humanConsultCalls: Array<{ analyst_id: string; query: string }> = [];
    let syntheticConsultCalls: Array<{ analyst_id: string; query: string }> = [];

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        if (path.includes('/v1/human-agents/consult')) {
            humanConsultCalls.push({ analyst_id: body.analyst_id, query: body.query });
            return {
                result: `Human Agent response for ${body.analyst_id}`,
                coverage: 'IN',
                sources_used: []
            };
        }
        if (path.includes('/v1/analysts/consult')) {
            syntheticConsultCalls.push({ analyst_id: body.analyst_id, query: body.query });
            return {
                result: `Synthetic Analyst response for ${body.analyst_id}`,
                coverage: 'IN',
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

    // Test 1: consult_analyst with Digital Twin ID (ben-dietz-sic) routes directly to Human Agent endpoint
    console.log('Test 1: consult_analyst with Digital Twin ID (ben-dietz-sic)...');
    humanConsultCalls = [];
    syntheticConsultCalls = [];
    const consultAnalystHandler = registeredTools['consult_analyst'].handler;
    const res1 = await consultAnalystHandler({ analyst_id: 'ben-dietz-sic', query: 'Hype trends' });
    assert.strictEqual(humanConsultCalls.length, 1, 'Must invoke human-agents endpoint once');
    assert.strictEqual(syntheticConsultCalls.length, 0, 'Must NOT invoke synthetic endpoint');
    assert.strictEqual(humanConsultCalls[0]?.analyst_id, 'ben-dietz-sic');
    assert.ok(res1.content[0].text.includes('Human Agent response for ben-dietz-sic'));
    console.log('✅ Test 1 Passed: consult_analyst proactively routes Digital Twin to Human Agent endpoint.\n');

    // Test 2: consult_analyst with Classic Digital Twin ID (jane-austen) routes to Human Agent endpoint
    console.log('Test 2: consult_analyst with Classic Digital Twin ID (jane-austen)...');
    humanConsultCalls = [];
    syntheticConsultCalls = [];
    const res2 = await consultAnalystHandler({ analyst_id: 'jane-austen', query: 'Regency etiquette' });
    assert.strictEqual(humanConsultCalls.length, 1, 'Must invoke human-agents endpoint for Classic Digital Twin');
    assert.strictEqual(syntheticConsultCalls.length, 0, 'Must NOT invoke synthetic endpoint');
    assert.strictEqual(humanConsultCalls[0]?.analyst_id, 'jane-austen');
    console.log('✅ Test 2 Passed: consult_analyst proactively routes Classic Digital Twin to Human Agent endpoint.\n');

    // Test 3: consult_analyst with Synthetic Expert (retail-strategy-innovation) stays on Analyst endpoint
    console.log('Test 3: consult_analyst with Synthetic Expert (retail-strategy-innovation)...');
    humanConsultCalls = [];
    syntheticConsultCalls = [];
    const res3 = await consultAnalystHandler({ analyst_id: 'retail-strategy-innovation', query: 'Omnichannel retail' });
    assert.strictEqual(syntheticConsultCalls.length, 1, 'Must invoke synthetic analyst endpoint once');
    assert.strictEqual(humanConsultCalls.length, 0, 'Must NOT invoke human endpoint');
    assert.strictEqual(syntheticConsultCalls[0]?.analyst_id, 'retail-strategy-innovation');
    console.log('✅ Test 3 Passed: consult_analyst maintains standard Synthetic Analyst execution.\n');

    // Test 4: consult_human_agent with Synthetic Expert (marketing-media-strategy) routes to Analyst endpoint
    console.log('Test 4: consult_human_agent with Synthetic Expert (marketing-media-strategy)...');
    humanConsultCalls = [];
    syntheticConsultCalls = [];
    const consultHumanHandler = registeredTools['consult_human_agent'].handler;
    const res4 = await consultHumanHandler({ analyst_id: 'marketing-media-strategy', query: 'CTV spend' });
    assert.strictEqual(syntheticConsultCalls.length, 1, 'Must invoke synthetic endpoint once');
    assert.strictEqual(humanConsultCalls.length, 0, 'Must NOT invoke human endpoint');
    assert.strictEqual(syntheticConsultCalls[0]?.analyst_id, 'marketing-media-strategy');
    console.log('✅ Test 4 Passed: consult_human_agent proactively routes Synthetic Expert to Analyst endpoint.\n');

    console.log('All 4 consult routing tests passed cleanly.');
}

runRoutingTests().catch(err => {
    console.error('Test failure:', err);
    process.exit(1);
});
