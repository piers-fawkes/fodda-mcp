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

    const code = (err.response?.data?.error?.code || err.response?.data?.code || '').toString().toUpperCase();
    const msg = (err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || '').toString().toLowerCase();

    // 402 Payment Required is always a credits/limit issue
    if (status === 402) return 'credits';

    // 403 sub-classification
    if (code === 'LEGACY_TRIAL_RETIRED') return 'legacy_retired';
    if (code === 'GRAPH_DISABLED' || msg.includes('disabled')) return 'disabled';
    if (
        code === 'CREDITS_EXHAUSTED' ||
        code === 'INSUFFICIENT_CREDITS' ||
        code === 'LIMIT_EXCEEDED' ||
        code === 'PLAN_LIMIT_EXCEEDED' ||
        code === 'TRIAL_EXHAUSTED' ||
        msg.includes('credit') ||
        msg.includes('limit reached') ||
        msg.includes('limit exceeded') ||
        msg.includes('trial limit')
    ) return 'credits';
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
    if (accessType === 'legacy_retired') {
        const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message
            || 'Legacy trial keys are no longer supported. Sign up at app.fodda.ai.';
        const signupUrl = err.response?.data?.signupUrl || 'https://app.fodda.ai';
        return { isError: false, content: [{ type: 'text' as const, text: JSON.stringify({ status: 'LEGACY_TRIAL_RETIRED', message: errorMsg, signupUrl }) }] };
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
                ? `⚡ You've used all your Fodda credits this cycle.\n\n🛒 **Buy 100 more API calls →** ${checkoutUrl}\n\nThis opens a secure Stripe Checkout page. After payment, your credits will be available immediately.\n\nAlternatively, you can upgrade your plan at https://app.fodda.ai`
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
            const paygUrl = payg.checkoutUrl || payg.url || payg.link;
            response.message += `\n\n💳 **Pay-as-you-go:** keep querying without a plan — billed per API call.${paygUrl ? ` Set it up here: ${paygUrl}` : ''}`;
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
 * When a trial user hits their limit (25 lifetime queries for individual,
 * 50 per-user for legacy):
 *   - If userId (email) is available → attempt auto-upgrade to Base account
 *   - If no userId → show upgrade portal link
 *   - If not a trial key → standard credit exhaustion message
 * Falls through to generic error handling for non-credit errors.
 */
export async function handleTrialCreditExhaustion(
    err: any,
    sessionApiKey: string,
    sessionUserId: string
): Promise<{ isError: boolean; content: { type: 'text'; text: string }[] } | null> {
    const accessType = classifyAccessError(err);

    // ── Legacy trial key retirement — surface API message directly ──
    if (accessType === 'legacy_retired') {
        const errorMsg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message
            || 'Legacy trial keys are no longer supported. Sign up for a free Base account at app.fodda.ai to get 100 API calls/month.';
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

    // sk_trial_ keys are retired — isLegacyTrial always false.
    // Individual trial accounts (planCode 13) use sk_live_ keys; detected from the error response.
    const isNewTrial = isIndividualTrial(err);
    const isTrial = isNewTrial;

    // Extract usage metadata from the error response (backend may include it)
    const errUsage = err.response?.data?.usage || null;
    const usedCount = errUsage?.used ?? errUsage?.queries_used ?? null;
    const limitCount = errUsage?.limit ?? errUsage?.query_limit ?? (isNewTrial ? 25 : null);

    if (isTrial) {
        const portalUrl = buildPortalUpgradeUrl(
            sessionUserId && sessionUserId !== 'anonymous' ? sessionUserId : null
        );
        const usageNote = (usedCount !== null && limitCount !== null)
            ? ` (${usedCount}/${limitCount} queries used)`
            : '';

        return {
            isError: false,
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    status: 'TRIAL_EXHAUSTED',
                    message: `Your Fodda trial limit has been reached${usageNote}. Upgrade to the free **Base** plan (100 queries/month upon email verification) or a paid plan to continue using Fodda.\n\n🚀 **[Upgrade Now →](${portalUrl})**`,
                    action: 'UPGRADE_REQUIRED',
                    upgrade_url: portalUrl,
                    note: 'Present the upgrade link prominently. The Base plan is FREE and gives 100 queries/month after email verification.',
                }, null, 2)
            }]
        };
    }

    // Non-trial credit exhaustion — handles both legacy CREDITS_EXHAUSTED and new PLAN_LIMIT_EXCEEDED
    const errorData = err.response?.data?.error || err.response?.data || {};
    const errCode = (errorData.code || err.response?.data?.code || '').toString().toUpperCase();
    const apiMsg = errorData.message || "You've used all your API calls for this month.";
    const upsell = errorData.upsell || null;
    const usage = err.response?.data?.usage || null;
    const payg = err.response?.data?.payg || null;
    const agentCheckout = err.response?.data?.agent_checkout || null;

    // Resolve email: session userId (if it's an email), or null
    const email = sessionUserId && sessionUserId.includes('@') ? sessionUserId : null;

    // ── PLAN_LIMIT_EXCEEDED — overage billing (no card on file) ──
    // The upstream API returns setupUrl directly; if missing, fetch it ourselves
    if (errCode === 'PLAN_LIMIT_EXCEEDED') {
        let setupUrl = err.response?.data?.setupUrl || errorData.setupUrl || null;
        if (!setupUrl && (email || sessionUserId)) {
            setupUrl = await fetchSetupUrl(email || sessionUserId);
        }
        const upgradeUrl = `${APP_BASE_URL}?view=billing`;

        const response: Record<string, any> = {
            status: 'PLAN_LIMIT_EXCEEDED',
            code: 'PLAN_LIMIT_EXCEEDED',
            message: setupUrl
                ? `⚡ Monthly API call limit exceeded. Add a payment method to continue at $0.20/API call.\n\n💳 **[Add payment method →](${setupUrl})**\n\nThis is a one-click Stripe link to add a card. After adding, queries resume immediately with overage billing.\n\nOr manage your billing at ${upgradeUrl}`
                : `⚡ Monthly API call limit exceeded. Add a payment method to continue at $0.20/API call.\n\nManage your billing at ${upgradeUrl}`,
            action: setupUrl ? 'ADD_PAYMENT_METHOD' : 'VISIT_BILLING',
            note: 'Present the setupUrl prominently — it is a one-click card addition link. The upgradeUrl lets them manage billing.',
        };
        if (setupUrl) response.setupUrl = setupUrl;
        response.upgradeUrl = upgradeUrl;
        if (usage) response.usage = usage;

        return {
            isError: true,
            content: [{
                type: 'text' as const,
                text: JSON.stringify(response, null, 2)
            }]
        };
    }

    // ── Legacy credit exhaustion — checkout link + upsell (Base users) ──
    // Try to get an inline checkout link (best-effort, non-blocking)
    let checkoutUrl = agentCheckout?.url || null;
    if (!checkoutUrl) {
        checkoutUrl = await fetchAgentCheckoutLink(email, 'mcp');
    }

    const portalUrl = buildPortalUpgradeUrl(email);
    const response: Record<string, any> = {
        status: 'CREDITS_EXHAUSTED',
        message: checkoutUrl
            ? `⚡ You've used all your Fodda credits this cycle.\n\n🛒 **Buy 100 more API calls →** ${checkoutUrl}\n\nThis opens a secure Stripe Checkout page. After payment, your credits will be available immediately.\n\nAlternatively, you can upgrade your plan at ${portalUrl}`
            : apiMsg,
        upsell: upsell,
        usage: usage,
        action: checkoutUrl ? 'CHECKOUT_AVAILABLE' : 'VISIT_APP',
        manage_url: portalUrl,
    };
    if (checkoutUrl) {
        response.checkout_url = checkoutUrl;
        if (!email) {
            response.checkout_note = "You'll be asked for your email during checkout.";
        }
    }
    if (payg) {
        response.payg = payg;
        const paygUrl = payg.checkoutUrl || payg.url || payg.link;
        response.message += `\n\n💳 **Pay-as-you-go:** keep querying without a plan — billed per API call.${paygUrl ? ` Set it up here: ${paygUrl}` : ''}`;
    }

    return {
        isError: false,
        content: [{
            type: 'text' as const,
            text: JSON.stringify(response, null, 2)
        }]
    };
}
