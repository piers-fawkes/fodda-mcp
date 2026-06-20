/**
 * Editorial Fill — Server-side slot population for widget templates
 *
 * Tier 1: Simple slots filled mechanically from data (no LLM, instant)
 * Tier 2: Analysis slots filled via Vertex AI Gemini (LLM, ~1-2s)
 *
 * Fallback: If LLM call fails, returns template with {{SLOT}} intact
 * for Claude to fill client-side.
 */

import { GoogleGenAI, ServiceTier } from '@google/genai';

// ---------------------------------------------------------------------------
// Google AI Studio — Gemini (singleton SDK)
// ---------------------------------------------------------------------------
interface GeminiResponse {
    text: string;
    error?: string;
}

// Singleton: instantiate SDK once at module load, not per-call
const genAI = process.env.GOOGLE_AI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
    : null;

const GEMINI_TIMEOUT_MS = 5000; // 5s hard timeout to prevent widget-render hangs

async function callGemini(prompt: string, modelName: string = 'gemini-2.0-flash', maxTokens: number = 2048): Promise<GeminiResponse> {
    if (!genAI) {
        return { text: '', error: 'GOOGLE_AI_API_KEY environment variable is not set.' };
    }

    try {
        const generatePromise = genAI.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.7,
                maxOutputTokens: maxTokens,
                responseMimeType: 'application/json',
                serviceTier: ServiceTier.FLEX,
            },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
        );
        const result = await Promise.race([generatePromise, timeoutPromise]);
        const text = result.text ?? '';
        return { text };
    } catch (err: any) {
        return { text: '', error: `Google AI Studio failed: ${err.message}` };
    }
}

// ---------------------------------------------------------------------------
// Tier 1: Mechanical slot fills (no LLM)
// ---------------------------------------------------------------------------
export interface TrendSummary {
    name: string;
    signal: number;
    stage: string;
    graphName: string;
    brands: string[];
    desc: string;
}

export async function fillSearchInsight(trends: TrendSummary[], query: string): Promise<string> {
    if (trends.length === 0) return '';

    const trendList = trends.slice(0, 6).map(t =>
        `"${t.name}" (signal:${t.signal}, ${t.stage}, brands:${t.brands.slice(0,3).join('/')||'—'})`
    ).join(', ');

    const prompt = `---
title: Search Insight Fill Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateSearchInsight
- input_query: "${query}"
- input_trends: [${trendList}]

### RULE: StyleConstraints
- The output MUST be a single, concise sentence (max 40 words) summarizing the strategic insight from the trends.
- The output MUST focus on WHAT the data reveals about the topic, not how many trends or which graphs they came from.
- The agent MUST NOT mention signal scores, trend counts, graph names, or sources.
- Write as an editorial insight, not a data description.
- Do NOT wrap the response in quotation marks.`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 256);
        if (result.text && result.text.length > 10) {
            let text = result.text;
            // Unwrap JSON — callGemini uses responseMimeType: 'application/json'
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed === 'string') {
                    text = parsed;
                } else if (typeof parsed === 'object' && parsed !== null) {
                    text = (Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 10) as string) || text;
                }
            } catch { /* not JSON, use as-is */ }
            text = text.replace(/^["']|["']$/g, '').trim();
            if (text.length > 10 && text.length < 300) return text;
        }
    } catch (err) {
        console.error('[fillSearchInsight] Gemini failed:', err);
    }

    // Fallback: simple strategic sentence without metadata
    const topTrend = trends[0];
    return `Key signal: ${topTrend?.name || query} is reshaping the landscape.`;
}

export async function fillBrandOneLiner(
    brandName: string,
    trends: { trend_name?: string; trendName?: string; signal_score?: number }[],
    velocity: string,
    topCompetitors: string[],
): Promise<string> {
    const topTrends = trends.slice(0, 4).map(t => t.trend_name || t.trendName || '').filter(Boolean);
    const trendLifecycles = trends.slice(0, 4).map(t => `${t.trend_name || t.trendName || ''} (${(t as any).lifecycle || 'building'})`).filter(Boolean);
    const compList = topCompetitors.slice(0, 3).join(', ');

    const prompt = `---
title: Brand One-Liner Fill Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateBrandOneLiner
- input_brand: "${brandName}"
- input_momentum: "${velocity}"
- input_connected_trends: [${trendLifecycles.map(t => `"${t}"`).join(', ')}]
${compList ? `- input_co_occurring: [${topCompetitors.slice(0, 3).map(c => `"${c}"`).join(', ')}]` : ''}

### RULE: ContentConstraints
- The output MUST be exactly ONE sentence (max 30 words) capturing the most interesting tension in ${brandName}'s current position.
- The output MUST name at least one specific trend from the input list.
- The output MUST state a TENSION, SHIFT, or SURPRISE — NOT a strength statement.
- IMPORTANT: input_momentum describes ${brandName}'s overall evidence velocity (volume of coverage change). Each trend has its own lifecycle stage shown in parentheses. Do NOT say a trend is "${velocity}" if that trend's lifecycle is different — instead, find the tension between them.
- BANNED words: leverages, solidifies, dominance, premiumization, platform expansion, innovative, commitment. These words MUST NOT be used.
- Write like a journalist, not a consultant.
- Return output strictly formatted as JSON matching this schema: {"one_liner":"your sentence"}`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 256);
        if (result.text && result.text.length > 10) {
            let text = result.text;
            // Unwrap JSON — callGemini uses responseMimeType: 'application/json'
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed === 'string') {
                    text = parsed;
                } else if (typeof parsed === 'object' && parsed !== null) {
                    text = (Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 10) as string) || text;
                }
            } catch { /* not JSON, use as-is */ }
            text = text.replace(/^["']|["']$/g, '').trim();
            if (text.length > 10 && text.length < 300) return text;
        }
    } catch (err) {
        console.error('[fillBrandOneLiner] Gemini failed:', err);
    }

    // Fallback
    return `${brandName} is ${velocity} across ${trends.length} trend${trends.length !== 1 ? 's' : ''} including ${topTrends[0] || 'emerging signals'}.`;
}

// ---------------------------------------------------------------------------
// Section intros — short interpretive prose for widget sections
// ---------------------------------------------------------------------------

export async function fillTrendFootprintIntro(
    brandName: string,
    trends: { trend_name?: string; trendName?: string; lifecycle?: string; graphName?: string; signal_score?: number }[],
    lifecycleDist: Record<string, number>,
): Promise<string> {
    if (trends.length === 0) return '';

    // Build a structured summary Gemini can interpret
    const trendList = trends.slice(0, 8).map(t =>
        `"${(t.trend_name || t.trendName || '').trim()}" (${t.lifecycle || '?'}, from ${t.graphName || '?'})`
    ).join('; ');
    const lcSummary = Object.entries(lifecycleDist).map(([k, v]) => `${k}: ${v}`).join(', ');
    const graphNames = [...new Set(trends.map(t => t.graphName).filter(Boolean))];
    const graphSpread = graphNames.length;

    const prompt = `---
title: Trend Footprint Intro Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateTrendFootprintIntro
- input_brand: "${brandName}"
- input_trends: "${trendList}"
- input_lifecycle_distribution: "${lcSummary}"
- input_total_trends: ${trends.length}
- input_graph_spread: "${graphNames.join(', ')}"

### RULE: InterpretationDirectives
- The output MUST be exactly 2-3 declarative and specific sentences interpreting what ${brandName}'s trend footprint reveals.
- The output MUST lead with the single most revealing pattern (e.g. fading vs building imbalance, concentration vs spread).
- The output MUST name 1-2 specific trend names from the inputs to ground the claim.
- The output MUST say something only true of THIS brand and THIS data, avoiding generic strategy language.
- The agent MUST NOT use phrases: "leverages", "solidifies dominance", "strategic push", or "commitment to".
- The agent MUST NOT mention signal scores, evidence counts, or methodology.
- Return output strictly formatted as JSON matching this schema: {"intro":"your 2-3 sentences"}`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 512);
        if (result.text) {
            let text = result.text;
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed === 'string') text = parsed;
                else if (parsed?.intro) text = parsed.intro;
                else if (typeof parsed === 'object') {
                    text = (Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 20) as string) || text;
                }
            } catch { /* not JSON */ }
            text = text.replace(/^["']|["']$/g, '').trim();
            if (text.length > 20 && text.length < 500) return text;
        }
    } catch (err) {
        console.error('[fillTrendFootprintIntro] Gemini failed:', err);
    }
    return '';
}

export async function fillMarketDataIntro(
    brandName: string,
    supplemental: { google_trends?: any; wikipedia?: any; amazon?: any; census_retail?: any },
): Promise<string> {
    // Build a concise data summary for Gemini
    // Note: supplemental API responses wrap data inside .snapshot alongside metadata
    const parts: string[] = [];
    const gtRaw = supplemental?.google_trends;
    const gt = gtRaw?.snapshot || gtRaw;  // unwrap .snapshot if present
    if (gt?.interest_over_time?.length) {
        const latest = gt.interest_over_time[gt.interest_over_time.length - 1];
        parts.push(`Google Trends: latest relative interest ${latest?.value ?? '?'}/100`);
    } else if (gt?.latest_value) {
        parts.push(`Google Trends: latest relative interest ${gt.latest_value}/100, peak: ${gt.peak_interest || '?'}`);
    }
    const wikiRaw = supplemental?.wikipedia;
    const wiki = wikiRaw?.snapshot || wikiRaw;  // unwrap .snapshot if present
    if (Array.isArray(wiki) && wiki.length > 0) {
        const brandWiki = wiki.find((w: any) => w.article?.toLowerCase().includes(brandName.toLowerCase()));
        if (brandWiki?.avg_daily_views) parts.push(`Wikipedia: ${brandWiki.avg_daily_views.toLocaleString()} avg daily pageviews`);
    } else if (wiki && typeof wiki === 'object' && !Array.isArray(wiki)) {
        const views = wiki.avg_daily_views || wiki.pageviews?.avg_daily || wiki.daily_views;
        if (views) parts.push(`Wikipedia: ${Number(views).toLocaleString()} avg daily pageviews`);
        // Try articles array nested inside snapshot
        if (!views && wiki.articles && Array.isArray(wiki.articles)) {
            const brandWiki = wiki.articles.find((w: any) => w.article?.toLowerCase().includes(brandName.toLowerCase()));
            if (brandWiki?.avg_daily_views) parts.push(`Wikipedia: ${brandWiki.avg_daily_views.toLocaleString()} avg daily pageviews`);
        }
    }
    const amzRaw = supplemental?.amazon;
    const amz = amzRaw?.snapshot || amzRaw;  // unwrap .snapshot if present
    if (amz?.product_count) {
        parts.push(`Amazon: ${amz.product_count} listings, median price ${amz?.price_range?.median || amz?.median_price || '?'}, avg rating ${amz?.average_rating || '?'}`);
    }
    const censusRaw = supplemental?.census_retail;
    const census = censusRaw?.snapshot || censusRaw;  // unwrap .snapshot if present
    if (census?.latest_value || census?.retail_sales) {
        const val = census.latest_value || census.retail_sales;
        parts.push(`US retail sales (Census): ${val}`);
    }
    console.error(`[fillMarketDataIntro] ${brandName}: parts=${parts.length}: ${parts.join(' | ')}`);
    if (parts.length === 0) return '';

    const prompt = `---
title: Market Data Intro Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateMarketDataIntro
- input_brand: "${brandName}"
- input_data: "${parts.join('. ')}"

### RULE: InterpretationDirectives
- The output MUST be exactly 2 sentences interpreting the ${brandName}'s market data signals.
- The output MUST lead with the most striking number and what it means.
- Note any surprises in the data, but the agent MUST NOT speculate about causes not present in the data.
- If comparing pageviews or search interest, note that these are attention signals that fluctuate with news cycles and avoid inferring long-term strategy from them.
- The agent MUST NOT use phrases like "solidifies market dominance" or "demonstrates strong positioning".
- Return output strictly formatted as JSON matching this schema: {"intro":"your 2 sentences"}`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 512);
        if (result.text) {
            let text = result.text;
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed === 'string') text = parsed;
                else if (parsed?.intro) text = parsed.intro;
                else if (typeof parsed === 'object') {
                    text = (Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 20) as string) || text;
                }
            } catch { /* not JSON */ }
            text = text.replace(/^["']|["']$/g, '').trim();
            if (text.length > 20 && text.length < 500) return text;
        }
    } catch (err) {
        console.error('[fillMarketDataIntro] Gemini failed:', err);
    }
    return '';
}

// ---------------------------------------------------------------------------
// Tier 2: LLM-powered analysis fills
// ---------------------------------------------------------------------------
export async function fillAnalysis(
    query: string,
    trends: TrendSummary[],
    supplementalSummary: string,
): Promise<string> {
    if (trends.length === 0) return '';

    const trendList = trends.slice(0, 8).map(t =>
        `"${t.name}" (sig:${t.signal}, ${t.stage}, brands:${t.brands.slice(0,3).join('/')||'—'}, ${t.graphName})`
    ).join('\n');

    const prompt = `---
title: Trend Analysis Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateTrendAnalysis
- input_query: "${query}"
- input_trends: "${trendList}"
${supplementalSummary ? `- input_supplemental_context: "${supplementalSummary}"` : ''}

### RULE: FormatConstraints
- The output MUST be a 3-5 paragraph analysis written from the perspective of a senior brand strategist.
- The output MUST be formatted as HTML using only <p> and <strong> tags inside the JSON.
- The agent MUST reference specific trends, brands, and scores from the inputs.
- The output MUST NOT contain filler or mention "Fodda".
- Return output strictly formatted as JSON matching this schema: {"analysis":"HTML paragraphs"}`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 1024);
        if (!result.text) {
            console.error(`[fillAnalysis] Gemini returned no text: ${result.error || 'Unknown'}`);
            return '';
        }
        const textToParse = result.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        const parsedRaw = JSON.parse(textToParse);
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        return parsed.analysis || parsed.analysis_html || parsed.body || parsed.text || '';
    } catch (err: any) {
        console.error(`[fillAnalysis] Gemini analysis failed: ${err.message}`);
        return '';
    }
}

export async function fillBrandVerdict(
    brandName: string,
    trendSummary: string,
    competitorList: string,
    supplementalSummary: string,
): Promise<{ title: string; body: string; competitive_insight: string }> {
    const prompt = `---
title: Brand Verdict Prompt
compliance: RFC-2119
---

### FUNCTION: GenerateBrandVerdict
- input_brand: "${brandName}"
- input_trends: "${trendSummary}"
- input_competitors: "${competitorList}"
${supplementalSummary ? `- input_supplemental_context: "${supplementalSummary}"` : ''}

### RULE: ContentConstraints
- The output MUST be a specific brand intelligence verdict.
- Return output strictly formatted as JSON matching this schema:
  {
    "verdict_title": "4-8 word headline",
    "verdict_body": "<p>2-3 paragraphs with <strong></p>",
    "competitive_insight": "2-3 sentences comparing against competitors"
  }
- The output MUST NOT mention "Fodda".`;

    try {
        const result = await callGemini(prompt, 'gemini-2.0-flash', 1024);
        if (!result.text) {
            console.error(`[fillBrandVerdict] Gemini returned no text: ${result.error || 'Unknown'}`);
            return { title: '', body: '', competitive_insight: '' };
        }
        const textToParse = result.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        const parsedRaw = JSON.parse(textToParse);
        const parsed = Array.isArray(parsedRaw) ? parsedRaw[0] : parsedRaw;
        return {
            title: parsed.verdict_title || parsed.verdictTitle || parsed.title || '',
            body: parsed.verdict_body || parsed.verdictBody || parsed.verdict_content || parsed.verdictContent || parsed.body || parsed.content || parsed.verdict || parsed.text || parsed.analysis || parsed.summary || parsed.description ||
                // Ultimate fallback: find the longest string value in the object (skip the title)
                (() => {
                    const titleVal = parsed.verdict_title || parsed.verdictTitle || parsed.title || '';
                    const longest = Object.values(parsed)
                        .filter((v): v is string => typeof v === 'string' && v !== titleVal && v.length > 20)
                        .sort((a, b) => b.length - a.length)[0];
                    return longest || '';
                })(),
            competitive_insight: parsed.competitive_insight || parsed.competitiveInsight || parsed.insight || '',
        };
    } catch (err: any) {
        console.error(`[fillBrandVerdict] Gemini brand verdict failed: ${err.message}`);
        return { title: '', body: '', competitive_insight: '' };
    }
}

// ---------------------------------------------------------------------------
// Main entry: fill all slots in a template string
// ---------------------------------------------------------------------------
export function replaceSlots(template: string, fills: Record<string, string>): string {
    let result = template;
    for (const [slot, value] of Object.entries(fills)) {
        if (value !== undefined && value !== null) {
            result = result.replace(`{{${slot}}}`, value);
        }
    }
    return result;
}
