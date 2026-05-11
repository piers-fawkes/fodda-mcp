/**
 * Editorial Fill — Server-side slot population for widget templates
 *
 * Tier 1: Simple slots filled mechanically from data (no LLM, instant)
 * Tier 2: Analysis slots filled via Vertex AI Gemini (LLM, ~1-2s)
 *
 * Fallback: If LLM call fails, returns template with {{SLOT}} intact
 * for Claude to fill client-side.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Google AI Studio — Gemini (singleton SDK + model cache)
// ---------------------------------------------------------------------------
interface GeminiResponse {
    text: string;
    error?: string;
}

// Singleton: instantiate SDK once at module load, not per-call
const genAI = process.env.GOOGLE_AI_API_KEY
    ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
    : null;

// Cache model instances by name — avoids re-creating on every call
const modelCache = new Map<string, any>();
function getModel(modelName: string) {
    if (!genAI) return null;
    let model = modelCache.get(modelName);
    if (!model) {
        model = genAI.getGenerativeModel({ model: modelName });
        modelCache.set(modelName, model);
    }
    return model;
}

const GEMINI_TIMEOUT_MS = 5000; // 5s hard timeout to prevent widget-render hangs

async function callGemini(prompt: string, modelName: string = 'gemini-2.0-flash', maxTokens: number = 2048): Promise<GeminiResponse> {
    const model = getModel(modelName);
    if (!model) {
        return { text: '', error: 'GOOGLE_AI_API_KEY environment variable is not set.' };
    }

    try {
        const generatePromise = model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: maxTokens,
                responseMimeType: 'application/json',
            }
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
        );
        const result = await Promise.race([generatePromise, timeoutPromise]);
        const text = result.response.text();
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

    const prompt = `You are a senior trend analyst. Write a single concise sentence (max 40 words) summarizing the strategic insight from these trends for the query "${query}".

Trends: ${trendList}

Rules:
- Focus on WHAT the data reveals about the topic, not how many trends or which graphs they came from
- Do NOT mention signal scores, trend counts, graph names, or sources
- Write as editorial insight, not data description
- No quotes around your response`;

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
    const compList = topCompetitors.slice(0, 3).join(', ');

    const prompt = `Write ONE sentence (max 30 words) capturing the most interesting tension in ${brandName}'s current position.

Data from Fodda knowledge graphs:
- Momentum: ${velocity}
- Connected trends: ${topTrends.join(', ')}
${compList ? `- Co-occurring with: ${compList}` : ''}

Rules:
- Name at least one specific trend from the list
- State a TENSION, SHIFT, or SURPRISE — not a strength statement
- BANNED words: leverages, solidifies, dominance, premiumization, platform expansion, innovative, commitment
- Write like a journalist, not a consultant
- Return JSON: {"one_liner":"your sentence"}`;

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
    return `${brandName} is ${velocity} across ${topTrends[0] || 'emerging trends'}.`;
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

    const prompt = `You are a senior brand analyst writing for a Fodda Brand Intelligence report. Write exactly 2-3 sentences interpreting what ${brandName}'s trend footprint reveals. Be declarative and specific.

Data:
- Trends connected to ${brandName}: ${trendList}
- Lifecycle distribution: ${lcSummary} (total: ${trends.length})
- Spread across ${graphSpread} knowledge graph${graphSpread !== 1 ? 's' : ''}: ${graphNames.join(', ')}

Your interpretation MUST:
1. Lead with the single most revealing pattern — for example: Is the brand mostly fading or building? Is there an imbalance (e.g., 5 fading vs 2 emerging)? Is the brand concentrated in one graph or spread wide?
2. Name 1-2 specific trend names to ground your claim (e.g., "${brandName}'s connection to [trend name] suggests...")
3. Say something only true of THIS brand and THIS data — not generic strategy language
4. Do NOT use phrases like "leverages", "solidifies dominance", "strategic push", or "commitment to"
5. Do NOT mention signal scores, evidence counts, or methodology

Return JSON: {"intro":"your 2-3 sentences"}`;

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

    const prompt = `Write exactly 2 sentences interpreting ${brandName}'s market data signals for a brand intelligence report.

Data: ${parts.join('. ')}

Rules:
1. Lead with the most striking number and what it means
2. Note any surprises (e.g., unexpectedly low/high) but do NOT speculate about causes you can't see in the data
3. If comparing pageviews or search interest, note these are attention signals that fluctuate with news cycles — avoid inferring long-term strategy from them
4. Do NOT use phrases like "solidifies market dominance" or "demonstrates strong positioning"

Return JSON: {"intro":"your 2 sentences"}`;

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

    const prompt = `Senior brand strategist. Write 3-5 paragraph analysis for: "${query}"

Data:\n${trendList}\n${supplementalSummary ? `Context: ${supplementalSummary}` : ''}

Return JSON: {"analysis":"<p>...</p><p>...</p>"}
Use <p> and <strong>. Reference specific trends/brands/scores. No filler. No mention of Fodda.`;

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
    const prompt = `Senior strategist. Write Brand Intelligence verdict for "${brandName}".

Trends: ${trendSummary}
Competitors: ${competitorList}
${supplementalSummary ? `Context: ${supplementalSummary}` : ''}

Return JSON: {"verdict_title":"4-8 word headline","verdict_body":"<p>2-3 paragraphs with <strong></p>","competitive_insight":"2-3 sentences vs competitors"}
Be specific. No mention of Fodda.`;

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
