/**
 * Query Pricing Cache — provides fixed-price lookup per query type.
 *
 * Phase 1: Uses hardcoded pricing defaults (no Airtable dependency).
 * Phase 2: Fetches from Airtable "Query Pricing" table, refreshes hourly.
 *
 * Follows the same fetch-and-cache pattern as catalogCache.ts.
 *
 * Pricing model:
 *   - API Call = the atomic billing unit (1 foddaRequest = 1 API call)
 *   - Query  = MCP-level task (1 Query = N API calls, fixed per query type)
 *   - Plans are denominated in API calls
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryPricing {
    queryTypeCode: string;
    queryTypeName: string;
    apiCallsCharged: number;
    researchCalls: number;
    overheadCalls: number;
    mcpToolName: string;
    meterInteractionType: string | null;
    isActive: boolean;
    includesSupplementals: boolean;
    absorbsGeminiCost: boolean;
}

// ---------------------------------------------------------------------------
// Hardcoded Defaults (used until Airtable table is created)
// ---------------------------------------------------------------------------

const DEFAULT_PRICING: QueryPricing[] = [
    {
        queryTypeCode: 'topic_research',
        queryTypeName: 'Topic Research',
        apiCallsCharged: 15,
        researchCalls: 8,
        overheadCalls: 3,
        mcpToolName: 'search_graph',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'brand_intelligence',
        queryTypeName: 'Brand Intelligence Tracker',
        apiCallsCharged: 20,
        researchCalls: 10,
        overheadCalls: 3,
        mcpToolName: 'brand_tracker',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'weekly_tracker',
        queryTypeName: 'Weekly Tracker',
        apiCallsCharged: 20,
        researchCalls: 12,
        overheadCalls: 3,
        mcpToolName: 'manage_scheduled_reports',
        meterInteractionType: 'scheduled_analyst',
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'deep_research_light',
        queryTypeName: 'Deep Research (Light)',
        apiCallsCharged: 20,
        researchCalls: 10,
        overheadCalls: 3,
        mcpToolName: 'deep_research_topic',
        meterInteractionType: 'deep_dive_fast',
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: true,
    },
    {
        queryTypeCode: 'deep_research_heavy',
        queryTypeName: 'Deep Research (Heavy)',
        apiCallsCharged: 30,
        researchCalls: 15,
        overheadCalls: 3,
        mcpToolName: 'deep_research_topic',
        meterInteractionType: 'deep_dive_comprehensive',
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: true,
    },
    {
        queryTypeCode: 'brainstorm',
        queryTypeName: 'Brainstorm',
        apiCallsCharged: 15,
        researchCalls: 8,
        overheadCalls: 3,
        mcpToolName: 'brainstorm_topic',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'url_as_prompt',
        queryTypeName: 'URL as Prompt',
        apiCallsCharged: 15,
        researchCalls: 10,
        overheadCalls: 3,
        mcpToolName: 'read_url',
        meterInteractionType: 'url_context',
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: true,
    },
    {
        queryTypeCode: 'upload_compare',
        queryTypeName: 'Upload & Compare',
        apiCallsCharged: 20,
        researchCalls: 8,
        overheadCalls: 3,
        mcpToolName: 'search_graph',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: true,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'visual',
        queryTypeName: 'Visual Intelligence',
        apiCallsCharged: 0,
        researchCalls: 0,
        overheadCalls: 0,
        mcpToolName: 'generate_visual',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'admin',
        queryTypeName: 'Account / Admin',
        apiCallsCharged: 0,
        researchCalls: 0,
        overheadCalls: 0,
        mcpToolName: 'get_my_account',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'standalone_supplemental',
        queryTypeName: 'Standalone Supplemental',
        apiCallsCharged: 5,
        researchCalls: 5,  // fan-out to 3-8 sources, avg ~5
        overheadCalls: 0,
        mcpToolName: 'get_supplemental_context',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'standalone_evidence',
        queryTypeName: 'Evidence Lookup',
        apiCallsCharged: 5,
        researchCalls: 1,
        overheadCalls: 0,
        mcpToolName: 'get_evidence',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'standalone_statistics',
        queryTypeName: 'Statistics Search',
        apiCallsCharged: 5,
        researchCalls: 1,
        overheadCalls: 0,
        mcpToolName: 'search_statistics',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'research_chat',
        queryTypeName: 'Research Chat',
        apiCallsCharged: 3,
        researchCalls: 2,
        overheadCalls: 1,
        mcpToolName: '',  // App only
        meterInteractionType: 'research_chat',
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'expert_agent',
        queryTypeName: 'Expert Agent',
        apiCallsCharged: 5,
        researchCalls: 4,
        overheadCalls: 1,
        mcpToolName: '',  // App only
        meterInteractionType: 'expert_agent',
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
    {
        queryTypeCode: 'earnings_intelligence',
        queryTypeName: 'Earnings Intelligence',
        apiCallsCharged: 5,
        researchCalls: 1,
        overheadCalls: 0,
        mcpToolName: 'get_earnings_intelligence',
        meterInteractionType: null,
        isActive: true,
        includesSupplementals: false,
        absorbsGeminiCost: false,
    },
];

// ---------------------------------------------------------------------------
// Cache State
// ---------------------------------------------------------------------------

let pricingMap: Map<string, QueryPricing> = new Map();
let lastFetchedAt: number = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// Environment variable for Airtable direct fetch (Phase 2)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appXUeeWN1uD9NdCW';
const PRICING_TABLE_ID = process.env.PRICING_TABLE_ID || 'tblHsMfyoW39LqCv8';
const PRICING_REFRESH_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the pricing cache. Call once at server startup.
 * Loads hardcoded defaults immediately, then attempts Airtable fetch if configured.
 */
export async function initPricingCache(): Promise<void> {
    // Always start with hardcoded defaults
    loadDefaults();
    console.error(`[pricingCache] Loaded ${pricingMap.size} query types from hardcoded defaults`);

    // If Airtable is configured, try to fetch live pricing
    if (AIRTABLE_API_KEY && PRICING_TABLE_ID) {
        try {
            await fetchFromAirtable();
            console.error(`[pricingCache] Overrode with ${pricingMap.size} query types from Airtable`);
        } catch (err: any) {
            console.error(`[pricingCache] Airtable fetch failed — using hardcoded defaults: ${err.message}`);
        }

        // Refresh hourly in the background
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(async () => {
            try {
                await fetchFromAirtable();
                console.error(`[pricingCache] Refreshed pricing from Airtable — ${pricingMap.size} query types`);
            } catch {
                console.error('[pricingCache] Background refresh failed — keeping current cache');
            }
        }, PRICING_REFRESH_MS);
    }
}

/**
 * Load hardcoded defaults into the pricing map.
 */
function loadDefaults(): void {
    pricingMap.clear();
    for (const p of DEFAULT_PRICING) {
        pricingMap.set(p.queryTypeCode, p);
    }
    lastFetchedAt = Date.now();
}

/**
 * Fetch pricing from Airtable Query Pricing table.
 * Phase 2 — only runs if AIRTABLE_API_KEY and PRICING_TABLE_ID are set.
 */
async function fetchFromAirtable(): Promise<void> {
    const axios = (await import('axios')).default;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PRICING_TABLE_ID}`;

    const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
        params: { 'filterByFormula': '{isActive}' },
        timeout: 10000,
    });

    const records = response.data.records || [];
    const newMap = new Map<string, QueryPricing>();

    for (const record of records) {
        const fields = record.fields;
        const code = fields.queryTypeCode;
        if (!code) continue;

        newMap.set(code, {
            queryTypeCode: code,
            queryTypeName: fields.queryTypeName || code,
            apiCallsCharged: fields.apiCallsCharged ?? 0,
            researchCalls: fields.researchCalls ?? 0,
            overheadCalls: fields.overheadCalls ?? 0,
            mcpToolName: fields.mcpToolName || '',
            meterInteractionType: fields.meterInteractionType || null,
            isActive: fields.isActive !== false,
            includesSupplementals: fields.includesSupplementals === true,
            absorbsGeminiCost: fields.absorbsGeminiCost === true,
        });
    }

    if (newMap.size > 0) {
        pricingMap = newMap;
        lastFetchedAt = Date.now();
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the API call price for a query type.
 * Returns 0 if the query type is unknown or inactive.
 */
export function getQueryPrice(queryTypeCode: string): number {
    const pricing = pricingMap.get(queryTypeCode);
    if (!pricing || !pricing.isActive) return 0;
    return pricing.apiCallsCharged;
}

/**
 * Get full pricing details for a query type.
 * Returns null if not found.
 */
export function getQueryPricing(queryTypeCode: string): QueryPricing | null {
    return pricingMap.get(queryTypeCode) || null;
}

/**
 * Get the query type code for a given MCP tool name.
 * Returns null if no matching query type is found.
 *
 * Note: Some tools map to multiple query types (e.g., deep_research_topic
 * maps to both deep_research_light and deep_research_heavy).
 * Use getQueryTypeForTool() for the default, or specify the exact code.
 */
export function getQueryTypeForTool(toolName: string): string | null {
    for (const [code, pricing] of pricingMap.entries()) {
        if (pricing.mcpToolName === toolName && pricing.isActive) {
            return code;
        }
    }
    return null;
}

/**
 * Get the meter interaction type for a query type.
 * Used when calling POST /v1/research/meter.
 */
export function getMeterInteractionType(queryTypeCode: string): string | null {
    const pricing = pricingMap.get(queryTypeCode);
    return pricing?.meterInteractionType || null;
}

/**
 * Get all active pricing entries.
 * Useful for system prompt generation or debugging.
 */
export function getAllPricing(): QueryPricing[] {
    return Array.from(pricingMap.values()).filter(p => p.isActive);
}

/**
 * Compact tool→cost summary for surfacing to the agent/user (system prompt,
 * get_my_account). Sourced from the same pricing table so it never drifts.
 * Only billable tools (cost > 0) with a real MCP tool name.
 */
export function getToolCostSummary(): Array<{ tool: string; name: string; apiCalls: number }> {
    return getAllPricing()
        .filter(p => p.apiCallsCharged > 0 && !!p.mcpToolName)
        .map(p => ({ tool: p.mcpToolName, name: p.queryTypeName, apiCalls: p.apiCallsCharged }));
}

/**
 * Check if the pricing cache has been loaded (from either defaults or Airtable).
 */
export function isPricingLoaded(): boolean {
    return pricingMap.size > 0;
}

/**
 * Get cache metadata for debugging.
 */
export function getPricingCacheInfo(): { source: string; count: number; lastFetchedAt: number } {
    return {
        source: (AIRTABLE_API_KEY && PRICING_TABLE_ID) ? 'airtable' : 'hardcoded',
        count: pricingMap.size,
        lastFetchedAt,
    };
}

// ---------------------------------------------------------------------------
// Query-Level Billing
// ---------------------------------------------------------------------------

export interface ChargeQueryParams {
    queryTypeCode: string;
    apiKey: string;
    userId: string;
    query?: string;
    graphsSearched?: string[];
    /** When set, this is an anonymous SPT session — settle by charging the SPT, not credits. */
    spt?: string | undefined;
    /** foddaRequest function — injected from index.ts to avoid circular deps */
    foddaRequest: (method: 'GET' | 'POST', path: string, apiKey: string, userId: string, body?: any, requestId?: string, source?: string, spt?: string) => Promise<any>;
}

export interface ChargeQueryResult {
    charged: boolean;
    apiCallsCharged: number;
    apiCallsRemaining?: number;
    error?: string;
}

/**
 * Charge a fixed-price query fee via POST /v1/research/meter.
 *
 * Call this ONCE at the end of each query completion.
 * The X-Fodda-Billing header on foddaRequest() prevents per-call billing,
 * so this is the only debit that hits the user's account.
 *
 * For free query types (visual, admin) — returns immediately, no API call.
 * For trial users — increments trial usage instead.
 * For paid users — fires the meter call (fire-and-forget, non-blocking).
 */
export async function chargeQuery(params: ChargeQueryParams): Promise<ChargeQueryResult> {
    const { queryTypeCode, apiKey, userId, query, graphsSearched, foddaRequest, spt } = params;

    const price = getQueryPrice(queryTypeCode);

    // Free query types — no charge
    if (price === 0) {
        return { charged: false, apiCallsCharged: 0 };
    }

    // All accounts (paid and new individual trial planCode 13) use the meter endpoint.
    // sk_trial_ specific Firestore metering removed — those keys are retired.
    const meterBody: Record<string, any> = {
        type: queryTypeCode,
        billable_units: price,
    };
    if (query) meterBody.query = query;
    if (graphsSearched?.length) meterBody.graphs_searched = graphsSearched;

    // Stable per-query idempotency key — reused across retries so the API's
    // /v1/research/meter dedupe (keyed on X-Request-Id) never double-debits.
    const meterRequestId = `meter_${queryTypeCode}_${randomUUID()}`;
    const MAX_ATTEMPTS = 3;
    let lastErr: any;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const result = await foddaRequest('POST', '/v1/research/meter', apiKey, userId, meterBody, meterRequestId, undefined, spt);
            const remaining = result?.usage?.api_calls_remaining ?? result?.usage?.remaining;
            if (result?.idempotent_replay) {
                console.error(`[chargeQuery] Meter replay (already charged) for ${queryTypeCode} [${meterRequestId}].`);
            } else {
                console.error(`[chargeQuery] Charged ${price} API calls for ${queryTypeCode} [${meterRequestId}]. Remaining: ${remaining ?? 'unknown'}`);
            }
            return { charged: true, apiCallsCharged: price, apiCallsRemaining: remaining };
        } catch (err: any) {
            lastErr = err;
            console.error(`[chargeQuery] Meter attempt ${attempt}/${MAX_ATTEMPTS} failed for ${queryTypeCode} [${meterRequestId}]: ${err.message}`);
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            }
        }
    }

    // All attempts failed — non-blocking (don't fail the user's query), but logged
    // with the request id for reconciliation against the API's meter_idempotency records.
    console.error(`[chargeQuery] METER LOST after ${MAX_ATTEMPTS} attempts for ${queryTypeCode} [${meterRequestId}] — query uncharged. Last error: ${lastErr?.message}`);
    return { charged: false, apiCallsCharged: 0, error: lastErr?.message };
}
