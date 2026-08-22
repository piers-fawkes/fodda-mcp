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

function rowScore(row: any): number {
    return row.relevance_score || row.semantic_score || row._score || row.score || 0;
}

function rowGraphId(row: any): string | undefined {
    return row._use_this_graphId || row.graphId || row.graph_id || row.psfk_graph_slug || undefined;
}

function resolveRowTier(row: any, searchedGraphs: any[], catalog: CatalogGraph[]): string {
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

export function addCoverageAnnotation(
    data: any,
    query: string,
    searchedGraphs: any[],
    limit: number | undefined,
    skipEvidenceCheck: boolean = false,
    catalog: CatalogGraph[] = getGraphs(),
    options?: NextMovesOptions
): any {
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

    normalizedData.next_moves = generateNextMoves(
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
    kind: 'more_in_graph' | 'adjacent_room' | 'honest_thin';
    graph_id?: string | undefined;
    graph_display?: string | undefined;
    remaining_count?: number | undefined;
    theme?: string | undefined;
    adjacent?: {
        graph_id: string;
        graph_display: string;
        reason: string;
    } | undefined;
}

export interface NextMovesSpecific {
    brands?: string[] | undefined;
    statistics_source?: string | undefined;
    expert?: {
        analyst_id: string;
        display_name: string;
        reason: string;
    } | undefined;
}

export interface NextMoves {
    thread?: NextMovesThread | undefined;
    specific?: NextMovesSpecific | undefined;
    scope_prompt: boolean;
    known_brand?: string | undefined;
    presentation?: 'internal' | undefined;
}

export interface NextMovesOptions {
    total?: number | undefined;
    onTopicTotal?: number | undefined;
    knownBrand?: string | undefined;
    currentAnalystId?: string | undefined;
    analysts?: CatalogAnalyst[] | undefined;
}

export function generateNextMoves(
    rows: any[],
    query: string,
    searchedGraphs: any[],
    status: 'ok' | 'thin' | 'empty',
    onTopicCount: number | undefined,
    suggestedAction: any,
    catalog: CatalogGraph[] = getGraphs(),
    analysts: CatalogAnalyst[] = getAnalysts(),
    options?: NextMovesOptions
): NextMoves {
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

    if (rowsByGraph.size > 1) {
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
                    if (r.title) themes.push(r.title);
                }
                const graphMeta = catalog.find(g => g.graph_id === bestGraphId);
                bestGraphTheme = themes.slice(0, 2).join(' and ') || graphMeta?.domain || 'emerging signals';
            }
        }
    } else {
        for (const [gid, gRows] of rowsByGraph.entries()) {
            const onTopicRows = gRows.filter(r => rowMatchesQueryTokens(r, tokens, catalog) || (rowScore(r) >= 0.75 * (TIER_NOMINAL_SCORE[resolveRowTier(r, searchedGraphs, catalog)] ?? 0.8)));
            const renderedCount = gRows.length;
            const gTotal = gRows[0]?.on_topic_total ?? gRows[0]?.total_count ?? gRows[0]?.total ?? options?.onTopicTotal ?? options?.total;
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
                    if (r.title) themes.push(r.title);
                }
                const graphMeta = catalog.find(g => g.graph_id === gid);
                if (graphMeta?.topics?.length) themes.push(...graphMeta.topics);
                bestGraphTheme = themes.slice(0, 2).join(' and ') || graphMeta?.domain || 'emerging signals';
            }
        }
    }

    if (maxRemainder > 0 && bestGraphId) {
        const gMeta = catalog.find(g => g.graph_id === bestGraphId);
        const display = gMeta ? buildDisplayName(gMeta) : bestGraphId;
        nextMoves.thread = {
            kind: 'more_in_graph',
            graph_id: bestGraphId,
            graph_display: display,
            remaining_count: maxRemainder,
            theme: bestGraphTheme,
        };
    } else if (status === 'thin' || status === 'empty') {
        // honest_thin ONLY when status is thin or empty
        let relevantCandidates: any[] = [];
        try {
            relevantCandidates = getRelevantGraphs(query);
        } catch {
            relevantCandidates = [];
        }
        const candidateGraphs = relevantCandidates.map(c => c.graph).filter(Boolean);
        if (candidateGraphs.length === 0 && catalog?.length > 0) {
            candidateGraphs.push(...catalog);
        }
        const closest = candidateGraphs.find(g => !searchedGraphIds.has(g.graph_id)) || candidateGraphs[0];
        if (closest) {
            const closestDisplay = buildDisplayName(closest);
            const primarySearched = searchedGraphs[0];
            const primaryGid = typeof primarySearched === 'string' ? primarySearched : primarySearched?.graph_id;
            const primaryMeta = catalog.find(g => g.graph_id === primaryGid);
            const primaryDisplay = primaryMeta ? buildDisplayName(primaryMeta) : (primaryGid || closestDisplay);

            nextMoves.thread = {
                kind: 'honest_thin',
                graph_id: primaryGid || closest.graph_id,
                graph_display: primaryDisplay,
                adjacent: {
                    graph_id: closest.graph_id,
                    graph_display: closestDisplay,
                    reason: closest.headline || closest.domain || closest.name,
                }
            };
        }
        // If no candidate exists, thread is undefined (no fabrication)
    } else {
        // status is 'ok' with 0 remainder everywhere: check for unsearched adjacent room
        let relevantCandidates: any[] = [];
        try {
            relevantCandidates = getRelevantGraphs(query);
        } catch {
            relevantCandidates = [];
        }

        const unsearched = relevantCandidates.find(cand => cand.graph && !searchedGraphIds.has(cand.graph.graph_id));
        if (unsearched) {
            const adjG = unsearched.graph;
            const adjDisplay = buildDisplayName(adjG);
            const primarySearched = searchedGraphs[0];
            const primaryGid = typeof primarySearched === 'string' ? primarySearched : primarySearched?.graph_id;
            const primaryMeta = catalog.find(g => g.graph_id === primaryGid);
            const primaryDisplay = primaryMeta ? buildDisplayName(primaryMeta) : (primaryGid || adjDisplay);

            nextMoves.thread = {
                kind: 'adjacent_room',
                graph_id: primaryGid || adjG.graph_id,
                graph_display: primaryDisplay,
                adjacent: {
                    graph_id: adjG.graph_id,
                    graph_display: adjDisplay,
                    reason: adjG.headline || adjG.domain || adjG.description || adjG.name,
                }
            };
        }
        // If no unsearched relevant room, thread is undefined (drop the line, no fabrication)
    }

    // ── 2. Specific (Go specific: brands, statistics_source, expert) ──
    const specific: NextMovesSpecific = {};

    // Brands: extract top 2 brand entities present in the returned rows
    const brandCounts = new Map<string, number>();
    for (const r of rows) {
        const brandList: string[] = [];
        if (Array.isArray(r.brandNames)) brandList.push(...r.brandNames);
        if (Array.isArray(r.brands)) brandList.push(...r.brands);
        if (typeof r.brand === 'string' && r.brand) brandList.push(r.brand);
        if (typeof r.company === 'string' && r.company) brandList.push(r.company);
        if (Array.isArray(r.entities?.brands)) brandList.push(...r.entities.brands);

        for (const b of brandList) {
            if (typeof b === 'string' && b.trim().length > 1) {
                const cleaned = b.trim();
                brandCounts.set(cleaned, (brandCounts.get(cleaned) || 0) + 1);
            }
        }
    }

    if (brandCounts.size > 0) {
        const sortedBrands = [...brandCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([brand]) => brand)
            .slice(0, 2);
        specific.brands = sortedBrands;
    }

    // Statistics source: supplemental source or scored stat dataset
    const qLower = query.toLowerCase();
    const isStatOrMarketShaped =
        suggestedAction !== undefined ||
        isDemandShaped(query) ||
        options?.knownBrand !== undefined ||
        brandCounts.size > 0 ||
        /(?:market|spend|sales|growth|size|volume|rate|adoption|share|stats?|numbers?|forecast|demographics?|economic|inflation|pricing|consumer|retail|cpg|beauty|fashion|auto|tech|work|travel|food|drink|beverage|culture|trends?|brand|performance|activity)/i.test(qLower);

    if (isStatOrMarketShaped) {
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
        specific.expert = {
            analyst_id: matchedAnalyst.analyst_id,
            display_name: matchedAnalyst.name,
            reason: matchedAnalyst.description ? `covers ${matchedAnalyst.description.slice(0, 50).trim()} directly` : 'covers this domain directly',
        };
    }

    if (Object.keys(specific).length > 0) {
        nextMoves.specific = specific;
    }

    return nextMoves;
}
