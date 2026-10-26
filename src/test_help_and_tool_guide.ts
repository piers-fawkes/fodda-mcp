/**
 * Verification test for get_capabilities help answers, tool guide, and zero-billing.
 */

import assert from 'assert';
import dotenv from 'dotenv';
import { createServer } from './toolHandlers.js';
import { initCatalogCache } from './catalogCache.js';
import { initPricingCache } from './pricingCache.js';

dotenv.config();

const API_KEY = process.env.FODDA_API_KEY || 'sk_live_abcdef';
const USER_ID = 'test-user@fodda.ai';

async function run() {
    console.log('=== VERIFYING HELP ANSWERS, TOOL GUIDE & DISCOVERY ===\n');

    await initCatalogCache();
    await initPricingCache();

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
    assert(data1.answer.includes('Humanity in the Machine') || data1.answer.includes('Fodda is MCP-native'), 'res1 must answer from llms.txt');
    assert(!data1.answer.toLowerCase().includes('neo4j'), 'res1 must not contain Neo4j');
    assert(!data1.answer.toLowerCase().includes('cypher'), 'res1 must not contain Cypher');
    console.log('✅ Passed: What is Fodda answered accurately.\n');

    // 2. Test "How do I connect Fodda to Claude?"
    console.log('2. Testing get_capabilities({ view: "help", question: "How do I connect Fodda to Claude?" })...');
    const res2 = await getCapHandler({ view: 'help', question: 'How do I connect Fodda to Claude?' });
    const data2 = JSON.parse(res2.content[0].text);
    assert.strictEqual(data2.ok, true, 'res2 must be ok');
    assert(data2.answer.includes('claude') || data2.sources.some((s: any) => s.url.includes('claude')), 'res2 must include Claude connect instructions');
    console.log('✅ Passed: How do I connect to Claude answered with links.\n');

    // 3. Test "What does Fodda cost?"
    console.log('3. Testing get_capabilities({ view: "help", question: "What does Fodda cost?" })...');
    const res3 = await getCapHandler({ view: 'help', question: 'What does Fodda cost?' });
    const data3 = JSON.parse(res3.content[0].text);
    assert.strictEqual(data3.ok, true, 'res3 must be ok');
    assert(data3.pricing_note, 'res3 must include pricing_note from live pricing source');
    assert(data3.pricing_note.includes('\\$0.50 USD'), 'res3 pricing_note must quote $0.50 USD');
    assert(data3.pricing_note.includes('\\$50 USD'), 'res3 pricing_note must quote $50 free monthly credit');
    assert(!data3.answer.includes('via SPT'), 'res3 must not expose machine SPT terms');
    console.log('✅ Passed: What does Fodda cost answered from live pricing source.\n');

    // 4. Test "What can you do?"
    console.log('4. Testing get_capabilities({ view: "help", question: "What can you do?" })...');
    const res4 = await getCapHandler({ view: 'help', question: 'What can you do?' });
    const data4 = JSON.parse(res4.content[0].text);
    assert.strictEqual(data4.ok, true, 'res4 must be ok');
    assert(data4.tools_guide_tip, 'res4 must recommend view: "tools"');
    console.log('✅ Passed: What can you do recommends view: "tools".\n');

    // 5. Test Tool Guide view: get_capabilities({ view: 'tools' })
    console.log('5. Testing get_capabilities({ view: "tools" })...');
    const res5 = await getCapHandler({ view: 'tools' });
    const data5 = JSON.parse(res5.content[0].text);
    assert.strictEqual(data5.ok, true, 'res5 must be ok');
    assert.strictEqual(data5.view, 'tools', 'res5 view must be tools');
    assert.strictEqual(data5.sections.length, 5, 'res5 must have 5 sections');
    const sectionNames = data5.sections.map((s: any) => s.section);
    assert.deepStrictEqual(sectionNames, ['Research', 'Pressure-test', 'Ask an expert', 'Make something', 'Track']);

    // Check each section has items with required fields
    for (const sec of data5.sections) {
        assert(sec.tools.length > 0, `Section ${sec.section} must have tools`);
        for (const t of sec.tools) {
            assert(t.tool, 'Tool item must have tool name');
            assert(t.what_you_get, `Tool ${t.tool} must have what_you_get`);
            assert(t.when_to_use, `Tool ${t.tool} must have when_to_use`);
            assert(t.example_prompt, `Tool ${t.tool} must have example_prompt`);
            assert(t.cost === 'Free' || t.cost === 'Charged', `Tool ${t.tool} must have cost Free or Charged`);
        }
    }
    const rawGuideText = JSON.stringify(data5);
    assert(!rawGuideText.toLowerCase().includes('neo4j'), 'Tool guide must not contain Neo4j');
    assert(!rawGuideText.toLowerCase().includes('cypher'), 'Tool guide must not contain Cypher');
    assert(!rawGuideText.toLowerCase().includes('research_recipe'), 'Tool guide must not contain research_recipe steps');
    console.log(`✅ Passed: 5-section tool guide verified with ${data5.total_tools_exposed} tools exposed.\n`);

    // 6. Test Default View: get_capabilities({})
    console.log('6. Testing get_capabilities({}) default view...');
    const res6 = await getCapHandler({});
    const data6 = JSON.parse(res6.content[0].text);
    assert(data6.platform_scale, 'Default view must return platform_scale');
    assert(data6.workflows, 'Default view must return workflows');
    console.log('✅ Passed: Default view returns platform scale and workflows.\n');

    console.log('ALL HELP & TOOL GUIDE TESTS PASSED!');
    process.exit(0);
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
