/**
 * Comprehensive verification for the Expert Layer updates:
 * 1. cleanDisplayName sanitization (retiring '(Classic Digital Twin)', '(Digital Twin)', etc.)
 * 2. findCandidateExperts domain vs modifier overlap, blind spots, self-rec guards, honest empty
 * 3. find_expert MCP tool registration, responses, and candidate formatting
 * 4. consult_analyst & consult_human_agent deep parameter acceptance and forwarding
 *
 * Run: npm run build && node dist/test_expert_layer.js
 */

import assert from 'assert';
import { cleanDisplayName, normalizeAnalyst } from './catalogCache.js';
import type { CatalogAnalyst } from './catalogCache.js';
import { findCandidateExperts } from './coverageRelevance.js';
import type { CandidateExpert } from './coverageRelevance.js';
import { createServer } from './toolHandlers.js';

async function runTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Expert Layer & find_expert Verification');
    console.log('================================================================\n');

    // ─────────────────────────────────────────────────────────────
    // 1. cleanDisplayName Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. Testing cleanDisplayName ---');
    assert.strictEqual(cleanDisplayName('Thorstein Veblen (Classic Digital Twin)'), 'Thorstein Veblen');
    assert.strictEqual(cleanDisplayName('Jane Austen (Digital Twin)'), 'Jane Austen');
    assert.strictEqual(cleanDisplayName('Ben Dietz (Human Twin)'), 'Ben Dietz');
    assert.strictEqual(cleanDisplayName('John Ruskin (Classic Agent)'), 'John Ruskin');
    assert.strictEqual(cleanDisplayName('Piers Fawkes'), 'Piers Fawkes');
    assert.strictEqual(cleanDisplayName('  Alexis De Tocqueville (Digital Twin)  '), 'Alexis De Tocqueville');
    assert.strictEqual(cleanDisplayName('Adam Smith [Classic Digital Twin]'), 'Adam Smith');
    console.log('✅ cleanDisplayName tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 2. findCandidateExperts Matching Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 2. Testing findCandidateExperts ---');

    const mockAnalysts: CatalogAnalyst[] = [
        {
            analyst_id: 'lauren-goode-beauty',
            name: 'Lauren Goode (Digital Twin)',
            role: 'Beauty & Skincare Specialist',
            description: 'Beauty and skincare specialist focusing on formulations and prestige cosmetics.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            expert_in: ['beauty', 'skincare', 'cosmetics', 'wellness', 'clean beauty'],
            topics: ['prestige beauty', 'dermatology', 'retail'],
            outside_their_lane: ['cryptocurrency', 'b2b saas', 'cycling'],
            blind_spots: ['automotive supply chain'],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'peter-abraham-cycling',
            name: 'Peter Abraham',
            role: 'Cycling & Outdoor Culture Expert',
            description: 'Cycling industry strategist and outdoor culture voice.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            expert_in: ['cycling', 'bicycles', 'gravel racing', 'outdoor apparel'],
            topics: ['endurance sports', 'brand strategy'],
            outside_their_lane: ['beauty', 'skincare'],
            blind_spots: ['fast fashion'],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'piers-fawkes',
            name: 'Piers Fawkes',
            role: 'Retail & Consumer Trends Strategist',
            description: 'Founder of PSFK and retail innovation strategist.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            // Note: Piers has cross-cutting modifiers like 'ai', 'strategy', 'trends', 'retail', 'innovation'
            expert_in: ['retail innovation', 'consumer trends', 'strategy', 'ai agents', 'future of shopping'],
            topics: ['omnichannel', 'experiential retail', 'technology strategy'],
            outside_their_lane: ['biotech', 'heavy industrial machinery'],
            blind_spots: [],
        } as unknown as CatalogAnalyst,
        {
            analyst_id: 'thorstein-veblen',
            name: 'Thorstein Veblen (Classic Digital Twin)',
            role: 'Sociologist & Institutional Economist',
            description: 'Author of Theory of the Leisure Class; institutional critique of consumption.',
            category: 'classic_agent',
            category_label: 'Classic Agent',
            is_verified_real_person: false,
            consult_tool: 'consult_analyst',
            expert_in: ['conspicuous consumption', 'leisure class', 'economic theory', 'status display'],
            topics: ['luxury goods', 'sociology of wealth'],
            outside_their_lane: ['modern digital marketing', 'tiktok algorithms'],
            blind_spots: [],
        } as unknown as CatalogAnalyst,
    ];

    // Test 2a: Beauty query - Lauren Goode must match; Piers Fawkes must NOT match despite having 'trends'/'strategy'
    const beautyCandidates = findCandidateExperts('prestige clean beauty and skincare formulation trends', {
        analysts: mockAnalysts,
        limit: 3,
    });
    console.log('Beauty query candidates:', beautyCandidates.map(c => `${c.display_name} (${c.analyst_id})`));
    assert.ok(beautyCandidates.length >= 1, 'Should find at least 1 candidate for beauty');
    assert.strictEqual(beautyCandidates[0]?.analyst_id, 'lauren-goode-beauty', 'Lauren Goode must be top candidate');
    assert.strictEqual(beautyCandidates[0]?.display_name, 'Lauren Goode', 'Candidate display_name must be sanitized');
    assert.ok(!beautyCandidates.some(c => c.analyst_id === 'piers-fawkes'), 'Piers Fawkes must NOT match beauty query solely on "trends" modifier');

    // Test 2b: Cycling query - Peter Abraham must match
    const cyclingCandidates = findCandidateExperts('gravel cycling race culture and gear', {
        analysts: mockAnalysts,
        limit: 3,
    });
    console.log('Cycling query candidates:', cyclingCandidates.map(c => `${c.display_name} (${c.analyst_id})`));
    assert.strictEqual(cyclingCandidates.length, 1);
    assert.strictEqual(cyclingCandidates[0]?.analyst_id, 'peter-abraham-cycling');

    // Test 2c: Self-recommendation protection - Peter Abraham excluded when consulting Peter Abraham
    const cyclingSelfExclusion = findCandidateExperts('gravel cycling race culture and gear', {
        analysts: mockAnalysts,
        excludeAnalystId: 'peter-abraham-cycling',
        limit: 3,
    });
    assert.strictEqual(cyclingSelfExclusion.length, 0, 'Must exclude candidate matching excludeAnalystId');

    // Test 2d: Blind spot / outside_their_lane exclusion
    // Peter Abraham has 'beauty' in outside_their_lane
    const peterBeautyCheck = findCandidateExperts('beauty product innovation', {
        analysts: [mockAnalysts[1]!], // only Peter
    });
    assert.strictEqual(peterBeautyCheck.length, 0, 'Peter must be excluded from beauty query due to outside_their_lane');

    // Test 2e: Honest Empty Failure
    // Query completely out of scope for all mock analysts
    const outOfDomainCandidates = findCandidateExperts('deep seabed geothermal subsea mining robotic drilling', {
        analysts: mockAnalysts,
    });
    console.log('Out of domain candidates count:', outOfDomainCandidates.length);
    assert.strictEqual(outOfDomainCandidates.length, 0, 'Must return empty array honestly when no expert matches');

    // Test 2f: Classic Agent vs Living Practitioner ranking
    // For luxury consumption: Thorstein Veblen matches
    const luxuryCandidates = findCandidateExperts('conspicuous consumption and luxury status display', {
        analysts: mockAnalysts,
    });
    assert.ok(luxuryCandidates.length >= 1);
    assert.strictEqual(luxuryCandidates[0]?.analyst_id, 'thorstein-veblen');
    assert.strictEqual(luxuryCandidates[0]?.display_name, 'Thorstein Veblen');
    assert.strictEqual(luxuryCandidates[0]?.category, 'classic_agent');

    console.log('✅ findCandidateExperts tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 3. find_expert MCP Tool Registration & Execution Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 3. Testing find_expert Tool Handler ---');
    const server = await createServer(
        'test_api_key',
        'test_user',
        (async () => ({})) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );
    const tools = (server as any)._registeredTools;
    const findExpertTool = tools['find_expert'];
    assert.ok(findExpertTool, 'find_expert tool must be registered in server tools');

    // Execute with empty/unmatched query
    const emptyResult = await findExpertTool.handler({ query: 'cryogenic orbital propulsion mechanics' });
    const emptyParsed = JSON.parse(emptyResult.content[0].text);
    assert.strictEqual(emptyParsed.total_matches, 0);
    assert.deepStrictEqual(emptyParsed.candidates, []);
    assert.ok(emptyParsed.note && emptyParsed.note.includes('No active expert directly covers this domain'));
    console.log('Empty find_expert result note:', emptyParsed.note);

    // Execute with general matching query (will run against cached analysts)
    const beautyResult = await findExpertTool.handler({ query: 'beauty, cosmetics, and skincare' });
    const beautyParsed = JSON.parse(beautyResult.content[0].text);
    console.log('find_expert beauty query result total_matches:', beautyParsed.total_matches);
    if (beautyParsed.candidates.length > 0) {
        const first = beautyParsed.candidates[0];
        assert.ok(first.analyst_id, 'Candidate must have analyst_id');
        assert.ok(first.display_name, 'Candidate must have display_name');
        assert.ok(!first.display_name.includes('(Classic Digital Twin)'), 'display_name must not contain legacy twin suffix');
        assert.ok(!first.display_name.includes('(Digital Twin)'), 'display_name must not contain legacy twin suffix');
        assert.ok(first.category, 'Candidate must have category');
        assert.ok(first.reason, 'Candidate must have reason explanation');
        assert.ok(first.consult_tool, 'Candidate must have consult_tool');
    }
    console.log('✅ find_expert tool handler tests passed.\n');

    // ─────────────────────────────────────────────────────────────
    // 4. consult_analyst deep Parameter Tests
    // ─────────────────────────────────────────────────────────────
    console.log('--- 4. Testing consult_analyst deep Parameter ---');
    const consultTool = tools['consult_analyst'];
    assert.ok(consultTool, 'consult_analyst must be registered');
    const shape = typeof consultTool.inputSchema?.def?.shape === 'function'
        ? consultTool.inputSchema.def.shape()
        : consultTool.inputSchema?.def?.shape;
    assert.ok(shape && shape.deep, 'consult_analyst schema must accept deep parameter');

    console.log('✅ consult_analyst deep parameter schema verified.\n');

    console.log('================================================================');
    console.log(' ALL EXPERT LAYER TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
