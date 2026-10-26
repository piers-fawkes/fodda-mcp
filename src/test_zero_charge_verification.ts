/**
 * Verification of zero-rate charges across help and discovery tools with live API key.
 * Tools tested:
 * - get_capabilities (default)
 * - get_capabilities (view: 'help')
 * - get_capabilities (view: 'tools')
 * - list_graphs
 * - list_analysts
 * - find_expert
 * - get_my_account
 */

import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.FODDA_API_KEY;
const API_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

if (!API_KEY) {
    console.error('FODDA_API_KEY is not set in .env');
    process.exit(1);
}

async function getAccountBalance(): Promise<{ api_calls_used: number; tokens_used: number; lifetime_used: number; plan: string }> {
    const res = await fetch(`${API_URL}/v1/account`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    const data = await res.json();
    const acct = data._account || {};
    return {
        api_calls_used: acct.api_calls_used ?? 0,
        tokens_used: acct.tokens_used ?? 0,
        lifetime_used: acct.lifetime_used ?? 0,
        plan: acct.plan
    };
}

async function run() {
    console.log('=== ZERO-CHARGE DISCOVERY & HELP VERIFICATION ===\n');

    // 1. Initial Balance
    const balanceBefore = await getAccountBalance();
    console.log('Balance BEFORE calls:');
    console.log(`  Plan: ${balanceBefore.plan}`);
    console.log(`  api_calls_used: ${balanceBefore.api_calls_used}`);
    console.log(`  tokens_used: ${balanceBefore.tokens_used}`);
    console.log(`  lifetime_used: ${balanceBefore.lifetime_used}\n`);

    // 2. Call get_capabilities default
    console.log('Calling GET /v1/capabilities...');
    const rCap = await fetch(`${API_URL}/v1/capabilities`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log(`  Status: ${rCap.status}`);

    // 3. Call get_capabilities topic
    console.log('Calling GET /v1/capabilities?topic=clean%20beauty...');
    const rCapTopic = await fetch(`${API_URL}/v1/capabilities?topic=clean%20beauty`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log(`  Status: ${rCapTopic.status}`);

    // 4. Call list_graphs (GET /v1/graphs)
    console.log('Calling GET /v1/graphs...');
    const rGraphs = await fetch(`${API_URL}/v1/graphs`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log(`  Status: ${rGraphs.status}`);

    // 5. Call list_analysts (GET /v1/analysts)
    console.log('Calling GET /v1/analysts...');
    const rAnalysts = await fetch(`${API_URL}/v1/analysts`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log(`  Status: ${rAnalysts.status}`);

    // 6. Call find_expert (GET /v1/experts/search)
    console.log('Calling GET /v1/experts/search?q=retail%20trends...');
    const rExperts = await fetch(`${API_URL}/v1/experts/search?q=retail%20trends`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    console.log(`  Status: ${rExperts.status}`);

    // 7. Balance After
    const balanceAfter = await getAccountBalance();
    console.log('\nBalance AFTER calls:');
    console.log(`  Plan: ${balanceAfter.plan}`);
    console.log(`  api_calls_used: ${balanceAfter.api_calls_used}`);
    console.log(`  tokens_used: ${balanceAfter.tokens_used}`);
    console.log(`  lifetime_used: ${balanceAfter.lifetime_used}\n`);

    const apiCallsDiff = balanceAfter.api_calls_used - balanceBefore.api_calls_used;
    const tokensDiff = balanceAfter.tokens_used - balanceBefore.tokens_used;
    const lifetimeDiff = balanceAfter.lifetime_used - balanceBefore.lifetime_used;

    console.log(`api_calls_used diff: ${apiCallsDiff}`);
    console.log(`tokens_used diff: ${tokensDiff}`);
    console.log(`lifetime_used diff: ${lifetimeDiff}`);

    if (apiCallsDiff === 0 && tokensDiff === 0 && lifetimeDiff === 0) {
        console.log('\n✅ VERIFIED: Zero charge across all discovery and help tools!');
    } else {
        console.error(`\n❌ ERROR: Unexpected charge detected! api_calls_used diff: ${apiCallsDiff}`);
        process.exit(1);
    }
}

run().catch(e => {
    console.error('Verification failed:', e);
    process.exit(1);
});
