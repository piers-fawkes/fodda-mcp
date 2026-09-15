/**
 * Verification Test: get_earnings_divergence Reconnection & Query Pricing Registration
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initPricingCache, getToolCostSummary } from './pricingCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

async function run() {
    console.log('\n=== 1. Pricing Cache & Account Verification ===');
    await initPricingCache();
    const costs = getToolCostSummary();
    const divCost = costs.find(c => c.tool === 'get_earnings_divergence');
    assert(divCost !== undefined, 'get_earnings_divergence is present in getToolCostSummary()');
    if (divCost) {
        assert(divCost.tool === 'get_earnings_divergence', 'tool matches get_earnings_divergence');
        assert(divCost.name === 'Earnings Divergence & Deflection', 'name matches "Earnings Divergence & Deflection"');
        assert(divCost.apiCalls === 40, 'apiCalls charged is 40 ($20.00 equivalent)');
    }

    console.log('\n=== 2. Tools Manifest & Code Invariants ===');
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifestTool = manifest.tools.find((t: any) => t.name === 'get_earnings_divergence');
    assert(manifestTool !== undefined, 'get_earnings_divergence found in tools-manifest.json');
    if (manifestTool) {
        assert(manifestTool.bills_as === 'earnings_divergence', 'bills_as is "earnings_divergence"');
        assert(manifestTool.description.includes('$20 per query'), 'description includes published price "$20 per query"');
        assert(!manifestTool.description.includes('tokens') && !manifestTool.description.includes('via SPT'), 'description has NO token/SPT phrasing');
        assert(!manifestTool.description.includes('(legacy-thematic)'), 'legacy-thematic text was removed');
    }

    const srcPath = fs.existsSync(path.resolve(__dirname, 'toolHandlers.ts'))
        ? path.resolve(__dirname, 'toolHandlers.ts')
        : path.resolve(__dirname, '../src/toolHandlers.ts');
    const toolHandlersSrc = fs.readFileSync(srcPath, 'utf8');
    assert(!toolHandlersSrc.includes('/v1/supplemental/earnings/divergence'), 'legacy /v1/supplemental/earnings/divergence route eliminated');
    assert(toolHandlersSrc.includes("sptGuard('earnings_divergence')"), 'sptGuard uses earnings_divergence');
    assert(toolHandlersSrc.includes("queryTypeCode: 'earnings_divergence'"), 'settleOrWithhold uses queryTypeCode earnings_divergence');

    console.log('\n=== 3. Live Truth-Layer Endpoint Probes ===');
    const apiKey = process.env.FODDA_API_KEY;
    const apiUrl = process.env.FODDA_API_URL || 'https://api.fodda.ai';
    const secret = process.env.FODDA_MCP_SECRET;

    if (!apiKey || !secret) {
        console.warn('  ⚠️ Skipping live endpoint probe: FODDA_API_KEY or FODDA_MCP_SECRET not set');
    } else {
        async function probe(queryParams: string, label: string) {
            const reqPath = `/v1/earnings/divergence${queryParams ? '?' + queryParams : ''}`;
            const timestamp = Date.now().toString();
            const payload = timestamp + '.' + reqPath;
            const signature = crypto.createHmac('sha256', secret!).update(payload).digest('hex');
            const headers: Record<string, string> = {
                'X-Fodda-Timestamp': timestamp,
                'X-Fodda-Billing': 'mcp-orchestrated',
                'X-API-Key': apiKey!,
                'X-Fodda-Signature': signature,
                'Content-Type': 'application/json',
            };
            const res = await fetch(`${apiUrl}${reqPath}`, { headers });
            assert(res.status === 200, `${label}: HTTP 200 returned`);
            const body = await res.json();
            return body;
        }

        // Probe A: Default Live Probe with {}
        console.log('\n  [Probe A: Default {}]');
        const defaultData = await probe('min_companies=2&limit=5', 'Default probe');
        assert(defaultData && defaultData.data, 'Default probe returns data envelope');
        assert(Array.isArray(defaultData.data?.themes), 'defaultData.data.themes is an array');
        assert(defaultData.data?.themes?.length > 0, 'defaultData.data.themes count > 0');
        assert(defaultData.data?.tickers_scanned >= 500, `scans covered companies (${defaultData.data?.tickers_scanned} scanned)`);

        const firstTheme = defaultData.data?.themes?.[0];
        if (firstTheme) {
            assert(typeof firstTheme.question_theme === 'string', 'theme has question_theme');
            assert(typeof firstTheme.company_count === 'number' && firstTheme.company_count >= 2, `company_count >= 2 (${firstTheme.company_count})`);
            assert(Array.isArray(firstTheme.companies) && firstTheme.companies.length >= 2, 'companies list has >= 2 tickers');
            assert(typeof firstTheme.directness_breakdown === 'object', 'directness_breakdown object present');
        }

        // Probe B: Sector probe with { sector: 'retail' }
        console.log('\n  [Probe B: Sector "retail"]');
        const retailData = await probe('sector=retail&min_companies=1&limit=5', 'Sector retail probe');
        assert(retailData && retailData.data, 'Sector retail probe returns data envelope');
        assert(Array.isArray(retailData.data?.themes), 'retailData.data.themes is an array');
        assert(retailData.data?.themes?.length > 0, `retail themes count > 0 (${retailData.data?.themes?.length})`);
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
