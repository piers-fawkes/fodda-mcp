/**
 * Verification Test: get_earnings_intelligence Activity Scope & ESG Conflation Fix
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { z } from 'zod';

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
    console.log('\n=== 1. Tools Manifest & Cost Silence Verification ===');
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifestTool = manifest.tools.find((t: any) => t.name === 'get_earnings_intelligence');
    
    assert(manifestTool !== undefined, 'get_earnings_intelligence found in tools-manifest.json');
    if (manifestTool) {
        assert(manifestTool.bills_as === 'earnings_intelligence', 'bills_as is "earnings_intelligence"');
        assert(manifestTool.category === 'Financial', 'category is "Financial"');
        assert(manifestTool.description.includes('sustainability'), 'description mentions "sustainability"');
        assert(manifestTool.description.includes('activity: "sustainability" | "marketing" | "retail" | "technology"'), 'description documents all activity enum values');
        assert(manifestTool.description.includes('server-side intent routing'), 'description documents server-side intent routing');
        assert(!manifestTool.description.includes('tokens') && !manifestTool.description.includes('via SPT'), 'description contains NO token/SPT mentions');
        assert(!manifestTool.description.includes('Price: $'), 'description contains NO legacy Price: $ mentions');
    }

    console.log('\n=== 2. Tool Definition & Parameter Binding in src/toolHandlers.ts ===');
    const srcPath = fs.existsSync(path.resolve(__dirname, 'toolHandlers.ts'))
        ? path.resolve(__dirname, 'toolHandlers.ts')
        : path.resolve(__dirname, '../src/toolHandlers.ts');
    const toolHandlersSrc = fs.readFileSync(srcPath, 'utf8');

    assert(toolHandlersSrc.includes("activity: z.enum(['sustainability', 'marketing', 'retail', 'technology']).optional()"), 'activity parameter is defined as optional enum');
    assert(toolHandlersSrc.includes("if (activity) params.set('activity', activity);"), 'activity parameter is forwarded to URLSearchParams');
    assert(toolHandlersSrc.includes("logUserQuery(search || brand || ticker || industry || sector || activity || 'earnings snapshot', 'earnings_intelligence');"), 'activity included in logUserQuery fallback');
    assert(toolHandlersSrc.includes("query: search || brand || ticker || sector || activity || ''"), 'activity included in settleOrWithhold query string');

    console.log('\n=== 3. Zod Parameter Validation Logic ===');
    const activitySchema = z.enum(['sustainability', 'marketing', 'retail', 'technology']).optional();

    assert(activitySchema.safeParse('sustainability').success, 'Accepts "sustainability"');
    assert(activitySchema.safeParse('marketing').success, 'Accepts "marketing"');
    assert(activitySchema.safeParse('retail').success, 'Accepts "retail"');
    assert(activitySchema.safeParse('technology').success, 'Accepts "technology"');
    assert(activitySchema.safeParse(undefined).success, 'Accepts undefined (optional)');
    assert(!activitySchema.safeParse('finance').success, 'Rejects invalid activity "finance"');
    assert(!activitySchema.safeParse('operations').success, 'Rejects invalid activity "operations"');

    console.log('\n=== 4. Live API Connectivity (GET /v1/supplemental/earnings/snapshot) ===');
    const apiKey = process.env.FODDA_API_KEY;
    const secret = process.env.FODDA_MCP_SECRET;
    const baseUrl = process.env.FODDA_API_URL || 'https://api.fodda.ai';

    if (apiKey) {
        const pathStr = '/v1/supplemental/earnings/snapshot?sector=apparel&activity=sustainability';
        const timestamp = Date.now().toString();
        const headers: Record<string, string> = {
            'X-Fodda-Timestamp': timestamp,
            'X-Fodda-Billing': 'mcp-orchestrated',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
        };

        if (secret) {
            const payload = timestamp + '.' + pathStr;
            headers['X-Fodda-Signature'] = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        }

        try {
            const res = await fetch(baseUrl + pathStr, { headers });
            assert(res.status === 200, `Live API returned HTTP ${res.status} for ?sector=apparel&activity=sustainability`);
            const data: any = await res.json();
            assert(data && data.snapshot !== undefined, 'API response contains snapshot object');
            assert(data.snapshot && data.snapshot.query !== undefined, 'Snapshot contains query metadata');
            console.log(`     Total results returned: ${data.snapshot?.total_results}`);
        } catch (err: any) {
            console.error(`  ❌ Live API request error: ${err.message}`);
            failed++;
        }
    } else {
        console.log('  ⚠️ FODDA_API_KEY not found in environment, skipping live endpoint call.');
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Test script error:', err);
    process.exit(1);
});
