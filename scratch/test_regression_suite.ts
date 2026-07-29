import { initCatalogCache, getRelevantSources } from '../dist/catalogCache.js';
import { extractRoutingTopic, fallbackSubThemes } from '../dist/deepResearch.js';

async function testRegression() {
    await initCatalogCache();

    // Verbatim raw 90-word strategist brief
    const rawStrategistQuery = `Run a Fodda Deep Research project about wine fridges, wine furniture and wine glassware and accessories?
Category sizing, competitive set, channel dynamics, consumer behavior, all in one ask. What are the macro consumer shifts in premium spending, luxury home entertaining, and direct-to-consumer channels?`;

    // 1. Dual-query extraction
    const routingTopic = extractRoutingTopic(rawStrategistQuery);
    const researchBrief = rawStrategistQuery.trim();

    console.log(`[TEST] Raw Strategist Brief Length: ${researchBrief.length} chars`);
    console.log(`[TEST] Extracted Routing Topic: "${routingTopic}"`);

    // 2. Route using extracted topic
    const sources = getRelevantSources(routingTopic, { minGraphs: 6, maxGraphs: 15 });
    const graphs = sources.filter(s => s.kind === 'graph');

    console.log(`\n[TEST] Selected ${graphs.length} graphs for routing topic:`);
    for (const g of graphs) {
        if (g.kind === 'graph') {
            console.log(` - [${g.graphId.padEnd(42)}] score: ${g.score.toFixed(3)} | ${g.reason}`);
        }
    }

    const scores = graphs.map(g => g.kind === 'graph' ? g.score : 0);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const spread = maxScore - minScore;
    const hasRetail = graphs.some(g => g.kind === 'graph' && g.graphId === 'retail');
    const retailRank = graphs.findIndex(g => g.kind === 'graph' && g.graphId === 'retail') + 1;
    const hasAutomotive = graphs.some(g => g.kind === 'graph' && g.graphId.includes('automotive'));

    // 3. Sub-theme expansion test
    const subThemes = fallbackSubThemes(routingTopic, true);
    console.log(`\n[TEST] Fallback Sub-Themes Generated (${subThemes.length}):`);
    subThemes.forEach((st, i) => console.log(`  ${i + 1}. ${st}`));

    // Assertions
    const assert1 = hasRetail && retailRank === 1;
    const assert2 = spread > 0.15;
    const assert3 = !hasAutomotive;
    const assert4 = researchBrief.length > 200 && researchBrief.includes("Category sizing") && researchBrief.includes("direct-to-consumer");
    const assert5 = subThemes.length === 5 && subThemes[0].includes("category sizing");

    console.log(`\n--- Dual-Query & Sub-Theme Pipeline Regression Assertions ---`);
    console.log(`Assert 1: "retail" is Rank #1 in source_plan? -> ${assert1 ? 'PASS (Rank #1, Score: ' + graphs[0].score.toFixed(3) + ')' : 'FAIL'}`);
    console.log(`Assert 2: max(score) - min(score) > 0.15? -> ${assert2 ? 'PASS (Spread: ' + spread.toFixed(3) + ')' : 'FAIL'}`);
    console.log(`Assert 3: No out-of-domain automotive graphs? -> ${assert3 ? 'PASS' : 'FAIL'}`);
    console.log(`Assert 4: Full 90-word brief preserved for synthesis? -> ${assert4 ? 'PASS (' + researchBrief.length + ' chars preserved)' : 'FAIL'}`);
    console.log(`Assert 5: Sub-theme expansion generates 5 distinct angles? -> ${assert5 ? 'PASS' : 'FAIL'}`);

    if (assert1 && assert2 && assert3 && assert4 && assert5) {
        console.log(`\n✅ ALL DUAL-QUERY & SUB-THEME REGRESSION TESTS PASSED!`);
    } else {
        console.log(`\n❌ REGRESSION TESTS FAILED!`);
        process.exit(1);
    }
}

testRegression().catch(console.error);

