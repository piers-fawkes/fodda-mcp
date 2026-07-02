import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListResourcesRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new McpServer({
    name: 'test',
    version: '1.0.0'
});

// Register capability and handlers on the underlying server
server.server.registerCapabilities({
    resources: {},
    prompts: {}
});

server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
});

server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: [] };
});

console.log('Successfully configured handlers!');
