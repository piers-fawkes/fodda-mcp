import { createServer } from '../dist/toolHandlers.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dotenv from 'dotenv';
dotenv.config();

const tools: any[] = [];

// Override the tool registration prototype to intercept tool details
McpServer.prototype.tool = function (name: string, description: string, ...args: any[]) {
    tools.push({ name, description });
    return this;
};

async function main() {
    console.log("Mocking MCP Server startup to extract registered tools...");

    // Dummy dependencies for createServer
    const dummyFoddaRequest = async () => ({});
    const dummyWaverunnerRequest = async () => ({});
    const dummyStoreWidget = () => '';
    const dummyGetServiceUrl = () => '';

    try {
        await createServer(
            'dummy-key',
            'dummy-user',
            dummyFoddaRequest,
            dummyWaverunnerRequest,
            dummyStoreWidget,
            dummyGetServiceUrl
        );

        console.log(`Successfully extracted ${tools.length} tool(s) from MCP registry:\n`);
        console.log(JSON.stringify(tools, null, 2));
    } catch (err: any) {
        console.error("Failed to mock server creation:", err.message);
    }
}

main();
