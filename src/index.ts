#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import crypto from "crypto";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { TOOLS, MCP_SERVER_VERSION } from "./tools.js";

dotenv.config();

const API_BASE_URL = process.env.FODDA_API_URL || "https://api.fodda.ai";
const IS_DEV = process.env.NODE_ENV === "development";
const DUMMY_API_KEY = "dummy-test-key";
const DUMMY_USER_ID = "dummy-test-user";

const server = new Server(
    {
        name: "fodda-mcp",
        version: MCP_SERVER_VERSION,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const graphId = (args as any)?.graphId;
    let userId = (args as any)?.userId;

    // Validate graphId for tools that require it
    if (name !== "psfk_overview" && !graphId) {
        throw new Error("graphId is required for all Fodda tools except psfk_overview.");
    }

    // Extract Bearer Token from _meta
    const authHeader = (request.params as any)._meta?.authorization || "";
    let apiKey = typeof authHeader === 'string' && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    // Strict Enforcement / Dev Mode Fallback
    if (!apiKey) {
        if (IS_DEV) {
            apiKey = DUMMY_API_KEY;
        } else {
            return {
                isError: true,
                content: [{ type: "text", text: "Error: No API Key provided. Please include a Bearer token in the 'authorization' field of the MCP request _meta." }],
            };
        }
    }

    if (!userId) {
        if (IS_DEV) {
            userId = DUMMY_USER_ID;
        } else {
            return {
                isError: true,
                content: [{ type: "text", text: "Error: No userId provided. This field is required for tracking and billing." }],
            };
        }
    }

    // Enterprise Readiness: Simulated Gemini Tool Invocation Mode
    // strictly enforced production constraints
    const meta = (request.params as any)._meta || {};
    const testMode = meta.test_mode;

    if (testMode) {
        // 1. Strict Value Check
        if (testMode !== "gemini_echo") {
            // Silently ignore unknown test modes or throw error? 
            // "Reject unknown test modes" -> Throwing error is safer to signal invalid usage
            return {
                isError: true,
                content: [{ type: "text", text: `Error: Invalid test_mode '${testMode}'. Only 'gemini_echo' is supported.` }]
            };
        }

        // 2. Production Guardrails
        // Simulation is ignored (treated as normal unauthorized/error if it falls through, or just explicitly blocked here)
        // unless ENV != production OR API key has role internal_testing.
        // We assume 'apiKey' variable holds the extracted key.
        // Since we can't check roles dynamically without a DB call, we'll use a placeholder logic or ENV var for now.
        const isInternalKey = process.env.INTERNAL_TEST_KEYS?.split(',').includes(apiKey || "");
        const isProduction = process.env.NODE_ENV === "production";

        if (isProduction && !isInternalKey) {
            // In production, matching keys are required to use simulation.
            // If not internal key, we pretend simulation doesn't exist or return error?
            // "Be ignored unless..." -> Proceed to normal execution path (which handles auth/tool call normally)
            // But wait, if we proceed, it tries to execute the tool for real.
            // If the intention is to SAFEGUARD against accidental real execution, we should probably BLOCK if test_mode is present but unauthorized.
            // However, "Be ignored" implies falling back to normal behavior OR just doing nothing.
            // Safest Enterprise approach: If you ASK for test_mode but aren't allowed, FAIL. Don't fall back to real execution which might cost money.
            return {
                isError: true,
                content: [{ type: "text", text: "Error: Simulation mode not permitted in production without internal privileges." }]
            };
        }

        // 3. Structured Logging
        console.error(JSON.stringify({
            event: "mcp.tool_call.simulation",
            simulation_mode: true,
            simulation_type: "gemini_echo",
            tool: name,
            graphId,
            userId
        }));

        // 4. Gemini Echo Response
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    tool_calls: [{
                        name: name,
                        arguments: args
                    }]
                }, null, 2)
            }]
        };
    }

    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
        "X-API-Key": apiKey,
        "X-User-Id": userId,
        "X-Fodda-Timestamp": timestamp,
        "Content-Type": "application/json",
    };

    // Helper to sign payload
    const signRequest = (body: any) => {
        const secret = process.env.FODDA_MCP_SECRET;
        if (secret) {
            const payload = timestamp + "." + JSON.stringify(body);
            const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
            headers["X-Fodda-Signature"] = signature;
        }
    };

    const startTime = Date.now();
    try {
        let response;
        switch (name) {
            case "search_graph": {
                const limit = Math.min(Number(args?.limit) || 25, 50); // Defense in Depth: Cap results
                const body = {
                    query: args?.query,
                    limit: limit,
                    use_semantic: args?.use_semantic !== false,
                };
                signRequest(body);
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/search`, body, { headers });
                break;
            }

            case "get_neighbors": {
                const depth = Math.min(Number(args?.depth) || 1, 2);   // Defense in Depth: Cap traversal depth
                const limit = Math.min(Number(args?.limit) || 50, 50); // Defense in Depth: Cap results
                const body = {
                    seed_node_ids: args?.seed_node_ids,
                    relationship_types: args?.relationship_types,
                    depth: depth,
                    limit: limit,
                };
                signRequest(body);
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/neighbors`, body, { headers });
                break;
            }

            case "get_evidence": {
                const top_k = Math.min(Number(args?.top_k) || 5, 10);  // Defense in Depth: Cap evidence sources
                const body = {
                    for_node_id: args?.for_node_id,
                    top_k: top_k,
                };
                signRequest(body);
                response = await axios.post(`${API_BASE_URL}/v1/graphs/${graphId}/evidence`, body, { headers });
                break;
            }

            case "get_node": {
                const getNodePath = `/v1/graphs/${graphId}/nodes/${args?.nodeId}`;
                const getNodeSecret = process.env.FODDA_MCP_SECRET;
                if (getNodeSecret) {
                    const payload = timestamp + "." + getNodePath;
                    const signature = crypto.createHmac("sha256", getNodeSecret).update(payload).digest("hex");
                    headers["X-Fodda-Signature"] = signature;
                }
                response = await axios.get(`${API_BASE_URL}${getNodePath}`, { headers });
                break;
            }

            case "get_label_values": {
                const getLabelPath = `/v1/graphs/${graphId}/labels/${args?.label}/values`;
                const getLabelSecret = process.env.FODDA_MCP_SECRET;
                if (getLabelSecret) {
                    const payload = timestamp + "." + getLabelPath;
                    const signature = crypto.createHmac("sha256", getLabelSecret).update(payload).digest("hex");
                    headers["X-Fodda-Signature"] = signature;
                }
                response = await axios.get(`${API_BASE_URL}${getLabelPath}`, { headers });
                break;
            }

            case "psfk_overview": {
                // Logic: At least one of industry or sector is required
                const industry = args?.industry as string | undefined;
                const sector = args?.sector as string | undefined;

                if (!industry && !sector) {
                    throw new Error("At least one of 'industry' or 'sector' must be provided for psfk_overview.");
                }

                const body = {
                    industry,
                    sector,
                    region: args?.region,
                    timeframe: args?.timeframe,
                };
                signRequest(body);
                response = await axios.post(`${API_BASE_URL}/v1/psfk/overview`, body, { headers });
                break;
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        const durationMs = Date.now() - startTime;
        const usage = response.data.usage || { total_billable_units: 0 };

        // Structured Audit Log for Enterprise Traceability (Refined for Security Compliance)
        console.error(JSON.stringify({
            event: "mcp.tool_call",
            tool: name,
            graphId,
            userId, // Corresponds to tenant/user identity
            status: response.status,
            durationMs,
            billable_units: usage.total_billable_units,
            deterministic: false,
            layer: "mcp_proxy"
        }));

        return {
            content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };

    } catch (error: any) {
        const durationMs = Date.now() - startTime;
        console.error(JSON.stringify({
            event: "mcp.tool_error",
            tool: name,
            graphId,
            userId,
            status: error.response?.status || 500,
            durationMs,
            error: error.response?.data?.message || error.message
        }));
        return {
            isError: true,
            content: [{ type: "text", text: `Error calling Fodda API: ${error.response?.data?.message || error.message}` }],
        };
    }
});

/**
 * Start the server.
 */
async function main() {
    if (process.env.PORT) {
        const app = express();
        app.set("trust proxy", true);
        const port = parseInt(process.env.PORT) || 8080;
        const transports = new Map<string, SSEServerTransport>();

        // Security: HMAC Signature Verification Middleware
        const verifySignature = (req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip verification for public/health endpoints
            if ((req.path === "/mcp/tools" || req.path === "/health" || req.path === "/.well-known/mcp.json") && req.method === "GET") {
                return next();
            }

            const signature = req.headers["x-fodda-signature"];
            const secret = process.env.FODDA_MCP_SECRET;

            if (!secret) {
                console.error("CRITICAL: FODDA_MCP_SECRET not set in environment.");
                return res.status(500).json({ error: "Server misconfiguration" });
            }

            if (!signature || typeof signature !== 'string') {
                return res.status(401).json({ error: "Missing or invalid signature" });
            }


            const payload = JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac("sha256", secret)
                .update(payload)
                .digest("hex");

            // Timing-safe comparison
            const trusted = Buffer.from(expectedSignature, 'ascii');
            const untrusted = Buffer.from(signature, 'ascii');

            if (trusted.length !== untrusted.length || !crypto.timingSafeEqual(trusted, untrusted)) {
                console.error("❌ Invalid Signature:", signature, "Expected:", expectedSignature);
                return res.status(401).json({ error: "Invalid signature" });
            }

            next();
        };

        // --- Per-Key Rate Limiting ---
        const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
        const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_RPM || "60", 10);

        interface RateLimitEntry {
            count: number;
            windowStart: number;
        }
        const rateLimitMap = new Map<string, RateLimitEntry>();

        // Clean up expired entries every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of rateLimitMap) {
                if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
                    rateLimitMap.delete(key);
                }
            }
        }, 5 * 60_000);

        const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
            // Skip rate limiting for public/health endpoints
            if ((req.path === "/mcp/tools" || req.path === "/health" || req.path === "/.well-known/mcp.json") && req.method === "GET") {
                return next();
            }

            // Extract key from API key header or fallback to IP
            const apiKey = (req.headers["x-api-key"] as string) || req.ip || "unknown";
            const now = Date.now();
            const entry = rateLimitMap.get(apiKey);

            if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
                // New window
                rateLimitMap.set(apiKey, { count: 1, windowStart: now });
            } else {
                entry.count++;
                if (entry.count > RATE_LIMIT_MAX) {
                    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
                    console.error(JSON.stringify({
                        event: "mcp.rate_limit",
                        apiKey: apiKey.substring(0, 8) + "...",
                        count: entry.count,
                        limit: RATE_LIMIT_MAX,
                    }));
                    res.set("Retry-After", String(retryAfter));
                    return res.status(429).json({
                        error: "Rate limit exceeded",
                        limit: RATE_LIMIT_MAX,
                        window: "60s",
                        retry_after: retryAfter,
                    });
                }
            }

            // Set rate limit headers
            const current = rateLimitMap.get(apiKey)!;
            res.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
            res.set("X-RateLimit-Remaining", String(Math.max(0, RATE_LIMIT_MAX - current.count)));
            res.set("X-RateLimit-Reset", String(Math.ceil((current.windowStart + RATE_LIMIT_WINDOW_MS) / 1000)));

            next();
        };

        // Parse JSON bodies with size limit (required for signature verification)
        app.use(express.json({ limit: '1mb' }));

        // Rate limiting (before HMAC to reject early)
        app.use(rateLimiter);

        // HMAC Signature Verification
        app.use(verifySignature);

        app.get("/sse", async (req, res) => {
            const sessionId = crypto.randomUUID();
            console.error(`New SSE connection established (session: ${sessionId})`);
            const transport = new SSEServerTransport("/messages", res);
            transports.set(sessionId, transport);

            // Clean up on disconnect
            res.on("close", () => {
                transports.delete(sessionId);
                console.error(`SSE session ${sessionId} disconnected (${transports.size} active)`);
            });

            await server.connect(transport);
        });

        app.post("/messages", async (req, res) => {
            // Find the appropriate transport by checking the sessionId query param
            const sessionId = req.query.sessionId as string;
            if (sessionId && transports.has(sessionId)) {
                await transports.get(sessionId)!.handlePostMessage(req, res);
            } else if (transports.size === 1) {
                // Fallback: single-client mode
                const [transport] = transports.values();
                await transport!.handlePostMessage(req, res);
            } else if (transports.size === 0) {
                res.status(400).send("No SSE connections established");
            } else {
                res.status(400).send("Multiple SSE sessions active. Specify sessionId query parameter.");
            }
        });

        // Health check for Cloud Run liveness/readiness probes
        app.get("/health", (req, res) => {
            res.json({ status: "ok", version: MCP_SERVER_VERSION });
        });

        // Enterprise Transparency: Tool Capability Registry
        app.get("/mcp/tools", (req, res) => {
            res.json({
                tools: TOOLS,
                count: TOOLS.length,
                version: MCP_SERVER_VERSION
            });
        });

        // MCP Server Discovery (emerging .well-known standard)
        app.get("/.well-known/mcp.json", (req, res) => {
            res.json({
                name: "ai.fodda/mcp-server",
                title: "Fodda Knowledge Graphs",
                description: "Expert-curated knowledge graphs for AI agents — PSFK Retail, Beauty, Sports and more.",
                version: MCP_SERVER_VERSION,
                transport: {
                    type: "sse",
                    url: `${req.protocol}://${req.get("host")}/sse`
                },
                tools_endpoint: `${req.protocol}://${req.get("host")}/mcp/tools`,
                health_endpoint: `${req.protocol}://${req.get("host")}/health`
            });
        });

        const httpServer = app.listen(port, () => {
            console.error(`Fodda MCP server running on SSE at http://localhost:${port}/sse`);
        });

        // Graceful shutdown for Cloud Run
        const shutdown = () => {
            console.error("Shutting down gracefully...");
            httpServer.close(() => {
                console.error(`Closed ${transports.size} active SSE connections.`);
                process.exit(0);
            });
            // Force exit after 10s if connections don't close
            setTimeout(() => process.exit(1), 10000);
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Fodda MCP server running on stdio");
    }
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
