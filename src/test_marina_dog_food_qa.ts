import assert from 'assert';
import { specificQueryTokens } from './coverageRelevance.js';
import { createServer } from './toolHandlers.js';

async function runQaVerification() {
    console.log('=== Verifying Marina / Dog Food QA Regression Fix ===\n');

    // 1. Mock domain search returning mixed cross-domain trends (mimicking /v1/search/domain)
    const mockDomainTrends = [
        {
            name: 'Automakers Launching Niche Mobility Vehicles',
            description: 'The automotive and mobility sector is expanding beyond passenger cars into micro-EVs and delivery pods.',
            graph_id: 'travel',
            graph_name: 'PSFK Travel & Hospitality Trends',
            evidence: []
        },
        {
            name: "Hill's Private Label Business Impact and Outlook",
            description: "The exit from private label business had a negative impact on organic growth in sports fitness.",
            graph_id: 'sports',
            graph_name: 'PSFK Sports Trends',
            evidence: []
        },
        {
            name: 'Pet Food Brands Launching Science-Led Fresh Food Lines',
            description: "Major pet food CPG brands are launching science-led fresh food lines with premium nutrition claims.",
            graph_id: 'retail',
            graph_name: 'PSFK Retail Trends',
            evidence: [
                {
                    title: "The Farmer's Dog Extends Personalized Meal Plans Through Walmart.com Marketplace",
                    snippet: "The Farmer's Dog expanded fresh dog food subscription offerings into mass retail marketplace.",
                    source_url: 'https://example.com/farmers-dog'
                }
            ]
        },
        {
            name: 'Mindful Consumption Drives Non-Alcoholic Alternatives',
            description: 'A significant decline in alcohol consumption is observed across dining and beverage sectors.',
            graph_id: 'food',
            graph_name: 'PSFK Food & Beverage Trends',
            evidence: []
        }
    ];

    const mockBackend = async (method: string, path: string, apiKey?: string, userId?: string, body?: any) => {
        if (path.includes('/v1/experts/search')) {
            return {
                ok: true,
                query: 'future of dog food',
                total_matches: 2,
                results: [
                    {
                        id: 'anu-lingala-macro',
                        slug: 'anu-lingala',
                        name: 'Anu Lingala',
                        status: 'Active',
                        agent_class: 'human_agent',
                        role_title: 'Founder, Revisionary',
                        why_matched: ['Global Trends', 'Consumer Shifts']
                    },
                    {
                        id: 'marina-reluskoska',
                        slug: 'marina-reluskoska',
                        name: 'Marina Reluskoska',
                        status: 'Unclaimed',
                        agent_class: 'human_agent',
                        role_title: 'Food & Pet Food Formulator',
                        why_matched: ['Pet Food', 'Food Product Development']
                    }
                ]
            };
        }
        if (path.includes('/v1/human-agents/consult')) {
            const err: any = new Error('Human Agent marina-reluskoska not found or not active.');
            err.response = { status: 404, data: { message: 'Human Agent marina-reluskoska not found or not active.' } };
            throw err;
        }
        if (path.includes('/v1/search/domain')) {
            return {
                ok: true,
                query: 'future of dog food',
                trends: mockDomainTrends
            };
        }
        return { ok: true };
    };

    const server = await createServer(
        'test_api_key',
        'test_user@fodda.ai',
        mockBackend as any,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    const tools: Record<string, any> = (server as any)._registeredTools;

    // Check find_expert handling
    console.log('1. Checking find_expert candidate handling for Marina (On-Request)...');
    const findExpert = tools['find_expert'];
    const findRes = await findExpert.handler({ query: 'future of dog food' });
    const findParsed = JSON.parse(findRes.content[0].text);
    assert.strictEqual(findParsed.results.length, 2);

    const anuCandidate = findParsed.results[0];
    const marinaCandidate = findParsed.results[1];

    assert.strictEqual(anuCandidate.status, 'active');
    assert.ok(anuCandidate.next_step.startsWith('Consult Anu Lingala'));
    assert.ok(!anuCandidate.next_step.includes('Call '));
    assert.ok(!anuCandidate.next_step.includes('analyst_id:'));

    assert.strictEqual(marinaCandidate.status, 'on_request');
    assert.ok(marinaCandidate.next_step.includes('https://www.fodda.ai/experts/marina-reluskoska'));
    assert.ok(marinaCandidate.next_step.includes('Request a facilitated advisory introduction'));
    assert.ok(!marinaCandidate.next_step.includes('request_expert_intro('));
    console.log('   ✅ Marina candidate status is "on_request" with clean advisory intro next_step.');

    // Check consult_human_agent domain fallback filtering
    console.log('\n2. Checking consult_human_agent fallback for Marina...');
    const consultTool = tools['consult_human_agent'];
    const consultRes = await consultTool.handler({
        analyst_id: 'marina-reluskoska',
        query: 'future of dog food'
    });

    const consultText = consultRes.content[0].text;
    console.log('--- Tool Output Snippet ---');
    console.log(consultText.slice(0, 500) + '...\n');

    // VERIFY: Irrelevant cross-domain trends are filtered OUT
    assert.ok(!consultText.includes('Automakers Launching Niche Mobility Vehicles'), 'Mobility vehicles MUST be filtered out of dog food query');
    assert.ok(!consultText.includes('Niche Mobility Vehicles'), 'Mobility vehicles keyword MUST NOT appear');
    assert.ok(!consultText.includes("Hill's Private Label Business Impact and Outlook"), 'Sports private label trend without dog food match MUST be filtered out');
    assert.ok(!consultText.includes('Non-Alcoholic Alternatives'), 'Non-alcoholic alternatives MUST be filtered out');

    // VERIFY: On-topic pet food trend IS kept
    assert.ok(consultText.includes('Pet Food Brands Launching Science-Led Fresh Food Lines'), 'On-topic pet food trend MUST be retained');
    assert.ok(consultText.includes("The Farmer's Dog Extends Personalized Meal Plans"), 'Farmer\'s Dog case study MUST be included');

    console.log('   ✅ Irrelevant cross-domain trends (mobility vehicles, non-alcoholic drinks, sports) filtered out.');
    console.log('   ✅ Relevant pet food signals (Science-Led Fresh Food Lines, Farmer\'s Dog) preserved.');
    console.log('\n🎉 ALL MARINA / DOG FOOD QA REGRESSION CHECKS PASSED!');
}

runQaVerification().catch(err => {
    console.error('❌ QA Test failed:', err);
    process.exit(1);
});
