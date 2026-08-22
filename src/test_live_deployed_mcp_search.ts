import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios from 'axios';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';
const AIRTABLE_BASE_ID = 'appXUeeWN1uD9NdCW';
const AIRTABLE_QUESTIONS_TABLE_ID = 'tblvHx1DzwuTq3TJE';

async function testLiveDeployedMCPSearch() {
    console.log(`=== Real Joint Integration Test: Live Deployed MCP Server (${DEPLOYED_MCP_URL}) ===\n`);

    if (!AIRTABLE_API_KEY) {
        console.error('❌ AIRTABLE_API_KEY is required for verifying Airtable row enrichment.');
        process.exit(1);
    }

    const testQuery = `agent commerce multi graph live test ${Date.now()}`;
    console.log(`1. Connecting to live MCP server at ${DEPLOYED_MCP_URL} with valid API key...`);

    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'live-integration-verifier', version: '1.0.0' });
    await client.connect(transport as any);
    console.log('   Connected successfully to live MCP server');

    console.log(`2. Executing multi-graph search_graph for query: "${testQuery}"...`);
    const searchResult = await client.callTool({
        name: 'search_graph',
        arguments: {
            query: testQuery,
            limit: 10
        }
    });

    console.log('   Tool call returned result');
    await client.close();

    console.log('3. Waiting 4 seconds for async Airtable logging/enrichment to complete...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    console.log('4. Querying Airtable Questions table for the logged query...');
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_QUESTIONS_TABLE_ID}`;
    const headers = {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
    };

    const filterFormula = encodeURIComponent(`{question} = '${testQuery}'`);
    const searchResp = await axios.get(`${airtableUrl}?filterByFormula=${filterFormula}`, { headers });
    const records = searchResp.data.records || [];

    console.log(`   Found ${records.length} record(s) in Airtable Questions table`);

    if (records.length === 0) {
        console.error(`❌ FAIL: Expected 1 record in Airtable for "${testQuery}", found 0.`);
        process.exit(1);
    }

    if (records.length > 1) {
        console.error(`❌ FAIL: Expected exactly 1 record, found ${records.length} (duplicate logging bug).`);
        process.exit(1);
    }

    const row = records[0];
    const fields = row.fields;

    console.log('\n--- Live Airtable Integration Record ---');
    console.log(`Record ID: ${row.id}`);
    console.log(`Question: ${fields.question}`);
    console.log(`User Email: ${fields.userEmail}`);
    console.log(`Graph ID: ${fields.graphId}`);
    console.log(`Result Count: ${fields.resultCount}`);
    console.log(`Result Quality: ${fields.resultQuality}`);
    console.log(`User Context: ${fields.userContext}`);
    console.log(`Interaction Type: ${fields.interaction_type}`);

    let passed = true;
    if (fields.resultQuality === undefined || fields.resultQuality === null) {
        console.error('❌ FAIL: resultQuality is missing on the enriched row');
        passed = false;
    }
    if (!fields.userContext || !fields.userContext.includes('searched_graphs:')) {
        console.error(`❌ FAIL: userContext does not contain searched_graphs attribution. Got: "${fields.userContext}"`);
        passed = false;
    }

    if (passed) {
        console.log('\n🎉 REAL MULTI-GRAPH SEARCH JOINT INTEGRATION TEST PASSED SUCCESSFULLY!');
        console.log(`   Verified: Exactly 1 row (${row.id}), resultQuality="${fields.resultQuality}", userContext="${fields.userContext}"`);
    } else {
        process.exit(1);
    }
}

testLiveDeployedMCPSearch().catch(err => {
    console.error('❌ Joint integration test failed:', err.message || err);
    process.exit(1);
});
