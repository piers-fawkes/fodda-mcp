/**
 * Verification test for Caller Identity Forwarding in On-Request Demand Webhooks.
 *
 * Verifies:
 * 1. Authenticated via OAuth (userId = 'user_2xyz', apiKey = 'sk_live_...') -> passes userId and clerkUserId in webhook payload.
 * 2. Authenticated via connection token (userId = 'piers.fawkes@psfk.com') -> passes email userId in webhook payload.
 * 3. Authenticated via API key only (userId = 'anonymous', apiKey = 'sk_live_test_api_key') -> passes key:sk_live_test_api_key in webhook payload.
 * 4. Tool-level uid provided when session is anonymous -> passes tool uid in webhook payload.
 * 5. Fully anonymous session (no key, placeholder user) -> falls back to anonymous@mcp.fodda.ai.
 * 6. Integration: consult_human_agent with an Unclaimed expert triggers the demand webhook with the caller's identity.
 */

import assert from 'assert';
import axios from 'axios';
import { createServer } from './toolHandlers.js';
import { initCatalogCache } from './catalogCache.js';

async function runTests() {
    console.log('=== Test Suite: Caller Identity in On-Request Demand Webhooks ===\n');

    await initCatalogCache();

    // Intercept axios.post to capture outbound webhook dispatches
    const capturedPayloads: any[] = [];
    const originalPost = axios.post;

    (axios as any).post = async (url: string, data: any, config?: any) => {
        if (url.includes('intent')) {
            capturedPayloads.push({ url, data, config });
            return { status: 200, data: { ok: true } };
        }
        return originalPost(url, data, config);
    };

    try {
        // --- Test 1: OAuth user (userId = 'user_2abc123', apiKey = 'sk_live_oauth') ---
        console.log('Test 1: OAuth user identity forwarding...');
        capturedPayloads.length = 0;
        const oauthServer = await createServer(
            'sk_live_oauth',
            'user_2abc123',
            async () => ({ result: 'domain intelligence response', coverage: 'full' }),
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const consultToolOAuth = (oauthServer as any)._registeredTools['consult_human_agent'];
        assert(consultToolOAuth, 'consult_human_agent must be registered');

        await (consultToolOAuth.handler || consultToolOAuth.callback || consultToolOAuth.execute)({
            analyst_id: 'roxane-prieux',
            query: 'Clean beauty formulation trends'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Exactly one webhook should be captured');
        const p1 = capturedPayloads[0].data;
        assert.strictEqual(p1.intent_event, 'unclaimed_expert_request');
        assert.strictEqual(p1.email, 'user_2abc123', 'email should be userId for OAuth');
        assert.strictEqual(p1.userId, 'user_2abc123', 'userId should be passed');
        assert.strictEqual(p1.parameters.userId, 'user_2abc123');
        assert.strictEqual(p1.parameters.clerkUserId, 'user_2abc123', 'clerkUserId should be stamped for user_ prefix');
        console.log('  ✅ Test 1 Passed: OAuth userId forwarded correctly (user_2abc123)');

        // --- Test 2: Connection token user (userId = 'piers.fawkes@psfk.com', apiKey = 'sk_live_conn') ---
        console.log('\nTest 2: Connection token user identity forwarding...');
        capturedPayloads.length = 0;
        const connServer = await createServer(
            'sk_live_conn',
            'piers.fawkes@psfk.com',
            async () => ({ result: 'domain intelligence response', coverage: 'full' }),
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const consultToolConn = (connServer as any)._registeredTools['consult_human_agent'];
        await (consultToolConn.handler || consultToolConn.callback || consultToolConn.execute)({
            analyst_id: 'roxane-prieux',
            query: 'Sustainable packaging materials'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Exactly one webhook should be captured');
        const p2 = capturedPayloads[0].data;
        assert.strictEqual(p2.email, 'piers.fawkes@psfk.com', 'email should be user email');
        assert.strictEqual(p2.userId, 'piers.fawkes@psfk.com', 'userId should be user email');
        assert.strictEqual(p2.parameters.userId, 'piers.fawkes@psfk.com');
        assert.strictEqual(p2.parameters.clerkUserId, undefined, 'clerkUserId should not be set for email');
        console.log('  ✅ Test 2 Passed: Connection token email forwarded correctly (piers.fawkes@psfk.com)');

        // --- Test 3: API key only session (userId = 'anonymous', apiKey = 'sk_live_corp_agent_99') ---
        console.log('\nTest 3: API key caller identity forwarding...');
        capturedPayloads.length = 0;
        const apiKeyServer = await createServer(
            'sk_live_corp_agent_99',
            'anonymous',
            async () => ({ result: 'domain intelligence response', coverage: 'full' }),
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const consultToolApiKey = (apiKeyServer as any)._registeredTools['consult_human_agent'];
        await (consultToolApiKey.handler || consultToolApiKey.callback || consultToolApiKey.execute)({
            analyst_id: 'roxane-prieux',
            query: 'Future of natural cosmetics'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Exactly one webhook should be captured');
        const p3 = capturedPayloads[0].data;
        assert.strictEqual(p3.email, 'key:sk_live_corp_agent_99', 'email should format as key:sk_live_...');
        assert.strictEqual(p3.userId, 'key:sk_live_corp_agent_99', 'userId should format as key:sk_live_...');
        assert.strictEqual(p3.parameters.userId, 'key:sk_live_corp_agent_99');
        console.log('  ✅ Test 3 Passed: API key formatted and forwarded correctly (key:sk_live_corp_agent_99)');

        // --- Test 4: Tool-level uid override (session anonymous, tool userId = 'tool-user@domain.com') ---
        console.log('\nTest 4: Tool-level uid forwarding...');
        capturedPayloads.length = 0;
        await (consultToolApiKey.handler || consultToolApiKey.callback || consultToolApiKey.execute)({
            analyst_id: 'roxane-prieux',
            query: 'Biotech skincare actives',
            userId: 'tool-user@domain.com'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Exactly one webhook should be captured');
        const p4 = capturedPayloads[0].data;
        assert.strictEqual(p4.email, 'tool-user@domain.com', 'email should prefer tool-provided uid over API key');
        assert.strictEqual(p4.userId, 'tool-user@domain.com');
        console.log('  ✅ Test 4 Passed: Tool-provided uid forwarded correctly (tool-user@domain.com)');

        // --- Test 5: Fully anonymous session (empty apiKey, userId = 'anonymous') ---
        console.log('\nTest 5: Fully anonymous fallback...');
        capturedPayloads.length = 0;
        const anonServer = await createServer(
            '',
            'anonymous',
            async () => ({ result: 'domain intelligence response', coverage: 'full' }),
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const consultToolAnon = (anonServer as any)._registeredTools['consult_human_agent'];
        await (consultToolAnon.handler || consultToolAnon.callback || consultToolAnon.execute)({
            analyst_id: 'roxane-prieux',
            query: 'Packaging lifecycle assessment'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Exactly one webhook should be captured');
        const p5 = capturedPayloads[0].data;
        assert.strictEqual(p5.email, 'anonymous@mcp.fodda.ai', 'email should fall back to anonymous@mcp.fodda.ai');
        assert.strictEqual(p5.userId, 'anonymous@mcp.fodda.ai');
        console.log('  ✅ Test 5 Passed: Anonymous fallback maintained (anonymous@mcp.fodda.ai)');

        // --- Test 6: verify_claim with unclaimed analyst forwards caller identity ---
        console.log('\nTest 6: verify_claim with unclaimed analyst forwarding caller identity...');
        capturedPayloads.length = 0;
        const verifyClaimTool = (apiKeyServer as any)._registeredTools['verify_claim'];
        assert(verifyClaimTool, 'verify_claim tool must be registered');

        await (verifyClaimTool.handler || verifyClaimTool.callback || verifyClaimTool.execute)({
            claim: 'Clean formulations require synthetic preservatives for stability',
            analyst_id: 'roxane-prieux'
        });

        assert.strictEqual(capturedPayloads.length, 1, 'Webhook should be fired from verify_claim');
        const p6 = capturedPayloads[0].data;
        assert.strictEqual(p6.email, 'key:sk_live_corp_agent_99', 'verify_claim must forward caller identity');
        assert.strictEqual(p6.parameters.expertName, 'Roxane Prieux');
        console.log('  ✅ Test 6 Passed: verify_claim caller identity forwarded correctly');

        console.log('\n🎉 ALL CALLER IDENTITY WEBHOOK TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    } finally {
        (axios as any).post = originalPost;
    }
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
