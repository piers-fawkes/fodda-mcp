/**
 * Session & OAuth Token Store — Persistent storage for MCP sessions and OAuth tokens.
 *
 * Backed by Cloud Firestore with an in-memory L1 cache.
 * Ensures sessions and OAuth token resolutions survive container restarts, redeployments,
 * and multi-instance Cloud Run scaling without forcing clients into re-authentication loops.
 */

import { Firestore } from '@google-cloud/firestore';

export interface StoredSession {
    sessionId: string;
    apiKey: string;
    userId: string;
    source?: string | undefined;
    clientSlug?: string | undefined;
    offeringSlug?: string | undefined;
    createdAt: number;
    updatedAt: number;
}

export interface StoredOAuthToken {
    apiKey: string;
    userId: string;
    expiresAt: number;
}

const SESSIONS_COLLECTION = 'mcp_sessions';
const OAUTH_TOKENS_COLLECTION = 'mcp_oauth_tokens';
const DEFAULT_OAUTH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;         // 7 days

// In-memory L1 caches
const l1SessionCache = new Map<string, { data: StoredSession; cachedAt: number }>();
const l1OAuthCache = new Map<string, StoredOAuthToken>();
const L1_TTL_MS = 60 * 1000; // 1 minute memory cache

let db: Firestore | null = null;

function getDb(): Firestore | null {
    if (!db) {
        try {
            const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'fodda-mcp';
            db = new Firestore({ projectId });
        } catch (err: any) {
            console.error('[sessionStore] Failed to initialize Firestore client:', err?.message);
            return null;
        }
    }
    return db;
}

// ---------------------------------------------------------------------------
// OAuth Token Resolution Persistence
// ---------------------------------------------------------------------------

/**
 * Retrieve a resolved OAuth token mapping by SHA-256 hash.
 */
export async function getStoredOAuthToken(tokenHash: string): Promise<StoredOAuthToken | null> {
    const mem = l1OAuthCache.get(tokenHash);
    if (mem && mem.expiresAt > Date.now()) {
        return mem;
    }

    const firestore = getDb();
    if (!firestore) return null;

    try {
        const doc = await firestore.collection(OAUTH_TOKENS_COLLECTION).doc(tokenHash).get();
        if (!doc.exists) return null;
        const data = doc.data() as StoredOAuthToken;
        if (!data || !data.apiKey) return null;

        if (data.expiresAt && data.expiresAt <= Date.now()) {
            // Expired in Firestore
            firestore.collection(OAUTH_TOKENS_COLLECTION).doc(tokenHash).delete().catch(() => {});
            return null;
        }

        l1OAuthCache.set(tokenHash, data);
        return data;
    } catch (err: any) {
        console.warn(`[sessionStore] Failed to read OAuth token from Firestore:`, err?.message);
        return null;
    }
}

/**
 * Persist a resolved OAuth token mapping.
 */
export async function storeOAuthToken(
    tokenHash: string,
    apiKey: string,
    userId: string,
    ttlMs: number = DEFAULT_OAUTH_TOKEN_TTL_MS
): Promise<void> {
    const expiresAt = Date.now() + ttlMs;
    const payload: StoredOAuthToken = { apiKey, userId, expiresAt };

    l1OAuthCache.set(tokenHash, payload);

    const firestore = getDb();
    if (!firestore) return;

    try {
        await firestore.collection(OAUTH_TOKENS_COLLECTION).doc(tokenHash).set(payload);
    } catch (err: any) {
        console.warn(`[sessionStore] Failed to persist OAuth token to Firestore:`, err?.message);
    }
}

// ---------------------------------------------------------------------------
// Session State Persistence
// ---------------------------------------------------------------------------

/**
 * Retrieve an MCP session by sessionId.
 */
export async function getStoredSession(sessionId: string): Promise<StoredSession | null> {
    const mem = l1SessionCache.get(sessionId);
    if (mem && (Date.now() - mem.cachedAt < L1_TTL_MS)) {
        return mem.data;
    }

    const firestore = getDb();
    if (!firestore) return null;

    try {
        const doc = await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).get();
        if (!doc.exists) return null;
        const data = doc.data() as StoredSession;
        if (!data || !data.apiKey) return null;

        if (data.updatedAt && (Date.now() - data.updatedAt > SESSION_TTL_MS)) {
            // Stale session
            firestore.collection(SESSIONS_COLLECTION).doc(sessionId).delete().catch(() => {});
            return null;
        }

        l1SessionCache.set(sessionId, { data, cachedAt: Date.now() });
        return data;
    } catch (err: any) {
        console.warn(`[sessionStore] Failed to read session ${sessionId} from Firestore:`, err?.message);
        return null;
    }
}

/**
 * Persist or update an MCP session.
 */
export async function storeSession(
    sessionId: string,
    data: {
        apiKey: string;
        userId: string;
        source?: string | undefined;
        clientSlug?: string | undefined;
        offeringSlug?: string | undefined;
    }
): Promise<void> {
    const now = Date.now();
    const existing = l1SessionCache.get(sessionId)?.data;

    const payload: StoredSession = {
        sessionId,
        apiKey: data.apiKey,
        userId: data.userId,
        source: data.source || existing?.source || '',
        clientSlug: data.clientSlug || existing?.clientSlug || '',
        offeringSlug: data.offeringSlug || existing?.offeringSlug || '',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };

    l1SessionCache.set(sessionId, { data: payload, cachedAt: now });

    const firestore = getDb();
    if (!firestore) return;

    try {
        await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).set(payload, { merge: true });
    } catch (err: any) {
        console.warn(`[sessionStore] Failed to persist session ${sessionId} to Firestore:`, err?.message);
    }
}

/**
 * Delete a session from persistent storage.
 */
export async function deleteStoredSession(sessionId: string): Promise<void> {
    l1SessionCache.delete(sessionId);
    const firestore = getDb();
    if (!firestore) return;

    try {
        await firestore.collection(SESSIONS_COLLECTION).doc(sessionId).delete();
    } catch (err: any) {
        console.warn(`[sessionStore] Failed to delete session ${sessionId} from Firestore:`, err?.message);
    }
}
