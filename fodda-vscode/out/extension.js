"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MCP_BASE_URL = 'https://mcp.fodda.ai/mcp';
const APP_BASE_URL = 'https://app.fodda.ai';
const API_BASE_URL = 'https://api.fodda.ai';
const OUTPUT_CHANNEL_NAME = 'Fodda';
const STATUS_BAR_PRIORITY = 100;
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let statusBarItem;
let outputChannel;
// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    // Register the Connect command
    const connectCmd = vscode.commands.registerCommand('fodda.connect', handleConnect);
    context.subscriptions.push(connectCmd);
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUS_BAR_PRIORITY);
    statusBarItem.command = 'fodda.connect';
    statusBarItem.tooltip = 'Fodda: Connect to MCP';
    context.subscriptions.push(statusBarItem);
    // Update status bar on activation and on settings changes
    updateStatusBar();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('fodda')) {
            updateStatusBar();
        }
    }));
    outputChannel.appendLine('Fodda extension activated.');
}
function deactivate() {
    // Cleanup handled by VS Code's disposable system
}
// ---------------------------------------------------------------------------
// Connect Command
// ---------------------------------------------------------------------------
async function handleConnect() {
    const config = vscode.workspace.getConfiguration('fodda');
    let apiKey = config.get('apiKey', '').trim();
    let userEmail = config.get('userEmail', '').trim();
    // Prompt for API key if missing
    if (!apiKey) {
        const inputKey = await vscode.window.showInputBox({
            title: 'Fodda API Key',
            prompt: 'Enter your Fodda API key (starts with fk_live_ or sk_live_)',
            placeHolder: 'fk_live_...',
            ignoreFocusOut: true,
            validateInput: (value) => {
                const v = value.trim();
                if (!v) {
                    return 'API key is required';
                }
                if (!v.startsWith('fk_live_') && !v.startsWith('sk_live_') && !v.startsWith('sk_trial_')) {
                    return 'API key should start with fk_live_, sk_live_, or sk_trial_';
                }
                return null;
            },
        });
        if (!inputKey) {
            vscode.window.showWarningMessage('Fodda: Connection cancelled — no API key provided.');
            return;
        }
        apiKey = inputKey.trim();
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    }
    // Prompt for email if missing
    if (!userEmail) {
        const inputEmail = await vscode.window.showInputBox({
            title: 'Fodda Account Email',
            prompt: 'Enter the email address associated with your Fodda account',
            placeHolder: 'you@company.com',
            ignoreFocusOut: true,
            validateInput: (value) => {
                const v = value.trim();
                if (!v) {
                    return 'Email is required';
                }
                if (!v.includes('@') || !v.includes('.')) {
                    return 'Please enter a valid email address';
                }
                return null;
            },
        });
        if (!inputEmail) {
            vscode.window.showWarningMessage('Fodda: Connection cancelled — no email provided.');
            return;
        }
        userEmail = inputEmail.trim();
        await config.update('userEmail', userEmail, vscode.ConfigurationTarget.Global);
    }
    // Construct MCP URL
    const mcpUrl = buildMcpUrl(apiKey, userEmail);
    // Verify connection and check for trial limit issues
    const limitReached = await verifyConnection(apiKey, userEmail);
    if (limitReached) {
        // Trial limit notification was already shown — still copy URL for reference
    }
    // Copy to clipboard
    await vscode.env.clipboard.writeText(mcpUrl);
    // Output to channel
    outputChannel.clear();
    outputChannel.appendLine('─────────────────────────────────────────');
    outputChannel.appendLine('  Fodda MCP URL (copied to clipboard)');
    outputChannel.appendLine('─────────────────────────────────────────');
    outputChannel.appendLine('');
    outputChannel.appendLine(mcpUrl);
    outputChannel.appendLine('');
    outputChannel.appendLine('Paste this URL into your MCP settings:');
    outputChannel.appendLine('');
    outputChannel.appendLine('  Cursor:   Settings → Features → MCP Servers → Add');
    outputChannel.appendLine('  Windsurf: Settings → Cascade → MCP Servers → Add');
    outputChannel.appendLine('  Claude:   Customize → Connectors → + button');
    outputChannel.appendLine('');
    outputChannel.appendLine('Docs: https://docs.fodda.ai');
    outputChannel.appendLine('─────────────────────────────────────────');
    outputChannel.show(true);
    // Show notification
    const action = await vscode.window.showInformationMessage('Fodda MCP URL copied to clipboard. Paste it into your MCP settings.', 'Open Settings', 'View Docs');
    if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'fodda');
    }
    else if (action === 'View Docs') {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.fodda.ai'));
    }
    // Update status bar to green
    updateStatusBar();
}
// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------
function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('fodda');
    const apiKey = config.get('apiKey', '').trim();
    if (apiKey) {
        statusBarItem.text = '$(plug) Fodda';
        statusBarItem.backgroundColor = undefined; // default (blends with bar)
        statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        statusBarItem.tooltip = 'Fodda: Connected — click to copy MCP URL';
    }
    else {
        statusBarItem.text = '$(plug) Fodda';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.color = new vscode.ThemeColor('disabledForeground');
        statusBarItem.tooltip = 'Fodda: Not configured — click to set up';
    }
    statusBarItem.show();
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildMcpUrl(apiKey, userEmail) {
    const params = new URLSearchParams({
        api_key: apiKey,
        user_id: userEmail,
        source: 'vscode-extension',
    });
    return `${MCP_BASE_URL}?${params.toString()}`;
}
/**
 * Build the portal upgrade URL with pre-filled email.
 */
function buildPortalUpgradeUrl(userEmail) {
    const params = new URLSearchParams({ action: 'upgrade' });
    if (userEmail && userEmail.includes('@')) {
        params.set('email', userEmail);
    }
    return `${APP_BASE_URL}/portal?${params.toString()}`;
}
// ---------------------------------------------------------------------------
// Connection Verification — detects trial limit-exceeded on connect
// ---------------------------------------------------------------------------
/**
 * Verify the API key by hitting the /v1/graphs endpoint.
 * If the backend returns a 402 or a 403 with limit/trial-related error codes,
 * show a VS Code notification with an Upgrade Now button.
 *
 * Returns true if the trial limit has been reached.
 */
async function verifyConnection(apiKey, userEmail) {
    try {
        // Use Node's built-in https module (available in VS Code extensions)
        const https = await Promise.resolve().then(() => __importStar(require('https')));
        const url = `${API_BASE_URL}/v1/graphs`;
        const result = await new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: {
                    'X-API-Key': apiKey,
                    'X-User-Id': userEmail,
                    'X-Fodda-Source': 'vscode-extension',
                    'Accept': 'application/json',
                },
                timeout: 8000,
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk.toString(); });
                res.on('end', () => resolve({ status: res.statusCode || 0, body }));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        // Check for limit-exceeded responses
        if (result.status === 402 || result.status === 403) {
            let data = {};
            try {
                data = JSON.parse(result.body);
            }
            catch { /* ignore parse errors */ }
            const code = (data?.error?.code || data?.code || '').toString().toUpperCase();
            const msg = (data?.error?.message || data?.message || '').toString().toLowerCase();
            const planCode = data?.planCode ?? data?.plan_code ?? data?.error?.planCode ?? data?.error?.plan_code;
            const isLimitError = (result.status === 402 ||
                code === 'CREDITS_EXHAUSTED' ||
                code === 'INSUFFICIENT_CREDITS' ||
                code === 'LIMIT_EXCEEDED' ||
                code === 'TRIAL_EXHAUSTED' ||
                msg.includes('credit') ||
                msg.includes('limit reached') ||
                msg.includes('trial limit'));
            const isTrialAccount = (apiKey.startsWith('sk_trial_') ||
                (planCode !== undefined && String(planCode) === '13') ||
                data?.isTrial === true ||
                data?.is_trial === true ||
                code === 'TRIAL_EXHAUSTED');
            if (isLimitError && isTrialAccount) {
                const portalUrl = buildPortalUpgradeUrl(userEmail);
                const usage = data?.usage;
                const usedText = (usage?.used !== undefined && usage?.limit !== undefined)
                    ? `${usage.used}/${usage.limit}`
                    : '25/25';
                const action = await vscode.window.showInformationMessage(`Fodda Trial Limit Reached (${usedText} queries used). Please upgrade to the free Base plan or a paid plan to continue.`, 'Upgrade Now', 'Dismiss');
                if (action === 'Upgrade Now') {
                    vscode.env.openExternal(vscode.Uri.parse(portalUrl));
                }
                outputChannel.appendLine(`[trial] Limit reached for ${userEmail} — upgrade at ${portalUrl}`);
                return true;
            }
        }
        return false;
    }
    catch (err) {
        // Verification is best-effort — don't block the connect flow
        outputChannel.appendLine(`[verify] Connection check failed (non-blocking): ${err?.message}`);
        return false;
    }
}
//# sourceMappingURL=extension.js.map