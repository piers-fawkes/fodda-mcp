/**
 * Verification test for get_capabilities help answers, tool guide, and zero-dollar pricing policy.
 */

import assert from 'assert';
import dotenv from 'dotenv';
import { createServer } from './toolHandlers.js';
import { initCatalogCache } from './catalogCache.js';
import { initPricingCache } from './pricingCache.js';
import { getLiveGraphCount, generateToolGuide } from './toolGuide.js';

dotenv.config();

const API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';
const USER_ID = 'test-user@fodda.ai';

async function run() {
    console.log('=== VERIFYING REVISED HELP ANSWERS, TOOL GUIDE & STRICT NO-PRICE RULES ===\n');

    await initCatalogCache();
    await initPricingCache();

    const liveCount = getLiveGraphCount();
    console.log(`Live graph count: ${liveCount}`);

    const dummyRequest = async (method: string, path: string, key?: string, uid?: string, body?: any) => {
        return { ok: true, path, method };
    };

    const server = await createServer(
        API_KEY,
        USER_ID,
        dummyRequest as any,
        dummyRequest as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai',
        '',
        undefined,
        undefined,
        'test'
    );

    const tools = (server as any)._registeredTools;
    assert(tools['get_capabilities'], 'get_capabilities must be registered');

    const getCapHandler = tools['get_capabilities'].handler;

    // 1. Test "What is Fodda?" via view: 'help'
    console.log('1. Testing get_capabilities({ view: "help", question: "What is Fodda?" })...');
    const res1 = await getCapHandler({ view: 'help', question: 'What is Fodda?' });
    const data1 = JSON.parse(res1.content[0].text);
    assert.strictEqual(data1.ok, true, 'res1 must be ok');
    assert.strictEqual(data1.found_answers, true, 'res1 must find answers');
    assert(data1.answer.includes(`${liveCount}+`), `res1 must include live graph count ${liveCount}+`);
    assert(!data1.answer.toLowerCase().includes('neo4j'), 'res1 must not contain Neo4j');
    assert(!data1.answer.toLowerCase().includes('cypher'), 'res1 must not contain Cypher');
    assert(!JSON.stringify(data1).includes('$'), 'res1 must not contain any dollar signs ($)');
    assert(!data1.answer.includes('### Overview (llms.txt)'), 'res1 must be a clean direct answer, not raw sections');
    console.log('✅ Passed: What is Fodda answered directly with live graph count and zero dollar signs.\n');

    // 2. Test "How do I connect Fodda to Claude?"
    console.log('2. Testing get_capabilities({ view: "help", question: "How do I connect Fodda to Claude?" })...');
    const res2 = await getCapHandler({ view: 'help', question: 'How do I connect Fodda to Claude?' });
    const data2 = JSON.parse(res2.content[0].text);
    assert.strictEqual(data2.ok, true, 'res2 must be ok');
    assert(data2.answer.startsWith('To connect Fodda to Claude, see the setup guide at:\nhttps://www.fodda.ai/connect/claude'), 'res2 must lead with Claude connect link');
    assert(!JSON.stringify(data2).includes('$'), 'res2 must not contain any dollar signs ($)');
    console.log('✅ Passed: How do I connect to Claude leads with https://www.fodda.ai/connect/claude link.\n');

    // 3. Test "What does Fodda cost?"
    console.log('3. Testing get_capabilities({ view: "help", question: "What does Fodda cost?" })...');
    const res3 = await getCapHandler({ view: 'help', question: 'What does Fodda cost?' });
    const data3 = JSON.parse(res3.content[0].text);
    assert.strictEqual(data3.ok, true, 'res3 must be ok');
    assert(data3.answer.includes('API calls'), 'res3 must explain billing in API calls');
    assert(data3.answer.includes('https://www.fodda.ai/pricing'), 'res3 must link https://www.fodda.ai/pricing');
    assert(!JSON.stringify(data3).includes('$'), 'res3 must not contain any dollar signs ($) or quoted rates');
    assert(!data3.answer.includes('via SPT'), 'res3 must not expose machine SPT terms');
    console.log('✅ Passed: Cost question explains API calls, links pricing, and has zero dollar signs.\n');

    // 4. Test "What can you do?"
    console.log('4. Testing get_capabilities({ view: "help", question: "What can you do?" })...');
    const res4 = await getCapHandler({ view: 'help', question: 'What can you do?' });
    const data4 = JSON.parse(res4.content[0].text);
    assert.strictEqual(data4.ok, true, 'res4 must be ok');
    assert(data4.answer.includes('Research'), 'res4 must outline core capabilities');
    assert(data4.tools_guide_tip.includes("view: 'tools'"), 'res4 must recommend view: "tools"');
    assert(!JSON.stringify(data4).includes('$'), 'res4 must not contain dollar signs');
    console.log('✅ Passed: What can you do returns 5 areas and recommends view: "tools".\n');

    // 5. Test Tool Guide view: get_capabilities({ view: 'tools' })
    console.log('5. Testing get_capabilities({ view: "tools" })...');
    const res5 = await getCapHandler({ view: 'tools' });
    const data5 = JSON.parse(res5.content[0].text);
    assert.strictEqual(data5.ok, true, 'res5 must be ok');
    assert.strictEqual(data5.view, 'tools', 'res5 view must be tools');
    assert.strictEqual(data5.sections.length, 5, 'res5 must have 5 sections');
    const sectionNames = data5.sections.map((s: any) => s.section);
    assert.deepStrictEqual(sectionNames, ['Research', 'Pressure-test', 'Ask an expert', 'Make something', 'Track']);

    // Check each tool item
    for (const sec of data5.sections) {
        if (sec.section === 'Research') {
            assert(sec.description.includes(`${liveCount}+`), `Research section description must include live graph count ${liveCount}+`);
        }
        for (const t of sec.tools) {
            assert(t.tool, 'Tool item must have tool name');
            assert(t.what_you_get, `Tool ${t.tool} must have what_you_get`);
            assert(t.when_to_use, `Tool ${t.tool} must have when_to_use`);
            assert(t.example_prompt, `Tool ${t.tool} must have example_prompt`);
            // Must NOT have cost or api_calls_charged
            assert(!('cost' in t), `Tool ${t.tool} must NOT have cost property`);
            assert(!('api_calls_charged' in t), `Tool ${t.tool} must NOT have api_calls_charged property`);
            // Plain prompts check
            assert(!t.example_prompt.includes('2507.0'), `Tool ${t.tool} must not reference node 2507.0`);
            assert(!t.example_prompt.includes('seed node'), `Tool ${t.tool} must not reference seed node`);
        }
    }
    const rawGuideText = JSON.stringify(data5);
    assert(!rawGuideText.includes('$'), 'Tool guide must NOT contain any dollar signs ($)');
    assert(!rawGuideText.toLowerCase().includes('neo4j'), 'Tool guide must not contain Neo4j');
    assert(!rawGuideText.toLowerCase().includes('cypher'), 'Tool guide must not contain Cypher');
    console.log(`✅ Passed: 5-section tool guide verified with ${data5.total_tools_exposed} tools exposed, no cost/api_calls_charged fields, no internal IDs, and zero dollar signs.\n`);

    // 6. Test Track section preservation on scoped endpoints (when manage_scheduled_reports is excluded)
    console.log('6. Testing Track section preservation when manage_scheduled_reports is excluded...');
    const scopedGuide = generateToolGuide((name: string) => name !== 'manage_scheduled_reports');
    const trackSec = scopedGuide.sections.find(s => s.section === 'Track');
    assert(trackSec, 'Track section MUST be included even when no tracking tool is callable');
    assert(trackSec.description.includes('app.fodda.ai') || trackSec.note?.includes('app.fodda.ai'), 'Track section must link app.fodda.ai');
    assert(!JSON.stringify(scopedGuide).includes('$'), 'Scoped guide must not contain dollar signs');
    console.log('✅ Passed: Track section is preserved with app.fodda.ai link when tracking tool is excluded.\n');

    // 7. Test Default View: get_capabilities({})
    console.log('7. Testing get_capabilities({}) default view...');
    const res7 = await getCapHandler({});
    const data7 = JSON.parse(res7.content[0].text);
    assert(data7.platform_scale, 'Default view must return platform_scale');
    assert.strictEqual(data7.platform_scale.knowledge_graphs, liveCount, `Default view platform_scale must match live count ${liveCount}`);
    assert(!JSON.stringify(data7).includes('$'), 'Default view must not contain dollar signs');
    console.log('✅ Passed: Default view returns platform scale matching live count and zero dollar signs.\n');

    console.log('ALL REVISED HELP & TOOL GUIDE TESTS PASSED WITH 0 ERRORS AND 0 DOLLAR SIGNS!');
    process.exit(0);
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
