import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://mcp.fodda.ai/mcp';
const SECRET = process.env.FODDA_MCP_SECRET;

if (!SECRET) {
    console.error('Missing FODDA_MCP_SECRET');
    process.exit(1);
}

function getHmacHeaders(body: any, sessionId?: string) {
    const timestamp = Date.now().toString();
    const payload = timestamp + '.' + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', SECRET!).update(payload).digest('hex');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Signature': signature,
        'X-Fodda-Session-Kind': 'internal-test',
        'Accept': 'application/json, text/event-stream'
    };
    if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
    }
    return headers;
}

function parseSseOrJson(data: any): any {
    if (typeof data === 'object') return data;
    const str = String(data);
    const lines = str.split('\n');
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            try {
                return JSON.parse(line.slice(6));
            } catch (e) {
                // continue
            }
        }
    }
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

async function main() {
    console.log('--- 1. Initializing MCP Session ---');
    const initBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'antigravity-live-verifier', version: '1.0.0' }
        }
    };
    const initRes = await axios.post(BASE_URL, initBody, {
        headers: getHmacHeaders(initBody)
    });
    const sessionId = initRes.headers['mcp-session-id'];
    console.log('Session ID:', sessionId);
    console.log('Server version in init:', parseSseOrJson(initRes.data)?.result?.serverInfo?.version);

    // Call initialized notification
    const notifBody = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    };
    await axios.post(BASE_URL, notifBody, {
        headers: getHmacHeaders(notifBody, sessionId)
    });
    console.log('Initialized notification sent.');

    // ── 2. Live call: get_evidence ──
    console.log('\n--- 2. Live Call: get_evidence (view: "both") on delta-the-connection-index node 2507.0 ---');
    const getEvidenceBody = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
            name: 'get_evidence',
            arguments: {
                graphId: 'delta-the-connection-index',
                for_node_id: '2507.0',
                view: 'both'
            }
        }
    };
    const evidenceRes = await axios.post(BASE_URL, getEvidenceBody, {
        headers: getHmacHeaders(getEvidenceBody, sessionId)
    });
    const evidenceParsed = parseSseOrJson(evidenceRes.data);
    const evidenceContent = evidenceParsed?.result?.content?.[0]?.text;
    console.log('get_evidence parsed keys/structure:');
    try {
        const parsedJson = JSON.parse(evidenceContent);
        console.log('Keys in parsed evidence:', Object.keys(parsedJson));
        console.log('Evidence count:', parsedJson.evidence?.length ?? 0);
        console.log('Voices count:', parsedJson.voices?.length ?? 0);
        console.log('Voices sample:', JSON.stringify(parsedJson.voices, null, 2));
    } catch {
        console.log(evidenceContent?.slice(0, 1000));
    }

    // ── 3. Live call: search_insights ──
    console.log('\n--- 3. Live Call: search_insights ---');
    const searchInsightsBody = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'search_insights',
            arguments: {
                query: 'retail trends'
            }
        }
    };
    const insightsRes = await axios.post(BASE_URL, searchInsightsBody, {
        headers: getHmacHeaders(searchInsightsBody, sessionId)
    });
    const insightsParsed = parseSseOrJson(insightsRes.data);
    const insightsContent = insightsParsed?.result?.content?.[0]?.text;
    try {
        const parsedJson = JSON.parse(insightsContent);
        console.log('search_insights statistics count:', parsedJson.statistics?.length ?? 0);
        const sampleWithVoice = parsedJson.statistics?.find((s: any) => s.voice);
        console.log('Sample statistic with voice:', JSON.stringify(sampleWithVoice || parsedJson.statistics?.[0], null, 2));
    } catch {
        console.log(insightsContent?.slice(0, 800));
    }

    // ── 4. Live call: consult_human_agent ──
    console.log('\n--- 4. Live Call: consult_human_agent ---');
    const consultBody = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
            name: 'consult_human_agent',
            arguments: {
                analyst_id: 'ben-dietz-sic',
                query: 'What is your perspective on discounting and promotional pricing?'
            }
        }
    };
    const consultRes = await axios.post(BASE_URL, consultBody, {
        headers: getHmacHeaders(consultBody, sessionId)
    });
    const consultParsed = parseSseOrJson(consultRes.data);
    const consultContent = consultParsed?.result?.content?.[0]?.text;
    console.log('consult_human_agent text (first 600 chars):');
    console.log(consultContent?.slice(0, 600));
    console.log('\nconsult_human_agent structuredContent:');
    console.log(JSON.stringify(consultParsed?.result?.structuredContent, null, 2));
}

main().catch(err => {
    console.error('Error during live test:', err.response?.data || err.message);
    process.exit(1);
});
