/**
 * Test: Earnings Q&A Routing, Citable Tables & Quote Transparency
 * Verifies fixes for Tests 2 & 3:
 * 1. Single-Company Q&A: get_company_earnings auto-routing to view='qa' on question/quote inquiries,
 *    and embedding qa_entries + citations in view='snapshot'.
 * 2. Cross-company thematic earnings: get_earnings_intelligence returning theme_label and structured citations.
 * 3. Earnings divergence: get_earnings_divergence returning theme_label and structured citations.
 * 4. System prompt rules: Eliminating "does not store quotes" hallucination.
 * 5. Tools manifest: Updated descriptions with OUTPUT REQUIREMENT and view='qa' guidance.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from './toolHandlers.js';
import { foddaRequest } from './foddaClient.js';
import { STATIC_BEHAVIORAL_RULES } from './systemPrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

async function run() {
    console.log('\n=== 1. System Prompt Transparency Invariants ===');
    assert(
        STATIC_BEHAVIORAL_RULES.includes('RULE: EarningsVerbatimQuotesAndQATransparency'),
        'System prompt contains RULE: EarningsVerbatimQuotesAndQATransparency'
    );
    assert(
        STATIC_BEHAVIORAL_RULES.includes('Fodda stores verbatim analyst Q&A, executive responses, analyst names, firms, and CEO quotes for 517 public companies'),
        'System prompt explicitly declares quote and analyst name storage for 517 companies'
    );
    assert(
        STATIC_BEHAVIORAL_RULES.includes('NEVER state that Fodda does not store analyst names or call quotes'),
        'System prompt instructs model to never claim Fodda lacks quote storage'
    );
    assert(
        STATIC_BEHAVIORAL_RULES.includes('get_company_earnings(view=\'qa\')'),
        'System prompt directs analyst quote questions to get_company_earnings(view=\'qa\')'
    );

    console.log('\n=== 2. Tools Manifest & Tool Descriptions ===');
    const manifestPath = path.resolve(__dirname, '../tools-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const companyTool = manifest.tools.find((t: any) => t.name === 'get_company_earnings');
    assert(companyTool !== undefined, 'get_company_earnings is in tools-manifest.json');
    assert(companyTool.description.includes("view='qa'"), 'get_company_earnings description documents view="qa"');
    assert(
        companyTool.description.includes('USE THIS VIEW whenever the user asks who asked a question, for analyst names/firms, or for verbatim call quotes'),
        'get_company_earnings description guides model when to use view="qa"'
    );

    const intelTool = manifest.tools.find((t: any) => t.name === 'get_earnings_intelligence');
    assert(intelTool !== undefined, 'get_earnings_intelligence is in tools-manifest.json');
    assert(
        intelTool.description.includes('OUTPUT REQUIREMENT: For multi-company thematic findings, present results in a structured evidence table citing:'),
        'get_earnings_intelligence description includes structured evidence table OUTPUT REQUIREMENT'
    );

    const divTool = manifest.tools.find((t: any) => t.name === 'get_earnings_divergence');
    assert(divTool !== undefined, 'get_earnings_divergence is in tools-manifest.json');
    assert(
        divTool.description.includes('OUTPUT REQUIREMENT: For multi-company thematic findings, present results in a structured evidence table citing:'),
        'get_earnings_divergence description includes structured evidence table OUTPUT REQUIREMENT'
    );

    console.log('\n=== 3. Live Server Tool Execution: Single-Company Q&A Auto-Routing ===');
    const serverInstance = await createServer(
        process.env.FODDA_API_KEY || '',
        'test-qa-runner',
        foddaRequest,
        (async () => ({})) as any,
        () => 'widget_1',
        () => 'http://localhost'
    );

    // Test A: Walmart with explicit inquiry asking about analyst questions on AI
    // Should auto-route to 'qa' view even if view is defaulted or omitted
    const testAArgs = {
        ticker: 'WMT',
        query: 'What did analysts ask Walmart about AI on its latest earnings call? Give the quarter, analyst names and direct quotes.'
    };

    const toolMap = (serverInstance as any)._registeredTools;
    const companyHandler = toolMap?.get_company_earnings?.handler;

    if (companyHandler) {
        const resultA = await companyHandler(testAArgs);
        assert(!resultA.isError, 'Tool execution succeeded without error');
        const textA = resultA.content?.[0]?.text;
        assert(typeof textA === 'string' && textA.length > 0, 'Returned non-empty text payload');
        const jsonA = JSON.parse(textA);

        assert(jsonA.ticker === 'WMT', 'Payload contains ticker WMT');
        assert(Array.isArray(jsonA.citations) && jsonA.citations.length > 0, 'Payload contains citations array');
        assert(jsonA.total_qa_entries > 0, `Payload contains total_qa_entries (${jsonA.total_qa_entries})`);

        // Check that an analyst citation contains speaker, analyst_name, analyst_firm, and quote
        const firstCitation = jsonA.citations[0];
        assert(Boolean(firstCitation.speaker), `Citation has speaker: ${firstCitation.speaker}`);
        assert(Boolean(firstCitation.analyst_name), `Citation has analyst_name: ${firstCitation.analyst_name}`);
        assert(Boolean(firstCitation.analyst_firm), `Citation has analyst_firm: ${firstCitation.analyst_firm}`);
        assert(Boolean(firstCitation.quote), `Citation has quote: "${firstCitation.quote.slice(0, 60)}..."`);
        assert(Boolean(firstCitation.quarter), `Citation has quarter: ${firstCitation.quarter}`);

        // Verify AI-specific matched citations
        if (jsonA.topic_matched_citations) {
            console.log(`  ℹ️ Found ${jsonA.topic_matched_citations.length} topic-matched Q&A citations for AI`);
            const matchedSpeakers = jsonA.topic_matched_citations.map((c: any) => `${c.analyst_name} (${c.analyst_firm})`).join(', ');
            console.log(`  ℹ️ Matched Analysts: ${matchedSpeakers}`);
            assert(jsonA.topic_matched_citations.length > 0, 'topic_matched_citations populated for AI query');
        }

        // Test B: Walmart with default snapshot view — verify embedded qa_entries
        console.log('\n=== 4. Live Server Tool Execution: Snapshot Embeds Top Q&A Entries ===');
        const resultB = await companyHandler({ ticker: 'WMT', view: 'snapshot' });
        const jsonB = JSON.parse(resultB.content[0].text);
        assert(Boolean(jsonB.data?.headline), 'Snapshot contains headline');
        assert(Array.isArray(jsonB.data?.qa_entries) && jsonB.data.qa_entries.length > 0, 'Snapshot embeds qa_entries');
        assert(Array.isArray(jsonB.data?.top_qa_entries) && jsonB.data.top_qa_entries.length > 0, 'Snapshot embeds top_qa_entries');
        assert(Array.isArray(jsonB.data?.citations) && jsonB.data.citations.length > 0, 'Snapshot embeds citations table entries');

        // Test C: Multi-company Earnings Intelligence table formatting
        console.log('\n=== 5. Multi-Company Thematic Search Evidence Tables ===');
        const intelHandler = toolMap?.get_earnings_intelligence?.handler;
        if (intelHandler) {
            const resultC = await intelHandler({ sector: 'retail', limit: 5 });
            const jsonC = JSON.parse(resultC.content[0].text);
            assert(Boolean(jsonC.theme_label), `get_earnings_intelligence returns theme_label: "${jsonC.theme_label}"`);
            assert(Array.isArray(jsonC.citations) && jsonC.citations.length > 0, `get_earnings_intelligence returns ${jsonC.citations?.length} structured citations`);
            const cit0 = jsonC.citations[0];
            assert(Boolean(cit0.company), `Citation 0 has company: ${cit0.company}`);
            assert(Boolean(cit0.quarter), `Citation 0 has quarter: ${cit0.quarter}`);
            assert(Boolean(cit0.speaker), `Citation 0 has speaker: ${cit0.speaker}`);
            assert(Boolean(cit0.quote || cit0.finding), `Citation 0 has quote/finding`);
        }

        // Test D: Earnings Divergence theme_label and citations
        console.log('\n=== 6. Earnings Divergence Theme Labels and Citations ===');
        const divHandler = toolMap?.get_earnings_divergence?.handler;
        if (divHandler) {
            const resultD = await divHandler({ limit: 5 });
            const jsonD = JSON.parse(resultD.content[0].text);
            const themes = jsonD.data?.themes || jsonD.themes || [];
            if (themes.length > 0) {
                const theme0 = themes[0];
                assert(Boolean(theme0.theme_label), `Divergence theme has theme_label: "${theme0.theme_label}"`);
                assert(Array.isArray(theme0.citations) && theme0.citations.length > 0, `Divergence theme has ${theme0.citations?.length} citations`);
                const divCit0 = theme0.citations[0];
                assert(Boolean(divCit0.company), `Divergence citation has company: ${divCit0.company}`);
                assert(Boolean(divCit0.quarter), `Divergence citation has quarter: ${divCit0.quarter}`);
                assert(Boolean(divCit0.speaker), `Divergence citation has speaker: ${divCit0.speaker}`);
                assert(Boolean(divCit0.quote || divCit0.finding), `Divergence citation has quote/finding`);
            }
        }
    } else {
        console.error('  ❌ Could not find tool handler on server instance');
        failed++;
    }

    console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===\n`);
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Unhandled error in test:', err);
    process.exit(1);
});
