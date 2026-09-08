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
        const evCount = row.evidence_count || row.evidenceCount || 0;
        if (signal >= 70 && evCount >= 10) return 'mature';
        if (signal >= 45 || evCount >= 6) return 'building';
        if (signal < 20 && evCount <= 2) return 'fading';
        return 'emerging';
    }
    const ageMonths = (ts - first) / (1000 * 60 * 60 * 24 * 30);
    const staleDays = (ts - last) / (1000 * 60 * 60 * 24);
    const count = row.evidence_count || row.evidenceCount || 0;
    if (staleDays > 180) return 'fading';
    if (ageMonths < 6 && count < 5) return 'emerging';
    if (ageMonths > 12 && count > 10) return 'mature';
    return 'building';
}

export function reconcileFreshnessDays(row: any, now?: number): number | null {
    const ts = now || Date.now();
    const substantiveDateStr = row.freshnessDate || row.published_date || row.lastSeen || (Array.isArray(row.evidence) && row.evidence[0]?.publishedAt) || null;
    if (substantiveDateStr) {
        const subTime = new Date(substantiveDateStr).getTime();
        if (!isNaN(subTime) && subTime > 0) {
            const calculatedDays = Math.max(0, Math.floor((ts - subTime) / 86400000));
            // If the API returned a freshnessDays that is derived from DB updated_at
            // (e.g. freshnessDays is 16 from DB updated_at while substantive date is 190 days ago),
            // prefer the substantive calculation.
            if (row.freshnessDays !== undefined && row.freshnessDays !== null) {
                if (Math.abs(calculatedDays - row.freshnessDays) > 30 && calculatedDays > row.freshnessDays) {
                    return calculatedDays;
                }
                return row.freshnessDays;
            }
            return calculatedDays;
        }
    }
    if (row.freshnessDays !== undefined && row.freshnessDays !== null) {
        return row.freshnessDays;
    }
    return null;
}

export function computeMomentum(row: any, now?: number): string {
    const ts = now || Date.now();
    const freshnessDays = reconcileFreshnessDays(row, ts);

    if (freshnessDays !== null) {
        if (freshnessDays < 45) return 'accelerating';
        if (freshnessDays < 120) return 'steady';
        if (freshnessDays < 240) return 'building';
        return 'slowing';
    }
    // Fallback based on lifecycle or evidence count
    if (row.lifecycle === 'fading') return 'slowing';
    if (row.lifecycle === 'emerging' || row.lifecycle === 'building') return 'steady';
    if ((row.evidence_count || row.evidenceCount || 0) >= 5) return 'steady';
    return 'steady';
}

export function isFastMover(row: any, now?: number): boolean {
    const ts = now || Date.now();
    const first = row.firstSeen ? new Date(row.firstSeen).getTime() : 0;
    if (!first) return false;
    const ageMonths = (ts - first) / (1000 * 60 * 60 * 24 * 30);
    return ageMonths < 6 && (row.evidence_count || row.evidenceCount || 0) >= 8;
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

// ---------------------------------------------------------------------------
// Geographic Metadata & Placeholder Cleaning
// ---------------------------------------------------------------------------

export const KNOWN_CITY_LOCATIONS: Record<string, string> = {
    'milan': 'Milan, Italy',
    'paris': 'Paris, France',
    'tokyo': 'Tokyo, Japan',
    'harajuku': 'Tokyo, Japan',
    'ginza': 'Tokyo, Japan',
    'shibuya': 'Tokyo, Japan',
    'kyoto': 'Kyoto, Japan',
    'london': 'London, UK',
    'mayfair': 'London, UK',
    'covent garden': 'London, UK',
    'new york': 'New York, USA',
    'soho': 'New York, USA',
    'manhattan': 'New York, USA',
    'brooklyn': 'New York, USA',
    'los angeles': 'Los Angeles, USA',
    'beverly hills': 'Los Angeles, USA',
    'west hollywood': 'Los Angeles, USA',
    'miami': 'Miami, USA',
    'chicago': 'Chicago, USA',
    'san francisco': 'San Francisco, USA',
    'seattle': 'Seattle, USA',
    'atlanta': 'Atlanta, USA',
    'las vegas': 'Las Vegas, USA',
    'dallas': 'Dallas, USA',
    'austin': 'Austin, USA',
    'boston': 'Boston, USA',
    'singapore': 'Singapore',
    'hong kong': 'Hong Kong',
    'shanghai': 'Shanghai, China',
    'beijing': 'Beijing, China',
    'seoul': 'Seoul, South Korea',
    'gangnam': 'Seoul, South Korea',
    'dubai': 'Dubai, UAE',
    'rome': 'Rome, Italy',
    'florence': 'Florence, Italy',
    'venice': 'Venice, Italy',
    'berlin': 'Berlin, Germany',
    'munich': 'Munich, Germany',
    'madrid': 'Madrid, Spain',
    'barcelona': 'Barcelona, Spain',
    'sydney': 'Sydney, Australia',
    'melbourne': 'Melbourne, Australia',
    'toronto': 'Toronto, Canada',
    'vancouver': 'Vancouver, Canada',
    'buenos aires': 'Buenos Aires, Argentina',
    'são paulo': 'São Paulo, Brazil',
    'sao paulo': 'São Paulo, Brazil',
    'rio de janeiro': 'Rio de Janeiro, Brazil'
};

const PLACEHOLDER_TOKENS = new Set([
    'string', 'n/a', 'na', 'n', 'a', 'none', 'null', 'undefined', 'unknown',
    'placeholder', 'test', 'tbd', 'tba'
]);

export function isPlaceholderPlace(val: any): boolean {
    if (val === null || val === undefined) return true;
    if (typeof val !== 'string') {
        if (Array.isArray(val)) {
            return val.length === 0 || val.every(p => isPlaceholderPlace(p));
        }
        return true;
    }
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return true;
    if (PLACEHOLDER_TOKENS.has(trimmed) || /^(string(,\s*string)*|n\/?a|none|null|undefined|unknown|placeholder|test|tbd|tba)$/i.test(trimmed)) {
        return true;
    }
    const parts = trimmed.split(/[,/]/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return true;
    return parts.every(p => PLACEHOLDER_TOKENS.has(p));
}

export function reconcilePlace(currentPlace?: string, title?: string, summary?: string): string | undefined {
    let place = currentPlace && !isPlaceholderPlace(currentPlace) ? currentPlace.trim() : undefined;
    const text = `${title || ''} ${summary || ''}`;
    if (!text.trim()) return place;

    // Normalize duplicate components like "Singapore, Singapore" -> "Singapore"
    if (place) {
        const parts = place.split(',').map(s => s.trim());
        if (parts.length === 2 && parts[0] && parts[1] && parts[0].toLowerCase() === parts[1].toLowerCase()) {
            place = parts[0];
        }
    }

    // Sort by key length descending so longer/more specific keys match before shorter substrings
    const sortedEntries = Object.entries(KNOWN_CITY_LOCATIONS).sort((a, b) => b[0].length - a[0].length);

    for (const [cityKey, canonicalLocation] of sortedEntries) {
        const pattern = new RegExp(`\\b(?:in|at|across|hosted in|opens? in|launched in)\\s+${cityKey}\\b|\\b${cityKey}\\s+(?:pop-?up|ephemeral|store|carousel|activation|flagship|boutique|residency)\\b`, 'i');
        if (pattern.test(text)) {
            // If place is missing or contradicts the explicit city from text, override
            if (!place || !place.toLowerCase().includes(cityKey)) {
                return canonicalLocation;
            }
            return place;
        }
    }

    return place;
}

/**
 * Enrich evidence items with pre-formatted markdown citations and editorial roles.
 * Models are much more likely to pass through a ready-made link than construct one.
 */
export function enrichEvidence(items: any[], opts: { sortByRecency?: boolean } = {}): any[] {
    if (!Array.isArray(items)) return items;
    // Preserve the API's relevance order by default — evidence items carry no
    // per-item score, so input array order IS the relevance signal. Sorting by
    // recency here discarded it and surfaced newest-but-off-topic items. Opt-in only.
    if (opts.sortByRecency) {
        items.sort((a, b) => {
            const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return dateB - dateA;
        });
    }
    return items.map(item => {
        const cleanItem: Record<string, any> = { ...item };

        // Assign editorial role based on content type — but don't stamp unknown
        // contentTypes as 'proof' (that mislabels everything as standalone evidence).
        const ct = (cleanItem.contentType || '').toLowerCase();
        const mappedRole = EVIDENCE_ROLES[ct];
        if (mappedRole) cleanItem.role = mappedRole;

        const url = cleanItem.sourceUrl?.trim();
        const rawPubName = cleanItem.publication?.trim() || cleanItem.sourceName?.trim() || (url ? extractCleanDomain(url) : 'Source');
        // Clean RSS feed labels (e.g. "Fast Casual | Latest Media" -> "Fast Casual", "NYT > Top Stories" -> "NYT")
        let cleanPub = rawPubName.split('|')[0].trim().split('>')[0].trim().split(' - ')[0].trim().split(':')[0].trim();
        if (cleanPub.endsWith(' RSS') || cleanPub.endsWith(' Feed')) {
            cleanPub = cleanPub.replace(/\s+(RSS|Feed)$/i, '').trim();
        }
        // Canonical name normalization
        if (cleanPub.toUpperCase() === 'NYT' || cleanPub.toUpperCase().startsWith('NYT ') || cleanPub === 'New York Times') {
            cleanPub = 'The New York Times';
        } else if (cleanPub.toUpperCase() === 'WSJ' || cleanPub.toUpperCase().startsWith('WSJ ')) {
            cleanPub = 'The Wall Street Journal';
        } else if (cleanPub.toUpperCase() === 'FT' || cleanPub.toUpperCase().startsWith('FT ')) {
            cleanPub = 'Financial Times';
        } else if (cleanPub.toUpperCase() === 'BOF' || cleanPub === 'Business of Fashion') {
            cleanPub = 'The Business of Fashion';
        }

        const isInternalFoddaUrl = url ? /fodda\.ai/i.test(url) : true;
        const finalPubLabel = cleanPub.startsWith('via ') ? cleanPub : `via ${cleanPub}`;
        cleanItem.short_citation = (url && !isInternalFoddaUrl) ? `[${finalPubLabel}](${url})` : finalPubLabel;

        if (!cleanItem.formatted_citation) {
            const title = cleanItem.title?.trim();

            // Enhanced citation for quotes with speaker attribution
            if (cleanItem.role === 'voice' && cleanItem.speakerName) {
                const speaker = cleanItem.speakerName;
                const titleSuffix = cleanItem.speakerTitle ? `, ${cleanItem.speakerTitle}` : '';
                const pub = cleanItem.publication || 'Source';
                if (url) {
                    cleanItem.formatted_citation = `"${title || 'Quote'}" — ${speaker}${titleSuffix} ([${pub}](${url}))`;
                } else {
                    cleanItem.formatted_citation = `"${title || 'Quote'}" — ${speaker}${titleSuffix} (${pub})`;
                }
            } else if (title && url) {
                cleanItem.formatted_citation = `[${title}](${url})`;
            } else if (title) {
                cleanItem.formatted_citation = `${title} (no link available)`;
            } else if (url) {
                cleanItem.formatted_citation = `[Source](${url})`;
            }
        }

        // Clean and reconcile place metadata
        if (cleanItem.place !== undefined) {
            cleanItem.place = reconcilePlace(cleanItem.place, cleanItem.title, cleanItem.summary);
            if (!cleanItem.place || isPlaceholderPlace(cleanItem.place)) {
                delete cleanItem.place;
            }
        } else if (cleanItem.title || cleanItem.summary) {
            const detectedPlace = reconcilePlace(undefined, cleanItem.title, cleanItem.summary);
            if (detectedPlace) {
                cleanItem.place = detectedPlace;
            }
        }

        // Clean dead / null / empty / placeholder fields to prevent LLM context bloat
        for (const k of ['imageUrl', 'speakerName', 'speakerTitle', 'publication', 'place']) {
            if (cleanItem[k] === null || cleanItem[k] === undefined || cleanItem[k] === '' || (k === 'place' && isPlaceholderPlace(cleanItem[k]))) {
                delete cleanItem[k];
            }
        }
        if (cleanItem.id && cleanItem.node_id && String(cleanItem.id) === String(cleanItem.node_id)) {
            delete cleanItem.id;
        }
        if (Array.isArray(cleanItem.brandNames) && cleanItem.brandNames.length === 0) {
            delete cleanItem.brandNames;
        }

        return cleanItem;
    });
}

// ---------------------------------------------------------------------------
// Market Tier & Category Vocabularies
// ---------------------------------------------------------------------------

export const LUXURY_KEYWORDS = new Set(['luxury', 'haute', 'couture', 'prestige', 'high-end', 'designer']);
export const LUXURY_BRANDS = new Set([
    'dior', 'louis vuitton', 'chanel', 'gucci', 'hermès', 'hermes', 'prada', 'cartier',
    'tiffany', 'saint laurent', 'balenciaga', 'bottega veneta', 'burberry', 'moncler',
    'loewe', 'celine', 'fendi', 'versace', 'ferragamo', 'valentino', 'rolex', 'harrods',
    'maison margiela', 'the macallan', 'hennessy', 'rh', 'nordstrom', 'saks', 'bergdorf',
    'kering', 'lvmh', 'richemont', 'bulgari', 'bvlgari', 'chopard', 'patek philippe', 'audemars piguet',
    "bloomingdale's", "bloomingdales", "harrods", "le bon marché", "la samaritaine",
    "selfridges", "lane crawford", "neiman marcus", "galeries lafayette", "l’oréal travel retail",
    "l'oréal travel retail", "l'oreal travel retail", "campari"
]);

export const MASS_BUDGET_KEYWORDS = new Set(['budget', 'discount', 'mass-market', 'value', 'cheap', 'fast-food', 'low-cost']);
export const MASS_BUDGET_BRANDS = new Set([
    'miniso', 'kfc', 'mcdonald\'s', 'mcdonalds', 'taco bell', 'burger king', 'dollar general',
    'dollar tree', 'five below', 'primark', 'shein', 'temu', 'walmart', 'popeyes', 'domino\'s'
]);

export const DIGITAL_OR_B2B_PATTERNS = [
    /\btiktok shop\b/i,
    /\bonline marketplace\b/i,
    /\be-?commerce platform\b/i,
    /\becommerce storefront\b/i,
    /\bdigital storefront\b/i,
    /\bsupply chain pilot\b/i,
    /\benterprise-wide technology bundles\b/i,
    /\bagentic shopping models\b/i,
    /\bwarehouse logistics\b/i,
    /\bcheckout api\b/i,
    /\bquick delivery partnerships\b/i,
    /\bconnected packaging\b/i,
    /\bsoftware platform\b/i,
    /\bcloud infrastructure\b/i,
];

export const PHYSICAL_SPATIAL_TERMS = new Set([
    'pop-up', 'popup', 'pop up', 'pop-ups', 'popups', 'pop ups',
    'temporary store', 'temporary space', 'temporary retail', 'temporary restaurant',
    'ephemeral', 'kiosk', 'activation', 'experiential', 'installation', 'showcase',
    'concept store', 'in-store', 'physical store', 'storefront', 'shop-in-shop',
    'store-in-store', 'exhibition', 'retail space', 'boutique', 'resortcore',
    'carousel', 'sampling', 'tasting', 'theater play', 'wellness hub', 'venue', 'hub',
    'destination', 'physical experience', 'in-person'
]);

const GENERIC_QUERY_STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'from', 'by', 'at',
    'as', 'is', 'are', 'was', 'be', 'how', 'what', 'trend', 'trends', 'market', 'emerging',
    'retail', 'consumer', 'report', 'insights', 'data'
]);

/**
 * Filter and rank evidence items against query qualifiers and trend context.
 * Strictly validates evidence against parent trend topic and medium (e.g. physical pop-ups
 * vs digital e-commerce/supply chain) and filters counter-tier brands.
 */
export function rankAndFilterEvidence(
    items: any[],
    query: string,
    trendContext?: any,
    opts: { maxItems?: number } = {}
): any[] {
    if (!Array.isArray(items) || items.length === 0) return [];
    const maxItems = opts.maxItems ?? 3;

    const qLower = (query || '').toLowerCase();
    const qWords = qLower.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !GENERIC_QUERY_STOPWORDS.has(w));
    const isFinancialQuery = /\b(revenue|ebitda|gross margin|earnings|quarterly|q[1-4]|financial|valuation|guidance|stock|dividend|probes)\b/i.test(qLower);

    const hasLuxuryQuery = [...LUXURY_KEYWORDS].some(k => qLower.includes(k));
    const hasBudgetQuery = [...MASS_BUDGET_KEYWORDS].some(k => qLower.includes(k));

    const trendTitle = (trendContext?.trendName || trendContext?.title || trendContext?.label || '').toLowerCase();
    const trendWords = trendTitle.split(/[^a-z0-9]+/).filter((w: string) => w.length > 2 && !GENERIC_QUERY_STOPWORDS.has(w));
    const isPopUpTrend = /\b(pop-?ups?|temporary store|temporary retail)\b/i.test(trendTitle) || /\b(pop-?ups?)\b/i.test(qLower);

    const scored = items.map((item, idx) => {
        const title = (item.title || '').toLowerCase();
        const summary = (item.summary || item.excerpt || '').toLowerCase();
        const contentType = (item.contentType || '').toLowerCase();
        const brands = Array.isArray(item.brandNames)
            ? item.brandNames.map((b: string) => String(b).toLowerCase())
            : (typeof item.brandNames === 'string' ? item.brandNames.toLowerCase().split('|') : []);

        const fullText = `${title} ${summary} ${brands.join(' ')}`;

        // 1. Digital/B2B Disqualification for Physical Pop-Up / Spatial Trends
        if (isPopUpTrend) {
            const isDigitalOrB2B = DIGITAL_OR_B2B_PATTERNS.some(p => p.test(fullText));
            const mentionsPhysical = [...PHYSICAL_SPATIAL_TERMS].some(term => fullText.includes(term));
            if (isDigitalOrB2B && !mentionsPhysical) {
                return { item, score: -999, originalIdx: idx, reason: 'digital-only/B2B mismatch for physical pop-up trend' };
            }
            if (!mentionsPhysical) {
                return { item, score: -999, originalIdx: idx, reason: 'no physical pop-up/spatial keyword' };
            }
        }

        // 2. Demote financial / earnings transcripts for qualitative queries
        const isEarningsOrFinancial =
            /\b(revenue|ebitda|gross margin|earnings|quarterly|q[1-4]|probes|consolidated revenue|adjusted ebitda)\b/i.test(title) ||
            /\b(investor relations|q[1-4] 202[0-9]|earnings call|quarterly results)\b/i.test(fullText);

        if (isEarningsOrFinancial && !isFinancialQuery) {
            return { item, score: -999, originalIdx: idx, reason: 'financial transcript on qualitative query' };
        }

        // 3. Category tier matching
        if (hasLuxuryQuery) {
            const mentionsMassBrand = brands.some((b: string) => MASS_BUDGET_BRANDS.has(b)) ||
                [...MASS_BUDGET_BRANDS].some(b => fullText.includes(b));
            if (mentionsMassBrand) {
                return { item, score: -999, originalIdx: idx, reason: 'mass-market brand on luxury query' };
            }
        }

        // Trend validation baseline
        let score = 5.0;

        // Luxury boost
        if (hasLuxuryQuery) {
            const mentionsLuxuryBrand = brands.some((b: string) => LUXURY_BRANDS.has(b)) ||
                [...LUXURY_BRANDS].some(b => fullText.includes(b));
            const mentionsLuxuryKeyword = [...LUXURY_KEYWORDS].some(k => fullText.includes(k));
            if (mentionsLuxuryBrand) score += 20.0;
            if (mentionsLuxuryKeyword) score += 10.0;
        } else if (hasBudgetQuery) {
            const mentionsMassBrand = brands.some((b: string) => MASS_BUDGET_BRANDS.has(b)) ||
                [...MASS_BUDGET_BRANDS].some(b => fullText.includes(b));
            if (mentionsMassBrand) score += 15.0;
        }

        // Pop-up keyword boost
        if (isPopUpTrend) {
            if (/\bpop-?ups?\b/i.test(title)) score += 8.0;
            else if (/\bpop-?ups?\b/i.test(summary)) score += 4.0;
        }

        // Query term overlap
        for (const word of qWords) {
            if (title.includes(word)) score += 4.0;
            else if (summary.includes(word)) score += 2.0;
            if (brands.some((b: string) => b.includes(word))) score += 3.0;
        }

        // Trend topic overlap
        for (const word of trendWords) {
            if (title.includes(word)) score += 2.5;
            else if (summary.includes(word)) score += 1.0;
        }

        // Content type preference (prioritize tangible proof/case studies)
        if (contentType === 'signal' || contentType === 'case study' || contentType === 'case_study') {
            score += 3.0;
        } else if (contentType === 'interpretation' || contentType === 'analysis') {
            score += 1.5;
        }

        // Recency bonus
        if (item.publishedAt) {
            const daysAgo = (Date.now() - new Date(item.publishedAt).getTime()) / 864e5;
            if (!isNaN(daysAgo) && daysAgo < 180) score += 2.0;
        }

        return { item, score, originalIdx: idx, reason: 'ok' };
    });

    // Only allow positive-scoring, non-disqualified items
    const positiveEligible = scored.filter(s => s.score >= 5.0);
    positiveEligible.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.originalIdx - b.originalIdx;
    });

    // If no items qualify, return [] — never fall back to off-topic / disqualified items!
    return positiveEligible.slice(0, maxItems).map(s => s.item);
}

function extractCleanDomain(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        const host = u.hostname.replace(/^www\./, '');
        if (host.includes('jingdaily')) return 'via Jing Daily';
        if (host.includes('businessoffashion') || host.includes('bof')) return 'via BoF';
        if (host.includes('mckinsey')) return 'via McKinsey';
        if (host.includes('365retail')) return 'via 365 Retail';
        if (host.includes('futuremarketinsights')) return 'via Future Market Insights';
        if (host.includes('insightaceanalytic')) return 'via InsightAce Analytic';
        if (host.includes('nytimes')) return 'via NYT';
        if (host.includes('wallpaper')) return 'via Wallpaper*';
        if (host.includes('digiday')) return 'via Digiday';
        return `via ${host}`;
    } catch {
        return 'Source';
    }
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

/**
 * Truncates whyNow cleanly without mid-word or mid-sentence cuts.
 * - Leaves text intact if <= maxLength (default 280 chars).
 * - Prefers breaking at sentence boundaries (.!?) if available between minLength (140) and maxLength.
 * - Otherwise breaks at the nearest word boundary before maxLength and appends '...'.
 * - Trims any dangling punctuation before the ellipsis.
 */
export function cleanTruncateWhyNow(whyNow: any, maxLength: number = 280, minLength: number = 140): string | undefined {
    if (!whyNow || typeof whyNow !== 'string') return whyNow;
    const trimmed = whyNow.trim();
    if (trimmed.length <= maxLength) return trimmed;

    const window = trimmed.slice(0, maxLength);

    // Check for clean sentence ending within [minLength, maxLength]
    // Matches period, exclamation, or question mark followed by whitespace or end of string
    const sentenceMatches = [...window.matchAll(/([.!?])(?:\s+|$)/g)];
    const validSentenceEnds = sentenceMatches
        .map(m => (m.index ?? 0) + (m[1]?.length || 1))
        .filter(idx => idx >= minLength && idx <= maxLength);

    if (validSentenceEnds.length > 0) {
        const bestEnd = validSentenceEnds[validSentenceEnds.length - 1];
        return trimmed.slice(0, bestEnd).trim();
    }

    // Fall back to last word boundary
    const lastSpace = window.lastIndexOf(' ');
    if (lastSpace >= minLength) {
        const cut = window.slice(0, lastSpace).replace(/[,;:—\-\.\s]+$/, '').trim();
        return `${cut}...`;
    }

    // Fallback if no suitable word boundary found
    const cut = window.replace(/[,;:—\-\.\s]+$/, '').trim();
    return `${cut}...`;
}

