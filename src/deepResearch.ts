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
import { getRelevantSources, getGraphDetails } from './catalogCache.js';
import type { SourceCandidate } from './catalogCache.js';
import { buildResearcherInstruction } from './agents/fodda-researcher/index.js';
import type { GraphContext } from './agents/fodda-researcher/index.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface DeepResearchOpts {
    query: string;
    subThemes?: string[] | undefined;
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
    /** Sub-themes generated or passed and addressed */
    sub_themes_used: string[];
    /** Whether earnings data was included */
    earnings_included: boolean;
    /** Whether supplemental/macro data was included */
    supplemental_included: boolean;
    /** Duration in seconds (string, 1 decimal) */
    duration_sec: string;
}

// ---------------------------------------------------------------------------
// Helpers & Sub-Theme Expansion
// ---------------------------------------------------------------------------

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: any;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export function extractRoutingTopic(q: string): string {
    if (!q) return q;
    let s = q;
    s = s.replace(/^(run|do|execute|start|launch|create|generate|write|give\s+me|provide|show\s+me|research|explore|synthesize|analyze|what\s+are|tell\s+me|can\s+you)(\s+a|\s+an|\s+the|\s+me|\s+us)?\s+(fodda\s+)?(deep\s+research\s+project|deep\s+research|strategic\s+breakdown|strategic\s+analysis|report|briefing|session|analysis|overview|breakdown|key\s+trends|trends|deep\s+dive)?(\s+about|\s+on|\s+for|\s+regarding|\s+in|\s+of)?/i, '');
    const clauses = s.split(/\n|\?|\.|;|diagnos|troubleshoot|conversation|system message|user request/i)
        .map(c => c.trim())
        .filter(c => c.length > 2);
    const topicClause = clauses[0] || s;
    return topicClause.replace(/^[?\s,.:]+|[?\s,.:]+$/g, '').trim() || q;
}

export function cleanResearchQuery(q: string): string {
    return extractRoutingTopic(q);
}

export function fallbackSubThemes(topic: string, isHeavy: boolean): string[] {
    let cleanTopic = extractRoutingTopic(topic).trim();
    if (cleanTopic.length > 40) {
        const lastSpace = cleanTopic.lastIndexOf(' ', 40);
        cleanTopic = lastSpace > 0 ? cleanTopic.slice(0, lastSpace) : cleanTopic.slice(0, 40);
    }
    cleanTopic = cleanTopic.replace(/[\s,.:;]+$/, '').trim();

    const themes = [
        `category sizing and growth forecasts for ${cleanTopic}`,
        `key players, brands and challengers in ${cleanTopic}`,
        `consumer behavior shifts and demand drivers for ${cleanTopic}`,
        `channel dynamics: DTC, wholesale and marketplace for ${cleanTopic}`,
    ];
    if (isHeavy) {
        themes.push(`moderation, premiumization and lifestyle trends impacting ${cleanTopic}`);
    }
    return themes;
}

async function generateSubThemes(
    routingTopic: string,
    isHeavy: boolean,
    waverunnerRequest: WaverunnerRequestFn,
    apiKey: string,
    userId: string,
): Promise<string[]> {
    const count = isHeavy ? 5 : 4;
    try {
        const payload = {
            model: 'gemini-2.0-flash',
            system_instruction: `You are a senior research strategist. Given a topic, generate exactly ${count} specific, distinct research sub-themes. Each sub-theme MUST name a concrete angle relevant to the specific topic (e.g. category sizing with forecasts, key competitive players/brands, channel dynamics like DTC vs wholesale, consumer behavior or moderation shifts, technology and format innovation). Output ONLY a JSON array of ${count} short strings (5-12 words each). Do NOT repeat the full query phrase verbatim in every string.`,
            input: [{ type: 'text', text: routingTopic }],
            response_mime_type: 'application/json',
        };
        const result = await withTimeout(
            waverunnerRequest('deep_dive', 0, apiKey, userId, payload),
            10000,
            'Sub-theme expansion'
        );
        const text = result?.outputs?.[0]?.text || '';
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
                const cleaned = parsed.slice(0, count).map((s: any) => String(s).trim()).filter(Boolean);
                if (cleaned.length >= 3) {
                    console.error(`[deep_research] LLM sub-theme expansion succeeded (${cleaned.length} themes):`, cleaned);
                    return cleaned;
                }
            }
        }
    } catch (err: any) {
        console.error(`[deep_research] Sub-theme LLM generation failed:`, err?.stack || err?.message || err);
    }
    return fallbackSubThemes(routingTopic, isHeavy);
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

export async function runDeepResearch(opts: DeepResearchOpts): Promise<DeepResearchResult> {
    const {
        query: rawQuery, subThemes: clientSubThemes, apiKey, userId, foddaRequest, waverunnerRequest,
        depth = 'light', graphId,
        onProgress = () => {},
    } = opts;

    const routingTopic = extractRoutingTopic(rawQuery);
    const researchBrief = rawQuery.trim();

    const isHeavy = depth === 'heavy';
    const tokenCost = isHeavy ? 3 : 2;
    const maxGraphs = isHeavy ? 15 : 8;
    const startTime = Date.now();

    // ── Phase 1: Planning & Sub-Themes ──
    onProgress(`📋 Phase 1/5: Planning research approach for "${routingTopic.slice(0, 80)}"...`);
    console.error(`[deep_research] Starting ${isHeavy ? 'heavy' : 'light'} research for topic: "${routingTopic}" (brief length: ${researchBrief.length} chars)`);

    const effectiveSubThemes = (clientSubThemes && clientSubThemes.length > 0)
        ? clientSubThemes.slice(0, isHeavy ? 5 : 4)
        : await generateSubThemes(routingTopic, isHeavy, waverunnerRequest, apiKey, userId);

    console.error(`[deep_research] Using ${effectiveSubThemes.length} sub-themes:`, effectiveSubThemes);

    const sourceCandidates: SourceCandidate[] = graphId ? [] : getRelevantSources(routingTopic, { minGraphs: isHeavy ? 6 : 4, maxGraphs });
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

    // ── Phase 2: Tiered Two-Pass Retrieval ──
    onProgress(`🔍 Phase 2/5: Broad discovery search across ${graphIds.length} knowledge graph${graphIds.length !== 1 ? 's' : ''}...`);

    // Pass 1: Broad discovery — routingTopic against ALL graphs (limit 3, 8s per-call timeout)
    const broadSearchPromises = graphIds.map(async (gid) => {
        try {
            const searchBody = { query: routingTopic, limit: 3, use_semantic: true, include_evidence: true };
            const res = await withTimeout(
                foddaRequest('POST', `/v1/graphs/${encodeURIComponent(gid)}/search`, apiKey, userId, searchBody),
                8000,
                `Graph search ${gid}`
            );
            const rows = res?.rows || [];
            return { graphId: gid, rows, evidence: rows.flatMap((r: any) => r.evidence || []) };
        } catch (err: any) {
            console.error(`[deep_research] Pass 1 graph search for ${gid} failed/timed out: ${err?.message}`);
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
                return await withTimeout(
                    foddaRequest('GET', `/v1/supplemental/earnings/snapshot?${params.toString()}`, apiKey, userId),
                    15000,
                    'Earnings snapshot'
                );
            } catch (err: any) {
                console.error(`[deep_research] Earnings snapshot failed (non-fatal): ${err?.message}`);
                return null;
            }
        })()
        : Promise.resolve(null);

    const supplementalPromise: Promise<any> = supplementalToFetch.length > 0
        ? (async () => {
            try {
                const body: Record<string, any> = { query: researchBrief };
                const categoryHint = supplementalToFetch.map(c => c.category).join(', ');
                body.domain = categoryHint;
                return await withTimeout(
                    foddaRequest('POST', '/v1/supplemental/context', apiKey, userId, body),
                    15000,
                    'Supplemental context'
                );
            } catch (err: any) {
                console.error(`[deep_research] Supplemental context failed (non-fatal): ${err?.message}`);
                return null;
            }
        })()
        : Promise.resolve(null);

    const [broadResults, earningsData, supplementalData] = await Promise.all([
        Promise.all(broadSearchPromises),
        earningsPromise,
        supplementalPromise,
    ]);

    // Rank Pass 1 results by relevance (max row score + router score tiebreak)
    const getGraphRelevanceScore = (g: { graphId: string; rows: any[] }): number => {
        if (!g.rows || g.rows.length === 0) return 0;
        const maxRowScore = Math.max(...g.rows.map(r => Number(r.signal_score ?? r.score ?? r.similarity ?? 0.5)));
        const routerCandidate = graphCandidates.find(c => c.graphId === g.graphId);
        const routerScore = routerCandidate?.score ?? 0;
        return maxRowScore * 10 + routerScore;
    };

    const topGraphIds = broadResults
        .filter(g => g.rows.length > 0)
        .sort((a, b) => getGraphRelevanceScore(b) - getGraphRelevanceScore(a))
        .slice(0, isHeavy ? 5 : 4)
        .map(g => g.graphId);

    onProgress(`🎯 Phase 2b: Deep sub-theme search on top ${topGraphIds.length} graph${topGraphIds.length !== 1 ? 's' : ''}...`);

    // Pass 2: Deep search — sub-themes against top-hit graphs only (limit 5, 8s per-call timeout)
    const deepSearchPromises: Promise<{ graphId: string; subTheme: string; rows: any[]; evidence: any[] }>[] = [];
    for (const gid of topGraphIds) {
        for (const st of effectiveSubThemes) {
            deepSearchPromises.push((async () => {
                try {
                    const searchBody = { query: st, limit: isHeavy ? 5 : 3, use_semantic: true, include_evidence: true };
                    const res = await withTimeout(
                        foddaRequest('POST', `/v1/graphs/${encodeURIComponent(gid)}/search`, apiKey, userId, searchBody),
                        8000,
                        `Deep search ${gid}:${st}`
                    );
                    const rows = res?.rows || [];
                    return { graphId: gid, subTheme: st, rows, evidence: rows.flatMap((r: any) => r.evidence || []) };
                } catch (err: any) {
                    console.error(`[deep_research] Pass 2 deep search for ${gid}:${st} failed/timed out: ${err?.message}`);
                    return { graphId: gid, subTheme: st, rows: [], evidence: [] };
                }
            })());
        }
    }

    const deepResults = await Promise.all(deepSearchPromises);

    // ── Curation & Deduplication Layer ──
    // Key by (graphId, trendName) to preserve cross-graph corroboration, aggregate subThemes Set
    interface CuratedTrend {
        graphId: string;
        trendName: string;
        summary: string;
        signalScore: number;
        lifecycle: string;
        evidence: any[];
        subThemes: Set<string>;
    }

    const trendMap = new Map<string, CuratedTrend>();

    // Process deepResults FIRST so subTheme attribution takes priority over broad hits
    for (const r of [...deepResults, ...broadResults]) {
        const st = (r as any).subTheme;
        for (const row of r.rows) {
            const trendName = String(row.title || row.trendName || row.name || '').trim();
            if (!trendName) continue;
            const key = `${r.graphId}::${trendName.toLowerCase()}`;

            const existing = trendMap.get(key);
            if (existing) {
                if (st) existing.subThemes.add(st);
            } else {
                const subThemes = new Set<string>();
                if (st) subThemes.add(st);
                trendMap.set(key, {
                    graphId: r.graphId,
                    trendName,
                    summary: String(row.summary || row.description || '').substring(0, 600),
                    signalScore: row.signal_score || row.score || 0.5,
                    lifecycle: row.trendLifecycle || row.lifecycle || 'growing',
                    evidence: (row.evidence || []).slice(0, 3).map((e: any) => ({
                        title: String(e.title || '').substring(0, 150),
                        snippet: String(e.snippet || e.summary || '').substring(0, 400),
                        source_url: e.sourceUrl || e.url,
                        category: e.category || e.type,
                    })),
                    subThemes,
                });
            }
        }
    }

    // Group curated trends by graphId for Gemini context
    const curatedGraphsMap = new Map<string, any[]>();
    let totalTrends = 0;
    let totalEvidence = 0;

    for (const trend of trendMap.values()) {
        totalTrends++;
        totalEvidence += trend.evidence.length;
        const list = curatedGraphsMap.get(trend.graphId) || [];
        if (list.length < (isHeavy ? 6 : 4)) {
            list.push({
                name: trend.trendName,
                sub_themes_supported: Array.from(trend.subThemes),
                summary: trend.summary,
                signal_score: trend.signalScore,
                lifecycle: trend.lifecycle,
                evidence: trend.evidence,
            });
            curatedGraphsMap.set(trend.graphId, list);
        }
    }

    const structuredGraphResults = Array.from(curatedGraphsMap.entries()).map(([gid, trends]) => ({
        graph_id: gid,
        trends,
    }));

    const searchedGraphIds = Array.from(new Set([...graphIds, ...topGraphIds]));
    const activeGraphs = structuredGraphResults.filter(g => g.trends.length > 0);

    if (activeGraphs.length === 0) {
        console.error(`[deep_research] All graph searches returned no curated results — proceeding with web-only research`);
        onProgress(`⚠️ Knowledge graph search returned no results — proceeding with web-only research...`);
    } else {
        onProgress(`📊 Curated ${totalTrends} trend${totalTrends !== 1 ? 's' : ''} and ${totalEvidence} evidence pieces across ${activeGraphs.length} active graph${activeGraphs.length !== 1 ? 's' : ''}. Launching deep analysis...`);
    }

    // ── Phase 3: Deep Analysis via Gemini ──
    onProgress(`🧠 Phase 3/5: Deep analysis with web research — this takes 1-3 minutes...`);

    const graphContext: GraphContext = {
        graphResults: JSON.stringify(structuredGraphResults, null, 2),
        graphsSearched: searchedGraphIds,
        totalTrends,
        totalEvidence,
        focusGraphId: graphId,
        subThemesUsed: effectiveSubThemes,
        ...(earningsData ? { earningsResults: JSON.stringify(earningsData).substring(0, 15000) } : {}),
        ...(supplementalData ? { supplementalResults: JSON.stringify(supplementalData).substring(0, 15000) } : {}),
    };

    const systemInstruction = buildResearcherInstruction(researchBrief, graphContext);
    const geminiModel = isHeavy ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

    const subThemesInstruction = effectiveSubThemes
        .map((st, i) => `${i + 1}. ${st}`)
        .join('\n');

    const interactionPayload = {
        model: geminiModel,
        system_instruction: systemInstruction,
        input: [
            {
                type: 'text',
                text: `Full Research Brief:\n${researchBrief}\n\n## Mandatory Research Sub-Themes (you MUST address ALL of these in the report):\n${subThemesInstruction}\n\nProduce a comprehensive research report addressing EVERY requirement in the research brief and EVERY sub-theme above. Write in editorial narrative style — like a senior strategist briefing a CMO.\n\nCRITICAL MANDATE: You MUST actively leverage your web search tool to find and integrate quantitative market sizing data (dollar market values, projected CAGRs, category growth rates, and volume vs value figures), competitive brand players, and channel dynamics for all key categories in the brief. Combine curated knowledge graph trends with live web evidence to deliver a complete, highly specific brief.\n\nIMPORTANT: At the end of the report, you MUST include a "## Sources" section listing all the source URLs you used from the provided context.`,
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

    // Strip/unwrap grounding API redirect links embedded in markdown text by Gemini
    reportText = reportText.replace(/\[([^\]]+)\]\(https?:\/\/(?:vertexaisearch\.cloud\.google\.com|www\.google\.com\/url)[^\)]+\)/gi, '$1');
    reportText = reportText.replace(/https?:\/\/vertexaisearch\.cloud\.google\.com\/[^\s\)]+/gi, '');

    // Diagnostic logging for citation payloads
    console.error(`[deep_research] Raw annotations payload:`, JSON.stringify(outputs.flatMap((o: any) => o.annotations || [])));
    console.error(`[deep_research] Raw groundingChunks count:`, (result?.groundingMetadata?.groundingChunks || []).length);

    // ── Extract URLs ──
    const normalizeUrl = (rawUrl: string): string | null => {
        if (!rawUrl) return null;
        let u = rawUrl.trim();

        // Strip inner spaces/newlines in URL (e.g. "funded- startups-in-wine")
        u = u.replace(/\s+/g, '');

        // Fix scheme typos (httpss:// -> https://)
        u = u.replace(/^httpss:\/\//i, 'https://');
        u = u.replace(/^https?:\/\/\//i, 'https://');

        // Extract real destination from google redirect URLs if present
        if (u.includes('google.com/url?') || u.includes('google.com/url&')) {
            const match = u.match(/[?&](?:url|q)=(https?%3A%2F%2F[^&]+|https?:\/\/[^&]+)/i);
            if (match && match[1]) {
                u = decodeURIComponent(match[1]);
            }
        }

        // Fix typos where :// was replaced by dot (e.g., https.www.domain.com -> https://www.domain.com)
        if (/^https?\.[a-z0-9]/i.test(u)) {
            u = u.replace(/^(https?)\./i, '$1://');
        }

        try {
            const parsed = new URL(u);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
            if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
            // Reject hostname missing real domain (e.g., "https.com")
            if (parsed.hostname === 'https.com' || parsed.hostname === 'http.com') return null;
            return parsed.toString();
        } catch {
            return null;
        }
    };

    const isInternalOrSearchUrl = (url: string): boolean => {
        if (!url) return true;
        const u = url.toLowerCase();
        return u.includes('vertexaisearch.cloud.google.com') ||
               u.includes('fodda.ai') ||
               u.includes('localhost') ||
               u.includes('google.com/search') ||
               u.includes('google.com/url') ||
               u.includes('googleusercontent.com');
    };

    const isFabricatedUrl = (url: string): boolean => {
        if (!url) return true;
        if (/YOUR_\w+/i.test(url)) return true;
        return false;
    };

    const seenUrls = new Set<string>();
    const sourceUrls: { title: string; url: string }[] = [];

    // ── Harvest Graph Provenance Sources (P2) ──
    for (const gId of searchedGraphIds) {
        const g = getGraphDetails(gId);
        const graphTitle = g?.name || gId;
        const curatorAttr = g ? [g.curator, g.company].filter(Boolean).join(' / ') : '';
        const titleText = curatorAttr ? `${graphTitle} (${curatorAttr})` : graphTitle;

        const graphTrends = curatedGraphsMap.get(gId) || [];

        // 1. Evidence item formatted_citation / sourceUrl
        for (const t of graphTrends) {
            for (const ev of (t.evidence || [])) {
                const rawEvUrl = typeof ev === 'string' ? ev : (ev?.sourceUrl || ev?.formatted_citation || '');
                const normEv = normalizeUrl(rawEvUrl);
                if (normEv && !isInternalOrSearchUrl(normEv) && !isFabricatedUrl(normEv) && !seenUrls.has(normEv)) {
                    seenUrls.add(normEv);
                    sourceUrls.push({ title: titleText, url: normEv });
                }
            }
        }

        // 2. Fallback: Graph webpage_url or deep link
        const deepLink = normalizeUrl(g?.webpage_url || `https://fodda.ai/graphs/${gId}`) || normalizeUrl(g?.source_url || '');
        if (deepLink && !seenUrls.has(deepLink)) {
            seenUrls.add(deepLink);
            sourceUrls.push({
                title: curatorAttr ? `${graphTitle} — Curated by ${curatorAttr}` : graphTitle,
                url: deepLink
            });
        }
    }

    // Harvest Web Grounding URLs
    for (const output of outputs) {
        if (output.type === 'text' && Array.isArray(output.annotations)) {
            for (const ann of output.annotations) {
                const norm = normalizeUrl(ann.url);
                if (ann.type === 'url_citation' && norm && !isInternalOrSearchUrl(norm) && !isFabricatedUrl(norm) && !seenUrls.has(norm)) {
                    seenUrls.add(norm);
                    sourceUrls.push({ title: ann.title || '', url: norm });
                }
            }
        }
    }

    const groundingChunks = result?.groundingMetadata?.groundingChunks || [];
    for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        const norm = normalizeUrl(uri);
        if (norm && !isInternalOrSearchUrl(norm) && !isFabricatedUrl(norm) && !seenUrls.has(norm)) {
            seenUrls.add(norm);
            sourceUrls.push({ title: chunk?.web?.title || '', url: norm });
        }
    }

    // Strip self-generated Sources section if it contains raw grounding API redirect URLs
    const sourcesRegex = /(#+\s*(?:sources|references)[\s\S]*$)/i;
    const sourcesMatch = reportText.match(sourcesRegex);
    if (sourcesMatch && /vertexaisearch|google\.com\/url|googleusercontent/i.test(sourcesMatch[0])) {
        reportText = reportText.replace(sourcesRegex, '').trim();
    }

    const hasSourcesSection = /#+\s*(sources|references)/i.test(reportText);
    if (!hasSourcesSection && sourceUrls.length > 0) {
        reportText += '\n\n## Sources & References\n' + sourceUrls.map(s =>
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
        graphs_searched: searchedGraphIds,
        sub_themes_used: effectiveSubThemes,
        earnings_included: !!earningsData,
        supplemental_included: !!supplementalData,
        duration_sec: durationSec,
    };
}

