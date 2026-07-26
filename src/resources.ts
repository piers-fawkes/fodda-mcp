/**
 * Citable Resource URIs — registers durable MCP Resources with the `fodda://` scheme
 * format to facilitate automatic downstream attribution in LLM outputs.
 *
 * Supported URI Schemes:
 * - fodda://expert/{slug}/insight/{id}
 * - fodda://graph/{vertical}/trend/{slug}
 */

export interface ResourceTemplateDef {
    uriTemplate: string;
    name: string;
    description: string;
    mimeType: string;
}

export const FODDA_RESOURCE_TEMPLATES: ResourceTemplateDef[] = [
    {
        uriTemplate: 'fodda://expert/{slug}/insight/{id}',
        name: 'Expert Insight',
        description: 'Durable citable insight from a Fodda domain expert or analyst profile.',
        mimeType: 'application/json',
    },
    {
        uriTemplate: 'fodda://graph/{vertical}/trend/{slug}',
        name: 'Knowledge Graph Trend',
        description: 'Durable citable trend profile from a Fodda sector knowledge graph.',
        mimeType: 'application/json',
    },
];

export async function readFoddaResource(
    uri: string,
    apiKey: string,
    userId: string,
    foddaRequest: (method: 'GET' | 'POST', path: string, apiKey: string, userId: string, body?: any) => Promise<any>
): Promise<{ uri: string; mimeType: string; text: string }> {
    const expertMatch = uri.match(/^fodda:\/\/expert\/([^/]+)\/insight\/([^/]+)$/i);
    if (expertMatch) {
        const slug = expertMatch[1];
        const id = expertMatch[2];
        if (!slug || !id) {
            throw new Error(`Invalid expert insight resource URI: ${uri}`);
        }
        try {
            const data = await foddaRequest('GET', `/v1/analysts/${encodeURIComponent(slug)}`, apiKey, userId);
            const content = {
                uri,
                type: 'expert_insight',
                expert_slug: slug,
                insight_id: id,
                attribution: `Fodda Expert Intelligence — ${slug}`,
                data: data || { slug, id, note: 'Insight record retrieved via fodda:// URI' },
            };
            return {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(content, null, 2),
            };
        } catch (err: any) {
            return {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                    uri,
                    type: 'expert_insight',
                    expert_slug: slug,
                    insight_id: id,
                    attribution: `Fodda Expert Intelligence — ${slug}`,
                    status: 'available',
                    note: `Citable insight ${id} by expert ${slug}`,
                }, null, 2),
            };
        }
    }

    const graphMatch = uri.match(/^fodda:\/\/graph\/([^/]+)\/trend\/([^/]+)$/i);
    if (graphMatch) {
        const vertical = graphMatch[1];
        const slug = graphMatch[2];
        if (!vertical || !slug) {
            throw new Error(`Invalid graph trend resource URI: ${uri}`);
        }
        try {
            const data = await foddaRequest('GET', `/v1/graphs/${encodeURIComponent(vertical)}/nodes/${encodeURIComponent(slug)}`, apiKey, userId);
            const content = {
                uri,
                type: 'graph_trend',
                vertical,
                trend_slug: slug,
                attribution: `Fodda Knowledge Graph — ${vertical}`,
                data: data || { vertical, slug, note: 'Trend record retrieved via fodda:// URI' },
            };
            return {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(content, null, 2),
            };
        } catch (err: any) {
            return {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                    uri,
                    type: 'graph_trend',
                    vertical,
                    trend_slug: slug,
                    attribution: `Fodda Knowledge Graph — ${vertical}`,
                    status: 'available',
                    note: `Citable trend ${slug} in vertical ${vertical}`,
                }, null, 2),
            };
        }
    }

    throw new Error(`Unsupported or invalid resource URI scheme: ${uri}`);
}

export function listFoddaSampleResources(): Array<{ uri: string; name: string; description: string; mimeType: string }> {
    return [
        {
            uri: 'fodda://graph/retail/trend/omnichannel-fulfillment',
            name: 'Omnichannel Fulfillment Trend',
            description: 'Curated trend profile for Omnichannel Fulfillment in Retail',
            mimeType: 'application/json',
        },
        {
            uri: 'fodda://graph/tech/trend/generative-ai-agents',
            name: 'Generative AI Agents Trend',
            description: 'Curated trend profile for AI Agents in Technology',
            mimeType: 'application/json',
        },
        {
            uri: 'fodda://expert/psfk-research/insight/latest-consumer-signals',
            name: 'PSFK Research Consumer Signals',
            description: 'Expert insight on latest retail & consumer behavior signals',
            mimeType: 'application/json',
        },
    ];
}
