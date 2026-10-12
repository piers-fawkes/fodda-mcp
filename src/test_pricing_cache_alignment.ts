/**
 * Test: Pricing Cache & Tool Costs Alignment with Authoritative API Rates (metering.ts)
 *
 * Verifies that DEFAULT_PRICING and getToolCostSummary() in pricingCache.ts:
 * 1. Divergence = 1 API call (was 40)
 * 2. Per-Ticker Earnings Snapshot = 1 API call (was 10)
 * 3. Deep Research (Heavy) = 10 API calls (was 30)
 * 4. Brand Intelligence Tracker = 4 API calls (was 20)
 * 5. Weekly Tracker = 4 API calls (was 20)
 * 6. Brainstorm = 4 API calls (was 15)
 * 7. URL as Prompt = 1 API call (was 15)
 * 8. Upload & Compare = 4 API calls (was 20)
 * 9. Standalone Supplemental = 1 API call (was 5)
 * 10. Standalone Evidence = 1 API call (was 5)
 * 11. Standalone Statistics = 1 API call (was 5)
 * 12. Deep Research (Light) = 5 API calls (was 20)
 * 13. Earnings Compare = 2 API calls (was 15)
 * 14. Zero occurrences of inflated 40-call or 10-call quotes for 1-call tools
 */

import { initPricingCache, getToolCostSummary, getQueryPrice } from './pricingCache.js';

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
    console.log('\n=== 1. Initialize Pricing Cache ===');
    await initPricingCache();
    const costs = getToolCostSummary();
    console.log(`  Loaded ${costs.length} active billable tool costs in getToolCostSummary()`);

    console.log('\n=== 2. Section 3.B Required Invariants ===');
    const div = costs.find(c => c.tool === 'get_earnings_divergence');
    assert(div !== undefined, 'get_earnings_divergence is in summary');
    assert(div?.apiCalls === 1, `Earnings Divergence & Deflection = 1 API call (got: ${div?.apiCalls})`);

    const snapshot = costs.find(c => c.tool === 'get_company_earnings' && c.mode === 'snapshot');
    assert(snapshot !== undefined, 'get_company_earnings (snapshot) is in summary');
    assert(snapshot?.apiCalls === 1, `Per-Ticker Earnings Snapshot = 1 API call (got: ${snapshot?.apiCalls})`);

    const deepHeavy = costs.find(c => c.tool === 'deep_research_topic' && c.mode === 'heavy');
    assert(deepHeavy !== undefined, 'deep_research_topic (heavy) is in summary');
    assert(deepHeavy?.apiCalls === 10, `Deep Research (Heavy) = 10 API calls (got: ${deepHeavy?.apiCalls})`);

    const brand = costs.find(c => c.tool === 'brand_tracker');
    assert(brand !== undefined, 'brand_tracker is in summary');
    assert(brand?.apiCalls === 4, `Brand Intelligence Tracker = 4 API calls (got: ${brand?.apiCalls})`);

    console.log('\n=== 3. Complete Canonical Rates Alignment ===');
    const topicResearch = costs.find(c => c.tool === 'search_graph' && c.mode === 'research');
    assert(topicResearch?.apiCalls === 1, `Topic Research = 1 API call (got: ${topicResearch?.apiCalls})`);

    const deepLight = costs.find(c => c.tool === 'deep_research_topic' && c.mode === 'light');
    assert(deepLight?.apiCalls === 5, `Deep Research (Light) = 5 API calls (got: ${deepLight?.apiCalls})`);

    const brainstorm = costs.find(c => c.tool === 'brainstorm_topic');
    assert(brainstorm?.apiCalls === 4, `Brainstorm = 4 API calls (got: ${brainstorm?.apiCalls})`);

    const urlPrompt = costs.find(c => c.tool === 'read_url');
    assert(urlPrompt?.apiCalls === 1, `URL as Prompt = 1 API call (got: ${urlPrompt?.apiCalls})`);

    const uploadCompare = costs.find(c => c.tool === 'search_graph' && c.mode === 'compare');
    assert(uploadCompare?.apiCalls === 4, `Upload & Compare = 4 API calls (got: ${uploadCompare?.apiCalls})`);

    const weekly = costs.find(c => c.tool === 'manage_scheduled_reports');
    assert(weekly?.apiCalls === 4, `Weekly Tracker = 4 API calls (got: ${weekly?.apiCalls})`);

    const supplemental = costs.find(c => c.tool === 'get_supplemental_context');
    assert(supplemental?.apiCalls === 1, `Standalone Supplemental = 1 API call (got: ${supplemental?.apiCalls})`);

    const evidence = costs.find(c => c.tool === 'get_evidence');
    assert(evidence?.apiCalls === 1, `Evidence Lookup = 1 API call (got: ${evidence?.apiCalls})`);

    const stats = costs.find(c => c.tool === 'search_statistics');
    assert(stats?.apiCalls === 1, `Statistics Search = 1 API call (got: ${stats?.apiCalls})`);

    const history = costs.find(c => c.tool === 'get_company_earnings' && c.mode === 'history');
    assert(history?.apiCalls === 1, `Earnings History = 1 API call (got: ${history?.apiCalls})`);

    const qa = costs.find(c => c.tool === 'get_company_earnings' && c.mode === 'qa');
    assert(qa?.apiCalls === 1, `Earnings Q&A = 1 API call (got: ${qa?.apiCalls})`);

    const compare = costs.find(c => c.tool === 'get_company_earnings' && c.mode === 'compare');
    assert(compare?.apiCalls === 2, `Earnings Compare = 2 API calls (got: ${compare?.apiCalls})`);

    const guidance = costs.find(c => c.tool === 'get_company_earnings' && c.mode === 'guidance');
    assert(guidance?.apiCalls === 3, `Earnings Guidance = 3 API calls (got: ${guidance?.apiCalls})`);

    const linkedinPost = costs.find(c => c.tool === 'draft_linkedin_post');
    assert(linkedinPost?.apiCalls === 3, `LinkedIn Post = 3 API calls (got: ${linkedinPost?.apiCalls})`);

    const linkedinArticle = costs.find(c => c.tool === 'draft_linkedin_article');
    assert(linkedinArticle?.apiCalls === 5, `LinkedIn Article = 5 API calls (got: ${linkedinArticle?.apiCalls})`);

    const humanAgent = costs.find(c => c.tool === 'consult_human_agent');
    assert(humanAgent?.apiCalls === 1, `Human Agent Consult = 1 API call (got: ${humanAgent?.apiCalls})`);

    const analyst = costs.find(c => c.tool === 'consult_analyst');
    assert(analyst?.apiCalls === 1, `Synthetic Analyst Consult = 1 API call (got: ${analyst?.apiCalls})`);

    console.log('\n=== 4. Zero Inflation Guard (DoD check) ===');
    const inflated40 = costs.filter(c => c.apiCalls >= 40);
    assert(inflated40.length === 0, `Zero tools charged at 40+ calls (found: ${inflated40.map(c => `${c.tool}:${c.apiCalls}`).join(', ') || 'none'})`);

    const inflated10for1 = costs.filter(c => ['get_company_earnings', 'get_earnings_divergence'].includes(c.tool) && c.mode !== 'guidance' && c.mode !== 'compare' && c.apiCalls > 1);
    assert(inflated10for1.length === 0, `Zero 1-call earnings tools charged > 1 (found: ${inflated10for1.map(c => `${c.tool}:${c.apiCalls}`).join(', ') || 'none'})`);

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
