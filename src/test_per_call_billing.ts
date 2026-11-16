/**
 * Unit Test: Per-Completed-Call Billing for Brand Intelligence & Connections Plan
 *
 * Verifies:
 * 1. API returns usage.completed_calls: 7 → meter body has billable_units: 7 for generate_comms_plan.
 * 2. Brand Intelligence with API completed_calls: 5, Amazon OK and Census failing → billable_units: 6.
 * 3. completed_calls: 0 → no meter call (zero means free).
 * 4. SPT sessions: variable billable_units passes through to meter call; 0 completed calls results in no meter call.
 */

import 'dotenv/config';
import { createServer } from './toolHandlers.js';
import { chargeQuery } from './pricingCache.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

async function runTests() {
    console.log('=== Running MCP Per-Completed-Call Billing Tests ===\n');

    // Test 1: Connections Plan with usage.completed_calls: 7
    console.log('Test 1: generate_comms_plan with usage.completed_calls: 7');
    {
        const meterCalls: any[] = [];
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path === '/v1/graphs') return [];
            if (path === '/v1/planning/comms-plan') {
                return {
                    view: 'full_plan',
                    output_classification: 'STRATEGIC CONNECTIONS PLAN',
                    markdown: '# Test Plan',
                    usage: {
                        completed_calls: 7,
                        total_billable_units: 7
                    }
                };
            }
            if (path === '/v1/research/meter') {
                meterCalls.push({ method, path, body });
                return { ok: true, usage: { remaining: 100 } };
            }
            return {};
        };

        const server = await createServer(
            'sk_test_key',
            'test_user',
            mockFoddaRequest as any,
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const handler = (server as any)._registeredTools['generate_comms_plan']?.handler;
        assert(typeof handler === 'function', 'generate_comms_plan handler exists');

        const result = await handler({
            query: 'Running shoes for marathons',
            brand: 'Nike',
            view: 'full_plan'
        });

        assert(!result.isError, 'generate_comms_plan executed successfully');
        // Give fire-and-forget chargeQuery a tick
        await new Promise(r => setTimeout(r, 50));

        assert(meterCalls.length === 1, `Expected 1 meter call, got ${meterCalls.length}`);
        assert(meterCalls[0]?.body?.billable_units === 7, `Expected billable_units: 7, got ${meterCalls[0]?.body?.billable_units}`);
        assert(meterCalls[0]?.body?.type === 'planning', `Expected type: planning, got ${meterCalls[0]?.body?.type}`);
    }

    // Test 2: Brand Intelligence with API completed_calls: 5, Amazon OK, Census failing → 6 calls
    console.log('\nTest 2: brand_tracker with API completed_calls: 5, Amazon OK, Census failing → billable_units: 6');
    {
        const meterCalls: any[] = [];
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path === '/v1/graphs') return [];
            if (path.startsWith('/v1/brand-intelligence/')) {
                return {
                    ok: true,
                    trend_footprint: [
                        {
                            trendName: 'Nike Sustainable Innovation',
                            trendDescription: 'Nike is leading sustainable footwear',
                            graphId: 'psfk-retail-trends',
                            signalScore: 85,
                            evidenceCount: 1,
                            evidence: [
                                {
                                    title: 'Nike Move to Zero',
                                    summary: 'Nike moves toward zero carbon',
                                    brandNames: 'Nike',
                                    sourceUrl: 'https://nike.com'
                                }
                            ]
                        }
                    ],
                    cross_graph_presence: [],
                    usage: {
                        completed_calls: 5
                    }
                };
            }
            if (path.startsWith('/v1/supplemental/amazon')) {
                // Succeeded without error
                return {
                    product_count: 5,
                    products: [{ title: 'Nike Air Max' }]
                };
            }
            if (path.startsWith('/v1/supplemental/census')) {
                // Failed with structured error
                return {
                    error: true,
                    message: 'Census API upstream unavailable'
                };
            }
            if (path.startsWith('/v1/supplemental/google-trends') ||
                path.startsWith('/v1/supplemental/wikipedia') ||
                path.startsWith('/v1/supplemental/earnings')) {
                return {};
            }
            if (path === '/v1/research/meter') {
                meterCalls.push({ method, path, body });
                return { ok: true, usage: { remaining: 100 } };
            }
            return {};
        };

        const server = await createServer(
            'sk_test_key',
            'test_user',
            mockFoddaRequest as any,
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const handler = (server as any)._registeredTools['brand_tracker']?.handler;
        assert(typeof handler === 'function', 'brand_tracker handler exists');

        const result = await handler({
            brand_name: 'Nike',
            format: 'data_only'
        });

        assert(!result.isError, 'brand_tracker executed successfully');
        await new Promise(r => setTimeout(r, 50));

        assert(meterCalls.length === 1, `Expected 1 meter call, got ${meterCalls.length}`);
        assert(meterCalls[0]?.body?.billable_units === 6, `Expected billable_units: 6 (5 API + 1 Amazon - 0 Census), got ${meterCalls[0]?.body?.billable_units}`);
        assert(meterCalls[0]?.body?.type === 'brand_intelligence', `Expected type: brand_intelligence, got ${meterCalls[0]?.body?.type}`);
    }

    // Test 3: completed_calls: 0 → no meter call (zero means free)
    console.log('\nTest 3: completed_calls: 0 → no meter call');
    {
        const meterCalls: any[] = [];
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path === '/v1/graphs') return [];
            if (path === '/v1/planning/comms-plan') {
                return {
                    view: 'full_plan',
                    output_classification: 'STRATEGIC CONNECTIONS PLAN',
                    markdown: '# Test Plan',
                    usage: {
                        completed_calls: 0,
                        total_billable_units: 0
                    }
                };
            }
            if (path === '/v1/research/meter') {
                meterCalls.push({ method, path, body });
                return { ok: true };
            }
            return {};
        };

        const server = await createServer(
            'sk_test_key',
            'test_user',
            mockFoddaRequest as any,
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai'
        );

        const handler = (server as any)._registeredTools['generate_comms_plan']?.handler;
        const result = await handler({
            query: 'Zero calls test',
            brand: 'TestBrand',
            view: 'full_plan'
        });

        assert(!result.isError, 'generate_comms_plan returned successfully');
        await new Promise(r => setTimeout(r, 50));

        assert(meterCalls.length === 0, `Expected 0 meter calls for 0 completed calls, got ${meterCalls.length}`);
    }

    // Test 4: SPT session with completed_calls: 0 does not withhold result
    console.log('\nTest 4: SPT session with completed_calls: 0 does not withhold result');
    {
        const meterCalls: any[] = [];
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            if (path === '/v1/graphs') return [];
            if (path === '/v1/planning/comms-plan') {
                return {
                    view: 'full_plan',
                    output_classification: 'STRATEGIC CONNECTIONS PLAN',
                    markdown: '# Test Plan Free',
                    usage: {
                        completed_calls: 0
                    }
                };
            }
            if (path === '/v1/research/meter') {
                meterCalls.push({ method, path, body });
                return { ok: true };
            }
            return {};
        };

        const server = await createServer(
            '',
            'spt_user',
            mockFoddaRequest as any,
            async () => ({}),
            () => '',
            () => 'https://mcp.fodda.ai',
            '',
            {
                token: 'spt_test_token',
                maxAmountCents: 500,
                prices: { planning: 4.00, brand_intelligence: 2.00 }
            }
        );

        const handler = (server as any)._registeredTools['generate_comms_plan']?.handler;
        const result = await handler({
            query: 'SPT Zero calls test',
            brand: 'TestBrand',
            view: 'full_plan'
        });

        assert(!result.isError, 'SPT session does not withhold free result (0 calls)');
        assert(meterCalls.length === 0, `Expected 0 meter calls for SPT 0 completed calls, got ${meterCalls.length}`);
    }

    // Test 5: chargeQuery unit override verification
    console.log('\nTest 5: chargeQuery direct unit tests');
    {
        const directMeterCalls: any[] = [];
        const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body?: any) => {
            directMeterCalls.push({ method, path, body });
            return { ok: true, usage: { remaining: 50 } };
        };

        // Override > 0
        const r1 = await chargeQuery({
            queryTypeCode: 'planning',
            apiKey: 'key',
            userId: 'user',
            billableUnitsOverride: 3,
            foddaRequest: mockFoddaRequest as any
        });
        assert(r1.charged === true, 'r1 charged is true');
        assert(r1.apiCallsCharged === 3, 'r1 apiCallsCharged is 3');
        assert(directMeterCalls[0]?.body?.billable_units === 3, 'direct meter body has billable_units: 3');

        // Override <= 0
        const r2 = await chargeQuery({
            queryTypeCode: 'planning',
            apiKey: 'key',
            userId: 'user',
            billableUnitsOverride: 0,
            foddaRequest: mockFoddaRequest as any
        });
        assert(r2.charged === false, 'r2 charged is false for 0 units');
        assert(r2.apiCallsCharged === 0, 'r2 apiCallsCharged is 0');
        assert(directMeterCalls.length === 1, 'no second meter call fired for 0 units');
    }

    console.log(`\nPer-Call Billing Tests: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
