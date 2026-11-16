import assert from 'node:assert';
import { OFFERING_SCOPED_TOOLS } from './index.js';

async function runClaudeOfferingSurfacesTests() {
    console.log('=== Test Suite: Claude Connector Offering Surfaces & Deliverable Scope ===\n');

    const actualTools = OFFERING_SCOPED_TOOLS['claude'];
    assert.ok(Array.isArray(actualTools), 'claude must be registered in OFFERING_SCOPED_TOOLS');

    console.log(`1. Verifying claude tool count: ${actualTools.length} tools`);
    assert.strictEqual(actualTools.length, 29, `Expected exactly 29 tools in OFFERING_SCOPED_TOOLS['claude'], got ${actualTools.length}`);

    const chatgptTools = OFFERING_SCOPED_TOOLS['chatgpt'];
    assert.ok(Array.isArray(chatgptTools), 'chatgpt must be registered in OFFERING_SCOPED_TOOLS');
    assert.strictEqual(chatgptTools.length, 29, `Expected exactly 29 tools in OFFERING_SCOPED_TOOLS['chatgpt'], got ${chatgptTools.length}`);
    assert.ok(chatgptTools.includes('get_intelligence_dossier'), 'get_intelligence_dossier must be included in OFFERING_SCOPED_TOOLS[\'chatgpt\']');

    // Verify required expert research and intelligence tools are present
    const requiredTools = [
        'get_intelligence_dossier',
        'get_capabilities',
        'consult_human_agent',
        'consult_analyst',
        'list_analysts',
        'find_expert',
        'verify_claim',
        'verify_market_claim',
        'search_graph',
        'get_evidence',
        'deep_research_topic',
        'check_research_status',
        'get_earnings_intelligence',
        'get_earnings_divergence',
        'get_company_earnings',
    ];

    for (const tool of requiredTools) {
        assert.ok(actualTools.includes(tool), `Tool "${tool}" must be included in OFFERING_SCOPED_TOOLS['claude']`);
        console.log(`  ✅ ${tool} present`);
    }

    // Verify onboarding and unexposed commerce/scheduler tools remain excluded
    const excludedTools = [
        'request_deliverable',
        'check_deliverable_status',
        'request_expert_intro',
        'manage_scheduled_reports',
        'begin_expert_onboarding',
        'submit_basic_info',
        'submit_mcp_source',
        'finalize_byo_mcp_onboarding',
        'schedule_interview',
    ];

    for (const tool of excludedTools) {
        assert.strictEqual(actualTools.includes(tool), false, `Tool "${tool}" must NOT be in OFFERING_SCOPED_TOOLS['claude']`);
        console.log(`  ✅ ${tool} properly excluded`);
    }

    console.log('\n✅ All Claude offering surface tests passed successfully!\n');
    process.exit(0);
}

runClaudeOfferingSurfacesTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
