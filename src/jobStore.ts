/**
 * Job & A2A Task Store — Durable Firestore-backed storage for asynchronous
 * research jobs (deep_research_topic, consult_human_agent, consult_analyst)
 * and Google A2A protocol tasks.
 *
 * Reuses the existing Firestore client from sessionStore.ts.
 * Implements write-through L1 in-memory caching for single-instance fast path,
 * cross-instance sync, 24-hour TTL persistence, non-destructive reads,
 * SHA-256 tenant isolation guards (ownerScope), and interrupted-job recovery.
 */

import crypto from 'crypto';
import { getDb } from './sessionStore.js';

// ---------------------------------------------------------------------------
// Constants & TTL Configurations
// ---------------------------------------------------------------------------

export const MCP_RESEARCH_JOBS_COLLECTION = 'mcp_research_jobs';
export const MCP_A2A_TASKS_COLLECTION = 'mcp_a2a_tasks';

export const JOB_TTL_MS = 24 * 60 * 60 * 1000;         // 24 hours in Firestore
export const TERMINAL_JOB_READABLE_MS = 60 * 60 * 1000; // Keep terminal jobs in L1 for 1 hour
export const HARD_EXECUTION_CEILING_MS = 240 * 1000;    // 240 seconds
export const STALE_JOB_THRESHOLD_MS = 260 * 1000;       // 260 seconds (interrupted job detection)
export const A2A_WORKING_TTL_MS = 15 * 60 * 1000;       // 15 minutes max for A2A in-flight tasks
export const A2A_TERMINAL_TTL_MS = 30 * 60 * 1000;      // 30 minutes in L1 before eviction

// Non-terminal jobs re-validate against Firestore after 1500ms to observe cross-instance completion
const L1_RUNNING_FRESHNESS_MS = 1500;

// Maximum payload size to safeguard against Firestore 1 MiB document limit
const MAX_FIRESTORE_DOC_BYTES = 800_000;

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type ResearchJobStatus = 'RUNNING' | 'COMPLETE' | 'FAILED';

export interface ResearchJobRecord {
    jobId: string;
    status: ResearchJobStatus;
    isConsult?: boolean | undefined;
    ownerScope?: string | undefined; // SHA-256 hash of API key or user ID
    startedAt: number;
    updatedAt: number;
    result?: any;
    error?: string | null | undefined;
    firstOverageChargeNotice?: boolean | undefined;
    expiresAt?: Date | any;
}

export interface A2APart {
    kind?: 'text' | 'data' | 'file' | undefined;
    type?: 'text' | 'data' | 'file' | undefined;
    text?: string | undefined;
    data?: any;
    mimeType?: string | undefined;
}

export interface A2AMessage {
    role: 'user' | 'agent';
    parts: A2APart[];
}

export interface A2ATask {
    id: string;
    contextId: string;
    status: {
        state: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
        message?: A2AMessage | undefined;
    };
    artifacts?: Array<{
        name?: string | undefined;
        description?: string | undefined;
        parts: A2APart[];
    }> | undefined;
}

export interface A2ATaskRecord {
    task: A2ATask;
    createdAt: number;
    updatedAt: number;
    ownerKeyHash?: string | undefined;
    expiresAt?: Date | any;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class JobUnauthorizedError extends Error {
    public readonly jobId: string;
    constructor(jobId: string) {
        super(`Unauthorized: Job ${jobId} does not belong to caller`);
        this.name = 'JobUnauthorizedError';
        this.jobId = jobId;
    }
}

export class TaskUnauthorizedError extends Error {
    public readonly taskId: string;
    constructor(taskId: string) {
        super(`Unauthorized: Task ${taskId} does not belong to caller`);
        this.name = 'TaskUnauthorizedError';
        this.taskId = taskId;
    }
}

// ---------------------------------------------------------------------------
// In-Memory L1 Caches
// ---------------------------------------------------------------------------

const l1ResearchJobs = new Map<string, { record: ResearchJobRecord; cachedAt: number }>();
const l1A2ATasks = new Map<string, { record: A2ATaskRecord; cachedAt: number }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic SHA-256 ownerScope hash from API key or user ID.
 * Raw API keys (sk_...) are never persisted in Firestore documents.
 */
export function computeOwnerScope(apiKey?: string | null, userId?: string | null): string {
    const raw = (apiKey && apiKey.trim()) || (userId && userId.trim()) || 'anon';
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Strips undefined properties recursively so Firestore does not reject payloads.
 */
function sanitizeForFirestore(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            out[k] = sanitizeForFirestore(v);
        }
    }
    return out;
}

/**
 * Truncates oversized text within results or artifacts to stay safely under Firestore's 1 MiB document limit.
 */
function truncateIfLarge(record: any, maxSize: number = MAX_FIRESTORE_DOC_BYTES): any {
    try {
        const json = JSON.stringify(record);
        if (json.length <= maxSize) return record;

        const clone = JSON.parse(json);
        if (clone.result) {
            if (typeof clone.result === 'string') {
                clone.result = clone.result.slice(0, maxSize - 50_000) + '\n\n[Content truncated to stay within storage limit]';
            } else if (typeof clone.result === 'object') {
                if (clone.result.report && typeof clone.result.report === 'string') {
                    clone.result.report = clone.result.report.slice(0, maxSize - 100_000) + '\n\n[Report truncated to stay within storage limit]';
                }
            }
        }
        if (clone.task?.artifacts && Array.isArray(clone.task.artifacts)) {
            for (const art of clone.task.artifacts) {
                if (art.parts && Array.isArray(art.parts)) {
                    for (const p of art.parts) {
                        if (typeof p.text === 'string' && p.text.length > 200_000) {
                            p.text = p.text.slice(0, 200_000) + '\n\n[Artifact text truncated to stay within storage limit]';
                        }
                    }
                }
            }
        }
        return clone;
    } catch {
        return record;
    }
}

// ---------------------------------------------------------------------------
// Research Jobs API (deep_research_topic, consult_human_agent, consult_analyst)
// ---------------------------------------------------------------------------

/**
 * Creates or updates an active research job record in L1 memory cache and Firestore.
 */
export async function setResearchJob(
    jobId: string,
    data: {
        status: ResearchJobStatus;
        result?: any;
        error?: string | null;
        isConsult?: boolean;
        ownerScope?: string;
        firstOverageChargeNotice?: boolean;
        startedAt?: number;
    }
): Promise<ResearchJobRecord> {
    const now = Date.now();
    const existing = l1ResearchJobs.get(jobId)?.record;

    const record: ResearchJobRecord = {
        jobId,
        status: data.status,
        result: data.result !== undefined ? data.result : (existing?.result ?? null),
        error: data.error !== undefined ? data.error : (existing?.error ?? null),
        isConsult: data.isConsult !== undefined ? data.isConsult : existing?.isConsult,
        ownerScope: data.ownerScope || existing?.ownerScope,
        firstOverageChargeNotice: data.firstOverageChargeNotice !== undefined ? data.firstOverageChargeNotice : existing?.firstOverageChargeNotice,
        startedAt: data.startedAt || existing?.startedAt || now,
        updatedAt: now,
        expiresAt: new Date(now + JOB_TTL_MS),
    };

    // Write-through to L1 cache
    l1ResearchJobs.set(jobId, { record, cachedAt: now });

    // Persist to Firestore (fail-open)
    const db = getDb();
    if (db) {
        try {
            const sanitized = sanitizeForFirestore(truncateIfLarge(record));
            await db.collection(MCP_RESEARCH_JOBS_COLLECTION).doc(jobId).set(sanitized, { merge: true });
        } catch (err: any) {
            console.warn(`[jobStore] Failed to persist research job ${jobId} to Firestore:`, err?.message);
        }
    }

    return record;
}

/**
 * Retrieves a research job by jobId with tenant isolation verification,
 * interrupted job recovery, and Firestore fallback.
 */
export async function getResearchJob(
    jobId: string,
    callerOwnerScope?: string
): Promise<ResearchJobRecord | null> {
    const now = Date.now();
    let record: ResearchJobRecord | null = null;

    // 1. Check L1 cache
    const mem = l1ResearchJobs.get(jobId);
    if (mem) {
        // Terminal states (COMPLETE | FAILED) are immutable and kept in L1
        if (mem.record.status === 'COMPLETE' || mem.record.status === 'FAILED') {
            record = mem.record;
        } else if (now - mem.cachedAt < L1_RUNNING_FRESHNESS_MS) {
            record = mem.record;
        }
    }

    // 2. Cache miss or non-terminal job needing cross-instance sync from Firestore
    if (!record) {
        const db = getDb();
        if (db) {
            try {
                const doc = await db.collection(MCP_RESEARCH_JOBS_COLLECTION).doc(jobId).get();
                if (doc.exists) {
                    const data = doc.data() as any;
                    if (data) {
                        record = {
                            jobId,
                            status: data.status,
                            result: data.result,
                            error: data.error,
                            isConsult: data.isConsult,
                            ownerScope: data.ownerScope,
                            firstOverageChargeNotice: data.firstOverageChargeNotice,
                            startedAt: data.startedAt || now,
                            updatedAt: data.updatedAt || now,
                            expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt,
                        };
                        l1ResearchJobs.set(jobId, { record, cachedAt: now });
                    }
                }
            } catch (err: any) {
                console.warn(`[jobStore] Failed to read research job ${jobId} from Firestore:`, err?.message);
                if (mem) record = mem.record; // fail open to L1
            }
        } else if (mem) {
            record = mem.record;
        }
    }

    if (!record) return null;

    // 3. Interrupted-Job Detection:
    // If status === 'RUNNING' and Date.now() - startedAt > 260_000 (past 240s ceiling),
    // the container that spawned the background IIFE crashed or was evicted.
    if (record.status === 'RUNNING' && (now - record.startedAt > STALE_JOB_THRESHOLD_MS)) {
        console.warn(`[jobStore] Job ${jobId} exceeded 260s execution ceiling while RUNNING (started ${Math.round((now - record.startedAt) / 1000)}s ago) — marking FAILED (interrupted/retryable)`);
        record.status = 'FAILED';
        record.error = 'Research job exceeded the 240-second maximum execution window; the background worker may have restarted. Please retry.';
        record.updatedAt = now;
        l1ResearchJobs.set(jobId, { record, cachedAt: now });

        const db = getDb();
        if (db) {
            db.collection(MCP_RESEARCH_JOBS_COLLECTION).doc(jobId).set({
                status: 'FAILED',
                error: record.error,
                updatedAt: now,
            }, { merge: true }).catch((err: any) => {
                console.warn(`[jobStore] Failed to persist interrupted FAILED status for job ${jobId}:`, err?.message);
            });
        }
    }

    // 4. Tenant isolation verification
    if (callerOwnerScope && record.ownerScope && record.ownerScope !== callerOwnerScope) {
        throw new JobUnauthorizedError(jobId);
    }

    return record;
}

/**
 * Deletes a research job (primarily used for cleanup in tests or admin purge).
 */
export async function deleteResearchJob(jobId: string): Promise<void> {
    l1ResearchJobs.delete(jobId);
    const db = getDb();
    if (db) {
        try {
            await db.collection(MCP_RESEARCH_JOBS_COLLECTION).doc(jobId).delete();
        } catch (err: any) {
            console.warn(`[jobStore] Failed to delete research job ${jobId}:`, err?.message);
        }
    }
}

// ---------------------------------------------------------------------------
// A2A Task Store (Google A2A Protocol)
// ---------------------------------------------------------------------------

/**
 * Saves or updates an A2A Task in L1 memory and Firestore.
 */
export async function saveA2ATask(
    task: A2ATask,
    ownerKeyHash?: string
): Promise<A2ATaskRecord> {
    const now = Date.now();
    const taskId = task.id;
    const existing = l1A2ATasks.get(taskId)?.record;

    const record: A2ATaskRecord = {
        task,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        ownerKeyHash: ownerKeyHash || existing?.ownerKeyHash,
        expiresAt: new Date(now + JOB_TTL_MS),
    };

    l1A2ATasks.set(taskId, { record, cachedAt: now });

    const db = getDb();
    if (db) {
        try {
            const sanitized = sanitizeForFirestore(truncateIfLarge(record));
            await db.collection(MCP_A2A_TASKS_COLLECTION).doc(taskId).set(sanitized, { merge: true });
        } catch (err: any) {
            console.warn(`[jobStore] Failed to persist A2A task ${taskId} to Firestore:`, err?.message);
        }
    }

    return record;
}

/**
 * Retrieves an A2A Task by taskId with owner validation, timeout detection,
 * and Firestore fallback.
 */
export async function getA2ATask(
    taskId: string,
    callerKeyHash?: string
): Promise<A2ATaskRecord | null> {
    const now = Date.now();
    let record: A2ATaskRecord | null = null;

    // 1. Check L1 cache
    const mem = l1A2ATasks.get(taskId);
    if (mem) {
        const state = mem.record.task?.status?.state;
        const isTerminal = state === 'completed' || state === 'failed' || state === 'canceled';
        if (isTerminal || (now - mem.cachedAt < L1_RUNNING_FRESHNESS_MS)) {
            record = mem.record;
        }
    }

    // 2. Cache miss or non-terminal task cross-instance read
    if (!record) {
        const db = getDb();
        if (db) {
            try {
                const doc = await db.collection(MCP_A2A_TASKS_COLLECTION).doc(taskId).get();
                if (doc.exists) {
                    const data = doc.data() as any;
                    if (data && data.task) {
                        record = {
                            task: data.task,
                            createdAt: data.createdAt || now,
                            updatedAt: data.updatedAt || now,
                            ownerKeyHash: data.ownerKeyHash,
                            expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt,
                        };
                        l1A2ATasks.set(taskId, { record, cachedAt: now });
                    }
                }
            } catch (err: any) {
                console.warn(`[jobStore] Failed to read A2A task ${taskId} from Firestore:`, err?.message);
                if (mem) record = mem.record;
            }
        } else if (mem) {
            record = mem.record;
        }
    }

    if (!record) return null;

    // 3. Timeout check: non-terminal tasks auto-failed after 15 min (hung pipeline or container restart)
    const state = record.task?.status?.state;
    const isTerminal = state === 'completed' || state === 'failed' || state === 'canceled';
    if (!isTerminal && (now - record.createdAt > A2A_WORKING_TTL_MS)) {
        console.warn(`[jobStore] A2A Task ${taskId} auto-failed: exceeded ${A2A_WORKING_TTL_MS / 60000}min working TTL`);
        record.task.status = {
            state: 'failed',
            message: { role: 'agent', parts: [{ kind: 'text', text: 'Research timed out after 15 minutes.' }] },
        };
        record.updatedAt = now;
        l1A2ATasks.set(taskId, { record, cachedAt: now });

        const db = getDb();
        if (db) {
            db.collection(MCP_A2A_TASKS_COLLECTION).doc(taskId).set({
                'task.status': record.task.status,
                updatedAt: now,
            }, { merge: true }).catch((err: any) => {
                console.warn(`[jobStore] Failed to persist timed-out state for A2A task ${taskId}:`, err?.message);
            });
        }
    }

    // 4. Tenant isolation verification
    if (callerKeyHash && record.ownerKeyHash && record.ownerKeyHash !== callerKeyHash) {
        throw new TaskUnauthorizedError(taskId);
    }

    return record;
}

/**
 * Deletes an A2A task (primarily used for cleanup in tests or admin purge).
 */
export async function deleteA2ATask(taskId: string): Promise<void> {
    l1A2ATasks.delete(taskId);
    const db = getDb();
    if (db) {
        try {
            await db.collection(MCP_A2A_TASKS_COLLECTION).doc(taskId).delete();
        } catch (err: any) {
            console.warn(`[jobStore] Failed to delete A2A task ${taskId}:`, err?.message);
        }
    }
}

// ---------------------------------------------------------------------------
// Periodic L1 In-Memory Sweeper
// ---------------------------------------------------------------------------

/**
 * Evicts expired terminal entries from in-memory L1 cache to keep heap usage bounded.
 * (Persistent records remain in Firestore until their 24-hour GCP TTL).
 */
export function sweepL1Caches(): void {
    const now = Date.now();

    // Sweep L1 research jobs
    for (const [id, entry] of l1ResearchJobs) {
        const isTerminal = entry.record.status === 'COMPLETE' || entry.record.status === 'FAILED';
        const age = now - entry.record.startedAt;
        if (isTerminal && age > TERMINAL_JOB_READABLE_MS) {
            l1ResearchJobs.delete(id);
        }
    }

    // Sweep L1 A2A tasks
    for (const [id, entry] of l1A2ATasks) {
        const state = entry.record.task?.status?.state;
        const isTerminal = state === 'completed' || state === 'failed' || state === 'canceled';
        const age = now - entry.record.createdAt;
        if (isTerminal && age > A2A_TERMINAL_TTL_MS) {
            l1A2ATasks.delete(id);
        }
    }
}

// ---------------------------------------------------------------------------
// Test / Diagnostics Helpers
// ---------------------------------------------------------------------------

/**
 * Wipes in-memory L1 cache maps to simulate a container cold start or cross-instance poll.
 */
export function clearL1Cache(): void {
    l1ResearchJobs.clear();
    l1A2ATasks.clear();
}

export function getL1ResearchJobsCount(): number {
    return l1ResearchJobs.size;
}

export function getL1A2ATasksCount(): number {
    return l1A2ATasks.size;
}
