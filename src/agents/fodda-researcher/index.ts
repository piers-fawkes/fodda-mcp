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

    return sections.join('\n\n');
}
