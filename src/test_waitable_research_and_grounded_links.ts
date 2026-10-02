import assert from 'assert';
import { createServer } from './toolHandlers.js';

async function runTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Waitable Deep Research & Grounded Source Links');
    console.log('================================================================\n');

    let lastRequestedPath = '';
    let lastRequestBody: any = null;
    let simulate409OnResearch = false;
    let simulateRunningResearchOnThemes = false;
    let simulateFindingsOnThemes = false;

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        lastRequestedPath = path;
        lastRequestBody = body;

        if (path === '/api/deep-research') {
            if (simulate409OnResearch) {
                const err: any = new Error('Basic info required');
                err.response = {
                    status: 409,
                    data: { message: 'Basic profile information must be completed before deep research.' }
                };
                throw err;
            }
            return { success: true, message: 'Deep research started' };
        }

        if (path.startsWith('/api/onboarding-status')) {
            return {
                status: 'in_progress',
                step: 'research',
                research: {
                    state: path.includes('wait=research') ? 'completed' : 'running',
                    findings_count: 5
                }
            };
        }

        if (path === '/api/onboarding-themes') {
            return {
                research_state: simulateRunningResearchOnThemes ? 'running' : 'completed',
                research_findings: simulateFindingsOnThemes ? [
                    {
                        id: 'find-1',
                        claim: 'Pioneered decentralized AI retail networks',
                        title: 'Retail Tech Review',
                        url: 'https://example.com/retail-ai'
                    },
                    {
                        id: 'find-2',
                        claim: 'Published 2026 Brand Strategy Framework',
                        sources: [
                            { title: 'Substack SIC', url: 'https://sic.substack.com' },
                            { title: 'Brandweek', url: 'https://brandweek.com/article' }
                        ]
                    }
                ] : [],
                themes: [
                    { name: 'Decentralized Retail Strategy', description: 'Next-gen autonomous retail agents' },
                    { name: 'Brand Gravity & Pricing Power', description: 'Resistance to algorithmic discounting' }
                ]
            };
        }

        if (path === '/api/generate-questions') {
            return {
                success: true,
                questions: ['How do you protect margin against algorithmic price wars?']
            };
        }

        return {};
    };

    const server = await createServer('test_key', 'test_user@example.com', mockFoddaRequest as any, async () => ({}), () => '', () => '');
    const tools = (server as any)._registeredTools;

    // ── Test 1: expert_onboarding_research result text & 409 mapping ──
    console.log('Test 1: expert_onboarding_research returns waitable guidance text...');
    simulate409OnResearch = false;
    const res1 = await tools['expert_onboarding_research'].handler({});
    assert.strictEqual(res1.isError, undefined);
    assert.ok(res1.content[0].text.includes('get_onboarding_status'), 'Must mention get_onboarding_status');
    assert.ok(res1.content[0].text.includes('waitForResearch: true'), 'Must mention waitForResearch: true');
    assert.ok(res1.content[0].text.includes('25 seconds'), 'Must mention 25 seconds');
    console.log('✅ Test 1A Passed: Guidance text contains waitable polling instruction.');

    console.log('Test 1B: expert_onboarding_research maps 409 to research_needs_basic_info...');
    simulate409OnResearch = true;
    const res1B = await tools['expert_onboarding_research'].handler({});
    assert.strictEqual(res1B.isError, true);
    assert.ok(res1B.content[0].text.includes('research_needs_basic_info'), 'Must return research_needs_basic_info code');
    assert.ok(res1B.content[0].text.includes('Basic profile information must be completed'), 'Must include upstream 409 message');
    console.log('✅ Test 1B Passed: 409 correctly mapped to research_needs_basic_info.\n');

    // ── Test 2: get_onboarding_status with waitForResearch ──
    console.log('Test 2: get_onboarding_status appends ?wait=research when waitForResearch: true...');
    await tools['get_onboarding_status'].handler({ waitForResearch: true });
    assert.ok(lastRequestedPath.includes('wait=research'), `Path must include wait=research (got ${lastRequestedPath})`);

    await tools['get_onboarding_status'].handler({ analystId: 'jane-doe', waitForResearch: true });
    assert.ok(lastRequestedPath.includes('wait=research') && lastRequestedPath.includes('analystId=jane-doe'), `Path must include both params (got ${lastRequestedPath})`);

    await tools['get_onboarding_status'].handler({ waitForResearch: false });
    assert.ok(!lastRequestedPath.includes('wait=research'), 'Path must not include wait=research when false');
    console.log('✅ Test 2 Passed: get_onboarding_status handles waitForResearch param.\n');

    // ── Test 3: get_detected_themes shows research_state warning & findings before themes ──
    console.log('Test 3: get_detected_themes renders findings before themes and running warning...');
    simulateRunningResearchOnThemes = true;
    simulateFindingsOnThemes = true;
    const res3 = await tools['get_detected_themes'].handler({});
    const prose3 = res3.content[0].text;

    assert.ok(prose3.includes('Research is still running, so these themes may sharpen'), 'Must include running research warning');
    assert.ok(prose3.includes('**What Fodda found about your work:**'), 'Must include findings header');
    assert.ok(prose3.includes('Pioneered decentralized AI retail networks ([Retail Tech Review](https://example.com/retail-ai))'), 'Must format claim with link');
    assert.ok(prose3.includes('[Substack SIC](https://sic.substack.com), [Brandweek](https://brandweek.com/article)'), 'Must format multi-source links');
    assert.ok(prose3.includes("Anything here that's wrong or not yours? I'll leave it out."), 'Must include exclusion prompt');
    assert.ok(prose3.indexOf('What Fodda found about your work') < prose3.indexOf('Detected Themes for Confirmation'), 'Findings must appear BEFORE themes');
    console.log('✅ Test 3 Passed: get_detected_themes renders grounded findings before themes.\n');

    // ── Test 4: confirm_themes passes flaggedFindingIds & flagNote ──
    console.log('Test 4: confirm_themes passes flaggedFindingIds and flagNote to /api/generate-questions...');
    await tools['confirm_themes'].handler({
        themes: ['Decentralized Retail Strategy'],
        flaggedFindingIds: ['find-1'],
        flagNote: 'The AI retail network was a partner project, not my primary venture.'
    });

    assert.deepStrictEqual(lastRequestBody.confirmedThemes, ['Decentralized Retail Strategy']);
    assert.deepStrictEqual(lastRequestBody.flaggedFindingIds, ['find-1']);
    assert.strictEqual(lastRequestBody.flagNote, 'The AI retail network was a partner project, not my primary venture.');
    console.log('✅ Test 4 Passed: confirm_themes forwards flagged findings and note.\n');

    console.log('================================================================');
    console.log(' All Waitable Deep Research & Grounded Source Links Tests Passed!');
    console.log('================================================================\n');
    process.exit(0);
}

runTests().catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
