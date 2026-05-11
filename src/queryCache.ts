/**
 * Query-Result Cache — LRU in-memory cache for Fodda API responses.
 *
 * Eliminates redundant API calls when the same query is repeated within
 * the TTL window. Keyed by method + path + body hash so identical
 * requests always hit the same cache entry.
 *
 * TTL tiers:
 *   - search results:    5 minutes  (graph data updates infrequently)
 *   - supplemental data: 15 minutes (institutional sources change rarely)
 *   - evidence/neighbors: 30 minutes (static once ingested)
 *   - brand-intelligence: 5 minutes  (aggregated, same as search)
 */
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 500;

/** TTL in milliseconds by path pattern. First match wins. */
const TTL_RULES: { pattern: RegExp; ttlMs: number; label: string }[] = [
    { pattern: /\/evidence$/,              ttlMs: 30 * 60 * 1000, label: 'evidence' },
    { pattern: /\/neighbors$/,             ttlMs: 30 * 60 * 1000, label: 'neighbors' },
    { pattern: /\/supplemental\//,         ttlMs: 15 * 60 * 1000, label: 'supplemental' },
    { pattern: /\/brand-intelligence\//,   ttlMs: 5 * 60 * 1000,  label: 'brand-intelligence' },
    { pattern: /\/search$/,                ttlMs: 5 * 60 * 1000,  label: 'search' },
    { pattern: /\/label-values$/,          ttlMs: 30 * 60 * 1000, label: 'label-values' },
    { pattern: /\/adjacent$/,              ttlMs: 15 * 60 * 1000, label: 'adjacent' },
    { pattern: /\/overview$/,              ttlMs: 5 * 60 * 1000,  label: 'overview' },
    { pattern: /\/statistics\/search$/,    ttlMs: 10 * 60 * 1000, label: 'statistics' },
    { pattern: /\/insights\/search$/,      ttlMs: 10 * 60 * 1000, label: 'insights' },
];

/** Paths that should NEVER be cached (dynamic, auth-dependent, or side-effectful). */
const UNCACHEABLE_PATTERNS: RegExp[] = [
    /\/v1\/graphs$/,        // list_graphs — already cached by catalogCache
    /\/widget\//,           // widget serving
    /\/register$/,          // OAuth
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
    data: any;
    createdAt: number;
    ttlMs: number;
    label: string;
    hitCount: number;
    lastAccessedAt: number;
}

// ---------------------------------------------------------------------------
// Cache store
// ---------------------------------------------------------------------------

const cache = new Map<string, CacheEntry>();

// Stats for monitoring
let stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    stores: 0,
};

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Build a deterministic cache key from the request signature.
 * Uses raw string for small payloads (< 200 chars) to avoid crypto overhead.
 * Falls back to SHA-256 for large POST bodies where the raw key would be unwieldy.
 */
function buildCacheKey(method: string, path: string, body?: any): string {
    const bodyStr = body ? JSON.stringify(body) : '';
    const raw = `${method}:${path}:${bodyStr}`;
    // Skip SHA-256 for small keys — most GET requests and light POST bodies
    if (raw.length < 200) return raw;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// TTL resolution
// ---------------------------------------------------------------------------

function resolveTTL(path: string): { ttlMs: number; label: string } | null {
    for (const rule of TTL_RULES) {
        if (rule.pattern.test(path)) {
            return { ttlMs: rule.ttlMs, label: rule.label };
        }
    }
    return null; // No matching rule — don't cache
}

function isCacheable(path: string): boolean {
    if (UNCACHEABLE_PATTERNS.some(p => p.test(path))) return false;
    return resolveTTL(path) !== null;
}

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

/**
 * Evict the least-recently-accessed entry when cache is full.
 * Also prunes expired entries opportunistically.
 */
function evictIfNeeded(): void {
    const now = Date.now();

    // First pass: prune expired entries
    for (const [key, entry] of cache) {
        if (now - entry.createdAt > entry.ttlMs) {
            cache.delete(key);
            stats.evictions++;
        }
    }

    // If still over limit, evict LRU
    while (cache.size >= MAX_ENTRIES) {
        let oldestKey: string | null = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of cache) {
            if (entry.lastAccessedAt < oldestAccess) {
                oldestAccess = entry.lastAccessedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            cache.delete(oldestKey);
            stats.evictions++;
        } else {
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a cached response. Returns the cached data or null if miss/expired.
 */
export function cacheGet(method: string, path: string, body?: any): any | null {
    if (!isCacheable(path)) return null;

    const key = buildCacheKey(method, path, body);
    const entry = cache.get(key);

    if (!entry) {
        stats.misses++;
        return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
        cache.delete(key);
        stats.misses++;
        return null;
    }

    // Cache hit
    entry.hitCount++;
    entry.lastAccessedAt = Date.now();
    stats.hits++;
    console.error(`[queryCache] HIT (${entry.label}) ${method} ${path} — hit #${entry.hitCount}, age ${Math.round((Date.now() - entry.createdAt) / 1000)}s`);
    return entry.data;
}

/**
 * Store a response in the cache.
 */
export function cacheSet(method: string, path: string, body: any | undefined, data: any): void {
    if (!isCacheable(path)) return;

    const ttlInfo = resolveTTL(path);
    if (!ttlInfo) return;

    evictIfNeeded();

    const key = buildCacheKey(method, path, body);
    const now = Date.now();
    cache.set(key, {
        data,
        createdAt: now,
        ttlMs: ttlInfo.ttlMs,
        label: ttlInfo.label,
        hitCount: 0,
        lastAccessedAt: now,
    });
    stats.stores++;
    console.error(`[queryCache] STORE (${ttlInfo.label}) ${method} ${path} — TTL ${Math.round(ttlInfo.ttlMs / 1000)}s, cache size: ${cache.size}`);
}

/**
 * Get cache statistics for monitoring/logging.
 */
export function getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    stores: number;
    hitRate: string;
    entriesByType: Record<string, number>;
} {
    const entriesByType: Record<string, number> = {};
    for (const entry of cache.values()) {
        entriesByType[entry.label] = (entriesByType[entry.label] || 0) + 1;
    }

    const total = stats.hits + stats.misses;
    return {
        size: cache.size,
        hits: stats.hits,
        misses: stats.misses,
        evictions: stats.evictions,
        stores: stats.stores,
        hitRate: total > 0 ? `${Math.round((stats.hits / total) * 100)}%` : '0%',
        entriesByType,
    };
}

/**
 * Clear all cache entries. Useful for testing or manual reset.
 */
export function clearCache(): void {
    cache.clear();
    stats = { hits: 0, misses: 0, evictions: 0, stores: 0 };
    console.error('[queryCache] Cache cleared');
}
