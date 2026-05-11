import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    // We use a trial key just to pass auth
    const apiKey = "sk_trial_test_12345";
    const transport = new SSEClientTransport(
        new URL(`https://fodda-mcp-7mopqjzhwq-uk.a.run.app/mcp?api_key=${apiKey}`)
    );

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    console.log("Connected to MCP server.");

    const toolsResult = await client.listTools();
    const analystTools = toolsResult.tools.filter(t => t.name.startsWith("consult_"));
    console.log("Analyst Tools Found:", analystTools.map(t => t.name));

    if (analystTools.length > 0) {
        const toolName = analystTools[0]!.name;
        console.log(`\nCalling tool: ${toolName}...`);
        try {
            const result = await client.callTool({
                name: toolName,
                arguments: {
                    query: "Can you summarize the top three things I need to know about Gen AI this quarter?",
                    userId: "test-user-123"
                }
            });
            console.log("\nResult received!");
            console.log(JSON.stringify(result, null, 2));
        } catch (e: any) {
            console.error("Tool execution failed:", e.message);
        }
    } else {
        console.log("No analyst tools found. Make sure the API is returning them.");
    }
    
    await client.close();
}

main().catch(console.error);
