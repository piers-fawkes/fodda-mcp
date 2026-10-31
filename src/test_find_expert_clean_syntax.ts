import assert from 'assert';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { createServer } from './toolHandlers.js';
import { STATIC_BEHAVIORAL_RULES } from './systemPrompt.js';
import { setCachedCatalogForTesting } from './catalogCache.js';
import { foddaRequest } from './foddaClient.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

console.log('--- Running Tests: Clean Natural Guidance in find_expert & systemPrompt ---');

async function runTests() {
    // 1. Verify systemPrompt static rule
    console.log('\n1. Verifying RULE: CleanExecutivePresentation in STATIC_BEHAVIORAL_RULES...');
    assert.ok(STATIC_BEHAVIORAL_RULES.includes('### RULE: CleanExecutivePresentation'), 'Must include CleanExecutivePresentation rule header');
    assert.ok(STATIC_BEHAVIORAL_RULES.includes('Never expose internal tool names, function signatures, or parameter keys'), 'Must forbid exposing internal tool names / signatures');
    assert.ok(STATIC_BEHAVIORAL_RULES.includes('Recommend specialists and next actions using natural conversational prose and markdown links'), 'Must instruct conversational prose and markdown links');
    console.log('✅ RULE: CleanExecutivePresentation verified.');

    // 2. Mock API server for Active & On-Request specialists
    console.log('\n2. Verifying find_expert with API responses (clean beauty formulation)...');
    const mockServer = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'clean beauty formulation',
                    total_matches: 2,
                    results: [
                        {
                            id: 'chemcrow-computational-chemistry-epfl',
                            slug: 'chemcrow-computational-chemistry-epfl',
                            name: 'ChemCrow Chemistry Expert',
                            status: 'Active',
                            agent_class: 'synthetic_agent',
                            role_title: 'Computational Chemistry Specialist',
                            search_ask_line: 'Ask ChemCrow about molecule synthesis and formulation stability.',
                            why_matched: ['Clean beauty formulation', 'Green chemistry']
                        }
                    ],
                    on_request_experts: [
                        {
                            id: 'ericka-rodriguez-beauty',
                            slug: 'ericka-rodriguez-beauty',
                            name: 'Ericka Rodriguez',
                            status: 'Unclaimed',
                            agent_class: 'human_agent',
                            role_title: 'Clean Beauty Brand Founder',
                            search_ask_line: 'Ask Ericka about natural beauty formulation and sustainable packaging.',
                            why_matched: ['Clean beauty formulation', 'Sustainable packaging']
                        }
                    ],
                    related_knowledge_graphs: []
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const findExpertTool = (mockServer as any)._registeredTools['find_expert'];
    assert.ok(findExpertTool, 'find_expert tool must be registered');

    const res = await findExpertTool.handler({
        query: 'clean beauty formulation',
        limit: 3
    });

    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.results.length, 1);
    assert.strictEqual(payload.on_request_experts.length, 1);

    const activeCandidate = payload.results[0];
    const onReqCandidate = payload.on_request_experts[0];

    // Check Active Candidate
    console.log('Active Candidate next_step:', activeCandidate.next_step);
    assert.strictEqual(activeCandidate.status, 'active');
    assert.strictEqual(activeCandidate.analyst_id, 'chemcrow-computational-chemistry-epfl');
    assert.strictEqual(activeCandidate.consult_tool, 'consult_analyst');
    assert.ok(activeCandidate.next_step.includes('Consult ChemCrow Chemistry Expert directly on this question, or explore their methodology and domain frameworks.'));
    assert.ok(!activeCandidate.next_step.includes('Call '));
    assert.ok(!activeCandidate.next_step.includes('analyst_id:'));
    assert.ok(!activeCandidate.next_step.includes('('));
    assert.ok(!activeCandidate.next_step.includes(')'));

    // Check On-Request Candidate
    console.log('On-Request Candidate next_step:', onReqCandidate.next_step);
    assert.strictEqual(onReqCandidate.status, 'on_request');
    assert.strictEqual(onReqCandidate.analyst_id, 'ericka-rodriguez-beauty');
    assert.strictEqual(onReqCandidate.consult_tool, 'consult_human_agent');
    assert.strictEqual(
        onReqCandidate.next_step,
        'This specialist is available On Request (https://www.fodda.ai/experts/ericka-rodriguez-beauty). Request a facilitated advisory introduction, or consult broader domain intelligence.'
    );
    assert.ok(!onReqCandidate.next_step.includes('request_expert_intro('));
    assert.ok(!onReqCandidate.next_step.includes('consult_human_agent('));
    assert.ok(!onReqCandidate.next_step.includes('analyst_id:'));

    // Check top-level payload next_step
    console.log('Top-level next_step:', payload.next_step);
    assert.ok(payload.next_step.includes('Consult ChemCrow Chemistry Expert directly'));
    assert.ok(!payload.next_step.includes('Call consult_human_agent'));
    assert.ok(!payload.next_step.includes('analyst_id'));
    console.log('✅ API response clean natural guidance verified.');

    // 3. Verify Graph Fallback note (Zero matches)
    console.log('\n3. Verifying Graph Fallback note without tool call syntax...');
    const mockZeroServer = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                return {
                    ok: true,
                    query: 'quantum cryogenic packaging',
                    total_matches: 0,
                    results: [],
                    on_request_experts: [],
                    related_knowledge_graphs: [
                        { id: 'tech', name: 'PSFK Technology & Enterprise' },
                        { id: 'packaging', name: 'Sustainable Packaging Index' }
                    ]
                };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const zeroTool = (mockZeroServer as any)._registeredTools['find_expert'];
    const zeroRes = await zeroTool.handler({
        query: 'quantum cryogenic packaging'
    });
    const zeroPayload = JSON.parse(zeroRes.content[0].text);
    console.log('Zero matches note:', zeroPayload.note);
    assert.ok(zeroPayload.note.includes('No dedicated Human Agent covers this domain yet.'));
    assert.ok(zeroPayload.note.includes('Explore related signals across PSFK Technology & Enterprise, Sustainable Packaging Index.'));
    assert.ok(!zeroPayload.note.includes('search_graph('));
    assert.ok(!zeroPayload.note.includes('graphId:'));
    console.log('✅ Graph fallback clean natural guidance verified.');

    // 4. Verify Local Fallback Path
    console.log('\n4. Verifying Local Fallback Path (clean beauty formulation)...');
    const mockAnalysts = [
        {
            analyst_id: 'lauren-goode-beauty',
            name: 'Lauren Goode (Digital Twin)',
            role: 'Beauty & Skincare Specialist',
            description: 'Beauty and skincare specialist focusing on formulations and prestige cosmetics.',
            category: 'human_agent',
            category_label: 'Human Agent',
            is_verified_real_person: true,
            consult_tool: 'consult_human_agent',
            expert_in: ['beauty', 'skincare', 'cosmetics', 'clean beauty', 'formulation'],
            topics: ['clean beauty formulation', 'prestige beauty', 'dermatology'],
            outside_their_lane: ['cryptocurrency', 'b2b saas', 'cycling'],
            blind_spots: ['automotive supply chain'],
        },
        {
            analyst_id: 'onreq-chemist',
            name: 'Dr. Jane Cosmetic Chemist',
            role: 'Clean Beauty Chemist',
            description: 'Cosmetic formulation chemistry and ingredient safety',
            category: 'human_agent',
            status: 'on_request',
            consult_tool: 'consult_human_agent',
            expert_in: ['cosmetic formulation', 'green chemistry'],
            topics: ['clean beauty formulation', 'ingredient safety']
        }
    ];

    const mockLocalServer = await createServer(
        'test_api_key',
        'test_user',
        (async (method: string, path: string) => {
            if (path.includes('/v1/experts/search')) {
                throw new Error('API offline for local test');
            }
            if (path.includes('/v1/analysts')) {
                return { analysts: mockAnalysts };
            }
            return {};
        }) as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const localTool = (mockLocalServer as any)._registeredTools['find_expert'];
    const localRes = await localTool.handler({
        query: 'clean beauty formulation'
    });
    const localPayload = JSON.parse(localRes.content[0].text);
    assert.ok(localPayload.results.length >= 1, 'Should find local candidate');
    const localActive = localPayload.results[0];
    console.log('Local candidate next_step:', localActive.next_step);
    assert.ok(localActive.next_step.startsWith('Consult '));
    assert.ok(!localActive.next_step.includes('Call '));
    assert.ok(!localActive.next_step.includes('analyst_id:'));
    assert.ok(localActive.analyst_id);
    assert.ok(localActive.consult_tool);
    console.log('✅ Local fallback clean natural guidance verified.');

    // 5. Verify Live API Call (clean beauty formulation) if credentials available
    const apiKey = process.env.FODDA_API_KEY || '';
    if (apiKey) {
        console.log('\n5. Verifying Live API Call for "clean beauty formulation"...');
        const liveServer = await createServer(
            apiKey,
            'test_user',
            foddaRequest,
            async () => ({}),
            () => 'widget_1',
            () => 'http://localhost'
        );

        const liveTool = (liveServer as any)._registeredTools['find_expert'];
        const liveRes = await liveTool.handler({
            query: 'clean beauty formulation',
            limit: 3
        });
        const livePayload = JSON.parse(liveRes.content[0].text);
        console.log('Live payload candidates:', livePayload.candidates?.length, 'results:', livePayload.results?.length, 'on_request:', livePayload.on_request_experts?.length);
        console.log('Live payload next_step:', livePayload.next_step);
        console.log('Live payload note:', livePayload.note);

        const allCandidates = [
            ...(livePayload.results || []),
            ...(livePayload.on_request_experts || [])
        ];

        for (const c of allCandidates) {
            console.log(`- Candidate ${c.display_name} (${c.status}): next_step = "${c.next_step}"`);
            assert.ok(c.analyst_id, 'Candidate must preserve structured analyst_id');
            assert.ok(c.consult_tool, 'Candidate must preserve structured consult_tool');
            assert.ok(c.status, 'Candidate must preserve structured status');
            assert.ok(!c.next_step.includes('Call consult_'), `next_step must not leak tool calls: ${c.next_step}`);
            assert.ok(!c.next_step.includes('analyst_id:'), `next_step must not leak parameter assignments: ${c.next_step}`);
            assert.ok(!c.next_step.includes('request_expert_intro('), `next_step must not leak function signatures: ${c.next_step}`);
            assert.ok(!c.next_step.includes('consult_human_agent('), `next_step must not leak function signatures: ${c.next_step}`);
            assert.ok(!c.next_step.includes('consult_analyst('), `next_step must not leak function signatures: ${c.next_step}`);
        }

        if (livePayload.next_step) {
            assert.ok(!livePayload.next_step.includes('Call consult_'), `payload.next_step must not leak tool calls: ${livePayload.next_step}`);
            assert.ok(!livePayload.next_step.includes('analyst_id:'), `payload.next_step must not leak parameter assignments: ${livePayload.next_step}`);
            assert.ok(!livePayload.next_step.includes('(') || livePayload.next_step.includes('http'), `payload.next_step should not contain pseudo-code parens: ${livePayload.next_step}`);
        }

        if (livePayload.note) {
            assert.ok(!livePayload.note.includes('search_graph('), `payload.note must not leak search_graph tool calls: ${livePayload.note}`);
            assert.ok(!livePayload.note.includes('graphId:'), `payload.note must not leak parameter assignments: ${livePayload.note}`);
        }
        console.log('✅ Live API clean natural guidance verified.');
    }

    console.log('\n================================================================');
    console.log(' ALL CLEAN SYNTAX VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('================================================================');
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
