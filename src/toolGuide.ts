/**
 * Tool Guide — Runtime prompt-oriented 5-section guide for Fodda MCP tools.
 * Sourced from the Prompt Guide's five sections:
 * 1. Research
 * 2. Pressure-test
 * 3. Ask an expert
 * 4. Make something
 * 5. Track
 *
 * Rules:
 * - Built from registered tools at runtime (filtered by isToolCallable) so it never drifts
 * - Hand-written 'what you get', 'when to use', and canonical example prompts
 * - Free or charged status derived dynamically from pricing table (getToolCostSummary())
 * - Absolutely NO internals: no Neo4j, Cypher, graph traversal, or recipe steps
 */

import { getToolCostSummary } from './pricingCache.js';

export type ToolGuideSection =
    | 'Research'
    | 'Pressure-test'
    | 'Ask an expert'
    | 'Make something'
    | 'Track';

export interface ToolGuideDefinition {
    section: ToolGuideSection;
    what_you_get: string;
    when_to_use: string;
    example_prompt: string;
}

/**
 * Curated metadata per tool.
 * Hand-written "what you get" and "when to use" kept next to tool registrations,
 * with example prompts matching Prompt Guide and sample_prompts in /v1/capabilities.
 */
export const TOOL_GUIDE_DEFINITIONS: Record<string, ToolGuideDefinition> = {
    // ── 1. Research ───────────────────────────────────────────────
    search_graph: {
        section: 'Research',
        what_you_get: 'Curated trend signals, evidence nodes, and consumer market developments across 100+ knowledge graphs.',
        when_to_use: 'Use when exploring a topic, sector, or category to understand emerging signals and market behavior.',
        example_prompt: "What's changing in prestige beauty?"
    },
    brand_tracker: {
        section: 'Research',
        what_you_get: '360-degree brand health, trend footprint, competitor co-occurrences, and search momentum.',
        when_to_use: 'Use whenever a prompt names a specific commercial brand or company to audit its market footprint.',
        example_prompt: "Research Nike's current positioning."
    },
    deep_research_topic: {
        section: 'Research',
        what_you_get: 'Autonomous multi-graph research report synthesizing market evidence, corporate signals, and expert perspectives.',
        when_to_use: 'Use when you need an exhaustive, structured research briefing deck on a complex strategic topic.',
        example_prompt: 'Write a comprehensive briefing on how Gen Z is reshaping luxury retail in APAC.'
    },
    get_domain_intelligence: {
        section: 'Research',
        what_you_get: 'Curated vertical-specific trends, statistics, and signals from domain libraries (retail, tech, beauty, food, sports).',
        when_to_use: 'Use for rapid vertical sector intelligence and domain-level trend overviews.',
        example_prompt: 'Search specialist graphs for youth culture and underground streetwear signals.'
    },
    get_report_intelligence: {
        section: 'Research',
        what_you_get: 'Executive decks, findings, and forecast reports from published corporate research and industry whitepapers.',
        when_to_use: 'Use when researching published market reports, whitepapers, or industry decks.',
        example_prompt: 'Synthesize key findings from recent retail strategy reports.'
    },
    get_intelligence_dossier: {
        section: 'Research',
        what_you_get: 'Certified multi-source evidence dossier synthesizing trend nodes, corporate disclosures, and quantitative statistics.',
        when_to_use: 'Use when preparing a comprehensive evidence dossier for executive review or strategy formulation.',
        example_prompt: 'Create an evidence dossier on circularity in sportswear.'
    },
    search_statistics: {
        section: 'Research',
        what_you_get: 'Curated quantitative metrics, market data points, and hard numbers from primary sources.',
        when_to_use: 'Use when you need concrete statistics, growth percentages, or market sizing figures.',
        example_prompt: 'Find quantitative statistics on EV charging infrastructure growth.'
    },
    get_evidence: {
        section: 'Research',
        what_you_get: 'Primary source citations, publisher articles, and case studies validating a specific trend node.',
        when_to_use: 'Use when verifying original citations, publisher reports, or concrete brand examples for a trend node.',
        example_prompt: 'Retrieve primary evidence articles backing the circular packaging trend.'
    },
    get_node: {
        section: 'Research',
        what_you_get: 'Full metadata profile of a trend node: lifecycle stage, signal strength, geographic scope, and properties.',
        when_to_use: 'Use when inspecting the complete properties and lifecycle stage of a specific trend.',
        example_prompt: 'Get full node details and signal strength for trend 2507.0.'
    },
    get_neighbors: {
        section: 'Research',
        what_you_get: 'Connected entities, related brands, technologies, and cross-domain links for a seed trend node.',
        when_to_use: 'Use after search to map relationships, connected brands, and territory around a trend.',
        example_prompt: 'Explore connected brands and related trends for seed node 2507.0.'
    },
    get_company_earnings: {
        section: 'Research',
        what_you_get: 'Executive commentary, guidance updates, verbatim analyst Q&A exchanges, and financial snapshots from SEC earnings calls.',
        when_to_use: 'Use when analyzing earnings statements, executive sentiment, or analyst questions for a specific ticker.',
        example_prompt: 'What are retail executives saying about inventory levels?'
    },
    get_earnings_intelligence: {
        section: 'Research',
        what_you_get: 'Cross-company earnings trends, key themes, and management commentary across reporting quarters.',
        when_to_use: 'Use for cross-company earnings synthesis across a sector or peer group.',
        example_prompt: 'Pull verified trends from recent retail earnings calls.'
    },
    get_validated_trends: {
        section: 'Research',
        what_you_get: 'Trends explicitly corroborated by corporate earnings call disclosures.',
        when_to_use: 'Use when filtering trends down to those backed by public company executive disclosures.',
        example_prompt: 'Show validated trends in consumer payments mentioned in quarterly earnings.'
    },
    get_supplemental_context: {
        section: 'Research',
        what_you_get: 'Live macroeconomic, regulatory, demographic, and trade data from institutional databases (FRED, BEA, BLS, Census).',
        when_to_use: 'Use to contextualize trends with real-time economic indicators and government statistics.',
        example_prompt: 'Pull FRED and Census context on consumer discretionary spending.'
    },
    read_url: {
        section: 'Research',
        what_you_get: 'Structured webpage content extracted and matched against Fodda knowledge graphs.',
        when_to_use: 'Use to cross-reference an external article, client brief, or competitor URL against Fodda intelligence.',
        example_prompt: 'Analyze this competitor announcement URL against category trends.'
    },
    list_graphs: {
        section: 'Research',
        what_you_get: 'Directory of accessible curated, expert, and community knowledge graphs with topics and curators.',
        when_to_use: 'Use to discover available knowledge graphs and their domain coverage.',
        example_prompt: 'List available knowledge graphs covering fashion and retail.'
    },
    get_label_values: {
        section: 'Research',
        what_you_get: 'Distinct taxonomies, lifecycle stages, categories, and filter values available within a graph.',
        when_to_use: 'Use to discover valid filter parameters and taxonomy structures for search_graph.',
        example_prompt: 'Show available categories and lifecycle stages in the retail graph.'
    },
    search_insights: {
        section: 'Research',
        what_you_get: 'Unified search across signals, articles, case studies, and executive quotes.',
        when_to_use: 'Use to retrieve broad insight snippets across diverse content types.',
        example_prompt: 'Search for consumer sentiment insights around grocery inflation.'
    },
    discover_adjacent_trends: {
        section: 'Research',
        what_you_get: 'Peripheral signals and adjacent trends from neighboring categories.',
        when_to_use: 'Use to discover weak signals and emerging movements bordering a known trend.',
        example_prompt: 'Discover adjacent trends connected to plant-based dairy.'
    },

    // ── 2. Pressure-test ──────────────────────────────────────────
    verify_market_claim: {
        section: 'Pressure-test',
        what_you_get: "Anti-hallucination factual claim evaluation scored across Fodda's 5 verification criteria.",
        when_to_use: 'Use to test a strategic premise or market thesis against verified evidence and counter-signals.',
        example_prompt: 'We think Gen Z is moving away from traditional luxury. Pressure-test that.'
    },
    verify_claim: {
        section: 'Pressure-test',
        what_you_get: 'Verification verdict (confirmed, challenged, unsupported) with primary evidence citations.',
        when_to_use: 'Use to verify specific factual claims against underlying knowledge graphs.',
        example_prompt: 'Pressure-test whether plant-based meat sales declined in Q4.'
    },
    get_earnings_divergence: {
        section: 'Pressure-test',
        what_you_get: 'Analyst-management divergence analysis where executive answers deflect analyst questions.',
        when_to_use: 'Use to uncover friction, defensive framing, or conflicting signals in earnings calls.',
        example_prompt: 'Show analyst-management divergence for hotel companies in Q1.'
    },

    // ── 3. Ask an expert ──────────────────────────────────────────
    find_expert: {
        section: 'Ask an expert',
        what_you_get: 'Ranked list of verified specialists, living Human Agents, and analysts matching your query.',
        when_to_use: 'Use when searching for the right domain expert, practitioner, or methodology to answer a question.',
        example_prompt: 'Who should I ask about clean beauty formulations?'
    },
    consult_human_agent: {
        section: 'Ask an expert',
        what_you_get: "Direct consultation with a verified living expert's Human Agent grounded in their curated graph and methodology.",
        when_to_use: "Use to gain a named practitioner's strategic perspective, conceptual frameworks, and domain calibration.",
        example_prompt: 'Consult Ben Dietz to evaluate our streetwear collaboration strategy.'
    },
    consult_analyst: {
        section: 'Ask an expert',
        what_you_get: 'Consultation with a synthetic domain analyst, C-Suite persona, or classic thinker grounded in domain graphs.',
        when_to_use: 'Use for executive role pressure-testing (e.g. CMO, CFO) or specialized domain analysis.',
        example_prompt: "Consult Brand CMO on Nike's direct-to-consumer strategy."
    },
    request_expert_intro: {
        section: 'Ask an expert',
        what_you_get: 'Advisory introduction or 1-on-1 consultation booking request submitted to a living practitioner.',
        when_to_use: 'Use to request human advisory time or connect directly with an On-Request or active Human Agent.',
        example_prompt: 'Request an introduction to Roxane Prieux for clean beauty advisory.'
    },
    list_analysts: {
        section: 'Ask an expert',
        what_you_get: 'Full roster of available Human Agents, C-Suite personas, Classic Agents, and synthetic analysts.',
        when_to_use: 'Use to explore all available expert personas and their coverage areas.',
        example_prompt: 'List available Human Agents and C-Suite analysts.'
    },

    // ── 4. Make something ─────────────────────────────────────────
    request_deliverable: {
        section: 'Make something',
        what_you_get: 'Commissioned executive document, strategy memo, presentation, or article prepared by an expert.',
        when_to_use: 'Use when commissioning an analyst or Human Agent to produce a finished strategic deliverable.',
        example_prompt: 'Have Ben Dietz write a strategic memo on retail media networks.'
    },
    check_deliverable_status: {
        section: 'Make something',
        what_you_get: 'Status and download links for a commissioned deliverable job.',
        when_to_use: 'Use to poll the progress of an asynchronous deliverable until completed.',
        example_prompt: 'Check status of deliverable job job_12345.'
    },
    generate_comms_plan: {
        section: 'Make something',
        what_you_get: 'Agency-grade comms and retail media activation plan with audience cards and channel strategy.',
        when_to_use: 'Use to turn trend research into an actionable marketing, media, or retail activation plan.',
        example_prompt: 'Generate an agency comms and retail media activation plan for non-alcoholic spirits.'
    },
    draft_linkedin_post: {
        section: 'Make something',
        what_you_get: 'Evidence-backed LinkedIn post draft citing verified graph data points and executive takeaways.',
        when_to_use: 'Use to convert research insights into a high-engagement thought leadership post.',
        example_prompt: 'Draft an evidence-backed LinkedIn post about retail media networks.'
    },
    draft_linkedin_article: {
        section: 'Make something',
        what_you_get: 'Comprehensive long-form LinkedIn article with structured sections, statistics, and citations.',
        when_to_use: 'Use to create an authoritative thought leadership article from graph research.',
        example_prompt: 'Draft an executive LinkedIn article on sustainable packaging innovations.'
    },
    brainstorm_topic: {
        section: 'Make something',
        what_you_get: 'Structured brainstorm map showing adjacent territories, unexpected cross-domain links, and key brands.',
        when_to_use: 'Use for creative ideation, discovering non-obvious connections, or workshop preparation.',
        example_prompt: 'Brainstorm adjacent opportunities for oat milk brands in wellness.'
    },

    // ── 5. Track ──────────────────────────────────────────────────
    manage_scheduled_reports: {
        section: 'Track',
        what_you_get: 'Recurring intelligence briefs delivered on your schedule (weekly/monthly) tracking topic shifts.',
        when_to_use: 'Use to create, update, or cancel recurring monitoring on brands, competitors, or themes.',
        example_prompt: 'Set up weekly tracking on GLP-1 impact in grocery.'
    }
};

export interface ToolGuideItem {
    tool: string;
    what_you_get: string;
    when_to_use: string;
    example_prompt: string;
    cost: 'Free' | 'Charged';
    api_calls_charged?: number;
}

export interface ToolGuideSectionGroup {
    section: ToolGuideSection;
    description: string;
    tools: ToolGuideItem[];
}

export interface ToolGuideResponse {
    ok: boolean;
    view: 'tools';
    prompt_guide_url: string;
    total_tools_exposed: number;
    sections: ToolGuideSectionGroup[];
}

const SECTION_DESCRIPTIONS: Record<ToolGuideSection, string> = {
    'Research': 'Explore market evidence, trends, brand footprints, corporate reports, and statistics across 100+ knowledge graphs.',
    'Pressure-test': 'Challenge a strategy, hypothesis, or pitch against primary evidence, earnings divergence, and counter-arguments.',
    'Ask an expert': 'Consult verified Human Agents (practitioners with digital twins), C-Suite personas, and specialist analysts.',
    'Make something': 'Turn verified intelligence into finished work product: strategy briefs, comms plans, articles, and executive memos.',
    'Track': 'Establish recurring intelligence monitoring to stay updated on brand moves, competitor shifts, and category signals.'
};

const SECTION_ORDER: ToolGuideSection[] = [
    'Research',
    'Pressure-test',
    'Ask an expert',
    'Make something',
    'Track'
];

/**
 * Generate the 5-section Tool Guide at runtime.
 * Filters to only tools exposed on the caller's server endpoint (respecting offering-scoped tool subsets).
 */
export function generateToolGuide(isToolCallable: (toolName: string) => boolean): ToolGuideResponse {
    // 1. Get live billable tool summary from pricingCache
    let billableMap = new Map<string, number>();
    try {
        const summary = getToolCostSummary();
        for (const item of summary) {
            billableMap.set(item.tool, item.apiCalls);
        }
    } catch {
        // If pricingCache isn't initialized yet, default to empty
    }

    // 2. Group callable tools by section
    const grouped = new Map<ToolGuideSection, ToolGuideItem[]>();
    for (const sec of SECTION_ORDER) {
        grouped.set(sec, []);
    }

    let exposedCount = 0;

    for (const [toolName, def] of Object.entries(TOOL_GUIDE_DEFINITIONS)) {
        if (!isToolCallable(toolName)) {
            continue;
        }

        exposedCount++;
        const apiCalls = billableMap.get(toolName) ?? 0;
        const isCharged = apiCalls > 0;

        const item: ToolGuideItem = {
            tool: toolName,
            what_you_get: def.what_you_get,
            when_to_use: def.when_to_use,
            example_prompt: def.example_prompt,
            cost: isCharged ? 'Charged' : 'Free',
            ...(isCharged ? { api_calls_charged: apiCalls } : {})
        };

        const secList = grouped.get(def.section);
        if (secList) {
            secList.push(item);
        }
    }

    const sections: ToolGuideSectionGroup[] = SECTION_ORDER.map(section => ({
        section,
        description: SECTION_DESCRIPTIONS[section],
        tools: grouped.get(section) || []
    })).filter(g => g.tools.length > 0);

    return {
        ok: true,
        view: 'tools',
        prompt_guide_url: 'https://www.fodda.ai/prompt-guide',
        total_tools_exposed: exposedCount,
        sections
    };
}
