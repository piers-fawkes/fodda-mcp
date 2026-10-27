/**
 * Help Service — Fetches published llms.txt and llms-full.txt from www.fodda.ai,
 * splits into sections, scores passages against user questions, and returns
 * direct, authoritative help answers.
 *
 * Rules:
 * - 10s timeout, never throw, returns structured fallback on error
 * - Cached for 1 hour (3,600,000 ms)
 * - Answer the question directly instead of returning raw file sections
 * - Strip HTML comments (<!-- CONNECTORS_START -->, etc.)
 * - Exclude internal sections: Core REST Endpoints, Authentication & Billing, llms-full RULE: sections
 * - No dollar prices: drop PRICING_START; for cost queries, state approximate API calls and link https://www.fodda.ai/pricing
 * - For connect questions, lead with the matching /connect/... guide link
 * - Graph count: always uses live catalog registry count, matching toolGuide.ts
 * - Zero bare or escaped dollar signs in user-facing answers
 */

import axios from 'axios';
import { getLiveGraphCount } from './toolGuide.js';

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
        if (cachedDoc?.text) {
            console.warn(`[helpService] Serving stale cache for ${url}`);
            return { text: cachedDoc.text };
        }
        return { text: null, error: errMsg };
    }
}

/**
 * Pre-clean raw markdown:
 * - Strip PRICING blocks
 * - Strip HTML comments
 */
function cleanRawMarkdown(raw: string): string {
    let text = raw;
    // Strip dynamic pricing block completely
    text = text.replace(/<!--\s*PRICING_START\s*-->[\s\S]*?<!--\s*PRICING_END\s*-->/gi, '');
    // Strip directives block
    text = text.replace(/<!--\s*DIRECTIVES_START\s*-->[\s\S]*?<!--\s*DIRECTIVES_END\s*-->/gi, '');
    // Strip any remaining HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    return text;
}

/**
 * Split markdown text into clean sections by '## ' headings.
 * Excludes internal endpoints, auth/billing, and RULE: sections.
 */
function splitIntoSections(markdown: string, source: 'llms.txt' | 'llms-full.txt'): Array<{ heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }> {
    const cleanMd = cleanRawMarkdown(markdown);
    const sections: Array<{ heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }> = [];
    const lines = cleanMd.split('\n');
    let currentHeading = 'Overview';
    let currentLines: string[] = [];

    const isExcluded = (h: string) => {
        const lower = h.toLowerCase();
        return lower.includes('core rest endpoints') ||
               lower.includes('authentication & billing') ||
               lower.includes('rule:') ||
               lower.includes('directives for ai');
    };

    for (const line of lines) {
        if (line.startsWith('## ')) {
            if (currentLines.length > 0 && !isExcluded(currentHeading)) {
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

    if (currentLines.length > 0 && !isExcluded(currentHeading)) {
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
function scoreSection(section: { heading: string; content: string; source: 'llms.txt' | 'llms-full.txt' }, terms: string[], rawQuestion: string): number {
    let score = 0;
    const headingLower = section.heading.toLowerCase();
    const contentLower = section.content.toLowerCase();

    for (const term of terms) {
        if (headingLower.includes(term)) {
            score += 10;
        }
        const headingWords = headingLower.split(/[^a-z0-9]+/);
        if (headingWords.includes(term)) {
            score += 5;
        }

        let occurrences = 0;
        let pos = 0;
        while ((pos = contentLower.indexOf(term, pos)) !== -1) {
            occurrences++;
            pos += term.length;
            if (occurrences >= 5) break;
        }
        score += occurrences * 2;
    }

    const qLower = rawQuestion.toLowerCase();
    const isPricingQuery = /cost|price|pricing|charge|bill|rate/i.test(qLower);
    const isConnectQuery = /claude|connect|setup|install|integration|chatgpt|cursor|copilot|perplexity|notion/i.test(qLower);
    const isAboutQuery = /what is fodda|who is fodda|about fodda|overview/i.test(qLower) || terms.includes('fodda');

    if (isPricingQuery && /pricing|about/i.test(headingLower)) {
        score += 35;
    }
    if (isConnectQuery && /integration|connect|connectors/i.test(headingLower)) {
        score += 40;
    }
    if (isAboutQuery) {
        if (headingLower === 'overview' || headingLower === 'about') {
            score += 45;
        } else if (/core capabilities/i.test(headingLower)) {
            score += 35;
        }
    }
    if (/tools|capabilities|what can you do|features/i.test(qLower) && /core capabilities|catalog structure/i.test(headingLower)) {
        score += 35;
    }

    if (section.source === 'llms.txt' && score > 0) {
        score += 5;
    }

    return score;
}

/**
 * Clean and sanitize text for output:
 * - Replaces 300+ / 100+ with the live catalog count
 * - Strips all dollar amounts ($100, $0.50, etc.)
 * - Strips machine settlement / SPT phrasing
 */
function sanitizeOutputText(text: string, liveGraphCount: number): string {
    let out = text;

    // Harmonize graph count
    out = out.replace(/\b([0-9]+\+)\s*(knowledge\s+graphs|graphs)\b/gi, `${liveGraphCount}+ $2`);
    out = out.replace(/\bacross [0-9]+\+ knowledge graphs\b/gi, `across ${liveGraphCount}+ knowledge graphs`);

    // Remove SPT / token phrasing
    out = out.replace(/\s*\(settle via\s*`?Authorization:\s*Bearer\s*spt_[^`)]*`?\)/gi, '');
    out = out.replace(/\bShared Payment Tokens?\s*\(SPT\)/gi, 'API key or direct billing');
    out = out.replace(/\bvia SPT\b/gi, 'via direct billing');
    out = out.replace(/\bMachine Settlement via MPP[^:\n]*:/gi, 'Direct Settlement:');

    // Strip dollar amounts completely
    out = out.replace(/\\?\$[0-9]+(?:\.[0-9]{2})?/g, '');
    out = out.replace(/\(\s*\)/g, '');

    return out.trim();
}

/**
 * Resolve dedicated connector link based on user question
 */
function resolveConnectorLink(qLower: string): { name: string; url: string } {
    if (qLower.includes('claude')) {
        return { name: 'Claude', url: 'https://www.fodda.ai/connect/claude' };
    }
    if (qLower.includes('chatgpt') || qLower.includes('chat gpt') || qLower.includes('openai')) {
        return { name: 'ChatGPT', url: 'https://www.fodda.ai/connect/chatgpt' };
    }
    if (qLower.includes('cursor')) {
        return { name: 'Cursor', url: 'https://www.fodda.ai/connect/cursor' };
    }
    if (qLower.includes('copilot') || qLower.includes('microsoft')) {
        return { name: 'Microsoft Copilot', url: 'https://www.fodda.ai/connect/microsoft' };
    }
    if (qLower.includes('google') || qLower.includes('gemini')) {
        return { name: 'Google', url: 'https://www.fodda.ai/connect/google' };
    }
    if (qLower.includes('langchain') || qLower.includes('python')) {
        return { name: 'LangChain (Python)', url: 'https://www.fodda.ai/connect/langchain' };
    }
    if (qLower.includes('grok')) {
        return { name: 'Grok', url: 'https://www.fodda.ai/connect/grok' };
    }
    if (qLower.includes('perplexity')) {
        return { name: 'Perplexity', url: 'https://www.fodda.ai/connect/perplexity' };
    }
    if (qLower.includes('notion')) {
        return { name: 'Notion', url: 'https://www.fodda.ai/connect/notion' };
    }
    return { name: 'AI Models & Platforms', url: 'https://www.fodda.ai/connect' };
}

/**
 * Main query function for get_capabilities({ view: 'help', question })
 */
export async function getHelpAnswer(question?: string): Promise<HelpResponse> {
    const rawQuestion = (question || '').trim();
    const liveGraphCount = getLiveGraphCount();

    if (!rawQuestion) {
        return {
            ok: true,
            question: '',
            found_answers: true,
            answer: `Fodda Help Desk: You can ask questions such as 'What is Fodda?', 'How do I connect Fodda to Claude?', 'What does Fodda cost?', or 'What can you do?'. For an interactive 5-section guide to all available tools, call get_capabilities with view: 'tools'.`,
            sources: [
                { title: 'Fodda Documentation', url: 'https://www.fodda.ai/llms.txt' },
                { title: 'Connect Guides', url: 'https://www.fodda.ai/connect' },
                { title: 'Pricing', url: 'https://www.fodda.ai/pricing' }
            ],
            tools_guide_tip: "Call get_capabilities({ view: 'tools' }) for the interactive tool guide."
        };
    }

    const qLower = rawQuestion.toLowerCase();
    const isWhatCanYouDo = /what can you do|what tools|tools do you have|how would i use|capabilities|offerings/i.test(qLower);
    const isConnectQuery = /claude|connect|setup|install|integration|chatgpt|cursor|copilot|perplexity|notion/i.test(qLower);
    const isPricingQuery = /cost|price|pricing|charge|rate|billing/i.test(qLower);
    const isWhatIsFodda = /what is fodda|who is fodda|about fodda|overview of fodda/i.test(qLower);

    // 1. Direct answer synthesis for canonical intent queries
    if (isConnectQuery) {
        const connector = resolveConnectorLink(qLower);
        const answer = `To connect Fodda to ${connector.name}, see the setup guide at:
${connector.url}

Fodda connects to AI models, desktop assistants, and agent workflows via the Model Context Protocol (MCP) and REST APIs:
- Hosted MCP Endpoint: https://mcp.fodda.ai/mcp
- Scoped Claude MCP Endpoint: https://mcp.fodda.ai/claude
- All Connection Guides: https://www.fodda.ai/connect

Once connected, your AI assistant can query Fodda's ${liveGraphCount}+ knowledge graphs, consult specialist Human Agents, and extract corporate earnings intelligence directly in conversation.`;

        return {
            ok: true,
            question: rawQuestion,
            found_answers: true,
            answer,
            sources: [
                { title: `Connect ${connector.name}`, url: connector.url },
                { title: 'Connect Hub', url: 'https://www.fodda.ai/connect' }
            ]
        };
    }

    if (isPricingQuery) {
        const answer = `Fodda is billed based on the number of API calls used by research queries, expert consultations, and deliverables.

Typical API-call usage:
- Basic discovery, account lookups, and help answers: 0 API calls.
- Standard queries, earnings lookups, and evidence lookups: normally about 1 to 5 API calls.
- Autonomous multi-graph research, brand tracking, and Strategy-to-Activation plans: normally about 15 to 20 API calls.

See https://www.fodda.ai/pricing for current rates, plans, and credit packages.`;

        return {
            ok: true,
            question: rawQuestion,
            found_answers: true,
            answer,
            pricing_note: "Fodda is billed per API call. See https://www.fodda.ai/pricing for current rates.",
            sources: [
                { title: 'Pricing & Plans', url: 'https://www.fodda.ai/pricing' }
            ]
        };
    }

    if (isWhatIsFodda) {
        const answer = `Fodda is an intelligence network providing access to ${liveGraphCount}+ curated and specialized knowledge graphs across retail, consumer goods, media, technology, and culture.

Rather than generating speculative answers from general web training weights, Fodda retrieves structured trend signals, cited proof points, executive earnings calls, and quantitative metrics maintained by domain experts and industry analysts.

Key capabilities include:
- **Autonomous Research**: Multi-graph search across ${liveGraphCount}+ curated domain and specialist graphs with cited evidence.
- **Human Agents**: Verified digital twins of named living practitioners and specialist analysts.
- **Earnings Intelligence**: Corporate disclosures, guidance shifts, and executive commentary across public reporting companies.
- **Signals**: Real-time macroeconomic, regulatory, and demographic data from FRED, BEA, BLS, and Census.

Learn more at https://www.fodda.ai or explore the Prompt Guide at https://www.fodda.ai/prompt-guide.`;

        return {
            ok: true,
            question: rawQuestion,
            found_answers: true,
            answer,
            sources: [
                { title: 'Fodda Homepage', url: 'https://www.fodda.ai' },
                { title: 'Prompt Guide', url: 'https://www.fodda.ai/prompt-guide' },
                { title: 'Knowledge Graphs', url: 'https://www.fodda.ai/graphs' }
            ]
        };
    }

    if (isWhatCanYouDo) {
        const answer = `Fodda provides five core capabilities:

1. **Research**: Explore market evidence, category trends, brand footprints, and corporate reports across ${liveGraphCount}+ knowledge graphs.
2. **Pressure-test**: Challenge strategies, hypotheses, or market claims against verified evidence and corporate earnings disclosures.
3. **Ask an expert**: Consult verified Human Agents (practitioners with digital twins), C-Suite personas, and specialist analysts.
4. **Make something**: Generate deliverables including research briefs, Strategy-to-Activation comms plans, and executive memos.
5. **Track**: Establish ongoing intelligence tracking and scheduled briefing monitoring.

For an interactive breakdown of every available tool, when to use it, and sample prompts, run \`get_capabilities\` with \`view: 'tools'\`.`;

        return {
            ok: true,
            question: rawQuestion,
            found_answers: true,
            answer,
            tools_guide_tip: "Run get_capabilities({ view: 'tools' }) for the interactive tool guide.",
            sources: [
                { title: 'Prompt Guide', url: 'https://www.fodda.ai/prompt-guide' },
                { title: 'Tool Documentation', url: 'https://www.fodda.ai/api' }
            ]
        };
    }

    // 2. Fallback to passage retrieval from published llms text for non-canonical queries
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
            message: 'Documentation text was temporarily unavailable'
        };
    }

    let terms = tokenize(rawQuestion);
    if (terms.length === 0) {
        terms = ['fodda', 'overview'];
    }

    const scored: HelpSection[] = sections.map(sec => ({
        ...sec,
        score: scoreSection(sec, terms, rawQuestion)
    }));

    const matched = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);

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

    const topSections = matched.slice(0, 2);

    // Format clean answer prose from top matching sections
    const formattedPassages = topSections.map(s => {
        const cleanContent = sanitizeOutputText(s.content, liveGraphCount);
        return cleanContent;
    }).join('\n\n');

    // Extract Markdown links [Title](URL)
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

    return {
        ok: true,
        question: rawQuestion,
        found_answers: true,
        answer: formattedPassages,
        sources,
        sections: topSections.map(s => ({ heading: s.heading, source: s.source }))
    };
}
