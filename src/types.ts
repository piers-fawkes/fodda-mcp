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

export interface Voice {
    id: string;
    quote: string | null;
    quote_kind: 'verbatim' | 'paraphrase' | 'author_thesis';
    claim: string;
    speaker: {
        name: string;
        title: string | null;
        org: string | null;
        role?: 'CEO' | 'CFO' | 'CMO' | 'Other C-suite' | 'Analyst' | 'Other' | null;
        type: 'executive' | 'analyst' | 'founder' | 'columnist' | 'journalist' | 'academic' | 'creator' | 'policymaker' | 'other';
    };
    source: {
        publication: string | null;
        url: string | null;
        media_type?: string;
        event?: string | null;
        date?: string | null;
        locator?: string | null;
    };
    brands?: string[];
    verified: 'verified' | 'unverified' | 'failed';
    license: 'full' | 'excerpt_only' | 'link_only';
    stance?: 'supports' | 'challenges' | 'nuances';
    angle?: string;
    display?: {
        quotable: boolean;
        attribution: string;
    };
    formatted_citation?: string;
}

export interface Perspective {
    agent_slug: string;
    agent_name: string;
    agent_type: 'human_agent' | 'classic_agent' | 'agentic_expert';
    text: string;
    generated_at: string;
    label: string;
}
