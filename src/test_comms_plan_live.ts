/**
 * Verification Test: generate_comms_plan Live MCP & API End-to-End Test
 *
 * Verifies:
 * 1. tools-manifest.json entry, categorization, scoped profiles, 7-section Brand Connections Plan description, and Cost Silence
 * 2. Live call to POST /v1/planning/comms-plan & MCP handler (view='full_plan') with "Gen Z social running clubs" & "On Running"
 * 3. 7-Section Strategy-to-Activation Brand Connections Plan + Appendix A (A.1-A.4) un-truncated
 * 4. Runtime Evidence Ledger (research_diagnostics.evidence_ledger, EVID-xxx) & ledger-governed [LIVE]/[CAPABILITY]/[UNVERIFIED] tags
 * 5. First-party US broadcast/streaming media rights (sports_and_tentpole_media_rights, FIRST_PARTY_PUBLIC_RIGHTS_GROUND_TRUTH)
 * 6. Enterprise audience-affinity & streaming backlog (platform_integration_backlog: YouGov, MRI-Simmons, FlixPatrol & Luminate, GlobalData)
 * 7. Live call to GET /v1/planning/sports-media-rights & MCP handler (view='sports_media_rights')
 * 8. KaTeX math safety: no bare dollar signs in markdown output
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer } from './toolHandlers.js';
import { callFoddaAPI } from './foddaClient.js';

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
        'X-Fodda-Billing': 'mcp-orchestrated',
        'X-Fodda-Signature': signature,
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
        assert(commsTool.description.includes('Audience-Led Brand Connections Plan'), 'Description references Audience-Led Brand Connections Plan');
        assert(commsTool.description.includes('Appendix A'), 'Description references isolated Appendix A');
        assert(commsTool.description.includes('sports_media_rights'), 'Description documents view="sports_media_rights"');
        assert(!/\b(?:tokens?|via SPT)\b/i.test(commsTool.description), 'No prohibited token/SPT mentions in description');
    }

    // 2. Live MCP Tool Handler & Backend API Execution (view='full_plan')
    console.log('\n=== 2. Live MCP Handler & API Call: POST /v1/planning/comms-plan (view="full_plan") ===');
    const query = 'Gen Z social running clubs';
    const brand = 'On Running';
    const apiKey = process.env.FODDA_API_KEY || 'sk_live_internal';

    const server = await createServer(
        apiKey,
        'test_comms_plan_verifier',
        callFoddaAPI as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );
    const registeredTools = (server as any)._registeredTools;
    const handler = registeredTools['generate_comms_plan']?.handler;
    assert(typeof handler === 'function', 'generate_comms_plan handler is registered on MCP server');

    try {
        const mcpResult = await handler({
            query,
            brand,
            budget_tier: 'growth',
            markets: ['US'],
            view: 'full_plan'
        });

        assert(!mcpResult.isError, 'MCP generate_comms_plan(view="full_plan") succeeded without error');
        assert(mcpResult.output_classification === 'STRATEGIC CONNECTIONS PLAN', `output_classification is "${mcpResult.output_classification}"`);
        assert(typeof mcpResult.brief === 'string' && mcpResult.brief.length > 0, `Brief is populated: "${mcpResult.brief}"`);
        assert(mcpResult.brand === brand, `Brand matches target: "${mcpResult.brand}"`);

        // Check 7-Section Markdown + Appendix A (A.1 - A.4)
        const md: string = mcpResult.formatted_markdown || mcpResult.markdown || '';
        assert(md.length > 2000, `Full Markdown deliverable returned (${md.length} chars)`);
        assert(md.includes('## 1. The Audience & Human Tension'), 'Section 1 (The Audience & Human Tension) present');
        assert(md.includes('## 2. The Idea or Concept'), 'Section 2 (The Idea or Concept) present');
        assert(md.includes('## 3. Connection Points'), 'Section 3 (Connection Points) present');
        assert(md.includes('## 4. Role of Each Connection'), 'Section 4 (Role of Each Connection) present');
        assert(md.includes('## 5. Retail and Commerce Connections'), 'Section 5 (Retail and Commerce Connections) present');
        assert(md.includes('## 6. Priorities, Trade-offs & Deliberate Omissions'), 'Section 6 (Priorities, Trade-offs & Deliberate Omissions) present');
        assert(md.includes('## 7. Evidence & Confidence Provenance'), 'Section 7 (Evidence & Confidence Provenance) present');
        assert(md.includes('## Appendix A: Optional Media Buyer & Producer Reference'), 'Appendix A present (not stripped or truncated)');
        assert(md.includes('### A.4 Official Live Sports & Tentpole Broadcast/Streaming Rights Reference'), 'Appendix A.4 Official Live Sports & Tentpole Broadcast/Streaming Rights present');

        // Check Runtime Evidence Ledger (research_diagnostics.evidence_ledger)
        const ledger = mcpResult.research_diagnostics?.evidence_ledger || mcpResult.activation_manifest?.research_diagnostics?.evidence_ledger;
        assert(Array.isArray(ledger) && ledger.length > 0, `Runtime Evidence Ledger populated (${ledger?.length || 0} EVID-xxx entries)`);
        assert(ledger.every((e: any) => typeof e.evidence_id === 'string' && e.evidence_id.startsWith('EVID-')), 'All ledger rows have valid EVID-xxx IDs');

        // Check Sports & Tentpole Media Rights
        const rights = mcpResult.sports_and_tentpole_media_rights;
        assert(Array.isArray(rights) && rights.length > 0, `sports_and_tentpole_media_rights populated (${rights?.length || 0} records)`);
        assert(rights.every((r: any) => r.provenance_classification === 'FIRST_PARTY_PUBLIC_RIGHTS_GROUND_TRUTH'), 'All sports rights records carry FIRST_PARTY_PUBLIC_RIGHTS_GROUND_TRUTH');

        // Check Platform Integration Backlog
        const backlog = mcpResult.platform_integration_backlog;
        assert(Array.isArray(backlog) && backlog.length > 0, `platform_integration_backlog populated (${backlog?.length || 0} records)`);
        const providers = backlog.map((b: any) => b.platform_or_provider);
        assert(providers.includes('YouGov') && providers.includes('MRI-Simmons') && providers.includes('FlixPatrol & Luminate') && providers.includes('GlobalData'), 'Backlog includes YouGov, MRI-Simmons, FlixPatrol & Luminate, and GlobalData');

        // Check KaTeX math safety
        const bareDollarMatches = md.match(/(?<!\\)\$[0-9]/g);
        assert(!bareDollarMatches || bareDollarMatches.length === 0, 'No bare dollar signs in markdown (KaTeX math-safe)');
    } catch (err: any) {
        console.error('full_plan call failed:', err?.response?.data || err?.message);
        assert(false, `full_plan call failed: ${err?.message}`);
    }

    // 3. Live MCP Tool Handler & Backend API Execution (view='sports_media_rights')
    console.log('\n=== 3. Live MCP Handler & API Call: GET /v1/planning/sports-media-rights (view="sports_media_rights") ===');
    try {
        const directRes = await callApi('GET', '/v1/planning/sports-media-rights?query=all&domain=sports');
        assert(directRes.status === 200, `GET /v1/planning/sports-media-rights returned HTTP ${directRes.status}`);

        const rightsResult = await handler({
            view: 'sports_media_rights',
            query: 'all',
            domain: 'sports'
        });

        assert(!rightsResult.isError, 'MCP generate_comms_plan(view="sports_media_rights") succeeded without error');
        assert(rightsResult.view === 'sports_media_rights', 'Returned view is "sports_media_rights"');
        const allRights = rightsResult.sports_and_tentpole_media_rights || [];
        const leagues = allRights.map((r: any) => r.league_or_property);
        assert(allRights.length >= 5, `Returned all ${allRights.length} major sports/tentpole rights records: ${leagues.join(', ')}`);
        assert(leagues.includes('Endurance & Olympic Sports') && leagues.includes('NFL') && leagues.includes('NBA') && leagues.includes('MLB') && leagues.includes('NHL'), 'Covers Endurance & Olympic Sports, NFL, NBA, MLB, and NHL');

        const entBacklog = rightsResult.entertainment_and_audience_integration_backlog || [];
        assert(entBacklog.length >= 4, `Returned ${entBacklog.length} entertainment_and_audience_integration_backlog items`);
    } catch (err: any) {
        console.error('sports_media_rights call failed:', err?.response?.data || err?.message);
        assert(false, `sports_media_rights call failed: ${err?.message}`);
    }

    console.log(`\n================================================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`================================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run();
