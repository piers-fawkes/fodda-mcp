/**
 * Telemetry & Error-Rate Instrumentation — records pass/fail outcomes,
 * computes per-tool and global error rates, latencies, and tracks feedback.
 */

export interface ToolExecutionRecord {
    toolName: string;
    success: boolean;
    durationMs: number;
    timestamp: number;
    error?: string;
}

export interface ToolTelemetryStats {
    toolName: string;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    errorRate: number;
    errorRateFormatted: string;
    avgDurationMs: number;
    lastExecutedAt: number | null;
    lastError: string | null;
    recentErrors: string[];
}

export interface ServerTelemetrySummary {
    serverUptimeSeconds: number;
    totalToolCalls: number;
    totalSuccessCalls: number;
    totalFailedCalls: number;
    globalErrorRate: number;
    globalErrorRateFormatted: string;
    tools: Record<string, ToolTelemetryStats>;
    recentFeedbackCount: number;
}

const startTime = Date.now();
const MAX_RECENT_ERRORS = 10;
const toolExecutionHistory: ToolExecutionRecord[] = [];
const feedbackLogs: Array<{ timestamp: number; category: string; feedback: string; user: string }> = [];

const toolStatsMap = new Map<string, {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalDurationMs: number;
    lastExecutedAt: number | null;
    lastError: string | null;
    recentErrors: string[];
}>();

export function recordToolOutcome(
    toolName: string,
    success: boolean,
    durationMs: number,
    error?: string
): void {
    const now = Date.now();
    const record: ToolExecutionRecord = {
        toolName,
        success,
        durationMs,
        timestamp: now,
        ...(error ? { error } : {}),
    };
    toolExecutionHistory.push(record);
    if (toolExecutionHistory.length > 2000) toolExecutionHistory.shift();

    // Cloud Logging structured telemetry line
    try {
        console.log(JSON.stringify({
            severity: success ? 'INFO' : 'WARNING',
            message: `[MCP_METRICS] ${toolName} finished in ${durationMs}ms`,
            mcp_tool: toolName,
            duration_ms: durationMs,
            success,
            error: error || null,
            timestamp: new Date(now).toISOString()
        }));
    } catch {
        // Safe fallback - avoid crashing on serialization edge cases
    }

    let stats = toolStatsMap.get(toolName);
    if (!stats) {
        stats = {
            totalCalls: 0,
            successCalls: 0,
            failedCalls: 0,
            totalDurationMs: 0,
            lastExecutedAt: null,
            lastError: null,
            recentErrors: [],
        };
        toolStatsMap.set(toolName, stats);
    }

    stats.totalCalls++;
    stats.totalDurationMs += durationMs;
    stats.lastExecutedAt = now;

    if (success) {
        stats.successCalls++;
    } else {
        stats.failedCalls++;
        const errStr = error || 'Unknown error';
        stats.lastError = errStr;
        stats.recentErrors.push(errStr);
        if (stats.recentErrors.length > MAX_RECENT_ERRORS) {
            stats.recentErrors.shift();
        }
    }
}

export function recordFeedbackEntry(category: string, feedback: string, user: string): void {
    feedbackLogs.push({
        timestamp: Date.now(),
        category,
        feedback,
        user,
    });
    if (feedbackLogs.length > 500) feedbackLogs.shift();
}

export function getTelemetryStats(): ServerTelemetrySummary {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    let globalTotal = 0;
    let globalSuccess = 0;
    let globalFailed = 0;

    const tools: Record<string, ToolTelemetryStats> = {};

    for (const [toolName, s] of toolStatsMap.entries()) {
        globalTotal += s.totalCalls;
        globalSuccess += s.successCalls;
        globalFailed += s.failedCalls;

        const errorRate = s.totalCalls > 0 ? s.failedCalls / s.totalCalls : 0;
        const avgDurationMs = s.totalCalls > 0 ? Math.round(s.totalDurationMs / s.totalCalls) : 0;

        tools[toolName] = {
            toolName,
            totalCalls: s.totalCalls,
            successCalls: s.successCalls,
            failedCalls: s.failedCalls,
            errorRate,
            errorRateFormatted: `${(errorRate * 100).toFixed(1)}%`,
            avgDurationMs,
            lastExecutedAt: s.lastExecutedAt,
            lastError: s.lastError,
            recentErrors: [...s.recentErrors],
        };
    }

    const globalRate = globalTotal > 0 ? globalFailed / globalTotal : 0;

    return {
        serverUptimeSeconds: uptime,
        totalToolCalls: globalTotal,
        totalSuccessCalls: globalSuccess,
        totalFailedCalls: globalFailed,
        globalErrorRate: globalRate,
        globalErrorRateFormatted: `${(globalRate * 100).toFixed(1)}%`,
        tools,
        recentFeedbackCount: feedbackLogs.length,
    };
}

export function getRecentFeedback(): Array<{ timestamp: number; category: string; feedback: string; user: string }> {
    return [...feedbackLogs];
}
