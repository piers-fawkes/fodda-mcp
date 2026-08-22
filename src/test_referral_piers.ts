import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';

async function testReferralPiers() {
    console.log(`=== Testing Referral Logic on Deployed Revision (fodda-mcp-00441-nfx) ===\n`);

    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'live-referral-verifier', version: '1.0.0' });
    await client.connect(transport as any);

    console.log('Calling consult_analyst with Digital Twin ID: piers-fawkes-psfk...');
    const result = await client.callTool({
        name: 'consult_analyst',
        arguments: {
            analyst_id: 'piers-fawkes-psfk',
            query: 'What are the top retail trend signals?'
        }
    });

    const text = (result.content as any)[0]?.text || '';
    console.log(`\nResult output:\n"${text}"\n`);

    if (text.includes('Human Agent') || text.includes('consult_human_agent')) {
        console.log('🎉 SUCCESS: consult_analyst returned referral to consult_human_agent for piers-fawkes-psfk!');
    } else {
        console.log('ℹ️ Result returned standard consult text.');
    }

    await client.close();
}

testReferralPiers().catch(err => {
    console.error('❌ Error:', err.message || err);
});
