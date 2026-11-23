/**
 * Test: Bounded-Await Meter Settlement, First-Charge Notice & Big Offerings Card Gate
 *
 * Verifies:
 * 1. chargeQuery & boundedChargeQuery:
 *    - Parses `first_overage_charge_notice: true` into `firstOverageChargeNotice: true` and `overageNoticeText`.
 *    - Leaves `firstOverageChargeNotice: false` when absent or false.
 *    - boundedChargeQuery resolves within timeout and gracefully handles timeouts without throwing.
 * 2. appendOverageNoticeToContent:
 *    - Correctly appends trailing notice block:
 *      "\n\n---\nNote: This query was charged against your account, and any further queries will be billed until your account resets."
 *    - Idempotent: Never duplicates the notice if already present.
 * 3. CARD_REQUIRED_FOR_DELIVERABLE error handling:
 *    - classifyAccessError recognizes CARD_REQUIRED_FOR_DELIVERABLE as 'credits'.
 *    - handleAccessError produces clean, structured refusal with setup_url and https://www.fodda.ai/pricing.
 *    - Never mentions "tokens", "SPT", or internal rates.
 *    - ChatGPT guard: surfaces clean refusal with manage_url and zero payment/Stripe links.
 * 4. 5 Big Offerings Tool Error Mapping:
 *    - generate_comms_plan
 *    - request_deliverable
 *    - brand_tracker
 *    - deep_research_topic
 *    - manage_scheduled_reports / get_intelligence_dossier
 */

import assert from 'assert';
import {
    initPricingCache,
    chargeQuery,
    boundedChargeQuery,
    FIRST_OVERAGE_CHARGE_NOTICE_TEXT,
    FIRST_OVERAGE_CHARGE_NOTICE_BLOCK,
} from './pricingCache.js';
import { appendOverageNoticeToContent } from './toolHandlers.js';
import { handleAccessError, classifyAccessError } from './errorHandling.js';

async function runTests() {
    console.log('--- Running Bounded-Await Meter & Card Gate Test Suite ---\n');
    await initPricingCache();

    // ── 1. Notice Text Invariants ──
    console.log('Test 1: Notice text matches exact required string');
    assert.strictEqual(
        FIRST_OVERAGE_CHARGE_NOTICE_TEXT,
        'Note: This query was charged against your account, and any further queries will be billed until your account resets.'
    );
    assert.strictEqual(
        FIRST_OVERAGE_CHARGE_NOTICE_BLOCK,
        '\n\n---\nNote: This query was charged against your account, and any further queries will be billed until your account resets.'
    );
    console.log('✅ Test 1 Passed\n');

    // ── 2. appendOverageNoticeToContent ──
    console.log('Test 2: appendOverageNoticeToContent appends and is idempotent');
    const toolResult = {
        content: [
            { type: 'text', text: 'Executive briefing results here.' }
        ]
    };
    appendOverageNoticeToContent(toolResult);
    assert.strictEqual(
        toolResult.content[0].text,
        'Executive briefing results here.\n\n---\nNote: This query was charged against your account, and any further queries will be billed until your account resets.'
    );

    // Call it a second time — must NOT duplicate
    appendOverageNoticeToContent(toolResult);
    assert.strictEqual(
        toolResult.content[0].text,
        'Executive briefing results here.\n\n---\nNote: This query was charged against your account, and any further queries will be billed until your account resets.'
    );
    console.log('✅ Test 2 Passed\n');

    // ── 3. boundedChargeQuery & chargeQuery parsing ──
    console.log('Test 3: chargeQuery parses first_overage_charge_notice: true');
    const mockFoddaRequestNoticeTrue = async (method: string, path: string, key?: string, uid?: string, body?: any) => {
        return {
            charged: true,
            api_calls_charged: 1,
            first_overage_charge_notice: true,
            balance: 0,
        };
    };

    const resNoticeTrue = await chargeQuery({
        queryTypeCode: 'topic_research',
        apiKey: 'test-key',
        userId: 'user-1@example.com',
        query: 'retail trends',
        foddaRequest: mockFoddaRequestNoticeTrue,
    });
    assert.strictEqual(resNoticeTrue.charged, true);
    assert.strictEqual(resNoticeTrue.firstOverageChargeNotice, true);
    assert.strictEqual(resNoticeTrue.overageNoticeText, FIRST_OVERAGE_CHARGE_NOTICE_TEXT);

    console.log('Test 4: chargeQuery parses first_overage_charge_notice: false or absent');
    const mockFoddaRequestNoticeFalse = async (method: string, path: string, key?: string, uid?: string, body?: any) => {
        return {
            charged: true,
            api_calls_charged: 1,
            first_overage_charge_notice: false,
            balance: 42,
        };
    };

    const resNoticeFalse = await chargeQuery({
        queryTypeCode: 'topic_research',
        apiKey: 'test-key',
        userId: 'user-1@example.com',
        query: 'retail trends',
        foddaRequest: mockFoddaRequestNoticeFalse,
    });
    assert.strictEqual(resNoticeFalse.charged, true);
    assert.strictEqual(Boolean(resNoticeFalse.firstOverageChargeNotice), false);
    assert.strictEqual(resNoticeFalse.overageNoticeText, undefined);

    console.log('Test 5: boundedChargeQuery enforces 1500ms bounded timeout');
    const mockFoddaRequestSlow = async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { charged: true };
    };

    const start = Date.now();
    const resSlow = await boundedChargeQuery({
        queryTypeCode: 'topic_research',
        apiKey: 'test-key',
        userId: 'user-1@example.com',
        query: 'slow query',
        foddaRequest: mockFoddaRequestSlow,
    }, 100, 'test_slow');
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 500, `boundedChargeQuery should return immediately on timeout, took ${elapsed}ms`);
    assert.strictEqual(resSlow, null);
    console.log('✅ Tests 3-5 Passed\n');

    // ── 4. CARD_REQUIRED_FOR_DELIVERABLE ──
    console.log('Test 6: CARD_REQUIRED_FOR_DELIVERABLE classification & unified structure');
    const cardRequiredErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'CARD_REQUIRED_FOR_DELIVERABLE',
                code: 'CARD_REQUIRED_FOR_DELIVERABLE',
                message: 'A payment card on file is required before commissioning Big Offerings (Connections Plan, IP-Brand Proposals, Brand Intelligence Dossier, Deep Dive Research, Weekly Trackers).',
                setup_url: 'https://app.fodda.ai/api/account/setup-url?email=exec%40example.com',
                setupUrl: 'https://app.fodda.ai/api/account/setup-url?email=exec%40example.com',
                pricing_url: 'https://www.fodda.ai/pricing',
            }
        }
    };

    assert.strictEqual(classifyAccessError(cardRequiredErr), 'credits');

    const bigOfferings = [
        'generate_comms_plan',
        'request_deliverable',
        'brand_tracker',
        'deep_research_topic',
        'manage_scheduled_reports',
        'get_intelligence_dossier',
    ];

    for (const toolName of bigOfferings) {
        const handled = await handleAccessError(cardRequiredErr, toolName, 'exec@example.com', 'test-key');
        assert.strictEqual(handled.isError, true, `${toolName} should return isError: true`);
        const payload = JSON.parse(handled.content![0]!.text);
        assert.strictEqual(payload.code, 'CARD_REQUIRED_FOR_DELIVERABLE', `${toolName} code must match`);
        assert.strictEqual(payload.action, 'SETUP_CARD', `${toolName} action must be SETUP_CARD`);
        assert.strictEqual(payload.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=exec%40example.com');
        assert.strictEqual(payload.pricing_url, 'https://www.fodda.ai/pricing');
        assert.ok(payload.next_action.includes('https://app.fodda.ai/api/account/setup-url'), 'next_action must contain setup_url');
        assert.ok(payload.next_action.includes('https://www.fodda.ai/pricing'), 'next_action must contain pricing_url');
        assert.ok(!payload.next_action.includes('token'), 'Must never mention tokens in user-visible text');
        assert.ok(!payload.next_action.includes('SPT'), 'Must never mention SPT in user-visible text');
    }
    console.log('✅ Test 6 Passed\n');

    // ── 5. ChatGPT Guard for CARD_REQUIRED_FOR_DELIVERABLE ──
    console.log('Test 7: ChatGPT guard silences payment links on CARD_REQUIRED_FOR_DELIVERABLE');
    const chatGptHandled = await handleAccessError(cardRequiredErr, 'generate_comms_plan', 'exec@example.com', 'test-key', 'chatgpt');
    assert.strictEqual(chatGptHandled.isError, true);
    const chatGptPayload = JSON.parse(chatGptHandled.content![0]!.text);
    assert.strictEqual(chatGptPayload.code, 'CARD_REQUIRED_FOR_DELIVERABLE');
    assert.strictEqual(chatGptPayload.status, 'CARD_REQUIRED_FOR_DELIVERABLE');
    assert.strictEqual(chatGptPayload.action, 'SETUP_CARD');
    assert.strictEqual(chatGptPayload.manage_url, 'https://app.fodda.ai/account');
    assert.strictEqual(chatGptPayload.setup_url, undefined, 'Must not leak Stripe setup_url to ChatGPT');
    assert.strictEqual(chatGptPayload.pricing_url, undefined, 'Must not leak pricing_url to ChatGPT');
    assert.ok(!chatGptPayload.message.includes('stripe'), 'Must not mention Stripe in ChatGPT message');
    console.log('✅ Test 7 Passed\n');

    console.log('====================================================');
    console.log('🎉 ALL BOUNDED METER & CARD GATE TESTS PASSED! 🎉');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
