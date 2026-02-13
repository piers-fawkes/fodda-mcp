import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.FODDA_API_URL || "https://api.fodda.ai";
const IS_DEV = process.env.NODE_ENV === "development";
const DUMMY_API_KEY = "dummy-test-key";
const DUMMY_USER_ID = "dummy-test-user";

const server = new Server(
    {
        name: "fodda-mcp",
        version: "1.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "search_graph",
                description: "Perform hybrid (keyword + semantic) search on a Fodda knowledge graph. Use this to find trends, articles, and concepts. Highly recommended for natural language discovery.",
                inputSchema: {
                    type: "object",
                    properties: {
                        graphId: { type: "string", description: "The graph ID (e.g., 'psfk', 'waldo', 'sic')" },
                        query: { type: "string", description: "The search query" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                        limit: { type: "number", description: "Maximum number of results (default 25, max 50)" },
                        use_semantic: { type: "boolean", description: "Whether to use semantic search (default true)" },
                    },
                    required: ["graphId", "query", "userId"],
                },
            },
            {
                name: "get_neighbors",
                description: "Traverse the graph from seed nodes to find related concepts and relationships. Useful for depth-first discovery.",
                inputSchema: {
                    type: "object",
                    properties: {
                        graphId: { type: "string", description: "The graph ID" },
                        seed_node_ids: { type: "array", items: { type: "string" }, description: "Array of node IDs to start traversal from" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                        relationship_types: { type: "array", items: { type: "string" }, description: "Filter by relationship types" },
                        depth: { type: "number", description: "Traversal depth (default 1, max 2)" },
                        limit: { type: "number", description: "Maximum results (default 50)" },
                    },
                    required: ["graphId", "seed_node_ids", "userId"],
                },
            },
            {
                name: "get_evidence",
                description: "Get source signals, articles, and evidentiary depth for a specific node. Essential for provenance and fact-checking.",
                inputSchema: {
                    type: "object",
                    properties: {
                        graphId: { type: "string", description: "The graph ID" },
                        for_node_id: { type: "string", description: " The ID of the node (Trend or Article)" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                        top_k: { type: "number", description: "Number of evidence items to return (default 5)" },
                    },
                    required: ["graphId", "for_node_id", "userId"],
                },
            },
            {
                name: "get_node",
                description: "Directly retrieve metadata and properties for a single node by its ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        graphId: { type: "string", description: "The graph ID" },
                        nodeId: { type: "string", description: "The ID of the node" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                    },
                    required: ["graphId", "nodeId", "userId"],
                },
            },
            {
                name: "get_label_values",
                description: "Discover valid values for a specific node label (e.g., RetailerType, Technology). Use for discovery, UI filters, and category exploration.",
                inputSchema: {
                    type: "object",
                    properties: {
                        graphId: { type: "string", description: "The graph ID" },
                        label: { type: "string", description: "The label to fetch values for" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                    },
                    required: ["graphId", "label", "userId"],
                },
            },
        ],
    };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const graphId = (args as any)?.graphId;
    let userId = (args as any)?.userId;

    if (!graphId) {
        throw new Error("graphId is required for all Fodda tools.");
    }

    // Extract Bearer Token from _meta
    const authHeader = (request.params as any)._meta?.authorization || "";
    let apiKey = typeof authHeader === 'string' && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    // Strict Enforcement / Dev Mode Fallback
    if (!apiKey) {
        if (IS_DEV) {
            apiKey = DUMMY_API_KEY;
        } else {
            return {
                isError: true,
                content: [{ type: "text", text: "Error: No API Key provided. Please include a Bearer token in the 'authorization' field of the MCP request _meta." }],
            };
        }
    }

    if (!userId) {
        if (IS_DEV) {
            userId = DUMMY_USER_ID;
        } else {
            return {
                isError: true,
                content: [{ type: "text", text: "Error: No userId provided. This field is required for tracking and billing." }],
            };
        }
    }

    const headers: Record<string, string> = {
        "X-API-Key": apiKey,
        "X-User-Id": userId,
        "X-Fodda-Mode": "deterministic",
        "Content-Type": "application/json",
    };

    const startTime = Date.now();
    try {
        let response;
        switch (name) {
            case "search_graph": {
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/search`, {
                    query: args?.query,
                    limit: args?.limit,
                    use_semantic: args?.use_semantic !== false,
                }, { headers });
                break;
            }

            case "get_neighbors": {
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/neighbors`, {
                    seed_node_ids: args?.seed_node_ids,
                    relationship_types: args?.relationship_types,
                    depth: args?.depth,
                    limit: args?.limit,
                }, { headers });
                break;
            }

            case "get_evidence": {
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/evidence`, {
                    for_node_id: args?.for_node_id,
                    top_k: args?.top_k,
                }, { headers });
                break;
            }

            case "get_node": {
                response = await axios.get(`${API_BASE_URL}/v1/graphs/${graphId}/nodes/${args?.nodeId}`, { headers });
                break;
            }

            case "get_label_values": {
                response = await axios.get(`${API_BASE_URL}/v1/graphs/${graphId}/labels/${args?.label}/values`, { headers });
                break;
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        const durationMs = Date.now() - startTime;
        const usage = response.data.usage || { total_billable_units: 0 };

        console.error(JSON.stringify({
            event: "mcp.tool_call",
            tool: name,
            graphId,
            userId,
            status: response.status,
            durationMs,
            billable_units: usage.total_billable_units,
            deterministic: true
        }));

        return {
            content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };

    } catch (error: any) {
        const durationMs = Date.now() - startTime;
        console.error(JSON.stringify({
            event: "mcp.tool_error",
            tool: name,
            graphId,
            userId,
            status: error.response?.status || 500,
            durationMs,
            error: error.response?.data?.message || error.message
        }));
        return {
            isError: true,
            content: [{ type: "text", text: `Error calling Fodda API: ${error.response?.data?.message || error.message}` }],
        };
    }
});

/**
 * Start the server.
 */
async function main() {
    if (process.env.PORT) {
        const app = express();
        const port = parseInt(process.env.PORT) || 8080;
        let transport: SSEServerTransport | null = null;

        app.get("/sse", async (req, res) => {
            console.error("New SSE connection established");
            transport = new SSEServerTransport("/messages", res);
            await server.connect(transport);
        });

        app.post("/messages", async (req, res) => {
            if (transport) {
                await transport.handlePostMessage(req, res);
            } else {
                res.status(400).send("SSE connection not established");
            }
        });

        app.listen(port, () => {
            console.error(`Fodda MCP server running on SSE at http://localhost:${port}/sse`);
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Fodda MCP server running on stdio");
    }
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
