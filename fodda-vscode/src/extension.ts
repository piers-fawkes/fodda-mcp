import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MCP_BASE_URL = 'https://mcp.fodda.ai/mcp';
const OUTPUT_CHANNEL_NAME = 'Fodda';
const STATUS_BAR_PRIORITY = 100;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

    // Register the Connect command
    const connectCmd = vscode.commands.registerCommand('fodda.connect', handleConnect);
    context.subscriptions.push(connectCmd);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        STATUS_BAR_PRIORITY
    );
    statusBarItem.command = 'fodda.connect';
    statusBarItem.tooltip = 'Fodda: Connect to MCP';
    context.subscriptions.push(statusBarItem);

    // Update status bar on activation and on settings changes
    updateStatusBar();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('fodda')) {
                updateStatusBar();
            }
        })
    );

    outputChannel.appendLine('Fodda extension activated.');
}

export function deactivate(): void {
    // Cleanup handled by VS Code's disposable system
}

// ---------------------------------------------------------------------------
// Connect Command
// ---------------------------------------------------------------------------

async function handleConnect(): Promise<void> {
    const config = vscode.workspace.getConfiguration('fodda');
    let apiKey = config.get<string>('apiKey', '').trim();
    let userEmail = config.get<string>('userEmail', '').trim();

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
    const action = await vscode.window.showInformationMessage(
        'Fodda MCP URL copied to clipboard. Paste it into your MCP settings.',
        'Open Settings',
        'View Docs'
    );

    if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'fodda');
    } else if (action === 'View Docs') {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.fodda.ai'));
    }

    // Update status bar to green
    updateStatusBar();
}

// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------

function updateStatusBar(): void {
    const config = vscode.workspace.getConfiguration('fodda');
    const apiKey = config.get<string>('apiKey', '').trim();

    if (apiKey) {
        statusBarItem.text = '$(plug) Fodda';
        statusBarItem.backgroundColor = undefined; // default (blends with bar)
        statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        statusBarItem.tooltip = 'Fodda: Connected — click to copy MCP URL';
    } else {
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

function buildMcpUrl(apiKey: string, userEmail: string): string {
    const params = new URLSearchParams({
        api_key: apiKey,
        user_id: userEmail,
        source: 'vscode-extension',
    });
    return `${MCP_BASE_URL}?${params.toString()}`;
}
