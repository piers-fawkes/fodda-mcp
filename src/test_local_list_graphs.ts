import { createServer } from './toolHandlers.js';

async function testLocal() {
    const mockFoddaReq = async (method: string, endpoint: string) => {
        if (endpoint.includes('/v1/graphs')) {
            return {
                graphs: [
                    {
                        graph_id: 'beauty',
                        name: 'Beauty & Personal Care',
                        one_liner: 'Trend signals across skincare',
                        description: 'Curated beauty trends',
                        curator: 'PSFK',
                        domain: 'beauty',
                        graph_type: 'vertical',
                        trend_count: 42,
                        evidence_count: 150,
                        status: 'active',
                        last_updated: '2026-07-26',
                        topics: ['beauty', 'health', 'skincare'],
                        verticals: ['consumer-goods'],
                        owner_email: 'secret@psfk.com', // P0 Security: Must be STRIPPED by allowlist!
                    }
                ],
                supplemental_sources: [
                    { name: 'Google Trends', topics: ['search'] }
                ]
            };
        }
        return {};
    };

    const server = await createServer(
        'sk_test', 'user_test', mockFoddaReq as any, async () => ({}), () => '', () => ''
    );

    const reg: any = (server as any)._registeredTools['list_graphs'];
    const fn = reg.handler || reg.callback || reg.execute;
    const result = await fn({}, { authInfo: {} });

    const parsed = JSON.parse(result.content[0].text);
    console.log('\nParsed serialized graph object from list_graphs:');
    console.log(parsed.graphs[0]);

    if (!parsed.graphs[0].topics || !Array.isArray(parsed.graphs[0].topics)) {
        throw new Error('topics missing or invalid in list_graphs output');
    }
    if (!parsed.graphs[0].verticals || !Array.isArray(parsed.graphs[0].verticals)) {
        throw new Error('verticals missing or invalid in list_graphs output');
    }
    if (parsed.graphs[0].owner_email) {
        throw new Error('P0 Security Violation: owner_email leaked in list_graphs');
    }

    console.log('\n✅ TEST PASSED: topics & verticals serialized, owner_email stripped (P0 security boundary intact)!');
}

testLocal().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
