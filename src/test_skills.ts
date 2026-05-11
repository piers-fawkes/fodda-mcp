/**
 * Skill Stress Test — Tests both Paralogy and Igloo skill servers
 * against the Fodda skill client contract.
 *
 * Run: npx ts-node src/test_skills.ts
 * Or:  node dist/test_skills.js (after npm run build)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ---------------------------------------------------------------------------
// Sample Fodda data (realistic search_graph output)
// ---------------------------------------------------------------------------

const SAMPLE_FODDA_OUTPUT = {
    query: "AI in retail personalization",
    graphId: "retail",
    context: {
        graphName: "PSFK's Retail Graph",
        curatorName: "PSFK Editorial",
        domain: "Retail & Commerce",
    },
    trends: [
        {
            name: "AI-Powered Hyper-Personalization Engines",
            summary: "Retailers deploying real-time AI systems that personalize every touchpoint — from homepage layout to checkout offers — based on behavioral micro-signals rather than demographic segments.",
            signal_score: 98,
            trendLifecycle: "growing",
            momentum: "accelerating",
            evidence_count: 12,
            graphName: "PSFK's Retail Graph",
        },
        {
            name: "Conversational Commerce Agents",
            summary: "AI shopping assistants that maintain context across sessions, remember preferences, and proactively suggest products based on life events and seasonal patterns.",
            signal_score: 85,
            trendLifecycle: "emerging",
            momentum: "accelerating",
            evidence_count: 8,
            graphName: "PSFK's Retail Graph",
        },
        {
            name: "Predictive Inventory Allocation",
            summary: "Machine learning models that pre-position inventory based on predicted demand signals from social media trends, weather patterns, and local events.",
            signal_score: 72,
            trendLifecycle: "established",
            momentum: "stable",
            evidence_count: 6,
            graphName: "PSFK's Retail Graph",
        },
        {
            name: "Privacy-First Personalization",
            summary: "Zero-party data strategies where customers voluntarily share preferences in exchange for genuinely useful personalization, replacing surveillance-based targeting.",
            signal_score: 65,
            trendLifecycle: "emerging",
            momentum: "accelerating",
            evidence_count: 5,
            graphName: "PSFK's Retail Graph",
        },
        {
            name: "Digital Twin Shopping Experiences",
            summary: "Virtual replicas of physical stores that let consumers browse, try on, and purchase in 3D environments powered by AI spatial computing.",
            signal_score: 41,
            trendLifecycle: "emerging",
            momentum: "stable",
            evidence_count: 3,
            graphName: "PSFK's Retail Graph",
        },
    ],
    evidence: [
        {
            title: "Sephora's AI Color Match drives 28% conversion lift",
            sourceUrl: "https://example.com/sephora-ai",
            brandNames: ["Sephora"],
            place: "United States",
            snippet: "Sephora's Virtual Artist tool uses computer vision to match foundation shades...",
        },
        {
            title: "Amazon's predictive shipping cuts delivery time by 2 days",
            sourceUrl: "https://example.com/amazon-predictive",
            brandNames: ["Amazon"],
            place: "Global",
            snippet: "Amazon's anticipatory shipping patent places items in transit before purchase...",
        },
        {
            title: "Nike's .SWOOSH platform tokenizes digital fashion",
            sourceUrl: "https://example.com/nike-swoosh",
            brandNames: ["Nike"],
            place: "United States",
            snippet: "Nike's blockchain-backed membership platform allows co-creation of virtual sneakers...",
        },
    ],
    supplemental: {
        google_trends: { interest_over_time: 78, trending: true },
        census_retail: { total_retail_sales: "$7.2T", ecommerce_share: "16.4%" },
    },
};

// ---------------------------------------------------------------------------
// Test a single skill
// ---------------------------------------------------------------------------

interface TestResult {
    skillName: string;
    mcpUrl: string;
    // Connection
    connectionSuccess: boolean;
    connectionError?: string;
    connectionMs: number;
    // Tool Discovery
    toolsDiscovered: string[];
    toolsError?: string;
    // Tool Call
    toolCallSuccess: boolean;
    toolCallError?: string;
    toolCallMs: number;
    outputLength: number;
    outputPreview: string;
    // Protocol compliance
    isRealMcpServer: boolean;
    authRequired: boolean;
    issues: string[];
    recommendations: string[];
}

async function testSkill(name: string, mcpUrl: string, toolName: string): Promise<TestResult> {
    const result: TestResult = {
        skillName: name,
        mcpUrl,
        connectionSuccess: false,
        connectionMs: 0,
        toolsDiscovered: [],
        toolCallSuccess: false,
        toolCallMs: 0,
        outputLength: 0,
        outputPreview: '',
        isRealMcpServer: false,
        authRequired: false,
        issues: [],
        recommendations: [],
    };

    let client: Client | null = null;
    const connStart = Date.now();

    try {
        const url = new URL(mcpUrl);
        client = new Client({ name: 'fodda-skill-tester', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(url);

        // Test 1: Connection
        console.log(`\n── Testing ${name} (${mcpUrl}) ──`);
        console.log('Step 1: Connecting...');

        await Promise.race([
            client.connect(transport as any),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000)
            ),
        ]);

        result.connectionSuccess = true;
        result.connectionMs = Date.now() - connStart;
        result.isRealMcpServer = true;
        console.log(`  ✅ Connected in ${result.connectionMs}ms`);

        // Test 2: Tool Discovery
        console.log('Step 2: Discovering tools...');
        const toolsResult = await client.listTools();
        const tools = toolsResult.tools || [];
        result.toolsDiscovered = tools.map(t => `${t.name}: ${t.description || '(no description)'}`);
        console.log(`  ✅ Found ${tools.length} tool(s):`);
        for (const t of tools) {
            console.log(`     - ${t.name}: ${(t.description || '').substring(0, 80)}`);
        }

        if (tools.length === 0) {
            result.issues.push('No tools exposed — server responds to MCP protocol but has no callable tools');
            result.recommendations.push('Register at least one tool that accepts Fodda data');
            return result;
        }

        // Test 3: Tool Call with Fodda data
        const targetTool = tools.find(t => t.name === toolName) || tools[0];
        if (!targetTool) {
            result.issues.push('No matching tool found');
            return result;
        }
        console.log(`Step 3: Calling tool "${targetTool.name}" with sample Fodda data...`);
        const callStart = Date.now();

        const callResult = await Promise.race([
            client.callTool({
                name: targetTool.name,
                arguments: {
                    fodda_output: SAMPLE_FODDA_OUTPUT,
                    query: SAMPLE_FODDA_OUTPUT.query,
                    trends: SAMPLE_FODDA_OUTPUT.trends,
                    evidence: SAMPLE_FODDA_OUTPUT.evidence,
                },
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Tool call timeout (10s)')), 10000)
            ),
        ]);

        result.toolCallMs = Date.now() - callStart;
        const contentArr = Array.isArray(callResult.content) ? callResult.content : [];
        const outputText = contentArr.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');

        result.toolCallSuccess = true;
        result.outputLength = outputText.length;
        result.outputPreview = outputText.substring(0, 500);
        console.log(`  ✅ Tool responded in ${result.toolCallMs}ms (${outputText.length} chars)`);
        console.log(`  Preview: ${outputText.substring(0, 200)}...`);

        // Quality checks
        if (outputText.length < 50) {
            result.issues.push(`Output is very short (${outputText.length} chars) — may not be providing useful transformation`);
        }
        if (outputText.length > 10000) {
            result.issues.push(`Output is very long (${outputText.length} chars) — may overwhelm the LLM context window`);
            result.recommendations.push('Aim for 500-2000 characters of output');
        }
        if (result.toolCallMs > 8000) {
            result.issues.push(`Tool call took ${result.toolCallMs}ms — close to the 10s timeout`);
            result.recommendations.push('Optimize response time to stay well under 10 seconds');
        }

    } catch (err: any) {
        const elapsed = Date.now() - connStart;

        if (err.message?.includes('401') || err.message?.includes('Unauthorized') || err.message?.includes('authentication')) {
            result.authRequired = true;
            result.connectionError = `Authentication required (401)`;
            result.issues.push('Server requires authentication — Fodda sends no auth headers currently');
            result.recommendations.push('Either: (a) whitelist Fodda\'s IP/user-agent, (b) provide an API key to store in Airtable, or (c) make the MCP endpoint auth-free for registered partners');
            result.isRealMcpServer = true; // 401 confirms it's a real server
            console.log(`  ⚠️ Auth required (401) — server exists but needs credentials`);
        } else if (err.message?.includes('timeout')) {
            result.connectionError = `Connection timed out after 5s`;
            result.issues.push('Server did not respond within 5 seconds');
            result.recommendations.push('Ensure the MCP endpoint is accessible and responding');
            console.log(`  ❌ Connection timeout`);
        } else if (err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND')) {
            result.connectionError = `Server unreachable: ${err.message}`;
            result.issues.push('Server is not reachable at the configured URL');
            console.log(`  ❌ Server unreachable: ${err.message}`);
        } else {
            result.connectionError = err.message;
            result.issues.push(`Unexpected error: ${err.message}`);
            console.log(`  ❌ Error: ${err.message}`);
        }

        result.connectionMs = elapsed;
    } finally {
        try { if (client) await client.close(); } catch { /* ignore */ }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  FODDA SKILL STRESS TEST');
    console.log('  Testing skill MCP servers against the Fodda contract');
    console.log('═══════════════════════════════════════════════════════');

    const results: TestResult[] = [];

    // Test Paralogy
    results.push(await testSkill('Paralogy', 'https://mcp.paralogy.ai/mcp', 'reframe_trends'));

    // Test Igloo — try the MCP endpoint if it exists
    // Based on prior testing, Igloo is a REST API, not MCP. Let's verify.
    results.push(await testSkill('Igloo', 'https://igloo-api.example.com/mcp', 'validate'));

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    for (const r of results) {
        console.log(`── ${r.skillName} (${r.mcpUrl}) ──`);
        console.log(`  Real MCP Server: ${r.isRealMcpServer ? '✅ Yes' : '❌ No'}`);
        console.log(`  Auth Required:   ${r.authRequired ? '⚠️ Yes' : '✅ No (or not tested)'}`);
        console.log(`  Connection:      ${r.connectionSuccess ? `✅ ${r.connectionMs}ms` : `❌ ${r.connectionError}`}`);
        console.log(`  Tools Found:     ${r.toolsDiscovered.length > 0 ? r.toolsDiscovered.join(', ') : '(none discovered)'}`);
        console.log(`  Tool Call:       ${r.toolCallSuccess ? `✅ ${r.toolCallMs}ms, ${r.outputLength} chars` : `❌ ${r.toolCallError || 'not reached'}`}`);

        if (r.issues.length > 0) {
            console.log(`  Issues:`);
            for (const i of r.issues) console.log(`    ⚠️ ${i}`);
        }
        if (r.recommendations.length > 0) {
            console.log(`  Recommendations:`);
            for (const rec of r.recommendations) console.log(`    → ${rec}`);
        }
        if (r.outputPreview) {
            console.log(`  Output Preview:`);
            console.log(`    ${r.outputPreview.substring(0, 300).replace(/\n/g, '\n    ')}`);
        }
        console.log('');
    }
}

main().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
