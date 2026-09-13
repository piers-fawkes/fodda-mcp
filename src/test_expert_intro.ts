import { getAnalysts, initCatalogCache } from './catalogCache.js';
import { findCandidateExperts } from './coverageRelevance.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
    console.log('=== Running Expert Intro & Consultation Tests ===\n');
    let passed = 0;
    let total = 0;

    function assert(condition: boolean, msg: string) {
        total++;
        if (condition) {
            console.log(`✅ [PASS] ${msg}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${msg}`);
            process.exitCode = 1;
        }
    }

    // 1. Catalog & Candidate Expert Matching
    await initCatalogCache();
    const analysts = getAnalysts();
    assert(analysts.length > 0, `Catalog analysts loaded: ${analysts.length} analysts found`);

    const peterQuery = 'How could I book a call with Peter?';
    const peterCandidates = findCandidateExperts(peterQuery, { limit: 3 });
    const topPeter = peterCandidates[0];
    assert(
        Boolean(topPeter && (topPeter.display_name.toLowerCase().includes('peter') || topPeter.analyst_id.includes('peter'))),
        `findCandidateExperts correctly identifies Peter Abraham for "${peterQuery}" -> Matched: ${topPeter?.display_name} (${topPeter?.analyst_id})`
    );

    const jamesQuery = 'How can I hire James for some consulting?';
    const jamesCandidates = findCandidateExperts(jamesQuery, { limit: 3 });
    const topJames = jamesCandidates[0];
    assert(
        Boolean(topJames && (topJames.display_name.toLowerCase().includes('james') || topJames.analyst_id.includes('james'))),
        `findCandidateExperts correctly identifies James Colistra for "${jamesQuery}" -> Matched: ${topJames?.display_name} (${topJames?.analyst_id})`
    );

    // 2. System Prompt Verification
    const systemPromptPath = fs.existsSync(path.resolve(__dirname, 'systemPrompt.ts'))
        ? path.resolve(__dirname, 'systemPrompt.ts')
        : path.resolve(__dirname, '../src/systemPrompt.ts');
    const systemPromptContent = fs.readFileSync(systemPromptPath, 'utf8');

    assert(
        !systemPromptContent.includes("State clearly that the expert isn't taking calls"),
        "System prompt does NOT contain legacy refusal 'isn't taking calls'"
    );
    assert(
        systemPromptContent.includes("doesn't maintain a direct public calendar"),
        "System prompt contains concierge phrasing: 'doesn't maintain a direct public calendar'"
    );
    assert(
        systemPromptContent.includes("request_expert_intro"),
        "System prompt references request_expert_intro tool"
    );

    // 3. Tools Manifest Verification
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const introTool = manifest.tools.find((t: any) => t.name === 'request_expert_intro');

    assert(Boolean(introTool), "request_expert_intro is registered in tools-manifest.json");
    assert(introTool?.bills_as === 'free', "request_expert_intro is marked free (inquiry lead capture)");
    assert(introTool?.category === 'Expert', "request_expert_intro is categorized under 'Expert'");
    assert(
        introTool?.profiles?.includes('expert-consult') && introTool?.profiles?.includes('copilot'),
        "request_expert_intro is included in expert-consult and copilot profiles"
    );

    console.log(`\nTests Completed: ${passed}/${total} passed.`);
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
