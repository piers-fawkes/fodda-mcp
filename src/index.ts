/**
 * Fodda MCP Server — Clean Architecture
 * Uses McpServer (high-level API) which is proven to work with Claude.
 * NO middleware, NO AsyncLocalStorage, NO response interceptors.
 * API key is extracted from URL query params and passed to tool handlers.
 */
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import crypto from 'crypto';
import axios from 'axios';
import { initCatalogCache } from './catalogCache.js';
import { initPricingCache } from './pricingCache.js';
import { cacheGet, cacheSet, getCacheStats } from './queryCache.js';
import { MCP_SERVER_VERSION } from './tools.js';
import { createServer } from './toolHandlers.js';
import { checkTrialLimit, incrementTrialUsage } from './trialTracker.js';
import type { TrialInteractionType } from './trialTracker.js';
import { registerA2ARoute } from './a2aHandler.js';
import * as dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';

const app = express();
app.use(express.json());

// CORS — minimal, matching test server
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// OAuth discovery endpoints — return 404 to indicate no OAuth support
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported. Use API key auth via URL: ?api_key=YOUR_KEY' });
});
app.get('/.well-known/oauth-protected-resource/:path', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});
app.post('/register', (_req, res) => {
    res.status(404).json({ error: 'OAuth not supported.' });
});

// ---------------------------------------------------------------------------
// Widget cache — stores pre-rendered HTML for browser access
// ---------------------------------------------------------------------------

const widgetCache = new Map<string, { html: string; createdAt: number }>();
const WIDGET_TTL_MS = 30 * 60 * 1000; // 30 minutes

function storeWidget(html: string): string {
    const id = crypto.randomUUID();
    widgetCache.set(id, { html, createdAt: Date.now() });
    return id;
}

// Widget serving endpoint — returns cached pre-rendered HTML
app.get('/widget/:id', (req, res) => {
    const entry = widgetCache.get(req.params.id);
    if (!entry) return res.status(404).send('<html><body><p>Widget expired or not found.</p></body></html>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Wrap in full HTML document for iframe rendering
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}</style></head><body>${entry.html}</body></html>`);
});

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const transports = new Map<string, StreamableHTTPServerTransport>();
const sessionApiKeys = new Map<string, string>();
const sessionUserIds = new Map<string, string>();
const sessionSources = new Map<string, string>();

// ---------------------------------------------------------------------------
// Periodic cleanup — prevent unbounded memory growth
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_MAX_AGE_MS = 60 * 60 * 1000;  // 1 hour

setInterval(() => {
    const now = Date.now();
    // Sweep expired widgets
    for (const [id, entry] of widgetCache) {
        if (now - entry.createdAt > WIDGET_TTL_MS) widgetCache.delete(id);
    }
    // Sweep stale sessions
    for (const [sid, transport] of transports) {
        const created = (transport as any)._createdAt;
        if (created && now - created > SESSION_MAX_AGE_MS) {
            transports.delete(sid);
            sessionApiKeys.delete(sid);
            sessionUserIds.delete(sid);
            sessionSources.delete(sid);
        }
    }
}, CLEANUP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// Service URL helper
// ---------------------------------------------------------------------------

function getServiceUrl(): string {
    return process.env.K_SERVICE
        ? `https://${process.env.K_SERVICE}-${process.env.K_REVISION?.split('-').pop() || '7mopqjzhwq'}-uk.a.run.app`
        : `http://localhost:${process.env.PORT || 8080}`;
}

// ---------------------------------------------------------------------------
// Authenticated API caller — checks query cache first
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Fodda API.
 * Checks the query cache first; stores responses on cache miss.
 *
 * For trial API keys, enforces per-user token limits via Firestore.
 * When the per-user limit is reached, throws a synthetic 403 matching
 * the format that handleTrialCreditExhaustion() expects — preserving
 * the existing trial → Base conversion flow.
 */
async function foddaRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    apiKey: string,
    userId: string,
    body?: any,
    requestId?: string,
    source?: string
): Promise<any> {
    // ── Per-user trial limit check ──
    const isTrial = apiKey.startsWith('sk_trial_');
    if (isTrial) {
        const check = await checkTrialLimit(userId);
        if (!check.allowed) {
            console.error(`[trialTracker] Per-user limit reached for ${userId} (${check.count}/${check.limit})`);
            // Throw a synthetic 403 that matches handleTrialCreditExhaustion() format
            const syntheticError: any = new Error('Per-user trial token limit reached');
            syntheticError.response = {
                status: 403,
                data: {
                    error: {
                        code: 'CREDITS_EXHAUSTED',
                        message: 'Your trial tokens have run out.',
                    },
                },
            };
            throw syntheticError;
        }
    }

    // ── Cache check ──
    const cached = cacheGet(method, path, body);
    if (cached !== null) return cached;

    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
        'X-API-Key': apiKey,
        'X-User-Id': userId,
        'X-Fodda-Timestamp': timestamp,
        'X-Fodda-Billing': 'mcp-orchestrated',  // Tells API to skip per-call billing — MCP charges lump sum via meter
        'Content-Type': 'application/json',
    };
    if (requestId) headers['X-Request-Id'] = requestId;
    if (source) headers['X-Fodda-Source'] = source;

    // HMAC sign the request
    const secret = process.env.FODDA_MCP_SECRET;
    if (secret) {
        const payload = (method === 'POST' || method === 'PATCH') && body
            ? timestamp + '.' + JSON.stringify(body)
            : timestamp + '.' + path;
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        headers['X-Fodda-Signature'] = signature;
    }

    const url = `${API_BASE_URL}${path}`;
    const response = method === 'GET'
        ? await axios.get(url, { headers, timeout: 120000 })
        : method === 'PATCH'
        ? await axios.patch(url, body, { headers, timeout: 120000 })
        : await axios.post(url, body, { headers, timeout: 120000 });

    // ── Cache store ──
    cacheSet(method, path, body, response.data);

    // ── Per-user trial increment + inject per-user remaining ──
    if (isTrial) {
        const newCount = await incrementTrialUsage(userId, 1, 'search');
        const remaining = Math.max(0, 50 - newCount);
        console.error(`[trialTracker] ${userId}: ${newCount}/50 tokens used (${remaining} remaining)`);

        // Inject per-user remaining into response so appendUsageWarning() triggers earlier
        if (response.data && typeof response.data === 'object') {
            if (!response.data.usage) response.data.usage = {};
            // Override API's shared pool remaining with per-user remaining
            // (whichever is lower takes effect via appendUsageWarning)
            const apiRemaining = response.data.usage.remaining ?? response.data.usage.credits_remaining;
            if (apiRemaining === undefined || remaining < apiRemaining) {
                response.data.usage.remaining = remaining;
                response.data.usage.credits_remaining = remaining;
            }
            response.data.usage._per_user_count = newCount;
            response.data.usage._per_user_limit = 50;
        }
    }

    return response.data;
}

// ---------------------------------------------------------------------------
// Waverunner (Gemini Interactions API) caller — parallel to foddaRequest()
// ---------------------------------------------------------------------------

/**
 * Make an authenticated Waverunner call (Gemini Interactions API).
 * This is NOT a Fodda API call — it goes directly to Google.
 *
 * Handles:
 * - Pre-check trial credits (split pools: search / deep_dive / expert_agent)
 * - Call Gemini via @google/genai SDK
 * - Post-decrement trial credits, or fire-and-forget metering for paid accounts
 * - NO caching (Waverunner calls are non-deterministic)
 *
 * When the Waverunner agent internally calls Fodda graph tools, it should
 * use FODDA_INTERNAL_API_KEY so those calls skip billing.
 */
async function waverunnerRequest(
    interactionType: TrialInteractionType,
    tokenCost: number,
    userApiKey: string,
    userId: string,
    waverunnerPayload: any
): Promise<any> {
    const isTrial = userApiKey.startsWith('sk_trial_');

    // ── Pre-check credits ──
    if (isTrial) {
        const check = await checkTrialLimit(userId, interactionType);
        if (!check.allowed) {
            console.error(`[waverunnerRequest] Trial ${interactionType} credits exhausted for ${userId}`);
            const syntheticError: any = new Error(`Trial ${interactionType} credits exhausted`);
            syntheticError.response = {
                status: 403,
                data: {
                    error: {
                        code: 'CREDITS_EXHAUSTED',
                        message: `Your trial ${interactionType.replace('_', ' ')} credits have run out.`,
                    },
                },
            };
            throw syntheticError;
        }
    }

    // ── Call Waverunner via Gemini SDK ──
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required for Waverunner calls.');
    }
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const result = await ai.interactions.create(waverunnerPayload);

    // ── Post-decrement ──
    if (isTrial) {
        await incrementTrialUsage(userId, tokenCost, interactionType);
        console.error(`[waverunnerRequest] Trial ${interactionType} charge: ${tokenCost} token(s) for ${userId}`);
    } else {
        // Decrement paid account via Fodda API metering endpoint (fire-and-forget)
        foddaRequest('POST', '/v1/research/meter', userApiKey, userId, {
            type: interactionType,
            billable_units: tokenCost,
        }).catch(err => console.error('[waverunnerRequest] Paid account metering failed:', err.message));
    }

    return result;
}

// ---------------------------------------------------------------------------
// Browser Landing Page — catch humans who paste the MCP URL into a browser
// ---------------------------------------------------------------------------

app.get('/mcp', (req, res, next) => {
    // Only intercept browser requests (Accept: text/html).
    // MCP SDK clients send application/json or text/event-stream, so they
    // fall through to the app.all('/mcp') transport handler below.
    const accept = req.headers['accept'] || '';
    if (!accept.includes('text/html')) return next();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fodda — This URL is for AI Systems</title>
<link rel="icon" type="image/png" href="${FAVICON_PNG}">
<link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}">
<meta http-equiv="refresh" content="12;url=https://www.fodda.ai">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0D0A14;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #E8E2F0;
    overflow: hidden;
  }
  /* Ambient background glow */
  body::before {
    content: '';
    position: fixed;
    top: -40%; left: -20%;
    width: 140%; height: 140%;
    background: radial-gradient(ellipse at 30% 50%, rgba(102,51,153,0.15) 0%, transparent 60%),
                radial-gradient(ellipse at 70% 60%, rgba(74,36,112,0.10) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }
  .card {
    position: relative;
    z-index: 1;
    max-width: 520px;
    width: 90%;
    padding: 2.5rem 2.5rem 2rem;
    border-radius: 20px;
    background: rgba(22, 17, 32, 0.85);
    border: 1px solid rgba(155, 114, 204, 0.25);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow: 0 0 80px rgba(102, 51, 153, 0.12), 0 4px 32px rgba(0,0,0,0.4);
    text-align: center;
    animation: cardIn 0.6s ease-out;
  }
  @keyframes cardIn {
    from { opacity: 0; transform: translateY(24px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .logo-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 2rem;
  }
  .logo-mark {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: #663399;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logo-mark span {
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    font-family: monospace;
  }
  .logo-text {
    font-size: 20px;
    font-weight: 600;
    color: #E8E2F0;
    letter-spacing: -0.5px;
  }
  .icon-row {
    margin-bottom: 1.5rem;
  }
  .icon-row svg {
    width: 56px; height: 56px;
    color: #9B72CC;
    animation: pulse 2.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.7; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.06); }
  }
  h1 {
    font-size: 1.35rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 0.75rem;
    line-height: 1.3;
  }
  .subtitle {
    font-size: 0.95rem;
    color: #A89BBE;
    line-height: 1.6;
    margin-bottom: 1.75rem;
  }
  .subtitle strong {
    color: #C9B5E0;
    font-weight: 500;
  }
  .url-preview {
    display: inline-block;
    padding: 0.45rem 1rem;
    border-radius: 8px;
    background: rgba(102, 51, 153, 0.12);
    border: 1px solid rgba(155, 114, 204, 0.2);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.72rem;
    color: #9B72CC;
    word-break: break-all;
    margin-bottom: 1.75rem;
    max-width: 100%;
  }
  .cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0.75rem 1.75rem;
    border-radius: 12px;
    background: #663399;
    color: #fff;
    font-size: 0.95rem;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 0 0 0 rgba(102,51,153,0);
    margin-bottom: 1rem;
  }
  .cta-btn:hover {
    background: #7840B0;
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(102,51,153,0.35);
  }
  .cta-btn svg { width: 16px; height: 16px; }
  .redirect-note {
    font-size: 0.78rem;
    color: #6B5A82;
    margin-top: 0.5rem;
  }
  .steps {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(155, 114, 204, 0.12);
    text-align: left;
  }
  .steps-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #6B5A82;
    margin-bottom: 0.85rem;
    text-align: center;
  }
  .step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 0.65rem;
  }
  .step-num {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: rgba(102, 51, 153, 0.2);
    color: #9B72CC;
    font-size: 0.7rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .step-text {
    font-size: 0.82rem;
    color: #A89BBE;
    line-height: 1.5;
  }
  .step-text a {
    color: #C9B5E0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .step-text a:hover { color: #fff; }
</style>
</head>
<body>
<div class="card">
  <div class="logo-row">
    <div class="logo-mark"><span>F</span></div>
    <div class="logo-text">Fodda</div>
  </div>

  <div class="icon-row">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.482 4.17a2.25 2.25 0 0 1-2.133 1.58H8.615a2.25 2.25 0 0 1-2.133-1.58L5 14.5m14 0H5" />
    </svg>
  </div>

  <h1>This URL is for AI systems,<br>not your browser</h1>

  <p class="subtitle">
    You've opened a <strong>Model Context Protocol (MCP)</strong> endpoint.
    It's designed to be used by AI assistants like Claude, ChatGPT, or Cursor &mdash;
    not visited directly in a web browser.
  </p>

  <a href="https://www.fodda.ai" class="cta-btn">
    Learn how to connect
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  </a>

  <div class="redirect-note">Redirecting to fodda.ai in a few seconds…</div>

  <div class="steps">
    <div class="steps-title">How to use this URL</div>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Copy this MCP URL from your <a href="https://app.fodda.ai/settings" target="_blank">Fodda settings</a></div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Paste it into the MCP settings of your AI tool (Claude, Cursor, Windsurf, etc.)</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Start asking questions &mdash; Fodda's knowledge graphs power your AI</div>
    </div>
  </div>
</div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// MCP Transport Handler
// ---------------------------------------------------------------------------

app.all('/mcp', async (req, res) => {
    try {
        const sessionId = req.headers['mcp-session-id'] as string;
        let transport: StreamableHTTPServerTransport;

        // Extract API key, userId, and entry ID from URL or headers
        // Priority: query string (existing MCP clients) → X-API-Key header → Authorization Bearer (Remote MCP)
        const apiKey = (req.query.api_key as string)
            || (req.headers['x-api-key'] as string)
            || (req.headers['authorization']?.toString().replace(/^Bearer\s+/i, ''))
            || '';
        const entryId = (req.query.id as string) || '';
        // If id looks like an email and no explicit user_id, use it as userId for tracking + signup
        const isEmailId = entryId.includes('@') && entryId.includes('.');
        const userId = (req.query.user_id as string) || (isEmailId ? entryId : 'anonymous');
        const source = (req.query.source as string) || '';

        if (sessionId && transports.has(sessionId)) {
            transport = transports.get(sessionId)!;
        } else if (!sessionId && req.method === 'POST') {
            const body = req.body;
            if (body?.method === 'initialize') {
                // Store API key/userId for this session
                // Wrap foddaRequest to bake in source attribution
                const boundFoddaRequest = source
                    ? ((m: any, p: any, k: any, u: any, b?: any, r?: any) => foddaRequest(m, p, k, u, b, r, source)) as typeof foddaRequest
                    : foddaRequest;
                const server = await createServer(apiKey, userId, boundFoddaRequest, waverunnerRequest, storeWidget, getServiceUrl, entryId);
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                    onsessioninitialized: (sid) => {
                        console.error(`Session created: ${sid}`);
                        transports.set(sid, transport);
                        sessionApiKeys.set(sid, apiKey);
                        sessionUserIds.set(sid, userId);
                        if (source) sessionSources.set(sid, source);
                    }
                });
                transport.onclose = () => {
                    const sid = (transport as any).sessionId;
                    if (sid) {
                        transports.delete(sid);
                        sessionApiKeys.delete(sid);
                        sessionUserIds.delete(sid);
                        sessionSources.delete(sid);
                    }
                };
                await server.connect(transport as any);
            } else {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Bad Request: Session required' },
                    id: null
                });
            }
        } else {
            return res.status(404).json({
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Session not found' },
                id: null
            });
        }

        // Inject Accept: text/event-stream if missing (prevents SDK 406)
        const accept = req.headers['accept'] || '';
        if (!accept.includes('text/event-stream')) {
            req.headers['accept'] = accept ? `${accept}, text/event-stream` : 'application/json, text/event-stream';
            const idx = req.rawHeaders?.findIndex((h: string) => h.toLowerCase() === 'accept');
            if (idx !== undefined && idx >= 0 && req.rawHeaders) {
                req.rawHeaders[idx + 1] = req.headers['accept'] as string;
            } else if (req.rawHeaders) {
                req.rawHeaders.push('Accept', req.headers['accept'] as string);
            }
        }

        await transport!.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

// Legacy SSE transport
app.get('/sse', async (req, res) => {
    const apiKey = (req.query.api_key as string) || '';
    const entryId = (req.query.id as string) || '';
    const isEmailId = entryId.includes('@') && entryId.includes('.');
    const userId = (req.query.user_id as string) || (isEmailId ? entryId : 'anonymous');
    const sessionId = crypto.randomUUID();
    const transport = new SSEServerTransport('/messages', res);
    const server = await createServer(apiKey, userId, foddaRequest, waverunnerRequest, storeWidget, getServiceUrl);
    await server.connect(transport as any);
    console.error(`SSE session: ${sessionId}`);
});

app.post('/messages', async (req, res) => {
    // SSE message handler would go here
    res.status(404).json({ error: 'Use /mcp endpoint' });
});

// Favicon — required for Anthropic Connectors Directory (Google favicon API)
const FAVICON_SVG = 'https://ucarecdn.com/e3ce77f2-661e-48a1-a294-c7c01039aed4/foddaminilogo.svg';
const FAVICON_PNG = 'https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddafavicon.png';

app.get('/favicon.ico', (_req, res) => { res.redirect(301, FAVICON_PNG); });
app.get('/favicon.svg', (_req, res) => { res.redirect(301, FAVICON_SVG); });

// Root — minimal HTML so Google's favicon crawler can find the icon
app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head>
<title>Fodda MCP Server</title>
<link rel="icon" type="image/png" href="${FAVICON_PNG}">
<link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}">
</head><body>
<h1>Fodda MCP Server v${MCP_SERVER_VERSION}</h1>
<p>Expert-curated knowledge graphs for AI agents.</p>
<p>Connect via <a href="https://app.fodda.ai">app.fodda.ai</a></p>
</body></html>`);
});

app.get('/health', (_req, res) => res.json({ status: 'ok', version: MCP_SERVER_VERSION, queryCache: getCacheStats() }));

// ---------------------------------------------------------------------------
// A2A Protocol Endpoint — agent-to-agent task delegation
// ---------------------------------------------------------------------------

registerA2ARoute(app, foddaRequest);

const PORT = parseInt(process.env.PORT || '8080');

// Initialize catalog and pricing caches before accepting connections
Promise.all([
    initCatalogCache(),
    initPricingCache(),
]).then(() => {
    app.listen(PORT, () => console.error(`Fodda MCP server v${MCP_SERVER_VERSION} on port ${PORT}`));
}).catch(() => {
    // Start anyway with hardcoded fallbacks if cache init fails
    console.error('[startup] Cache init failed — using hardcoded fallbacks');
    app.listen(PORT, () => console.error(`Fodda MCP server v${MCP_SERVER_VERSION} on port ${PORT} (fallback mode)`));
});
