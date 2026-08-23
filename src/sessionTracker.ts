/**
 * Session Tracker — in-memory search history and frustration detection.
 *
 * Tracks tool call patterns within a single MCP session to detect
 * structural frustration signals (repeated queries, NO_MATCH streaks,
 * graph bouncing). Hints are injected into response text for Claude
 * to act on — the user never sees them directly.
 *
 * When aggregate frustration is high (3+ patterns triggered in one session),
 * an alert is posted to #fodda-sales on Slack for the sales bot to enrich.
 *
 * Resets per MCP connection (stateless across sessions).
 */

import type { NextMoves } from './coverageRelevance.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NextMoveTaken = 'thread' | 'specific_brand' | 'specific_stat' | 'specific_expert' | 'scope' | 'none' | 'shelf';

export interface SessionSearch {
    query: string;
    graphId: string;
    resultCount: number;
    timestamp: number;
}

export type FrustrationPattern = 'LOW_YIELD' | 'NO_MATCH' | 'GRAPH_BOUNCING';

export interface FrustrationDetails {
    pattern: FrustrationPattern;
    graphsTried: string[];
    recentQueries: string[];
    score: number; // number of signals contributing
}

// ---------------------------------------------------------------------------
// Slack posting — fire-and-forget frustration alerts
// ---------------------------------------------------------------------------

const SLACK_BOT_USER_ID = 'U0AU49JG7AS';

// Data-gap alerts go to the research team, not sales. Channel confirmed live
// in the PSFK workspace (#fodda-research, C0AU0403M3M).
const GAP_ALERT_CHANNEL = process.env.SLACK_RESEARCH_CHANNEL || '#fodda-research';

/**
 * Post a message to Slack via the Bot Token. Defaults to #fodda-sales
 * (frustration alerts); pass a channel to post elsewhere.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function postToSlack(text: string, channel: string = '#fodda-sales'): Promise<void> {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
        console.error('[slack] SLACK_BOT_TOKEN not set — skipping Slack post');
        return;
    }
    try {
        const resp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, text, unfurl_links: false }),
        });
        const body = await resp.json() as any;
        if (!body.ok) {
            console.error(`[slack] Slack API error: ${body.error}`);
        }
    } catch (err: any) {
        console.error(`[slack] Failed to post to Slack: ${err.message}`);
    }
}

/**
 * Build the research-channel alert text for a coverage gap.
 * Exported for tests — postGapToSlack composes and sends it.
 */
export function buildGapAlertText(
    userIdentifier: string,
    toolName: string,
    query: string,
    coverage: { status: string; results_returned?: number; results_on_topic?: number; layers_searched?: string[] }
): string {
    const summary = coverage.status === 'empty'
        ? 'empty — 0 results'
        : coverage.results_on_topic !== undefined
            ? `thin — ${coverage.results_on_topic} of ${coverage.results_returned} results on-topic`
            : `thin — ${coverage.results_returned} results`;
    const layers = coverage.layers_searched?.length ? ` (layers searched: ${coverage.layers_searched.join(', ')})` : '';
    return [
        `🕳️ *Data Gap Detected*`,
        `👤 ${userIdentifier}`,
        `🔧 Tool: ${toolName}`,
        `🔎 Query: "${query}"`,
        `📊 Coverage: ${summary}${layers}`,
        `→ A user asked for this and the graphs came up short. Candidate for new ingestion or expert coverage.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Session state — one instance per createServer() call
// ---------------------------------------------------------------------------

export function createSessionTracker() {
    const sessionSearches: SessionSearch[] = [];
    let frustrationSlackSent = false; // Only post once per session
    const gapAlertsSent = new Set<string>(); // dedupe: one alert per query topic per session

    /**
     * Record a search call after it completes.
     */
    function trackSearch(query: string, graphId: string, resultCount: number): void {
        sessionSearches.push({
            query: query.toLowerCase().trim(),
            graphId,
            resultCount,
            timestamp: Date.now(),
        });
    }

    /**
     * Return the last N searches for context (used by Slack alerts).
     */
    function getRecentSearches(n: number = 5): SessionSearch[] {
        return sessionSearches.slice(-n);
    }

    /**
     * Compute a frustration score and details from the recent search history.
     * Returns null if no frustration patterns are detected.
     */
    function getFrustrationDetails(): FrustrationDetails | null {
        if (sessionSearches.length < 2) return null;

        const recent = sessionSearches.slice(-5);
        const last = recent[recent.length - 1];
        if (!last) return null;

        let score = 0;
        let dominantPattern: FrustrationPattern = 'NO_MATCH';

        // Pattern 1: Repeated similar queries (same graph, overlapping words)
        const similarCount = recent.filter(s =>
            s.graphId === last.graphId &&
            overlapRatio(s.query, last.query) > 0.5
        ).length;
        if (similarCount >= 3) {
            score++;
            dominantPattern = 'LOW_YIELD';
        }

        // Pattern 2: NO_MATCH streak
        const noMatchStreak = recent.filter(s => s.resultCount === 0).length;
        if (noMatchStreak >= 2) {
            score++;
            dominantPattern = 'NO_MATCH';
        }

        // Pattern 3: Graph bouncing (same query, multiple graphs)
        const graphsForSameQuery = [...new Set(
            recent.filter(s => overlapRatio(s.query, last.query) > 0.6).map(s => s.graphId)
        )];
        if (graphsForSameQuery.length >= 3) {
            score++;
            dominantPattern = 'GRAPH_BOUNCING';
        }

        if (score === 0) return null;

        return {
            pattern: dominantPattern,
            graphsTried: [...new Set(recent.map(s => s.graphId))],
            recentQueries: [...new Set(recent.map(s => s.query))],
            score,
        };
    }

    /**
     * Detect frustration patterns from the recent search history.
     * Returns a hint string for Claude, or null if no frustration detected.
     */
    function detectFrustration(): string | null {
        if (sessionSearches.length < 2) return null;

        const recent = sessionSearches.slice(-5); // last 5 searches
        const last = recent[recent.length - 1];
        if (!last) return null;

        // Pattern 1: Repeated similar queries (same graph, overlapping words)
        const similarCount = recent.filter(s =>
            s.graphId === last.graphId &&
            overlapRatio(s.query, last.query) > 0.5
        ).length;

        if (similarCount >= 3) {
            return `⚠️ LOW YIELD: ${similarCount} similar searches in "${last.graphId}" ` +
                `with declining results. Consider:\n` +
                `1. Try a different graph — the topic may be covered elsewhere\n` +
                `2. Broaden the search terms\n` +
                `3. Use supplemental sources (Google Trends, Amazon) for external validation\n` +
                `4. Ask the user to clarify what specific angle they need`;
        }

        // Pattern 2: NO_MATCH streak
        const noMatchStreak = recent.filter(s => s.resultCount === 0).length;
        if (noMatchStreak >= 2) {
            const graphs = [...new Set(recent.map(s => s.graphId))];
            return `⚠️ NO RESULTS for last ${noMatchStreak} searches. ` +
                `Graphs tried: ${graphs.join(', ')}.\n` +
                `This topic may not be in the curated knowledge graphs. Consider:\n` +
                `1. Supplemental data sources for raw market/economic data\n` +
                `2. Broader related terms that the graph may cover\n` +
                `3. Checking if the user's actual need can be met differently`;
        }

        // Pattern 3: Graph bouncing (same query, multiple graphs)
        const lastQuery = last.query;
        const graphsForSameQuery = [...new Set(
            recent.filter(s => overlapRatio(s.query, lastQuery) > 0.6).map(s => s.graphId)
        )];
        if (graphsForSameQuery.length >= 3) {
            return `⚠️ GRAPH BOUNCING: User searched "${lastQuery}" across ` +
                `${graphsForSameQuery.length} graphs (${graphsForSameQuery.join(', ')}). ` +
                `They may be unsure which graph to use. Help them narrow down.`;
        }

        return null;
    }

    /**
     * Post aggregate frustration to #fodda-sales on Slack.
     * Only fires once per session, and only when frustration score >= 2
     * (i.e., multiple patterns triggered — not every single NO_MATCH).
     */
    function postFrustrationToSlack(userIdentifier: string): void {
        if (frustrationSlackSent) return;

        const details = getFrustrationDetails();
        if (!details || details.score < 2) return; // Only aggregate frustration

        frustrationSlackSent = true;

        const text = [
            `<@${SLACK_BOT_USER_ID}> ⚠️ *Session Frustration Detected*`,
            `👤 ${userIdentifier}`,
            `🔍 Pattern: ${details.pattern}`,
            `📊 Graphs tried: ${details.graphsTried.join(', ')}`,
            `🔎 Queries: ${details.recentQueries.join(', ')}`,
            `📈 Frustration score: ${details.score}/3`,
            `→ User may be struggling. Check if content gaps or UX issues are involved.`,
        ].join('\n');

        // Fire-and-forget — never await in the hot path
        postToSlack(text).catch(() => {});
    }

    /**
     * Alert #fodda-research (SLACK_RESEARCH_CHANNEL) when a search comes back
     * with thin/empty on-topic coverage — a topic users want that the graphs
     * don't cover. Deduped per query topic per session; safe to call after
     * every coverage annotation (no-ops unless status is thin/empty).
     * Returns true when an alert was actually queued (for tests/telemetry).
     */
    function postGapToSlack(
        userIdentifier: string,
        toolName: string,
        query: string,
        coverage: { status: string; results_returned?: number; results_on_topic?: number; layers_searched?: string[] } | undefined
    ): boolean {
        if (!coverage || (coverage.status !== 'thin' && coverage.status !== 'empty')) return false;
        const key = query.toLowerCase().trim().replace(/\s+/g, ' ');
        if (gapAlertsSent.has(key)) return false;
        gapAlertsSent.add(key);

        const text = buildGapAlertText(userIdentifier, toolName, query, coverage);
        // Fire-and-forget — never await in the hot path
        postToSlack(text, GAP_ALERT_CHANNEL).catch(() => {});
        return true;
    }

    // ── Next Moves state & telemetry ──
    let lastNextMoves: NextMoves | null = null;
    let lastRecordedQuery: string = '';

    function recordNextMoves(nextMoves: NextMoves | undefined, query: string): void {
        if (nextMoves) {
            lastNextMoves = nextMoves;
            lastRecordedQuery = query;
        }
    }

    function getLastNextMoves(): NextMoves | null {
        return lastNextMoves;
    }

    /**
     * Match an incoming tool call against the prior turn's next_moves recommendation.
     * Returns undefined for the first call in a session, or one of the NextMoveTaken options.
     */
    function evaluateNextMoveMatch(currentQuery: string, currentTool: string, toolArgs?: any): NextMoveTaken | undefined {
        if (!lastNextMoves) return undefined;

        const q = (currentQuery || '').toLowerCase().trim();

        // 1. Scope check (explicit scoping to deliverable, brand, or brief)
        if (
            currentTool === 'request_deliverable' ||
            /(?:cut\s+(?:this\s+)?to|brief\s+(?:is|for)|working\s+on|for\s+(?:our|the)\s+brand|scope\s+to|apply\s+to|specifically\s+for|scope\s+(?:a\s+)?deliverable|executive\s+brief|project\s+deliverable|commission|scope\s+the\s+work)/i.test(q) ||
            (lastNextMoves.known_brand && q.includes(lastNextMoves.known_brand.toLowerCase()) && /(?:for|to|specifically|cut|scope)/i.test(q))
        ) {
            return 'scope';
        }

        // 2. Specific brand check
        if (lastNextMoves.specific?.brands?.length) {
            if (currentTool === 'brand_tracker' && toolArgs?.brand_name) {
                const bName = String(toolArgs.brand_name).toLowerCase();
                if (lastNextMoves.specific.brands.some(b => b.toLowerCase() === bName || bName.includes(b.toLowerCase()))) {
                    return 'specific_brand';
                }
            }
            for (const b of lastNextMoves.specific.brands) {
                const bLower = b.toLowerCase();
                if (bLower.length > 1 && q.includes(bLower)) {
                    return 'specific_brand';
                }
            }
        }

        // 3. Specific expert check (referrals or alternate expert suggestions)
        if (lastNextMoves.specific?.expert) {
            const expId = (lastNextMoves.specific.expert.analyst_id || '').toLowerCase();
            const expName = (lastNextMoves.specific.expert.display_name || '').toLowerCase();
            if (
                currentTool === 'consult_analyst' ||
                currentTool === 'consult_human_agent'
            ) {
                const reqId = String(toolArgs?.analyst_id || '').toLowerCase();
                if ((expId && reqId === expId) || (expName && reqId.includes(expName))) {
                    return 'specific_expert';
                }
            }
            if ((expName && q.includes(expName)) || (expId && q.includes(expId))) {
                return 'specific_expert';
            }
        }

        // 4. Specific stat check — ONLY if line 2 offered statistics_source
        if (lastNextMoves.specific?.statistics_source) {
            if (
                currentTool === 'search_statistics' ||
                currentTool === 'get_supplemental_context' ||
                /(?:statistics|statistical|stats|data\s+series|census|fred|bls|google\s+trends)/i.test(q)
            ) {
                return 'specific_stat';
            }
            const stopWords = new Set([
                'and', 'or', 'the', 'in', 'of', 'for', 'with', 'to', 'a', 'an', 'from',
                'data', 'metrics', 'series', 'stats', 'statistics', 'intelligence',
                'trends', 'trend', 'search', 'interest', 'market', 'product', 'catalog', 'signals', 'report'
            ]);
            const statSourceLower = lastNextMoves.specific.statistics_source.toLowerCase();
            if (q.includes(statSourceLower)) {
                return 'specific_stat';
            }
            const statWords = statSourceLower.split(/[\s,&/+-]+/).filter(w => w.length > 2 && !stopWords.has(w));
            if (statWords.length > 0) {
                const matchedCount = statWords.filter(w => q.includes(w)).length;
                if (matchedCount >= Math.min(2, statWords.length)) {
                    return 'specific_stat';
                }
            }
        }

        // 5. Thread check (expert thread or graph remainder)
        if (lastNextMoves.thread) {
            const t = lastNextMoves.thread;
            if (t.kind === 'expert_thread') {
                const gId = (t.graph_id || '').toLowerCase();
                const reqId = String(toolArgs?.analyst_id || '').toLowerCase();
                if (
                    (currentTool === 'consult_analyst' || currentTool === 'consult_human_agent') &&
                    (reqId === gId || !reqId)
                ) {
                    return 'thread';
                }
                if (t.next_angle && q.includes(t.next_angle.toLowerCase().slice(0, 20))) {
                    return 'thread';
                }
                if (t.theme && q.includes(t.theme.toLowerCase())) {
                    return 'thread';
                }
                if (Array.isArray(t.uncited_themes) && t.uncited_themes.some(ut => q.includes(ut.toLowerCase()))) {
                    return 'thread';
                }
                if (/(?:stay\s+on\s+this|pull\s+(?:those|them|more)|look\s+into|deeper\s+signals)/i.test(q)) {
                    return 'thread';
                }
            } else if (t.kind === 'more_in_graph') {
                if (currentTool !== 'search_statistics' && currentTool !== 'brand_tracker') {
                    const gId = (t.graph_id || '').toLowerCase();
                    const reqGid = String(toolArgs?.graphId || '').toLowerCase();
                    const reqGraphs = Array.isArray(toolArgs?.graphs) ? toolArgs.graphs.map((x: any) => String(x).toLowerCase()) : [];
                    if ((gId && (reqGid === gId || reqGraphs.includes(gId))) || (gId && q.includes(gId))) {
                        return 'thread';
                    }
                    if (/(?:pull\s+(?:them|more|signals)|more\s+signals|remaining)/i.test(q)) {
                        return 'thread';
                    }
                    if (t.theme && q.includes(t.theme.toLowerCase())) {
                        return 'thread';
                    }
                }
            } else if (t.kind === 'adjacent_room' || t.kind === 'honest_thin') {
                if (currentTool !== 'search_statistics' && currentTool !== 'brand_tracker') {
                    const adjId = (t.adjacent?.graph_id || t.graph_id || '').toLowerCase();
                    const reqGid = String(toolArgs?.graphId || '').toLowerCase();
                    const reqGraphs = Array.isArray(toolArgs?.graphs) ? toolArgs.graphs.map((x: any) => String(x).toLowerCase()) : [];
                    if ((adjId && (reqGid === adjId || reqGraphs.includes(adjId))) || (adjId && q.includes(adjId))) {
                        return 'thread';
                    }
                    if (/(?:adjacent|other\s+room|want\s+that\s+room|fan\s+side|closest\s+adjacent)/i.test(q)) {
                        return 'thread';
                    }
                }
            }
        }

        // 6. Shelf graphs exploration
        const shelfList = lastNextMoves.shelf || lastNextMoves.specific?.shelf_graphs;
        if (shelfList && shelfList.length > 0) {
            for (const sg of shelfList) {
                const sgId = (sg.graph_id || '').toLowerCase();
                const sgName = (sg.graph_display || '').toLowerCase();
                const reqGid = String(toolArgs?.graphId || toolArgs?.graph_id || '').toLowerCase();
                const reqGraphs = Array.isArray(toolArgs?.graphs) ? toolArgs.graphs.map((x: any) => String(x).toLowerCase()) : [];
                if ((sgId && (reqGid === sgId || reqGraphs.includes(sgId))) || (sgName && q.includes(sgName))) {
                    return 'shelf';
                }
                if (
                    (currentTool === 'search_graph' || currentTool === 'get_domain_intelligence' || currentTool === 'get_report_intelligence') &&
                    sgId && q.includes(sgId)
                ) {
                    return 'shelf';
                }
            }
        }

        return 'none';
    }

    const suggestPaths: Array<'suggest' | 'regex-fallback'> = [];

    function recordSuggestPath(path: 'suggest' | 'regex-fallback'): void {
        suggestPaths.push(path);
    }

    function getSuggestStats(): { total: number; suggest: number; fallback: number; hitRate: number } {
        const total = suggestPaths.length;
        const suggest = suggestPaths.filter(p => p === 'suggest').length;
        const fallback = total - suggest;
        return {
            total,
            suggest,
            fallback,
            hitRate: total > 0 ? suggest / total : 0,
        };
    }

    return {
        trackSearch,
        detectFrustration,
        getRecentSearches,
        getFrustrationDetails,
        postFrustrationToSlack,
        postGapToSlack,
        recordNextMoves,
        getLastNextMoves,
        evaluateNextMoveMatch,
        recordSuggestPath,
        getSuggestStats,
    };
}

// ---------------------------------------------------------------------------
// Utility — simple word-overlap ratio
// ---------------------------------------------------------------------------

function overlapRatio(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    return intersection / Math.min(wordsA.size, wordsB.size);
}
