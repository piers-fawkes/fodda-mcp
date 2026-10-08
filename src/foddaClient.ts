/**
 * Fodda API Client Helpers & HMAC Request Routing
 *
 * Centralizes authenticated, signed HTTP requests to the Fodda API.
 * Prevents circular imports between index.ts, toolHandlers.ts, and skillClient.ts.
 */
import crypto from 'crypto';
import axios from 'axios';
import { cacheGet, cacheSet, getCacheStats, cacheClear, clearCache } from './queryCache.js';
import * as queryCache from './queryCache.js';

export const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';
export const WEBSITE_BASE_URL = process.env.WEBSITE_BASE_URL || 'https://www.fodda.ai';

// ---------------------------------------------------------------------------
// User ID normalization
// ---------------------------------------------------------------------------

export const PLACEHOLDER_USER_IDS = new Set(['', 'anonymous', 'undefined', 'null', 'oauth_user']);

export function isPlaceholderUserId(id?: string | null): boolean {
    if (!id || typeof id !== 'string') return true;
    return PLACEHOLDER_USER_IDS.has(id.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Client slug normalization
// ---------------------------------------------------------------------------

/**
 * Normalize clientInfo from MCP initialize handshake to a short, canonical slug.
 * E.g. Claude Desktop -> claude-desktop, Cursor -> cursor, VS Code -> vscode.
 */
export function normalizeClientSlug(name?: string, version?: string): string {
    if (!name || typeof name !== 'string') return '';
    const lower = name.toLowerCase().trim();
    if (lower.includes('claude desktop') || lower.includes('claude-desktop') || lower.includes('claude for desktop')) {
        return 'claude-desktop';
    }
    if (lower.includes('claude code') || lower.includes('claude-code')) {
        return 'claude-code';
    }
    if (lower === 'claude' || lower.includes('claude.ai') || lower.startsWith('claude')) {
        return 'claude';
    }
    if (lower.includes('cursor')) {
        return 'cursor';
    }
    if (lower.includes('visual studio code') || lower.includes('vscode')) {
        return 'vscode';
    }
    if (lower.includes('windsurf')) {
        return 'windsurf';
    }
    if (lower.includes('chatgpt') || lower.includes('openai')) {
        return 'chatgpt';
    }
    if (lower.includes('zed')) {
        return 'zed';
    }
    if (lower.includes('librechat')) {
        return 'librechat';
    }
    if (lower.includes('roo-code') || lower.includes('roo code') || lower.includes('roocode')) {
        return 'roo-code';
    }
    if (lower.includes('cline')) {
        return 'cline';
    }
    return lower.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export const cleanClientSlug = normalizeClientSlug;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export { cacheGet, cacheSet, getCacheStats, cacheClear, clearCache, queryCache };

export interface WidgetCacheEntry {
    html: string;
    createdAt: number;
}

export const widgetCache = new Map<string, WidgetCacheEntry>();
export const WIDGET_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function storeWidget(html: string): string {
    const id = crypto.randomUUID();
    widgetCache.set(id, { html, createdAt: Date.now() });
    return id;
}

// ---------------------------------------------------------------------------
// Authenticated API caller — checks query cache first
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Fodda API.
 * Checks the query cache first; stores responses on cache miss.
 */
export async function foddaRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string,
    source?: string,
    spt?: string,
    client?: string
): Promise<any> {
    // ── Cache check ──
    const cached = cacheGet(method, path, body);
    if (cached !== null) return cached;

    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Billing': 'mcp-orchestrated',  // Tells API to skip per-call billing — MCP charges lump sum via meter
        'Content-Type': 'application/json',
    };
    // Never send placeholder user IDs upstream — let the API's account-label fallback apply
    if (userId && !isPlaceholderUserId(userId)) {
        headers['X-User-Id'] = userId;
        if (userId.includes('@')) {
            headers['X-User-Email'] = userId;
        }
    } else if (body && typeof body === 'object') {
        const declaredEmail = body.email || body.userEmail || body.expertEmail;
        if (declaredEmail && typeof declaredEmail === 'string' && declaredEmail.includes('@')) {
            headers['X-User-Id'] = declaredEmail;
            headers['X-User-Email'] = declaredEmail;
        }
    }
    // SPT settlement: the Shared Payment Token is the payer (Authorization Bearer), no X-API-Key.
    if (spt) {
        headers['Authorization'] = `Bearer ${spt}`;
    } else if (apiKey) {
        headers['X-API-Key'] = apiKey;
    } else {
        // Allow pre-key onboarding tools to communicate with Fodda backend
        headers['X-Onboarding-Session'] = 'pre_auth_mcp';
    }
    if (requestId) headers['X-Request-Id'] = requestId;
    if (source) {
        headers['X-Fodda-Source'] = source;
    } else if (headers['X-Onboarding-Session'] === 'pre_auth_mcp' || (body && typeof body === 'object' && body.intakeSource === 'mcp_conversational')) {
        headers['X-Fodda-Source'] = 'onboarding';
    }
    if (client) headers['X-Fodda-Client'] = client;

    // HMAC sign the request
    const secret = process.env.FODDA_MCP_SECRET;
    if (secret) {
        const payload = (method === 'POST' || method === 'PATCH')
            ? timestamp + '.' + JSON.stringify(body ?? {})
            : timestamp + '.' + path;
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        headers['X-Fodda-Signature'] = signature;
    }

    const baseUrl = path.startsWith('/api/') ? (process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL) : (process.env.FODDA_API_URL || API_BASE_URL);
    const url = `${baseUrl}${path}`;
    // Base timeout: 30s aligns with MCP client expectations.
    // Extended to 90s for analyst and human agent consults, verify/claim, and intelligence routes, and 35s for supplemental.
    const AXIOS_TIMEOUT_MS = /(\/analysts\/consult|\/human-agents\/consult|\/verify\/|\/intelligence\/)/.test(path)
        ? 90000
        : /\/supplemental\//.test(path)
        ? 35000
        : 30000;
    const response = method === 'GET'
        ? await axios.get(url, { headers, timeout: AXIOS_TIMEOUT_MS })
        : method === 'PATCH'
        ? await axios.patch(url, body ?? {}, { headers, timeout: AXIOS_TIMEOUT_MS })
        : await axios.post(url, body ?? {}, { headers, timeout: AXIOS_TIMEOUT_MS });

    // ── Cache store ──
    cacheSet(method, path, body, response.data);

    // ── Inject upstream usage warning headers into response data ──
    // The app returns X-Usage-Warning / X-Usage-Percent / X-Usage-Overage-Tokens
    // on successful responses to indicate approaching-limit or overage-active status.
    const usageWarningHeader = response.headers?.['x-usage-warning'];
    if (usageWarningHeader && response.data && typeof response.data === 'object') {
        response.data._upstream_usage = {
            warning: usageWarningHeader,  // 'approaching-limit' or 'overage-active'
        };
        const pct = response.headers['x-usage-percent'];
        if (pct) response.data._upstream_usage.percent = parseInt(pct, 10);
        const overageTokens = response.headers['x-usage-overage-tokens'];
        if (overageTokens) response.data._upstream_usage.overage_tokens = parseInt(overageTokens, 10);
        const dailyRemaining = response.headers['x-usage-daily-remaining'];
        if (dailyRemaining) response.data._upstream_usage.daily_remaining = parseInt(dailyRemaining, 10);
        const dailyCalls = response.headers['x-usage-daily-calls'];
        if (dailyCalls) response.data._upstream_usage.daily_calls = parseInt(dailyCalls, 10);
    }

    // ── Billing-mode trust check (Option C) ──
    // Every MCP request claims mcp-orchestrated; the API echoes the EFFECTIVE mode.
    // If it returns 'per-call', the API did NOT trust our HMAC → the user is billed
    // per-call AND will be metered = double-charge. Surface loudly (don't suppress
    // silently — under correct Option C this should never fire, so it means a real
    // regression: FODDA_MCP_SECRET parity or signing drift).
    const effectiveBillingMode = response.headers?.['x-fodda-billing-mode']
        || (response.data && typeof response.data === 'object' ? response.data?.usage?.billing_mode : undefined);
    if (effectiveBillingMode === 'per-call') {
        console.error(`[foddaRequest] ⚠️ DOUBLE-CHARGE RISK: ${method} ${path} returned billing_mode='per-call' despite mcp-orchestrated — API did not trust the MCP HMAC. Check FODDA_MCP_SECRET parity.`);
    }

    return response.data;
}
