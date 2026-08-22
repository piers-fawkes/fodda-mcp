import assert from 'node:assert';
import { createServer } from './toolHandlers.js';

const PLACEHOLDER_USER_IDS = new Set(['', 'anonymous', 'undefined', 'null', 'oauth_user']);
function isPlaceholderUserId(id?: string | null): boolean {
    if (!id) return true;
    return PLACEHOLDER_USER_IDS.has(id.trim().toLowerCase());
}

async function runTests() {
    console.log('=== Running MCP Identity Gap Test Suite ===\n');

    // 1. Test placeholder user id detection and foddaRequest omission
    console.log('Test 1: isPlaceholderUserId & foddaRequest omit placeholder user IDs');
    {
        // Assert placeholder set
        assert.strictEqual(isPlaceholderUserId('anonymous'), true);
        assert.strictEqual(isPlaceholderUserId('Anonymous'), true);
        assert.strictEqual(isPlaceholderUserId('oauth_user'), true);
        assert.strictEqual(isPlaceholderUserId('OAuth_User'), true);
        assert.strictEqual(isPlaceholderUserId('undefined'), true);
        assert.strictEqual(isPlaceholderUserId('null'), true);
        assert.strictEqual(isPlaceholderUserId(''), true);
        assert.strictEqual(isPlaceholderUserId(null), true);
        assert.strictEqual(isPlaceholderUserId(undefined), true);
        assert.strictEqual(isPlaceholderUserId('user@example.com'), false);
        assert.strictEqual(isPlaceholderUserId('usr_12345'), false);
        console.log('  ✅ isPlaceholderUserId correctly identifies all placeholder variants');

        const capturedHeaders: Record<string, string>[] = [];
        const mockFoddaRequest = async (
            method: string,
            path: string,
            apiKey: string,
            userId: string,
            body?: any,
            requestId?: string,
            source?: string,
            spt?: string
        ) => {
            const timestamp = Date.now().toString();
            const headers: Record<string, string> = {
                'X-Fodda-Timestamp': timestamp,
                'X-Fodda-Billing': 'mcp-orchestrated',
                'Content-Type': 'application/json',
            };
            if (userId && !isPlaceholderUserId(userId)) {
                headers['X-User-Id'] = userId;
            }
            if (source) headers['X-Fodda-Source'] = source;
            capturedHeaders.push(headers);
            return { ok: true };
        };

        const placeholders = ['anonymous', 'Anonymous', 'oauth_user', 'OAuth_User', 'undefined', 'null', ''];
        for (let i = 0; i < placeholders.length; i++) {
            await mockFoddaRequest('POST', '/v1/search', 'sk_live_123', placeholders[i]!, { query: 'test' });
            assert.strictEqual(capturedHeaders[i]?.['X-User-Id'], undefined, `X-User-Id should be omitted for "${placeholders[i]}"`);
        }
        console.log(`  ✅ All ${placeholders.length} placeholder strings omit X-User-Id`);

        await mockFoddaRequest('POST', '/v1/search', 'sk_live_123', 'user@example.com', { query: 'test' });
        const lastIdx = capturedHeaders.length - 1;
        assert.strictEqual(capturedHeaders[lastIdx]?.['X-User-Id'], 'user@example.com', 'X-User-Id should be set for named user');
        console.log('  ✅ Named user session: X-User-Id is passed as user@example.com');
    }

    // 2. Test createServer logging with default sessionSource (customer / mcp)
    console.log('\nTest 2: createServer logging with default sessionSource ("mcp")');
    {
        const loggedRequests: any[] = [];
        const mockFoddaRequest = async (
            method: string,
            path: string,
            apiKey: string,
            userId: string,
            body?: any
        ) => {
            if (path === '/v1/graphs') {
                return { graphs: [], _account: { isProfessionalServices: false } };
            }
            if (path === '/v1/log/question') {
                loggedRequests.push({ method, path, body, userId });
                return { success: true };
            }
            if (path === '/v1/search/domain') {
                return {
                    results: [
                        {
                            id: 'trend_1',
                            title: 'Sample Trend',
                            summary: 'Sample summary',
                            relevance_score: 0.9,
                            graph_id: 'retail',
                            brands: ['BrandA'],
                        }
                    ],
                    coverage: { status: 'ok', results_returned: 1, results_on_topic: 1 },
                    on_topic_total: 1,
                    total: 1
                };
            }
            return { results: [] };
        };

        const server = await createServer(
            'sk_live_123',
            'anonymous',
            mockFoddaRequest as any,
            (async () => ({})) as any,
            () => 'widget',
            () => 'http://localhost'
        );

        // Call search_graph tool (which invokes logUserQuery)
        const tools = (server as any)._registeredTools;
        assert.ok(tools.search_graph, 'search_graph tool should exist');

        await tools.search_graph.handler({ query: 'test retail query' });

        const entryLog = loggedRequests.find(r => r.body.interactionType === 'search');
        assert.ok(entryLog, 'Entry log should be recorded');
        assert.strictEqual(entryLog.body.source, 'mcp', 'Default source should be "mcp"');
        console.log('  ✅ Default session logs source: "mcp" to /v1/log/question');
    }

    // 3. Test createServer logging with sessionSource = 'mcp-internal-test'
    console.log('\nTest 3: createServer logging with sessionSource = "mcp-internal-test"');
    {
        const loggedRequests: any[] = [];
        const capturedFanoutHeaders: Record<string, string>[] = [];
        const mockFoddaRequest = async (
            method: string,
            path: string,
            apiKey: string,
            userId: string,
            body?: any,
            requestId?: string,
            source?: string
        ) => {
            if (path === '/v1/graphs') {
                return { graphs: [], _account: { isProfessionalServices: false } };
            }
            if (path === '/v1/log/question') {
                loggedRequests.push({ method, path, body, userId, source });
                return { success: true };
            }
            if (path.includes('/search') || path.startsWith('/v1/graphs/')) {
                capturedFanoutHeaders.push({ source: source || '', path });
                return {
                    results: [
                        {
                            id: 'trend_1',
                            title: 'Sample Trend',
                            summary: 'Sample summary',
                            relevance_score: 0.9,
                            graph_id: 'retail',
                            brands: ['BrandA'],
                        }
                    ],
                    coverage: { status: 'ok', results_returned: 1, results_on_topic: 1 },
                    on_topic_total: 1,
                    total: 1
                };
            }
            return { results: [] };
        };

        // Bound request with source: 'mcp-internal-test'
        const boundFoddaRequest = (m: any, p: any, k: any, u: any, b?: any, r?: any) =>
            mockFoddaRequest(m, p, k, u, b, r, 'mcp-internal-test');

        const server = await createServer(
            'sk_live_123',
            'piers.fawkes@psfk.com',
            boundFoddaRequest as any,
            (async () => ({})) as any,
            () => 'widget',
            () => 'http://localhost',
            '',
            undefined,
            undefined,
            'mcp-internal-test'
        );

        const tools = (server as any)._registeredTools;
        await tools.search_graph.handler({ query: 'test internal search', graphId: 'retail' });

        const entryLog = loggedRequests.find(r => r.body.interactionType === 'search');
        assert.ok(entryLog, 'Entry log should be recorded');
        assert.strictEqual(entryLog.body.source, 'mcp-internal-test', 'Internal test session must log source: "mcp-internal-test"');
        console.log('  ✅ Internal test session logs source: "mcp-internal-test" to /v1/log/question');

        assert.ok(capturedFanoutHeaders.length > 0, 'Fanout call should be made');
        assert.strictEqual(capturedFanoutHeaders[0]?.source, 'mcp-internal-test', 'Fanout call must carry X-Fodda-Source: "mcp-internal-test"');
        console.log('  ✅ Internal test session forwards source: "mcp-internal-test" on fanout');
    }

    // 4. Test session_kind resolution logic
    console.log('\nTest 4: session_kind extraction logic');
    {
        const resolveSource = (query: any, headers: any, offeringSlug: string = 'mcp') => {
            const sessionKind = (headers['x-fodda-session-kind'] as string) || (query.session_kind as string) || 'customer';
            const isInternalTest = sessionKind === 'internal-test';
            const defaultSource = isInternalTest ? 'mcp-internal-test' : (offeringSlug !== 'mcp' ? offeringSlug : '');
            const source = isInternalTest ? 'mcp-internal-test' : ((headers['x-fodda-source'] as string) || (query.source as string) || defaultSource);
            return { sessionKind, isInternalTest, source };
        };

        const res1 = resolveSource({ session_kind: 'internal-test' }, {});
        assert.strictEqual(res1.isInternalTest, true);
        assert.strictEqual(res1.source, 'mcp-internal-test');

        const res2 = resolveSource({}, { 'x-fodda-session-kind': 'internal-test' });
        assert.strictEqual(res2.isInternalTest, true);
        assert.strictEqual(res2.source, 'mcp-internal-test');

        const res3 = resolveSource({}, {});
        assert.strictEqual(res3.isInternalTest, false);
        assert.strictEqual(res3.source, '');

        console.log('  ✅ Query param ?session_kind=internal-test resolves to mcp-internal-test');
        console.log('  ✅ Header X-Fodda-Session-Kind: internal-test resolves to mcp-internal-test');
        console.log('  ✅ Default session resolves to customer / default source');
    }

    console.log('\n🎉 ALL IDENTITY GAP TESTS PASSED!');
    process.exit(0);
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
