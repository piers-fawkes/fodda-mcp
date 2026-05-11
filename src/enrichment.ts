/**
 * Trend Enrichment — lifecycle, momentum, and evidence formatting helpers.
 *
 * Extracted from index.ts to reduce monolith size.
 * These functions operate on fields already present on Neo4j Trend nodes
 * (firstSeen, lastSeen, evidenceCount) — no API calls needed.
 */

import { getDomainGraphIds } from './catalogCache.js';

// ---------------------------------------------------------------------------
// Trend lifecycle, momentum, and fast-mover computation
// ---------------------------------------------------------------------------

export function computeLifecycle(row: any, now?: number): string {
    const ts = now || Date.now();
    const first = row.firstSeen ? new Date(row.firstSeen).getTime() : 0;
    const last = row.lastSeen ? new Date(row.lastSeen).getTime() : 0;
    if (!first || !last) {
        // Fallback: signal-score + evidence-count heuristic when dates are missing
        const signal = row.signal_score || row.signalScore || 0;
        const evCount = row.evidenceCount || row.evidence_count || 0;
        if (signal >= 70 && evCount >= 10) return 'mature';
        if (signal >= 45 || evCount >= 6) return 'building';
        if (signal < 20 && evCount <= 2) return 'fading';
        return 'emerging';
    }
    const ageMonths = (ts - first) / (1000 * 60 * 60 * 24 * 30);
    const staleDays = (ts - last) / (1000 * 60 * 60 * 24);
    const count = row.evidenceCount || row.evidence_count || 0;
    if (staleDays > 180) return 'fading';
    if (ageMonths < 6 && count < 5) return 'emerging';
    if (ageMonths > 12 && count > 10) return 'mature';
    return 'building';
}

export function computeMomentum(row: any, now?: number): string {
    const ts = now || Date.now();
    const last = row.lastSeen ? new Date(row.lastSeen).getTime() : 0;
    const freshnessDays = row.freshnessDays || (last ? (ts - last) / (1000 * 60 * 60 * 24) : 999);
    if (freshnessDays < 30) return 'accelerating';
    if (freshnessDays < 90) return 'steady';
    return 'slowing';
}

export function isFastMover(row: any, now?: number): boolean {
    const ts = now || Date.now();
    const first = row.firstSeen ? new Date(row.firstSeen).getTime() : 0;
    if (!first) return false;
    const ageMonths = (ts - first) / (1000 * 60 * 60 * 24 * 30);
    return ageMonths < 6 && (row.evidenceCount || row.evidence_count || 0) >= 8;
}

// ---------------------------------------------------------------------------
// Graph badge icons
// ---------------------------------------------------------------------------

export const GRAPH_BADGES: Record<string, string> = {
    'retail': '⬡', 'beauty': '◆', 'fashion': '▲', 'sports': '●',
    'sic': '◇', 'ce-design': '□', 'pew': '◈',
};

// Evidence role mapping — assigns editorial purpose to each content type
const EVIDENCE_ROLES: Record<string, string> = {
    'interpretation': 'insight',    // Proprietary analysis — the moat
    'analysis': 'insight',
    'signal': 'proof',              // Case studies — innovation examples
    'case study': 'proof',
    'metric': 'scale',              // Statistics — curated numbers
    'statistic': 'scale',
    'quote': 'voice',               // Expert attribution
    'interview': 'voice',
    'datapoint': 'background',      // Narrative texture — NOT standalone evidence
    'data point': 'background',
};

/**
 * Enrich evidence items with pre-formatted markdown citations and editorial roles.
 * Models are much more likely to pass through a ready-made link than construct one.
 */
export function enrichEvidence(items: any[]): any[] {
    if (!Array.isArray(items)) return items;
    // Sort by publishedAt descending — most recent evidence first
    items.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
    });
    return items.map(item => {
        // Assign editorial role based on content type
        const ct = (item.contentType || '').toLowerCase();
        item.role = EVIDENCE_ROLES[ct] || 'proof';

        if (item.formatted_citation) return item; // already enriched

        const title = item.title?.trim();
        const url = item.sourceUrl?.trim();

        // Enhanced citation for quotes with speaker attribution
        if (item.role === 'voice' && item.speakerName) {
            const speaker = item.speakerName;
            const titleSuffix = item.speakerTitle ? `, ${item.speakerTitle}` : '';
            const pub = item.publication || 'Source';
            if (url) {
                item.formatted_citation = `"${title || 'Quote'}" — ${speaker}${titleSuffix} ([${pub}](${url}))`;
            } else {
                item.formatted_citation = `"${title || 'Quote'}" — ${speaker}${titleSuffix} (${pub})`;
            }
        } else if (title && url) {
            item.formatted_citation = `[${title}](${url})`;
        } else if (title) {
            item.formatted_citation = `${title} (no link available)`;
        } else if (url) {
            item.formatted_citation = `[Source](${url})`;
        }
        return item;
    });
}

// ---------------------------------------------------------------------------
// Fodda theme block — visualization branding for graph data
// ---------------------------------------------------------------------------

const GRAPH_COLOR_OVERRIDES: Record<string, string> = {
    'sic': '#3672A4',
    'pew': '#3672A4',
    'edelman/tipping-points': '#D4930A',
    'openfda-safety': '#0F9690',
    'wikipedia-pageviews': '#0F9690',
};

export function getFoddaTheme(graphId: string) {
    const PSFK_DOMAIN_GRAPHS = getDomainGraphIds().size > 0
        ? getDomainGraphIds()
        : new Set(['retail', 'beauty', 'fashion', 'sports', 'ce-design']); // fallback

    let graphTypeColor: string;
    if (GRAPH_COLOR_OVERRIDES[graphId]) {
        graphTypeColor = GRAPH_COLOR_OVERRIDES[graphId];
    } else if (PSFK_DOMAIN_GRAPHS.has(graphId)) {
        graphTypeColor = '#663399';
    } else {
        graphTypeColor = '#1D7A6A'; // expert / community graphs
    }
    return {
        brand: {
            primary: '#663399',
            primaryLight: '#F5F0FF',
            primaryDark: '#4A2470',
            chartAccent: '#7B51B8'
        },
        graphType: graphTypeColor,
        clusters: {
            light: {
                techAI: '#2E6BE5',
                physicalSpaces: '#D97B2B',
                wellnessHealth: '#1D9E75',
                cultureSociety: '#C94F7A',
                sustainability: '#3A8F5C',
                commerceEcon: '#7C6AB5',
                designMaterials: '#D4793C',
                trustGovernance: '#5B7FA4',
                foodIndulgence: '#E06850',
                globalGeo: '#4A90A4'
            },
            dark: {
                techAI: '#5B9AFF',
                physicalSpaces: '#F0A050',
                wellnessHealth: '#3DCFA0',
                cultureSociety: '#F07AA0',
                sustainability: '#5DC080',
                commerceEcon: '#A894E0',
                designMaterials: '#F0A060',
                trustGovernance: '#8CB0D0',
                foodIndulgence: '#FF8B78',
                globalGeo: '#6DBBD0'
            }
        },
        scales: {
            sequential: ['#F5F0FF', '#DFD1F5', '#C4A7E8', '#A07CD4', '#7B51B8', '#663399', '#4A2470'],
            positive: ['#E8F5EE', '#B3E0C6', '#6DC595', '#3AA76D', '#1D7A4E'],
            negative: ['#FFF0ED', '#FFD1C7', '#F5A08E', '#E06850', '#C23B2B']
        }
    };
}

export function getSupplementalTheme() {
    return {
        brand: {
            primary: '#663399',
            primaryLight: '#F5F0FF',
            primaryDark: '#4A2470',
            chartAccent: '#7B51B8'
        },
        graphType: '#3672A4',
        clusters: {},
        scales: {
            sequential: ['#F5F0FF', '#DFD1F5', '#C4A7E8', '#A07CD4', '#7B51B8', '#663399', '#4A2470'],
            positive: ['#E8F5EE', '#B3E0C6', '#6DC595', '#3AA76D', '#1D7A4E'],
            negative: ['#FFF0ED', '#FFD1C7', '#F5A08E', '#E06850', '#C23B2B']
        }
    };
}
