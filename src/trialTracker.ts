/**
 * Trial Tracker — Firestore-backed per-user trial token counter.
 *
 * Tracks how many API calls each trial user (identified by userId/email)
 * has made across all sessions. Cloud Run instances are ephemeral, so
 * in-memory counters reset on cold starts — Firestore provides persistence.
 *
 * Does NOT modify the existing trial → Base conversion flow.
 * Only adds a per-user counting layer that triggers it earlier.
 *
 * Split credit model (2026-04-24):
 *   - 50 search tokens (standard graph queries)
 *   - 1 free Deep Dive (fast or comprehensive)
 *   - 2 free Expert Agent turns
 * Each pool is tracked independently in the Firestore document.
 */

import { Firestore } from '@google-cloud/firestore';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PER_USER_TRIAL_LIMIT = 50;
const DEEP_DIVE_TRIAL_LIMIT = 1;      // 1 free Deep Dive per trial user
const EXPERT_AGENT_TRIAL_LIMIT = 2;   // 2 free Expert Agent turns per trial user
const WARNING_THRESHOLD = 10; // warn when remaining < 10
const RESET_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const COLLECTION = 'trial-usage';

// ---------------------------------------------------------------------------
// Interaction types — matches API metering.ts InteractionType
// ---------------------------------------------------------------------------

export type TrialInteractionType = 'search' | 'deep_dive' | 'expert_agent';

// ---------------------------------------------------------------------------
// Firestore client — uses Application Default Credentials on Cloud Run
// ---------------------------------------------------------------------------

let db: Firestore | null = null;

function getDb(): Firestore {
    if (!db) {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
        db = new Firestore(projectId ? { projectId } : {});
    }
    return db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrialUsage {
    count: number;
    deepDiveUsed: number;
    expertAgentUsed: number;
    firstUse: Date;
    lastUse: Date;
}

export interface TrialCheckResult {
    allowed: boolean;
    count: number;
    remaining: number;
    limit: number;
    shouldWarn: boolean;
    /** Which credit pool was checked */
    pool: TrialInteractionType;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Get the current trial usage for a user.
 * If the user's firstUse is older than 30 days, resets all counters.
 * Returns { count, deepDiveUsed, expertAgentUsed, firstUse, lastUse }.
 */
export async function getTrialUsage(userId: string): Promise<TrialUsage> {
    try {
        const docRef = getDb().collection(COLLECTION).doc(sanitizeDocId(userId));
        const snap = await docRef.get();

        if (!snap.exists) {
            return { count: 0, deepDiveUsed: 0, expertAgentUsed: 0, firstUse: new Date(), lastUse: new Date() };
        }

        const data = snap.data()!;
        const firstUse = data['firstUse']?.toDate?.() ?? new Date(data['firstUse'] as string);
        const lastUse = data['lastUse']?.toDate?.() ?? new Date(data['lastUse'] as string);
        const count = (data['count'] as number) ?? 0;
        const deepDiveUsed = (data['deepDiveUsed'] as number) ?? 0;
        const expertAgentUsed = (data['expertAgentUsed'] as number) ?? 0;

        // Monthly reset: if firstUse is older than 30 days, reset all counters
        if (Date.now() - firstUse.getTime() > RESET_PERIOD_MS) {
            await docRef.set({ count: 0, deepDiveUsed: 0, expertAgentUsed: 0, firstUse: new Date(), lastUse: new Date() });
            return { count: 0, deepDiveUsed: 0, expertAgentUsed: 0, firstUse: new Date(), lastUse: new Date() };
        }

        return { count, deepDiveUsed, expertAgentUsed, firstUse, lastUse };
    } catch (err) {
        // If Firestore is unavailable, fail open — let the shared pool handle it
        console.error(`[trialTracker] Firestore read failed for ${userId}:`, (err as Error).message);
        return { count: 0, deepDiveUsed: 0, expertAgentUsed: 0, firstUse: new Date(), lastUse: new Date() };
    }
}

/**
 * Increment the trial usage counter for a user.
 * Called after a successful API call.
 * Uses a transaction to ensure firstUse is only set on doc creation.
 *
 * @param userId - The user identifier (email or fingerprint)
 * @param cost - Number of tokens to deduct (default: 1 for search)
 * @param interactionType - Which credit pool to deduct from
 */
export async function incrementTrialUsage(
    userId: string,
    cost: number = 1,
    interactionType: TrialInteractionType = 'search'
): Promise<number> {
    try {
        const docRef = getDb().collection(COLLECTION).doc(sanitizeDocId(userId));
        const now = new Date();

        const newCount = await getDb().runTransaction(async (tx) => {
            const snap = await tx.get(docRef);

            if (!snap.exists) {
                // First ever API call for this user
                const initial: Record<string, any> = { count: 0, deepDiveUsed: 0, expertAgentUsed: 0, firstUse: now, lastUse: now };
                if (interactionType === 'deep_dive') {
                    initial.deepDiveUsed = 1;
                } else if (interactionType === 'expert_agent') {
                    initial.expertAgentUsed = 1;
                } else {
                    initial.count = cost;
                }
                tx.set(docRef, initial);
                return interactionType === 'search' ? cost : 0;
            }

            const data = snap.data()!;
            const updates: Record<string, any> = { lastUse: now };

            if (interactionType === 'deep_dive') {
                updates.deepDiveUsed = ((data['deepDiveUsed'] as number) ?? 0) + 1;
            } else if (interactionType === 'expert_agent') {
                updates.expertAgentUsed = ((data['expertAgentUsed'] as number) ?? 0) + 1;
            } else {
                updates.count = ((data['count'] as number) ?? 0) + cost;
            }

            tx.update(docRef, updates);
            return updates.count ?? (data['count'] as number) ?? 0;
        });

        return newCount;
    } catch (err) {
        // If Firestore is unavailable, fail open
        console.error(`[trialTracker] Firestore write failed for ${userId}:`, (err as Error).message);
        return 0;
    }
}

/**
 * Check if a trial user is allowed to make an API call.
 * Checks the appropriate credit pool based on interactionType.
 *
 * @param userId - The user identifier
 * @param interactionType - Which pool to check: 'search' (50 tokens), 'deep_dive' (1 free), 'expert_agent' (2 free)
 */
export async function checkTrialLimit(
    userId: string,
    interactionType: TrialInteractionType = 'search'
): Promise<TrialCheckResult> {
    const usage = await getTrialUsage(userId);

    if (interactionType === 'deep_dive') {
        const remaining = Math.max(0, DEEP_DIVE_TRIAL_LIMIT - usage.deepDiveUsed);
        return {
            allowed: usage.deepDiveUsed < DEEP_DIVE_TRIAL_LIMIT,
            count: usage.deepDiveUsed,
            remaining,
            limit: DEEP_DIVE_TRIAL_LIMIT,
            shouldWarn: false, // Only 1 credit — no point warning
            pool: 'deep_dive',
        };
    }

    if (interactionType === 'expert_agent') {
        const remaining = Math.max(0, EXPERT_AGENT_TRIAL_LIMIT - usage.expertAgentUsed);
        return {
            allowed: usage.expertAgentUsed < EXPERT_AGENT_TRIAL_LIMIT,
            count: usage.expertAgentUsed,
            remaining,
            limit: EXPERT_AGENT_TRIAL_LIMIT,
            shouldWarn: remaining === 1,
            pool: 'expert_agent',
        };
    }

    // Default: search token pool
    const remaining = Math.max(0, PER_USER_TRIAL_LIMIT - usage.count);
    return {
        allowed: usage.count < PER_USER_TRIAL_LIMIT,
        count: usage.count,
        remaining,
        limit: PER_USER_TRIAL_LIMIT,
        shouldWarn: remaining > 0 && remaining < WARNING_THRESHOLD,
        pool: 'search',
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a userId for use as a Firestore document ID.
 * Firestore doc IDs cannot contain '/' and should be reasonable length.
 */
function sanitizeDocId(userId: string): string {
    return userId
        .replace(/[\/\.+\s]/g, '_')  // Replace /, ., +, whitespace with _
        .replace(/__+/g, '_')         // Collapse multiple underscores
        .substring(0, 200);
}
