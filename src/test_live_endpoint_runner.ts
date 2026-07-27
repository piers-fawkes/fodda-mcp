import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios from 'axios';
import { OFFERING_SCOPED_TOOLS } from './index.js';

async function testLiveEndpoint() {
    const BASE_URL = process.env.TEST_URL || 'https://mcp.fodda.ai';
    console.log(`=== Verifying ALL 5 Marquee Offering Endpoints: ${BASE_URL} ===\n`);

    const marqueeOfferings = [
        'brand-intelligence',
        'topic-research',
        'deep-research',
        'earnings-intelligence',
        'expert-consult',
    ];

    for (const slug of marqueeOfferings) {
        console.log(`--- Testing ${slug} ---`);
        const expectedTools = OFFERING_SCOPED_TOOLS[slug]?.slice().sort() || [];
        if (!expectedTools.length) throw new Error(`No tool definition for ${slug}`);

        // 1. Discovery card
        const discResp = await axios.get(`${BASE_URL}/.well-known/${slug}`);
        if (discResp.status !== 200 || discResp.data.name !== `ai.fodda/${slug}`) {
            throw new Error(`Invalid discovery card for ${slug}: ${discResp.data?.name}`);
        }
        console.log(`  ✅ GET /.well-known/${slug} -> ${discResp.data.name} (title: "${discResp.data.title}")`);

        // 2. MCP Client connection
        const transport = new StreamableHTTPClientTransport(
            new URL(`${BASE_URL}/${slug}?api_key=sk_live_test_verifier`)
        );
        const client = new Client({ name: 'verifier-client', version: '1.0.0' });
        await client.connect(transport as any);

        // 3. List tools
        const toolsResult = await client.listTools();
        const toolsReturned = toolsResult.tools.map(t => t.name).sort();
        console.log(`  ✅ client.listTools() on /${slug} returned ${toolsReturned.length} tools`);

        const isMatch = toolsReturned.length === expectedTools.length &&
            toolsReturned.every((t, i) => t === expectedTools[i]);

        if (!isMatch) {
            console.error(`❌ Mismatch for ${slug}!`);
            console.error('  Expected:', expectedTools);
            console.error('  Got:', toolsReturned);
            await client.close();
            throw new Error(`Tool subset mismatch on /${slug}`);
        }

        console.log(`  ✅ Tools match EXACTLY: [${toolsReturned.join(', ')}]\n`);
        await client.close();
    }

    // Compare with main gateway
    console.log('--- Testing Main Gateway /mcp ---');
    const mainTransport = new StreamableHTTPClientTransport(
        new URL(`${BASE_URL}/mcp?api_key=sk_live_test_verifier`)
    );
    const mainClient = new Client({ name: 'verifier-client', version: '1.0.0' });
    await mainClient.connect(mainTransport as any);

    const mainToolsResult = await mainClient.listTools();
    const mainToolsCount = mainToolsResult.tools.length;
    console.log(`  ✅ Main gateway /mcp returned ${mainToolsCount} tools`);

    if (mainToolsCount < 30) {
        await mainClient.close();
        throw new Error('Main gateway should return full toolset (30+ tools)');
    }

    await mainClient.close();
    console.log('\n🎉 ALL 5 MARQUEE OFFERING ENDPOINTS VERIFIED SUCCESSFULLY!');
}

testLiveEndpoint().catch(err => {
    console.error('❌ Verification failed:', err.message || err);
    process.exit(1);
});
