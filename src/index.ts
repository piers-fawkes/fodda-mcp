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
            {
                name: "psfk_overview",
                description: "Get a structured macro overview from the PSFK Graph. Returns up to 3 meta_patterns. Useful for top-level briefings before deeper exploration.",
                inputSchema: {
                    type: "object",
                    properties: {
                        industry: { type: "string", description: "Filter by industry (e.g. 'Retail', 'Health')" },
                        sector: { type: "string", description: "Filter by sector" },
                        region: { type: "string", description: "Filter by region" },
                        timeframe: { type: "string", description: "Timeframe for the overview" },
                        userId: { type: "string", description: "Unique identifier for the user (Required)" },
                    },
                    required: ["userId"], // industry or sector required by logic, but not schema strictness to allow either
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

    // Validate graphId for tools that require it
    if (name !== "psfk_overview" && !graphId) {
        throw new Error("graphId is required for all Fodda tools except psfk_overview.");
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

    // Enterprise Readiness: Simulated Gemini Tool Invocation Mode
    // strictly enforced production constraints
    const meta = (request.params as any)._meta || {};
    const testMode = meta.test_mode;

    if (testMode) {
        // 1. Strict Value Check
        if (testMode !== "gemini_echo") {
            // Silently ignore unknown test modes or throw error? 
            // "Reject unknown test modes" -> Throwing error is safer to signal invalid usage
            return {
                isError: true,
                content: [{ type: "text", text: `Error: Invalid test_mode '${testMode}'. Only 'gemini_echo' is supported.` }]
            };
        }

        // 2. Production Guardrails
        // Simulation is ignored (treated as normal unauthorized/error if it falls through, or just explicitly blocked here)
        // unless ENV != production OR API key has role internal_testing.
        // We assume 'apiKey' variable holds the extracted key.
        // Since we can't check roles dynamically without a DB call, we'll use a placeholder logic or ENV var for now.
        const isInternalKey = process.env.INTERNAL_TEST_KEYS?.split(',').includes(apiKey || "");
        const isProduction = process.env.NODE_ENV === "production";

        if (isProduction && !isInternalKey) {
            // In production, matching keys are required to use simulation.
            // If not internal key, we pretend simulation doesn't exist or return error?
            // "Be ignored unless..." -> Proceed to normal execution path (which handles auth/tool call normally)
            // But wait, if we proceed, it tries to execute the tool for real.
            // If the intention is to SAFEGUARD against accidental real execution, we should probably BLOCK if test_mode is present but unauthorized.
            // However, "Be ignored" implies falling back to normal behavior OR just doing nothing.
            // Safest Enterprise approach: If you ASK for test_mode but aren't allowed, FAIL. Don't fall back to real execution which might cost money.
            return {
                isError: true,
                content: [{ type: "text", text: "Error: Simulation mode not permitted in production without internal privileges." }]
            };
        }

        // 3. Structured Logging
        console.error(JSON.stringify({
            event: "mcp.tool_call.simulation",
            simulation_mode: true,
            simulation_type: "gemini_echo",
            tool: name,
            graphId,
            userId
        }));

        // 4. Gemini Echo Response
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    tool_calls: [{
                        name: name,
                        arguments: args
                    }]
                }, null, 2)
            }]
        };
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
                const limit = Math.min(Number(args?.limit) || 25, 50); // Defense in Depth: Cap results
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/search`, {
                    query: args?.query,
                    limit: limit,
                    use_semantic: args?.use_semantic !== false,
                }, { headers });
                break;
            }

            case "get_neighbors": {
                const depth = Math.min(Number(args?.depth) || 1, 2);   // Defense in Depth: Cap traversal depth
                const limit = Math.min(Number(args?.limit) || 50, 50); // Defense in Depth: Cap results
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/neighbors`, {
                    seed_node_ids: args?.seed_node_ids,
                    relationship_types: args?.relationship_types,
                    depth: depth,
                    limit: limit,
                }, { headers });
                break;
            }

            case "get_evidence": {
                const top_k = Math.min(Number(args?.top_k) || 5, 10);  // Defense in Depth: Cap evidence sources
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/evidence`, {
                    for_node_id: args?.for_node_id,
                    top_k: top_k,
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

            case "psfk_overview": {
                // Logic: At least one of industry or sector is required
                const industry = args?.industry as string | undefined;
                const sector = args?.sector as string | undefined;

                if (!industry && !sector) {
                    throw new Error("At least one of 'industry' or 'sector' must be provided for psfk_overview.");
                }

                response = await axios.post(`${API_BASE_URL}/v1/psfk/overview`, {
                    industry,
                    sector,
                    region: args?.region,
                    timeframe: args?.timeframe,
                }, { headers });
                break;
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        const durationMs = Date.now() - startTime;
        const usage = response.data.usage || { total_billable_units: 0 };

        // Structured Audit Log for Enterprise Traceability (Refined for Security Compliance)
        console.error(JSON.stringify({
            event: "mcp.tool_call",
            tool: name,
            graphId,
            userId, // Corresponds to tenant/user identity
            status: response.status,
            durationMs,
            billable_units: usage.total_billable_units,
            deterministic: true,
            layer: "mcp_proxy"
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
