import axios from 'axios';

async function testRealWorldQuery(query: string) {
    const url = 'https://mcp.fodda.ai/c/DVOJ-YMWVFDMRZllesXvfn73AnO9RV9j';
    
    // Step 1: Initialize session
    const initResp = await axios.post(url, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'real-world-test', version: '1.0.0' }
        }
    }, {
        headers: { 'Content-Type': 'application/json' }
    });

    const sessionId = initResp.headers['mcp-session-id'];

    // Step 2: Call deep_research_topic tool
    const callResp = await axios.post(url, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
            name: 'deep_research_topic',
            arguments: { query }
        }
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': sessionId
        }
    });

    const text = callResp.data?.result?.content?.[0]?.text || JSON.stringify(callResp.data);
    return text;
}

async function main() {
    const queries = [
        "Run a Fodda Deep Research project about wine fridges, wine furniture and wine glassware and accessories?",
        "What are the key trends in luxury home bar design, wine storage, and high-end entertaining appliances?",
        "Give me a strategic breakdown of non-alcoholic beverage trends, functional drinks, and premium mocktails for 2026",
        "Research smart home automation, connected kitchen appliances, and AI-enabled home electronics",
        "Deep research on direct-to-consumer apparel brands, sustainable fashion supply chains, and retail store experience"
    ];

    for (let i = 0; i < queries.length; i++) {
        console.log(`\n=================================================================`);
        console.log(`QUERY #${i + 1}: "${queries[i]}"`);
        console.log(`=================================================================`);
        try {
            const output = await testRealWorldQuery(queries[i]);
            console.log(output);
        } catch (err: any) {
            console.error(`Error testing query #${i + 1}:`, err.message);
        }
    }
}

main().catch(console.error);
