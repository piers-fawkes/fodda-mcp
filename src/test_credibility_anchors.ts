import assert from 'assert';
import { setCachedCatalogForTesting } from './catalogCache.js';
import { createServer } from './toolHandlers.js';

async function runCredibilityAnchorVerification() {
    console.log('================================================================');
    console.log(' Running Verification: Credibility Anchors Across MCP Consult & Find');
    console.log('================================================================\n');

    const THIAGO_ANCHOR = "Thiago Bersou's Human Agent on Fodda is an expert in alcoholic beverages. Thiago is a Founder — Panama Red. Their Human Agent expertise is grounded in their curated graph tracking food & beverage, retail.";
    const VEBLEN_ANCHOR = "Thorstein Veblen's Classic Agent on Fodda provides critical economic sociology grounded in institutional economics and the theory of the leisure class.";
    const RETAIL_ANCHOR = "Fodda's Retail Strategy & Innovation Lead synthesizes omni-channel retail transformations and store-of-the-future commerce models.";

    // 1. Setup mock catalog
    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 3, graphs: [] },
        [
            {
                id: 'thiago-bersou-alc-bev',
                analyst_id: 'thiago-bersou-alc-bev',
                name: 'Thiago Bersou',
                graphSubType: 'Digital Twin',
                is_human_agent: true,
                status: 'active',
                credibility_anchor: THIAGO_ANCHOR
            },
            {
                id: 'thorstein-veblen',
                analyst_id: 'thorstein-veblen',
                name: 'Thorstein Veblen',
                graphSubType: 'Classic Digital Twin',
                is_classic_agent: true,
                status: 'active',
                credibility_anchor: VEBLEN_ANCHOR
            },
            {
                id: 'retail-strategy-innovation',
                analyst_id: 'retail-strategy-innovation',
                name: 'Retail Strategy & Innovation Lead',
                graphSubType: 'Synthetic Expert',
                status: 'active',
                credibility_anchor: RETAIL_ANCHOR
            }
        ]
    );

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        const analystId = body?.analyst_id;
        if (path.includes('/v1/human-agents/consult') || path.includes('/v1/analysts/consult')) {
            if (analystId === 'thorstein-veblen') {
                return {
                    result: `Thorstein Veblen institutional critique of conspicuous consumption.`,
                    credibility_anchor: VEBLEN_ANCHOR,
                    analyst: {
                        id: 'thorstein-veblen',
                        name: 'Thorstein Veblen',
                        credibility_anchor: VEBLEN_ANCHOR
                    },
                    coverage: 'FULL',
                    sources_used: []
                };
            }
            if (analystId === 'retail-strategy-innovation') {
                return {
                    result: `Retail strategy analysis on physical-digital store integration.`,
                    credibility_anchor: RETAIL_ANCHOR,
                    analyst: {
                        id: 'retail-strategy-innovation',
                        name: 'Retail Strategy & Innovation Lead',
                        credibility_anchor: RETAIL_ANCHOR
                    },
                    coverage: 'FULL',
                    sources_used: []
                };
            }
            return {
                result: `Thiago Bersou perspective on alc-bev market dynamics.`,
                credibility_anchor: THIAGO_ANCHOR,
                analyst: {
                    id: 'thiago-bersou-alc-bev',
                    name: 'Thiago Bersou',
                    credibility_anchor: THIAGO_ANCHOR
                },
                coverage: 'FULL',
                sources_used: []
            };
        }
        if (path.includes('/v1/experts/search')) {
            return {
                ok: true,
                results: [
                    {
                        slug: 'thiago-bersou-alc-bev',
                        name: 'Thiago Bersou',
                        agent_class: 'human_agent',
                        status: 'active',
                        credibility_anchor: THIAGO_ANCHOR,
                        why_matched: ['alcoholic beverages', 'panama red']
                    }
                ],
                on_request_experts: []
            };
        }
        if (path === '/v1/graphs') {
            return { graphs: [], disabled_graphs: [] };
        }
        return {};
    };

    const server = await createServer('test_api_key', 'test_user_credibility', mockFoddaRequest as any, async () => ({}), () => '', () => '');
    const registeredTools = (server as any)._registeredTools;

    // ─────────────────────────────────────────────────────────────
    // TEST 1: consult_human_agent with Thiago Bersou
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: consult_human_agent for Thiago Bersou ---');
    const consultHumanFn = registeredTools['consult_human_agent'].handler;
    const res1 = await consultHumanFn({
        analyst_id: 'thiago-bersou-alc-bev',
        query: 'What is the future of craft RTD cocktails?'
    });

    assert.ok(res1, 'consult_human_agent must return a response');
    assert.strictEqual(res1.credibility_anchor, THIAGO_ANCHOR, 'Structured response must contain credibility_anchor');
    
    const text1 = res1.content?.[0]?.text || '';
    assert.ok(text1.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include EXPERT CREDIBILITY ANCHOR section header');
    assert.ok(text1.includes(THIAGO_ANCHOR), 'Text section must include Thiago Bersou credibility anchor verbatim');
    assert.ok(text1.includes('GUIDANCE FOR ASSISTANT:'), 'Text section must include GUIDANCE FOR ASSISTANT');
    assert.ok(text1.includes('FIRST TOUCH ONLY: If introducing this expert to the user for the first time'), 'Must include first touch guidance');
    assert.ok(text1.includes('When their Human Agent on Fodda is consulted'), 'Human Agent text must include Human Agent phrasing');
    assert.ok(text1.includes('Always refer to them by their professional name ("Thiago Bersou") or as a "Human Agent"'), 'Human Agent text must permit Human Agent');
    assert.ok(text1.includes('When concluding responses where specialists are suggested, present a balanced set of next moves:'), 'Must include balanced next moves guidance');
    assert.ok(text1.includes('FOLLOW-UP TURNS IN SAME SESSION: If this is an ongoing conversation or follow-up question with this expert, DO NOT repeat the pedigree'), 'Must include follow-up session guidance');
    assert.ok(text1.includes('Thiago Bersou perspective on alc-bev market dynamics.'), 'Must include actual consult report');
    console.log('✅ TEST 1 Passed: consult_human_agent returns credibility_anchor in structured payload and text block with guidance.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: consult_analyst with Thorstein Veblen (Classic Agent)
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: consult_analyst for Thorstein Veblen ---');
    const consultAnalystFn = registeredTools['consult_analyst'].handler;
    const res2 = await consultAnalystFn({
        analyst_id: 'thorstein-veblen',
        query: 'How does modern luxury streetwear exhibit pecuniary emulation?'
    });

    assert.ok(res2, 'consult_analyst must return a response');
    assert.strictEqual(res2.credibility_anchor, VEBLEN_ANCHOR, 'Structured response must contain credibility_anchor');

    const text2 = res2.content?.[0]?.text || '';
    assert.ok(text2.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include EXPERT CREDIBILITY ANCHOR section header');
    assert.ok(text2.includes(VEBLEN_ANCHOR), 'Text section must include Thorstein Veblen credibility anchor verbatim');
    assert.ok(text2.includes('GUIDANCE FOR ASSISTANT:'), 'Text section must include GUIDANCE FOR ASSISTANT');
    assert.ok(text2.includes('FIRST TOUCH ONLY: If introducing this expert to the user for the first time'), 'Must include first touch guidance');
    assert.ok(text2.includes('When their Classic Agent on Fodda is consulted'), 'Classic Agent text must include Classic Agent phrasing');
    assert.ok(text2.includes('NEVER refer to historical figures as a "Human Agent"'), 'Classic Agent text must prohibit Human Agent');
    assert.ok(text2.includes('as a "Classic Agent"'), 'Classic Agent text must direct to refer as Classic Agent');
    assert.ok(!text2.includes('When their Human Agent on Fodda is consulted'), 'Classic Agent text must not say When their Human Agent on Fodda is consulted');
    assert.ok(text2.includes('When concluding responses where specialists are suggested, present a balanced set of next moves:'), 'Must include balanced next moves guidance');
    assert.ok(text2.includes('FOLLOW-UP TURNS IN SAME SESSION:'), 'Must include follow-up guidance');
    assert.ok(text2.includes('Thorstein Veblen institutional critique of conspicuous consumption.'), 'Must include actual consult report');
    console.log('✅ TEST 2 Passed: consult_analyst returns credibility_anchor in structured payload and text block with guidance.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2B: consult_analyst with Synthetic Domain Analyst
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2B: consult_analyst for Retail Strategy & Innovation ---');
    const res2b = await consultAnalystFn({
        analyst_id: 'retail-strategy-innovation',
        query: 'What are store-of-the-future commerce dynamics?'
    });

    assert.ok(res2b, 'consult_analyst must return a response for synthetic analyst');
    assert.strictEqual(res2b.credibility_anchor, RETAIL_ANCHOR, 'Structured response must contain synthetic analyst credibility_anchor');

    const text2b = res2b.content?.[0]?.text || '';
    assert.ok(text2b.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'Text must include EXPERT CREDIBILITY ANCHOR header');
    assert.ok(text2b.includes(RETAIL_ANCHOR), 'Text must include retail credibility anchor');
    assert.ok(text2b.includes('GUIDANCE FOR ASSISTANT:'), 'Text must include GUIDANCE FOR ASSISTANT');
    console.log('✅ TEST 2B Passed: consult_analyst returns credibility_anchor for synthetic analyst.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: find_expert returns credibility_anchor
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: find_expert candidate formatting ---');
    const findExpertFn = registeredTools['find_expert'].handler;
    const res3 = await findExpertFn({
        query: 'alcoholic beverages RTD'
    });

    assert.ok(res3, 'find_expert must return a response');
    const text3 = res3.content?.[0]?.text || '';
    const payload3 = JSON.parse(text3);
    assert.ok(Array.isArray(payload3.results), 'Results must be an array');
    assert.strictEqual(payload3.results.length, 1, 'Expected 1 candidate result');
    assert.strictEqual(payload3.results[0].analyst_id, 'thiago-bersou-alc-bev');
    assert.strictEqual(payload3.results[0].credibility_anchor, THIAGO_ANCHOR, 'Candidate result must include credibility_anchor');
    console.log('✅ TEST 3 Passed: find_expert candidate includes credibility_anchor.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: verify_claim returns credibility_anchor & guidance
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: verify_claim with Thiago Bersou ---');
    const verifyClaimFn = registeredTools['verify_claim'].handler;
    const res4 = await verifyClaimFn({
        claim: 'Non-alcoholic agave spirits will outgrow traditional tequila by 2028.',
        analyst_id: 'thiago-bersou-alc-bev'
    });

    assert.ok(res4, 'verify_claim must return a response');
    assert.strictEqual(res4.credibility_anchor, THIAGO_ANCHOR, 'Structured response must contain credibility_anchor');
    const text4 = res4.content?.[0]?.text || '';
    assert.ok(text4.includes('--- EXPERT CREDIBILITY ANCHOR ---'), 'verify_claim text must include EXPERT CREDIBILITY ANCHOR header');
    assert.ok(text4.includes(THIAGO_ANCHOR), 'verify_claim text must include Thiago Bersou credibility anchor');
    assert.ok(text4.includes('GUIDANCE FOR ASSISTANT:'), 'verify_claim text must include GUIDANCE FOR ASSISTANT');
    console.log('✅ TEST 4 Passed: verify_claim returns credibility_anchor in structured payload and text block with guidance.\n');

    console.log('================================================================');
    console.log('  ALL CREDIBILITY ANCHOR VERIFICATION TESTS PASSED SUCCESSFULLY');
    console.log('================================================================');
}

runCredibilityAnchorVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
