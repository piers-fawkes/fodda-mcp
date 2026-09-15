import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_BEHAVIORAL_RULES } from './systemPrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Running BYO-MCP Submission Clarity & Ghosting Prevention Verification ===\n');

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

// ---------------------------------------------------------------------------
// 1. Invariant Grep Check: Zero occurrences of misleading persistence copy
// ---------------------------------------------------------------------------
console.log('1. Verifying Zero Misleading Persistence Copy in Source Files...');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = fs.existsSync(path.resolve(__dirname, 'systemPrompt.ts')) ? __dirname : path.resolve(projectRoot, 'src');
const systemPromptPath = path.resolve(srcDir, 'systemPrompt.ts');
const toolHandlersPath = path.resolve(srcDir, 'toolHandlers.ts');

const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');
const toolHandlersContent = fs.readFileSync(toolHandlersPath, 'utf8');

const forbiddenPhrases = [
    'saved as you go',
    'is recorded when you connect it',
    'recorded when you connect it'
];

for (const phrase of forbiddenPhrases) {
    const spCount = (systemPromptContent.toLowerCase().match(new RegExp(phrase, 'g')) || []).length;
    const thCount = (toolHandlersContent.toLowerCase().match(new RegExp(phrase, 'g')) || []).length;
    check(spCount === 0, `Zero occurrences of "${phrase}" in systemPrompt.ts (found ${spCount})`);
    check(thCount === 0, `Zero occurrences of "${phrase}" in toolHandlers.ts (found ${thCount})`);
}

// ---------------------------------------------------------------------------
// 2. System Prompt Guardrails & Behavioral Rules Verification
// ---------------------------------------------------------------------------
console.log('\n2. Verifying System Prompt BYO-MCP Rules & Guardrails...');

check(
    STATIC_BEHAVIORAL_RULES.includes('NEVER CLAIM SUBMISSION OR REVIEW STATUS WITHOUT TOOL EXECUTION'),
    'STATIC_BEHAVIORAL_RULES contains strict negative constraint header against premature completion claims'
);

check(
    STATIC_BEHAVIORAL_RULES.includes('finalize_byo_mcp_onboarding has actually returned { status: \'submitted_for_review\' }'),
    'Prompt requires finalize_byo_mcp_onboarding to return status: submitted_for_review before claiming submission'
);

check(
    STATIC_BEHAVIORAL_RULES.includes('Nothing is saved to Fodda until you complete all steps and explicitly submit at the end. Your MCP URL and profile live only in this conversation until final submission.'),
    'Prompt contains honest persistence demarcation for BYO-MCP branch'
);

check(
    STATIC_BEHAVIORAL_RULES.includes('Nothing is saved on Fodda\'s servers until the final submission step.'),
    'Prompt contains honest pause/interruption copy for BYO-MCP branch'
);

check(
    STATIC_BEHAVIORAL_RULES.includes('STREAMLINED BYO-MCP EXECUTION PATH:'),
    'Prompt defines STREAMLINED BYO-MCP EXECUTION PATH section'
);

check(
    STATIC_BEHAVIORAL_RULES.includes('To complete submission, please confirm that you accept the Fodda Terms of Service (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy).'),
    'Prompt explicitly specifies the exact Terms of Service acceptance confirmation message'
);

// ---------------------------------------------------------------------------
// 3. Tool Handlers Copy & Next-Step Guidance Verification
// ---------------------------------------------------------------------------
console.log('\n3. Verifying Tool Handlers Guidance...');

// begin_expert_onboarding introText
check(
    toolHandlersContent.includes('Nothing is saved to Fodda until you complete all steps and explicitly submit at the end. Your MCP URL and profile live only in this conversation until final submission.'),
    'begin_expert_onboarding introText contains honest BYO-MCP persistence copy'
);

// submit_mcp_source next_step guidance
check(
    toolHandlersContent.includes('Confirm the expertise topics with the expert, explicitly request acceptance of the Fodda Terms of Service (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy)') &&
    toolHandlersContent.includes("nothing is saved on Fodda's servers until"),
    'submit_mcp_source statusText directs the agent to confirm topics, ask for Terms acceptance, and emphasizes server persistence'
);

// finalize_byo_mcp_onboarding description
check(
    toolHandlersContent.includes('This is the sole submission step; profile and MCP details are not saved to Fodda until this tool executes.'),
    'finalize_byo_mcp_onboarding tool description declares it is the sole submission step'
);

// finalize_byo_mcp_onboarding termsAccepted gate
check(
    toolHandlersContent.includes('Explicit acceptance required: The expert must review and agree to the Fodda Terms of Service (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy) to proceed.'),
    'finalize_byo_mcp_onboarding rejects with explicit prompt when termsAccepted is false'
);

// ---------------------------------------------------------------------------
// 4. Simulated Agent Transcript Guardrail Verification
// ---------------------------------------------------------------------------
console.log('\n4. Verifying Transcript Simulation Guardrails...');

interface ConversationState {
    step: string;
    mcpConnected: boolean;
    termsAccepted: boolean;
    finalized: boolean;
    finalizationStatus?: string;
}

function validateAgentMessage(state: ConversationState, agentMessage: string): { valid: boolean; reason?: string } {
    const prematureSubmissionPhrases = [
        /submitted for review/i,
        /profile has been submitted/i,
        /recorded your url/i,
        /sent for administrative review/i,
        /profile is submitted/i
    ];

    if (!state.finalized || state.finalizationStatus !== 'submitted_for_review') {
        for (const pattern of prematureSubmissionPhrases) {
            if (pattern.test(agentMessage)) {
                return {
                    valid: false,
                    reason: `Violation: Agent claimed submission/recording ("${agentMessage.match(pattern)?.[0]}") before finalize_byo_mcp_onboarding succeeded.`
                };
            }
        }
    }

    if (state.mcpConnected && !state.termsAccepted && !state.finalized) {
        // Agent must prompt for terms acceptance
        const termsMentioned = agentMessage.includes('https://www.fodda.ai/terms') && agentMessage.includes('https://www.fodda.ai/privacy');
        if (!termsMentioned) {
            return {
                valid: false,
                reason: 'Violation: Agent did not prompt for explicit Terms of Service and Privacy Policy acceptance after MCP probe.'
            };
        }
    }

    return { valid: true };
}

// Scenario A: The Steve Bryant Incident Hallucination Simulation
const statePreToolExecution: ConversationState = {
    step: 'mcp_shared_in_chat',
    mcpConnected: false,
    termsAccepted: false,
    finalized: false
};

const hallucinatedResponse = "Great Steve! I have recorded your MCP endpoint https://games.thisisdelightful.com/mcp and your Human Agent profile has been submitted for review!";
const validationA = validateAgentMessage(statePreToolExecution, hallucinatedResponse);
check(
    !validationA.valid && Boolean(validationA.reason?.includes('Violation: Agent claimed submission/recording')),
    'Premature completion claim without tool execution is correctly flagged as a guardrail violation'
);

// Scenario B: Correct Multi-Step Execution with Terms Acceptance
const stateProbed: ConversationState = {
    step: 'mcp_connected',
    mcpConnected: true,
    termsAccepted: false,
    finalized: false
};

const compliantStepResponse = [
    "✅ **MCP Endpoint Connected & Verified**: `https://games.thisisdelightful.com/mcp`",
    "• **Discovered Tools (4)**: fetch_game_trends, get_platform_shares, list_studio_reports, analyze_monetization",
    "• **Discovered Expertise Topics**: Video Games Industry, Game Monetization, Platform Strategy, Indie Game Development",
    "",
    "To complete submission, please confirm that you accept the Fodda Terms of Service (https://www.fodda.ai/terms) and Privacy Policy (https://www.fodda.ai/privacy)."
].join('\n');

const validationB = validateAgentMessage(stateProbed, compliantStepResponse);
check(
    validationB.valid,
    'Compliant response displaying discovered tools and requesting explicit Terms acceptance passes validation'
);

// Scenario C: Finalization Execution
const stateFinalized: ConversationState = {
    step: 'onboarding_complete',
    mcpConnected: true,
    termsAccepted: true,
    finalized: true,
    finalizationStatus: 'submitted_for_review'
};

const compliantFinalResponse = "🎉 **Human Agent Submission Received!** Your Human Agent profile for Steve Bryant has been submitted for review.";
const validationC = validateAgentMessage(stateFinalized, compliantFinalResponse);
check(
    validationC.valid,
    'Post-finalization message declaring submitted_for_review passes validation'
);

console.log(`\nVerification Summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}
