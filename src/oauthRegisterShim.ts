import type { Request, Response } from 'express';
import axios from 'axios';

const CLERK_ISSUER = process.env.CLERK_ISSUER_URL || 'https://clerk.fodda.ai';

/**
 * Ensures the target scopes (openid, email, profile, offline_access) are present
 * in the space-separated scope string.
 */
function ensureRequiredScopes(scopeInput?: string): string {
    const defaultScopes = ['openid', 'email', 'profile', 'offline_access'];
    const currentScopes = (scopeInput || '').split(/\s+/).filter(Boolean);
    for (const s of defaultScopes) {
        if (!currentScopes.includes(s)) {
            currentScopes.push(s);
        }
    }
    return currentScopes.join(' ');
}

/**
 * Dynamic Client Registration (DCR) Shim Handler
 *
 * Gemini (and other DCR clients) register against Clerk via DCR. By default, Google's DCR body
 * omits the `scope` field, so Clerk grants only default scopes (`email profile offline_access`),
 * causing Clerk to reject subsequent authorization requests asking for `openid` with `invalid_scope`.
 *
 * This shim intercepts DCR requests at `/oauth/register`, injects `"openid email profile offline_access"`
 * into the forwarded request body, and forwards it to Clerk.
 */
export async function handleOauthRegister(req: Request, res: Response): Promise<void> {
    try {
        const body = req.body || {};
        const clientName = body.client_name || 'unnamed-dcr-client';

        // 1. Inject required openid scopes into body
        const requestedScope = body.scope;
        const finalScope = ensureRequiredScopes(requestedScope);
        const forwardedBody = {
            ...body,
            scope: finalScope,
        };

        console.error(`[dcr-shim] Forwarding DCR for "${clientName}" to Clerk with scope: "${finalScope}"`);

        // 2. Forward to Clerk DCR endpoint
        const clerkUrl = `${CLERK_ISSUER}/oauth/register`;
        let clerkResp: any;
        try {
            clerkResp = await axios.post(clerkUrl, forwardedBody, {
                headers: {
                    'Content-Type': req.headers['content-type'] || 'application/json',
                },
                timeout: 10000,
                validateStatus: () => true, // Pass through non-2xx status codes honestly (e.g. 429)
            });
        } catch (err: any) {
            console.error(`[dcr-shim] Network error contacting Clerk DCR:`, err.message);
            res.status(502).json({
                error: 'server_error',
                error_description: 'Failed to contact authorization server registration endpoint.',
            });
            return;
        }

        // 3. Pass through Clerk's status code honestly without retrying in a loop
        if (clerkResp.status < 200 || clerkResp.status >= 300) {
            console.error(`[dcr-shim] Clerk returned HTTP ${clerkResp.status}:`, clerkResp.data);
            res.status(clerkResp.status).json(clerkResp.data);
            return;
        }

        // 4. On success (200/201), inspect response JSON and ensure `scope` includes openid
        const respData = { ...clerkResp.data };
        if (respData && typeof respData === 'object') {
            if ('scope' in respData) {
                respData.scope = ensureRequiredScopes(respData.scope);
            } else {
                respData.scope = finalScope;
            }
        }

        console.error(`[dcr-shim] Successfully registered DCR client ${respData.client_id || ''} with scopes: "${respData.scope}"`);
        res.status(clerkResp.status).json(respData);
    } catch (error: any) {
        console.error(`[dcr-shim] Unexpected exception:`, error);
        res.status(500).json({ error: 'internal_server_error', error_description: error?.message || 'Registration failed' });
    }
}
