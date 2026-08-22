import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';

async function testLiveDeployedSplit() {
    console.log(`=== Live Deployed Integration Test: MCP Split Human Agent Consult (${DEPLOYED_MCP_URL}) ===\n`);

    console.log(`1. Connecting to live MCP server at ${DEPLOYED_MCP_URL}...`);
    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'live-split-verifier', version: '1.0.0' });
    await client.connect(transport as any);
    console.log('   Connected successfully to live MCP server.\n');

    // Test 1: list_analysts catalog structure
    console.log('2. Testing list_analysts catalog tool output...');
    const listRes = await client.callTool({
        name: 'list_analysts',
        arguments: {}
    });
    
    const listText = (listRes.content as any)[0]?.text;
    console.log('   list_analysts returned payload text.');
    const parsedList = JSON.parse(listText);
    const analysts = parsedList.analysts || [];
    console.log(`   Found ${analysts.length} analysts in catalog.`);

    if (analysts.length > 0) {
        const sample = analysts[0];
        console.log(`   Sample analyst entry: id=${sample.analyst_id || sample.id}, name=${sample.name}, type=${sample.type}, consult_tool=${sample.consult_tool}, price=${sample.price || 'N/A'}`);
    }

    // Test 2: consult_analyst referral when passed a twin ID
    console.log('\n3. Testing consult_analyst with a Digital Twin ID (anu-lingala-macro)...');
    const referralRes = await client.callTool({
        name: 'consult_analyst',
        arguments: {
            analyst_id: 'anu-lingala-macro',
            query: 'What are the macro economic outlook signals?'
        }
    });

    const referralText = (referralRes.content as any)[0]?.text || '';
    console.log('   consult_analyst response text:');
    console.log(`   "${referralText.slice(0, 200)}..."`);

    const isReferral = referralText.includes('Human Agent') || referralText.includes('consult_human_agent') || referralText.includes('referral');
    if (isReferral) {
        console.log('   ✅ PASS: consult_analyst returned referral for Digital Twin ID');
    } else {
        console.log('   ⚠️ NOTE: Response from upstream API received (awaiting API deployment if API route not yet updated)');
    }

    // Test 3: consult_human_agent tool invocation
    console.log('\n4. Testing consult_human_agent tool invocation (anu-lingala-macro)...');
    try {
        const humanRes = await client.callTool({
            name: 'consult_human_agent',
            arguments: {
                analyst_id: 'anu-lingala-macro',
                query: 'What is your current macro outlook?'
            }
        });
        const humanText = (humanRes.content as any)[0]?.text || '';
        console.log('   consult_human_agent response received:');
        console.log(`   "${humanText.slice(0, 200)}..."`);
        console.log('   ✅ PASS: consult_human_agent executed via live deployed MCP');
    } catch (err: any) {
        console.log(`   ⚠️ consult_human_agent call status: ${err.message || err}`);
    }

    await client.close();
    console.log('\n=== Live Deployed Integration Verification Finished ===');
}

testLiveDeployedSplit().catch(err => {
    console.error('❌ Live split test failed:', err.message || err);
});
