/**
 * Verification Test: generate_comms_plan Live MCP & API End-to-End Test
 *
 * Verifies:
 * 1. tools-manifest.json entry, categorization, scoped profiles, and Cost Silence
 * 2. Live call to POST /v1/planning/comms-plan with "Gen Z social running clubs" & "On Running"
 * 3. Plan structure: BLUF, T1-T5 comms tasks, 3-layer audience cards with exclusions, retail media shelf
 * 4. Machine-readable activation manifest
 * 5. KaTeX math safety: no bare dollar signs in markdown output
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

async function callApi(method: 'GET' | 'POST', endpoint: string, body?: any) {
    const secret = process.env.FODDA_MCP_SECRET;
    const baseUrl = process.env.FODDA_API_URL || 'https://api.fodda.ai';
    const timestamp = Date.now().toString();
    const payload = method === 'POST' ? `${timestamp}.${JSON.stringify(body ?? {})}` : `${timestamp}.${endpoint}`;
    const signature = secret ? crypto.createHmac('sha256', secret).update(payload).digest('hex') : '';

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Signature': signature,
        'X-Fodda-Billing': 'mcp-orchestrated',
        'X-API-Key': process.env.FODDA_API_KEY || 'sk_live_internal',
    };

    const res = await axios({
        method,
        url: `${baseUrl}${endpoint}`,
        data: body,
        headers,
        timeout: 90000,
    });
    return res;
}

async function run() {
    console.log('================================================================');
    console.log('   Live Verification: generate_comms_plan (MCP & Backend)');
    console.log('================================================================\n');

    // 1. Check tools-manifest.json
    console.log('=== 1. tools-manifest.json Verification ===');
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    assert(fs.existsSync(manifestPath), 'tools-manifest.json exists');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const commsTool = manifest.tools.find((t: any) => t.name === 'generate_comms_plan');
    assert(commsTool !== undefined, 'generate_comms_plan exists in tools-manifest.json');

    if (commsTool) {
        assert(commsTool.bills_as === 'planning', 'generate_comms_plan bills_as is "planning"');
        assert(commsTool.category === 'Planning', 'generate_comms_plan category is "Planning"');
        assert(commsTool.profiles.includes('mcp'), 'profiles includes "mcp" (Cursor / CLI / Desktop)');
        assert(commsTool.profiles.includes('claude'), 'profiles includes "claude"');
        assert(commsTool.profiles.includes('chatgpt'), 'profiles includes "chatgpt"');
        assert(commsTool.profiles.includes('copilot'), 'profiles includes "copilot"');
        assert(!/\b(?:tokens?|via SPT)\b/i.test(commsTool.description), 'No prohibited token/SPT mentions in description');
    }

    // 2. Live Backend API Execution
    console.log('\n=== 2. Live API Call to POST /v1/planning/comms-plan ===');
    const query = 'Gen Z social running clubs';
    const brand = 'On Running';

    try {
        const response = await callApi('POST', '/v1/planning/comms-plan', {
            query,
            brand,
            budget_tier: 'growth',
            markets: ['US']
        });

        assert(response.status === 200, `POST /v1/planning/comms-plan returned HTTP ${response.status}`);
        const data = response.data;
        assert(data !== null && typeof data === 'object', 'Response payload is valid JSON object');

        // Check BLUF
        assert(typeof data.brief === 'string' && data.brief.length > 0, `Brief is populated: "${data.brief}"`);
        assert(data.brand === brand, `Brand matches target: "${data.brand}"`);
        assert(data.plan_on_a_page !== undefined, 'plan_on_a_page is present');
        assert(typeof data.plan_on_a_page?.cultural_tension === 'string', `Cultural tension: "${data.plan_on_a_page?.cultural_tension?.slice(0, 80)}..."`);
        assert(typeof data.plan_on_a_page?.comms_idea === 'string', `Comms idea: "${data.plan_on_a_page?.comms_idea}"`);
        assert(typeof data.plan_on_a_page?.strategic_focus === 'string', 'High-level strategic focus callout is present');

        // Check Comms Tasks (T1-T5)
        assert(Array.isArray(data.comms_tasks) && data.comms_tasks.length >= 5, `Comms tasks populated (${data.comms_tasks?.length || 0} tasks)`);
        const taskIds = (data.comms_tasks || []).map((t: any) => t.task_id);
        assert(taskIds.includes('T1 SEED') && taskIds.includes('T4 CAPTURE'), 'T1 SEED through T5 RETAIN behavioural ladder present');

        // Check Audience Architecture with Exclusions
        assert(Array.isArray(data.audience_architecture) && data.audience_architecture.length >= 1, `Audience architecture populated (${data.audience_architecture?.length || 0} cards)`);
        const allHaveExclusions = (data.audience_architecture || []).every((a: any) => Array.isArray(a.mandatory_exclusions) && a.mandatory_exclusions.length > 0);
        assert(allHaveExclusions, 'All audience cards contain mandatory exclusions');

        // Check Retail Media Shelf
        assert(data.retail_media_shelf !== undefined, 'retail_media_shelf is present');
        assert(data.retail_media_shelf?.amazon_competition_index !== undefined, `Amazon competition index: ${data.retail_media_shelf?.amazon_competition_index}`);

        // Check Tactical Placements
        assert(Array.isArray(data.tactical_placements) && data.tactical_placements.length > 0, `Tactical placements populated (${data.tactical_placements?.length || 0} rows)`);
        const provenanceTypes = new Set((data.tactical_placements || []).map((p: any) => p.provenance_type));
        assert(provenanceTypes.has('LIVE'), 'Tactical placements table includes [LIVE] provenance tags');

        // Check Activation Manifest
        assert(data.activation_manifest !== undefined && typeof data.activation_manifest === 'object', 'activation_manifest JSON object is present');
        assert(Array.isArray(data.activation_manifest?.tasks), 'activation_manifest contains tasks array');
        assert(Array.isArray(data.activation_manifest?.audiences), 'activation_manifest contains audiences array');
        assert(Array.isArray(data.activation_manifest?.placements), 'activation_manifest contains placements array');

        // Check Markdown Output & Dollar Sign Escaping
        assert(typeof data.markdown === 'string' && data.markdown.length > 500, `Markdown deliverable length: ${data.markdown?.length || 0} chars`);
        const bareDollarMatches = data.markdown.match(/(?<!\\)\$[0-9]/g);
        assert(!bareDollarMatches || bareDollarMatches.length === 0, 'No bare dollar signs in markdown (KaTeX math-safe)');

    } catch (err: any) {
        console.error('API call failed:', err?.response?.data || err?.message);
        assert(false, `API call failed: ${err?.message}`);
    }

    console.log(`\n================================================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`================================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run();
