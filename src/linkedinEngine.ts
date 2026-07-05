/**
 * LinkedIn Evidence Engine — shared retrieval + curation core for the two
 * LinkedIn content tools (`draft_linkedin_post`, `draft_linkedin_article`).
 *
 * Architecture (per the build brief): the SERVER does retrieval and curation;
 * the CALLING model does the writing. This module runs the retrieval recipe
 * against the existing graph endpoints, clusters results into themes, enforces
 * the evidence hard-gates, and classifies sources. The tool heads in
 * toolHandlers.ts return the curated evidence pack + a composition contract —
 * never finished post text. No server-side composition in v1.
 *
 * Hard gates (acceptance tests, not aspirations):
 *   1. A theme ships only with ≥1 NAMED company/product/person tied to a
 *      source. No named example → theme dropped and logged in `dropped`.
 *   2. Every source is typed: public_url (linkable) vs earnings_call/report
 *      (verbal attribution only — url is ALWAYS null for these).
 *   3. URLs come only from source metadata, passed through verbatim.
 *      Zero constructed URLs, ever.
 *   4. Entity names must appear in the cited source's own wording. Graph-side
 *      labels that don't appear in the source text are flagged
 *      `unverified_name` and excluded.
 *   5. Explicit quota exhaustion mid-retrieval aborts the whole pack
 *      (QuotaExhaustedError) — the engine never returns a quietly-starved pack.
 *   6. Thin coverage → coverage_note + recommend_against, never padding.
 */

import crypto from 'crypto';
import { classifyAccessError } from './errorHandling.js';
import { getDomainGraphIds, getAnalysts } from './catalogCache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal foddaRequest signature (matches FoddaRequestFn in toolHandlers.ts). */
export type EngineRequestFn = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string
) => Promise<any>;

export interface EngineDeps {
    foddaRequest: EngineRequestFn;
    apiKey: string;
    userId: string;
}

export type LinkedInVoice = 'fodda_first_party' | 'practitioner';

export interface EngineOptions {
    mode: 'post' | 'article';
    topic: string;
    /** Post: optional thesis or post being responded to. Article: the thesis. */
    angle?: string | undefined;
    voice?: LinkedInVoice | undefined;
    /** Named brand when the topic IS a brand — unlocks the earnings truth-layer path. */
    brand?: string | undefined;
    /** Client-supplied sub-theme decomposition (preferred over the heuristic fallback). */
    subThemes?: string[] | undefined;
    targetLengthWords?: number | undefined;
}

export type SourceType = 'public_url' | 'earnings_call' | 'report';

export interface LedgerRow {
    claim: string;
    entity: string;
    source_title: string;
    source_type: SourceType;
    /** Verbatim metadata URL for public_url rows; ALWAYS null for earnings_call/report. */
    url: string | null;
    graph: string;
    theme: string;
    /** How to attribute verbally, e.g. 'Om Malik (On my Om)' or "NKE's CFO on the earnings call". */
    attribution_hint?: string;
}

export interface DroppedTheme {
    theme: string;
    reason: 'no_named_example' | 'unverified_name' | 'below_selection_cut' | 'no_usable_evidence';
}

export interface EvidencePack {
    tool: 'draft_linkedin_post' | 'draft_linkedin_article';
    topic: string;
    voice: LinkedInVoice;
    themes: { name: string; graph: string; named_entities: string[] }[];
    evidence_ledger: LedgerRow[];
    dropped: DroppedTheme[];
    coverage_note: string | null;
    /** True when coverage is too thin for a credible Fodda-backed piece. */
    recommend_against: boolean;
    /** Article only: hard numbers from the search_statistics pass. */
    statistics?: LedgerRow[];
    /** Article only: analyst pressure-test of the thesis. */
    counterpoints?: { analyst: string; text: string } | null;
    /** Data for the article's "How we found this" box (and post transparency). */
    how_we_found_this: {
        graphs_searched: string[];
        query_types: string[];
        sub_themes: string[];
        empty_sources: string[];
        note: string;
    };
    composition_contract: string;
    _cache?: { hit: boolean; age_minutes: number };
}

/**
 * Thrown when retrieval hits an EXPLICIT quota/credit state
 * (CREDITS_EXHAUSTED / PLAN_LIMIT_EXCEEDED / 402). The tool head converts this
 * into the platform's standard structured quota error — the engine never
 * degrades a starved run into a thin evidence pack.
 */
export class QuotaExhaustedError extends Error {
    constructor(public causeErr: any) {
        super('Quota exhausted during evidence retrieval');
        this.name = 'QuotaExhaustedError';
    }
}

// ---------------------------------------------------------------------------
// Entity extraction & verification
// ---------------------------------------------------------------------------

/** Words that look like proper nouns but are not named companies/products. */
const ENTITY_STOPWORDS = new Set([
    'The', 'A', 'An', 'And', 'But', 'Or', 'Nor', 'For', 'So', 'Yet', 'In', 'On', 'At', 'Of', 'To',
    'From', 'With', 'By', 'As', 'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'It', 'Its', 'This',
    'That', 'These', 'Those', 'There', 'Here', 'How', 'Why', 'What', 'When', 'Where', 'Who',
    'Whose', 'Which', 'While', 'New', 'Now', 'More', 'Most', 'Less', 'Best', 'Top', 'First',
    'Last', 'Next', 'Inside', 'Beyond', 'After', 'Before', 'During', 'Their', 'Our', 'Your',
    'My', 'His', 'Her', 'We', 'You', 'They', 'He', 'She', 'I', 'Not', 'No', 'Yes', 'All', 'Some',
    'Many', 'Every', 'Each', 'One', 'Two', 'Three', 'If', 'Then', 'Than', 'Will', 'Would',
    'Could', 'Should', 'Can', 'May', 'Might', 'Do', 'Does', 'Did', 'Get', 'Got', 'Meet', 'Meets',
    'Say', 'Says', 'Report', 'Reports', 'Study', 'Survey', 'Trend', 'Trends', 'Consumer',
    'Consumers', 'Brand', 'Brands', 'Retail', 'Retailers', 'Market', 'Markets', 'Global',
    'Digital', 'Future', 'Growth', 'Gen', 'GenZ', 'Millennials', 'AI', 'US', 'USA', 'UK', 'EU',
    'Q1', 'Q2', 'Q3', 'Q4', 'CEO', 'CFO', 'CMO', 'COO', 'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday',
    'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Americans', 'American',
    'People', 'Everyone', 'Nobody', 'Something', 'Everything',
]);

/** Connector words allowed INSIDE a multi-word entity ("Bank of America"). */
const ENTITY_CONNECTORS = new Set(['of', 'the', 'and', '&', 'for', 'de', 'la']);

const CAP_TOKEN = /^[A-Z][A-Za-z0-9&'’.\-]*$/;
const HAS_INNER_CAP = /^[a-z]+[A-Z]/; // eBay, iRobot

/**
 * Extract named-entity candidates (companies, products, people) from source
 * text via a conservative proper-noun scan. Errs toward false negatives —
 * a missed entity drops a theme (safe); an invented one would ship a bad claim.
 */
export function extractEntities(text: string): string[] {
    if (!text) return [];
    const tokens = text.split(/\s+/);
    const found: string[] = [];
    let run: string[] = [];
    let runStartIdx = 0;

    const flush = (endIdx: number) => {
        // Trim connector words from both ends
        while (run.length && ENTITY_CONNECTORS.has(run[0]!.toLowerCase())) { run.shift(); runStartIdx++; }
        while (run.length && ENTITY_CONNECTORS.has(run[run.length - 1]!.toLowerCase())) run.pop();
        if (run.length === 0) return;
        const cleaned = run.map(t => t.replace(/[,.;:!?'’]+$/g, '').replace(/^["'‘’“”(]+/g, ''));
        const allStop = cleaned.every(t => ENTITY_STOPWORDS.has(t) || ENTITY_STOPWORDS.has(t.replace(/'s$/, '')));
        if (allStop) { run = []; return; }
        if (cleaned.length === 1) {
            const tok = cleaned[0]!;
            const base = tok.replace(/[’']s$/, '');
            if (ENTITY_STOPWORDS.has(base) || base.length < 3) { run = []; return; }
            // Single capitalized token at index 0 is likely just sentence case —
            // accept only when it looks brand-shaped: inner capital (eBay),
            // ALL-CAPS 3+ (IKEA), digits/&/- (H&M, Coca-Cola), or possessive
            // ("Walmart's move…"). Otherwise require corroboration later in the
            // text — conservative by design: a missed entity drops a theme
            // (safe); a generic word as "named example" ships a hollow claim.
            const brandShaped = HAS_INNER_CAP.test(base) || /^[A-Z]{3,}$/.test(base)
                || /[\d&-]/.test(base) || /['’]s$/.test(tok);
            if (runStartIdx === 0 && endIdx === 1 && !brandShaped) {
                run = []; return;
            }
            found.push(base);
        } else {
            const phrase = cleaned.map(t => t.replace(/[’']s$/, '')).join(' ');
            // Drop phrases where leading token is a stopword (e.g. "Why Nike" → keep Nike only)
            const nonStop = cleaned.filter(t => !ENTITY_STOPWORDS.has(t.replace(/[’']s$/, '')));
            if (nonStop.length === 0) { run = []; return; }
            if (nonStop.length < cleaned.length && nonStop.length === 1) {
                const base = nonStop[0]!.replace(/[’']s$/, '');
                if (base.length >= 3) found.push(base);
            } else {
                found.push(phrase);
            }
        }
        run = [];
    };

    for (let i = 0; i < tokens.length; i++) {
        const raw = tokens[i]!;
        const tok = raw.replace(/^["'‘’“”(]+/, '').replace(/[",;:!?)]+$/g, '');
        const endsSentence = /[.!?]$/.test(tok);
        const core = tok.replace(/[.!?]+$/g, '');
        if (CAP_TOKEN.test(core) || (run.length > 0 && ENTITY_CONNECTORS.has(core.toLowerCase()))) {
            if (run.length === 0) runStartIdx = i;
            run.push(core);
            if (endsSentence) flush(i + 1);
        } else {
            flush(i);
        }
    }
    flush(tokens.length);

    // Dedupe, preserve order
    const seen = new Set<string>();
    return found.filter(e => {
        const k = e.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// ---------------------------------------------------------------------------
// Source typing — gate #2 and #3
// ---------------------------------------------------------------------------

/** Return the item's verbatim metadata URL if it is a real http(s) link, else null. */
export function verbatimUrl(item: any): string | null {
    const raw = (item?.sourceUrl || item?.source_url || item?.url || '').toString().trim();
    if (/^https?:\/\/\S+$/i.test(raw)) return raw;
    return null; // anything else (empty, fragments, non-http schemes) → NOT linkable
}

/** Classify a source. earnings_call/report NEVER carry a URL. */
export function typeSource(item: any, ctx: { isEarnings?: boolean } = {}): { source_type: SourceType; url: string | null } {
    if (ctx.isEarnings) return { source_type: 'earnings_call', url: null };
    const url = verbatimUrl(item);
    if (url) return { source_type: 'public_url', url };
    const pub = ((item?.publication || item?.source || '') + ' ' + (item?.contentType || '')).toLowerCase();
    if (pub.includes('earnings')) return { source_type: 'earnings_call', url: null };
    return { source_type: 'report', url: null };
}

// ---------------------------------------------------------------------------
// Curation — gate #1 and #4
// ---------------------------------------------------------------------------

interface RawTheme {
    name: string;
    graph: string;
    evidence: any[];
    isEarnings?: boolean;
}

function sourceText(item: any): string {
    return [item?.title, item?.excerpt, item?.summary, item?.text, item?.quote, item?.description]
        .filter(Boolean).join(' ');
}

function buildRow(item: any, theme: RawTheme): { row: LedgerRow | null; unverified: boolean } {
    const text = sourceText(item);
    const typed = typeSource(item, { isEarnings: theme.isEarnings ?? false });

    // ── Entity resolution ──
    // 1) Graph-side labels must be VERIFIED against the source's own wording.
    const graphLabels: string[] = [item?.brand, item?.company, item?.entity, ...(Array.isArray(item?.brands) ? item.brands : [])]
        .filter((v: any) => typeof v === 'string' && v.trim().length > 1);
    let entity: string | null = null;
    let hadUnverifiedLabel = false;
    for (const label of graphLabels) {
        if (text.toLowerCase().includes(label.trim().toLowerCase())) { entity = label.trim(); break; }
        hadUnverifiedLabel = true;
    }
    // 2) Extract directly from the source text (inherently source-verbatim).
    if (!entity) {
        const candidates = extractEntities(text);
        entity = candidates[0] ?? null;
    }
    // 3) Quote items: the named speaker IS the named example ("Om Malik argues…").
    const speaker = typeof item?.speakerName === 'string' ? item.speakerName.trim() : '';
    const isQuote = ((item?.contentType || '') + '').toLowerCase().includes('quote') || !!speaker;
    if (!entity && speaker && isQuote) entity = speaker;

    if (!entity) return { row: null, unverified: hadUnverifiedLabel };

    const claim = (item?.title || item?.quote || item?.excerpt || '').toString().trim().slice(0, 280);
    if (!claim) return { row: null, unverified: false };

    const row: LedgerRow = {
        claim,
        entity,
        source_title: (item?.publication || item?.source || item?.title || 'Source').toString().trim(),
        source_type: typed.source_type,
        url: typed.url,
        graph: theme.graph,
        theme: theme.name,
    };
    if (speaker) {
        const spTitle = item?.speakerTitle ? `, ${item.speakerTitle}` : '';
        row.attribution_hint = `${speaker}${spTitle}${item?.publication ? ` (${item.publication})` : ''}`;
    } else if (typed.source_type !== 'public_url') {
        row.attribution_hint = typed.source_type === 'earnings_call'
            ? `verbal attribution only — cite the earnings call, never a link`
            : `verbal attribution only — cite ${row.source_title}, never a link`;
    }
    return { row, unverified: false };
}

/**
 * Enforce the theme gates and select the strongest evidence.
 * Exported for self-testing.
 */
export function curateThemes(rawThemes: RawTheme[], maxThemes: number): {
    themes: { name: string; graph: string; named_entities: string[] }[];
    ledger: LedgerRow[];
    dropped: DroppedTheme[];
} {
    const dropped: DroppedTheme[] = [];
    const kept: { theme: RawTheme; rows: LedgerRow[]; score: number }[] = [];

    for (const theme of rawThemes) {
        const rows: LedgerRow[] = [];
        let sawUnverified = false;
        let sawEvidence = false;
        for (const item of theme.evidence || []) {
            sawEvidence = true;
            const { row, unverified } = buildRow(item, theme);
            if (unverified) sawUnverified = true;
            if (row) rows.push(row);
        }
        if (rows.length === 0) {
            dropped.push({
                theme: theme.name,
                reason: !sawEvidence ? 'no_usable_evidence' : (sawUnverified ? 'unverified_name' : 'no_named_example'),
            });
            continue;
        }
        // One strong example beats one strong plus one weak — keep at most 2,
        // and only keep the 2nd if it is also strong (linkable or spoken).
        rows.sort((a, b) => strength(b) - strength(a));
        const selected = [rows[0]!];
        if (rows[1] && strength(rows[1]) >= 2) selected.push(rows[1]);
        const score = selected.reduce((s, r) => s + strength(r), 0) + Math.min(rows.length, 4) * 0.1;
        kept.push({ theme, rows: selected, score });
    }

    kept.sort((a, b) => b.score - a.score);
    const shipped = kept.slice(0, maxThemes);
    for (const cut of kept.slice(maxThemes)) {
        dropped.push({ theme: cut.theme.name, reason: 'below_selection_cut' });
    }

    const ledger: LedgerRow[] = [];
    const themes = shipped.map(k => {
        ledger.push(...k.rows);
        return {
            name: k.theme.name,
            graph: k.theme.graph,
            named_entities: [...new Set(k.rows.map(r => r.entity))],
        };
    });
    return { themes, ledger, dropped };
}

function strength(row: LedgerRow): number {
    if (row.source_type === 'public_url') return 3;
    if (row.attribution_hint && !row.attribution_hint.startsWith('verbal attribution')) return 2; // named speaker
    if (row.source_type === 'earnings_call') return 2;
    return 1;
}

// ---------------------------------------------------------------------------
// Composition contracts — the locked format rules, embedded in every result
// ---------------------------------------------------------------------------

const BRIDGE: Record<LinkedInVoice, string> = {
    fodda_first_party: 'We found these using Fodda — our service that helps anyone\'s AI become a domain expert.',
    practitioner: 'I pulled these from Fodda — a service that helps anyone\'s AI become a domain expert.',
};

const BANNED = 'BANNED: validation filler ("nailed it", "great point"), hype adjectives ("game-changing", "revolutionary"), unverifiable superlatives, engagement bait ("thoughts?", CTA stacks), and ANY claim that does not appear in evidence_ledger.';

const SOURCE_RULES = `SOURCE RULES (non-negotiable):
- Use ONLY claims from evidence_ledger. Every named entity in your draft must appear in a ledger row.
- source_type "public_url": you may link, using the row's url EXACTLY as given.
- source_type "earnings_call" or "report": VERBAL ATTRIBUTION ONLY ("...'s CFO told analysts", "per the report") — these rows have url null and must NEVER carry a link. Do not look up, guess, or construct a URL for them. Zero constructed URLs, ever.
- Attribute directly and personally ("Om Malik argues…", "Coca-Cola's CFO told analysts…") — never "one commentator notes".
- Graph-sourced brand momentum is NARRATIVE momentum, not financial performance — never present it as financials. Only earnings_call rows are financially sourced.`;

export function buildPostContract(voice: LinkedInVoice, recommendAgainst: boolean): string {
    return `COMPOSITION CONTRACT — LinkedIn POST (v1). You (the client model) write the draft from the evidence pack above. The server curates; you compose. Follow this contract exactly.
${recommendAgainst ? '\n⚠️ COVERAGE IS TOO THIN — DO NOT DRAFT. Tell the user the graphs lack credible named-example coverage for this topic (see coverage_note) and recommend skipping a Fodda-backed post. A skipped post costs nothing; a hollow one costs credibility.\n' : ''}
STRUCTURE (fixed, in order):
1. INFORMATIVE OPEN — 2–3 sentences on the key themes, leading with a specific fact or named example from the ledger. The specific fact MUST land within the first 200 characters (before LinkedIn's "see more" fold). No Fodda mention yet.
2. THE BRIDGE — one sentence of locked copy: "${BRIDGE[voice]}" An alt opener like "When ${voice === 'practitioner' ? 'I' : 'we'} ran this through the Fodda graphs…" is allowed, but the value-prop phrase ("helps anyone's AI become a domain expert") is fixed and must appear verbatim.
3. THE THEMES — 2–3 themes, each 1–3 sentences with its named example and direct personal attribution.
4. CLOSE — one punchy, grounded observation. No CTA stack, no "thoughts?", no engagement bait.

FORMAT (plain text — LinkedIn does NOT render markdown):
- No markdown of any kind: no ##, no **, no markdown bullet glyphs, no [text](url) syntax.
- Short paragraphs of 1–2 sentences. 150–300 words total.
- Hashtags: three or fewer, or none.

${SOURCE_RULES}

${BANNED}

OUTPUT — produce exactly these fields for the human editor:
- post_text: the plain-text post.
- first_comment_text: source links (public_url rows only) + fodda.ai. Links live here because in-body links are widely believed to be feed-deprioritized; the human decides final placement.
Then show the evidence_ledger (the receipts) and the dropped list so the human review pass is fast. Never silently omit an available URL — every public_url row's link appears in first_comment_text.`;
}

export function buildArticleContract(voice: LinkedInVoice, targetWords: number, recommendAgainst: boolean): string {
    const lo = Math.max(600, Math.round(targetWords * 0.8));
    const hi = Math.round(targetWords * 1.2);
    return `COMPOSITION CONTRACT — LinkedIn ARTICLE (v1). You (the client model) write the article from the evidence pack above. The server curates; you compose. Follow this contract exactly.
${recommendAgainst ? '\n⚠️ COVERAGE IS TOO THIN — DO NOT DRAFT. Tell the user the graphs lack credible named-example coverage for this topic (see coverage_note) and recommend against a Fodda-backed article. A skipped article costs nothing; a hollow one costs credibility.\n' : ''}
STRUCTURE (fixed, in order):
1. HEADLINE — makes a claim, not a topic label.
2. STANDFIRST — the informative intro: key themes, led by a specific fact or named example. No Fodda mention yet.
3. THE BRIDGE — locked copy, may breathe to two sentences here: "${BRIDGE[voice]}" The value-prop phrase ("helps anyone's AI become a domain expert") is fixed and must appear verbatim.
4. THEMED SECTIONS — 3–5 sections with plain-language subheads. Each carries its named example(s); inline links ONLY for public_url ledger rows (use the row's url exactly); verbal attribution for earnings_call/report rows. Weave in the hard numbers from the statistics list where they support a section. If counterpoints are present, engage the strongest one honestly — articles need an argument that survives contact.
5. "HOW WE FOUND THIS" BOX — three or four lines naming the graphs and query types used (see how_we_found_this). This methodology box is the product demo — NEVER cut it.
6. CLOSE — a short, grounded closing observation.

FORMAT: ${lo}–${hi} words. Articles render rich text — markdown IS fine here (headers, links, bold).

${SOURCE_RULES}

${BANNED}

OUTPUT — produce exactly these fields for the human editor:
- title: the headline.
- body_markdown: the full article in markdown.
Then show the evidence_ledger (the receipts) and the dropped list so the human review pass is fast.`;
}

// ---------------------------------------------------------------------------
// Evidence-pack cache — topic-hash keyed, 24h TTL (draft-iterate loop saver)
// ---------------------------------------------------------------------------

const PACK_CACHE = new Map<string, { pack: EvidencePack; createdAt: number }>();
const PACK_TTL_MS = 24 * 60 * 60 * 1000;
const PACK_CACHE_MAX = 200;

function packCacheKey(apiKey: string, opts: EngineOptions): string {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 8);
    const sig = JSON.stringify([
        opts.mode,
        opts.topic.trim().toLowerCase(),
        (opts.angle || '').trim().toLowerCase(),
        opts.voice || 'fodda_first_party',
        (opts.brand || '').trim().toLowerCase(),
        (opts.subThemes || []).map(s => s.trim().toLowerCase()),
        opts.targetLengthWords || 0,
        keyHash,
    ]);
    return crypto.createHash('sha256').update(sig).digest('hex');
}

function prunePackCache(): void {
    const now = Date.now();
    for (const [k, v] of PACK_CACHE) {
        if (now - v.createdAt > PACK_TTL_MS) PACK_CACHE.delete(k);
    }
    while (PACK_CACHE.size >= PACK_CACHE_MAX) {
        const oldest = PACK_CACHE.keys().next().value;
        if (oldest === undefined) break;
        PACK_CACHE.delete(oldest);
    }
}

/** Exposed for tests. */
export function clearPackCache(): void { PACK_CACHE.clear(); }

// ---------------------------------------------------------------------------
// Retrieval recipe
// ---------------------------------------------------------------------------

/** Deterministic fallback decomposition when the client didn't supply sub-themes. */
export function fallbackSubThemes(topic: string, mode: 'post' | 'article'): string[] {
    const t = topic.trim();
    const facets = [
        t,
        `${t} named brand and retailer examples`,
        `${t} consumer behavior shifts`,
    ];
    if (mode === 'article') {
        facets.push(`${t} technology and platform moves`, `${t} market data`);
    }
    return facets.slice(0, mode === 'post' ? 4 : 5);
}

function normalizeTrends(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.results || data.trends || data.matches || [];
}

function trendName(t: any): string {
    return (t?.trend_name || t?.trendName || t?.name || t?.title || '').toString().trim();
}

function trendGraph(t: any): string {
    return (t?.graph_id || t?.graphId || t?.graphName || t?.graph || 'unknown').toString();
}

function trendEvidence(t: any): any[] {
    const ev = t?.evidence || t?.evidence_items || t?.evidenceItems || [];
    return Array.isArray(ev) ? ev : [];
}

/**
 * Run one retrieval call; classify failures. Explicit quota state → throw
 * QuotaExhaustedError (aborts the whole pack). Plan-forbidden/disabled →
 * treat as an unavailable source (skip). Other errors → skip with log.
 */
async function safeCall(deps: EngineDeps, label: string, skipped: string[], fn: () => Promise<any>): Promise<any | null> {
    try {
        return await fn();
    } catch (err: any) {
        const access = classifyAccessError(err);
        if (access === 'credits' || access === 'legacy_retired') {
            throw new QuotaExhaustedError(err);
        }
        skipped.push(label);
        console.error(`[linkedinEngine] ${label} unavailable (${access || err?.message || 'error'}) — skipping`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export async function buildEvidencePack(deps: EngineDeps, opts: EngineOptions): Promise<EvidencePack> {
    const voice: LinkedInVoice = opts.voice || 'fodda_first_party';
    const targetWords = opts.targetLengthWords || 1000;

    // ── Cache (24h TTL, keyed on topic-hash + account) ──
    prunePackCache();
    const cacheKey = packCacheKey(deps.apiKey, opts);
    const cached = PACK_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < PACK_TTL_MS) {
        const clone: EvidencePack = JSON.parse(JSON.stringify(cached.pack));
        clone._cache = { hit: true, age_minutes: Math.round((Date.now() - cached.createdAt) / 60000) };
        console.error(`[linkedinEngine] pack cache HIT for "${opts.topic}" (age ${clone._cache.age_minutes}m)`);
        return clone;
    }

    const subThemes = (opts.subThemes && opts.subThemes.length > 0)
        ? opts.subThemes.slice(0, opts.mode === 'post' ? 4 : 5)
        : fallbackSubThemes(opts.angle ? `${opts.topic} — ${opts.angle}` : opts.topic, opts.mode);

    const skipped: string[] = [];
    const queryTypes = new Set<string>(['domain_intelligence', 'expert_intelligence']);

    // ── Parallel retrieval: domain + expert per sub-theme ──
    const searchBody = (q: string) => ({
        query: q,
        limit: 7,
        include_evidence: true,
        max_evidence_per_trend: 5,
        min_score: 0.6,
    });
    const searchCalls: Promise<{ kind: string; data: any } | null>[] = [];
    for (const st of subThemes) {
        searchCalls.push(
            safeCall(deps, `domain:"${st}"`, skipped, () =>
                deps.foddaRequest('POST', '/v1/search/domain', deps.apiKey, deps.userId, searchBody(st))
            ).then(data => data ? { kind: 'domain', data } : null),
            safeCall(deps, `expert:"${st}"`, skipped, () =>
                deps.foddaRequest('POST', '/v1/search/expert', deps.apiKey, deps.userId, searchBody(st))
            ).then(data => data ? { kind: 'expert', data } : null),
        );
    }

    // ── Brand truth-layer path (only when a named brand is the topic) ──
    let earningsPromise: Promise<any | null> = Promise.resolve(null);
    if (opts.brand) {
        queryTypes.add('earnings_snapshot');
        earningsPromise = safeCall(deps, `earnings:"${opts.brand}"`, skipped, () =>
            deps.foddaRequest('GET', `/v1/supplemental/earnings/snapshot?brand=${encodeURIComponent(opts.brand!)}&limit=5`, deps.apiKey, deps.userId)
        );
    }

    // ── Article extras: statistics pass ──
    let statsPromises: Promise<any | null>[] = [];
    let statsGraphIds: string[] = [];
    if (opts.mode === 'article') {
        queryTypes.add('standalone_statistics');
        const domainIds = [...getDomainGraphIds()];
        statsGraphIds = (domainIds.length > 0 ? domainIds : ['retail', 'sic']).slice(0, 3);
        statsPromises = statsGraphIds.map(gid =>
            safeCall(deps, `statistics:${gid}`, skipped, () =>
                deps.foddaRequest('GET', `/v1/graphs/${gid}/statistics?query=${encodeURIComponent(opts.topic)}&limit=8&min_score=0.6`, deps.apiKey, deps.userId)
            )
        );
    }

    const [searchResults, earningsRaw, ...statsResults] = await Promise.all([
        Promise.all(searchCalls),
        earningsPromise,
        ...statsPromises,
    ]);

    // ── Article extras: analyst pressure-test (thesis framing, 25s budget) ──
    let counterpoints: { analyst: string; text: string } | null = null;
    if (opts.mode === 'article') {
        const analysts = getAnalysts();
        const analyst = analysts[0];
        if (analyst) {
            queryTypes.add('expert_agent');
            const thesis = opts.angle || `${opts.topic} is a durable shift, not a passing narrative`;
            const consult = await Promise.race([
                safeCall(deps, `consult:${analyst.analyst_id}`, skipped, () =>
                    deps.foddaRequest('POST', '/v1/analysts/consult', deps.apiKey, deps.userId, {
                        analyst_id: analyst.analyst_id,
                        query: `Thesis: ${thesis}. What breaks it?`,
                    })
                ),
                new Promise<null>(resolve => setTimeout(() => resolve(null), 25000)),
            ]);
            const text = typeof consult?.result === 'string' ? consult.result
                : (typeof consult?.report === 'string' ? consult.report : null);
            if (text) {
                counterpoints = { analyst: analyst.name, text: text.slice(0, 2500) };
            } else if (consult === null) {
                skipped.push(`consult:${analyst.analyst_id} (timeout)`);
            }
        } else {
            skipped.push('consult (no analysts in catalog)');
        }
    }

    // ── Cluster search results into themes (dedupe by trend name) ──
    const rawThemes: RawTheme[] = [];
    const seenThemes = new Set<string>();
    const emptySources: string[] = [];
    let domainReturned = false;
    let expertReturned = false;
    for (const res of searchResults) {
        if (!res) continue;
        const trends = normalizeTrends(res.data);
        if (trends.length > 0) {
            if (res.kind === 'domain') domainReturned = true;
            if (res.kind === 'expert') expertReturned = true;
        }
        for (const t of trends) {
            const name = trendName(t);
            if (!name) continue;
            const key = name.toLowerCase();
            if (seenThemes.has(key)) continue;
            seenThemes.add(key);
            rawThemes.push({ name, graph: trendGraph(t), evidence: trendEvidence(t) });
        }
    }
    // Empty expert results are signal, not failure — record, never retry-loop.
    if (!expertReturned) emptySources.push('expert_graphs');
    if (!domainReturned) emptySources.push('domain_graphs');

    // ── Curate: hard gates + selection ──
    const maxThemes = opts.mode === 'post' ? 3 : 5;
    const { themes, ledger, dropped } = curateThemes(rawThemes, maxThemes);

    // ── Brand truth layer → ledger rows (earnings_call, verbal-only, ideal ledger material) ──
    const graphsSearched = new Set<string>(ledger.map(r => r.graph));
    if (earningsRaw) {
        const snapshot = earningsRaw?.snapshot || earningsRaw;
        const truthLayer = earningsRaw?.earningsTruthLayer || snapshot?.truth_layer || null;
        const validatedTrends: any[] = earningsRaw?.validatedTrends || snapshot?.validated_trends || [];
        const brand = opts.brand!;
        if (truthLayer) {
            graphsSearched.add('earnings-truth-layer');
            if (truthLayer.headline) {
                ledger.push({
                    claim: String(truthLayer.headline).slice(0, 280),
                    entity: brand,
                    source_title: `${brand} earnings call`,
                    source_type: 'earnings_call',
                    url: null,
                    graph: 'earnings-truth-layer',
                    theme: 'Earnings truth layer',
                    attribution_hint: `verbal attribution only — "${brand}'s latest earnings call" — never a link`,
                });
            }
            const concerns: any[] = Array.isArray(truthLayer.analyst_concerns)
                ? truthLayer.analyst_concerns
                : (truthLayer.analyst_concerns ? [truthLayer.analyst_concerns] : []);
            for (const c of concerns.slice(0, 2)) {
                const concernText = typeof c === 'string' ? c : (c?.concern || c?.text || JSON.stringify(c));
                ledger.push({
                    claim: String(concernText).slice(0, 280),
                    entity: brand,
                    source_title: `${brand} earnings call — analyst Q&A`,
                    source_type: 'earnings_call',
                    url: null,
                    graph: 'earnings-truth-layer',
                    theme: 'Earnings truth layer',
                    attribution_hint: `verbal attribution only — "analysts pressed ${brand} on…" — never a link`,
                });
            }
            if (truthLayer.quote_from_ceo) {
                ledger.push({
                    claim: String(truthLayer.quote_from_ceo).slice(0, 280),
                    entity: brand,
                    source_title: `${brand} earnings call — CEO`,
                    source_type: 'earnings_call',
                    url: null,
                    graph: 'earnings-truth-layer',
                    theme: 'Earnings truth layer',
                    attribution_hint: `${brand}'s CEO on the earnings call (verbal attribution only — never a link)`,
                });
            }
            if (ledger.some(r => r.theme === 'Earnings truth layer')) {
                themes.push({ name: 'Earnings truth layer', graph: 'earnings-truth-layer', named_entities: [brand] });
            }
        }
        // validated_trends: ideal ledger material — "NKE's earnings validate [trend] — [graph]"
        const vtRows: LedgerRow[] = [];
        for (const vt of (validatedTrends || []).slice(0, 3)) {
            const vtName = (vt?.trend || vt?.trend_name || vt?.name || '').toString().trim();
            if (!vtName) continue;
            const vtGraph = (vt?.graph || vt?.graph_id || vt?.graphName || 'earnings-truth-layer').toString();
            graphsSearched.add(vtGraph);
            vtRows.push({
                claim: `${brand}'s earnings validate "${vtName}"`,
                entity: brand,
                source_title: `${brand} earnings call × ${vtGraph}`,
                source_type: 'earnings_call',
                url: null,
                graph: vtGraph,
                theme: 'Market-validated trends',
                attribution_hint: `verbal attribution only — "${brand}'s earnings validate ${vtName}" — never a link`,
            });
        }
        if (vtRows.length > 0) {
            ledger.push(...vtRows);
            themes.push({ name: 'Market-validated trends', graph: 'earnings-truth-layer', named_entities: [brand] });
        }
    }

    // ── Article statistics → hard-numbers list (same gates) ──
    let statistics: LedgerRow[] | undefined;
    if (opts.mode === 'article') {
        statistics = [];
        statsResults.forEach((res, i) => {
            if (!res) return;
            const gid = statsGraphIds[i] || 'unknown';
            const items = res?.results || res?.statistics || res?.items || (Array.isArray(res) ? res : []);
            for (const item of items) {
                const { row } = buildRow(item, { name: 'Hard numbers', graph: gid, evidence: [] });
                if (row) statistics!.push(row);
                if (statistics!.length >= 3) break;
            }
        });
        if (statistics.length === 0) emptySources.push('statistics');
        for (const s of statistics) graphsSearched.add(s.graph);
    }

    // ── Coverage honesty — gate #6 ──
    const minThemes = opts.mode === 'post' ? 2 : 3;
    const thin = themes.length < minThemes;
    const coverageNote = thin
        ? `Coverage is thin: only ${themes.length} theme(s) survived the named-example gate for "${opts.topic}" (minimum for a credible ${opts.mode} is ${minThemes}). ${dropped.length > 0 ? `${dropped.length} theme(s) were dropped — see \`dropped\` for reasons. ` : ''}The graphs may be genuinely thin here. Recommend AGAINST a Fodda-backed ${opts.mode} on this topic rather than padding — a skipped ${opts.mode} costs nothing; a hollow one costs credibility.`
        : null;

    const pack: EvidencePack = {
        tool: opts.mode === 'post' ? 'draft_linkedin_post' : 'draft_linkedin_article',
        topic: opts.topic,
        voice,
        themes,
        evidence_ledger: ledger,
        dropped,
        coverage_note: coverageNote,
        recommend_against: thin,
        how_we_found_this: {
            graphs_searched: [...graphsSearched].sort(),
            query_types: [...queryTypes],
            sub_themes: subThemes,
            empty_sources: emptySources,
            note: 'Name these graphs and query types in the "How we found this" box (articles) or when the user asks about methodology. Empty expert results are signal (emerging/culture-adjacent topic), not failure.',
        },
        composition_contract: opts.mode === 'post'
            ? buildPostContract(voice, thin)
            : buildArticleContract(voice, targetWords, thin),
    };
    if (opts.mode === 'article') {
        pack.statistics = statistics ?? [];
        pack.counterpoints = counterpoints;
    }

    PACK_CACHE.set(cacheKey, { pack: JSON.parse(JSON.stringify(pack)), createdAt: Date.now() });
    return pack;
}
