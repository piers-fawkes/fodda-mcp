import assert from 'node:assert';
import { OFFERING_SCOPED_TOOLS } from './index.js';

async function runClaudeOfferingSurfacesTests() {
    console.log('=== Test Suite: Claude Connector Offering Surfaces & Deliverable Scope ===\n');

    const actualTools = OFFERING_SCOPED_TOOLS['claude'];
    assert.ok(Array.isArray(actualTools), 'claude must be registered in OFFERING_SCOPED_TOOLS');

    console.log(`1. Verifying claude tool count: ${actualTools.length} tools`);

    // Verify required expert deliverable and intro tools are present
    const requiredTools = [
        'request_deliverable',
        'check_deliverable_status',
        'request_expert_intro',
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
    ];

    for (const tool of requiredTools) {
        assert.ok(actualTools.includes(tool), `Tool "${tool}" must be included in OFFERING_SCOPED_TOOLS['claude']`);
        console.log(`  ✅ ${tool} present`);
    }

    // Verify onboarding tools remain excluded
    const excludedTools = [
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
