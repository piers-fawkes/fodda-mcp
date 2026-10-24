import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { addCoverageAnnotation } from '../dist/coverageRelevance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Look for baseline_results.json in local eval/ or Fodda API eval/
const LOCAL_BENCHMARK = path.join(__dirname, '../eval/baseline_results.json');
const API_BENCHMARK = '/Users/piersfawkes/Documents/Fodda API/Fodda/eval/retrieval_thiago_2026_10/baseline_results.json';
const BENCHMARK_PATH = fs.existsSync(LOCAL_BENCHMARK) ? LOCAL_BENCHMARK : API_BENCHMARK;

if (!fs.existsSync(BENCHMARK_PATH)) {
    console.error(`Benchmark file not found at ${LOCAL_BENCHMARK} or ${API_BENCHMARK}`);
    process.exit(1);
}

const benchmarkData = JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf-8'));
const scoredQueries = (benchmarkData.queries || []).filter(q => !q.is_fixture);

console.log('=== MCP resultQuality vs Ground Truth Evaluator ===');
console.log(`Evaluated benchmark: ${BENCHMARK_PATH}`);
console.log(`Queries: ${scoredQueries.length} (${scoredQueries.length * 2} runs across with_sector & without_sector)\n`);

function judgeQuality(onTopicCount, rowCount) {
    if (rowCount === 0 || onTopicCount === 0) return 'MISS';
    if (onTopicCount >= 3) return 'STRONG';
    return 'WEAK';
}

function baselineMcpQuality(row) {
    const count = row.row_count;
    if (count === 0) return 'MISS';
    if (count >= 5) return 'STRONG';
    return 'WEAK';
}

function newMcpQuality(coverage) {
    const count = coverage.results_on_topic !== undefined
        ? coverage.results_on_topic
        : (coverage.results_returned ?? 0);
    if (coverage.status === 'empty' || count === 0) return 'MISS';
    if (coverage.status === 'thin' || count < 3) return 'WEAK';
    if (count >= 5 || (count >= 3 && (coverage.results_returned ?? 0) <= 5)) return 'STRONG';
    return 'WEAK';
}

async function runEvaluation() {
    let baselineMatches = 0;
    let newMatches = 0;
    let totalRuns = 0;

    const confusion = {
        baseline: {
            STRONG: { STRONG: 0, WEAK: 0, MISS: 0 },
            WEAK:   { STRONG: 0, WEAK: 0, MISS: 0 },
            MISS:   { STRONG: 0, WEAK: 0, MISS: 0 },
        },
        new: {
            STRONG: { STRONG: 0, WEAK: 0, MISS: 0 },
            WEAK:   { STRONG: 0, WEAK: 0, MISS: 0 },
            MISS:   { STRONG: 0, WEAK: 0, MISS: 0 },
        }
    };

    for (const q of scoredQueries) {
        for (const branch of ['with_sector', 'without_sector']) {
            totalRuns++;
            const res = q[branch];
            const judged = judgeQuality(res.on_topic_count, res.row_count);
            const oldPred = baselineMcpQuality(res);

            const data = {
                rows: res.rows.map(r => ({ ...r, title: r.title, summary: r.summary })),
                graphs_searched: res.execution?.graphs_searched || []
            };
            const annotated = await addCoverageAnnotation(data, q.query, [], 5, true, []);
            const newPred = newMcpQuality(annotated.coverage);

            if (oldPred === judged) baselineMatches++;
            if (newPred === judged) newMatches++;

            confusion.baseline[judged][oldPred]++;
            confusion.new[judged][newPred]++;
        }
    }

    console.log(`Overall Agreement:`);
    console.log(`  Baseline MCP: ${baselineMatches}/${totalRuns} (${(baselineMatches / totalRuns * 100).toFixed(1)}%)`);
    console.log(`  New MCP:      ${newMatches}/${totalRuns} (${(newMatches / totalRuns * 100).toFixed(1)}%)\n`);

    console.log(`Per-Label Breakdown:`);
    for (const label of ['STRONG', 'WEAK', 'MISS']) {
        const baseActual = Object.values(confusion.baseline[label]).reduce((a, b) => a + b, 0);
        const basePred = ['STRONG', 'WEAK', 'MISS'].reduce((sum, l) => sum + confusion.baseline[l][label], 0);
        const baseCorrect = confusion.baseline[label][label];

        const newActual = Object.values(confusion.new[label]).reduce((a, b) => a + b, 0);
        const newPred = ['STRONG', 'WEAK', 'MISS'].reduce((sum, l) => sum + confusion.new[l][label], 0);
        const newCorrect = confusion.new[label][label];

        const baseRecall = baseActual > 0 ? (baseCorrect / baseActual * 100).toFixed(1) : '0.0';
        const basePrec = basePred > 0 ? (baseCorrect / basePred * 100).toFixed(1) : '0.0';

        const newRecall = newActual > 0 ? (newCorrect / newActual * 100).toFixed(1) : '0.0';
        const newPrec = newPred > 0 ? (newCorrect / newPred * 100).toFixed(1) : '0.0';

        console.log(`  ${label}:`);
        console.log(`    Baseline: Recall ${baseCorrect}/${baseActual} (${baseRecall}%) | Precision ${baseCorrect}/${basePred} (${basePrec}%)`);
        console.log(`    New MCP:  Recall ${newCorrect}/${newActual} (${newRecall}%) | Precision ${newCorrect}/${newPred} (${newPrec}%)`);
    }

    console.log('\nFull Confusion Matrix (Ground Truth -> Predicted):');
    console.log('Baseline:', JSON.stringify(confusion.baseline, null, 2));
    console.log('New MCP:', JSON.stringify(confusion.new, null, 2));
}

runEvaluation().catch(err => {
    console.error('Fatal error during evaluation:', err);
    process.exit(1);
});
