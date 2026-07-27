import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function testListGraphsTopics() {
    const BASE_URL = process.env.TEST_URL || 'https://mcp.fodda.ai';
    console.log(`=== Testing list_graphs topics/verticals serialization: ${BASE_URL} ===\n`);

    const transport = new StreamableHTTPClientTransport(
        new URL(`${BASE_URL}/mcp?api_key=sk_live_test_verifier`)
    );
    const client = new Client({ name: 'verifier-client', version: '1.0.0' });
    await client.connect(transport as any);

    const res: any = await client.callTool({
        name: 'list_graphs',
        arguments: {}
    });

    const content: any = res.content[0];
    const text = content.text;
    const data = JSON.parse(text);

    console.log(`Total graphs returned: ${data.graphs?.length}`);
    const sampleGraphsWithTopics = data.graphs.filter((g: any) => g.topics || g.verticals);
    console.log(`Graphs with topics or verticals populated: ${sampleGraphsWithTopics.length}`);

    if (data.graphs.length > 0) {
        console.log('\nSample serialized graph object from list_graphs:');
        console.log(JSON.stringify(data.graphs[0], null, 2));
    }

    await client.close();
}

testListGraphsTopics().catch(console.error);
