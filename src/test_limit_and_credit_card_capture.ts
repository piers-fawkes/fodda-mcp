/**
 * Test: Daily Burst Limit & Monthly Plan Limit Handling with Credit Card Capture
 *
 * Verifies:
 * 1. DAILY_LIMIT_EXCEEDED (50 calls/day on free Base tier without card):
 *    - classifyAccessError classifies as 'credits'
 *    - handleAccessError returns status DAILY_LIMIT_EXCEEDED, action SETUP_CARD, and setup_url
 *    - handleTrialCreditExhaustion returns status DAILY_LIMIT_EXCEEDED, action SETUP_CARD, and setup_url
 * 2. PLAN_LIMIT_EXCEEDED (100 calls/mo on free Base tier without card):
 *    - classifyAccessError classifies as 'credits'
 *    - handleAccessError includes setup_url alongside top_up_url for one-click card capture
 *    - handleTrialCreditExhaustion robustly handles string error 'PLAN_LIMIT_EXCEEDED' and returns action ADD_PAYMENT_METHOD with setup_url
 */

import assert from 'assert';
import { handleAccessError, handleTrialCreditExhaustion, classifyAccessError } from './errorHandling.js';

async function runTests() {
    console.log('--- Running Credit Card Capture & Limit Enforcement Suite ---\n');

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
                daily_calls_used: 50,
                daily_calls_limit: 50,
                requestId: 'test-burst-1'
            }
        }
    };

    console.log('Test 1: classifyAccessError recognizes DAILY_LIMIT_EXCEEDED as credits');
    assert.strictEqual(classifyAccessError(dailyLimitErr), 'credits');
    console.log('✅ Test 1 Passed\n');

    console.log('Test 2: handleAccessError surfaces SETUP_CARD and setup_url on DAILY_LIMIT_EXCEEDED');
    const accessDailyRes = await handleAccessError(dailyLimitErr, 'search_graph', 'newuser@example.com', 'sk_live_newuser');
    const parsedAccessDaily = JSON.parse(accessDailyRes.content![0]!.text);
    assert.strictEqual(parsedAccessDaily.status, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedAccessDaily.action, 'SETUP_CARD');
    assert.strictEqual(parsedAccessDaily.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=newuser%40example.com');
    assert.strictEqual(parsedAccessDaily.upgrade_url, 'https://app.fodda.ai/billing');
    console.log('✅ Test 2 Passed\n');

    console.log('Test 3: handleTrialCreditExhaustion surfaces SETUP_CARD and setup_url on DAILY_LIMIT_EXCEEDED (unified parity with handleAccessError)');
    const trialDailyRes = await handleTrialCreditExhaustion(dailyLimitErr, 'sk_live_newuser', 'newuser@example.com');
    assert.ok(trialDailyRes, 'handleTrialCreditExhaustion must return a response');
    const parsedTrialDaily = JSON.parse(trialDailyRes!.content![0]!.text);
    assert.strictEqual(parsedTrialDaily.status, 'DAILY_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialDaily.action, 'SETUP_CARD');
    assert.strictEqual(parsedTrialDaily.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=newuser%40example.com');
    console.log('✅ Test 3 Passed\n');

    // ── 2. Monthly 100-call plan limit ──
    const monthlyLimitErr = {
        response: {
            status: 403,
            data: {
                ok: false,
                error: 'PLAN_LIMIT_EXCEEDED',
                error_code: 'credit_limit',
                message: 'Monthly credit limit reached. Add a payment method, enable pay-as-you-go, or upgrade to continue — see the structured fields for options.',
                requestId: 'test-plan-1',
                top_up_url: 'https://app.fodda.ai',
                overage_rate_usd: 0.50,
                renews_at: '2026-10-29T20:00:00.000Z',
                setupUrl: 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com',
                upgradeUrl: 'https://app.fodda.ai?view=billing',
                usage: { remaining: 0, total: 100, accountStatus: 'active', planCode: '2' },
                agent_checkout: {
                    url: 'https://app.fodda.ai/api/account/checkout/agent-session',
                    api_calls: 100
                }
            }
        }
    };

    console.log('Test 4: handleAccessError includes setup_url on PLAN_LIMIT_EXCEEDED');
    const accessPlanRes = await handleAccessError(monthlyLimitErr, 'search_graph', 'baseuser@example.com', 'sk_live_baseuser');
    const parsedAccessPlan = JSON.parse(accessPlanRes.content![0]!.text);
    assert.strictEqual(parsedAccessPlan.status, 'CREDITS_EXHAUSTED');
    assert.strictEqual(parsedAccessPlan.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com');
    assert.ok(parsedAccessPlan.top_up_url, 'top_up_url must be present');
    console.log('✅ Test 4 Passed\n');

    console.log('Test 5: handleTrialCreditExhaustion parses string error PLAN_LIMIT_EXCEEDED and returns ADD_PAYMENT_METHOD with setup_url');
    const trialPlanRes = await handleTrialCreditExhaustion(monthlyLimitErr, 'sk_live_baseuser', 'baseuser@example.com');
    assert.ok(trialPlanRes, 'handleTrialCreditExhaustion must return a response');
    const parsedTrialPlan = JSON.parse(trialPlanRes!.content![0]!.text);
    assert.strictEqual(parsedTrialPlan.status, 'PLAN_LIMIT_EXCEEDED');
    assert.strictEqual(parsedTrialPlan.action, 'ADD_PAYMENT_METHOD');
    assert.strictEqual(parsedTrialPlan.setup_url, 'https://app.fodda.ai/api/account/setup-url?email=baseuser%40example.com');
    console.log('✅ Test 5 Passed\n');

    console.log('All 5 Credit Card capture & limit enforcement tests passed successfully!');
}

runTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
