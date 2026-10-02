/**
 * Error Handling — access gating, trial credit exhaustion, and upgrade flows.
 *
 * Extracted from index.ts to reduce monolith size.
 * Contains all 403/402-error classification and trial-to-Base account conversion logic.
 *
 * Supports both legacy shared trial keys (sk_trial_*) and individual trial
 * accounts (planCode 13) which use unique sk_live_ keys but are identified
 * as trials by the backend via response metadata.
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

/**
 * Attempt to generate a one-click Stripe setup URL for adding a payment method.
 * Calls the App's setup-url endpoint. Returns the URL on success, or null on failure.
 * Non-blocking: failures fall back to the billing page URL.
 */
async function fetchSetupUrl(emailOrAccountId: string): Promise<string | null> {
    try {
        const body = emailOrAccountId.includes('@')
            ? { email: emailOrAccountId }
            : { accountId: emailOrAccountId };
        const response = await axios.post(
            `${APP_BASE_URL}/api/account/setup-url`,
            body,
            { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        return response.data?.setupUrl || null;
    } catch (err: any) {
        console.warn(`[setup-url] Failed to generate setup URL: ${err?.message}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify API errors for access gating.
 * Now handles both 403 Forbidden (existing) and 402 Payment Required
 * (new individual trial system, planCode 13).
 */
export function classifyAccessError(err: any): 'forbidden' | 'disabled' | 'credits' | 'legacy_retired' | null {
    const status = err.response?.status;
    if (status !== 403 && status !== 402) return null;

    const rawCode = typeof err.response?.data?.error === 'string'
        ? err.response.data.error
        : (err.response?.data?.error?.code || err.response?.data?.code || '');
    const code = rawCode.toString().toUpperCase();
    const msg = (err.response?.data?.message || err.response?.data?.error?.message || (typeof err.response?.data?.error === 'string' ? err.response.data.error : '') || err.message || '').toString().toLowerCase();

    // 402 Payment Required is always a credits/limit issue
    if (status === 402) return 'credits';

    // 403 sub-classification
    if (code === 'LEGACY_TRIAL_RETIRED') return 'legacy_retired';
    if (code === 'GRAPH_DISABLED' || msg.includes('disabled')) return 'disabled';
    if (
        code === 'CREDITS_EXHAUSTED' ||
        code === 'INSUFFICIENT_CREDITS' ||
        code === 'LIMIT_EXCEEDED' ||
        code === 'DAILY_LIMIT_EXCEEDED' ||
        code === 'PLAN_LIMIT_EXCEEDED' ||
        code === 'TRIAL_EXHAUSTED' ||
        msg.includes('credit') ||
        msg.includes('limit reached') ||
        msg.includes('limit exceeded') ||
        msg.includes('limit_exceeded') ||
        msg.includes('daily limit') ||
        msg.includes('50-call') ||
        msg.includes('trial limit')
    ) return 'credits';
    return 'forbidden'; // FORBIDDEN — plan doesn't cover this source
}

// ---------------------------------------------------------------------------
// Unified Limit Error Builder
// ---------------------------------------------------------------------------

export interface UnifiedLimitErrorOptions {
    code: 'DAILY_LIMIT_EXCEEDED' | 'PLAN_LIMIT_EXCEEDED' | 'CREDITS_EXHAUSTED' | 'TRIAL_EXHAUSTED';
    setupUrl?: string | null;
    topUpUrl?: string | null;
    overageRateUsd?: number | null;
    upgradeUrl?: string | null;
    renewsAt?: string | null;
    usage?: any;
    payg?: any;
    agentCheckout?: { url?: string; api_calls?: number; price_usd?: number; price?: number } | null;
}

export function buildChatGptQuotaExhausted(): { isError: boolean; content: { type: 'text'; text: string }[] } {
    return {
        isError: true,
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                error: 'QUOTA_EXHAUSTED',
                message: 'Monthly limit reached. Manage your Fodda account at https://app.fodda.ai/account.',
                manage_url: 'https://app.fodda.ai/account'
            }, null, 2)
        }]
    };
}

export function buildUnifiedLimitError(options: UnifiedLimitErrorOptions): {
    isError: boolean;
    content: { type: 'text'; text: string }[];
} {
    let cause = '';
    let next_action = '';
    let action = '';

    const overageRateStr = options.overageRateUsd != null ? `$${options.overageRateUsd}` : null;
    const rateSuffix = overageRateStr ? ` at ${overageRateStr} per call` : '';

    if (options.code === 'DAILY_LIMIT_EXCEEDED') {
        cause = 'Daily call limit reached on free Base tier.';
        action = options.setupUrl ? 'SETUP_CARD' : 'UPGRADE_REQUIRED';
        if (options.setupUrl) {
            next_action = `Daily call limit reached on free Base tier. Add a card to keep going without daily limits${rateSuffix}: ${options.setupUrl}`;
        } else {
            const upUrl = options.upgradeUrl || `${APP_BASE_URL}/billing`;
            next_action = `Daily call limit reached on free Base tier. Manage your billing at ${upUrl} to remove daily limits${rateSuffix}.`;
        }
    } else if (options.code === 'PLAN_LIMIT_EXCEEDED') {
        cause = 'Monthly plan API call limit exceeded.';
        action = options.setupUrl ? 'ADD_PAYMENT_METHOD' : 'VISIT_BILLING';
        if (options.setupUrl) {
            next_action = `You're out of monthly calls. Add a card to keep going${rateSuffix}: ${options.setupUrl}`;
        } else {
            const upUrl = options.upgradeUrl || `${APP_BASE_URL}?view=billing`;
            next_action = `You're out of monthly calls. Manage your billing at ${upUrl} to continue.`;
        }
    } else if (options.code === 'TRIAL_EXHAUSTED') {
        cause = 'Trial query allowance exhausted.';
        action = 'UPGRADE_REQUIRED';
        const upUrl = options.upgradeUrl || APP_BASE_URL;
        next_action = `Your trial queries have ended. Sign up or verify your email for a free Base account at ${upUrl}.`;
    } else {
        // CREDITS_EXHAUSTED
        cause = 'Monthly credit limit exhausted.';
        const checkoutUrl = options.topUpUrl || options.agentCheckout?.url || null;
        const calls = options.agentCheckout?.api_calls || options.usage?.top_up_calls || null;
        const price = options.agentCheckout?.price_usd ?? options.agentCheckout?.price ?? options.usage?.top_up_price_usd ?? null;

        if (checkoutUrl) {
            action = 'CHECKOUT_AVAILABLE';
            if (calls && price != null) {
                next_action = `Top up ${calls} calls for $${price}: ${checkoutUrl}`;
            } else if (calls) {
                next_action = `Top up ${calls} calls: ${checkoutUrl}`;
            } else if (price != null) {
                next_action = `Top up calls for $${price}: ${checkoutUrl}`;
            } else {
                next_action = `Top up calls: ${checkoutUrl}`;
            }
        } else if (options.setupUrl) {
            action = 'ADD_PAYMENT_METHOD';
            next_action = `You're out of credits this cycle. Add a card to keep going${rateSuffix}: ${options.setupUrl}`;
        } else {
            action = 'UPGRADE_REQUIRED';
            const upUrl = options.upgradeUrl || `${APP_BASE_URL}/account`;
            next_action = `You've used all your credits this cycle. Manage your account or upgrade your plan at ${upUrl}.`;
        }
    }

    const payload: Record<string, any> = {
        code: options.code,
        status: options.code,
        cause,
        next_action,
        action,
        message: next_action,
    };
    if (options.setupUrl) {
        payload.setup_url = options.setupUrl;
        payload.setupUrl = options.setupUrl;
    }
    if (options.topUpUrl) {
        payload.top_up_url = options.topUpUrl;
    }
    if (options.overageRateUsd != null) {
        payload.overage_rate_usd = options.overageRateUsd;
    }
    if (options.upgradeUrl) {
        payload.upgrade_url = options.upgradeUrl;
        payload.upgradeUrl = options.upgradeUrl;
    }
    if (options.renewsAt) {
        payload.renews_at = options.renewsAt;
    }
    if (options.usage) {
        payload.usage = options.usage;
    }
    if (options.payg) {
        payload.payg = options.payg;
    }
    if (options.agentCheckout) {
        payload.agent_checkout = options.agentCheckout;
    }

    return {
        isError: true,
        content: [{
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2)
        }]
    };
}

function extractLimitDetails(err: any, sessionUserId?: string) {
    const data = err.response?.data || {};
    const errorData = (data.error && typeof data.error === 'object') ? data.error : {};
    const rawCode = typeof data.error === 'string'
        ? data.error
        : (errorData.code || data.code || data.error_code || '');
    const code = rawCode.toString().toUpperCase();
    const msg = (data.message || errorData.message || (typeof data.error === 'string' ? data.error : '') || err.message || '').toString().toLowerCase();

    const isDaily = code === 'DAILY_LIMIT_EXCEEDED' || msg.includes('daily limit') || msg.includes('50-call');
    const isTrial = isIndividualTrial(err);
    const isPlan = code === 'PLAN_LIMIT_EXCEEDED' || code === 'LIMIT_EXCEEDED' || msg.includes('monthly api call limit') || msg.includes('monthly credit limit reached') || msg.includes('plan limit');

    let limitCode: 'DAILY_LIMIT_EXCEEDED' | 'PLAN_LIMIT_EXCEEDED' | 'CREDITS_EXHAUSTED' | 'TRIAL_EXHAUSTED';
    if (isDaily) limitCode = 'DAILY_LIMIT_EXCEEDED';
    else if (isTrial) limitCode = 'TRIAL_EXHAUSTED';
    else if (isPlan) limitCode = 'PLAN_LIMIT_EXCEEDED';
    else limitCode = 'CREDITS_EXHAUSTED';

    const email = sessionUserId && sessionUserId.includes('@') ? sessionUserId : null;
    const setupUrl = data.setupUrl || errorData.setupUrl || data.setup_url || null;
    const agentCheckout = data.agent_checkout || errorData.agent_checkout || null;
    const payg = data.payg || errorData.payg || null;
    const topUpUrl = agentCheckout?.url || data.top_up_url || payg?.checkoutUrl || payg?.url || payg?.link || null;
    const overageRateUsd = data.overage_rate_usd ?? payg?.pricePerCall ?? errorData.overage_rate_usd ?? null;
    const renewsAt = data.renews_at || data.nextRenewalDate || data.usage?.nextRenewalDate || null;
    const upgradeUrl = data.upgradeUrl || data.upgrade_url || errorData.upgradeUrl || (isTrial ? buildPortalUpgradeUrl(email) : (limitCode === 'DAILY_LIMIT_EXCEEDED' ? `${APP_BASE_URL}/billing` : `${APP_BASE_URL}?view=billing`));

    return {
        limitCode,
        email,
        setupUrl,
        agentCheckout,
        payg,
        topUpUrl,
        overageRateUsd,
        renewsAt,
        upgradeUrl,
        usage: data.usage || null,
        isTrial,
    };
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
export async function handleAccessError(err: any, toolName: string, userId?: string, apiKey?: string, source?: string): Promise<{ isError: boolean; content: { type: 'text'; text: string }[] }> {
    const accessType = classifyAccessError(err);
    if (accessType === 'forbidden') {
        // Silent skip — return empty result, NOT an error, so the LLM moves on
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ data: null, note: 'This data source is not included in the user\'s current plan. Skipping.' }) }] };
    }
    if (accessType === 'disabled') {
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ data: null, note: `This data source is currently disabled in the user's settings. They can re-enable it at https://app.fodda.ai` }) }] };
    }
    if (accessType === 'legacy_retired') {
        const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message
            || 'Legacy trial keys are no longer supported. Sign in at https://app.fodda.ai to get your new API key.';
        const signupUrl = err.response?.data?.signupUrl || 'https://app.fodda.ai';
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ status: 'LEGACY_TRIAL_RETIRED', message: errorMsg, signupUrl }) }] };
    }
    if (accessType === 'credits') {
        if (source === 'chatgpt') {
            return buildChatGptQuotaExhausted();
        }

        const isUnauthenticated = (!apiKey || apiKey === '') && (!userId || userId === 'anonymous' || userId === 'spt_agent');
        if (isUnauthenticated) {
            return {
                isError: true,
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        status: 'AUTHENTICATION_REQUIRED',
                        error_code: 'unauthenticated',
                        message: 'No Fodda account credentials or OAuth token detected for this session. Re-authentication required.',
                        instructions: source === 'chatgpt'
                            ? 'Reconnect Fodda from ChatGPT\'s connected-apps settings to sign in again.'
                            : 'To authenticate with Claude: (1) Re-authenticate or click "Connect" via Clerk OAuth in your connector settings, (2) Or use your personal connection token from https://app.fodda.ai/settings (e.g. https://mcp.fodda.ai/c/<token>), or (3) Add an Authorization header (Bearer sk_live_...).',
                        reauth_url: 'https://app.fodda.ai/connect',
                        manage_url: 'https://app.fodda.ai/settings'
                    }, null, 2)
                }]
            };
        }

        const details = extractLimitDetails(err, userId);
        let setupUrl = details.setupUrl;
        const targetUser = details.email || userId;
        if (!setupUrl && details.limitCode !== 'TRIAL_EXHAUSTED' && targetUser) {
            setupUrl = await fetchSetupUrl(targetUser);
        }

        let topUpUrl = details.topUpUrl;
        if (!topUpUrl && details.limitCode === 'CREDITS_EXHAUSTED') {
            topUpUrl = await fetchAgentCheckoutLink(details.email, 'mcp');
        }

        return buildUnifiedLimitError({
            code: details.limitCode,
            setupUrl,
            topUpUrl,
            overageRateUsd: details.overageRateUsd,
            upgradeUrl: details.upgradeUrl,
            renewsAt: details.renewsAt,
            usage: details.usage,
            payg: details.payg,
            agentCheckout: details.agentCheckout,
        });
    }
    // Not an access error — fall through to generic handling
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }] };
}

// ---------------------------------------------------------------------------
// Trial detection helpers
// ---------------------------------------------------------------------------

/**
 * Build the portal upgrade URL for a trial user.
 * Pre-fills their email so the portal can skip the identification step.
 */
function buildPortalUpgradeUrl(email?: string | null): string {
    const base = `${APP_BASE_URL}/portal`;
    const params = new URLSearchParams({ action: 'upgrade' });
    if (email && email.includes('@')) params.set('email', email);
    return `${base}?${params.toString()}`;
}

/**
 * Determine whether the error response indicates an individual trial account
 * (planCode 13). These keys look like sk_live_ but the backend tags them
 * as trial via response metadata.
 */
function isIndividualTrial(err: any): boolean {
    const data = err.response?.data || {};
    const errorObj = data.error || {};
    // Check planCode in multiple locations the backend might place it
    const planCode = data.planCode ?? data.plan_code ?? errorObj.planCode ?? errorObj.plan_code;
    if (planCode !== undefined && String(planCode) === '13') return true;
    // Check explicit boolean flags
    if (data.isTrial === true || data.is_trial === true) return true;
    if (errorObj.isTrial === true || errorObj.is_trial === true) return true;
    // Check error code
    const code = (errorObj.code || data.code || '').toString().toUpperCase();
    if (code === 'TRIAL_EXHAUSTED') return true;
    return false;
}

// ---------------------------------------------------------------------------
// Trial credit exhaustion handler
// ---------------------------------------------------------------------------

/**
 * Trial-aware credit exhaustion handler for core graph tools.
 *
 * Supports two trial flavours:
 *   1. Legacy shared trial keys  — apiKey starts with `sk_trial_`
 *   2. Individual trial accounts  — apiKey is `sk_live_` but backend returns
 *      planCode 13 / isTrial / TRIAL_EXHAUSTED in the error response.
 *
 * When a trial user hits their limit:
 *   - If ChatGPT source → clean QUOTA_EXHAUSTED with zero commerce/pricing
 *   - Non-ChatGPT → unified limit error payload with verbatim next_action
 * Falls through to generic error handling for non-credit errors.
 */
export async function handleTrialCreditExhaustion(
    err: any,
    sessionApiKey: string,
    sessionUserId: string,
    sessionSource?: string
): Promise<{ isError: boolean; content: { type: 'text'; text: string }[] } | null> {
    const accessType = classifyAccessError(err);

    // ── Legacy trial key retirement — surface API message directly ──
    if (accessType === 'legacy_retired') {
        const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message
            || 'Legacy trial keys are no longer supported. Sign up for a free Base account at app.fodda.ai to get monthly API calls.';
        const signupUrl = err.response?.data?.signupUrl || err.response?.data?.error?.signupUrl || 'https://app.fodda.ai';

        return {
            isError: false,
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    status: 'LEGACY_TRIAL_RETIRED',
                    message: errorMsg,
                    signupUrl,
                    action: 'VISIT_APP',
                    note: 'Present the message to the user exactly as written — it already contains the right context (new account created, existing account found, or signup needed). Include the signupUrl as a clickable link.',
                }, null, 2)
            }]
        };
    }

    if (accessType !== 'credits') return null; // Not a credit error — let caller handle

    // ── ChatGPT guard: zero commerce/Stripe/prices ──
    if (sessionSource === 'chatgpt') {
        return buildChatGptQuotaExhausted();
    }

    const details = extractLimitDetails(err, sessionUserId);
    let setupUrl = details.setupUrl;
    const targetUser = details.email || sessionUserId;
    if (!setupUrl && details.limitCode !== 'TRIAL_EXHAUSTED' && targetUser) {
        setupUrl = await fetchSetupUrl(targetUser);
    }

    let topUpUrl = details.topUpUrl;
    if (!topUpUrl && details.limitCode === 'CREDITS_EXHAUSTED') {
        topUpUrl = await fetchAgentCheckoutLink(details.email, 'mcp');
    }

    return buildUnifiedLimitError({
        code: details.limitCode,
        setupUrl,
        topUpUrl,
        overageRateUsd: details.overageRateUsd,
        upgradeUrl: details.upgradeUrl,
        renewsAt: details.renewsAt,
        usage: details.usage,
        payg: details.payg,
        agentCheckout: details.agentCheckout,
    });
}
