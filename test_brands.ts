import axios from 'axios';

const BASE_URL = 'https://fodda-mcp-7mopqjzhwq-uk.a.run.app';
const API_KEY = 'sk_live_abcdef';
const USER_ID = 'test-run';

async function initSession() {
    const resp = await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0' } }
    }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' } });
    const sessionId = resp.headers['mcp-session-id'];
    await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, { jsonrpc: '2.0', method: 'notifications/initialized' }, { headers: { 'Content-Type': 'application/json', 'mcp-session-id': sessionId } });
    return sessionId;
}

async function callTool(sessionId: string, toolName: string, args: any) {
    console.log(`\n============== Testing ${toolName} with ${JSON.stringify(args)} ==============`);
    const resp = await axios.post(`${BASE_URL}/mcp?api_key=${API_KEY}`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
    }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': sessionId } });
    
    let result: any;
    if (typeof resp.data === 'string') {
        const lines = resp.data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const parsed = JSON.parse(line.slice(6));
                    if (parsed.result) result = parsed.result;
                } catch {}
            }
        }
    } else if (resp.data.result) {
        result = resp.data.result;
    }

    if (!result) return console.log('❌ No result found');
    for (const content of result.content || []) {
        if (content.type === 'text') {
            console.log(content.text.substring(0, 500) + (content.text.length > 500 ? '...\n[Truncated]' : ''));
        }
    }
}

async function main() {
    const session = await initSession();
    await callTool(session, 'brand_tracker', { brand_name: 'BMW' });
    await callTool(session, 'brand_tracker', { brand_name: 'Porsche' });
    console.log('\n--- Now testing Waverunner orchestrator ---');
    await callTool(session, 'deep_research_topic', { query: 'BMW vs Porsche' });
}
main().catch(console.error);
