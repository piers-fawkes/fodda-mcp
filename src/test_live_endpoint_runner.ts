import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios from 'axios';

async function testLiveEndpoint() {
    const BASE_URL = process.env.TEST_URL || 'https://mcp.fodda.ai';
    console.log(`=== Verifying MCP Endpoint via Official SDK Client: ${BASE_URL}/brand-intelligence ===\n`);

    // Step 1: Verify Discovery endpoint
    console.log('1. Testing GET /.well-known/brand-intelligence...');
    const discResp = await axios.get(`${BASE_URL}/.well-known/brand-intelligence`);
    console.log('   Status:', discResp.status);
    console.log('   Name:', discResp.data.name);
    console.log('   Remote URL:', discResp.data.endpoints?.mcpStreamableHttp);
    if (discResp.data.name !== 'ai.fodda/brand-intelligence') {
        throw new Error('Unexpected discovery name');
    }
    console.log('   ✅ Discovery endpoint verified!\n');

    // Step 2: Connect via SDK Client to /brand-intelligence
    console.log('2. Connecting official MCP SDK Client to /brand-intelligence...');
    const brandTransport = new StreamableHTTPClientTransport(
        new URL(`${BASE_URL}/brand-intelligence?api_key=sk_live_test_verifier`)
    );
    const brandClient = new Client({ name: 'verifier-client', version: '1.0.0' });
    await brandClient.connect(brandTransport as any);
    console.log('   ✅ SDK Client connected!\n');

    // Step 3: List tools on /brand-intelligence
    console.log('3. Requesting client.listTools() on /brand-intelligence...');
    const brandToolsResult = await brandClient.listTools();
    const brandTools = brandToolsResult.tools.map(t => t.name).sort();
    console.log(`   Tools returned (${brandTools.length}):`, brandTools.join(', '));

    const expectedTools = [
        'brand_tracker', 'check_supplemental_status', 'generate_visual',
        'get_evidence', 'get_label_values', 'get_my_account', 'get_neighbors',
        'get_node', 'get_supplemental_context', 'list_graphs', 'read_url', 'search_graph'
    ].sort();

    const isMatch = brandTools.length === expectedTools.length && brandTools.every((t, i) => t === expectedTools[i]);

    if (!isMatch) {
        console.error('❌ Mismatch!');
        console.error('Expected:', expectedTools);
        console.error('Got:', brandTools);
        await brandClient.close();
        throw new Error('Scoped tool list mismatch');
    }
    console.log('   ✅ Scoped tools match EXACTLY the 12-tool Brand Intelligence product set!\n');

    // Step 4: Compare against main gateway /mcp session
    console.log('4. Connecting official MCP SDK Client to main gateway /mcp...');
    const mainTransport = new StreamableHTTPClientTransport(
        new URL(`${BASE_URL}/mcp?api_key=sk_live_test_verifier`)
    );
    const mainClient = new Client({ name: 'verifier-client', version: '1.0.0' });
    await mainClient.connect(mainTransport as any);

    const mainToolsResult = await mainClient.listTools();
    const mainToolsCount = mainToolsResult.tools.length;
    console.log(`   Main gateway tool count: ${mainToolsCount}`);

    if (mainToolsCount < 30) {
        await brandClient.close();
        await mainClient.close();
        throw new Error('Main gateway should return full toolset (30+ tools)');
    }
    console.log('   ✅ Main gateway verified with full toolset vs 12-tool scoped endpoint!\n');

    await brandClient.close();
    await mainClient.close();
    console.log('🎉 LIVE MCP SDK CLIENT VERIFICATION SUCCESSFUL!');
}

testLiveEndpoint().catch(err => {
    console.error('❌ Verification failed:', err.message || err);
    process.exit(1);
});
