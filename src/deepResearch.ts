/**
 * Deep Research Pipeline — extracted core logic.
 *
 * Pure async function: no job tracking, no billing, no MCP logging.
 * Callers (MCP tool, A2A handler) own their own job state, billing
 * gates, and progress reporting.
 *
 * One implementation, two callers — no pipeline duplication.
 */

import crypto from 'crypto';
import type { FoddaRequestFn, WaverunnerRequestFn } from './types.js';
import { getRelevantSources } from './catalogCache.js';
import type { SourceCandidate } from './catalogCache.js';
import { buildResearcherInstruction } from './agents/fodda-researcher/index.js';
import type { GraphContext } from './agents/fodda-researcher/index.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface DeepResearchOpts {
    query: string;
    apiKey: string;
    userId: string;
    depth?: 'light' | 'heavy';
    graphId?: string | undefined;
    foddaRequest: FoddaRequestFn;
    waverunnerRequest: WaverunnerRequestFn;
    /** Optional progress callback — callers use this for MCP logging messages, console logs, etc. */
    onProgress?: (msg: string) => void;
}

export interface DeepResearchResult {
    /** Full markdown report with header + sources section */
    report: string;
    /** Source routing plan — every candidate selected and why */
    source_plan: Record<string, any>[];
    /** Graph IDs that were searched */
    graphs_searched: string[];
    /** Whether earnings data was included */
    earnings_included: boolean;
    /** Whether supplemental/macro data was included */
    supplemental_included: boolean;
    /** Duration in seconds (string, 1 decimal) */
    duration_sec: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export function cleanResearchQuery(q: string): string {
    if (!q) return q;
    let s = q;
    // Strip leading conversational wrapper
    s = s.replace(/^(run|do|execute|start|launch|create|generate|write)(\s+a)?\s+(fodda\s+)?(deep\s+research\s+project|deep\s+research|report|briefing|session|analysis)(\s+about|\s+on|\s+for|\s+regarding)?/i, '');
    // Strip trailing diagnosis notes, headers, or conversation transcripts attached to query
    s = s.split(/\n|diagnos|troubleshoot|conversation|system message|user request/i)[0] || s;
    return s.replace(/^[?\s,.:]+|[?\s,.:]+$/g, '').trim() || q;
}

export async function runDeepResearch(opts: DeepResearchOpts): Promise<DeepResearchResult> {
    const {
        query: rawQuery, apiKey, userId, foddaRequest, waverunnerRequest,
        depth = 'light', graphId,
        onProgress = () => {},
    } = opts;

    const query = cleanResearchQuery(rawQuery);
    const isHeavy = depth === 'heavy';
    const tokenCost = isHeavy ? 3 : 2;
    const maxGraphs = isHeavy ? 15 : 8;
    const startTime = Date.now();

    // ── Phase 1: Planning ──
    onProgress(`📋 Phase 1/5: Planning research approach for "${query.slice(0, 80)}"...`);
    console.error(`[deep_research] Starting ${isHeavy ? 'heavy' : 'light'} research: "${query}"`);

    const sourceCandidates: SourceCandidate[] = graphId ? [] : getRelevantSources(query, { minGraphs: isHeavy ? 6 : 4, maxGraphs });
    const graphCandidates = sourceCandidates
        .filter((c): c is Extract<SourceCandidate, { kind: 'graph' }> => c.kind === 'graph')
        .slice(0, maxGraphs);
    const graphIds = graphId ? [graphId] : graphCandidates.map(c => c.graphId);
    const earningsCandidate = sourceCandidates.find(
        (c): c is Extract<SourceCandidate, { kind: 'earnings' }> => c.kind === 'earnings');
    const supplementalCandidates = sourceCandidates.filter(
        (c): c is Extract<SourceCandidate, { kind: 'supplemental' }> => c.kind === 'supplemental');

    const supplementalToFetch = supplementalCandidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
    const supplementalHintOnly = supplementalCandidates.slice(supplementalToFetch.length);

    // Routing visibility
    const sourcePlan: Record<string, any>[] = [
        ...(graphId
            ? [{ kind: 'graph', id: graphId, reason: 'explicitly requested via graphId' }]
            : graphCandidates.map(c => ({ kind: 'graph', id: c.graphId, reason: c.reason }))),
        ...(earningsCandidate ? [{
            kind: 'earnings',
            ...(earningsCandidate.ticker ? { ticker: earningsCandidate.ticker } : {}),
            ...(earningsCandidate.brand ? { brand: earningsCandidate.brand } : {}),
            ...(earningsCandidate.sector ? { sector: earningsCandidate.sector } : {}),
            reason: earningsCandidate.reason,
        }] : []),
        ...supplementalToFetch.map(c => ({
            kind: 'supplemental',
            category: c.category,
            reason: `${c.reason} — auto-fetched and folded into research context`,
        })),
        ...supplementalHintOnly.map(c => ({
            kind: 'supplemental',
            category: c.category,
            reason: `${c.reason} — not auto-fetched (beyond top-2 cap); targeted tool available: get_supplemental_context`,
        })),
    ];

    // ── Phase 2: Parallel Fetch ──
    onProgress(`🔍 Phase 2/5: Searching ${graphIds.length} knowledge graph${graphIds.length !== 1 ? 's' : ''}${earningsCandidate ? ' + earnings intelligence' : ''}...`);

    const graphSearchPromises = graphIds.map(async (gid) => {
        try {
            const searchBody = { query, limit: isHeavy ? 10 : 5, use_semantic: true, include_evidence: true };
            const res = await foddaRequest('POST', `/v1/graphs/${encodeURIComponent(gid)}/search`, apiKey, userId, searchBody);
            const rows = res?.rows || [];
            const evidence = rows.flatMap((r: any) => r.evidence || []);
            return { graphId: gid, rows, evidence };
        } catch {
            return { graphId: gid, rows: [], evidence: [] };
        }
    });

    const earningsPromise: Promise<any> = earningsCandidate
        ? (async () => {
            try {
                const params = new URLSearchParams();
                if (earningsCandidate.ticker) params.set('ticker', earningsCandidate.ticker);
                if (earningsCandidate.brand) params.set('brand', earningsCandidate.brand);
                if (earningsCandidate.sector) params.set('sector', earningsCandidate.sector);
                if (earningsCandidate.search) params.set('search', earningsCandidate.search);
                params.set('limit', '10');
                return await foddaRequest('GET', `/v1/supplemental/earnings/snapshot?${params.toString()}`, apiKey, userId);
            } catch (err: any) {
                console.error(`[deep_research] Earnings snapshot failed (non-fatal): ${err?.message}`);
                return null;
            }
        })()
        : Promise.resolve(null);

    const supplementalPromise: Promise<any> = supplementalToFetch.length > 0
        ? (async () => {
            try {
                const body: Record<string, any> = { query };
                const categoryHint = supplementalToFetch.map(c => c.category).join(', ');
                body.domain = categoryHint;
                return await foddaRequest('POST', '/v1/supplemental/context', apiKey, userId, body);
            } catch (err: any) {
                console.error(`[deep_research] Supplemental context failed (non-fatal): ${err?.message}`);
                return null;
            }
        })()
        : Promise.resolve(null);

    const [graphResults, earningsData, supplementalData] = await Promise.all([
        Promise.all(graphSearchPromises),
        earningsPromise,
        supplementalPromise,
    ]);
    const totalTrends = graphResults.reduce((sum, g) => sum + g.rows.length, 0);
    const totalEvidence = graphResults.reduce((sum, g) => sum + g.evidence.length, 0);
    const activeGraphs = graphResults.filter(g => g.rows.length > 0);

    if (activeGraphs.length === 0) {
        console.error(`[deep_research] All ${graphIds.length} graph searches failed — proceeding with web-only research`);
        onProgress(`⚠️ Knowledge graph search returned no results — proceeding with web-only research...`);
    } else {
        onProgress(`📊 Found ${totalTrends} trend${totalTrends !== 1 ? 's' : ''} and ${totalEvidence} evidence pieces across ${activeGraphs.length} graph${activeGraphs.length !== 1 ? 's' : ''}. Launching deep analysis...`);
    }

    // ── Phase 3: Deep Analysis via Gemini ──
    onProgress(`🧠 Phase 3/5: Deep analysis with web research — this takes 1-3 minutes...`);

    const graphContext: GraphContext = {
        graphResults: JSON.stringify(graphResults.map(g => ({
            graph_id: g.graphId,
            trends: g.rows.map((r: any) => ({
                name: String(r.title || r.trendName || '').substring(0, 150),
                summary: String(r.summary || r.description || '').substring(0, 600),
                signal_score: r.signal_score || r.score,
                lifecycle: r.trendLifecycle || r.lifecycle,
                evidence: (r.evidence || []).slice(0, 3).map((e: any) => ({
                    title: String(e.title || '').substring(0, 150),
                    snippet: String(e.snippet || e.summary || '').substring(0, 400),
                    source_url: e.sourceUrl || e.url,
                    category: e.category || e.type,
                }))
            })),
            evidence: g.evidence.slice(0, isHeavy ? 10 : 5).map((e: any) => ({
                title: String(e.title || '').substring(0, 150),
                snippet: String(e.snippet || e.summary || '').substring(0, 400),
                source_url: e.sourceUrl || e.url,
                category: e.category || e.type,
                brand: e.brandNames?.[0] || e.brand,
            })),
        })), null, 2),
        graphsSearched: activeGraphs.map(g => g.graphId),
        totalTrends,
        totalEvidence,
        focusGraphId: graphId,
        ...(earningsData ? { earningsResults: JSON.stringify(earningsData).substring(0, 15000) } : {}),
        ...(supplementalData ? { supplementalResults: JSON.stringify(supplementalData).substring(0, 15000) } : {}),
    };

    const systemInstruction = buildResearcherInstruction(query, graphContext);
    const geminiModel = isHeavy ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

    const interactionPayload = {
        model: geminiModel,
        system_instruction: systemInstruction,
        input: [
            {
                type: 'text',
                text: `Research query: ${query}\n\nProduce a comprehensive research report following the skills in your system instruction. Write in editorial narrative style — like a senior strategist briefing a CMO. IMPORTANT: At the end of the report, you MUST include a "## Sources" section listing all the source URLs you used from the provided context.`,
            },
        ],
        tools: [
            { type: 'google_search' as const },
            { type: 'url_context' as const },
        ],
    };

    // Call Gemini with capacity fallback
    let result: any;
    try {
        result = await waverunnerRequest('deep_dive', tokenCost, apiKey, userId, interactionPayload);
    } catch (primaryErr: any) {
        const errMsg = primaryErr?.response?.data?.error?.message || primaryErr?.message || '';
        const isCapacity = errMsg.includes('high demand') || errMsg.includes('overloaded') || errMsg.includes('503');
        if (isCapacity && geminiModel !== 'gemini-2.5-flash') {
            console.error(`[deep_research] ${geminiModel} capacity error — retrying with gemini-2.5-flash`);
            interactionPayload.model = 'gemini-2.5-flash';
            result = await waverunnerRequest('deep_dive', tokenCost, apiKey, userId, interactionPayload);
        } else {
            throw primaryErr;
        }
    }

    // ── Extract report text ──
    const outputs = result?.outputs || [];
    const textParts = outputs
        .filter((o: any) => o.type === 'text')
        .map((o: any) => o.text);
    let reportText = textParts.join('\n\n');

    // ── Extract URLs ──
    const isInternalOrSearchUrl = (url: string): boolean => {
        if (!url) return true;
        const u = url.toLowerCase();
        return u.includes('vertexaisearch.cloud.google.com') ||
               u.includes('fodda.ai') ||
               u.includes('localhost');
    };

    const seenUrls = new Set<string>();
    const sourceUrls: { title: string; url: string }[] = [];

    for (const output of outputs) {
        if (output.type === 'text' && Array.isArray(output.annotations)) {
            for (const ann of output.annotations) {
                if (ann.type === 'url_citation' && ann.url && !isInternalOrSearchUrl(ann.url) && !seenUrls.has(ann.url)) {
                    seenUrls.add(ann.url);
                    sourceUrls.push({ title: ann.title || '', url: ann.url });
                }
            }
        }
    }

    const groundingChunks = result?.groundingMetadata?.groundingChunks || [];
    for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        if (uri && !isInternalOrSearchUrl(uri) && !seenUrls.has(uri)) {
            seenUrls.add(uri);
            sourceUrls.push({ title: chunk.web.title || '', url: uri });
        }
    }

    const hasSourcesSection = /#+\s*(sources|references)/i.test(reportText);
    if (!hasSourcesSection && sourceUrls.length > 0) {
        reportText += '\n\n## Sources\n' + sourceUrls.map(s =>
            s.title ? `- [${s.title}](${s.url})` : `- ${s.url}`
        ).join('\n');
    }

    if (!reportText) {
        throw new Error('Research agent returned no output.');
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    const header = [
        `_Research by Fodda Research Agent • ${activeGraphs.length} graph${activeGraphs.length !== 1 ? 's' : ''} searched • ${totalTrends} trends analyzed${earningsData ? ' • earnings intelligence included' : ''}${supplementalData ? ' • supplemental macro data included' : ''} • ${durationSec}s_`,
        '',
    ].join('\n');

    return {
        report: header + reportText,
        source_plan: sourcePlan,
        graphs_searched: graphIds,
        earnings_included: !!earningsData,
        supplemental_included: !!supplementalData,
        duration_sec: durationSec,
    };
}
