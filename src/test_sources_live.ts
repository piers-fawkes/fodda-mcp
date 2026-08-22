import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';

async function testSourcesLive() {
    console.log(`=== Testing sources_used stringification fix on Revision fodda-mcp-00443-kvt ===\n`);

    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'live-sources-verifier', version: '1.0.0' });
    await client.connect(transport as any);

    console.log('Calling consult_human_agent with analyst_id: "anu-lingala-macro"...');
    const result = await client.callTool({
        name: 'consult_human_agent',
        arguments: {
            analyst_id: 'anu-lingala-macro',
            query: 'What are the major cultural macro-trends right now?'
        }
    });

    const text = (result.content as any)[0]?.text || '';
    console.log(`\nResult output:\n"${text.slice(-500)}"\n`);

    if (text.includes('--- SOURCES USED ---') && !text.includes('- Source\n- Source')) {
        console.log('🎉 SUCCESS: sources_used footer printed real source names (no stringification bug)!');
    }

    await client.close();
}

testSourcesLive().catch(err => {
    console.error('❌ Error:', err.message || err);
});
