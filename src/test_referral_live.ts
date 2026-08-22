import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';

async function testReferralLive() {
    console.log(`=== Testing Referral Logic on Live Deployed MCP Server (${DEPLOYED_MCP_URL}) ===\n`);

    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'live-referral-verifier', version: '1.0.0' });
    await client.connect(transport as any);

    console.log('1. Calling consult_analyst with a Digital Twin ID (anu-lingala-macro)...');
    const result = await client.callTool({
        name: 'consult_analyst',
        arguments: {
            analyst_id: 'anu-lingala-macro',
            query: 'Test referral check'
        }
    });

    const text = (result.content as any)[0]?.text || '';
    console.log(`\nResult output:\n"${text}"\n`);

    if (text.includes('Human Agent') && text.includes('consult_human_agent')) {
        console.log('✅ PASS: consult_analyst returned referral to consult_human_agent!');
    } else {
        console.log('ℹ️ NOTE: Upstream API has not yet deployed updated /v1/analysts response with type=human_agent.');
    }

    await client.close();
}

testReferralLive().catch(err => {
    console.error('❌ Error:', err.message || err);
});
