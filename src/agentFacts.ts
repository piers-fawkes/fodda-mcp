/**
 * AgentFacts — NANDA-format agent identity document.
 *
 * Third projection of the same canonical metadata behind the MCP discovery
 * card (/.well-known/mcp-server.json) and the A2A Agent Card
 * (/.well-known/agent-card.json). Identity, description, and skills derive
 * from the A2A card; version from tools.ts; endpoints from the live service
 * URL; error-rate telemetry from in-process stats. Nothing is hand-maintained
 * here — edit the A2A card / sync-discovery canon and this follows.
 *
 * Schema: https://github.com/projnanda/agentfacts-format (JSON Schema draft-07)
 * Required: id, agent_name, label, description, version, provider, endpoints,
 * capabilities, skills.
 *
 * Consumed by NANDA Index / List39 resolution — a NANDA index record points
 * here (or at the A2A card) as its next discovery hop.
 */

import type { Express, Request, Response } from 'express';
import { MCP_SERVER_VERSION } from './tools.js';
import { AGENT_CARD } from './a2aHandler.js';
import { getTelemetryStats } from './telemetry.js';

export function buildAgentFacts(serviceUrl: string): Record<string, unknown> {
    const sptEnabled = process.env.ENABLE_SPT === 'true';
    const stats = getTelemetryStats();

    return {
        id: 'ai.fodda/mcp-server',
        agent_name: 'urn:agent:fodda:ResearchAgent',
        label: AGENT_CARD.name,
        description: AGENT_CARD.description,
        version: MCP_SERVER_VERSION,
        documentationUrl: AGENT_CARD.documentationUrl,
        jurisdiction: 'US',
        provider: {
            name: AGENT_CARD.provider.organization,
            url: AGENT_CARD.provider.url,
        },
        endpoints: {
            static: [`${serviceUrl}/a2a`, `${serviceUrl}/mcp`],
        },
        capabilities: {
            modalities: ['text'],
            // MCP endpoint is streamable-HTTP/SSE; the A2A endpoint itself is
            // request/response (see AGENT_CARD.capabilities.streaming).
            streaming: true,
            // Deep research & commissioned deliverables run as async jobs.
            batch: true,
            authentication: {
                methods: ['oauth2', 'api_key', ...(sptEnabled ? ['stripe-spt'] : [])],
            },
        },
        skills: AGENT_CARD.skills.map(s => ({
            id: s.id,
            description: s.description,
            inputModes: ['text'],
            outputModes: ['text'],
            supportedLanguages: ['en'],
        })),
        telemetry: {
            enabled: true,
            metrics: {
                // Per-instance since last restart — same caveat as /telemetry.
                error_rate: stats.globalErrorRate,
            },
        },
    };
}

export function registerAgentFactsRoute(app: Express, getServiceUrl: () => string): void {
    const serveAgentFacts = (_req: Request, res: Response) =>
        res.json(buildAgentFacts(getServiceUrl()));
    app.get('/.well-known/agent-facts.json', serveAgentFacts); // NANDA convention
    app.get('/.well-known/agentfacts.json', serveAgentFacts);  // alias
    console.error('[agentfacts] AgentFacts served at /.well-known/agent-facts.json');
}
