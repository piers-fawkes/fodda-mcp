import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import axios from 'axios';

const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
const FODDA_API_KEY = process.env.FODDA_INTERNAL_API_KEY || process.env.FODDA_API_KEY || 'sk_live_abcdef';

function extractJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        const rawMatch = text.match(/── RAW DATA[^\n]*\n([\s\S]*?)(?=\n──|$)/);
        if (rawMatch && rawMatch[1]) {
            try {
                return JSON.parse(rawMatch[1]);
            } catch {}
        }
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {}
        }
        return null;
    }
}

async function runProbe() {
    console.log(`=== Verification Probes against Deployed MCP Server (${DEPLOYED_MCP_URL}) ===\n`);

    // Check health endpoint for version
    const healthResp = await axios.get('https://mcp.fodda.ai/health');
    console.log(`Health check: status=${healthResp.data.status}, version=${healthResp.data.version}\n`);

    // Setup client with Bearer Authorization header
    const transport = new StreamableHTTPClientTransport(
        new URL(DEPLOYED_MCP_URL),
        {
            requestInit: {
                headers: {
                    'Authorization': `Bearer ${FODDA_API_KEY}`,
                    'X-API-Key': FODDA_API_KEY,
                    'X-Fodda-Session-Kind': 'internal-test'
                }
            }
        }
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

    const parsed1 = extractJson(res1.content[0].text);
    console.log('Results returned:', parsed1?.rows?.length || 0);
    console.log('Coverage status:', parsed1?.coverage?.status);
    console.log('Next moves:', JSON.stringify(parsed1?.next_moves, null, 2));

    const textContent1 = res1.content.map((c: any) => c.text).join('\n');
    const closingMatch1 = textContent1.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n\n──|$)/);
    if (closingMatch1) {
        console.log('\nClosing Block:');
        console.log(closingMatch1[0]);
    }

    // ── PROBE 2: "what does this cost?" follow-up ──
    console.log('\n--- PROBE 2: "what does this cost?" follow-up (get_capabilities) ---');
    const res2: any = await client.callTool({
        name: 'get_capabilities',
        arguments: {}
    });
    const parsed2 = extractJson(res2.content[0].text);
    console.log('get_capabilities pricing_url:', parsed2?.pricing_url);

    // ── PROBE 3: "can I book Jeremy Bergstein?" ──
    console.log('\n--- PROBE 3: "can I book Jeremy Bergstein?" (list_analysts) ---');
    const res3: any = await client.callTool({
        name: 'list_analysts',
        arguments: {}
    });
    const parsed3 = extractJson(res3.content[0].text);
    const analysts = parsed3?.analysts || parsed3;
    const jeremy = Array.isArray(analysts) ? analysts.find((a: any) => (a.name || '').toLowerCase().includes('jeremy')) : null;
    console.log('Jeremy Bergstein book_a_call:', JSON.stringify(jeremy?.book_a_call, null, 2));

    // ── PROBE 4: Patrick\'s Query (creative effectiveness, dentsu graph) ──
    console.log('\n--- PROBE 4: Patrick\'s Query (creative effectiveness) ---');
    const res4: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: 'creative effectiveness', graphs: ['dentsu-creative-marketing'], limit: 10 }
    });
    const parsed4 = extractJson(res4.content[0].text);
    console.log('Patrick coverage status:', parsed4?.coverage?.status);
    console.log('Patrick next moves:', JSON.stringify(parsed4?.next_moves, null, 2));
    const textContent4 = res4.content.map((c: any) => c.text).join('\n');
    const closingMatch4 = textContent4.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n\n──|$)/);
    if (closingMatch4) {
        console.log('\nPatrick Closing Block:');
        console.log(closingMatch4[0]);
    }

    // ── PROBE 5: 1.46.29 Regression Probes ──
    console.log('\n--- PROBE 5A: Lululemon brand_tracker ---');
    const res5a: any = await client.callTool({
        name: 'brand_tracker',
        arguments: { brand_name: 'Lululemon' }
    });
    const parsed5a = extractJson(res5a.content[0]?.text || '');
    console.log('Lululemon next_moves:', JSON.stringify(parsed5a?.next_moves, null, 2));
    const textContent5a = res5a.content.map((c: any) => c.text).join('\n');
    const closingMatch5a = textContent5a.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n\n──|$)/);
    if (closingMatch5a) {
        console.log('\nLululemon Closing Block:');
        console.log(closingMatch5a[0]);
    }

    console.log('\n--- PROBE 5B: James Colistra consult ---');
    const res5b_consult: any = await client.callTool({
        name: 'consult_human_agent',
        arguments: { analyst_id: 'james-colistra-earned-media-and-podcast', query: 'earned media strategy for luxury brands' }
    });
    const textContent5b_consult = res5b_consult.content.map((c: any) => c.text).join('\n');
    const consultClosing = textContent5b_consult.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n\n──|$)/);
    if (consultClosing) {
        console.log('\nJames Colistra Closing Block:');
        console.log(consultClosing[0]);
    }

    console.log('\n--- PROBE 5C: Gen Z beverage search ---');
    const res5c: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: 'Gen Z functional beverage and soda alternatives', limit: 10 }
    });
    const parsed5c = extractJson(res5c.content[0].text);
    console.log('Gen Z beverage next_moves:', JSON.stringify(parsed5c?.next_moves, null, 2));
    const textContent5c = res5c.content.map((c: any) => c.text).join('\n');
    const closingMatch5c = textContent5c.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n\n──|$)/);
    if (closingMatch5c) {
        console.log('\nGen Z Beverage Closing Block:');
        console.log(closingMatch5c[0]);
    }

    await client.close();
    console.log('\n=== All Probes Complete ===');
}

runProbe().catch(console.error);
