/**
 * 5-Pillar Editorial & Network Synthesis for Report Intelligence.
 *
 * Implements the Fodda Editorial Briefing Architecture:
 * - Pillar 1: Core Tension / Topline Hook
 * - Pillar 2: Core Shifts & Dramatic Evidence (3-5 structural shifts + metrics)
 * - Pillar 3: Cross-Graph Network Evidence (validates / contrasts / related with provenance)
 * - Pillar 4: Human Expert Digital Twin Spotlight (twin position + consult link)
 * - Pillar 5: Actionable Follow-Up Moves & Quick Links (runnable tool calls)
 */

import { callGemini } from './editorialFill.js';
import { getLiveGraphs, getGraphs, getAnalysts } from './catalogCache.js';
import type { CatalogGraph, CatalogAnalyst } from './catalogCache.js';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface ReportShift {
    title: string;
    narrative: string;
    stats: string[];
    evidence: string[];
    generated: boolean;
}

export interface NetworkSignal {
    title: string;
    source_report: string;
    graph_id: string;
    curator?: string | undefined;
    signal_type: 'validates' | 'contrasts' | 'related';
    snippet: string;
    score?: number | undefined;
    url: string;
}

export interface ExpertSpotlight {
    name: string;
    slug?: string | undefined;
    analyst_id: string;
    why_matched: string;
    position: string;
    consult_url?: string | undefined;
    consult_tool: string;
    generated: boolean;
}

export interface FollowUpMove {
    prompt: string;
    tool: string;
    args: Record<string, any>;
    app_url: string;
}

export interface ReportBriefingPayload {
    view: 'editorial';
    query: string;
    report_title?: string | undefined;
    primary_graph_id?: string | undefined;
    topline_hook: {
        text: string;
        generated: boolean;
    };
    shifts: ReportShift[];
    network_signals: NetworkSignal[];
    expert_spotlight?: ExpertSpotlight | undefined;
    follow_ups: FollowUpMove[];
    briefing_markdown: string;
    coverage?: any;
}

export interface ExtractedEvidence {
    stats: string[];
    snippets: string[];
    caseStudies: string[];
}

// ---------------------------------------------------------------------------
// Evidence Extraction (handles object & array forms from live API)
// ---------------------------------------------------------------------------

export function extractEvidenceFromRow(row: any): ExtractedEvidence {
    const stats: string[] = [];
    const snippets: string[] = [];
    const caseStudies: string[] = [];

    if (!row) return { stats: [], snippets: [], caseStudies: [] };

    // 1. Object form: evidence: { statistics: [...], case_studies: [...], quotes: [...] }
    if (row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence)) {
        if (Array.isArray(row.evidence.statistics)) {
            for (const s of row.evidence.statistics) {
                const statText = s.stat || s.percentage || s.metric || s.number || (typeof s === 'string' ? s : s.text);
                if (statText) stats.push(String(statText).trim());
                const snip = s.snippet || s.description || s.title || (typeof s === 'string' ? s : '');
                if (snip) snippets.push(String(snip).trim());
            }
        }
        if (Array.isArray(row.evidence.case_studies)) {
            for (const cs of row.evidence.case_studies) {
                const csTitle = cs.title || cs.name || cs.brand || (typeof cs === 'string' ? cs : '');
                const csSnip = cs.snippet || cs.description || cs.summary || (typeof cs === 'string' ? cs : '');
                if (csTitle || csSnip) {
                    const fullCs = [csTitle, csSnip].filter(Boolean).join(': ');
                    caseStudies.push(fullCs);
                    snippets.push(fullCs);
                }
            }
        }
        if (Array.isArray(row.evidence.quotes)) {
            for (const q of row.evidence.quotes) {
                const snip = q.snippet || q.text || q.quote || (typeof q === 'string' ? q : '');
                if (snip) snippets.push(String(snip).trim());
            }
        }
        if (Array.isArray(row.evidence.items)) {
            for (const item of row.evidence.items) {
                const snip = typeof item === 'string' ? item : (item.snippet || item.title || '');
                if (snip) snippets.push(String(snip).trim());
            }
        }
    } else if (Array.isArray(row.evidence)) {
        // Array form: evidence: [{ title, snippet, stat, percentage }]
        for (const e of row.evidence) {
            const statText = e.stat || e.percentage || e.metric || e.number;
            if (statText) stats.push(String(statText).trim());
            const snip = typeof e === 'string' ? e : (e.snippet || e.title || e.description || '');
            if (snip) snippets.push(String(snip).trim());
        }
    }

    // 2. Direct top-level fields
    if (row.stat || row.percentage) stats.push(String(row.stat || row.percentage).trim());
    if (Array.isArray(row.metrics)) {
        for (const m of row.metrics) stats.push(String(m).trim());
    }
    if (Array.isArray(row.statistics)) {
        for (const s of row.statistics) {
            const st = typeof s === 'string' ? s : (s.stat || s.text || s.snippet);
            if (st) stats.push(String(st).trim());
        }
    }
    if (Array.isArray(row.case_studies)) {
        for (const cs of row.case_studies) {
            const csText = typeof cs === 'string' ? cs : [cs.title || cs.name, cs.snippet || cs.summary].filter(Boolean).join(': ');
            if (csText) caseStudies.push(csText);
        }
    }

    return {
        stats: Array.from(new Set(stats)).filter(Boolean),
        snippets: Array.from(new Set(snippets)).filter(Boolean),
        caseStudies: Array.from(new Set(caseStudies)).filter(Boolean),
    };
}

// ---------------------------------------------------------------------------
// Helpers: Graph & Expert Resolution
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
}

/**
 * Resolve primary report graph from query string and result rows.
 */
export function resolvePrimaryReportGraph(query: string, resultRows: any[] = []): CatalogGraph | undefined {
    const allGraphs = getLiveGraphs().length > 0 ? getLiveGraphs() : getGraphs();
    const reportGraphs = allGraphs.filter(g => g.graph_type === 'industry report' || g.graph_type === 'report');
    if (reportGraphs.length === 0) return undefined;

    const normQuery = normalizeText(query);
    const queryTokens = normQuery.split(/\s+/).filter(t => t.length > 2);

    // 1. Direct match on organization/curator or graph name in query
    let bestGraph: CatalogGraph | undefined;
    let maxMatchScore = 0;

    for (const g of reportGraphs) {
        let matchScore = 0;
        const normName = normalizeText(g.name);
        const normCurator = normalizeText(g.curator);
        const normCompany = normalizeText(g.company);
        const normId = normalizeText(g.graph_id.replace(/-/g, ' '));

        if (normCurator && normQuery.includes(normCurator)) matchScore += 10;
        if (normCompany && normQuery.includes(normCompany)) matchScore += 10;
        if (normName && normQuery.includes(normName)) matchScore += 8;
        if (normId && normQuery.includes(normId)) matchScore += 5;

        // Token matches
        for (const token of queryTokens) {
            if (normName.includes(token)) matchScore += 1;
            if (normCurator.includes(token)) matchScore += 2;
            if (normCompany.includes(token)) matchScore += 2;
        }

        if (matchScore > maxMatchScore) {
            maxMatchScore = matchScore;
            bestGraph = g;
        }
    }

    if (bestGraph && maxMatchScore >= 5) {
        return bestGraph;
    }

    // 2. Resolve from highest density / highest scoring graph in result rows
    if (resultRows.length > 0) {
        const graphCounts = new Map<string, { count: number; totalScore: number }>();
        for (const row of resultRows) {
            const gid = row.graph_id || row.graphId || '';
            if (!gid) continue;
            const existing = graphCounts.get(gid) || { count: 0, totalScore: 0 };
            existing.count += 1;
            const rawScore = Number(row.relevance_score ?? row.score ?? 0.5);
            existing.totalScore += rawScore;
            graphCounts.set(gid, existing);
        }

        let topGid = '';
        let topWeightedScore = -1;
        for (const [gid, stat] of graphCounts.entries()) {
            const weighted = stat.count * 2 + stat.totalScore;
            if (weighted > topWeightedScore) {
                topWeightedScore = weighted;
                topGid = gid;
            }
        }

        if (topGid) {
            const matched = reportGraphs.find(g => g.graph_id === topGid) || getGraphs().find(g => g.graph_id === topGid);
            if (matched) return matched;
        }
    }

    return bestGraph;
}

/**
 * Filter and match human expert digital twin.
 * Returns undefined if no genuine topical overlap exists (no arbitrary fallback).
 */
export function matchHumanExpertTwin(query: string, primaryGraph?: CatalogGraph | undefined): CatalogAnalyst | undefined {
    const allAnalysts = getAnalysts();
    const humanTwins = allAnalysts.filter(a => {
        return a.is_human_agent === true ||
            a.is_digital_twin === true ||
            a.isVerifiedRealPerson === true ||
            a.kind === 'human_agent' ||
            a.kind === 'human_twin' ||
            a.type === 'human_agent' ||
            a.type === 'human_twin' ||
            a.agent_type === 'human_agent' ||
            a.agent_type === 'human_twin';
    });

    if (humanTwins.length === 0) return undefined;

    const normQuery = normalizeText(`${query} ${primaryGraph?.name || ''} ${primaryGraph?.domain || ''} ${Array.isArray(primaryGraph?.topics) ? primaryGraph.topics.join(' ') : ''}`);
    const tokens = normQuery.split(/\s+/).filter(t => t.length > 3);

    let bestExpert: CatalogAnalyst | undefined;
    let maxOverlap = 0;

    for (const expert of humanTwins) {
        let score = 0;
        const expertContext = normalizeText(`${expert.name} ${expert.expert_in || ''} ${expert.what_they_offer || ''} ${Array.isArray(expert.topics) ? expert.topics.join(' ') : ''}`);

        for (const t of tokens) {
            if (expertContext.includes(t)) score += 1;
        }

        if (score > maxOverlap) {
            maxOverlap = score;
            bestExpert = expert;
        }
    }

    // Strict: only match when there is positive evidence of topical overlap
    return maxOverlap > 0 ? bestExpert : undefined;
}

/**
 * Partition result rows into primary report rows vs. other report graph candidate rows.
 */
export function partitionReportResults(resultRows: any[], primaryGraphId?: string | undefined) {
    const primaryRows: any[] = [];
    const networkRows: any[] = [];

    const seenPrimaryText = new Set<string>();

    for (const row of resultRows) {
        const gid = row.graph_id || row.graphId;
        const rowText = `${row.name || row.trend_name || ''} ${row.summary || row.description || ''}`;

        if (primaryGraphId && gid === primaryGraphId) {
            primaryRows.push(row);
            seenPrimaryText.add(normalizeText(rowText));
            const ev = extractEvidenceFromRow(row);
            for (const s of ev.snippets) seenPrimaryText.add(normalizeText(s));
            for (const cs of ev.caseStudies) seenPrimaryText.add(normalizeText(cs));
        } else {
            networkRows.push(row);
        }
    }

    // If no primary rows were separated (e.g. query spanned multiple graphs equally), split top rows
    if (primaryRows.length === 0 && resultRows.length > 0) {
        const topGid = resultRows[0]?.graph_id || resultRows[0]?.graphId;
        for (const row of resultRows) {
            const gid = row.graph_id || row.graphId;
            if (gid === topGid) {
                primaryRows.push(row);
                seenPrimaryText.add(normalizeText(`${row.name || row.trend_name || ''} ${row.summary || row.description || ''}`));
                const ev = extractEvidenceFromRow(row);
                for (const s of ev.snippets) seenPrimaryText.add(normalizeText(s));
                for (const cs of ev.caseStudies) seenPrimaryText.add(normalizeText(cs));
            } else {
                networkRows.push(row);
            }
        }
    }

    // Server-side deduplication of network rows against primary rows
    const dedupedNetworkRows = networkRows.filter(nr => {
        const nrTitle = normalizeText(nr.name || nr.trend_name || '');
        const nrText = normalizeText(`${nr.name || nr.trend_name || ''} ${nr.summary || nr.description || ''}`);
        const nrEv = extractEvidenceFromRow(nr);
        const nrAllTexts = [nrTitle, nrText, ...nrEv.snippets, ...nrEv.caseStudies].map(normalizeText);

        for (const pText of seenPrimaryText) {
            for (const text of nrAllTexts) {
                if (text.length > 15 && (pText.includes(text) || (text.length > 25 && pText.includes(text.slice(0, 25))))) {
                    return false;
                }
            }
        }
        return true;
    });

    return {
        primaryRows,
        networkRows: dedupedNetworkRows,
    };
}

// ---------------------------------------------------------------------------
// Single Unified Gemini Call & Schema
// ---------------------------------------------------------------------------

interface GeminiSynthesisOutput {
    topline_hook?: string;
    shifts?: Array<{
        title?: string;
        narrative?: string;
        stats?: string[];
        evidence?: string[];
    }>;
    network_signals?: Array<{
        graph_id?: string;
        signal_type?: 'validates' | 'contrasts' | 'related';
        connection?: string;
    }>;
    expert_stance?: string;
}

async function runGeminiSynthesis(params: {
    query: string;
    reportName: string;
    primaryRows: any[];
    networkRows: any[];
    expert?: CatalogAnalyst | undefined;
}): Promise<GeminiSynthesisOutput | null> {
    const primarySummary = params.primaryRows.slice(0, 5).map((r, i) => {
        const name = r.name || r.trend_name || `Shift ${i + 1}`;
        const desc = r.summary || r.description || '';
        const ev = extractEvidenceFromRow(r);
        const statsStr = ev.stats.slice(0, 3).join(', ');
        const snipsStr = ev.snippets.slice(0, 2).join('; ');
        return `[Shift ${i + 1}] "${name}": ${desc}\n  - Stats: ${statsStr || 'None'}\n  - Evidence: ${snipsStr || 'None'}`;
    }).join('\n');

    const networkSummary = params.networkRows.slice(0, 4).map((r, i) => {
        const gid = r.graph_id || r.graphId || `graph-${i}`;
        const matchedGraph = getLiveGraphs().find(g => g.graph_id === gid) || getGraphs().find(g => g.graph_id === gid);
        const gName = matchedGraph?.name || r.graph_name || r.graphName || gid;
        const curator = matchedGraph?.curator || matchedGraph?.company || r.curator || r.organization || 'Research Partner';
        const name = r.name || r.trend_name || 'Signal';
        const desc = r.summary || r.description || '';
        const ev = extractEvidenceFromRow(r);
        const evSnippet = ev.snippets[0] || desc;
        return `[Signal ${i + 1}] GraphID: "${gid}" | Report: "${gName}" by ${curator} | Finding: "${name}" - ${evSnippet}`;
    }).join('\n');

    const expertContext = params.expert
        ? `Matched Expert Twin: ${params.expert.name} (Focus: ${params.expert.expert_in || params.expert.what_they_offer || 'Strategy'})`
        : 'None';

    const prompt = `---
title: Fodda 5-Pillar Report Synthesis
compliance: RFC-2119
---

### MISSION
You are an elite research director synthesizing an executive analyst briefing from Fodda's knowledge graph network.

### INPUT DATA
- User Query: "${params.query}"
- Primary Report: "${params.reportName}"
- Primary Report Findings:
${primarySummary || '(Thin primary findings)'}

- Related Network Signals from other industry reports:
${networkSummary || '(No other report signals)'}

- ${expertContext}

### REQUIREMENTS
Produce a single JSON object with these exact keys:
1. "topline_hook": A 1-2 sentence provocative thesis and core tension stopping the reader. Do NOT lead with dry bibliographic metadata.
2. "shifts": Array of 3-5 structural shifts. Each must have:
   - "title": Sharp, evocative shift title.
   - "narrative": 1-2 sentences explaining why this shift matters.
   - "stats": Array of 1-3 concrete data points, metrics, or percentages extracted from the evidence.
   - "evidence": Array of 1-2 concrete proof points or case study mentions.
3. "network_signals": Array of 2-3 cross-graph connections. For each signal:
   - "graph_id": The exact GraphID provided in the input.
   - "signal_type": MUST be either "validates", "contrasts", or "related".
   - "connection": 1 crisp sentence explaining how this other report supports or contrasts the primary finding.
4. "expert_stance": ${params.expert ? 'A 1-sentence analytical perspective in the voice/philosophy of the matched expert twin regarding this topic.' : 'null'}

STRICT RULE: Do NOT mention tokens, shared payment tokens, SPT, or pricing mechanics.`;

    try {
        const resp = await callGemini(prompt, 'gemini-2.0-flash', 1500);
        if (!resp.text || resp.error) return null;

        let parsed: any;
        try {
            parsed = JSON.parse(resp.text);
        } catch {
            return null;
        }

        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as GeminiSynthesisOutput;
        }
        return null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pre-Rendered Markdown Formatter
// ---------------------------------------------------------------------------

function renderBriefingMarkdown(payload: {
    reportTitle: string;
    toplineHook: string;
    shifts: ReportShift[];
    networkSignals: NetworkSignal[];
    expertSpotlight?: ExpertSpotlight | undefined;
    followUps: FollowUpMove[];
}): string {
    const lines: string[] = [];

    lines.push(`# Strategic Briefing: ${payload.reportTitle}`);
    lines.push('');
    lines.push(`> **Core Tension:** ${payload.toplineHook}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Pillar 2: Core Shifts
    lines.push('### 📊 Core Structural Shifts & Evidence');
    lines.push('');
    for (const shift of payload.shifts) {
        lines.push(`#### • ${shift.title}`);
        lines.push(`${shift.narrative}`);
        if (shift.stats.length > 0) {
            lines.push('');
            for (const stat of shift.stats) {
                lines.push(`  - **Key Metric:** ${stat}`);
            }
        }
        if (shift.evidence.length > 0) {
            lines.push('');
            for (const ev of shift.evidence) {
                lines.push(`  - **Evidence:** ${ev}`);
            }
        }
        lines.push('');
    }

    // Pillar 3: Cross-Graph Network Evidence
    if (payload.networkSignals.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### 🌐 Cross-Graph Network Signals');
        lines.push('');
        for (const sig of payload.networkSignals) {
            const badge = sig.signal_type === 'validates'
                ? '✅ **Validates**'
                : (sig.signal_type === 'contrasts' ? '⚡ **Contrasts**' : '🔗 **Related Signal**');
            const curatorInfo = sig.curator ? ` (${sig.curator})` : '';
            lines.push(`- ${badge} → [${sig.source_report}](${sig.url})${curatorInfo}: ${sig.snippet}`);
        }
        lines.push('');
    }

    // Pillar 4: Expert Spotlight
    if (payload.expertSpotlight) {
        lines.push('---');
        lines.push('');
        lines.push('### 👤 Human Expert Digital Twin Spotlight');
        lines.push('');
        lines.push(`**Expert Alignment:** ${payload.expertSpotlight.name}`);
        lines.push(`*Why Matched:* ${payload.expertSpotlight.why_matched}`);
        lines.push(`> *"${payload.expertSpotlight.position}"*`);
        if (payload.expertSpotlight.consult_url) {
            lines.push(`→ **Consult ${payload.expertSpotlight.name}'s Twin:** [${payload.expertSpotlight.consult_url}](${payload.expertSpotlight.consult_url})`);
        }
        lines.push('');
    }

    // Pillar 5: Follow-Up Prompts
    if (payload.followUps.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('### 🎯 Suggested Deep-Dive Moves');
        lines.push('');
        for (const fu of payload.followUps) {
            lines.push(`- **${fu.prompt}**  `);
            lines.push(`  *Run Tool:* \`${fu.tool}(${JSON.stringify(fu.args)})\` | [Open in Fodda](${fu.app_url})`);
        }
        lines.push('');
    }

    return lines.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Main Builder: buildReportEditorialBriefing
// ---------------------------------------------------------------------------

export async function buildReportEditorialBriefing(params: {
    data: any;
    query: string;
    searchedGraphs?: CatalogGraph[];
    annotatedData?: any;
}): Promise<ReportBriefingPayload> {
    const { data, query, annotatedData } = params;

    const rawRows: any[] = Array.isArray(data?.results)
        ? data.results
        : (Array.isArray(data?.trends) ? data.trends : (Array.isArray(data?.data) ? data.data : []));

    // 1. Resolve Primary Graph & Partition Rows
    const primaryGraph = resolvePrimaryReportGraph(query, rawRows);
    const primaryGraphId = primaryGraph?.graph_id;
    const reportTitle: string = primaryGraph?.name || (rawRows[0]?.graph_name) || (rawRows[0]?.graph_id) || 'Industry Report Intelligence';

    const { primaryRows, networkRows } = partitionReportResults(rawRows, primaryGraphId);

    // 2. Pre-computed Ingestion-Time 5-Pillar Metadata (from CE / API)
    const graphEditorial = (primaryGraphId && data?.graph_editorial?.[primaryGraphId]) || {};
    const precomputedCoreTension = primaryGraph?.core_tension || graphEditorial.core_tension || rawRows[0]?.core_tension;
    const precomputedSignals = primaryGraph?.cross_graph_signals || graphEditorial.cross_graph_signals || rawRows[0]?.cross_graph_signals;
    const precomputedTwinSlug = primaryGraph?.matched_human_twin_slug || graphEditorial.matched_human_twin_slug || rawRows[0]?.matched_human_twin_slug;
    const precomputedExpertQuote = primaryGraph?.expert_stance_quote || graphEditorial.expert_stance_quote || rawRows[0]?.expert_stance_quote;

    // 3. Match Human Expert Digital Twin (Prefer pre-computed twin slug if available)
    let matchedExpert: CatalogAnalyst | undefined;
    if (precomputedTwinSlug) {
        matchedExpert = getAnalysts().find(a => (a.slug || a.expertSlug || a.analyst_id) === precomputedTwinSlug);
    }
    if (!matchedExpert) {
        matchedExpert = matchHumanExpertTwin(query, primaryGraph);
    }

    // 4. Single Unified Gemini Synthesis Call (if any fields need LLM fill)
    const needsGemini = !precomputedCoreTension || !precomputedSignals || precomputedSignals.length === 0;
    const geminiOutput = needsGemini ? await runGeminiSynthesis({
        query,
        reportName: reportTitle,
        primaryRows,
        networkRows,
        expert: matchedExpert,
    }) : null;

    // 5. Construct Topline Hook (Pillar 1)
    let toplineHookText = precomputedCoreTension || geminiOutput?.topline_hook?.slice(0, 350);
    let isHookGenerated = !precomputedCoreTension && Boolean(geminiOutput?.topline_hook);

    if (!toplineHookText) {
        isHookGenerated = false;
        if (primaryRows.length > 0) {
            const topRow = primaryRows[0];
            const name = topRow?.name || topRow?.trend_name || 'Emerging Dynamics';
            const sum = topRow?.summary || topRow?.description || 'key strategic shifts across the sector';
            toplineHookText = `Findings from ${reportTitle} indicate that ${name} is driving ${sum}.`;
        } else {
            toplineHookText = `No published report intelligence was found specifically matching "${query}". Exploring adjacent domain signals or consulting a specialist analyst can help bridge this gap.`;
        }
    }

    // 5. Construct Structural Shifts (Pillar 2)
    const shifts: ReportShift[] = [];
    if (geminiOutput?.shifts && Array.isArray(geminiOutput.shifts) && geminiOutput.shifts.length > 0) {
        for (let i = 0; i < Math.min(geminiOutput.shifts.length, 4); i++) {
            const s = geminiOutput.shifts[i];
            if (!s) continue;
            const matchingRow = primaryRows[i] || primaryRows[0];
            const rowEv = matchingRow ? extractEvidenceFromRow(matchingRow) : { stats: [], snippets: [], caseStudies: [] };

            const finalStats = Array.isArray(s.stats) && s.stats.length > 0
                ? s.stats.slice(0, 3)
                : rowEv.stats.slice(0, 3);

            const finalEvidence = Array.isArray(s.evidence) && s.evidence.length > 0
                ? s.evidence.slice(0, 2)
                : rowEv.snippets.slice(0, 2);

            shifts.push({
                title: (s.title || `Shift ${i + 1}`).slice(0, 100),
                narrative: (s.narrative || '').slice(0, 300),
                stats: finalStats,
                evidence: finalEvidence,
                generated: true,
            });
        }
    } else {
        // Fallback: Mechanical extraction from primary rows
        const fallbackRows = (primaryRows.length > 0 ? primaryRows : rawRows).slice(0, 4);
        for (let i = 0; i < fallbackRows.length; i++) {
            const row = fallbackRows[i];
            const title = (row?.name || row?.trend_name || `Shift ${i + 1}`).slice(0, 100);
            const narrative = (row?.summary || row?.description || 'Structural shift identified in report data.').slice(0, 300);
            const ev = extractEvidenceFromRow(row);

            shifts.push({
                title,
                narrative,
                stats: ev.stats.slice(0, 3),
                evidence: ev.snippets.slice(0, 2),
                generated: false,
            });
        }
    }

    // 6. Construct Network Signals (Pillar 3)
    const networkSignals: NetworkSignal[] = [];

    if (precomputedSignals && Array.isArray(precomputedSignals) && precomputedSignals.length > 0) {
        for (const sig of precomputedSignals.slice(0, 3)) {
            const gid = sig.graph_id || '';
            const matchedGraph = getLiveGraphs().find(g => g.graph_id === gid) || getGraphs().find(g => g.graph_id === gid);
            const sourceReport = matchedGraph?.name || gid || 'Industry Report';
            const curator = matchedGraph?.curator || matchedGraph?.company || 'Research Partner';
            networkSignals.push({
                title: sig.source_case_study || `Signal from ${sourceReport}`,
                source_report: sourceReport,
                graph_id: gid,
                curator: curator ? String(curator) : undefined,
                signal_type: sig.signal_type || 'validates',
                snippet: (sig.connection_summary || sig.source_case_study || '').slice(0, 250),
                url: matchedGraph?.webpage_url || `https://app.fodda.ai/graphs/${encodeURIComponent(gid)}`,
            });
        }
    } else {
        const candidateNetRows = networkRows.slice(0, 3);
        for (let i = 0; i < candidateNetRows.length; i++) {
            const nr = candidateNetRows[i];
            const gid = nr?.graph_id || nr?.graphId || '';
            const matchedGraph = getLiveGraphs().find(g => g.graph_id === gid) || getGraphs().find(g => g.graph_id === gid);
            const sourceReport = matchedGraph?.name || nr?.graph_name || nr?.graphName || gid || 'Industry Report';
            const curator = matchedGraph?.curator || matchedGraph?.company || nr?.curator || nr?.organization || 'Research Partner';

            // Match LLM signal classification if available
            const matchedGeminiSig = geminiOutput?.network_signals?.find(s => s.graph_id === gid || s.graph_id === sourceReport);
            const signalType = matchedGeminiSig?.signal_type || 'related';
            const ev = extractEvidenceFromRow(nr);
            const snippet = (matchedGeminiSig?.connection || ev.snippets[0] || nr?.summary || nr?.description || nr?.name || nr?.trend_name || '').slice(0, 250);
            const rawScore = Number(nr?.relevance_score ?? nr?.score);

            networkSignals.push({
                title: nr?.name || nr?.trend_name || `Signal from ${sourceReport}`,
                source_report: sourceReport,
                graph_id: gid,
                curator: curator ? String(curator) : undefined,
                signal_type: signalType,
                snippet,
                score: !isNaN(rawScore) ? rawScore : undefined,
                url: matchedGraph?.webpage_url || `https://app.fodda.ai/graphs/${encodeURIComponent(gid)}`,
            });
        }
    }

    // 7. Construct Expert Spotlight (Pillar 4)
    let expertSpotlight: ExpertSpotlight | undefined;
    if (matchedExpert) {
        const rawSlug = matchedExpert.slug || matchedExpert.expertSlug || matchedExpert.analyst_id || '';
        const isCleanSlug = /^[a-z0-9-]+$/.test(rawSlug);
        const consultUrl = isCleanSlug ? `https://expert.fodda.ai/${rawSlug}` : undefined;

        const position = (precomputedExpertQuote || geminiOutput?.expert_stance || matchedExpert.what_they_offer || `Offers strategic advisory on ${matchedExpert.expert_in || 'market shifts'}.`).slice(0, 250);
        const whyMatched = `Specializes in ${matchedExpert.expert_in || matchedExpert.name}'s strategic domain`;

        expertSpotlight = {
            name: matchedExpert.name,
            slug: isCleanSlug ? rawSlug : undefined,
            analyst_id: matchedExpert.analyst_id,
            why_matched: whyMatched,
            position,
            consult_url: consultUrl,
            consult_tool: 'consult_human_agent',
            generated: !precomputedExpertQuote && Boolean(geminiOutput?.expert_stance),
        };
    }

    // 8. Reshape Follow-Ups (Pillar 5)
    const followUps: FollowUpMove[] = [];

    // Follow-up 1: Deep dive on top shift or primary report
    if (shifts.length > 0 && shifts[0]) {
        const topShift = shifts[0];
        followUps.push({
            prompt: `Deep dive into "${topShift.title}" in ${reportTitle}`,
            tool: 'get_report_intelligence',
            args: { query: `${reportTitle} ${topShift.title}` },
            app_url: primaryGraphId
                ? `https://app.fodda.ai/graphs/${encodeURIComponent(primaryGraphId)}`
                : `https://app.fodda.ai`,
        });
    }

    // Follow-up 2: Consult matched human twin
    if (matchedExpert) {
        followUps.push({
            prompt: `Consult ${matchedExpert.name} on strategic execution`,
            tool: 'consult_human_agent',
            args: {
                analyst_id: matchedExpert.analyst_id,
                query: `How does ${reportTitle} impact strategic priorities for brands?`,
            },
            app_url: expertSpotlight?.consult_url || `https://app.fodda.ai`,
        });
    }

    // Follow-up 3: Cross-graph query
    if (networkSignals.length > 0 && networkSignals[0]) {
        const netSig = networkSignals[0];
        followUps.push({
            prompt: `Explore cross-industry validation from ${netSig.source_report}`,
            tool: 'get_report_intelligence',
            args: { query: `${netSig.source_report} ${query}` },
            app_url: netSig.url,
        });
    }

    // If fewer than 3 follow-ups generated, pull from annotatedData.next_moves candidates if available
    if (followUps.length < 3 && annotatedData?.next_moves?.candidates && Array.isArray(annotatedData.next_moves.candidates)) {
        for (const c of annotatedData.next_moves.candidates) {
            if (followUps.length >= 3) break;
            if (c.tool && c.prompt) {
                followUps.push({
                    prompt: c.prompt,
                    tool: c.tool,
                    args: c.args || {},
                    app_url: 'https://app.fodda.ai',
                });
            }
        }
    }

    // 9. Pre-Render Markdown
    const briefingMarkdown = renderBriefingMarkdown({
        reportTitle,
        toplineHook: toplineHookText,
        shifts,
        networkSignals,
        expertSpotlight,
        followUps,
    });

    return {
        view: 'editorial',
        query,
        report_title: reportTitle,
        primary_graph_id: primaryGraphId,
        topline_hook: {
            text: toplineHookText,
            generated: isHookGenerated,
        },
        shifts,
        network_signals: networkSignals,
        expert_spotlight: expertSpotlight,
        follow_ups: followUps,
        briefing_markdown: briefingMarkdown,
        coverage: annotatedData?.coverage || data?.coverage,
    };
}
