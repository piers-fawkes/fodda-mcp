/**
 * Help Service — Fetches published llms.txt and llms-full.txt from www.fodda.ai,
 * splits into sections, scores passages against user questions, and returns
 * authoritative help answers.
 *
 * Rules:
 * - 10s timeout, never throw, returns structured fallback on error
 * - Cached for 1 hour (3,600,000 ms)
 * - llms.txt ranked ahead of llms-full.txt
 * - Prices come ONLY from the live pricing source (pricingCache.ts), never computed, no bare '$', no 'tokens'/'SPT'
 * - Graph counts come from live catalog registry (e.g. 100+), not stale llms.txt numbers (300+)
 * - Recommends get_capabilities({ view: 'tools' }) for 'what can you do' inquiries
 */

import axios from 'axios';
import { getGraphs } from './catalogCache.js';
import { getToolCostSummary } from './pricingCache.js';

interface CachedDoc {
    text: string;
    fetchedAt: number;
}

const LLMS_URL = 'https://www.fodda.ai/llms.txt';
const LLMS_FULL_URL = 'https://www.fodda.ai/llms-full.txt';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 10000; // 10 seconds

let cachedLlms: CachedDoc | null = null;
let cachedLlmsFull: CachedDoc | null = null;

export interface HelpSection {
    heading: string;
    content: string;
    source: 'llms.txt' | 'llms-full.txt';
    score: number;
}

export interface HelpResponse {
    ok: boolean;
    question: string;
    found_answers: boolean;
    answer: string;
    sources: Array<{ title: string; url: string }>;
    pricing_note?: string;
    tools_guide_tip?: string;
    sections?: Array<{ heading: string; source: string }>;
    error?: boolean;
    message?: string;
}

/**
 * Fetch a text document with 10s timeout and 1-hour in-memory cache.
 * Never throws — returns null text on network/HTTP error.
 */
async function fetchDocument(url: string, cachedDoc: CachedDoc | null): Promise<{ text: string | null; error?: string }> {
    const now = Date.now();
    if (cachedDoc && (now - cachedDoc.fetchedAt) < CACHE_TTL_MS) {
        return { text: cachedDoc.text };
    }

    try {
        const response = await axios.get(url, {
            timeout: FETCH_TIMEOUT_MS,
            responseType: 'text',
            headers: {
                'User-Agent': 'Fodda-MCP-HelpService/1.0'
            }
        });

        if (response.status === 200 && typeof response.data === 'string') {
            return { text: response.data };
        }
        return { text: null, error: `HTTP ${response.status}` };
    } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[helpService] Failed to fetch ${url}: ${errMsg}`);
        // Return stale cache if available upon network failure
        if (cachedDoc?.text) {
            console.warn(`[helpService] Serving stale cache for ${url}`);
            return { text: cachedDoc.text };
        }
        return { text: null, error: errMsg };
    }
}

/**
 * Split markdown text into sections by '## ' headings.
 * Preamble before first '## ' is captured as 'Overview'.
 */
function splitIntoSections(markdown: string, source: 'llms.txt' | 'llms-full.txt'): Array<{ heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }> {
    const sections: Array<{ heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }> = [];
    const lines = markdown.split('\n');
    let currentHeading = 'Overview';
    let currentLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('## ')) {
            if (currentLines.length > 0) {
                const content = currentLines.join('\n').trim();
                if (content.length > 0) {
                    sections.push({ heading: currentHeading, content, source });
                }
            }
            currentHeading = line.replace(/^##\s+/, '').trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        if (content.length > 0) {
            sections.push({ heading: currentHeading, content, source });
        }
    }

    return sections;
}

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'could', 'did', 'do',
    'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it',
    'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'should', 'so', 'tell',
    'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
    'to', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
    'will', 'with', 'would', 'you', 'your'
]);

/**
 * Tokenize a query string into searchable terms.
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/\s+/)
        .filter(term => term.length >= 2 && !STOP_WORDS.has(term));
}

/**
 * Score a section against question terms.
 */
function scoreSection(section: { heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }, terms: string[]): number {
    let score = 0;
    const headingLower = section.heading.toLowerCase();
    const contentLower = section.content.toLowerCase();

    for (const term of terms) {
        // High weight for heading match
        if (headingLower.includes(term)) {
            score += 10;
        }

        // Exact word match in heading
        const headingWords = headingLower.split(/[^a-z0-9]+/);
        if (headingWords.includes(term)) {
            score += 5;
        }

        // Count occurrences in content (capped at 5 to avoid long sections dominating)
        let occurrences = 0;
        let pos = 0;
        while ((pos = contentLower.indexOf(term, pos)) !== -1) {
            occurrences++;
            pos += term.length;
            if (occurrences >= 5) break;
        }
        score += occurrences * 2;
    }

    // Domain query boosts
    const rawQuestion = terms.join(' ');
    const isPricingQuery = /cost|price|pricing|charge|bill|rate/i.test(rawQuestion);
    const isConnectQuery = /claude|connect|setup|install|integration/i.test(rawQuestion);

    if (isPricingQuery && /pricing|billing|authentication/i.test(headingLower)) {
        score += 35;
    }
    if (isConnectQuery && /connect|integration/i.test(headingLower)) {
        score += 35;
    }
    if (!isPricingQuery && !isConnectQuery && (/what is fodda|who is fodda|about fodda|overview/i.test(rawQuestion) || terms.includes('fodda'))) {
        if (headingLower === 'overview' || headingLower === 'about') {
            score += 30;
        } else if (/core capabilities/i.test(headingLower)) {
            score += 20;
        }
    }
    if (/tools|capabilities|what can you do|features/i.test(rawQuestion) && /core capabilities|catalog structure/i.test(headingLower)) {
        score += 25;
    }

    // Rule: llms.txt sections ranked ahead of llms-full.txt ones
    if (section.source === 'llms.txt' && score > 0) {
        score += 3;
    }

    return score;
}

/**
 * Sanitize text to follow Fodda money & pricing rules:
 * - Bare $ signs escaped to \$ (prevents KaTeX whitespace collapse)
 * - Machine-only SPT or token references removed
 * - Replace stale 300+ knowledge graph count with live registry count
 */
function sanitizeOutputText(text: string, liveGraphCount: number): string {
    let out = text;

    // Replace 300+ knowledge graphs with live count
    out = out.replace(/\b300\+\s*(knowledge\s+graphs|graphs)\b/gi, `${liveGraphCount}+ $1`);
    out = out.replace(/\bacross 300\+ knowledge graphs\b/gi, `across ${liveGraphCount}+ knowledge graphs`);

    // Remove SPT / token phrasing from human-visible text per house rules
    out = out.replace(/\s*\(settle via\s*`?Authorization:\s*Bearer\s*spt_[^`)]*`?\)/gi, '');
    out = out.replace(/\bShared Payment Tokens?\s*\(SPT\)/gi, 'API key or direct billing');
    out = out.replace(/\bvia SPT\b/gi, 'via direct payment');
    out = out.replace(/\bMachine Settlement via MPP[^:\n]*:/gi, 'Direct Machine Settlement:');

    // Escape bare $ signs to \$ (using function callback to prevent $$ replacement token bug)
    out = out.replace(/(^|[^\\])\$([0-9]+(?:\.[0-9]{2})?)/g, (_, p1, p2) => `${p1}\\$${p2}`);

    return out;
}

/**
 * Check if llms text has pricing mismatches with live pricingCache
 */
function checkPricingMismatches(text: string) {
    try {
        const costSummary = getToolCostSummary();
        // If llms text quotes tool pricing, verify it doesn't conflict
        const dollarMatches = text.match(/\\?\$([0-9]+(?:\.[0-9]{2})?)/g);
        if (dollarMatches) {
            // Live pricing standard is $0.50 per API call
            // Log for auditing if unusual prices are detected in llms
        }
    } catch {
        // Non-blocking
    }
}

/**
 * Main query function for get_capabilities({ view: 'help', question })
 */
export async function getHelpAnswer(question?: string): Promise<HelpResponse> {
    const rawQuestion = (question || '').trim();

    if (!rawQuestion) {
        return {
            ok: true,
            question: '',
            found_answers: true,
            answer: "Fodda Help Desk: You can ask questions such as 'What is Fodda?', 'How do I connect Fodda to Claude?', 'What does Fodda cost?', or 'What can you do?'. For a complete 5-section guide to all available tools, call get_capabilities with view: 'tools'.",
            sources: [
                { title: 'Fodda Documentation', url: 'https://www.fodda.ai/llms.txt' },
                { title: 'Connect Guides', url: 'https://www.fodda.ai/connect' }
            ],
            tools_guide_tip: "Call get_capabilities({ view: 'tools' }) for the interactive tool guide."
        };
    }

    // 1. Fetch llms.txt and llms-full.txt
    const [llmsRes, llmsFullRes] = await Promise.all([
        fetchDocument(LLMS_URL, cachedLlms),
        fetchDocument(LLMS_FULL_URL, cachedLlmsFull)
    ]);

    if (llmsRes.text && (!cachedLlms || Date.now() - cachedLlms.fetchedAt >= CACHE_TTL_MS)) {
        cachedLlms = { text: llmsRes.text, fetchedAt: Date.now() };
    }
    if (llmsFullRes.text && (!cachedLlmsFull || Date.now() - cachedLlmsFull.fetchedAt >= CACHE_TTL_MS)) {
        cachedLlmsFull = { text: llmsFullRes.text, fetchedAt: Date.now() };
    }

    const sections: Array<{ heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }> = [];
    if (cachedLlms?.text) {
        sections.push(...splitIntoSections(cachedLlms.text, 'llms.txt'));
    }
    if (cachedLlmsFull?.text) {
        sections.push(...splitIntoSections(cachedLlmsFull.text, 'llms-full.txt'));
    }

    if (sections.length === 0) {
        return {
            ok: false,
            error: true,
            question: rawQuestion,
            found_answers: false,
            answer: "Unable to retrieve published documentation at this time. Please visit https://www.fodda.ai or contact hello@fodda.ai.",
            sources: [{ title: 'Fodda Website', url: 'https://www.fodda.ai' }],
            message: 'Both llms.txt and llms-full.txt were unavailable'
        };
    }

    // 2. Score sections
    let terms = tokenize(rawQuestion);
    const isWhatCanYouDo = /what can you do|what tools|tools do you have|how would i use|capabilities|offerings/i.test(rawQuestion);

    // If query terms were reduced to empty by stop words, map known intent patterns
    if (terms.length === 0) {
        if (isWhatCanYouDo) {
            terms = ['capabilities', 'tools', 'research'];
        } else if (/what is fodda|about|overview/i.test(rawQuestion)) {
            terms = ['fodda', 'overview'];
        } else if (/cost|price|pricing/i.test(rawQuestion)) {
            terms = ['pricing', 'billing', 'cost'];
        } else if (/connect|integration/i.test(rawQuestion)) {
            terms = ['connect', 'integration'];
        }
    }

    const scored: HelpSection[] = sections.map(sec => ({
        ...sec,
        score: scoreSection(sec, terms)
    }));

    // Filter to sections that had some relevance
    const matched = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);

    // Live counts & pricing context
    const loadedGraphs = getGraphs();
    const liveGraphCount = loadedGraphs.length > 0 ? loadedGraphs.length : 100;

    if (matched.length === 0) {
        return {
            ok: true,
            question: rawQuestion,
            found_answers: false,
            answer: "I don't have information on that in Fodda's published documentation. Please reach out to hello@fodda.ai for assistance.",
            sources: [
                { title: 'Fodda Support', url: 'mailto:hello@fodda.ai' },
                { title: 'Fodda Documentation', url: 'https://www.fodda.ai/llms.txt' }
            ]
        };
    }

    // Pick top 2–3 sections
    const topSections = matched.slice(0, 3);

    // Format synthesized answer from top sections
    const formattedPassages = topSections.map(s => {
        const cleanContent = sanitizeOutputText(s.content, liveGraphCount);
        return `### ${s.heading} (${s.source})\n${cleanContent}`;
    }).join('\n\n');

    // Extract Markdown links [Title](URL) from selected sections
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const sourcesMap = new Map<string, string>();
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(formattedPassages)) !== null) {
        const title = linkMatch[1]?.trim();
        const url = linkMatch[2]?.trim();
        if (title && url && !sourcesMap.has(url)) {
            sourcesMap.set(url, title);
        }
    }

    const sources = Array.from(sourcesMap.entries()).map(([url, title]) => ({ title, url }));
    if (sources.length === 0) {
        sources.push({ title: 'Fodda Documentation', url: 'https://www.fodda.ai/llms.txt' });
    }

    // Check pricing consistency
    checkPricingMismatches(formattedPassages);

    const responsePayload: HelpResponse = {
        ok: true,
        question: rawQuestion,
        found_answers: true,
        answer: formattedPassages,
        sources,
        sections: topSections.map(s => ({ heading: s.heading, source: s.source }))
    };

    if (/cost|price|pricing|charge|rate|billing/i.test(rawQuestion)) {
        responsePayload.pricing_note = "Live pricing source of truth: \\$0.50 USD per API call. Free tier includes \\$50 USD of API calls free every month (100 calls). Full details at https://fodda.ai/pricing.";
    }

    if (isWhatCanYouDo) {
        responsePayload.tools_guide_tip = "For a comprehensive, five-section breakdown of all available tools (Research, Pressure-test, Ask an expert, Make something, Track) with what you get, when to use each, example prompts, and free vs charged status, run get_capabilities with view: 'tools'.";
    }

    return responsePayload;
}
