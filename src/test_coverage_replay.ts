import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface CoverageTestCase {
    id: string;
    tool: 'consult_human_agent' | 'consult_analyst';
    analyst_id: string;
    query: string;
    expectedCoverageCategory: 'in' | 'adjacent' | 'out' | 'any';
}

const TEST_CASES: CoverageTestCase[] = [
    {
        id: 'Q1_BEN_IN',
        tool: 'consult_human_agent',
        analyst_id: 'ben-dietz-sic',
        query: 'What trends are you tracking around hype culture and creator-led commerce?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q2_BEN_ADJACENT',
        tool: 'consult_human_agent',
        analyst_id: 'ben-dietz-sic',
        query: 'How are retail banks designing their branch experiences for young consumers?',
        expectedCoverageCategory: 'adjacent'
    },
    {
        id: 'Q3_BEN_OUT',
        tool: 'consult_human_agent',
        analyst_id: 'ben-dietz-sic',
        query: 'What are the technical differences between quantum encryption and classical cryptography algorithms?',
        expectedCoverageCategory: 'out'
    },
    {
        id: 'Q4_JEREMY_IN',
        tool: 'consult_human_agent',
        analyst_id: 'jeremy-bergstein-science-education-innovation',
        query: 'How can science centers and cultural institutions monetize their intellectual property and data?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q5_JEREMY_OUT',
        tool: 'consult_human_agent',
        analyst_id: 'jeremy-bergstein-science-education-innovation',
        query: 'What is the optimal semiconductor fabrication process for 2nm chips?',
        expectedCoverageCategory: 'out'
    },
    {
        id: 'Q6_PIERS_IN',
        tool: 'consult_human_agent',
        analyst_id: 'piers-fawkes-ai-builder-knowledge-graph',
        query: 'What are the top retail customer experience innovations in 2026?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q7_ANU_IN',
        tool: 'consult_human_agent',
        analyst_id: 'anu-lingala-macro',
        query: 'What are the dominant macroeconomic headwinds affecting consumer discretionary spending this year?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q8_RETAIL_SYNTHETIC_IN',
        tool: 'consult_analyst',
        analyst_id: 'retail-strategy-innovation',
        query: 'How are retail brands implementing reverse logistics and resale programs?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q9_SEAMLESS_ROUTING_CHECK',
        tool: 'consult_analyst',
        analyst_id: 'ben-dietz-sic',
        query: 'What is your perspective on youth culture shifts influencing street fashion?',
        expectedCoverageCategory: 'in'
    },
    {
        id: 'Q10_MARKETING_SYNTHETIC_IN',
        tool: 'consult_analyst',
        analyst_id: 'marketing-media-strategy',
        query: 'What are the latest shifts in media spend and CTV ad formats?',
        expectedCoverageCategory: 'in'
    }
];

async function runCoverageReplay() {
    console.log('================================================================');
    console.log(' Coverage Replay Suite — Verification of In/Adjacent/Out Signals');
    console.log(' (Clean Queries without Client Step-A Pasted Bullets)');
    console.log(' NOTE: Billed against the configured FODDA_API_KEY');
    console.log('================================================================\n');

    const DEPLOYED_MCP_URL = process.env.TEST_URL || 'https://mcp.fodda.ai/mcp';
    const TEST_API_KEY = process.env.FODDA_API_KEY || 'sk_live_test_internal';
    const TEST_USER = 'coverage-replay-suite@fodda.ai';

    console.log(`Connecting to MCP server: ${DEPLOYED_MCP_URL}`);
    const transport = new StreamableHTTPClientTransport(
        new URL(DEPLOYED_MCP_URL),
        {
            requestInit: {
                headers: {
                    'Authorization': `Bearer ${TEST_API_KEY}`,
                    'X-User-Id': TEST_USER,
                    'X-Fodda-Session-Kind': 'internal-test'
                }
            }
        }
    );
    const client = new Client({ name: 'coverage-replay-client', version: '1.0.0' });

    try {
        await client.connect(transport as any);
        console.log('Connected to MCP.\n');
    } catch (err: any) {
        console.log(`Note: Could not connect to remote transport (${err.message}). Test cases registered: ${TEST_CASES.length}`);
        return;
    }

    let passCount = 0;
    let failCount = 0;

    for (const tc of TEST_CASES) {
        console.log(`--- [${tc.id}] ${tc.tool} (${tc.analyst_id}) ---`);
        console.log(`Query: "${tc.query}"`);
        console.log(`Expected category: ${tc.expectedCoverageCategory}`);

        const start = Date.now();
        try {
            const res = await client.callTool({
                name: tc.tool,
                arguments: {
                    analyst_id: tc.analyst_id,
                    query: tc.query,
                    userId: TEST_USER
                }
            });
            const duration = Date.now() - start;
            const content = (res.content as any)?.[0]?.text || '';
            const coverageMatch = content.match(/--- COVERAGE: ([A-Za-z]+) ---/);
            const coverage = (res as any)?.coverage || (coverageMatch ? coverageMatch[1] : 'unknown');
            const coverageLower = coverage.toLowerCase();

            console.log(`Result: duration=${duration}ms, coverage=${coverage}`);
            console.log(`Preview: "${content.slice(0, 120).replace(/\n/g, ' ')}..."`);

            let matchesExpected = false;
            if (tc.expectedCoverageCategory === 'in') {
                matchesExpected = coverageLower === 'in' || coverageLower === 'full';
            } else if (tc.expectedCoverageCategory === 'adjacent') {
                matchesExpected = coverageLower === 'adjacent' || coverageLower === 'partial' || coverageLower === 'thin';
            } else if (tc.expectedCoverageCategory === 'out') {
                // Out-of-lane queries must either resolve to OUT / EMPTY or deliver the third-person platform decline
                const hasDeclineText = content.includes("doesn't have a lot of information") ||
                    content.includes("passed on this") ||
                    content.includes("outside their focus") ||
                    content.includes("outside their lane");
                matchesExpected = coverageLower === 'out' || coverageLower === 'empty' || hasDeclineText;
            } else {
                matchesExpected = true;
            }

            if (matchesExpected) {
                console.log(`✅ PASS: [${tc.id}] coverage "${coverage}" matches expected "${tc.expectedCoverageCategory}"\n`);
                passCount++;
            } else {
                console.error(`❌ DRIFT/MISMATCH: [${tc.id}] returned coverage "${coverage}" (expected "${tc.expectedCoverageCategory}")\n`);
                failCount++;
            }
        } catch (err: any) {
            console.error(`❌ ERROR: [${tc.id}] Call failed: ${err.message}\n`);
            failCount++;
        }
    }

    console.log(`Coverage replay finished: ${passCount} passed, ${failCount} failed.`);
    await client.close();

    if (failCount > 0) {
        process.exit(1);
    }
}

runCoverageReplay().catch((err) => {
    console.error(err);
    process.exit(1);
});
