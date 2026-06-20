/**
 * Skill Client — Routes skill calls through the Fodda Core API.
 *
 * Architecture change (2026-05-03):
 *   BEFORE: MCP connected directly to external skill MCP servers.
 *   NOW:    All skill calls route through Core API endpoints:
 *     - GET  /v1/skills/{skill_id}/tools    → discover available tools
 *     - POST /v1/skills/{skill_id}/execute  → execute a specific tool
 *
 * The Core API handles auth, access control, billing (2 tokens/call),
 * and upstream MCP connections. The MCP Server never talks to skill
 * servers directly.
 *
 * Design decisions:
 * - Fail-open — if discovery or execution fails, Fodda proceeds without skills
 * - 15s timeout for execution (skill + API overhead)
 * - 10s timeout for discovery
 * - Structured input contract preserved for output-phase skills
 */

import axios from 'axios';

// ---------------------------------------------------------------------------
// Types — Discovered skill tools from the Core API
// ---------------------------------------------------------------------------

/** A single tool exposed by a skill, as returned by the Core API. */
export interface SkillToolDefinition {
    /** Tool name as registered on the skill's MCP server */
    name: string;
    /** Human-readable description */
    description: string;
    /** JSON Schema for tool arguments */
    inputSchema: Record<string, any>;
}

/** Discovery response from GET /v1/skills/{skill_id}/tools */
export interface DiscoveredSkill {
    /** Skill identifier (matches graph_id) */
    skill_id: string;
    /** Human-readable skill name */
    skill_name: string;
    /** Available tools on this skill */
    tools: SkillToolDefinition[];
    /** Token cost per execution (default: 2) */
    cost_per_call: number;
}

/** Minimal skill config — no longer needs mcp_url or auth tokens */
export interface SkillConfig {
    /** Skill identifier (matches graph_id in catalog) */
    id: string;
    /** Human-readable name */
    name: string;
    /** When in the pipeline to call: 'output' (post-research) or 'research' (pre-search, future) */
    phase: 'output' | 'research';
}

export interface SkillInput {
    /** The user's original query */
    query: string;
    /** Primary graph ID that was searched */
    graphId: string;
    /** Graph metadata */
    context: {
        graphName: string;
        curatorName: string;
        domain: string;
    };
    /** Trend results from graph search */
    trends: Array<{
        name: string;
        summary?: string;
        signal_score?: number;
        trendLifecycle?: string;
        momentum?: string;
        evidence_count?: number;
        graphName?: string;
    }>;
    /** Evidence articles from graph search */
    evidence: Array<{
        title: string;
        sourceUrl?: string;
        brandNames?: string[];
        place?: string;
        snippet?: string;
    }>;
    /** Supplemental data (Google Trends, Census, etc.) */
    supplemental?: Record<string, any> | undefined;
}

export interface SkillResult {
    /** Skill identifier */
    skillId: string;
    /** Human-readable skill name */
    skillName: string;
    /** Whether the skill executed successfully */
    success: boolean;
    /** Transformed output from the skill (markdown or JSON string) */
    output?: string;
    /** Error message if the skill failed */
    error?: string;
    /** How long the skill took to execute */
    durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const DISCOVERY_TIMEOUT_MS = 10_000;
const EXECUTION_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Discovery: Get available tools for a skill via Core API
// ---------------------------------------------------------------------------

/**
 * Discover available tools for a skill by calling the Core API.
 *
 * GET /v1/skills/{skill_id}/tools
 *
 * Returns null on failure (fail-open — skill is silently skipped).
 */
export async function discoverSkillTools(
    skillId: string,
    apiKey: string,
): Promise<DiscoveredSkill | null> {
    try {
        const url = `${API_BASE_URL}/v1/skills/${encodeURIComponent(skillId)}/tools`;
        const response = await axios.get(url, {
            headers: {
                'X-API-Key': apiKey,
            },
            timeout: DISCOVERY_TIMEOUT_MS,
        });

        const data = response.data;
        if (!data || !Array.isArray(data.tools)) {
            console.error(`[skillClient] Discovery for ${skillId}: invalid response shape`);
            return null;
        }

        console.error(`[skillClient] Discovered ${data.tools.length} tool(s) for ${data.skill_name || skillId}`);
        return {
            skill_id: data.skill_id || skillId,
            skill_name: data.skill_name || skillId,
            tools: data.tools,
            cost_per_call: data.cost_per_call ?? 2,
        };
    } catch (err: any) {
        const status = err.response?.status;
        const code = err.response?.data?.error?.code;

        if (status === 404) {
            console.error(`[skillClient] Skill "${skillId}" not found or not available (${code || '404'})`);
        } else if (status === 403) {
            console.error(`[skillClient] Skill "${skillId}" access denied (${code || '403'}) — may be disabled or draft`);
        } else {
            console.error(`[skillClient] Discovery failed for ${skillId}: ${err.message}`);
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// Execution: Call a skill tool via Core API
// ---------------------------------------------------------------------------

/**
 * Execute a specific tool on a skill via the Core API.
 *
 * POST /v1/skills/{skill_id}/execute
 * Body: { tool: "tool_name", arguments: {...} }
 *
 * Returns the result text, or throws on error.
 */
export async function executeSkillTool(
    skillId: string,
    toolName: string,
    args: Record<string, any>,
    apiKey: string,
    userId: string,
): Promise<{ output: string; durationMs: number }> {
    const startTime = Date.now();
    const url = `${API_BASE_URL}/v1/skills/${encodeURIComponent(skillId)}/execute`;

    const response = await axios.post(url, {
        tool: toolName,
        arguments: args,
    }, {
        headers: {
            'X-API-Key': apiKey,
            'X-User-Id': userId,
            'X-Fodda-Billing': 'mcp-orchestrated',
            'Content-Type': 'application/json',
        },
        timeout: EXECUTION_TIMEOUT_MS,
    });

    const durationMs = Date.now() - startTime;
    const data = response.data;

    // Extract text from response — the API may return { result: "..." } or { result: { content: [...] } }
    let output = '';
    if (typeof data.result === 'string') {
        output = data.result;
    } else if (data.result?.content) {
        const contentArr = Array.isArray(data.result.content) ? data.result.content : [];
        output = contentArr
            .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
            .join('\n');
    } else if (data.result) {
        output = JSON.stringify(data.result);
    }

    console.error(`[skillClient] ${skillId}/${toolName} executed in ${durationMs}ms (${output.length} chars)`);

    return { output, durationMs };
}

// ---------------------------------------------------------------------------
// Error mapping — Convert API error codes to user-friendly messages
// ---------------------------------------------------------------------------

/**
 * Map a skill execution error to a user-friendly message.
 * Returns null if the error should be handled by the standard error path
 * (e.g. CREDITS_EXHAUSTED).
 */
export function mapSkillError(err: any): string | null {
    const status = err.response?.status;
    const code = err.response?.data?.error?.code;
    const message = err.response?.data?.error?.message;

    switch (code) {
        case 'GRAPH_DISABLED':
            return '⚠️ This skill is currently disabled in your dashboard. Re-enable it at app.fodda.ai/graphs.';
        case 'SKILL_NOT_FOUND':
            return '⚠️ This skill is not currently available on the Fodda platform.';
        case 'SKILL_NOT_AVAILABLE':
            return '⚠️ This skill is not currently available — it may be in development.';
        case 'SKILL_UPSTREAM_ERROR':
            return '⚠️ The skill server encountered an error. Please try again in a moment.';
        case 'CREDITS_EXHAUSTED':
            return null; // Let the standard credit exhaustion handler deal with this
        default:
            if (status === 403) {
                return `⚠️ Access denied: ${message || 'You may not have access to this skill.'}`;
            }
            if (status === 404) {
                return '⚠️ This skill is not currently available.';
            }
            return null; // Unknown error — let caller handle
    }
}

// ---------------------------------------------------------------------------
// Core: Call a single output-phase skill via Core API
// ---------------------------------------------------------------------------

/**
 * Call a skill's output-phase processing via the Core API.
 *
 * This wraps executeSkillTool() with the Fodda output data contract
 * and returns a SkillResult for backward compatibility with the
 * search_graph pipeline.
 *
 * Fail-open: returns a result with success=false on any error.
 */
export async function callSkill(
    skill: SkillConfig,
    input: SkillInput,
    apiKey: string,
    userId: string,
): Promise<SkillResult> {
    const startTime = Date.now();

    try {
        const { output, durationMs } = await executeSkillTool(
            skill.id,
            'process', // output-phase skills use a standard 'process' tool
            {
                fodda_output: input,
                query: input.query,
                trends: input.trends,
                evidence: input.evidence,
            },
            apiKey,
            userId,
        );

        return {
            skillId: skill.id,
            skillName: skill.name,
            success: true,
            output,
            durationMs,
        };
    } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const friendlyMsg = mapSkillError(err);
        const errorMsg = friendlyMsg || err.response?.data?.error?.message || err.message;
        console.error(`[skillClient] ${skill.name} failed after ${durationMs}ms: ${errorMsg}`);

        return {
            skillId: skill.id,
            skillName: skill.name,
            success: false,
            error: errorMsg,
            durationMs,
        };
    }
}

// ---------------------------------------------------------------------------
// Batch: Call multiple output-phase skills in parallel
// ---------------------------------------------------------------------------

/**
 * Call all enabled output-phase skills in parallel via the Core API.
 * Returns results for all skills (success or failure).
 * Never throws — individual failures are captured in the result objects.
 */
export async function callOutputSkills(
    skills: SkillConfig[],
    input: SkillInput,
    apiKey: string,
    userId: string,
): Promise<SkillResult[]> {
    const outputSkills = skills.filter(s => s.phase === 'output');

    if (outputSkills.length === 0) return [];

    console.error(`[skillClient] Calling ${outputSkills.length} output skill(s): ${outputSkills.map(s => s.name).join(', ')}`);

    const results = await Promise.allSettled(
        outputSkills.map(skill => callSkill(skill, input, apiKey, userId))
    );

    return results.map(r =>
        r.status === 'fulfilled'
            ? r.value
            : {
                skillId: 'unknown',
                skillName: 'unknown',
                success: false,
                error: r.reason?.message || 'Unknown error',
                durationMs: 0,
            }
    );
}

// ---------------------------------------------------------------------------
// Helpers: Build skill input from search results
// ---------------------------------------------------------------------------

/**
 * Package Fodda search results into the standard skill input format.
 * Call this after search_graph results are enriched but before widget rendering.
 */
export function buildSkillInput(
    query: string,
    data: any,
    effectiveGraphId: string,
    primaryGraphName: string,
    supplemental?: Record<string, any>,
): SkillInput {
    const rows = data?.rows || [];

    return {
        query,
        graphId: effectiveGraphId,
        context: {
            graphName: primaryGraphName,
            curatorName: rows[0]?.curator || '',
            domain: rows[0]?.domain || '',
        },
        trends: rows.map((r: any) => ({
            name: r.trendName || r.display || r.name || r.title || '',
            summary: r.summary || r.description || r.trendDescription || '',
            signal_score: r.signal_score || r.score || 0,
            trendLifecycle: r.trendLifecycle || 'unknown',
            momentum: r.momentum || 'unknown',
            evidence_count: r.evidence_count || r.evidenceCount || 0,
            graphName: r.graphName || '',
        })),
        evidence: rows.flatMap((r: any) =>
            (r.evidence || []).map((e: any) => ({
                title: e.title || e.articleTitle || '',
                sourceUrl: e.sourceUrl || e.url || '',
                brandNames: e.brandNames || [],
                place: e.place || e.geographical_region || '',
                snippet: e.snippet || e.summary || '',
            }))
        ).slice(0, 50), // Cap evidence to avoid oversized payloads
        supplemental: supplemental || undefined,
    };
}
