/**
 * Fodda MCP Workflow Test — 3 Queries
 * Tests search_graph + search_insights(types=all) on the live deployed server
 * Uses proper MCP session lifecycle (initialize → tool calls)
 */

import axios from 'axios';

const BASE_URL = 'https://mcp.fodda.ai';
const API_KEY = 'sk_live_abcdef';
const USER_ID = 'piers.fawkes@gmail.com';

interface MCPSession {
    sessionId: string;
}

async function initSession(): Promise<MCPSession> {
    const resp = await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        }
    }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
    });
    
    const sessionId = resp.headers['mcp-session-id'];
    console.log(`✅ Session initialized: ${sessionId}`);
    
    // Send initialized notification
    await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    }, {
        headers: { 'Content-Type': 'application/json', 'mcp-session-id': sessionId }
    });
    
    return { sessionId };
}

async function callTool(session: MCPSession, toolName: string, args: any, label: string): Promise<any> {
    console.log(`\n━━━ 🔧 ${label} ━━━`);
    console.log(`    Tool: ${toolName}`);
    
    try {
        const resp = await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: toolName, arguments: args }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'mcp-session-id': session.sessionId
            },
            timeout: 30000
        });

        // Handle SSE response
        const data = resp.data;
        let result: any;
        
        if (typeof data === 'string') {
            // Parse SSE
            const lines = data.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        if (parsed.result) result = parsed.result;
                    } catch {}
                }
            }
        } else if (data.result) {
            result = data.result;
        }

        if (!result) {
            console.log(`    ⚠️  No result in response`);
            return null;
        }

        // Parse content
        for (const content of result.content || []) {
            if (content.type === 'text') {
                const parsed = JSON.parse(content.text);
                
                if (parsed.error) {
                    console.log(`    ❌ Error: ${parsed.error}`);
                    return parsed;
                }
                
                if (parsed.note) {
                    console.log(`    ⏭️  ${parsed.note}`);
                    return parsed;
                }

                // Trends from search_graph
                if (parsed.trends) {
                    console.log(`    ✅ Found ${parsed.trends.length} trends`);
                    for (const t of parsed.trends.slice(0, 5)) {
                        const name = t.name || t.trend_name || 'unnamed';
                        const score = (t.relevance_score || t.semantic_score || 0).toFixed(2);
                        const ev = t.evidence_count || 0;
                        const graphId = t._use_this_graphId || t.graphId || '?';
                        console.log(`       • [${graphId}] ${name} (score: ${score}, evidence: ${ev})`);
                    }
                    return parsed;
                }

                // Statistics/insights
                if (parsed.statistics) {
                    console.log(`    ✅ Found ${parsed.statistics.length} evidence items`);
                    for (const s of parsed.statistics.slice(0, 8)) {
                        const etype = s.type || s.evidenceType || '?';
                        const snippet = (s.value || s.snippet || s.text || s.title || '').slice(0, 100);
                        console.log(`       • [${etype}] ${snippet}`);
                    }
                    return parsed;
                }

                // Evidence articles
                if (parsed.evidence) {
                    console.log(`    ✅ Found ${parsed.evidence.length} evidence articles`);
                    for (const e of parsed.evidence.slice(0, 5)) {
                        const title = (e.title || e.headline || 'untitled').slice(0, 80);
                        const ct = e.contentType || 'article';
                        console.log(`       • [${ct}] ${title}`);
                    }
                    return parsed;
                }

                // Generic
                const keys = Object.keys(parsed).slice(0, 5);
                console.log(`    ✅ Response keys: ${keys.join(', ')}`);
                return parsed;
            }
        }
    } catch (err: any) {
        console.log(`    ❌ ${err.response?.data?.error?.message || err.message}`);
        return null;
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  FODDA MCP WORKFLOW TEST — 3 QUERIES                ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    
    const session = await initSession();

    // ─── Query 1: customer service escalation from AI to human agent ───
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📌 QUERY 1: customer service escalation from AI to human agent');
    console.log('═══════════════════════════════════════════════════════');

    await callTool(session, 'search_graph', {
        graphId: 'retail', query: 'customer service escalation from AI to human agent', userId: USER_ID
    }, 'Step 1 — search_graph (retail)');

    await callTool(session, 'search_insights', {
        graph_id: 'retail', query: 'customer service AI escalation human agent', types: 'all', min_score: 0.60, userId: USER_ID
    }, 'Step 2.5 — search_insights(types=all)');

    // ─── Query 2: AI Reputation Trust ───
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📌 QUERY 2: AI Reputation Trust');
    console.log('═══════════════════════════════════════════════════════');

    await callTool(session, 'search_graph', {
        graphId: 'retail', query: 'AI reputation trust', userId: USER_ID
    }, 'Step 1 — search_graph (retail)');

    await callTool(session, 'search_graph', {
        graphId: 'sic', query: 'AI reputation trust brand perception', userId: USER_ID
    }, 'Step 1b — search_graph (SIC)');

    await callTool(session, 'search_insights', {
        graph_id: 'retail', query: 'AI trust reputation brand perception', types: 'all', min_score: 0.60, userId: USER_ID
    }, 'Step 2.5 — search_insights(types=all)');

    // ─── Query 3: touch haptic physical body sensation ───
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📌 QUERY 3: touch haptic physical body sensation');
    console.log('═══════════════════════════════════════════════════════');

    await callTool(session, 'search_graph', {
        graphId: 'ce-design', query: 'touch haptic physical body sensation', userId: USER_ID
    }, 'Step 1 — search_graph (ce-design)');

    await callTool(session, 'search_graph', {
        graphId: 'retail', query: 'haptic touch physical sensation retail experience', userId: USER_ID
    }, 'Step 1b — search_graph (retail)');

    await callTool(session, 'search_insights', {
        graph_id: 'ce-design', query: 'haptic touch physical sensation body', types: 'all', min_score: 0.60, userId: USER_ID
    }, 'Step 2.5 — search_insights(types=all)');

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  TEST COMPLETE                                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
