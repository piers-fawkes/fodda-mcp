/**
 * Fodda Research Agent — System Instruction Builder
 *
 * Loads the 5 skill files and assembles a system instruction for the
 * Gemini Interactions API. This is the "agent" — a skill-injected system
 * prompt that tells Gemini how to conduct Fodda-style research.
 *
 * Usage:
 *   import { buildResearcherInstruction } from './agents/fodda-researcher/index.js';
 *   const systemInstruction = buildResearcherInstruction(query, graphContext);
 */

import {
    SKILL_RESEARCH_METHODOLOGY,
    SKILL_EVIDENCE_CATEGORIES,
    SKILL_OUTPUT_FORMAT,
    SKILL_GRAPH_AWARENESS,
    SKILL_SOURCE_QUALITY,
} from './skills.js';

/**
 * Context about pre-fetched Fodda graph results, injected into the
 * system instruction so the agent can reference existing knowledge.
 */
export interface GraphContext {
    /** Pre-fetched trends from Fodda graphs, stringified JSON */
    graphResults?: string;
    /** Which graphs were searched */
    graphsSearched?: string[];
    /** Total trends found across all graphs */
    totalTrends?: number;
    /** Total evidence pieces collected */
    totalEvidence?: number;
    /** Optional specific graph to focus on (undefined = search all) */
    focusGraphId?: string | undefined;
    /** Pre-fetched earnings-call intelligence (stringified JSON), present when
     *  the source router flagged a public company / sector / earnings angle */
    earningsResults?: string;
    /** Pre-fetched supplemental/macro data (stringified JSON), present when
     *  the source router detected relevant supplemental categories (macro,
     *  demographics, trade, food_economics, commodities) */
    supplementalResults?: string;
    /** Sub-themes generated or passed for this research run */
    subThemesUsed?: string[];
}

/**
 * Build the complete system instruction for the Fodda Research Agent.
 *
 * Concatenates all 5 skill files with a mission preamble and any
 * graph context that was pre-fetched from Fodda's knowledge graphs.
 */
export function buildResearcherInstruction(
    query: string,
    context?: GraphContext,
): string {
    const sections: string[] = [];

    // ── Mission preamble ──
    sections.push(`You are the Fodda Research Agent — an autonomous deep researcher that produces 
editorial-quality intelligence reports by combining curated knowledge graph data 
with web research.

Your research query is: "${query}"
${context?.subThemesUsed && context.subThemesUsed.length > 0 ? `\nResearch sub-themes to address (you MUST address ALL of these):\n${context.subThemesUsed.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}
${context?.focusGraphId ? `\nFocus graph: ${context.focusGraphId}` : 'Search all accessible knowledge graphs.'}

Follow the skills below precisely. They encode Fodda's research methodology, 
evidence standards, output format, graph attribution rules, and source quality 
requirements.

---`);

    // ── Skills ──
    sections.push(SKILL_RESEARCH_METHODOLOGY);
    sections.push('---');
    sections.push(SKILL_EVIDENCE_CATEGORIES);
    sections.push('---');
    sections.push(SKILL_OUTPUT_FORMAT);
    sections.push('---');
    sections.push(SKILL_GRAPH_AWARENESS);
    sections.push('---');
    sections.push(SKILL_SOURCE_QUALITY);

    // ── Pre-fetched graph context ──
    if (context?.graphResults) {
        sections.push('---');
        sections.push(`# Pre-Loaded Knowledge Graph Data

The following trends and evidence were pre-fetched from Fodda's knowledge graphs. 
Use this as your PRIMARY source material. Supplement with Google Search only for 
themes not covered here.

Graphs searched: ${context.graphsSearched?.join(', ') || 'unknown'}
Total trends found: ${context.totalTrends ?? 'unknown'}
Total evidence pieces: ${context.totalEvidence ?? 'unknown'}

## Graph Data
${context.graphResults}`);
    }

    // ── Pre-fetched earnings-call intelligence ──
    if (context?.earningsResults) {
        sections.push('---');
        sections.push(`# Pre-Loaded Earnings Call Intelligence

The following earnings-call evidence was pre-fetched because the query involves a
public company, sector, or earnings-shaped question. Treat it as primary source
material alongside the graph data.

Attribution rule: attribute earnings findings by source TYPE, naming the company
and period — e.g. "per Ulta's Q1 earnings call…" or "per management commentary on
Marriott's latest earnings call…". Never attribute earnings data to a knowledge
graph, and never cite it as generic web research. The same source-type attribution
applies to any supplemental/institutional data ("per FRED consumer confidence
data…").

## Earnings Data
${context.earningsResults}`);
    }

    // ── Pre-fetched supplemental / macro data ──
    if (context?.supplementalResults) {
        sections.push('---');
        sections.push(`# Pre-Loaded Supplemental / Macro Data

The following macro-economic, demographic, or institutional data was pre-fetched
because the source router detected supplemental categories relevant to the query.
Treat it as primary source material alongside graph and earnings data.

Attribution rule: cite by institutional source — e.g. "per FRED consumer
confidence data…", "per Census Bureau retail figures…", "per BLS employment
data…", "per OECD economic outlook…". Never attribute institutional data to a
knowledge graph or generic web search.

## Supplemental Data
${context.supplementalResults}`);
    }

    return sections.join('\n\n');
}
