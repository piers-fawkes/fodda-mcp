import type { ExtendedTool } from "./types.js";

export const MCP_SERVER_VERSION = "1.1.0";
export const TOOL_VERSIONS = {
    search_graph: "1.0.0",
    get_neighbors: "1.0.0",
    get_evidence: "1.0.0",
    get_node: "1.0.0",
    get_label_values: "1.0.0",
    psfk_overview: "1.0.0",
};

export const TOOLS: ExtendedTool[] = [
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
        isDeterministic: false, // Search results can change as data updates
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
        isDeterministic: true, // Graph structure is relatively stable for traversal
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
        isDeterministic: true,
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
        isDeterministic: true,
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
        isDeterministic: true,
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
        isDeterministic: false, // Macro overviews are generated and may evolve
    },
];
