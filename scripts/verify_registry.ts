
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const PORT = 8083; // Use different port
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
    console.log("--- Starting Tool Registry Verification ---");

    // Start Server
    const server = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: '../Fodda MCP',
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'inherit'
    });

    console.log(`Server spawning on port ${PORT}...`);

    // Wait for server
    let attempts = 0;
    while (attempts < 20) {
        try {
            const res = await fetch(`${BASE_URL}/mcp/tools`);
            if (res.ok) {
                console.log("Server is up and endpoint is reachable.");
                break;
            }
        } catch (e) {
            await setTimeout(1000);
            attempts++;
        }
    }

    if (attempts === 20) {
        console.error("Server failed to start.");
        server.kill();
        process.exit(1);
    }

    try {
        console.log("Fetching Registry...");
        const res = await fetch(`${BASE_URL}/mcp/tools`);
        const data = await res.json() as any;

        // Validation
        if (!data.tools || !Array.isArray(data.tools)) {
            throw new Error("Invalid response format: 'tools' array missing.");
        }

        console.log(`Found ${data.tools.length} tools.`);

        const searchTool = data.tools.find((t: any) => t.name === 'search_graph');
        if (!searchTool) throw new Error("search_graph tool not found.");

        console.log("Checking 'search_graph' metadata...");
        if (searchTool.isDeterministic === false) {
            console.log("✅ PASSED: search_graph is marked as non-deterministic.");
        } else {
            console.log(`❌ FAILED: search_graph isDeterministic = ${searchTool.isDeterministic}`);
        }

        const nodeTool = data.tools.find((t: any) => t.name === 'get_node');
        if (nodeTool.isDeterministic === true) {
            console.log("✅ PASSED: get_node is marked as deterministic.");
        } else {
            console.log(`❌ FAILED: get_node isDeterministic = ${nodeTool.isDeterministic}`);
        }

        if (data.version) {
            console.log(`✅ PASSED: Server version reported as ${data.version}`);
        } else {
            console.log("❌ FAILED: Server version missing.");
        }

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        server.kill();
        console.log("Server stopped.");
        process.exit(0);
    }
}

run();
