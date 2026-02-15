
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSimulation() {
    console.log("--- Starting Gemini Tool Invocation Simulation ---");

    // Scenario 1: Direct Tool Call (Echo Mode)
    // We want to verify that if we send a tool call with `_meta: { test_mode: 'gemini_echo' }`,
    // we get the expected echo response without hitting the real API.

    // Start the MCP Server using StdioClientTransport which spawns the process
    console.log("Starting MCP Server via StdioClientTransport...");

    // Sanitize env to ensure all values are strings
    const sanitizedEnv = Object.fromEntries(
        Object.entries(process.env)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, v as string])
    );

    const transport = new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "../dist/index.js")],
        env: { ...sanitizedEnv, PORT: "", NODE_ENV: "development" }
    });

    const client = new Client(
        {
            name: "gemini-simulator",
            version: "1.0.0",
        },
        {
            capabilities: {},
        }
    );

    try {
        await client.connect(transport);
        console.log("Connected to MCP Server via Stdio.");

        // List Tools to verify connection
        const toolsList = await client.listTools();
        console.log(`Found ${toolsList.tools.length} tools.`);

        // Test Case 1: psfk_overview with Simulation Mode
        console.log("\nTesting 'psfk_overview' in Simulation Mode...");
        const toolName = "psfk_overview";
        const toolArgs = {
            industry: "Retail",
            sector: "Technology"
        };

        console.log("Sending raw JSON-RPC request with _meta...");

        // Use client.request allowing us to inject _meta at the params level
        const result = await client.request(
            {
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: toolArgs,
                    _meta: {
                        test_mode: "gemini_echo",
                        authorization: "Bearer dummy-test-key"
                    }
                }
            },
            CallToolResultSchema
        );

        console.log("Result received:");
        console.log(JSON.stringify(result, null, 2));

        // Verification
        if (result.content && result.content[0]) {
            const content = result.content[0];
            if (content.type === "text") {
                try {
                    const data = JSON.parse(content.text);

                    // Check if it returned the tool call structure (Echo)
                    if (data.tool_calls && data.tool_calls[0].name === toolName) {
                        console.log("✅ PASSED: Server correctly echoed the tool call.");
                    } else {
                        console.log("❌ FAILED: Response was not an echo.");
                    }
                } catch (e) {
                    console.log("❌ FAILED: Response text is not valid JSON.");
                }
            } else {
                console.log("❌ FAILED: Unexpected content type.");
            }
        } else {
            console.log("❌ FAILED: No content in result.");
        }

    } catch (error) {
        console.error("Simulation failed:", error);
    } finally {
        // Cleanup
        try {
            await transport.close();
            console.log("Transport closed.");
        } catch (e) {
            console.error("Error closing transport:", e);
        }
        process.exit(0);
    }
}

runSimulation();
