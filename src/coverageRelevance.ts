/**
 * Coverage relevance heuristic — counts how many result rows are actually
 * on-topic for the query, so the coverage annotation can flag "thin" when a
 * cross-graph fan-out pads the result set with off-topic rows.
 *
 * Why raw count isn't enough: an all-graph search fans out to every accessible
 * graph and each graph returns its own best matches. For a narrow query
 * ("Chinese automotive trends EV brands"), unrelated graphs (women's health,
 * beauty, social media) still contribute their locally-top rows, so the merged
 * set can hit 10 rows while only 2–3 are on-topic — and the old count-only
 * check reported coverage "ok" and never nudged the client toward
 * get_supplemental_context.
 *
 * How a row is judged on-topic (positive-evidence-of-off-topic model — rows
 * are only marked off-topic when we can actually tell):
 *   1. Lexical: the row's text (title/summary/brands/places + its source
 *      graph's name/domain/topics) contains at least one SPECIFIC query token
 *      (generic research vocabulary like "trends", "market", "brands" is
 *      stopworded out). Match → on-topic.
 *   2. Score rescue: no lexical match, but the row's relevance score clears
 *      ON_TOPIC_RESCUE_RATIO of its tier's scale. Scores are NOT comparable
 *      across tiers (domain-graph composite scores cluster near ~2.0 for
 *      on-topic matches; report-graph vector scores near ~0.8), so each tier
 *      normalizes against max(nominal tier scale, best observed score in that
 *      tier within this result set). Using the nominal as a floor prevents a
 *      tier whose rows are ALL off-topic from normalizing itself to look good.
 *   3. No score at all → counted on-topic (score-less rows from statistics /
 *      insights endpoints must never regress coverage).
 *
 * If the query has no specific tokens left after stopwording (e.g. "top
 * emerging trends"), relevance can't be judged and `evaluated: false` is
 * returned — callers keep the legacy count-only behavior.
 */

import { getGraphs, getLiveGraphs, buildDisplayName, getRelevantGraphs, getAnalysts } from './catalogCache.js';
import type { CatalogGraph, CatalogAnalyst } from './catalogCache.js';
import type { FoddaRequestFn } from './types.js';

/** Nominal on-topic relevance-score scale per graph tier (observed in QA:
 *  domain composites ~2.0, report vector scores ~0.8; expert sits between). */
export const TIER_NOMINAL_SCORE: Record<string, number> = {
    domain: 2.0,
    expert: 1.0,
    report: 0.8,
};

/** Fallback tier when a row's graph can't be resolved — the most permissive
 *  scale, so unresolved rows are rarely marked off-topic. */
const FALLBACK_TIER = 'report';

/** A row with no lexical overlap must score at least this fraction of its
 *  tier scale to still count as on-topic. */
export const ON_TOPIC_RESCUE_RATIO = 0.75;

/** English function words + research vocabulary present in almost every graph
 *  row — these carry no topical signal and are excluded from query tokens. */
const GENERIC_QUERY_TOKENS = new Set([
    // function words
    'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'from', 'by', 'at',
    'as', 'is', 'are', 'was', 'be', 'been', 'how', 'what', 'which', 'who', 'why', 'when',
    'where', 'will', 'can', 'do', 'does', 'about', 'into', 'over', 'under', 'between', 'vs',
    'versus', 'their', 'its', 'this', 'that', 'these', 'those', 'it', 'not', 'no', 'more',
    'most', 'less', 'least', 'than', 'also', 'other', 'across', 'around', 'within', 'per',
    'via', 'both', 'all', 'any', 'some', 'each', 'such', 'we', 'us', 'our', 'you', 'your',
    // domain-generic research vocabulary
    'trend', 'trends', 'market', 'markets', 'marketing', 'brand', 'brands', 'branding',
    'consumer', 'consumers', 'industry', 'industries', 'growth', 'data', 'insight',
    'insights', 'analysis', 'global', 'new', 'top', 'key', 'major', 'latest', 'future',
    'emerging', 'current', 'recent', 'report', 'reports', 'research', 'sector', 'sectors',
    'landscape', 'opportunity', 'opportunities', 'innovation', 'innovations', 'strategy',
    'strategies', 'signal', 'signals', 'impact', 'update', 'updates', 'overview',
]);

const TIER_ALIASES: Record<string, string> = {
    'industry report': 'report',
    'analyst': 'expert',
};

/** Tokenize a query down to its topically-specific terms. */
export function specificQueryTokens(query: string): string[] {
    return [...new Set(
        query.toLowerCase().split(/[^a-z0-9]+/)
            .filter(t => t.length >= 2 && !GENERIC_QUERY_TOKENS.has(t))
    )];
}

export function rowScore(row: any): number {
    return row.relevance_score || row.semantic_score || row._score || row.score || 0;
}

export function rowGraphId(row: any): string | undefined {
    return row._use_this_graphId || row.graphId || row.graph_id || row.psfk_graph_slug || undefined;
}

export function resolveRowTier(row: any, searchedGraphs: any[], catalog: CatalogGraph[]): string {
    const gid = rowGraphId(row);
    let type: string | undefined;
    if (gid) {
        const g = catalog.find(x => x.graph_id === gid) || searchedGraphs.find(x => x?.graph_id === gid);
        type = g?.graph_type;
    }
    if (!type && searchedGraphs.length === 1) type = searchedGraphs[0]?.graph_type;
    type = TIER_ALIASES[type || ''] || type;
    return type && TIER_NOMINAL_SCORE[type] !== undefined ? type : FALLBACK_TIER;
}

/** Does the row's text (or its source graph's metadata) contain any specific query token? */
export function rowMatchesQueryTokens(row: any, tokens: string[], catalog: CatalogGraph[]): boolean {
    if (tokens.length === 0) return false;
    const parts: any[] = [
        row.title, row.trendName, row.name, row.display, row.label,
        row.summary, row.description, row.trendDescription, row.whyNow,
        row.graphName, row.statistic, row.claim, row.insight, row.text,
    ];
    const gid = rowGraphId(row);
    if (gid) {
        parts.push(String(gid).replace(/[-_/,]/g, ' '));
        const g = catalog.find(x => x.graph_id === gid);
        if (g) parts.push(g.name, g.domain, ...(Array.isArray(g.topics) ? g.topics : []));
    }
    for (const arr of [row.brandNames, row.place, row.sectors, row.topics]) {
        if (Array.isArray(arr)) parts.push(...arr);
    }
    const words = new Set(
        parts.filter((x: any) => typeof x === 'string').join(' ').toLowerCase().split(/[^a-z0-9]+/)
    );
    // Exact word match always counts; prefix match only for tokens ≥4 chars
    // (so "china" matches "chinas" but "car" never matches "carbon").
    for (const t of tokens) {
        if (words.has(t)) return true;
        if (t.length >= 4) {
            for (const w of words) {
                if (w.startsWith(t)) return true;
            }
        }
    }
    return false;
}

export interface OnTopicResult {
    /** Rows judged on-topic for the query. */
    onTopic: number;
    /** False when the query is too generic to judge — callers must not change status. */
    evaluated: boolean;
}

/**
 * Count rows that are on-topic for the query. `catalog` is injectable for
 * tests; defaults to the live graph catalog.
 */
export function countOnTopicRows(
    rows: any[],
    query: string,
    searchedGraphs: any[],
    catalog: CatalogGraph[] = getGraphs()
): OnTopicResult {
    const tokens = specificQueryTokens(query);
    if (tokens.length === 0 || rows.length === 0) {
        return { onTopic: rows.length, evaluated: false };
    }

    const scored = rows.map(r => {
        const score = rowScore(r);
        const tier = resolveRowTier(r, searchedGraphs, catalog);
        return { r, score, tier };
    });

    let onTopic = 0;
    for (const { r, score, tier } of scored) {
        if (rowMatchesQueryTokens(r, tokens, catalog)) { onTopic++; continue; }
        // No token match and no score: nothing supports the row being on-topic.
        if (score <= 0) continue;
        // Rescue by score alone must be judged against the tier's NOMINAL scale,
        // never the result set's own max — otherwise the top rows of any set
        // (including a fully off-topic one) self-certify as on-topic.
        const scale = TIER_NOMINAL_SCORE[tier] ?? 0.8;
        if (score >= scale * ON_TOPIC_RESCUE_RATIO) onTopic++;
    }
    return { onTopic, evaluated: true };
}

export function isDemandShaped(query: string): boolean {
    const q = query.toLowerCase();
    const demandKeywords = [
        /\binterest\b/,
        /\bgrowing\b/,
        /\bdemand\b/,
        /\bsearch\b/,
        /\battention\b/,
        /\bvolume\b/,
        /\bforecasts?\b/,
        /\bpopularity\b/,
        /\bpopular\b/,
        /\bgrowth\b/,
        /\bhistorical\b/,
        /\bdata\s+series\b/,
        /\bstatistics\b/,
        /\bcharts?\b/
    ];
    return demandKeywords.some(pat => pat.test(q));
}

export async function addCoverageAnnotation(
    data: any,
    query: string,
    searchedGraphs: any[],
    limit: number | undefined,
    skipEvidenceCheck: boolean = false,
    catalog: CatalogGraph[] = getGraphs(),
    options?: NextMovesOptions
): Promise<any> {
    if (!data || typeof data !== 'object') return data;

    let normalizedData = data;
    if (Array.isArray(data)) {
        normalizedData = { rows: data, dataStatus: 'ok' };
    }

    const layerMap: Record<string, string> = {
        'industry report': 'report'
    };
    const uniqueTypes = new Set(searchedGraphs.map(g => layerMap[g.graph_type] || g.graph_type).filter(Boolean));
    const layersSearched = Array.from(uniqueTypes);

    // ── Check for explicit backend errors (e.g. NEO4J_AUTH_MISSING, auth failures, 5xx) ──
    const errDetail = normalizedData.error || normalizedData.error_code || normalizedData.code;
    const isErrStatus = normalizedData.dataStatus === 'error' || normalizedData.status === 'error';
    if (errDetail || isErrStatus) {
        normalizedData.coverage = {
            status: 'error',
            error: (typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail)) || 'Backend service error',
            results_returned: 0,
            layers_searched: layersSearched,
        };
        console.error(`[coverage] status: error (${normalizedData.coverage.error}), query: "${query}"`);
        return normalizedData;
    }

    // Explicitly target rows/results/trends/matches fields, mirroring normalizeTrends
    let rows = normalizedData.rows;
    if (!Array.isArray(rows)) {
        if (Array.isArray(normalizedData.results)) {
            rows = normalizedData.results;
        } else if (Array.isArray(normalizedData.trends)) {
            rows = normalizedData.trends;
        } else if (Array.isArray(normalizedData.matches)) {
            rows = normalizedData.matches;
        } else if (Array.isArray(normalizedData.statistics)) {
            rows = normalizedData.statistics;
        } else if (Array.isArray(normalizedData.items)) {
            rows = normalizedData.items;
        } else {
            // Find any array property
            for (const key of Object.keys(normalizedData)) {
                if (Array.isArray(normalizedData[key])) {
                    rows = normalizedData[key];
                    break;
                }
            }
        }
    }
    if (!Array.isArray(rows)) {
        rows = [];
    }

    const resultCount = rows.length;

    let status: 'ok' | 'thin' | 'empty' = 'ok';
    let onTopicCount: number | undefined;
    let isThinRelevance = false;
    if (resultCount === 0) {
        status = 'empty';
    } else {
        let isThinCount = resultCount < 3;
        if (limit !== undefined && limit < 3 && resultCount === limit) {
            isThinCount = false;
        }

        let isThinEvidence = false;
        if (!skipEvidenceCheck) {
            isThinEvidence = rows.every((r: any) => {
                const count = Array.isArray(r.evidence)
                    ? r.evidence.length
                    : Array.isArray(r.evidence_items)
                        ? r.evidence_items.length
                        : Array.isArray(r.evidenceItems)
                            ? r.evidenceItems.length
                            : Array.isArray(r.trendEvidence)
                                ? r.trendEvidence.length
                                : (r.evidence_count || r.evidenceCount || 0);
                return count < 3;
            });
        }

        // ── Relevance-aware thinness ──
        // Raw count can look healthy while cross-graph fan-out pads the set with
        // off-topic rows (each graph contributes its locally-best matches even
        // for unrelated queries). Count only on-topic rows; requiring
        // onTopic < resultCount means this never fires when every returned row
        // is on-topic (that case is already governed by the count/limit rules).
        const relevance = countOnTopicRows(rows, query, searchedGraphs, catalog);
        if (relevance.evaluated) {
            onTopicCount = relevance.onTopic;
            if (relevance.onTopic < 3 && relevance.onTopic < resultCount) {
                isThinRelevance = true;
            }
        }

        if (isThinCount || isThinEvidence || isThinRelevance) {
            status = 'thin';
        }
    }



    const isDemand = isDemandShaped(query);
    let suggestedAction: any = undefined;

    if (status === 'empty' || status === 'thin' || isDemand) {
        let reason = '';
        if (status === 'empty') {
            reason = 'curated coverage empty; supplemental provides external trends and data series';
        } else if (status === 'thin') {
            reason = isThinRelevance
                ? `curated coverage thin: only ${onTopicCount} of ${resultCount} results are on-topic for this query; supplemental covers demand and participation signals for this domain`
                : 'curated coverage thin; supplemental covers demand and participation signals for this domain';
        } else {
            reason = 'curated coverage is OK, but query is explicitly demand- or attention-shaped; supplemental adds value via live signals';
        }

        const suggestedArgs: any = { query };

        // Sourced from graph ids present in the result rows, fall back to searchedGraphs
        const rowGraphIds = [...new Set(rows.map((r: any) => r.graphId || r._use_this_graphId || r.psfk_graph_slug || r.graph_id).filter(Boolean))] as string[];
        if (rowGraphIds.length > 0) {
            suggestedArgs.graph_ids = rowGraphIds;
        } else if (searchedGraphs.length > 0) {
            suggestedArgs.graph_ids = searchedGraphs.map(g => g.graph_id);
        }

        suggestedAction = {
            tool: 'get_supplemental_context',
            arguments: suggestedArgs,
            reason
        };
    }

    normalizedData.coverage = {
        status,
        results_returned: resultCount,
        layers_searched: layersSearched,
    };
    if (onTopicCount !== undefined) {
        normalizedData.coverage.results_on_topic = onTopicCount;
    }
    if (suggestedAction) {
        normalizedData.coverage.suggested_action = suggestedAction;
    }
    // Machine-only recovery ladder: thin/empty coverage is never announced to
    // the user. The client recovers via suggested_action first; escalation
    // exists only for when that recovery also comes back dry.
    if (status === 'thin' || status === 'empty') {
        normalizedData.coverage.presentation = 'internal';
        normalizedData.coverage.escalation = {
            when: 'Only if suggested_action also returns nothing usable for this query',
            say: 'This is what we have on this right now.',
            options: [
                {
                    tool: 'deep_research_topic',
                    arguments: { query },
                    reason: 'commission a Deep Dive report combining expert graph intelligence with live web research',
                },
                {
                    action: 'web_llm_research',
                    reason: 'run your own web/LLM research pass, clearly attributing non-Fodda findings',
                },
            ],
        };
    }

    normalizedData.next_moves = await generateNextMoves(
        rows,
        query,
        searchedGraphs,
        status,
        onTopicCount,
        suggestedAction,
        catalog,
        options?.analysts || getAnalysts(),
        options
    );

    console.error(`[coverage] status: ${status}, results: ${resultCount}/${limit || 'default'}${onTopicCount !== undefined ? `, on-topic: ${onTopicCount}` : ''}, query: "${query}"`);

    return normalizedData;
}

export interface NextMovesThread {
    kind: 'more_in_graph' | 'adjacent_room' | 'honest_thin' | 'expert_thread';
    graph_id?: string | undefined;
    graph_display?: string | undefined;
    remaining_count?: number | undefined;
    theme?: string | undefined;
    next_angle?: string | undefined;
    uncited_themes?: string[] | undefined;
    text?: string | undefined;
    adjacent?: {
        graph_id: string;
        graph_display: string;
        reason: string;
    } | undefined;
}

export interface NextMovesShelfGraph {
    graph_id: string;
    graph_display: string;
    domain?: string | undefined;
    headline?: string | undefined;
    reason?: string | undefined;
}

export interface NextMovesSpecific {
    brands?: string[] | undefined;
    statistics_source?: string | undefined;
    expert?: {
        analyst_id: string;
        display_name: string;
        reason: string;
    } | undefined;
    shelf_graphs?: NextMovesShelfGraph[] | undefined;
}

export interface NextMovesConsultEnvelope {
    thread_line: string;
    shelf_line?: string | undefined;
    scope_line: string;
}

export interface NextMoves {
    thread?: NextMovesThread | undefined;
    specific?: NextMovesSpecific | undefined;
    shelf?: NextMovesShelfGraph[] | undefined;
    scope_prompt: boolean;
    known_brand?: string | undefined;
    presentation?: 'internal' | undefined;
    consult_envelope?: NextMovesConsultEnvelope | undefined;
}

export interface NextMovesOptions {
    total?: number | undefined;
    onTopicTotal?: number | undefined;
    knownBrand?: string | undefined;
    currentAnalystId?: string | undefined;
    analysts?: CatalogAnalyst[] | undefined;
    isBrandTracker?: boolean | undefined;
    brandDisplayName?: string | undefined;
    competitiveLandscape?: string[] | undefined;
    earningsTicker?: string | undefined;
    earningsStatsSource?: string | undefined;
    foddaRequest?: FoddaRequestFn | undefined;
    apiKey?: string | undefined;
    userId?: string | undefined;
    sessionId?: string | undefined;
    sessionTracker?: any | undefined;
    suggestFn?: ((query: string) => Promise<any>) | undefined;
}

interface SuggestCacheEntry {
    timestamp: number;
    sources: Array<{ id: string; name: string; returns?: string; returns_draft?: boolean }>;
}

const suggestCache = new Map<string, SuggestCacheEntry>();
const SUGGEST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SUGGEST_CACHE_SIZE = 500;

export function clearSuggestCacheForTesting(): void {
    suggestCache.clear();
}

function setSuggestCacheEntry(key: string, sources: Array<{ id: string; name: string; returns?: string; returns_draft?: boolean }>): void {
    const now = Date.now();
    if (suggestCache.size >= MAX_SUGGEST_CACHE_SIZE) {
        for (const [k, v] of suggestCache.entries()) {
            if (now - v.timestamp >= SUGGEST_CACHE_TTL_MS) {
                suggestCache.delete(k);
            }
        }
    }
    if (suggestCache.size >= MAX_SUGGEST_CACHE_SIZE) {
        const oldestKey = suggestCache.keys().next().value;
        if (oldestKey) suggestCache.delete(oldestKey);
    }
    suggestCache.set(key, { timestamp: now, sources });
}

export function truncateAtWordBoundary(str: string, maxLength: number): string {
    if (!str || str.length <= maxLength) return str;
    const sub = str.slice(0, maxLength);
    const lastSpace = sub.lastIndexOf(' ');
    if (lastSpace > 10) {
        return sub.slice(0, lastSpace).trim();
    }
    return sub.trim();
}

export async function fetchSupplementalSuggest(
    query: string,
    options?: NextMovesOptions
): Promise<Array<{ id: string; name: string; returns?: string; returns_draft?: boolean }> | null> {
    const normQuery = query.toLowerCase().trim();
    const sessionId = options?.sessionId || options?.userId || 'default';
    const cacheKey = `${sessionId}:${normQuery}`;

    const cached = suggestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < SUGGEST_CACHE_TTL_MS) {
        return cached.sources;
    }

    try {
        let suggestPromise: Promise<any> | null = null;
        if (options?.suggestFn) {
            suggestPromise = options.suggestFn(query);
        } else if (options?.foddaRequest && options?.apiKey) {
            suggestPromise = options.foddaRequest(
                'GET',
                `/v1/supplemental/suggest?query=${encodeURIComponent(query)}`,
                options.apiKey,
                options.userId || ''
            );
        }

        if (!suggestPromise) {
            return null;
        }

        let timer: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('suggest timeout (1500ms)')), 1500);
        });

        const data = await Promise.race([suggestPromise, timeoutPromise]);
        clearTimeout(timer);
        const sources: any[] = Array.isArray(data?.sources) ? data.sources : [];
        setSuggestCacheEntry(cacheKey, sources);
        return sources;
    } catch (err: any) {
        console.error(`[next_moves] suggest fetch failed: ${err.message}`);
        return null;
    }
}

export interface ConsultNextMovesOptions {
    knownBrand?: string | undefined;
    currentAnalystId?: string | undefined;
    analysts?: CatalogAnalyst[] | undefined;
}

/**
 * Clean and truncate a single theme candidate to <= 3 words, lowercase.
 */
export function cleanThemeCandidate(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw
        .replace(/^\[(?:REVIW|REVIEW|DRAFT|WIP)\]\s*/i, '')
        .replace(/[&/+,]+/g, ' ')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .toLowerCase()
        .trim();

    if (!cleaned) return null;
    const stopWords = new Set(['and', 'or', 'the', 'in', 'of', 'for', 'with', 'to', 'a', 'an']);
    let words = cleaned.split(/\s+/).filter(Boolean);
    while (words.length > 0 && words[0] && stopWords.has(words[0])) words.shift();
    while (words.length > 0 && words[words.length - 1] && stopWords.has(words[words.length - 1]!)) words.pop();

    if (words.length === 0) return null;
    if (words.length > 3) {
        words = words.slice(0, 3);
        while (words.length > 0 && words[words.length - 1] && stopWords.has(words[words.length - 1]!)) words.pop();
    }
    return words.length > 0 ? words.join(' ') : null;
}

/**
 * Format raw theme candidates (topics, sectors, trend names, titles)
 * into concise, lowercase theme phrases (<= 3 words each).
 */
export function formatThemePhrase(rawCandidates: string[], fallback: string = 'emerging signals'): string {
    const cleanedThemes: string[] = [];
    const seen = new Set<string>();

    for (const raw of rawCandidates) {
        const cleaned = cleanThemeCandidate(raw);
        if (cleaned && !seen.has(cleaned)) {
            seen.add(cleaned);
            cleanedThemes.push(cleaned);
        }
    }

    if (cleanedThemes.length === 0) {
        return cleanThemeCandidate(fallback) || fallback.toLowerCase();
    }

    if (cleanedThemes.length === 1 && cleanedThemes[0]) {
        return cleanedThemes[0];
    }

    return `${cleanedThemes[0]} and ${cleanedThemes[1]}`;
}

export async function generateNextMoves(
    rows: any[],
    query: string,
    searchedGraphs: any[],
    status: 'ok' | 'thin' | 'empty',
    onTopicCount: number | undefined,
    suggestedAction: any,
    catalog: CatalogGraph[] = getGraphs(),
    analysts: CatalogAnalyst[] = getAnalysts(),
    options?: NextMovesOptions
): Promise<NextMoves> {
    const nextMoves: NextMoves = {
        scope_prompt: true,
        presentation: 'internal',
    };

    if (options?.knownBrand) {
        nextMoves.known_brand = options.knownBrand;
    }

    const searchedGraphIds = new Set<string>();
    for (const g of searchedGraphs) {
        const gid = typeof g === 'string' ? g : (g.graph_id || g.id || g.slug);
        if (gid) searchedGraphIds.add(gid);
    }
    for (const r of rows) {
        const gid = rowGraphId(r);
        if (gid) searchedGraphIds.add(gid);
    }

    // ── 1. Thread (Pull the thread) ──
    const tokens = specificQueryTokens(query);
    const rowsByGraph = new Map<string, any[]>();
    for (const r of rows) {
        const gid = rowGraphId(r) || (searchedGraphs[0]?.graph_id) || 'unknown';
        if (!rowsByGraph.has(gid)) rowsByGraph.set(gid, []);
        rowsByGraph.get(gid)!.push(r);
    }

    let maxRemainder = 0;
    let bestGraphId: string | undefined;
    let bestGraphTheme: string | undefined;

    // First pass: check per-graph on_topic_total / total attached to gRows[0]
    for (const [gid, gRows] of rowsByGraph.entries()) {
        const onTopicRows = gRows.filter(r => rowMatchesQueryTokens(r, tokens, catalog) || (rowScore(r) >= 0.75 * (TIER_NOMINAL_SCORE[resolveRowTier(r, searchedGraphs, catalog)] ?? 0.8)));
        const renderedCount = gRows.length;
        const gTotal = gRows[0]?.on_topic_total ?? gRows[0]?.total_count ?? gRows[0]?.total;
        let remainder = 0;
        if (typeof gTotal === 'number' && gTotal > renderedCount) {
            remainder = gTotal - renderedCount;
        }

        if (remainder > maxRemainder) {
            maxRemainder = remainder;
            bestGraphId = gid;
            const themes: string[] = [];
            for (const r of onTopicRows) {
                if (Array.isArray(r.topics)) themes.push(...r.topics);
                if (Array.isArray(r.sectors)) themes.push(...r.sectors);
            }
            const graphMeta = catalog.find(g => g.graph_id === gid);
            if (graphMeta?.topics?.length) themes.push(...graphMeta.topics);
            for (const r of onTopicRows) {
                if (r.title) themes.push(r.title);
                if (r.trend_name) themes.push(r.trend_name);
            }
            bestGraphTheme = formatThemePhrase(themes, graphMeta?.domain || 'emerging signals');
        }
    }

    // Second pass: if per-graph totals were not present on rows, check aggregate multi-graph totals in options
    if (maxRemainder === 0) {
        const totalMulti = options?.onTopicTotal ?? options?.total;
        if (typeof totalMulti === 'number' && totalMulti > rows.length) {
            maxRemainder = totalMulti - rows.length;
            let maxCount = 0;
            for (const [gid, gRows] of rowsByGraph.entries()) {
                if (gRows.length > maxCount) {
                    maxCount = gRows.length;
                    bestGraphId = gid;
                }
            }
            if (bestGraphId) {
                const gRows = rowsByGraph.get(bestGraphId) || [];
                const themes: string[] = [];
                for (const r of gRows) {
                    if (Array.isArray(r.topics)) themes.push(...r.topics);
                    if (Array.isArray(r.sectors)) themes.push(...r.sectors);
                }
                const graphMeta = catalog.find(g => g.graph_id === bestGraphId);
                if (graphMeta?.topics?.length) themes.push(...graphMeta.topics);
                for (const r of gRows) {
                    if (r.title) themes.push(r.title);
                    if (r.trend_name) themes.push(r.trend_name);
                }
                bestGraphTheme = formatThemePhrase(themes, graphMeta?.domain || 'emerging signals');
            }
        }
    }

    if (options?.isBrandTracker) {
        if (rows.length > 0) {
            let maxCount = 0;
            let topGraphId: string | undefined;
            for (const [gid, gRows] of rowsByGraph.entries()) {
                if (gRows.length > maxCount) {
                    maxCount = gRows.length;
                    topGraphId = gid;
                }
            }
            if (topGraphId) {
                const gRows = rowsByGraph.get(topGraphId) || [];
                const themes: string[] = [];
                for (const r of gRows) {
                    if (Array.isArray(r.topics)) themes.push(...r.topics);
                    if (Array.isArray(r.sectors)) themes.push(...r.sectors);
                }
                const gMeta = catalog.find(g => g.graph_id === topGraphId);
                if (gMeta?.topics?.length) themes.push(...gMeta.topics);
                for (const r of gRows) {
                    if (r.trend_name) themes.push(r.trend_name);
                    if (r.title) themes.push(r.title);
                }
                const bestTheme = formatThemePhrase(themes, gMeta?.domain || 'emerging signals');
                const display = gMeta ? buildDisplayName(gMeta) : (gRows[0]?.graphName || topGraphId);

                nextMoves.thread = {
                    kind: 'more_in_graph',
                    graph_id: topGraphId,
                    graph_display: display,
                    remaining_count: maxCount,
                    theme: bestTheme,
                };
            }
        } else {
            // Empty brand footprint: pick top domain graph from catalog without keyword-matching on bare brand name
            const unsearchedDomain = catalog.filter(g => !searchedGraphIds.has(g.graph_id) && (g.graph_type === 'domain' || !g.curator))[0] ||
                                     catalog.find(g => !searchedGraphIds.has(g.graph_id));
            if (unsearchedDomain) {
                const topDisplay = buildDisplayName(unsearchedDomain);
                const primarySearched = searchedGraphs[0];
                const primaryGid = typeof primarySearched === 'string' ? primarySearched : primarySearched?.graph_id;
                const primaryMeta = catalog.find(g => g.graph_id === primaryGid);
                const primaryDisplay = primaryMeta ? buildDisplayName(primaryMeta) : (primaryGid || topDisplay);
                nextMoves.thread = {
                    kind: 'honest_thin',
                    graph_id: primaryGid || unsearchedDomain.graph_id,
                    graph_display: primaryDisplay,
                    adjacent: {
                        graph_id: unsearchedDomain.graph_id,
                        graph_display: topDisplay,
                        reason: unsearchedDomain.headline || unsearchedDomain.domain || unsearchedDomain.name,
                    }
                };
            }
        }
    } else {
        const bestMeta = bestGraphId ? catalog.find(g => g.graph_id === bestGraphId) : undefined;
        const trendCount = bestMeta?.trend_count;
        const gOnTopicTotal = bestGraphId
            ? (rowsByGraph.get(bestGraphId)?.[0]?.on_topic_total ?? options?.onTopicTotal ?? (maxRemainder + rows.length))
            : undefined;

        const isSmallReportOrExhausted =
            (typeof trendCount === 'number' && trendCount > 0 && trendCount <= 15) ||
            (typeof trendCount === 'number' && trendCount > 0 && typeof gOnTopicTotal === 'number' && gOnTopicTotal >= 0.6 * trendCount);

        const canEmitMoreInGraph = maxRemainder > 0 && bestGraphId && !isSmallReportOrExhausted;

        if (canEmitMoreInGraph && bestGraphId) {
            const display = bestMeta ? buildDisplayName(bestMeta) : bestGraphId;
            nextMoves.thread = {
                kind: 'more_in_graph',
                graph_id: bestGraphId,
                graph_display: display,
                remaining_count: maxRemainder,
                theme: bestGraphTheme,
            };
        } else {
            // Fall through to unsearched adjacent_room or honest_thin
            let relevantCandidates: any[] = [];
            try {
                relevantCandidates = getRelevantGraphs(query);
            } catch {
                relevantCandidates = [];
            }

            const unsearchedCandidate = relevantCandidates.find(
                cand => cand.graph && !searchedGraphIds.has(cand.graph.graph_id) && (cand.score ?? 0) >= 0.10
            );

            if (unsearchedCandidate) {
                const adjG = unsearchedCandidate.graph;
                const adjDisplay = buildDisplayName(adjG);
                const primarySearched = searchedGraphs[0];
                const primaryGid = typeof primarySearched === 'string' ? primarySearched : primarySearched?.graph_id;
                const primaryMeta = catalog.find(g => g.graph_id === primaryGid);
                const primaryDisplay = primaryMeta ? buildDisplayName(primaryMeta) : (primaryGid || adjDisplay);

                nextMoves.thread = {
                    kind: (status === 'thin' || status === 'empty' || isSmallReportOrExhausted) ? 'honest_thin' : 'adjacent_room',
                    graph_id: primaryGid || adjG.graph_id,
                    graph_display: primaryDisplay,
                    adjacent: {
                        graph_id: adjG.graph_id,
                        graph_display: adjDisplay,
                        reason: adjG.headline || adjG.domain || adjG.description || adjG.name,
                    }
                };
            } else if (status === 'thin' || status === 'empty' || isSmallReportOrExhausted) {
                // Find any unsearched catalog graph (never self/searched)
                const unsearchedFallback = catalog.find(g => !searchedGraphIds.has(g.graph_id));
                if (unsearchedFallback) {
                    const adjDisplay = buildDisplayName(unsearchedFallback);
                    const primarySearched = searchedGraphs[0];
                    const primaryGid = typeof primarySearched === 'string' ? primarySearched : primarySearched?.graph_id;
                    const primaryMeta = catalog.find(g => g.graph_id === primaryGid);
                    const primaryDisplay = primaryMeta ? buildDisplayName(primaryMeta) : (primaryGid || adjDisplay);

                    nextMoves.thread = {
                        kind: 'honest_thin',
                        graph_id: primaryGid || unsearchedFallback.graph_id,
                        graph_display: primaryDisplay,
                        adjacent: {
                            graph_id: unsearchedFallback.graph_id,
                            graph_display: adjDisplay,
                            reason: unsearchedFallback.headline || unsearchedFallback.domain || unsearchedFallback.name,
                        }
                    };
                } else {
                    // All candidates are searched -> drop thread completely
                    nextMoves.thread = undefined;
                }
            } else {
                // ok status with 0 remainder and no unsearched room -> thread is undefined
                nextMoves.thread = undefined;
            }
        }
    }

    // ── 2. Specific (Go specific: brands, statistics_source, expert) ──
    const specific: NextMovesSpecific = {};

    // Brands: extract competitive landscape or top 2 brand entities present in returned rows
    if (options?.competitiveLandscape && options.competitiveLandscape.length > 0) {
        specific.brands = options.competitiveLandscape.slice(0, 2);
    } else if (options?.isBrandTracker) {
        // For brand reports, if competitiveLandscape is empty or omitted, leave specific.brands undefined — never pad!
        specific.brands = undefined;
    } else {
        const tokens = specificQueryTokens(query);
        const onTopicRows = rows.filter(r => rowMatchesQueryTokens(r, tokens, catalog) || (rowScore(r) >= 0.75 * (TIER_NOMINAL_SCORE[resolveRowTier(r, searchedGraphs, catalog)] ?? 0.8)));

        // If no on-topic rows exist, leave specific.brands undefined (do not fall back to off-topic noise rows)
        if (onTopicRows.length > 0) {
            // Build exclusion set of curator / organization / publisher tokens
            const publisherTokens = new Set([
                'dentsu', 'dentsu creative', 'havas', 'psfk', 'nielseniq', 'niq',
                'wpp', 'omnicom', 'ipg', 'publicis', 'accenture', 'deloitte',
                'mckinsey', 'bcg', 'bain', 'gartner', 'forrester', 'kantar', 'jwt',
                'ogilvy', 'edelman', 'mccann', 'bbdo', 'tbwa', 'vml', 'leo burnett'
            ]);

            // Add searched graph curators, companies, and names
            for (const sg of searchedGraphs) {
                const gMeta = typeof sg === 'string' ? catalog.find(x => x.graph_id === sg) : sg;
                if (gMeta) {
                    if (gMeta.curator) publisherTokens.add(gMeta.curator.toLowerCase().trim());
                    if (gMeta.company) publisherTokens.add(gMeta.company.toLowerCase().trim());
                    if (gMeta.name) publisherTokens.add(gMeta.name.toLowerCase().trim());
                    for (const word of `${gMeta.curator || ''} ${gMeta.company || ''} ${gMeta.name || ''}`.toLowerCase().split(/[\s,.-]+/)) {
                        if (word.length > 2) publisherTokens.add(word);
                    }
                }
            }

            // Also check source_label from rows
            for (const r of onTopicRows) {
                if (r.source_label) {
                    const match = String(r.source_label).match(/\(([^)]+)\)/);
                    if (match && match[1]) {
                        const org = match[1].toLowerCase().trim();
                        publisherTokens.add(org);
                        for (const w of org.split(/[\s,.-]+/)) {
                            if (w.length > 2) publisherTokens.add(w);
                        }
                    }
                }
            }

            const normalizeBrandKey = (name: string) => name.toLowerCase().replace(/[^\w\s]/g, '').trim().replace(/\s+/g, ' ');

            const brandCounts = new Map<string, { count: number; displayName: string }>();

            for (const r of onTopicRows) {
                const brandList: string[] = [];
                if (Array.isArray(r.brandNames)) brandList.push(...r.brandNames);
                if (Array.isArray(r.brands)) brandList.push(...r.brands);
                if (typeof r.brand === 'string' && r.brand) brandList.push(r.brand);
                if (typeof r.company === 'string' && r.company) brandList.push(r.company);
                if (Array.isArray(r.entities?.brands)) brandList.push(...r.entities.brands);

                for (const b of brandList) {
                    if (typeof b === 'string' && b.trim().length > 1) {
                        const clean = b.trim();
                        const norm = normalizeBrandKey(clean);
                        if (!norm) continue;

                        // Check against publisher tokens
                        if (publisherTokens.has(norm) || publisherTokens.has(clean.toLowerCase())) {
                            continue;
                        }
                        const isPub = [...publisherTokens].some(pt => norm === pt || norm.startsWith(`${pt} `) || norm.endsWith(` ${pt}`));
                        if (isPub) continue;

                        const existing = brandCounts.get(norm);
                        if (existing) {
                            existing.count++;
                        } else {
                            brandCounts.set(norm, { count: 1, displayName: clean });
                        }
                    }
                }
            }

            if (brandCounts.size > 0) {
                const qLow = query.toLowerCase();
                const sortedBrands = [...brandCounts.values()]
                    .filter(b => {
                        const bLow = b.displayName.toLowerCase();
                        return bLow !== qLow && !qLow.includes(bLow) && !bLow.includes(qLow);
                    })
                    .sort((a, b) => b.count - a.count)
                    .map(b => b.displayName)
                    .slice(0, 2);

                if (sortedBrands.length > 0) {
                    specific.brands = sortedBrands;
                }
            }
        }
    }

    // Statistics source: supplemental source or scored stat dataset
    if (options?.earningsStatsSource) {
        specific.statistics_source = options.earningsStatsSource;
    } else if (options?.earningsTicker || options?.isBrandTracker) {
        // Format with brand display name: "Lululemon's latest earnings and financial results"
        const brandName = (options as any)?.brandDisplayName || (options as any)?.brandName || query || 'the company';
        const cleanName = brandName.trim();
        let possessiveName = `${cleanName}'s`;
        if (cleanName.endsWith("'s") || cleanName.endsWith("’s")) {
            possessiveName = cleanName;
        } else if (cleanName.endsWith("s") || cleanName.endsWith("S")) {
            possessiveName = `${cleanName}'`;
        }
        if (options?.earningsTicker) {
            specific.statistics_source = `${possessiveName} latest earnings and financial results`;
        } else if (options?.isBrandTracker) {
            // If no competitor brands were found, fall back to market demand signals so line 2 is never empty
            if (!specific.brands || specific.brands.length === 0) {
                specific.statistics_source = 'Google Trends and market demand signals';
            }
        }
    } else {
        const qLower = query.toLowerCase();
        const isStatOrMarketShaped =
            suggestedAction !== undefined ||
            status === 'thin' ||
            status === 'empty' ||
            isDemandShaped(query) ||
            options?.knownBrand !== undefined ||
            (specific.brands && specific.brands.length > 0) ||
            /(?:market|spend|sales|growth|size|volume|rate|adoption|share|stats?|numbers?|forecast|demographics?|economic|inflation|pricing|consumer|retail|cpg|beauty|fashion|auto|tech|work|travel|food|drink|beverage|culture|trends?|brand|performance|activity)/i.test(qLower);

        if (isStatOrMarketShaped) {
            let suggestHandled = false;
            if (options?.foddaRequest || options?.suggestFn) {
                const sources = await fetchSupplementalSuggest(query, options);
                if (sources && sources.length > 0) {
                    const validSources = sources.filter(s => s && s.returns_draft !== true && s.name);
                    if (validSources.length > 0) {
                        const topSources = validSources.slice(0, 2);
                        if (topSources.length === 2 && topSources[0] && topSources[1]) {
                            specific.statistics_source = `${topSources[0].name} and ${topSources[1].name}`;
                        } else if (topSources[0]) {
                            specific.statistics_source = topSources[0].name;
                        }
                        suggestHandled = true;
                        options?.sessionTracker?.recordSuggestPath?.('suggest');
                        console.error(`[next_moves] statistics_source from suggest: "${specific.statistics_source}"`);
                    }
                }
            }

            if (!suggestHandled) {
                options?.sessionTracker?.recordSuggestPath?.('regex-fallback');
                console.error(`[next_moves] statistics_source from regex-fallback`);
                if (/(?:retail|spend|sales|commerce|shopping|store|grocery|cpg|consumer)/i.test(qLower)) {
                    specific.statistics_source = 'Census retail trade and spending data';
                } else if (/(?:search|demand|interest|popular|google|volume|buzz|social)/i.test(qLower)) {
                    specific.statistics_source = 'Google Trends search volume and breakout queries';
                } else if (/(?:employment|labor|job|wage|worker|workplace|talent|hiring)/i.test(qLower)) {
                    specific.statistics_source = 'BLS labor and employment metrics';
                } else if (/(?:economic|inflation|cpi|interest\s+rate|gdp|macro|fed|recession)/i.test(qLower)) {
                    specific.statistics_source = 'FRED macroeconomic series';
                } else if (/(?:beauty|fashion|apparel|luxury|sport|wellness|food|beverage)/i.test(qLower)) {
                    specific.statistics_source = 'Census and Google Trends market demand data';
                } else {
                    specific.statistics_source = 'Census and FRED market statistics';
                }
            }
        }
    }

    // Expert: first Active analyst whose graph was searched or scored >= threshold in routing
    const activeAnalysts = analysts.filter(a => {
        const st = (a.status || a.Status || '').toLowerCase().trim();
        return !st || st === 'active';
    });

    const isCurrentAnalyst = (a: CatalogAnalyst) => {
        if (!options?.currentAnalystId) return false;
        const cur = options.currentAnalystId.toLowerCase().trim();
        return (a.analyst_id && a.analyst_id.toLowerCase().trim() === cur) ||
               (a.name && a.name.toLowerCase().trim() === cur);
    };

    const matchedAnalyst = activeAnalysts.find(a => {
        if (isCurrentAnalyst(a)) return false;
        const aSlug = (a.analyst_id || '').toLowerCase().trim();
        if (searchedGraphIds.has(aSlug)) return true;
        const aName = (a.name || '').toLowerCase();
        const aDesc = (a.description || '').toLowerCase();
        if (tokens.some(t => aName.includes(t) || aDesc.includes(t))) return true;
        return false;
    });

    if (matchedAnalyst) {
        let lane = '';
        if (matchedAnalyst.expert_in && matchedAnalyst.expert_in.trim().length > 0) {
            lane = truncateAtWordBoundary(matchedAnalyst.expert_in.trim(), 60);
        } else if (matchedAnalyst.description && matchedAnalyst.description.trim().length > 0) {
            const firstClause = (matchedAnalyst.description.split(/[,.;]/)[0] || '').trim();
            lane = truncateAtWordBoundary(firstClause, 60);
        }

        const reason = lane && lane.length > 3
            ? `covers ${lane} directly`
            : 'covers this domain directly';

        specific.expert = {
            analyst_id: matchedAnalyst.analyst_id,
            display_name: matchedAnalyst.name,
            reason,
        };
    }

    if (Object.keys(specific).length > 0) {
        nextMoves.specific = specific;
    }

    return nextMoves;
}

/**
 * Generate consult-specific next moves envelope adhering to Render Spec 1.3.
 *
 * Sentence 1 (Thread): Expert's 1st-person next move (using expert_thread.next_angle,
 *   with fallback to uncited themes / remaining count; out-of-lane declination uses top referral).
 * Sentence 2 (Shelf): Fodda platform merchandising via catalogCache.getRelevantGraphs()
 *   (strictly excluding the expert's own graph).
 * Sentence 3 (Scope): Deliverable / project scope line.
 */
export function generateConsultNextMoves(
    result: any,
    query: string,
    analystId: string,
    options?: ConsultNextMovesOptions,
    catalog: CatalogGraph[] = getGraphs(),
    analysts: CatalogAnalyst[] = getAnalysts()
): NextMoves {
    const nextMoves: NextMoves = {
        scope_prompt: true,
        presentation: 'internal',
    };

    if (options?.knownBrand) {
        nextMoves.known_brand = options.knownBrand;
    }

    const cleanAnalystId = (analystId || '').toLowerCase().trim();
    const matchedAnalyst = analysts.find(a => {
        const aId = (a.analyst_id || (a as any).id || (a as any).slug || '').toLowerCase().trim();
        const aName = (a.name || '').toLowerCase().trim();
        return aId === cleanAnalystId || aName === cleanAnalystId;
    });

    const expertDisplayName = matchedAnalyst?.name || analystId;
    const expertGraphId = matchedAnalyst?.analyst_id || analystId;

    const expertThread = result?.expert_thread || {};
    // Read next_angle strictly from expert_thread.next_angle per §2.A.5
    const nextAngleRaw = expertThread?.next_angle;
    const uncitedThemes = Array.isArray(expertThread?.uncited_themes) ? expertThread.uncited_themes : [];
    const coverage = (result?.coverage || 'ok').toLowerCase().trim();
    const isOutOfLane = coverage === 'out' || expertThread?.on_topic_total === 0;

    // ── Sentence 1: Thread (Expert's 1st Person / Referral on decline) ──
    let threadSentence = '';

    if (isOutOfLane) {
        const activeReferrals = Array.isArray(result?.referrals)
            ? result.referrals.filter((r: any) => {
                const rStatus = (r.status || r.Status || '').toLowerCase().trim();
                return !rStatus || rStatus === 'active';
            })
            : [];
        if (activeReferrals.length > 0) {
            const topRef = activeReferrals[0];
            const refName = topRef.name || topRef.curator || 'another expert';
            const refReason = topRef.reason ? `who covers ${topRef.reason}` : 'who covers this topic directly';
            threadSentence = `For inquiries on this topic, I'd recommend connecting with ${refName} ${refReason}.`;
            nextMoves.thread = {
                kind: 'adjacent_room',
                graph_id: topRef.id || topRef.analyst_id || topRef.slug,
                graph_display: refName,
                adjacent: {
                    graph_id: topRef.id || topRef.analyst_id || topRef.slug,
                    graph_display: refName,
                    reason: topRef.reason || 'related expertise',
                },
                text: threadSentence,
            };
        } else {
            threadSentence = `That's what Fodda holds on this right now; if you have a related topic in my graph, let me know.`;
            nextMoves.thread = {
                kind: 'honest_thin',
                graph_id: expertGraphId,
                graph_display: expertDisplayName,
                text: threadSentence,
            };
        }
    } else {
        // Next angle token check per §2.A.5: must share >=1 content token (>=3 chars) with sources_used or uncited_themes
        let nextAngleValid = false;
        if (typeof nextAngleRaw === 'string' && nextAngleRaw.trim().length > 0) {
            const angleTokens = specificQueryTokens(nextAngleRaw);
            const sourceTitles = (result?.sources_used || []).map((s: any) => (s.title || s.name || '').toLowerCase());
            const themeTexts = uncitedThemes.map((t: string) => t.toLowerCase());
            const groundingCorpus = [...sourceTitles, ...themeTexts].join(' ');

            const hasSharedToken = angleTokens.some(tok => tok.length >= 3 && groundingCorpus.includes(tok));
            if (hasSharedToken || (sourceTitles.length === 0 && themeTexts.length === 0)) {
                nextAngleValid = true;
            }
        }

        if (nextAngleValid && typeof nextAngleRaw === 'string') {
            let cleanNextAngle = nextAngleRaw.trim();
            if (!/[.!?]$/.test(cleanNextAngle)) {
                cleanNextAngle += '.';
            }
            threadSentence = cleanNextAngle;
            nextMoves.thread = {
                kind: 'expert_thread',
                graph_id: expertGraphId,
                graph_display: expertDisplayName,
                next_angle: cleanNextAngle,
                text: threadSentence,
            };
        } else if (uncitedThemes.length > 0) {
            const topTheme = uncitedThemes[0];
            threadSentence = `If you want to stay on this, we can look into ${topTheme} in my graph.`;
            nextMoves.thread = {
                kind: 'expert_thread',
                graph_id: expertGraphId,
                graph_display: expertDisplayName,
                theme: topTheme,
                uncited_themes: uncitedThemes,
                text: threadSentence,
            };
        } else {
            const onTopicTotal = typeof expertThread?.on_topic_total === 'number' ? expertThread.on_topic_total : undefined;
            const citedCount = typeof expertThread?.cited_count === 'number' ? expertThread.cited_count : (Array.isArray(result?.sources_used) ? result.sources_used.length : 0);
            let remainder = (onTopicTotal !== undefined && onTopicTotal > citedCount) ? (onTopicTotal - citedCount) : 0;

            if (remainder >= 10) {
                threadSentence = `There are many more trends in my graph exploring this topic — want me to pull those?`;
            } else if (remainder > 0) {
                threadSentence = `There are several more trends in my graph exploring this topic — want me to pull those?`;
            } else {
                threadSentence = `If you want to stay on this, we can explore deeper signals in my graph.`;
            }

            nextMoves.thread = {
                kind: 'expert_thread',
                graph_id: expertGraphId,
                graph_display: expertDisplayName,
                remaining_count: remainder > 0 ? remainder : undefined,
                text: threadSentence,
            };
        }
    }

    // ── Sentence 2: Shelf (Platform Voice Merchandising) ──
    let relevantCandidates: any[] = [];
    try {
        relevantCandidates = getRelevantGraphs(query);
    } catch {
        relevantCandidates = [];
    }

    const expertOwnIds = new Set<string>([cleanAnalystId, expertGraphId.toLowerCase()]);
    if (matchedAnalyst) {
        if (matchedAnalyst.analyst_id) expertOwnIds.add(matchedAnalyst.analyst_id.toLowerCase());
        if ((matchedAnalyst as any).id) expertOwnIds.add(String((matchedAnalyst as any).id).toLowerCase());
        if ((matchedAnalyst as any).slug) expertOwnIds.add(String((matchedAnalyst as any).slug).toLowerCase());
    }

    const SHELF_RELEVANCE_FLOOR = 0.10;
    const shelfCandidateGraphs: CatalogGraph[] = [];
    for (const cand of relevantCandidates) {
        if ((cand.score ?? 0) < SHELF_RELEVANCE_FLOOR) continue;
        const g = cand.graph;
        if (!g) continue;
        const gid = (g.graph_id || (g as any).id || '').toLowerCase();
        if (expertOwnIds.has(gid)) continue;
        if (g.curator && g.curator.toLowerCase() === expertDisplayName.toLowerCase()) continue;
        if (g.name && g.name.toLowerCase() === expertDisplayName.toLowerCase()) continue;
        if (shelfCandidateGraphs.length < 2 && !shelfCandidateGraphs.some(sg => sg.graph_id === g.graph_id)) {
            shelfCandidateGraphs.push(g);
        }
    }

    let shelfSentence = '';
    const hasDeliverableOffering = Array.isArray(matchedAnalyst?.offerings) && matchedAnalyst.offerings.length > 0;

    if (shelfCandidateGraphs.length > 0) {
        const shelfGraphs: NextMovesShelfGraph[] = shelfCandidateGraphs.map(g => ({
            graph_id: g.graph_id,
            graph_display: buildDisplayName(g),
            domain: g.domain,
            headline: g.headline,
            reason: g.headline || g.domain || g.name,
        }));
        nextMoves.shelf = shelfGraphs;

        if (shelfGraphs.length >= 2 && shelfGraphs[0]?.graph_display && shelfGraphs[1]?.graph_display) {
            shelfSentence = `Fodda also holds trend signals on this in ${shelfGraphs[0].graph_display} and ${shelfGraphs[1].graph_display} if you want the wider picture`;
        } else if (shelfGraphs.length >= 1 && shelfGraphs[0]?.graph_display) {
            shelfSentence = `Fodda also holds trend signals on this in ${shelfGraphs[0].graph_display} if you want the wider picture`;
        }

        if (hasDeliverableOffering) {
            shelfSentence += `, and ${expertDisplayName} takes scoped briefs on this if you need a deliverable.`;
        } else {
            shelfSentence += `.`;
        }
    } else {
        // Empty candidate list — omit sentence 2 per Brief 1.46.29
        shelfSentence = '';
        nextMoves.shelf = undefined;
    }

    const specific: NextMovesSpecific = {};
    if (nextMoves.shelf && nextMoves.shelf.length > 0) {
        specific.shelf_graphs = nextMoves.shelf;
    }
    if (Array.isArray(expertThread?.brands) && expertThread.brands.length > 0) {
        specific.brands = expertThread.brands.slice(0, 2);
    }
    if (Array.isArray(result?.referrals) && result.referrals.length > 0) {
        const topRef = result.referrals[0];
        specific.expert = {
            analyst_id: topRef.id || topRef.analyst_id || topRef.slug,
            display_name: topRef.name || topRef.curator,
            reason: topRef.reason || 'related expertise',
        };
    }
    if (Object.keys(specific).length > 0) {
        nextMoves.specific = specific;
    }

    // ── Sentence 3: Scope (Platform Voice, Render Spec 1.2 Copy) ──
    let scopeSentence = '';
    if (options?.knownBrand) {
        scopeSentence = `Want this cut to ${options.knownBrand} specifically?`;
    } else {
        scopeSentence = `If you tell me the brand or brief you're working on, I'll cut this to that.`;
    }

    nextMoves.consult_envelope = {
        thread_line: threadSentence,
        shelf_line: shelfSentence || undefined,
        scope_line: scopeSentence,
    };

    return nextMoves;
}

/**
 * Render the consult 3-sentence closing envelope complying with Render Spec 1.3.
 */
export function renderConsultClosingEnvelope(nextMoves: NextMoves | undefined): { lines: string[]; text: string } {
    if (!nextMoves?.consult_envelope) {
        return renderClosingBlock(nextMoves);
    }
    const { thread_line, shelf_line, scope_line } = nextMoves.consult_envelope;
    const lines = [thread_line, shelf_line, scope_line].filter((l): l is string => Boolean(l));
    return {
        lines,
        text: lines.join(' '),
    };
}

/**
 * Universal closing block renderer supporting both general research (Render Spec 1.2/1.3)
 * and consult-specific responses (Render Spec 1.3).
 */
export function renderClosingBlock(nextMoves: NextMoves | undefined): { lines: string[]; text: string } {
    if (!nextMoves) return { lines: [], text: '' };

    if (nextMoves.consult_envelope) {
        const { thread_line, shelf_line, scope_line } = nextMoves.consult_envelope;
        const lines = [thread_line, shelf_line, scope_line].filter((l): l is string => Boolean(l));
        return {
            lines,
            text: lines.join(' '),
        };
    }

    const lines: string[] = [];

    // Line 1: Pull the thread
    if (nextMoves.thread) {
        const t = nextMoves.thread;
        if (t.text) {
            lines.push(t.text);
        } else if (t.kind === 'more_in_graph' && t.remaining_count && t.remaining_count > 0) {
            const countPhrase = t.remaining_count >= 10 ? 'many more trends' : 'several more trends';
            lines.push(`There are ${countPhrase} in ${t.graph_display || 'the graph'} exploring ${t.theme || 'this topic'} — want me to pull those?`);
        } else if (t.kind === 'adjacent_room' && t.adjacent) {
            lines.push(`We also have related coverage in ${t.adjacent.graph_display} — want me to pull that?`);
        } else if (t.kind === 'honest_thin' && t.adjacent) {
            lines.push(`That's what Fodda holds on this right now; the closest adjacent hit is ${t.adjacent.reason || 'related research'} in ${t.adjacent.graph_display} — want it?`);
        }
    }

    // Line 2: Go specific
    if (nextMoves.specific) {
        const s = nextMoves.specific;
        const options: string[] = [];
        if (s.brands && s.brands.length > 0) {
            options.push(`look into ${s.brands.join(' or ')}`);
        }
        if (s.statistics_source) {
            options.push(`pull quantitative data from ${s.statistics_source}`);
        }
        if (s.expert && options.length < 2) {
            options.push(`consult ${s.expert.display_name}`);
        }

        if (options.length > 0) {
            lines.push(`Or we can ${options.slice(0, 2).join(' or ')}.`);
        }
    }

    // Line 3: Scope to the job
    if (nextMoves.known_brand) {
        lines.push(`Want this cut to ${nextMoves.known_brand} specifically?`);
    } else {
        lines.push(`If you tell me the brand or brief you're working on, I'll cut this to that.`);
    }

    return { lines, text: lines.join(' ') };
}
