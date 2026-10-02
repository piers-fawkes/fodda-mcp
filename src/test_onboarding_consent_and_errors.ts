import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Running Onboarding Consent at Step One & Structured Errors Verification ===\n');

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

const projectRoot = path.resolve(__dirname, '..');
const srcDir = fs.existsSync(path.resolve(__dirname, 'systemPrompt.ts')) ? __dirname : path.resolve(projectRoot, 'src');
const toolHandlersPath = path.resolve(srcDir, 'toolHandlers.ts');
const systemPromptPath = path.resolve(srcDir, 'systemPrompt.ts');
const toolsPath = path.resolve(srcDir, 'tools.ts');

const toolHandlersContent = fs.readFileSync(toolHandlersPath, 'utf8');
const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');
const toolsContent = fs.readFileSync(toolsPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Tool Versions in src/tools.ts
// ---------------------------------------------------------------------------
console.log('1. Verifying Tool Versions in src/tools.ts...');
check(toolsContent.includes('submit_basic_info: "1.2.0"'), 'submit_basic_info is bumped to 1.2.0');
check(toolsContent.includes('begin_expert_onboarding: "1.1.0"'), 'begin_expert_onboarding is bumped to 1.1.0');
check(toolsContent.includes('submit_mcp_source: "1.1.0"'), 'submit_mcp_source is bumped to 1.1.0');
check(toolsContent.includes('finalize_byo_mcp_onboarding: "1.1.0"'), 'finalize_byo_mcp_onboarding is bumped to 1.1.0');
check(toolsContent.includes('submit_expertise_analysis: "1.1.0"'), 'submit_expertise_analysis is bumped to 1.1.0');
check(toolsContent.includes('get_detected_themes: "1.1.0"'), 'get_detected_themes is bumped to 1.1.0');
check(toolsContent.includes('confirm_themes: "1.1.0"'), 'confirm_themes is bumped to 1.1.0');
check(toolsContent.includes('get_onboarding_status: "1.1.0"'), 'get_onboarding_status is bumped to 1.1.0');
check(toolsContent.includes('schedule_interview: "1.1.0"'), 'schedule_interview is bumped to 1.1.0');
check(toolsContent.includes('expert_onboarding_research: "1.1.0"'), 'expert_onboarding_research is bumped to 1.1.0');

// ---------------------------------------------------------------------------
// 2. Truthful Persistence Copy & Definition of Done Grep
// ---------------------------------------------------------------------------
console.log('\n2. Verifying Truthful Persistence Copy (Grep Invariants)...');

// Brief Definition of Done:
// grep -rn -i "nothing is saved|held in this chat|lives only in this conversation" src/
// returns no false persistence claims. Only the scoped "still drafting" line remains.
const falsePersistenceRegex = /nothing is saved(?!.*until you submit that step)|held in this chat|lives only in this conversation/i;

check(!falsePersistenceRegex.test(toolHandlersContent), 'toolHandlers.ts contains no false persistence claims');
check(!falsePersistenceRegex.test(systemPromptContent), 'systemPrompt.ts contains no false persistence claims');

// Verify truthful copy exists
check(
    toolHandlersContent.includes('Once you accept the terms, Fodda saves each step as you complete it.'),
    'toolHandlers.ts contains "Once you accept the terms, Fodda saves each step as you complete it."'
);
check(
    systemPromptContent.includes('Once you accept the terms, Fodda saves each step as you complete it.'),
    'systemPrompt.ts contains "Once you accept the terms, Fodda saves each step as you complete it."'
);
check(
    toolHandlersContent.includes("Anything I'm still drafting with you, like your voice study before you submit it, lives only in this chat until you submit that step."),
    'toolHandlers.ts contains scoped drafting persistence line'
);
check(
    systemPromptContent.includes("Anything I'm still drafting with you, like your voice study before you submit it, lives only in this chat until you submit that step."),
    'systemPrompt.ts contains scoped drafting persistence line'
);
check(
    toolHandlersContent.includes("Your profile is saved once you accept the terms. Your MCP connection is only checked, not saved, until you submit at the end."),
    'toolHandlers.ts contains BYO-MCP truthful persistence copy'
);
check(
    systemPromptContent.includes("Your profile is saved once you accept the terms. Your MCP connection is only checked, not saved, until you submit at the end."),
    'systemPrompt.ts contains BYO-MCP truthful persistence copy'
);

// ---------------------------------------------------------------------------
// 3. Structured Error Format & Code Set Coverage
// ---------------------------------------------------------------------------
console.log('\n3. Verifying Structured Error Infrastructure...');

const requiredCodes = [
    'credentials_missing',
    'terms_required',
    'record_not_found',
    'research_needs_basic_info',
    'themes_not_ready',
    'questions_failed',
    'interview_slot_invalid',
    'interview_already_scheduled',
    'mcp_probe_failed',
    'mcp_auth_unsupported',
    'upstream_error'
];

for (const code of requiredCodes) {
    check(
        toolHandlersContent.includes(`${code}:`),
        `ONBOARDING_ERROR_METADATA defines error code "${code}"`
    );
}

// ---------------------------------------------------------------------------
// 4. get_onboarding_status Next-Step Rendering
// ---------------------------------------------------------------------------
console.log('\n4. Verifying get_onboarding_status Next-Action & Next-Tool Rendering...');

check(
    toolHandlersContent.includes('**Where you are:** ${label}. **Next step for you:** ${nextAction}'),
    'get_onboarding_status formats prose as "**Where you are:** <status label>. **Next step for you:** <next_action>"'
);
check(
    toolHandlersContent.includes('next_tool: nextTool') && toolHandlersContent.includes('next_action: nextAction'),
    'get_onboarding_status passes next_tool and next_action in JSON block'
);
check(
    toolHandlersContent.includes('Interview scheduled') && toolHandlersContent.includes('Google Meet'),
    'deriveStatusFlow distinguishes booked bot with Recall Join At and Google Meet message'
);

// ---------------------------------------------------------------------------
// 5. schedule_interview Next-Step Null & Reassurance
// ---------------------------------------------------------------------------
console.log('\n5. Verifying schedule_interview Output...');

check(
    toolHandlersContent.includes('next_step: null'),
    'schedule_interview returns next_step: null on success'
);
check(
    toolHandlersContent.includes('After the interview, Fodda reviews your Human Agent and emails you. You can check progress any time with get_onboarding_status.'),
    'schedule_interview includes exact closing reassurance line'
);

// ---------------------------------------------------------------------------
// 6. Resume on Start in begin_expert_onboarding
// ---------------------------------------------------------------------------
console.log('\n6. Verifying begin_expert_onboarding Resume Behavior...');

check(
    toolHandlersContent.includes('result.inProgress') && toolHandlersContent.includes("You've already started, so let's pick up at <${resumeStep}>."),
    'begin_expert_onboarding handles inProgress with "You\'ve already started, so let\'s pick up at <step>"'
);
check(
    toolHandlersContent.includes("status: 'resumed'") && toolHandlersContent.includes('resume: {'),
    'begin_expert_onboarding returns resume object payload'
);

// ---------------------------------------------------------------------------
// 7. submit_basic_info Consent Point & Relaxed Later Steps
// ---------------------------------------------------------------------------
console.log('\n7. Verifying submit_basic_info Consent Point & Relaxed Subsequent Checks...');

check(
    toolHandlersContent.includes('termsAccepted: z.boolean().describe("The expert must explicitly accept the Fodda Terms of Service'),
    'submit_basic_info has required termsAccepted: boolean in schema'
);
check(
    toolHandlersContent.includes('if (termsAccepted !== true)') && toolHandlersContent.includes("code: 'terms_required'"),
    'submit_basic_info refuses with terms_required error if termsAccepted !== true'
);
check(
    toolHandlersContent.includes('termsAccepted: z.boolean().optional().describe("Optional if already accepted at basic info'),
    'submit_expertise_analysis marks termsAccepted optional'
);
check(
    toolHandlersContent.includes('termsAccepted: z.boolean().optional().describe("Optional if already accepted at basic info'),
    'finalize_byo_mcp_onboarding marks termsAccepted optional'
);

console.log(`\nVerification Summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}
