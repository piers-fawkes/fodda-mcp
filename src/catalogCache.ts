/**
 * Graph Catalog Cache — fetches /v1/graphs/catalog at startup and refreshes hourly.
 * Provides typed access to the full graph registry and dynamic prompt generation.
 *
 * The catalog endpoint is public (no auth), already cached with 1h TTL on the API side,
 * and is the same endpoint the website and app use.
 */
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogGraph {
    graph_id: string;
    name: string;
    description: string;
    curator: string;
    curator_url: string;
    quality_checker_name: string;
    quality_checker_title: string;
    quality_checker_company: string;
    update_frequency: string;
    domain: string;
    version: string;
    node_types: string[];
    relationship_types: string[];
    status: string;
    topics: string[];
    graph_type: string; // "domain" | "expert" | "baseline" | "community" | "skill"
    headline: string;
    subhead: string;
    geography: string | string[];
    icon_url: string;
    company: string;
    source_url: string;
    available_as: string | string[];
    is_playground: boolean;
    last_updated: string | null;
    published_date: string | null;
    example_queries: string[];
    portrait_url: string;
    trend_count: number;
    evidence_count: number;
    last_synced: string | null;
    // Fields that may be added in the future — supplemental_tools, routing_keywords, etc.
    supplemental_tools_primary?: string[];
    supplemental_tools_secondary?: string[];
    routing_keywords?: string[];
    // Skill-specific fields (only populated when graph_type === 'skill')
    mcp_url?: string;        // The skill's MCP server endpoint
    skill_phase?: string;    // 'output' | 'research' — when in the pipeline to call
    skill_tool_name?: string; // The specific tool to call on the skill server
    // Graph page URL on fodda.ai (populated from Airtable webpageURL field)
    webpage_url?: string | null;
}

export interface CatalogResponse {
    version: string;
    generated_at: string;
    graph_count: number;
    graphs: CatalogGraph[];
}

export interface CatalogAnalyst {
    analyst_id: string;
    name: string;
    description: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const CATALOG_REFRESH_MS = 60 * 60 * 1000; // 1 hour

let cachedCatalog: CatalogResponse | null = null;
let cachedAnalysts: CatalogAnalyst[] = [];
let lastFetchedAt: number = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch the catalog from the API. Public endpoint, no auth needed.
 */
async function fetchCatalog(): Promise<CatalogResponse> {
    const url = `${API_BASE_URL}/v1/graphs/catalog`;
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data as CatalogResponse;
    } catch (err: any) {
        console.error(`[catalogCache] Failed to fetch catalog: ${err.message}`);
        throw err;
    }
}

/**
 * Fetch the analysts from the API. Requires internal auth.
 */
async function fetchAnalysts(): Promise<CatalogAnalyst[]> {
    const url = `${API_BASE_URL}/v1/analysts`;
    const internalKey = process.env.FODDA_INTERNAL_API_KEY;
    const headers = internalKey ? { 'Authorization': `Bearer ${internalKey}` } : {};
    
    try {
        const response = await axios.get(url, { headers, timeout: 10000 });
        return Array.isArray(response.data) ? response.data : (response.data.analysts || []);
    } catch (err: any) {
        console.error(`[catalogCache] Failed to fetch analysts: ${err.message}`);
        return [];
    }
}

/**
 * Initialize the catalog cache. Call once at server startup.
 * Fetches immediately, then sets up hourly refresh.
 */
export async function initCatalogCache(): Promise<void> {
    try {
        cachedCatalog = await fetchCatalog();
        cachedAnalysts = await fetchAnalysts();
        lastFetchedAt = Date.now();
        rebuildSearchIndex();
        console.error(`[catalogCache] Loaded ${cachedCatalog.graph_count} graphs from catalog (search index: ${graphSearchTexts.size} entries)`);
        console.error(`[catalogCache] Loaded ${cachedAnalysts.length} analysts`);
    } catch {
        console.error('[catalogCache] Initial fetch failed — dynamic prompt sections will use fallback text');
    }

    // Refresh hourly in the background
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        try {
            cachedCatalog = await fetchCatalog();
            cachedAnalysts = await fetchAnalysts();
            lastFetchedAt = Date.now();
            rebuildSearchIndex();
            console.error(`[catalogCache] Refreshed catalog — ${cachedCatalog.graph_count} graphs (search index rebuilt) and ${cachedAnalysts.length} analysts`);
        } catch {
            console.error('[catalogCache] Background refresh failed — keeping stale cache');
        }
    }, CATALOG_REFRESH_MS);
}

/**
 * Get the cached catalog. Returns null if not yet fetched.
 */
export function getCatalog(): CatalogResponse | null {
    return cachedCatalog;
}

/**
 * Get the cached analysts.
 */
export function getAnalysts(): CatalogAnalyst[] {
    return cachedAnalysts;
}

/**
 * Get all graphs from the cached catalog.
 */
export function getGraphs(): CatalogGraph[] {
    return cachedCatalog?.graphs ?? [];
}

/**
 * Get only graphs with status === 'live'.
 */
export function getLiveGraphs(): CatalogGraph[] {
    return getGraphs().filter(g => g.status === 'live');
}

/**
 * Get domain/curated graphs (graph_type === 'domain').
 */
export function getDomainGraphs(): CatalogGraph[] {
    return getLiveGraphs().filter(g => g.graph_type === 'domain');
}

/**
 * Get expert graphs (graph_type === 'expert' or 'industry report').
 * Industry report graphs follow the same EVIDENCE_FOR pattern and should
 * be routed identically to expert graphs.
 */
export function getExpertGraphs(): CatalogGraph[] {
    return getLiveGraphs().filter(g => g.graph_type === 'expert' || g.graph_type === 'industry report');
}

/**
 * Get skill graphs (graph_type === 'skill').
 * Includes both 'live' and 'beta' status skills.
 */
export function getSkillGraphs(): CatalogGraph[] {
    return getGraphs().filter(g => g.graph_type === 'skill' && (g.status === 'live' || g.status === 'beta'));
}

/**
 * Get enabled skill configs for a user, excluding their disabled graphs.
 * Returns configs ready to pass to the skill client.
 *
 * Note: Skills route through the Core API now — mcp_url is no longer
 * required. The API handles upstream MCP connections, auth, and billing.
 */
export function getEnabledSkillConfigs(disabledGraphIds: Set<string>): import('./skillClient.js').SkillConfig[] {
    return getSkillGraphs()
        .filter(g => !disabledGraphIds.has(g.graph_id))
        .map(g => ({
            id: g.graph_id,
            name: g.name,
            phase: (g.skill_phase === 'research' ? 'research' : 'output') as 'output' | 'research',
        }));
}

/**
 * Get the set of domain graph IDs for theme coloring.
 */
export function getDomainGraphIds(): Set<string> {
    return new Set(getDomainGraphs().map(g => g.graph_id));
}

// ---------------------------------------------------------------------------
// Dynamic Prompt Builders
// ---------------------------------------------------------------------------

/**
 * Build the GRAPH NAMING block from catalog data.
 * Generates: - graphId "retail" → "PSFK's Retail Graph"
 */
export function buildGraphNamingBlock(): string {
    const graphs = getLiveGraphs();
    if (graphs.length === 0) return ''; // fallback — will use hardcoded

    const lines: string[] = [];
    lines.push('GRAPH NAMING: Never call results "the Fodda graph." Fodda is the platform — the knowledge graphs are created by named experts. Always attribute to the expert:');

    for (const g of graphs) {
        const displayName = buildDisplayName(g);
        const domainHint = g.domain ? ` (${g.domain})` : '';
        lines.push(`- graphId "${g.graph_id}" → "${displayName}"${domainHint}`);
    }

    lines.push('Example: "PSFK\'s Retail Graph identifies Retailer-Operated Value-Recovery Programs as a top signal (score: 100)" — NOT "the Fodda graph shows..."');
    lines.push('Fodda is the delivery mechanism. The experts are the authority.');
    lines.push('When presenting results from community Pattern Graphs, use the creator\'s name in attribution (e.g., "According to [creator]\'s [Graph Name] Pattern Graph on Fodda...").');

    return lines.join('\n');
}

/**
 * Build a human-friendly display name for a graph.
 */
export function buildDisplayName(g: CatalogGraph): string {
    const possessive = (name: string) => name.endsWith('s') ? `${name}'` : `${name}'s`;

    // Domain graphs curated by PSFK Editorial
    if (g.curator === 'PSFK Editorial') {
        // Extract the domain keyword from the name, e.g. "PSFK Retail Trends" → "Retail"
        const keyword = g.name.replace('PSFK ', '').replace(' Trends', '').trim();
        return `PSFK's ${keyword} Graph`;
    }

    // Graphs with a company name — use company + graph name, but avoid duplication
    if (g.company && g.company !== g.curator) {
        // If graph name already contains the company name, just use curator + name
        if (g.name.toLowerCase().includes(g.company.toLowerCase())) {
            return `${possessive(g.curator)} ${g.name}`;
        }
        return `${possessive(g.curator)} ${g.company} ${g.name}`;
    }

    // Default: curator's graph name — but avoid duplication
    if (g.curator) {
        // If graph name already starts with or contains the curator name, just use the name
        if (g.name.toLowerCase().includes(g.curator.toLowerCase())) {
            return g.name;
        }
        return `${possessive(g.curator)} ${g.name}`;
    }

    return g.name;
}

/**
 * Build the GRAPH TYPES block from catalog data.
 */
export function buildGraphTypesBlock(): string {
    const domainGraphs = getDomainGraphs();
    const expertGraphs = getExpertGraphs();
    const baselineGraphs = getLiveGraphs().filter(g => g.graph_type === 'baseline');

    const lines: string[] = [];
    lines.push('GRAPH TYPES: Fodda serves three types of knowledge graphs:');

    // Domain
    const domainNames = domainGraphs.map(g => g.name.replace('PSFK ', '').replace(' Trends', '').replace(' Graph', '')).join(', ');
    lines.push(`- CURATED GRAPHS: Expert-curated by PSFK (${domainNames}) and partners. These use deep editorial curation and AI-powered embeddings.`);

    // Expert
    const expertDescs = expertGraphs.map(g => {
        const who = g.company && g.company !== g.curator ? `${g.company}/${g.curator}` : g.curator;
        const domain = g.domain ? ` (${g.domain})` : '';
        return `${who}${domain}`;
    }).join(', ');
    lines.push(`- EXPERT GRAPHS: Domain-specific knowledge graphs built from expert reports and presentations. Each is curated by a named industry expert or organization: ${expertDescs}. These follow the EVIDENCE_FOR relationship pattern and use gemini-embedding-001 (768d) embeddings.`);

    // Baseline / Community
    if (baselineGraphs.length > 0) {
        const baselineNames = baselineGraphs.map(g => g.name).join(', ');
        lines.push(`- BASELINE GRAPHS: Structured reference data (${baselineNames}).`);
    }
    lines.push('- COMMUNITY PATTERN GRAPHS: Contributed by strategists via Google Sheets. These follow the Fodda Pattern Standard (Signals → Patterns → Entities).');

    return lines.join('\n');
}

/**
 * Build the EXPERT GRAPH ROUTING block from catalog data.
 * Uses the graph's domain field and topics to generate routing keywords.
 */
export function buildExpertRoutingBlock(): string {
    const experts = getExpertGraphs();
    if (experts.length === 0) return '';

    const lines: string[] = [];
    lines.push('EXPERT GRAPH ROUTING: When a user\'s query matches one of these domains, route to the corresponding expert graph:');

    for (const g of experts) {
        const keywords = buildRoutingKeywords(g);
        lines.push(`- ${keywords} → ${g.graph_id}`);
    }

    lines.push('Expert graphs provide specialist perspectives from named industry leaders. Living expert graphs (those with recurring updates) are primary research sources alongside PSFK domain graphs. Static expert graphs offer deep specialist analysis from a specific point in time. When a query matches an expert graph\'s domain, search it — expert analysis is often the most proprietary content in the system.');

    return lines.join('\n');
}

/**
 * Generate routing keywords from a graph's domain, topics, and description.
 */
function buildRoutingKeywords(g: CatalogGraph): string {
    // If the catalog provides explicit routing_keywords, use them
    if (g.routing_keywords && g.routing_keywords.length > 0) {
        return g.routing_keywords.join(' / ');
    }

    // Otherwise, extract from domain + topics + description keywords
    const keywords: string[] = [];

    // Domain is the primary source (e.g. "Future of Work & Digital Transformation")
    if (g.domain) {
        // Split on & and , to get individual terms
        const domainParts = g.domain.split(/[&,]/).map(s => s.trim()).filter(Boolean);
        keywords.push(...domainParts);
    }

    // Add topics as supplementary keywords
    if (g.topics && g.topics.length > 0) {
        for (const t of g.topics) {
            const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
            if (!keywords.some(k => k.toLowerCase().includes(t.toLowerCase()))) {
                keywords.push(capitalized);
            }
        }
    }

    return keywords.join(' / ') || g.name;
}

/**
 * Build the EXPERT GRAPH WORKFLOW block dynamically.
 */
export function buildExpertWorkflowBlock(): string {
    const experts = getExpertGraphs();
    if (experts.length === 0) return '';

    const expertIds = experts.map(g => g.graph_id).join(', ');

    return `EXPERT GRAPH WORKFLOW: Expert graphs (${expertIds}) contain Trend nodes with rich categorized evidence — statistics (48%), case studies (27%), analysis (14%), and interviews (10%). When querying an expert graph: 1) Call search_graph to find trends. 2) Call get_evidence for supporting articles. 3) Call search_statistics for quantitative data points within the expert's domain. 4) Call search_insights for expert quotes and analytical framing. 5) Call supplemental tools for macro context. Expert graphs work with ALL evidence tools — treat them the same as PSFK curated graphs for evidence retrieval.`;
}

/**
 * Build the SUPPLEMENTAL PAIRING STRATEGY block from catalog data.
 * Uses domain knowledge to map graph domains to appropriate supplemental tools.
 */
export function buildSupplementalPairingBlock(): string {
    const graphs = getLiveGraphs();
    if (graphs.length === 0) return '';

    const lines: string[] = [];
    lines.push('SUPPLEMENTAL PAIRING STRATEGY: After querying any knowledge graph, select supplemental tools based on the graph being queried. Each graph has different data needs:\n');

    // Separate domain vs expert graphs
    const domainGraphs = graphs.filter(g => g.graph_type === 'domain');
    const expertGraphs = graphs.filter(g => g.graph_type === 'expert');

    for (const g of domainGraphs) {
        const pairing = inferSupplementalPairing(g);
        lines.push(`── ${g.name} (graphId: ${g.graph_id}) ──`);
        lines.push(`PRIMARY:   ${pairing.primary.join(', ')}`);
        lines.push(`SECONDARY: ${pairing.secondary.join(', ')}`);
        lines.push(`USE WHEN:  ${pairing.useWhen}`);
        lines.push('');
    }

    // Expert graphs — simpler pairing
    if (expertGraphs.length > 0) {
        lines.push('── Expert Graphs — Supplemental Pairing ──');
        lines.push('Expert graphs are domain-specific and narrower than PSFK curated graphs. Use the following pairings when querying expert graphs:');
        for (const g of expertGraphs) {
            const pairing = inferSupplementalPairing(g);
            const domainHint = g.domain ? ` (${g.domain})` : '';
            lines.push(`- ${g.graph_id}${domainHint}: ${pairing.primary.join(' + ')}`);
        }
    }

    return lines.join('\n');
}

/**
 * Infer which supplemental tools pair with a graph based on its domain and topics.
 */
interface ToolPairing {
    primary: string[];
    secondary: string[];
    useWhen: string;
}

function inferSupplementalPairing(g: CatalogGraph): ToolPairing {
    // If the catalog provides explicit tool lists, use them
    if (g.supplemental_tools_primary && g.supplemental_tools_primary.length > 0) {
        return {
            primary: g.supplemental_tools_primary,
            secondary: g.supplemental_tools_secondary || [],
            useWhen: `Use for ${g.domain || g.name} queries.`
        };
    }

    // Otherwise, infer from domain and topics
    const domain = (g.domain || '').toLowerCase();
    const topics = (g.topics || []).map(t => t.toLowerCase());
    const name = g.name.toLowerCase();
    const desc = (g.description || '').toLowerCase();

    // Combined text for keyword matching
    const text = `${domain} ${topics.join(' ')} ${name} ${desc}`;

    const primary: string[] = [];
    const secondary: string[] = [];
    let useWhen = '';

    // Retail / Commerce
    if (text.match(/retail|commerce|shopping|store|e-commerce|omnichannel/)) {
        primary.push('get_census_retail_snapshot', 'get_bea_spending_snapshot', 'get_fred_economic_snapshot');
        secondary.push('get_bls_economic_snapshot', 'get_census_demographics_snapshot', 'get_wto_trade_snapshot', 'get_openalex_research_trends');
        useWhen = 'Always. Retail trends need economic context — sales data, consumer spending, sentiment.';
    }
    // Beauty / Wellness / Health
    else if (text.match(/beauty|wellness|cosmetic|ingredient|skincare|health|biotech/)) {
        primary.push('get_fda_ingredient_safety', 'get_pubmed_research_trends', 'get_clinical_trials');
        secondary.push('get_bea_spending_snapshot', 'get_wikipedia_pageviews', 'get_wto_trade_snapshot');
        useWhen = 'Always for ingredient-specific queries. PubMed for publication velocity. FDA for safety signals.';
    }
    // Sports / Fitness / Recreation
    else if (text.match(/sport|fitness|fandom|athlete|recreation|trail|outdoor/)) {
        primary.push('get_wikipedia_pageviews', 'get_bea_spending_snapshot', 'get_pew_survey_data');
        secondary.push('get_fred_economic_snapshot', 'get_census_demographics_snapshot', 'get_wto_trade_snapshot');
        useWhen = 'Wikipedia for attention tracking. BEA for recreation spending shifts. Pew for media consumption.';
    }
    // Fashion / Apparel
    else if (text.match(/fashion|apparel|clothing|streetwear|luxury|textile/)) {
        primary.push('get_bea_spending_snapshot', 'get_bls_economic_snapshot', 'get_census_retail_snapshot');
        secondary.push('get_wikipedia_pageviews', 'get_worldbank_global_snapshot');
        useWhen = 'BEA for clothing PCE trends. BLS for apparel CPI. Census for e-commerce vs. brick-and-mortar split.';
    }
    // Work / HR / Organization
    else if (text.match(/work|hr|talent|hybrid|employment|organization|workforce/)) {
        primary.push('get_bls_economic_snapshot', 'get_fred_economic_snapshot');
        secondary.push('get_census_demographics_snapshot');
        useWhen = 'BLS for employment and wage data. FRED for macro sentiment and labor market indicators.';
    }
    // Consumer culture / Marketing / Advertising / Brand
    else if (text.match(/culture|marketing|advertising|brand|media|consumer culture|cultural/)) {
        primary.push('get_pew_survey_data', 'get_wikipedia_pageviews');
        secondary.push('get_bea_spending_snapshot', 'get_census_demographics_snapshot', 'get_openalex_research_trends');
        useWhen = 'Pew for social media usage and attitudes. Wikipedia for cultural moment tracking. BEA for consumer spending.';
    }
    // Technology / Electronics / Digital
    else if (text.match(/technology|electronics|digital|enterprise|platform|tech|ai|software/)) {
        primary.push('get_fred_economic_snapshot', 'get_worldbank_global_snapshot');
        secondary.push('get_bea_spending_snapshot', 'get_pew_survey_data', 'get_openalex_research_trends');
        useWhen = 'FRED for business investment indicators. World Bank for tech trade. Pew for technology adoption attitudes.';
    }
    // Travel / Tourism
    else if (text.match(/travel|tourism|hospitality|destination/)) {
        primary.push('get_worldbank_global_snapshot', 'get_wto_trade_snapshot');
        secondary.push('get_bea_spending_snapshot', 'get_wikipedia_pageviews');
        useWhen = 'World Bank for tourism GDP. WTO for services trade. BEA for recreation spending.';
    }
    // Design / Lifestyle / Materials
    else if (text.match(/design|lifestyle|interior|material|color|aesthetic/)) {
        primary.push('get_bea_spending_snapshot', 'get_worldbank_global_snapshot');
        secondary.push('get_wikipedia_pageviews', 'get_fred_economic_snapshot', 'get_openalex_research_trends');
        useWhen = 'BEA for housing and durable goods spending. World Bank for manufacturing context.';
    }
    // Food / CPG / Snacking
    else if (text.match(/food|snack|treat|indulgence|cpg|consumer goods/)) {
        primary.push('get_bea_spending_snapshot', 'get_bls_economic_snapshot');
        secondary.push('get_openfoodfacts_snapshot', 'get_fred_economic_snapshot');
        useWhen = 'BEA for food spending. BLS for food CPI. Open Food Facts for product composition data.';
    }
    // Logistics / Shipping / Supply chain
    else if (text.match(/logistics|shipping|warehouse|supply chain|last.mile/)) {
        primary.push('get_census_retail_snapshot', 'get_wto_trade_snapshot');
        secondary.push('get_fred_economic_snapshot', 'get_worldbank_global_snapshot');
        useWhen = 'Census for e-commerce vs retail data. WTO for cross-border trade volumes.';
    }
    // Trust / Public opinion
    else if (text.match(/trust|tipping|opinion|societal|backlash/)) {
        primary.push('get_fred_economic_snapshot', 'get_pew_survey_data', 'get_oecd_economic_snapshot');
        secondary.push('get_census_demographics_snapshot');
        useWhen = 'FRED for macro consumer confidence. Pew for public trust data. OECD for international confidence divergence.';
    }
    // Automotive
    else if (text.match(/automotive|car|vehicle|color trend/)) {
        primary.push('get_worldbank_global_snapshot', 'get_wto_trade_snapshot');
        secondary.push('get_bea_spending_snapshot');
        useWhen = 'World Bank for auto manufacturing data. WTO for automotive trade flows.';
    }
    // CRM / Engagement / Martech
    else if (text.match(/crm|engagement|martech|retention|personalization/)) {
        primary.push('get_bea_spending_snapshot', 'get_fred_economic_snapshot');
        secondary.push('get_pew_survey_data');
        useWhen = 'BEA for services spending. FRED for consumer sentiment as backdrop to engagement strategy.';
    }
    // Sponsorship (MLB etc)
    else if (text.match(/sponsorship|mlb|baseball|stadium/)) {
        primary.push('get_wikipedia_pageviews', 'get_bea_spending_snapshot');
        secondary.push('get_census_demographics_snapshot', 'get_fred_economic_snapshot');
        useWhen = 'Wikipedia for team/league/brand attention tracking. BEA for recreation spending.';
    }
    // Public opinion data (Pew-type)
    else if (text.match(/public opinion|survey|demographics|pew/)) {
        primary.push('get_census_demographics_snapshot', 'get_pew_survey_data');
        secondary.push('get_fred_economic_snapshot');
        useWhen = 'Census for demographic cross-referencing. FRED for macro sentiment backdrop.';
    }
    // Fallback
    else {
        primary.push('get_fred_economic_snapshot', 'get_bea_spending_snapshot');
        secondary.push('get_wikipedia_pageviews', 'get_worldbank_global_snapshot');
        useWhen = `Use general economic indicators for context on ${g.domain || g.name} trends.`;
    }

    return { primary, secondary, useWhen };
}

/**
 * Build the SUPPLEMENTAL DEFAULT RULE — which graphs should default to including supplemental data.
 */
export function buildSupplementalDefaultBlock(): string {
    const domainGraphs = getDomainGraphs();
    const expertGraphs = getExpertGraphs();

    const domainIds = domainGraphs.map(g => g.graph_id).join(', ');

    // Expert graphs with economic dimensions — infer from domain
    const econExpertIds = expertGraphs
        .filter(g => {
            const text = `${g.domain} ${g.topics?.join(' ')} ${g.description}`.toLowerCase();
            return text.match(/commerce|retail|food|consumer|spending|economic|logistics|trade|automotive/);
        })
        .map(g => g.graph_id)
        .join(', ');

    let block = `SUPPLEMENTAL DEFAULT RULE: Supplemental data calls are NOT optional for substantive queries on consumer-facing graphs (${domainIds}). Default toward inclusion — the question is not "does this query need economic context?" but "would a reader benefit from knowing the macro conditions around this trend?"`;

    if (econExpertIds) {
        block += ` For expert graphs with economic dimensions (${econExpertIds}), also default to inclusion.`;
    }

    block += ` Escape valve: if the query is demonstrably about design language, physical formats, or brand tactics with no macro dependency, skip supplemental data. Do not ask the user. Make the judgment call and execute.`;

    return block;
}

/**
 * Build the evidence tools rule (search_statistics + search_insights).
 * These now work on ALL graph types, not just curated.
 */
export function buildCuratedOnlyToolsBlock(): string {
    return `- search_statistics → Works on ALL graphs (PSFK curated AND expert graphs). Search for quantitative data points, market sizes, and growth rates.\n- search_insights → Works on ALL graphs (PSFK curated AND expert graphs). Search for expert quotes, analysis, and qualitative evidence.`;
}

/**
 * Master function: build all dynamic sections and return them as a single string
 * to inject into the system prompt, replacing the hardcoded blocks.
 */
export function buildDynamicPromptSections(): string | null {
    const catalog = getCatalog();
    if (!catalog || catalog.graphs.length === 0) {
        return null; // Return null to signal: use hardcoded fallback
    }

    const sections = [
        buildGraphNamingBlock(),
        '',
        buildGraphTypesBlock(),
        '',
        buildExpertRoutingBlock(),
        '',
        buildSupplementalDefaultBlock(),
        '',
        buildSupplementalPairingBlock(),
        '',
        buildExpertWorkflowBlock(),
        '',
        buildCuratedOnlyToolsBlock(),
    ];

    return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Smart Graph Routing — 2-step query-to-graph relevance scoring
// ---------------------------------------------------------------------------

/**
 * Build a single searchable text blob from all the metadata fields of a graph.
 * Used for keyword matching against user queries.
 */
function buildSearchableText(g: CatalogGraph): string {
    const parts: string[] = [
        g.name || '',
        g.description || '',
        g.domain || '',
        g.headline || '',
        g.subhead || '',
        g.company || '',
        g.curator || '',
        ...(g.topics || []),
        ...(g.routing_keywords || []),
        ...(g.example_queries || []),
    ];
    return parts.join(' ').toLowerCase();
}

// Pre-computed searchable text cache (rebuilt on catalog refresh)
let graphSearchTexts = new Map<string, string>();

/**
 * Rebuild the searchable text index. Called after catalog refresh.
 */
function rebuildSearchIndex(): void {
    graphSearchTexts.clear();
    for (const g of getGraphs()) {
        graphSearchTexts.set(g.graph_id, buildSearchableText(g));
    }
}

/**
 * Score how relevant a graph is to a query.
 * Returns a 0-1 score based on keyword overlap between query terms and graph metadata.
 *
 * Scoring strategy:
 *  - Each query term that appears in the graph's searchable text adds to the score
 *  - Matches in topics/routing_keywords are weighted higher (2x) than description matches
 *  - Living graphs get a modest freshness boost (+0.05)
 *  - Brand-name queries (single capitalized word) always include domain graphs
 */
export function scoreGraphRelevance(query: string, g: CatalogGraph): number {
    const queryLower = query.toLowerCase();
    
    // Stopwords that shouldn't contribute to routing relevance
    const stopWords = new Set([
        'trend', 'trends', 'consumer', 'consumers', 'report', 'reports',
        'industry', 'data', 'future', 'insight', 'insights', 'analysis',
        'what', 'how', 'why', 'who', 'when', 'where', 'are', 'the', 'and', 'for', 'with'
    ]);

    const queryTerms = queryLower
        .split(/\s+/)
        .filter(t => t.length > 2) // Skip very short words (a, in, of, etc.)
        .map(t => t.replace(/[^a-z0-9]/g, '')) // Strip punctuation
        .filter(t => t.length > 2 && !stopWords.has(t));

    if (queryTerms.length === 0) return 0;

    const searchText = graphSearchTexts.get(g.graph_id) || buildSearchableText(g);
    const topicsText = [...(g.topics || []), ...(g.routing_keywords || [])].join(' ').toLowerCase();
    const domainText = (g.domain || '').toLowerCase();

    let matchedTerms = 0;
    let highValueMatches = 0;

    for (const term of queryTerms) {
        if (searchText.includes(term)) {
            matchedTerms++;
            // High-value match: the term appears in topics, routing_keywords, or domain
            if (topicsText.includes(term) || domainText.includes(term)) {
                highValueMatches++;
            }
        }
    }

    if (matchedTerms === 0) return 0;

    // Base score: fraction of query terms that match
    let score = matchedTerms / queryTerms.length;

    // Boost for high-value matches (topics/domain/routing)
    score += (highValueMatches / queryTerms.length) * 0.3;

    // Living graphs (any type with recurring updates) get a modest freshness boost
    const isLiving = g.update_frequency && !['One-Off', 'Coming Soon'].includes(g.update_frequency);
    if (isLiving) {
        score += 0.05;  // Freshness tiebreaker, not an inclusion floor
    }

    return Math.min(score, 1.0);
}

/**
 * Classify a graph into its operational tier based on type + update cadence.
 * Living = actively maintained, freshest data. Static = frozen specialist snapshot.
 * Report = industry analysis (may be ongoing or one-off).
 */
export function classifyGraphTier(g: CatalogGraph): 'living' | 'static_expert' | 'report' | 'supplemental' | 'skill' {
    if (g.graph_type === 'supplemental') return 'supplemental';
    if (g.graph_type === 'skill') return 'skill';

    const isRecurring = g.update_frequency &&
        !['One-Off', 'Coming Soon'].includes(g.update_frequency);

    // Domain graphs with recurring updates + experts with recurring updates = Living
    if ((g.graph_type === 'domain' || g.graph_type === 'expert') && isRecurring) {
        return 'living';
    }

    if (g.graph_type === 'expert') return 'static_expert';
    if (g.graph_type === 'industry report') return 'report';

    return 'report'; // fallback for any unclassified
}

export interface GraphRelevanceResult {
    graph: CatalogGraph;
    score: number;
    graphTier: 'living' | 'static_expert' | 'report' | 'supplemental' | 'skill';
}

/**
 * Get the graphs most relevant to a query, using 2-step routing:
 * 1. Score every live graph's metadata against the query
 * 2. Return only graphs above the relevance threshold
 *
 * Always returns at least `minGraphs` results to avoid blind spots.
 * Maximum of `maxGraphs` to cap fan-out.
 *
 * @param query - The user's search query
 * @param minGraphs - Minimum graphs to return (default 2)
 * @param maxGraphs - Maximum graphs to return (default 6)
 * @param threshold - Minimum relevance score (default 0.15)
 */
export function getRelevantGraphs(
    query: string,
    minGraphs: number = 4,
    maxGraphs: number = 15,
    threshold: number = 0.10,
): GraphRelevanceResult[] {
    const allGraphs = getLiveGraphs().filter(g =>
        (g.graph_type === 'domain' || g.graph_type === 'expert' || g.graph_type === 'industry report') && g.graph_id !== 'waldo'
    );

    if (allGraphs.length === 0) return [];

    // Runtime check: skip graphs that have no synced content in Neo4j.
    // These are registry shells — the Airtable record exists as 'live' but the
    // Neo4j sync step hasn't run yet (trend_count=0, last_synced=null).
    // Once the CE pipeline syncs them, they'll automatically start routing.
    const hasContent = (g: CatalogGraph): boolean =>
        (g.trend_count > 0) || (g.last_synced !== null && g.last_synced !== undefined);

    const syncedGraphs = allGraphs.filter(hasContent);
    const skippedShells = allGraphs.length - syncedGraphs.length;
    if (skippedShells > 0) {
        console.error(`[graphRouter] Skipped ${skippedShells} unsynced graph shell(s) (trend_count=0, last_synced=null)`);
    }

    // ── Phase 0: Direct name matching ──
    // When users explicitly name a graph, curator, or company (e.g. "Pull from
    // TBWA/Alyson Stevens Macro, SIC (Ben Dietz), Marieke Neleman..."), keyword
    // scoring dilutes these names across 100+ query terms, dropping them below
    // the threshold. Direct matches get automatic inclusion at score 1.0.
    const queryLower = query.toLowerCase();
    const directMatchIds = new Set<string>();

    for (const g of syncedGraphs) {
        // Check graph_id (e.g., "alyson-stevens-macro", "sic")
        if (queryLower.includes(g.graph_id)) {
            directMatchIds.add(g.graph_id);
            continue;
        }

        // Check curator full name (e.g., "Alyson Stevens", "Ben Dietz")
        const curatorLower = (g.curator || '').toLowerCase();
        if (curatorLower && curatorLower.length > 3 && queryLower.includes(curatorLower)) {
            directMatchIds.add(g.graph_id);
            continue;
        }

        // Check curator last name (>3 chars to avoid false positives like "AI", "NIQ")
        const curatorParts = curatorLower.split(/\s+/);
        const curatorLastName = curatorParts[curatorParts.length - 1];
        if (curatorLastName && curatorLastName.length > 3 && queryLower.includes(curatorLastName)) {
            directMatchIds.add(g.graph_id);
            continue;
        }

        // Check company name (e.g., "TBWA", "Delta", "Havas", "Kantar")
        const companyLower = (g.company || '').toLowerCase();
        if (companyLower && companyLower.length > 2 && queryLower.includes(companyLower)) {
            directMatchIds.add(g.graph_id);
            continue;
        }

        // Check graph name (e.g., "SIC", "Connection Index")
        const nameLower = (g.name || '').toLowerCase();
        if (nameLower && nameLower.length > 3 && queryLower.includes(nameLower)) {
            directMatchIds.add(g.graph_id);
            continue;
        }
    }

    if (directMatchIds.size > 0) {
        console.error(`[graphRouter] Phase 0 direct name matches: ${[...directMatchIds].join(', ')}`);
    }

    // Score ALL graph types together — domain, expert, industry report compete on merit
    const scored: GraphRelevanceResult[] = syncedGraphs.map(g => ({
        graph: g,
        score: directMatchIds.has(g.graph_id) ? 1.0 : scoreGraphRelevance(query, g),
        graphTier: classifyGraphTier(g),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take all above threshold, respecting min/max bounds
    // Direct matches always pass (score 1.0 >> threshold)
    const aboveThreshold = scored.filter(s => s.score >= threshold);
    const resultCount = Math.max(minGraphs, Math.min(aboveThreshold.length, maxGraphs));

    // Always take the top N (even if some are below threshold, to meet minGraphs)
    const results = scored.slice(0, resultCount);

    // ── Tier diversity guarantee ──
    // Domain graphs have keyword-rich metadata that naturally wins pure keyword scoring.
    // Ensure at least 1 report and 1 expert appear when scored candidates exist,
    // so the user always gets insight from multiple source types.
    const ensureTierPresent = (tier: string) => {
        if (results.some(r => r.graphTier === tier)) return; // already represented
        const best = scored.find(s => s.graphTier === tier && s.score > 0);
        if (!best) return; // no scored candidate of this tier
        // Replace the lowest-scoring result (if our candidate scores >= 50% of it)
        const weakest = results[results.length - 1];
        if (weakest && best.score >= weakest.score * 0.5) {
            results[results.length - 1] = best;
        } else {
            // Or just append (we'll slightly exceed maxGraphs but gain diversity)
            results.push(best);
        }
    };
    ensureTierPresent('report');
    ensureTierPresent('static_expert');

    console.error(`[graphRouter] Query: "${query.substring(0, 60)}..." → ${results.length}/${syncedGraphs.length} synced graphs selected (${skippedShells} shells skipped): ${results.map(r => `${r.graph.graph_id}(${r.score.toFixed(2)},${r.graphTier})`).join(', ')}`);

    return results;
}

