# Brief: Waverunner Agent Metering & Tool Registration

## Objective
Wire up the Waverunner Gemini Agents API as a new capability in the MCP server, with correct metering that doesn't double-bill users.

## Context
The MCP's `foddaRequest()` in `src/index.ts` is the central authenticated HTTP caller. It handles trial credit checking, caching, and per-user Firestore tracking. Waverunner interactions go to Google's API (`POST https://generativelanguage.googleapis.com/v1beta/interactions`), NOT to the Fodda API. This means `foddaRequest()` can't be used directly — we need a parallel function.

**Dependencies already shipped:**
- `src/trialTracker.ts` — now supports `interactionType` parameter: `'search' | 'deep_dive' | 'expert_agent'`. Split credit pools: 50 search tokens + 1 free Deep Dive + 2 free Expert Agent turns.
- API `functions/tracking/metering.ts` — now exports `TOKEN_COSTS` and `InteractionType` with fixed pricing (Deep Dive Fast=10, Comprehensive=25, Expert Agent=5/turn).

## Changes Required

### 1. Add `waverunnerRequest()` to `src/index.ts`

Create a new function parallel to `foddaRequest()` that:
- Checks trial credits via `checkTrialLimit(userId, interactionType)` (already updated)
- Does NOT use the query cache (Waverunner calls are non-deterministic)
- Calls Google's Interactions API via `@google/genai`
- After success, increments via `incrementTrialUsage(userId, cost, interactionType)` 
- For paid accounts, calls the Fodda API's new metering endpoint to decrement credits: `POST /v1/research/meter` with `{ type, billable_units }`
- Returns the interaction result

```typescript
async function waverunnerRequest(
    interactionType: TrialInteractionType,
    tokenCost: number,
    apiKey: string,
    userId: string,
    waverunnerPayload: any
): Promise<any> {
    const isTrial = apiKey.startsWith('sk_trial_');
    
    // Pre-check credits
    if (isTrial) {
        const check = await checkTrialLimit(userId, interactionType);
        if (!check.allowed) {
            // Throw synthetic 403 matching handleTrialCreditExhaustion()
            const err: any = new Error(`Trial ${interactionType} credits exhausted`);
            err.response = { status: 403, data: { error: { code: 'CREDITS_EXHAUSTED', message: `Your trial ${interactionType.replace('_', ' ')} credits have run out.` } } };
            throw err;
        }
    }
    
    // Call Waverunner via Gemini SDK
    const geminiKey = process.env.GEMINI_API_KEY;
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const result = await ai.interactions.create(waverunnerPayload);
    
    // Post-decrement
    if (isTrial) {
        await incrementTrialUsage(userId, tokenCost, interactionType);
    } else {
        // Decrement paid account via Fodda API (fire-and-forget)
        foddaRequest('POST', '/v1/research/meter', apiKey, userId, {
            type: interactionType,
            billable_units: tokenCost,
        }).catch(err => console.error('[waverunnerRequest] Metering failed:', err));
    }
    
    return result;
}
```

**Key:** The Waverunner agent uses an internal service key (`FODDA_INTERNAL_API_KEY`) when it calls Fodda graph search tools, so those calls won't be double-billed (the API already skips `decrementCredits()` for `internal_service` accounts).

### 2. Register `deep_research_topic` tool in `src/toolHandlers.ts`

Add after the `search_graph` tool registration (~line 702):

```typescript
server.tool(
    'deep_research_topic',
    'Launch an autonomous Deep Research session on a topic. Waverunner agents will search multiple Fodda graphs, Google, and external URLs to produce a comprehensive research report. Costs 10 tokens (Fast) or 25 tokens (Comprehensive). Use for complex, multi-faceted research questions.',
    {
        topic: z.string().describe('The research topic or question'),
        tier: z.enum(['fast', 'comprehensive']).optional().describe("'fast' (~2 min, 10 tokens) or 'comprehensive' (~5 min, 25 tokens). Default: 'fast'"),
        graphIds: z.array(z.string()).optional().describe('Specific graph IDs to ground the research in. If omitted, searches all accessible graphs.'),
        userId: z.string().optional(),
    },
    { title: 'Deep Research', readOnlyHint: true, destructiveHint: false },
    async ({ topic, tier, graphIds, userId: uid }) => {
        const effectiveTier = tier || 'fast';
        const interactionType = effectiveTier === 'comprehensive' ? 'deep_dive' : 'deep_dive';
        const tokenCost = effectiveTier === 'comprehensive' ? 25 : 10;
        
        try {
            const result = await waverunnerRequest(
                interactionType,
                tokenCost,
                apiKey,
                resolveUserId(userId, uid),
                {
                    agent: 'waverunner',
                    input: [{
                        role: 'user',
                        parts: [{ text: `Research the following topic thoroughly: ${topic}` }]
                    }],
                    config: {
                        tools: [
                            { google_search: {} },
                            { url_context: {} },
                        ]
                    }
                }
            );
            
            const report = result.output?.map((p: any) => p.text).join('\n') || 'No report generated.';
            
            appendUsageWarning({ usage: { remaining: /* from account status */ } }, isTrial);
            
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        report,
                        tier: effectiveTier,
                        tokens_charged: tokenCost,
                        topic,
                        graphs_searched: graphIds || 'all',
                    }, null, 2)
                }]
            };
        } catch (err: any) {
            const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
            if (trialResult) return trialResult;
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }] };
        }
    }
);
```

### 3. Register `read_url` tool in `src/toolHandlers.ts`

```typescript
server.tool(
    'read_url',
    'Extract and analyze content from a URL using Waverunner url_context. Costs 1 token. Use when the user shares a link and asks you to analyze it against Fodda graph data.',
    {
        url: z.string().url().describe('The URL to extract content from'),
        userId: z.string().optional(),
    },
    { title: 'Read URL Content', readOnlyHint: true },
    async ({ url, userId: uid }) => {
        try {
            const result = await waverunnerRequest(
                'search', // Uses standard search pool
                1,
                apiKey,
                resolveUserId(userId, uid),
                {
                    agent: 'waverunner',
                    input: [{ role: 'user', parts: [{ text: `Extract and summarize the content from this URL: ${url}` }] }],
                    config: { tools: [{ url_context: { urls: [url] } }] }
                }
            );
            
            return { content: [{ type: 'text' as const, text: JSON.stringify({ url, content: result.output?.map((p: any) => p.text).join('\n') || '' }, null, 2) }] };
        } catch (err: any) {
            const trialResult = await handleTrialCreditExhaustion(err, apiKey, userId);
            if (trialResult) return trialResult;
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }] };
        }
    }
);
```

### 4. Update `src/tools.ts` version registry

```typescript
export const TOOL_VERSIONS = {
    // ... existing entries ...
    deep_research_topic: "1.0.0",
    read_url: "1.0.0",
};
```

### 5. Update `foddaRequest()` in `src/index.ts`

The existing `foddaRequest()` call at line 190-192 hardcodes `incrementTrialUsage(userId)`. Update to pass through correctly:

```typescript
// Current:
const newCount = await incrementTrialUsage(userId);
const remaining = Math.max(0, 50 - newCount);

// Updated (backward compatible — search calls still pass default args):
const newCount = await incrementTrialUsage(userId, 1, 'search');
const remaining = Math.max(0, 50 - newCount);
```

## Environment Variables Needed
- `GEMINI_API_KEY` — Already exists, used by the Waverunner SDK
- `FODDA_INTERNAL_API_KEY` — The Waverunner agent should use this when calling Fodda graph tools internally, so those calls skip billing

## Testing
1. Trial user: `deep_research_topic` should check `deep_dive` pool (1 credit), not the search pool
2. Paid user: Should deduct 10 or 25 tokens via `/v1/research/meter`
3. `read_url` should use the standard search pool (1 token)
4. Verify no double-billing when Waverunner agent internally searches Fodda graphs

## Priority
P0 — This must ship before any Waverunner tools are exposed to users.
