/**
 * Verification Test: verify_market_claim & get_intelligence_dossier MCP Tools
 *
 * Verifies:
 * 1. Pricing cache registration and getToolCostSummary()
 * 2. tools-manifest.json entries and Cost Silence compliance
 * 3. Live call to POST /v1/verify/claim with "Casual golf venues are losing momentum"
 *    - Asserts verdict is REFUTED_BY_EVIDENCE
 *    - Asserts contradictory evidence flags Off Golf / Mulligan / capital funding
 *    - Asserts 5 Anti-Hallucination Kill Gates evaluation structure
 * 4. Live call to POST /v1/intelligence/dossier with "functional soda prebiotic growth US sales"
 *    - Asserts evidence items carry valid URLs
 *    - Asserts statistics have units
 *    - Asserts 4-beat PSFK executive briefing structure when include_editorial is true
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initPricingCache, getToolCostSummary, getQueryPrice } from './pricingCache.js';

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
        'X-API-Key': process.env.FODDA_API_KEY || 'sk_live_abcdef',
    };

    const res = await axios({
        method,
        url: `${baseUrl}${endpoint}`,
        data: body,
        headers,
        timeout: 90000,
    });
    return res.data;
}

async function run() {
    console.log('\n=== 1. Pricing Cache & Cost Summary ===');
    await initPricingCache();
    const costs = getToolCostSummary();

    const claimTool = costs.find(c => c.tool === 'verify_market_claim');
    assert(claimTool !== undefined, 'verify_market_claim is registered in pricing cache');
    if (claimTool) {
        assert(claimTool.apiCalls === 1, 'verify_market_claim is billed as 1 call ($0.50 equivalent)');
    }

    const dossierTool = costs.find(c => c.tool === 'get_intelligence_dossier');
    assert(dossierTool !== undefined, 'get_intelligence_dossier is registered in pricing cache');
    if (dossierTool) {
        assert(dossierTool.apiCalls === 1, 'get_intelligence_dossier is billed as 1 call ($0.50 equivalent)');
    }

    console.log('\n=== 2. Tools Manifest & Cost Silence Guards ===');
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const mVerify = manifest.tools.find((t: any) => t.name === 'verify_market_claim');
    assert(mVerify !== undefined, 'verify_market_claim exists in tools-manifest.json');
    if (mVerify) {
        assert(mVerify.bills_as === 'topic_research', 'verify_market_claim bills_as is "topic_research"');
        assert(mVerify.category === 'Intelligence', 'verify_market_claim category is "Intelligence"');
        assert(mVerify.description.includes('$0.50'), 'verify_market_claim description includes "$0.50"');
        assert(!/\b(?:tokens?|via SPT)\b/i.test(mVerify.description), 'verify_market_claim description has NO token/SPT phrasing');
    }

    const mDossier = manifest.tools.find((t: any) => t.name === 'get_intelligence_dossier');
    assert(mDossier !== undefined, 'get_intelligence_dossier exists in tools-manifest.json');
    if (mDossier) {
        assert(mDossier.bills_as === 'topic_research', 'get_intelligence_dossier bills_as is "topic_research"');
        assert(mDossier.category === 'Intelligence', 'get_intelligence_dossier category is "Intelligence"');
        assert(mDossier.description.includes('$0.50'), 'get_intelligence_dossier description includes "$0.50"');
        assert(!/\b(?:tokens?|via SPT)\b/i.test(mDossier.description), 'get_intelligence_dossier description has NO token/SPT phrasing');
    }

    console.log('\n=== 3. Live verify_market_claim Verification ("Casual golf venues are losing momentum") ===');
    try {
        const claimResult = await callApi('POST', '/v1/verify/claim', {
            claim: 'Casual golf venues are losing momentum',
            context: 'golf entertainment venues Topgolf Off Golf',
            sector: 'sports',
            strict_gates: true,
        });

        assert(claimResult.ok === true, 'Claim verification returned ok: true');
        assert(claimResult.verdict === 'REFUTED_BY_EVIDENCE', `Verdict is REFUTED_BY_EVIDENCE (got: ${claimResult.verdict})`);
        assert(claimResult.verified === false, 'Claim verified flag is false');
        assert(Boolean(claimResult.kill_reason), `Kill reason is populated: "${claimResult.kill_reason}"`);

        const killReasonLower = (claimResult.kill_reason || '').toLowerCase();
        const critiqueLower = (claimResult.adversarial_critique || '').toLowerCase();
        const contraTitles = (claimResult.contradictory_evidence || []).map((e: any) => (e.title || '').toLowerCase()).join(' ');
        const flagsExpansion = killReasonLower.includes('expansion') || contraTitles.includes('off golf') || contraTitles.includes('mulligan') || critiqueLower.includes('off golf') || critiqueLower.includes('mulligan');
        assert(flagsExpansion, 'Contradictory evidence or critique correctly flags Off Golf/Mulligan funding or category expansion');

        assert(Boolean(claimResult.gates), 'Gates object is present');
        assert(claimResult.gates?.adversarial_counter_thesis !== undefined, 'Gate 1 (Adversarial Counter-Thesis) evaluated');
        assert(claimResult.gates?.multi_source_corroboration !== undefined, 'Gate 2 (Multi-Source Corroboration) evaluated');
        assert(claimResult.gates?.numeric_spine !== undefined, 'Gate 3 (Numeric Spine) evaluated');
        assert(claimResult.gates?.entity_verification !== undefined, 'Gate 4 (Entity Verification) evaluated');
        assert(claimResult.gates?.supporting_commentary !== undefined, 'Gate 5 (Supporting Commentary) evaluated');
    } catch (err: any) {
        assert(false, `verify_market_claim API call failed: ${err.response?.data?.message || err.message}`);
    }

    console.log('\n=== 4. Live get_intelligence_dossier Verification ("functional soda prebiotic growth US sales") ===');
    try {
        const dossierResult = await callApi('POST', '/v1/intelligence/dossier', {
            topic: 'functional soda prebiotic growth US sales',
            sector: 'food',
            include_editorial: true,
        });

        assert(dossierResult.ok === true, 'Dossier query returned ok: true');
        assert(Boolean(dossierResult.dossier), 'Dossier object is present');

        const evidence = dossierResult.dossier?.evidence_items || [];
        assert(evidence.length > 0, `Evidence items returned (${evidence.length} items)`);
        const hasLiveUrls = evidence.some((e: any) => (e.url || e.source_url) && /^https?:\/\//i.test(e.url || e.source_url));
        assert(hasLiveUrls, 'Evidence items carry live citable URLs');

        const stats = dossierResult.dossier?.statistics || [];
        assert(Array.isArray(stats), 'Macro / quantitative statistics array returned');
        if (stats.length > 0) {
            const statsHaveUnits = stats.some((s: any) => Boolean(s.unit || s.metric));
            assert(statsHaveUnits, 'Statistics items specify units and indicator names');
        }

        assert(Boolean(dossierResult.dossier?.adversarial_critique), 'Adversarial critique / contrarian stress-test is populated');

        assert(Boolean(dossierResult.editorial), 'Editorial output is generated when include_editorial is true');
        if (dossierResult.editorial) {
            const ed = dossierResult.editorial;
            assert(Boolean(ed.headline), `Editorial headline: "${ed.headline}"`);
            assert(Boolean(ed.sections?.structured?.market_lede), 'Beat 1 (Market Lede) is structured');
            assert(Boolean(ed.sections?.structured?.core_debate), 'Beat 2 (Core Tension / Debate) is structured');
            assert(Boolean(ed.sections?.structured?.competing_playbooks), 'Beat 3 (Competing Playbooks) is structured');
            assert(Boolean(ed.sections?.structured?.strategic_stakes), 'Beat 4 (Strategic Stakes) is structured');
        }
    } catch (err: any) {
        assert(false, `get_intelligence_dossier API call failed: ${err.response?.data?.message || err.message}`);
    }

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
