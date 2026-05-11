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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/**
 * Post a message to #fodda-sales via the Slack Bot Token.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function postToSlack(text: string): Promise<void> {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
        console.error('[slack] SLACK_BOT_TOKEN not set — skipping Slack post');
        return;
    }
    try {
        const resp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'fodda-sales', text, unfurl_links: false }),
        });
        const body = await resp.json() as any;
        if (!body.ok) {
            console.error(`[slack] Slack API error: ${body.error}`);
        }
    } catch (err: any) {
        console.error(`[slack] Failed to post to Slack: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Session state — one instance per createServer() call
// ---------------------------------------------------------------------------

export function createSessionTracker() {
    const sessionSearches: SessionSearch[] = [];
    let frustrationSlackSent = false; // Only post once per session

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

    return { trackSearch, detectFrustration, getRecentSearches, getFrustrationDetails, postFrustrationToSlack };
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
