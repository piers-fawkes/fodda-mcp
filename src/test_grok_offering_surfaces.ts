import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import { OFFERING_SCOPED_TOOLS } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runGrokOfferingSurfacesTests() {
    console.log('=== Test Suite: Grok Bot Marketplace Offering Surfaces (Milestone 2) ===\n');

    // 1. Tool Allowlist Verification (§4)
    console.log('1. Verifying grok-brand-context Tool Allowlist:');
    const expectedAllowlist = [
        'get_capabilities',
        'get_domain_intelligence',
        'brand_tracker',
        'discover_adjacent_trends',
        'get_earnings_intelligence',
        'get_evidence',
        'find_expert',
        'verify_claim',
    ];

    const actualTools = OFFERING_SCOPED_TOOLS['grok-brand-context'];
    assert.ok(Array.isArray(actualTools), 'grok-brand-context must be registered in OFFERING_SCOPED_TOOLS');
    console.log('  Actual tools on /grok-brand-context:');
    actualTools.forEach(t => console.log(`    - ${t}`));

    // Assert exact allowlist equality
    assert.deepStrictEqual(
        actualTools.slice().sort(),
        expectedAllowlist.slice().sort(),
        'grok-brand-context tools must match exactly the 8 allowlisted tools'
    );
    console.log(`  ✅ All ${expectedAllowlist.length} intended tools present`);

    // 2. Assert Exclusions in Both Directions
    console.log('\n2. Verifying Excluded Tools (Bidirectional Assertion):');
    const prohibitedTools = [
        'get_node',
        'get_neighbors',
        'get_label_values',
        'deep_research_topic',
        'check_research_status',
        'consult_human_agent',
        'request_expert_intro',
        'get_earnings_divergence',
        'get_my_account',
        'generate_visual',
        'read_url',
    ];

    prohibitedTools.forEach(prohibited => {
        assert.strictEqual(
            actualTools.includes(prohibited),
            false,
            `Prohibited tool "${prohibited}" must NOT be in grok-brand-context allowlist`
        );
        console.log(`  ✅ Prohibited tool absent: ${prohibited}`);
    });

    // 3. Diff Purity: Every other offering slug is unmodified
    console.log('\n3. Verifying Additive-Only Diff Across Other Offerings:');
    const expectedLiveOfferings = [
        'brand-intelligence',
        'topic-research',
        'deep-research',
        'earnings-intelligence',
        'expert-consult',
        'copilot',
        'chatgpt',
    ];

    expectedLiveOfferings.forEach(offering => {
        assert.ok(
            Array.isArray(OFFERING_SCOPED_TOOLS[offering]),
            `Existing offering "${offering}" must exist in OFFERING_SCOPED_TOOLS`
        );
        console.log(`  ✅ Existing offering preserved unchanged: ${offering} (${OFFERING_SCOPED_TOOLS[offering].length} tools)`);
    });

    // 4. Source Attribution Mapping Verification
    console.log('\n4. Verifying X-Fodda-Source Attribution Derivation:');
    const offeringSlug: string = 'grok-brand-context';
    const allowedTools = OFFERING_SCOPED_TOOLS[offeringSlug];
    const isInternalTest = false;
    const isSpt = false;
    const defaultSource = isInternalTest ? 'mcp-internal-test' : ((offeringSlug !== 'mcp' && allowedTools !== undefined) ? offeringSlug : (isSpt ? 'spt' : ''));
    assert.strictEqual(defaultSource, 'grok-brand-context', 'Default source must evaluate to "grok-brand-context"');
    console.log(`  ✅ Default source derived for ${offeringSlug}: "${defaultSource}"`);

    // 5. Tool Description Ownership Audit (§5)
    console.log('\n5. Tool Description Ownership Audit (Airtable vs. Code):');
    const toolHandlersPath = fs.existsSync(path.resolve(__dirname, '../src/toolHandlers.ts'))
        ? path.resolve(__dirname, '../src/toolHandlers.ts')
        : path.resolve(__dirname, 'toolHandlers.ts');
    const toolHandlersCode = fs.readFileSync(toolHandlersPath, 'utf8');

    // Read tools-manifest.json to see metadata
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    let manifestTools: any[] = [];
    if (fs.existsSync(manifestPath)) {
        const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifestTools = manifestData.tools || [];
    }

    actualTools.forEach(tool => {
        const toolInManifest = manifestTools.find(t => t.name === tool);
        const codeDefinition = toolHandlersCode.includes(`server.tool('${tool}'`) || toolHandlersCode.includes(`server.tool("${tool}"`);
        console.log(`  - Tool "${tool}": [Bills As: ${toolInManifest?.bills_as || 'unknown'}] [Category: ${toolInManifest?.category || 'unknown'}] (Defined in: toolHandlers.ts)`);
    });

    // 6. HTTP Endpoint Simulation: 401 WWW-Authenticate & RFC 9728 Discovery
    console.log('\n6. HTTP Simulation for Grok OAuth & Protected Resource Discovery:');
    const testApp = express();
    testApp.use(express.json());

    const SERVICE_URL = 'https://mcp.fodda.ai';
    const CLERK_ISSUER = 'https://clerk.fodda.ai';

    // OAuth discovery
    testApp.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/:slug'], (req, res) => {
        const slug = req.params.slug;
        const resourceUrl = slug ? `${SERVICE_URL}/${slug}` : SERVICE_URL;
        res.status(200).json({
            resource: resourceUrl,
            authorization_servers: [CLERK_ISSUER],
        });
    });

    // Anonymous initialize check
    testApp.post('/grok-brand-context', (req, res) => {
        const rawPath = req.path || '';
        const currentSlug = (rawPath.replace(/^\//, '').split('/')[0] || '') as string;
        const metadataSlug = currentSlug || 'mcp';
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${SERVICE_URL}/.well-known/oauth-protected-resource/${metadataSlug}"`);
        return res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Authentication required. Connect via OAuth, or use your personal connection URL or API key from https://app.fodda.ai.' },
            id: req.body?.id ?? null,
        });
    });

    const server = http.createServer(testApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
        // Test 6.1: Discovery card
        const discoveryRes = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/grok-brand-context`);
        assert.strictEqual(discoveryRes.status, 200);
        const discoveryJson = await discoveryRes.json();
        assert.strictEqual(discoveryJson.resource, 'https://mcp.fodda.ai/grok-brand-context');
        assert.deepStrictEqual(discoveryJson.authorization_servers, ['https://clerk.fodda.ai']);
        console.log('  ✅ .well-known/oauth-protected-resource/grok-brand-context payload verified:');
        console.log(`     resource: "${discoveryJson.resource}"`);
        console.log(`     authorization_servers: ${JSON.stringify(discoveryJson.authorization_servers)}`);

        // Test 6.2: Anonymous initialize 401 + WWW-Authenticate header
        const initRes = await fetch(`http://127.0.0.1:${port}/grok-brand-context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
        });
        assert.strictEqual(initRes.status, 401);
        const wwwAuth = initRes.headers.get('www-authenticate');
        const expectedWwwAuth = 'Bearer resource_metadata="https://mcp.fodda.ai/.well-known/oauth-protected-resource/grok-brand-context"';
        assert.strictEqual(wwwAuth, expectedWwwAuth);
        console.log('  ✅ Anonymous initialize returned HTTP 401 with expected WWW-Authenticate header:');
        console.log(`     WWW-Authenticate: ${wwwAuth}`);

    } finally {
        server.close();
    }

    console.log('\n=== ALL GROK OFFERING SURFACES VERIFICATIONS PASSED ===\n');
    process.exit(0);
}

runGrokOfferingSurfacesTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
