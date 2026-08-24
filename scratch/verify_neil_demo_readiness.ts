import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios from 'axios';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';

async function runProbe() {
    console.log(`=== Verification Probes against Deployed MCP Server (${DEPLOYED_MCP_URL}) ===\n`);

    // Check health endpoint for version
    const healthResp = await axios.get('https://mcp.fodda.ai/health');
    console.log(`Health check: status=${healthResp.data.status}, version=${healthResp.data.version}\n`);

    // Setup client
    const transport = new StreamableHTTPClientTransport(
        new URL(`${DEPLOYED_MCP_URL}?api_key=${FODDA_API_KEY}&session_kind=internal-test`)
    );
    const client = new Client({ name: 'neil-demo-verifier', version: '1.0.0' });
    await client.connect(transport as any);
    console.log('Connected to MCP server!\n');

    // ── PROBE 1: Neil Carty Demo Query ──
    console.log('--- PROBE 1: Neil Carty Collectibles Query ---');
    const neilQuery = 'what are the trends in the collectible space, particularly trading cards, like baseball trading cards';
    const res1: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: neilQuery, limit: 10 }
    });

    const parsed1 = JSON.parse(res1.content[0].text);
    console.log('Results returned:', parsed1.rows?.length || 0);
    console.log('Coverage status:', parsed1.coverage?.status);
    console.log('Next moves:', JSON.stringify(parsed1.next_moves, null, 2));

    const textContent1 = res1.content.map((c: any) => c.text).join('\n');
    console.log('\nClosing block instructions / output:');
    const closingMatch1 = textContent1.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=──|$)/);
    if (closingMatch1) {
        console.log(closingMatch1[0]);
    } else {
        console.log('Full content:', textContent1.slice(-500));
    }

    // ── PROBE 2: "what does this cost?" follow-up ──
    console.log('\n--- PROBE 2: "what does this cost?" follow-up (get_capabilities) ---');
    const res2: any = await client.callTool({
        name: 'get_capabilities',
        arguments: {}
    });
    const parsed2 = JSON.parse(res2.content[0].text);
    console.log('get_capabilities pricing_url:', parsed2.pricing_url);
    console.log('get_capabilities content (check cost silence):', JSON.stringify(parsed2, null, 2).slice(0, 400));

    // ── PROBE 3: "can I book Jeremy Bergstein?" ──
    console.log('\n--- PROBE 3: "can I book Jeremy Bergstein?" (list_analysts) ---');
    const res3: any = await client.callTool({
        name: 'list_analysts',
        arguments: {}
    });
    const parsed3 = JSON.parse(res3.content[0].text);
    const analysts = parsed3.analysts || parsed3;
    const jeremy = Array.isArray(analysts) ? analysts.find((a: any) => (a.name || '').toLowerCase().includes('jeremy')) : null;
    console.log('Jeremy Bergstein booking entry:', JSON.stringify(jeremy, null, 2));

    // ── PROBE 4: Patrick\'s Query (creative effectiveness, dentsu graph) ──
    console.log('\n--- PROBE 4: Patrick\'s Query (creative effectiveness) ---');
    const res4: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: 'creative effectiveness', graphs: ['dentsu-creative-marketing'], limit: 10 }
    });
    const parsed4 = JSON.parse(res4.content[0].text);
    console.log('Patrick coverage status:', parsed4.coverage?.status);
    console.log('Patrick next moves:', JSON.stringify(parsed4.next_moves, null, 2));

    // ── PROBE 5: 1.46.29 Regression Probes ──
    console.log('\n--- PROBE 5A: Lululemon brand_tracker ---');
    const res5a: any = await client.callTool({
        name: 'brand_tracker',
        arguments: { brand_name: 'Lululemon' }
    });
    const parsed5a = JSON.parse(res5a.content[0].text);
    console.log('Lululemon next_moves:', JSON.stringify(parsed5a.next_moves, null, 2));

    console.log('\n--- PROBE 5B: Gen Z beverage search ---');
    const res5b: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: 'Gen Z functional beverage and soda alternatives', limit: 10 }
    });
    const parsed5b = JSON.parse(res5b.content[0].text);
    console.log('Gen Z beverage next_moves:', JSON.stringify(parsed5b.next_moves, null, 2));

    await client.close();
    console.log('\n=== Probes Complete ===');
}

runProbe().catch(console.error);
