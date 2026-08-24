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

async function verifyNeilLive() {
    console.log(`=== Live Verification of Neil Query against ${DEPLOYED_MCP_URL} ===\n`);

    const health = await axios.get('https://mcp.fodda.ai/health');
    console.log(`Live Server: version=${health.data.version}, status=${health.data.status}\n`);

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
    const client = new Client({ name: 'neil-live-verifier', version: '1.0.0' });
    await client.connect(transport as any);

    const neilQuery = 'what are the trends in the collectible space, particularly trading cards, like baseball trading cards';
    console.log(`Query: "${neilQuery}"\n`);
    const res: any = await client.callTool({
        name: 'search_graph',
        arguments: { query: neilQuery, limit: 10 }
    });

    const parsed = extractJson(res.content[0].text);
    console.log('--- Top Rows Returned ---');
    const rows = parsed?.rows || [];
    rows.slice(0, 5).forEach((r: any, i: number) => {
        console.log(`Rank #${i + 1}: "${r.title || r.trendName || r.name}" | signal: ${r.signal_score} | relevance: ${r.relevance_score}`);
    });

    const fullText = res.content.map((c: any) => c.text).join('\n');

    console.log('\n--- Widget Analysis ---');
    const hasGasolineZero = fullText.includes('Gasoline Stations') || fullText.includes('$0.0B');
    console.log(`Contains zero-value Gasoline Stations ($0.0B): ${hasGasolineZero ? '❌ FAIL' : '✅ CLEAN OMIT'}`);

    const hasPlayStationChips = fullText.includes('PlayStation') || fullText.includes('Hermès') || fullText.includes('Louis Vuitton');
    console.log(`Contains mega-trend brand chips (PlayStation/Hermès): ${hasPlayStationChips ? '❌ FAIL' : '✅ CLEAN OMIT'}`);

    const hasMarketSection = fullText.includes('<div class="sec">Market</div>');
    console.log(`Rendered Market section: ${hasMarketSection ? 'YES' : 'CLEAN-OMITTED'}`);

    const top3ContainsNiche = rows.slice(0, 3).some((r: any) =>
        (r.title || r.trendName || '').toLowerCase().includes('collector') ||
        (r.title || r.trendName || '').toLowerCase().includes('booster') ||
        (r.title || r.trendName || '').toLowerCase().includes('card')
    );
    console.log(`Top 3 contains Booster/Variation/Collector trend: ${top3ContainsNiche ? '✅ PASS' : '❌ FAIL'}`);

    const widgetInstructionMatch = fullText.match(/── SEARCH WIDGET:[\s\S]*?(?=\n──|$)/);
    if (widgetInstructionMatch) {
        console.log('\nWidget Instruction / Context:');
        console.log(widgetInstructionMatch[0]);
    }

    const closingBlockMatch = fullText.match(/── NEXT MOVES CLOSING BLOCK[\s\S]*?(?=\n──|$)/);
    if (closingBlockMatch) {
        console.log('\nNext Moves Closing Block:');
        console.log(closingBlockMatch[0]);
    }

    await client.close();
}

verifyNeilLive().catch(console.error);
