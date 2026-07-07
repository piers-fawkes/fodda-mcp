/**
 * Shared type definitions for Fodda MCP
 *
 * These types are used by both toolHandlers.ts and deepResearch.ts.
 * Extracted here to avoid circular imports under ESM.
 */

import type { TrialInteractionType } from './trialTracker.js';

export type FoddaRequestFn = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string,
    source?: string,
    spt?: string
) => Promise<any>;

export type WaverunnerRequestFn = (
    interactionType: TrialInteractionType,
    tokenCost: number,
    apiKey: string,
    userId: string,
    waverunnerPayload: any
) => Promise<any>;
