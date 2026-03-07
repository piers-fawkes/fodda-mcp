import type { ExtendedTool } from "./types.js";

export const MCP_SERVER_VERSION = "1.7.0";
export const TOOL_VERSIONS = {
    list_graphs: "1.0.0",
    search_graph: "1.2.0",
    get_neighbors: "1.2.0",
    get_evidence: "1.1.0",
    get_node: "1.0.0",
    get_label_values: "1.2.0",
    psfk_overview: "1.0.0",
    discover_adjacent_trends: "1.0.0",
};

const GRAPH_ID_DESCRIPTION = "Select which curated graph to query. Use list_graphs to discover available options. Common values: 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo', 'pew'.";

const ALL_TOOLS: ExtendedTool[] = [
    {
        name: "list_graphs",
        description: "Discover available knowledge graphs and their schemas, including node types, relationship types, and versions. Use this tool first to find valid graphId values for other tools.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
            },
            required: ["userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                graphs: {
                    type: "array",
                    description: "Array of available graphs with their schemas",
                },
            },
        },
        isDeterministic: true,
    },
    {
        name: "search_graph",
        description: "Search across expert-curated PSFK knowledge graphs (Retail, Beauty, Sports and partner datasets) to retrieve structured trend clusters, signals, and supporting articles relevant to a query. Note: a server-side relevance gate may reduce results for brand/entity-specific queries — results with low semantic scores that don't mention query terms are automatically filtered out.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: GRAPH_ID_DESCRIPTION },
                query: { type: "string", description: "The search query. Location terms (city/country names like 'London', 'Tokyo') are auto-detected and used to hard-filter results geographically. Geo terms auto-expand (e.g., 'London' also matches 'UK', 'England'). No additional parameters needed for location filtering." },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
                limit: { type: "number", description: "Maximum number of results (default 25, max 50)" },
                use_semantic: { type: "boolean", description: "Whether to use semantic search (default true)" },
                filters: {
                    type: "object",
                    description: "Optional filters to narrow search results",
                    properties: {
                        node_types: {
                            type: "array",
                            items: { type: "string" },
                            description: "Filter by node labels (e.g., ['Trend', 'Article'])"
                        },
                    },
                },
                include_evidence: { type: "boolean", description: "If true, batch-fetch supporting evidence articles inline with results. Saves a separate get_evidence call per trend. Default: true. Each evidence item includes: sourceUrl, place (geographic location), brandNames, snippet, and publishedAt." },
            },
            required: ["graphId", "query", "userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                results: {
                    type: "array",
                    description: "Array of matching nodes (trends, articles), each optionally with an 'evidence' array if include_evidence=true. When evidence is included, each evidence item contains: sourceUrl (article link), place (geographic location of the article), brandNames (brands mentioned), snippet (relevant excerpt), and publishedAt (publication date).",
                },
                total: { type: "number", description: "Total number of results found" },
                search_method: { type: "string", description: "Search method used: 'vector', 'keyword', 'hybrid', or 'all_fallback'" },
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
                graphId: { type: "string", description: GRAPH_ID_DESCRIPTION },
                seed_node_ids: { type: "array", items: { type: "string" }, description: "Array of node IDs to start traversal from" },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
                relationship_types: { type: "array", items: { type: "string" }, description: "Filter by relationship types: 'EVIDENCED_BY', 'RELATED_TO', 'SEMANTICALLY_SIMILAR', 'ASSOCIATED_BRAND', 'MENTIONS_BRAND', 'IN_LOCATION'" },
                direction: { type: "string", enum: ["in", "out"], description: "Traversal direction: 'out' (default) follows outgoing edges, 'in' follows incoming edges" },
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
                graphId: { type: "string", description: GRAPH_ID_DESCRIPTION },
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
                    description: "Array of evidence items with source URLs, titles, snippets, relevance scores, place (geographic location of the article), and brand names",
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
                graphId: { type: "string", description: GRAPH_ID_DESCRIPTION },
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
        description: "Discover available values for a specific category (e.g., Technology, Audience, RetailerType, Brand) to support structured filtering and exploration.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: { type: "string", description: GRAPH_ID_DESCRIPTION },
                label: { type: "string", description: "The label to fetch values for (e.g., 'Brand', 'Location', 'Technology', 'Audience', 'RetailerType', 'Trend')" },
                userId: { type: "string", description: "Unique identifier for the user (Required)" },
                property: { type: "string", description: "Optional property to return values for. Defaults vary by label (Brand→name, Technology→slug, Audience→slug, Trend→trendName)" },
            },
            required: ["graphId", "label", "userId"],
        },
        outputSchema: {
            type: "object",
            properties: {
                label: { type: "string", description: "The label queried" },
                property: { type: "string", description: "The property values were fetched from" },
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
    {
        name: "discover_adjacent_trends",
        description: "Find trends that are semantically similar to a given trend — useful for discovering 'what else should I be watching?' or expanding a research brief with related signals. Returns trends connected by AI-computed similarity, not editorial curation.",
        inputSchema: {
            type: "object",
            properties: {
                graphId: {
                    type: "string",
                    description: GRAPH_ID_DESCRIPTION
                },
                trend_id: {
                    type: "string",
                    description: "The trendId of the seed trend to find adjacent possibilities for"
                },
                userId: {
                    type: "string",
                    description: "Unique identifier for the user (Required)"
                },
                min_score: {
                    type: "number",
                    description: "Minimum similarity score threshold (0-1). Higher = more similar. Default: 0.80"
                },
                limit: {
                    type: "number",
                    description: "Maximum number of adjacent trends to return. Default: 10"
                },
                include_editorial: {
                    type: "boolean",
                    description: "If true, also include trends that are already editorially linked via RELATED_TO. Default: false (shows only AI-discovered connections)"
                }
            },
            required: ["graphId", "trend_id", "userId"]
        },
        outputSchema: {
            type: "object",
            properties: {
                adjacent: {
                    type: "array",
                    description: "Array of semantically similar trends with similarity scores",
                },
                node_id: { type: "string", description: "The seed trend ID queried" },
                count: { type: "number", description: "Number of adjacent trends returned" },
                min_score: { type: "number", description: "Minimum similarity threshold applied" },
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
];

const DEFAULT_ENTERPRISE_TOOLS = [
    "list_graphs",
    "search_graph",
    "get_node",
    "get_evidence",
    "get_neighbors",
    "get_label_values",
    "discover_adjacent_trends"
];

const allowedToolsStr = process.env.ALLOWED_TOOLS;
const allowedTools = allowedToolsStr
    ? allowedToolsStr.split(',').map(s => s.trim())
    : DEFAULT_ENTERPRISE_TOOLS;

export const TOOLS = ALL_TOOLS.filter(tool => allowedTools.includes(tool.name));
