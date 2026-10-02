/**
 * Test: Daily Burst Limit & Monthly Plan Limit Handling with Credit Card Capture
 * and ChatGPT Commerce-Silence Invariant
 *
 * Verifies:
 * 1. DAILY_LIMIT_EXCEEDED:
 *    - classifyAccessError classifies as 'credits'
 *    - handleAccessError and handleTrialCreditExhaustion return code DAILY_LIMIT_EXCEEDED, action SETUP_CARD, setup_url, and verbatim next_action
 * 2. PLAN_LIMIT_EXCEEDED:
 *    - handleAccessError and handleTrialCreditExhaustion return code PLAN_LIMIT_EXCEEDED, action ADD_PAYMENT_METHOD, setup_url, overage_rate_usd, and verbatim next_action
 * 3. CREDITS_EXHAUSTED:
 *    - returns isError: true (an actionable stop, not data)
 *    - top-up call count and price dynamically sourced from payload (no hardcoded figures)
 * 4. TRIAL_EXHAUSTED:
 *    - returns isError: true, upgrade_url on app.fodda.ai, free Base account framing (not "top up" / not fodda.ai/account/billing)
 * 5. ChatGPT Commerce-Silence Parity:
 *    - All 4 credit codes on ChatGPT session source return clean QUOTA_EXHAUSTED payload
 *    - Zero Stripe URLs, zero dollar amounts, zero "API calls" text, manage_url: https://app.fodda.ai/account
 */

import assert from 'assert';
import { handleAccessError, handleTrialCreditExhaustion, classifyAccessError } from './errorHandling.js';

async function runTests() {
    console.log('--- Running Unified Limit Error & ChatGPT Commerce-Silence Suite ---\n');

    // ── 1. Daily 50-call burst limit ──
    const dailyLimitErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'DAILY_LIMIT_EXCEEDED',
                code: 'DAILY_LIMIT_EXCEEDED',
                message: 'Daily 50-call limit reached on free Base tier. Add a payment card to remove daily burst limits and continue querying without interruption at 50¢ per API call.',
                setupUrl: 'https://app.fodda.ai/api/account/setup-url?email=newuser%40example.com',
                upgradeUrl: 'https://app.fodda.ai/billing',
                overage_rate_usd: 0.50,
                daily_calls_used: 50,
                daily_calls_limit: 50,
                requestId: 'test-burst-1'
            }
        }
    };

    console.log('Test 1: classifyAccessError recognizes DAILY_LIMIT_EXCEEDED as credits');
    assert.strictEqual(classifyAccessError(dailyLimitErr), 'credits');
    console.log('✅ Test 1 Passed\n');

    console.log('Test 2: handleAccessError surfaces SETUP_CARD, setup_url, and verbatim next_action on DAILY_LIMIT_EXCEEDED');
    const accessDailyRes = await handleAccessError(dailyLimitErr, 'search_graph', 'newuser@example.com', 'sk_live_newuser');
    assert.strictEqual(accessDailyRes.isError, true);
    const parsedAccessDaily = JSON.parse(accessDailyRes.content![0]!.text);
    assert.strictEqual(parsedAccessDaily.code, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedAccessDaily.status, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedAccessDaily.action, 'SETUP_CARD');
    assert.strictEqual(parsedAccessDaily.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=newuser%40example.com');
    assert.strictEqual(parsedAccessDaily.upgrade_url, 'https://app.fodda.ai/billing');
    assert.ok(parsedAccessDaily.next_action.includes('https://app.fodda.ai/api/account/setup-url'), 'next_action must contain setup_url');
    assert.ok(parsedAccessDaily.next_action.includes('$0.5 per call') || parsedAccessDaily.next_action.includes('$0.50 per call'), 'next_action must reflect payload overage rate');
    console.log('✅ Test 2 Passed\n');

    console.log('Test 3: handleTrialCreditExhaustion surfaces SETUP_CARD and setup_url on DAILY_LIMIT_EXCEEDED (unified parity)');
    const trialDailyRes = await handleTrialCreditExhaustion(dailyLimitErr, 'sk_live_newuser', 'newuser@example.com');
    assert.ok(trialDailyRes, 'handleTrialCreditExhaustion must return a response');
    assert.strictEqual(trialDailyRes!.isError, true);
    const parsedTrialDaily = JSON.parse(trialDailyRes!.content![0]!.text);
    assert.strictEqual(parsedTrialDaily.code, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialDaily.status, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialDaily.action, 'SETUP_CARD');
    assert.strictEqual(parsedTrialDaily.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=newuser%40example.com');
    console.log('✅ Test 3 Passed\n');

    // ── 2. Monthly plan limit ──
    const monthlyLimitErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'PLAN_LIMIT_EXCEEDED',
                error_code: 'credit_limit',
                message: 'Monthly credit limit reached. Add a payment method, enable pay-as-you-go, or upgrade to continue.',
                requestId: 'test-plan-1',
                top_up_url: 'https://app.fodda.ai',
                overage_rate_usd: 0.50,
                renews_at: '2026-10-29T20:00:00.000Z',
                setupUrl: 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com',
                upgradeUrl: 'https://app.fodda.ai?view=billing',
                usage: { remaining: 0, total: 100, accountStatus: 'active', planCode: '2' },
                agent_checkout: {
                    url: 'https://app.fodda.ai/api/account/checkout/agent-session',
                    api_calls: 200
                }
            }
        }
    };

    console.log('Test 4: handleAccessError returns unified PLAN_LIMIT_EXCEEDED shape');
    const accessPlanRes = await handleAccessError(monthlyLimitErr, 'search_graph', 'baseuser@example.com', 'sk_live_baseuser');
    assert.strictEqual(accessPlanRes.isError, true);
    const parsedAccessPlan = JSON.parse(accessPlanRes.content![0]!.text);
    assert.strictEqual(parsedAccessPlan.code, 'PLAN_LIMIT_EXCEEDED');
    assert.strictEqual(parsedAccessPlan.status, 'PLAN_LIMIT_EXCEEDED');
    assert.strictEqual(parsedAccessPlan.action, 'ADD_PAYMENT_METHOD');
    assert.strictEqual(parsedAccessPlan.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com');
    assert.ok(parsedAccessPlan.next_action.includes('https://app.fodda.ai/api/account/setup-url'), 'next_action must contain setup_url');
    console.log('✅ Test 4 Passed\n');

    console.log('Test 5: handleTrialCreditExhaustion returns unified PLAN_LIMIT_EXCEEDED with ADD_PAYMENT_METHOD');
    const trialPlanRes = await handleTrialCreditExhaustion(monthlyLimitErr, 'sk_live_baseuser', 'baseuser@example.com');
    assert.ok(trialPlanRes, 'handleTrialCreditExhaustion must return a response');
    assert.strictEqual(trialPlanRes!.isError, true);
    const parsedTrialPlan = JSON.parse(trialPlanRes!.content![0]!.text);
    assert.strictEqual(parsedTrialPlan.code, 'PLAN_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialPlan.status, 'PLAN_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialPlan.action, 'ADD_PAYMENT_METHOD');
    assert.strictEqual(parsedTrialPlan.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com');
    console.log('✅ Test 5 Passed\n');

    // ── 3. Top-Up 200 API calls checkout copy (dynamic from payload) ──
    const legacyExhaustionWithPriceErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'CREDITS_EXHAUSTED',
                agent_checkout: {
                    url: 'https://app.fodda.ai/api/account/checkout/agent-session',
                    api_calls: 200,
                    price_usd: 100
                }
            }
        }
    };

    console.log('Test 6A: CREDITS_EXHAUSTED with price_usd returns isError: true and verbatim next_action with price');
    const trialTopupWithPriceRes = await handleTrialCreditExhaustion(legacyExhaustionWithPriceErr, 'sk_live_baseuser', 'baseuser@example.com');
    assert.ok(trialTopupWithPriceRes);
    assert.strictEqual(trialTopupWithPriceRes!.isError, true, 'CREDITS_EXHAUSTED must be isError: true action');
    const parsedTopupWithPrice = JSON.parse(trialTopupWithPriceRes!.content![0]!.text);
    assert.strictEqual(parsedTopupWithPrice.code, 'CREDITS_EXHAUSTED');
    assert.strictEqual(parsedTopupWithPrice.action, 'CHECKOUT_AVAILABLE');
    assert.strictEqual(parsedTopupWithPrice.next_action, 'Top up 200 calls for $100: https://app.fodda.ai/api/account/checkout/agent-session');
    console.log('✅ Test 6A Passed\n');

    const legacyExhaustionNoPriceErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'CREDITS_EXHAUSTED',
                agent_checkout: {
                    url: 'https://app.fodda.ai/api/account/checkout/agent-session',
                    api_calls: 200
                }
            }
        }
    };

    console.log('Test 6B: CREDITS_EXHAUSTED without price_usd formats without invented dollar amount');
    const trialTopupNoPriceRes = await handleTrialCreditExhaustion(legacyExhaustionNoPriceErr, 'sk_live_baseuser', 'baseuser@example.com');
    assert.ok(trialTopupNoPriceRes);
    assert.strictEqual(trialTopupNoPriceRes!.isError, true);
    const parsedTopupNoPrice = JSON.parse(trialTopupNoPriceRes!.content![0]!.text);
    assert.strictEqual(parsedTopupNoPrice.next_action, 'Top up 200 calls: https://app.fodda.ai/api/account/checkout/agent-session');
    console.log('✅ Test 6B Passed\n');

    // ── 4. TRIAL_EXHAUSTED framing ──
    const trialExhaustedErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                isTrial: true,
                error: 'TRIAL_EXHAUSTED'
            }
        }
    };

    console.log('Test 7: TRIAL_EXHAUSTED uses app.fodda.ai and free Base framing');
    const trialExhaustedRes = await handleTrialCreditExhaustion(trialExhaustedErr, 'sk_live_trialuser', 'trial@example.com');
    assert.ok(trialExhaustedRes);
    assert.strictEqual(trialExhaustedRes!.isError, true);
    const parsedTrial = JSON.parse(trialExhaustedRes!.content![0]!.text);
    assert.strictEqual(parsedTrial.code, 'TRIAL_EXHAUSTED');
    assert.strictEqual(parsedTrial.action, 'UPGRADE_REQUIRED');
    assert.ok(parsedTrial.upgrade_url.includes('app.fodda.ai'), 'Must point to app.fodda.ai');
    assert.ok(!parsedTrial.upgrade_url.includes('fodda.ai/account/billing'), 'Must not point to fodda.ai/account/billing');
    assert.ok(!parsedTrial.next_action.includes('top up'), 'Must drop top up framing');
    assert.ok(parsedTrial.next_action.includes('free Base account'), 'Must frame as free Base account');
    console.log('✅ Test 7 Passed\n');

    // ── 5. ChatGPT Commerce-Silence Parity across all 4 limit codes ──
    console.log('Test 8: ChatGPT sessions receive clean QUOTA_EXHAUSTED for all limit codes (handleTrialCreditExhaustion + handleAccessError)');
    const testCases = [
        { name: 'DAILY_LIMIT_EXCEEDED', err: dailyLimitErr },
        { name: 'PLAN_LIMIT_EXCEEDED', err: monthlyLimitErr },
        { name: 'CREDITS_EXHAUSTED', err: legacyExhaustionWithPriceErr },
        { name: 'TRIAL_EXHAUSTED', err: trialExhaustedErr },
    ];

    for (const tc of testCases) {
        // Test handleTrialCreditExhaustion with chatgpt source
        const trialGptRes = await handleTrialCreditExhaustion(tc.err, 'sk_live_123', 'gptuser@example.com', 'chatgpt');
        assert.ok(trialGptRes, `${tc.name}: handleTrialCreditExhaustion must return response for chatgpt`);
        assert.strictEqual(trialGptRes!.isError, true);
        const parsedTrialGpt = JSON.parse(trialGptRes!.content![0]!.text);
        assert.strictEqual(parsedTrialGpt.error, 'QUOTA_EXHAUSTED', `${tc.name}: error must be QUOTA_EXHAUSTED`);
        assert.strictEqual(parsedTrialGpt.manage_url, 'https://app.fodda.ai/account');
        assert.strictEqual(parsedTrialGpt.setup_url, undefined);
        assert.strictEqual(parsedTrialGpt.top_up_url, undefined);
        assert.strictEqual(parsedTrialGpt.overage_rate_usd, undefined);
        assert.ok(!trialGptRes!.content![0]!.text.includes('stripe'), `${tc.name}: must not leak stripe`);
        assert.ok(!trialGptRes!.content![0]!.text.includes('$'), `${tc.name}: must not leak dollar prices`);
        assert.ok(!trialGptRes!.content![0]!.text.includes('API calls'), `${tc.name}: must not leak "API calls" text`);

        // Test handleAccessError with chatgpt source
        const accessGptRes = await handleAccessError(tc.err, 'search_graph', 'gptuser@example.com', 'sk_live_123', 'chatgpt');
        assert.strictEqual(accessGptRes.isError, true);
        const parsedAccessGpt = JSON.parse(accessGptRes.content![0]!.text);
        assert.strictEqual(parsedAccessGpt.error, 'QUOTA_EXHAUSTED', `${tc.name}: access error must be QUOTA_EXHAUSTED`);
        assert.strictEqual(parsedAccessGpt.manage_url, 'https://app.fodda.ai/account');
        assert.ok(!accessGptRes.content![0]!.text.includes('stripe'));
        assert.ok(!accessGptRes.content![0]!.text.includes('$'));
        assert.ok(!accessGptRes.content![0]!.text.includes('API calls'));
    }
    console.log('✅ Test 8 Passed: All 4 credit codes on ChatGPT session return clean QUOTA_EXHAUSTED\n');

    console.log('All Unified Limit Error & ChatGPT Commerce-Silence tests passed successfully!');
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
