import { createServer } from './toolHandlers.js';
import * as dotenv from 'dotenv';
import { initCatalogCache } from './catalogCache.js';

dotenv.config();

async function mockFoddaRequest(method: 'GET' | 'POST', path: string, apiKey: string, userId: string, body?: any) {
    console.log(`[mockFoddaRequest] ${method} ${path}`);
    if (path === '/v1/graphs/catalog') return { graphs: [] };
    if (path === '/v1/analysts') return [
        { analyst_id: '123', name: 'Test Analyst', description: 'A test analyst.' }
    ];
    if (path === '/v1/analysts/consult') {
        console.log(`[mockFoddaRequest] Payload:`, body);
        return { report: 'Mock report from Analyst 123' };
    }
    return {};
}

async function mockWaverunnerRequest() { return {}; }

async function main() {
    console.log("Initializing cache...");
    // Initialize cache, which should fetch from our mock API if we overwrite API_BASE_URL?
    // Let's just rely on the actual API for catalog if it's available, otherwise it fails gracefully.
    await initCatalogCache();

    console.log("Creating server...");
    const server = await createServer(
        "sk_trial_test",
        "test_user",
        // @ts-ignore
        mockFoddaRequest,
        mockWaverunnerRequest,
        () => 'widget_id',
        () => 'http://localhost'
    );

    // Get the tool
    // @ts-ignore
    const tools = server.server.registeredTools;
    const analystTools = Object.keys(tools).filter(name => name.startsWith('consult_'));
    console.log(`Found Analyst Tools: ${analystTools.join(', ')}`);

    if (analystTools.length > 0) {
        const toolToCall = analystTools[0];
        console.log(`Calling tool: ${toolToCall}`);
        try {
            const toolFunc = tools[toolToCall];
            const result = await toolFunc({ query: "Test query for analyst" });
            console.log("Result:", result);
        } catch (e: any) {
            console.error("Error calling tool:", e.message);
        }
    } else {
        console.log("No analyst tools found. (This might be expected if mock didn't populate cache properly).");
    }
}

main().catch(console.error);
