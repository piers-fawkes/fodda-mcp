/**
 * Verification test for Proactive Fodda Routing, Multi-Tool Chaining, Next-Step Experts & User-Friendly Tool Labels.
 */

import assert from 'assert';
import dotenv from 'dotenv';
import { createServer } from './toolHandlers.js';
import { initCatalogCache, getGraphs, getAnalysts } from './catalogCache.js';
import { initPricingCache } from './pricingCache.js';
import { generateToolGuide, TOOL_HUMAN_LABELS, getToolHumanLabel } from './toolGuide.js';
import { buildSystemPrompt, STATIC_BEHAVIORAL_RULES, CHATGPT_BEHAVIORAL_RULES } from './systemPrompt.js';
import { findCandidateExperts, generateNextMoves } from './coverageRelevance.js';

dotenv.config();

const API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';
const USER_ID = 'test-user@fodda.ai';

async function run() {
    console.log('=== VERIFYING PROACTIVE ROUTING, MULTI-TOOL CHAINING, NEXT-STEP EXPERTS & HUMAN-FRIENDLY LABELS ===\n');

    await initCatalogCache();
    await initPricingCache();

    // 1. Tool Human Labels mapping & cleanliness
    console.log('1. Checking Tool Human Labels...');
    assert(TOOL_HUMAN_LABELS['search_statistics'] === "Fodda's market statistics");
    assert(TOOL_HUMAN_LABELS['get_earnings_intelligence'] === "Fodda's earnings intelligence");
    assert(TOOL_HUMAN_LABELS['search_graph'] === "Fodda's trend discovery");
    assert(TOOL_HUMAN_LABELS['brand_tracker'] === "Fodda's brand intelligence");
    assert(TOOL_HUMAN_LABELS['find_expert'] === "Fodda's specialist expert matching");
    assert(getToolHumanLabel('search_statistics') === "Fodda's market statistics");
    console.log('✅ TOOL_HUMAN_LABELS dictionary and getToolHumanLabel() verified.\n');

    // 2. Tool Guide runtime output includes human-friendly labels
    console.log('2. Checking Tool Guide labels...');
    const guide = generateToolGuide(() => true);
    for (const sec of guide.sections) {
        for (const t of sec.tools) {
            assert(t.label && t.label.startsWith("Fodda's"), `Tool ${t.tool} must have a human label starting with Fodda's (found "${t.label}")`);
        }
    }
    console.log('✅ All tools in generateToolGuide() return human-friendly labels.\n');

    // 3. System Prompt: Proactive routing instructions, multi-tool chaining, and clean executive presentation
    console.log('3. Checking System Prompt instructions...');
    const prompt = buildSystemPrompt(undefined, undefined, '', 'test');
    assert(prompt.includes('PROACTIVE ROUTING RULE'), 'System prompt must include PROACTIVE ROUTING RULE');
    assert(prompt.includes('alcoholic beverages'), 'System prompt proactive domains must include alcoholic beverages');
    assert(prompt.includes('MULTI-TOOL RESEARCH CHAINING'), 'System prompt must include MULTI-TOOL RESEARCH CHAINING');
    assert(prompt.includes('CLEAN EXECUTIVE LABELS'), 'System prompt must include CLEAN EXECUTIVE LABELS');
    assert(prompt.includes("Fodda's market statistics"), 'System prompt must cite Fodda\'s market statistics');
    assert(prompt.includes("Fodda's earnings intelligence"), 'System prompt must cite Fodda\'s earnings intelligence');
    assert(STATIC_BEHAVIORAL_RULES.includes('MULTI-TOOL CHAINING BEFORE Gaps') || STATIC_BEHAVIORAL_RULES.includes('MULTI-TOOL CHAINING BEFORE GAPS') || STATIC_BEHAVIORAL_RULES.includes('Multi-Tool Research Chaining'), 'Static behavioral rules must emphasize multi-tool research chaining');
    assert(CHATGPT_BEHAVIORAL_RULES.includes('Multi-Tool Research Chaining'), 'ChatGPT rules must emphasize multi-tool research chaining');
    assert(CHATGPT_BEHAVIORAL_RULES.includes('Clean Executive Labels'), 'ChatGPT rules must emphasize clean executive labels');
    console.log('✅ System prompt and behavioral rules verified for proactive routing, multi-tool chaining, and no raw snake_case leaks.\n');

    // 4. Candidate Expert Selection for Alcoholic Beverage Retail Query
    console.log('4. Checking Next-Step Expert matching for Alcoholic Beverage Retail Query...');
    const query = 'what are the alcoholic beverage trends when it comes to retail in the US';
    const candidateExperts = findCandidateExperts(query, {
        analysts: getAnalysts(),
        graphs: getGraphs(),
        limit: 3
    });
    console.log('Candidate experts matched:', candidateExperts.map(c => `${c.display_name} (${c.analyst_id}, status: ${c.status})`));
    assert(candidateExperts.length > 0, 'Must match at least one expert');
    const topExpert = candidateExperts[0];
    assert.strictEqual(topExpert.display_name, 'Thiago Bersou', 'Active Human Agent Thiago Bersou MUST be the top recommended expert for alcoholic beverage retail queries!');
    assert.strictEqual(topExpert.status, 'active', 'Thiago Bersou must be active');
    console.log('✅ Thiago Bersou correctly prioritized as top active Human Agent for alc-bev retail query.\n');

    // 5. nextMoves generation incorporates Thiago Bersou cleanly
    console.log('5. Checking generateNextMoves with Thiago Bersou...');
    const nextMoves = await generateNextMoves([], query, [], 'ok', 5, {}, getGraphs(), getAnalysts(), {});
    assert.strictEqual(nextMoves.specific?.expert?.display_name, 'Thiago Bersou', 'nextMoves.specific.expert must be Thiago Bersou');
    const expertMove = nextMoves.moves?.find(m => m.id === 'specialist');
    assert(expertMove !== undefined, 'nextMoves must have specialist move');
    assert(expertMove?.label.includes('Thiago Bersou'), 'specialist move label must include Thiago Bersou');
    assert(!expertMove?.prompt.includes('consult_human_agent'), 'specialist move prompt must not leak consult_human_agent syntax');
    console.log('✅ generateNextMoves cleanly recommends Thiago Bersou without raw tool names.\n');

    console.log('ALL PROACTIVE ROUTING & MULTI-TOOL CHAINING VERIFICATIONS PASSED SUCCESSFULLY!');
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
