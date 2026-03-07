import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
    console.log("Connecting to live Fodda MCP server over SSE...");

    // Create an SSE transport pointed at the live Cloud Run endpoint
    const transport = new SSEClientTransport(
        new URL("https://fodda-mcp-p3uz7zw7ja-uc.a.run.app/sse")
    );

    // Initialize the client
    const client = new Client({
        name: "test-client",
        version: "1.0.0"
    }, { capabilities: {} });

    try {
        await client.connect(transport);
        console.log("✅ Successfully connected to MCP Server transport");

        // Test 1: List Tools
        const toolsResult = await client.listTools();
        console.log(`✅ Discovered ${toolsResult.tools.length} tools`);
        toolsResult.tools.forEach(t => console.log(`   - ${t.name}`));

        // Test 2: Execute a Tool Call with API Key and tracing header
        console.log("\nAttempting to invoke 'search_graph' to test rate limiting / auth boundaries...");

        try {
            const result = await client.callTool({
                name: "search_graph",
                arguments: {
                    graphId: "retail",
                    query: "test query",
                    userId: "self-test-user",
                    _meta: {
                        authorization: "Bearer fk_live_sample"
                    }
                }
            });
            console.log("\n✅ Tool result:");
            console.log(JSON.stringify(result, null, 2));
        } catch (err: any) {
            console.error("\n❌ Tool Execution Caught Error:", err.message);
        }

    } catch (error) {
        console.error("Connection failed:", error);
    } finally {
        // Close the connection
        await client.close();
    }
}

main().catch(console.error);
