import type { ExtendedTool } from "./types.js";

export const MCP_SERVER_VERSION = "1.3.0";
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
        description: "Perform hybrid (vector + keyword) search on a Fodda knowledge graph. Returns trends and articles matching the query. Uses a 3-tier fallback: vector search → keyword search → all trends. Always returns results.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "The graph ID. For PSFK verticals use: 'retail', 'beauty', or 'sports'. Other graphs: 'psfk' (all verticals), 'sic' (Strategic Independent Culture), 'waldo'." },
                query: { type: "string", description: "The search query" },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
                limit: { type: "number", description: "Maximum number of results (default 25, max 50)" },
                use_semantic: { type: "boolean", description: "Whether to use semantic search (default true)" },
            },
            required: ["graphId", "query", "userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                results: {
                    type: "array",
                    description: "Array of matching nodes (trends, articles)",
                },
                total: { type: "number", description: "Total number of results found" },
                search_method: { type: "string", description: "Search method used: 'vector', 'keyword', or 'fallback'" },
                usage: {
                    type: "object",
                    description: "Billing/usage metadata",
                    properties: {
                        total_billable_units: { type: "number" },
                    },
                },
            },
        },
        isDeterministic: false,
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
        outputSchema: {
            type: "object",
            properties: {
                nodes: {
                    type: "array",
                    description: "Array of neighboring nodes",
                },
                edges: {
                    type: "array",
                    description: "Array of relationships between nodes",
                },
                usage: {
                    type: "object",
                    properties: {
                        total_billable_units: { type: "number" },
                    },
                },
            },
        },
        isDeterministic: true,
    },
    {
        name: "get_evidence",
        description: "Get source signals, articles, and evidentiary depth for a specific node. Essential for provenance and fact-checking.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "The graph ID" },
                for_node_id: { type: "string", description: "The ID of the node (Trend or Article)" },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
                top_k: { type: "number", description: "Number of evidence items to return (default 5)" },
            },
            required: ["graphId", "for_node_id", "userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                evidence: {
                    type: "array",
                    description: "Array of evidence items with source URLs, titles, snippets, and relevance scores",
                },
                node_id: { type: "string", description: "The node this evidence supports" },
                usage: {
                    type: "object",
                    properties: {
                        total_billable_units: { type: "number" },
                    },
                },
            },
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
        outputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Node ID" },
                display: { type: "string", description: "Display name of the node" },
                labels: { type: "array", description: "Array of node labels/types" },
                properties: { type: "object", description: "Key-value properties of the node" },
            },
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
        outputSchema: {
            type: "object",
            properties: {
                label: { type: "string", description: "The label queried" },
                values: { type: "array", description: "Array of valid values for the label" },
                count: { type: "number", description: "Number of values found" },
            },
        },
        isDeterministic: true,
    },
    {
        name: "psfk_overview",
        description: "Get a structured macro overview from the PSFK Graph. Returns up to 3 meta_patterns. Useful for top-level briefings before deeper exploration. At least one of 'industry' or 'sector' must be provided.",
        inputSchema: {
            type: "object",
            properties: {
                industry: { type: "string", description: "Filter by industry (e.g. 'Retail', 'Health')" },
                sector: { type: "string", description: "Filter by sector" },
                region: { type: "string", description: "Filter by region" },
                timeframe: { type: "string", description: "Timeframe for the overview" },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
            },
            required: ["userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                meta_patterns: {
                    type: "array",
                    description: "Up to 3 macro-level pattern objects with trend summaries",
                },
                industry: { type: "string", description: "Industry filter applied" },
                sector: { type: "string", description: "Sector filter applied" },
                usage: {
                    type: "object",
                    properties: {
                        total_billable_units: { type: "number" },
                    },
                },
            },
        },
        isDeterministic: false,
    },
];
