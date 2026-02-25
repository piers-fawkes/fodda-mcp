import type { ExtendedTool } from "./types.js";

export const MCP_SERVER_VERSION = "1.4.0";
export const TOOL_VERSIONS = {
    search_graph: "1.0.0",
    get_neighbors: "1.0.0",
    get_evidence: "1.0.0",
    get_node: "1.0.0",
    get_label_values: "1.0.0",
    psfk_overview: "1.0.0",
};

const ALL_TOOLS: ExtendedTool[] = [
    {
        name: "search_graph",
        description: "Search across expert-curated PSFK knowledge graphs (Retail, Beauty, Sports and partner datasets) to retrieve structured trend clusters, signals, and supporting articles relevant to a query.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo')." },
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
        description: "Explore how a trend, brand, or technology connects to related signals, concepts, and adjacent innovation patterns within the selected graph. Traversal is depth-limited for focused discovery.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo')." },
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
        description: "Retrieve supporting signals, source articles, and structured evidence for a specific trend or concept. Designed for provenance, validation, and strategic briefing.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo')." },
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
        description: "Retrieve the full metadata and properties of a specific node within the knowledge graph, including labels and structured attributes.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo')." },
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
        description: "Discover available values for a specific category (e.g., Technology, Audience, RetailerType) to support structured filtering and exploration.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: "Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo')." },
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
        description: "Generate a macro-level overview of a selected PSFK domain (e.g., Retail, Beauty, Sports), summarizing key meta-patterns and structured trend clusters for strategic briefing.",
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
            anyOf: [
                { required: ["industry"] },
                { required: ["sector"] }
            ],
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

const DEFAULT_ENTERPRISE_TOOLS = [
    "search_graph",
    "get_node",
    "get_evidence",
    "get_neighbors"
];

const allowedToolsStr = process.env.ALLOWED_TOOLS;
const allowedTools = allowedToolsStr
    ? allowedToolsStr.split(',').map(s => s.trim())
    : DEFAULT_ENTERPRISE_TOOLS;

export const TOOLS = ALL_TOOLS.filter(tool => allowedTools.includes(tool.name));
