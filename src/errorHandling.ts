/**
 * Error Handling — access gating, trial credit exhaustion, and upgrade flows.
 *
 * Extracted from index.ts to reduce monolith size.
 * Contains all 403-error classification and trial-to-Base account conversion logic.
 */

import axios from 'axios';

const API_BASE_URL = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const APP_BASE_URL = process.env.FODDA_APP_URL || 'https://app.fodda.ai';

// ---------------------------------------------------------------------------
// Agent Checkout — Stripe session creation for inline credit purchase
// ---------------------------------------------------------------------------

/**
 * Attempt to create a Stripe Checkout session via the App's agent-session endpoint.
 * Returns the checkout URL on success, or null on failure.
 * Non-blocking: failures fall back to the pricing page URL.
 */
async function fetchAgentCheckoutLink(email: string | null, source: string = 'mcp'): Promise<string | null> {
    try {
        const response = await axios.post(
            `${APP_BASE_URL}/api/account/checkout/agent-session`,
            { email, source },
            { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        return response.data?.checkoutUrl || response.data?.url || null;
    } catch (err: any) {
        console.warn(`[agent-checkout] Failed to create checkout session: ${err?.message}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Classify API errors for access gating (API now returns 403 with error codes). */
export function classifyAccessError(err: any): 'forbidden' | 'disabled' | 'credits' | null {
    const status = err.response?.status;
    if (status !== 403) return null;
    const code = (err.response?.data?.error?.code || err.response?.data?.code || '').toString().toUpperCase();
    const msg = (err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || '').toString().toLowerCase();
    if (code === 'GRAPH_DISABLED' || msg.includes('disabled')) return 'disabled';
    if (code === 'CREDITS_EXHAUSTED' || code === 'INSUFFICIENT_CREDITS' || msg.includes('credit')) return 'credits';
    return 'forbidden'; // FORBIDDEN — plan doesn't cover this source
}

// ---------------------------------------------------------------------------
// Access error response builder
// ---------------------------------------------------------------------------

/**
 * Build a user-friendly response for 403 errors on supplemental tools.
 * FORBIDDEN → silent skip (return empty data, not an error)
 * GRAPH_DISABLED → mention it so the user knows they opted out
 * CREDITS → trial-aware handling (auto-upgrade or prompt for email)
 */
export async function handleAccessError(err: any, toolName: string): Promise<{ isError: boolean; content: { type: 'text'; text: string }[] }> {
    const accessType = classifyAccessError(err);
    if (accessType === 'forbidden') {
        // Silent skip — return empty result, NOT an error, so the LLM moves on
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ data: null, note: 'This data source is not included in the user\'s current plan. Skipping.' }) }] };
    }
    if (accessType === 'disabled') {
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ data: null, note: `This data source is currently disabled in the user's settings. They can re-enable it at https://app.fodda.ai` }) }] };
    }
    if (accessType === 'credits') {
        const errorData = err.response?.data?.error || err.response?.data || {};
        const msg = errorData.message || 'Query limit reached.';
        const upsell = errorData.upsell || null;
        const usage = err.response?.data?.usage || null;
        const payg = err.response?.data?.payg || null;
        const agentCheckout = err.response?.data?.agent_checkout || null;

        // Try to get an inline checkout link (best-effort, non-blocking)
        let checkoutUrl = agentCheckout?.url || null;
        if (!checkoutUrl) {
            checkoutUrl = await fetchAgentCheckoutLink(null, 'mcp');
        }

        const response: Record<string, any> = {
            status: 'CREDITS_EXHAUSTED',
            message: checkoutUrl
                ? `⚡ You've used all your Fodda credits this cycle.\n\n🛒 **Buy 100 more tokens →** ${checkoutUrl}\n\nThis opens a secure Stripe Checkout page. After payment, your credits will be available immediately.\n\nAlternatively, you can upgrade your plan at https://app.fodda.ai`
                : msg,
            upsell: upsell,
            usage: usage,
            action: checkoutUrl ? 'CHECKOUT_AVAILABLE' : 'UPGRADE_REQUIRED',
            note: 'Present the checkout link prominently. Also mention the upgrade option and PAYG as alternatives.',
        };
        if (checkoutUrl) {
            response.checkout_url = checkoutUrl;
        }
        if (payg) {
            response.payg = payg;
        }

        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: JSON.stringify(response, null, 2)
            }]
        };
    }
    // Not an access error — fall through to generic handling
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
}

// ---------------------------------------------------------------------------
// Trial credit exhaustion handler
// ---------------------------------------------------------------------------

/**
 * Trial-aware credit exhaustion handler for core graph tools.
 * When a trial key runs out of credits:
 *   - If userId (email) is available → attempt auto-upgrade to Base account
 *   - If no userId → prompt user to provide their email
 *   - If not a trial key → standard credit exhaustion message
 * Falls through to generic error handling for non-credit errors.
 */
export async function handleTrialCreditExhaustion(
    err: any,
    sessionApiKey: string,
    sessionUserId: string
): Promise<{ isError: boolean; content: { type: 'text'; text: string }[] } | null> {
    const accessType = classifyAccessError(err);
    if (accessType !== 'credits') return null; // Not a credit error — let caller handle

    const isTrial = sessionApiKey.startsWith('sk_trial_');

    if (isTrial && sessionUserId && sessionUserId !== 'anonymous') {
        // AUTO-UPGRADE: We have the email, create Base account via App trial-convert endpoint
        try {
            // Derive firstName from email prefix as fallback
            const firstName = (sessionUserId.split('@')[0] || 'User').replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            const convertBody = {
                email: sessionUserId,
                trialKey: sessionApiKey,
                firstName,
            };

            const convertResponse = await axios.post(
                `${APP_BASE_URL}/api/account/trial-convert`,
                convertBody,
                { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
            );

            if (convertResponse.data?.ok && !convertResponse.data?.alreadyExists) {
                return {
                    isError: false,
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'UPGRADED',
                            message: `I've created your Base account — you'll get ${convertResponse.data.monthlyTokens || 100} tokens/month. You now have a central dashboard at https://app.fodda.ai where you can invite team members, manage your research profile, and toggle specific knowledge graphs on/off. Check your email for a confirmation link to get started.`,
                            plan: convertResponse.data.plan || 'Base',
                            monthly_token_limit: convertResponse.data.monthlyTokens || 100,
                            graphId: convertResponse.data.graphId || null,
                            accountId: convertResponse.data.accountId || null,
                        }, null, 2)
                    }]
                };
            }

            if (convertResponse.data?.alreadyExists) {
                return {
                    isError: false,
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            status: 'EXISTING_ACCOUNT',
                            message: `It looks like you already have a Fodda account with ${sessionUserId}. Log in at https://app.fodda.ai to grab your MCP URL and update your connector.`,
                        }, null, 2)
                    }]
                };
            }
        } catch (upgradeErr) {
            console.error('[trial-convert] Auto-upgrade failed, falling through to manual flow:', (upgradeErr as any)?.message);
            // Fall through to manual prompt
        }
    }

    if (isTrial) {
        // PROMPT FOR EMAIL: Trial users move to Base via email collection, NO payment link shown.
        return {
            isError: false,
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    status: 'TRIAL_EXHAUSTED',
                    message: "Your trial tokens have run out — but I can get you 100 tokens/month by signing you up for a Fodda Base account instantly. This includes a central dashboard at app.fodda.ai to manage your team and knowledge graphs. All I need is your email address. Would you like me to set that up?",
                    action: 'COLLECT_EMAIL',
                    note: 'Trial → Base transition is FREE. Do NOT show payment links to trial users. Collect email to create their account.'
                }, null, 2)
            }]
        };
    }

    // Non-trial credit exhaustion — use API's specialized message + upsell (Base users)
    // Phase 3: attempt to create an inline Stripe Checkout link for immediate purchase
    const errorData = err.response?.data?.error || err.response?.data || {};
    const apiMsg = errorData.message || "You've used all your tokens for this month.";
    const upsell = errorData.upsell || null;
    const usage = err.response?.data?.usage || null;
    const payg = err.response?.data?.payg || null;
    const agentCheckout = err.response?.data?.agent_checkout || null;

    // Resolve email: session userId (if it's an email), or null
    const email = sessionUserId && sessionUserId.includes('@') ? sessionUserId : null;

    // Try to get an inline checkout link (best-effort, non-blocking)
    let checkoutUrl = agentCheckout?.url || null;
    if (!checkoutUrl) {
        checkoutUrl = await fetchAgentCheckoutLink(email, 'mcp');
    }

    const response: Record<string, any> = {
        status: 'CREDITS_EXHAUSTED',
        message: checkoutUrl
            ? `⚡ You've used all your Fodda credits this cycle.\n\n🛒 **Buy 100 more tokens →** ${checkoutUrl}\n\nThis opens a secure Stripe Checkout page. After payment, your credits will be available immediately.\n\nAlternatively, you can upgrade your plan at https://app.fodda.ai`
            : apiMsg,
        upsell: upsell,
        usage: usage,
        action: checkoutUrl ? 'CHECKOUT_AVAILABLE' : 'VISIT_APP',
        manage_url: 'https://app.fodda.ai',
    };
    if (checkoutUrl) {
        response.checkout_url = checkoutUrl;
        if (!email) {
            response.checkout_note = "You'll be asked for your email during checkout.";
        }
    }
    if (payg) {
        response.payg = payg;
    }

    return {
        isError: false,
        content: [{
            type: 'text' as const,
            text: JSON.stringify(response, null, 2)
        }]
    };
}
