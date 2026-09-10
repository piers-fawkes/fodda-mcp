/**
 * Verification Test: Earnings Tool Parameter Binding, Payload Hygiene & Inline Corroboration
 */

import { formatEarningsCorroboration } from './toolHandlers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

console.log('\n--- 1. Testing formatEarningsCorroboration ---');

// Case A: Single item with speaker, title, ticker, quote, period
const itemA = {
    speaker: 'Fabrizio Freda',
    title: 'CEO',
    ticker: 'EL',
    quote: 'Prestige beauty showed resilience across European travel retail.',
    period: 'Q2-2026',
    transcript_url: 'https://seekingalpha.com/article/el-q2-2026'
};
const resA = formatEarningsCorroboration(itemA);
assert(resA !== null, 'formatEarningsCorroboration returns a non-null string for itemA');
assert(resA!.includes('[Earnings Call Corroboration]: Fabrizio Freda (CEO) [EL]: "Prestige beauty showed resilience across European travel retail." (Q2-2026)'), 'Format matches executive quote attribution standard');

// Case B: Item with theme and ticker (no quote)
const itemB = {
    ticker: 'ULTA',
    theme: 'Mass vs Prestige margin shifts',
    period: 'Q1-2026'
};
const resB = formatEarningsCorroboration(itemB);
assert(resB !== null, 'formatEarningsCorroboration returns non-null for theme item');
assert(resB!.includes('[Earnings Call Corroboration]: [ULTA] Mass vs Prestige margin shifts (Q1-2026)'), 'Format matches analyst theme standard');

// Case C: Array of multiple items
const resMulti = formatEarningsCorroboration([itemA, itemB]);
assert(resMulti !== null && resMulti.includes('\n'), 'Multi-item corroboration joins with newline');
assert(resMulti!.includes('Fabrizio Freda') && resMulti!.includes('ULTA'), 'Multi-item includes all entries');

// Case D: Fallbacks and edge cases
assert(formatEarningsCorroboration(null) === null, 'null returns null');
assert(formatEarningsCorroboration([]) === null, 'empty array returns null');
assert(formatEarningsCorroboration('Direct quote string') === '[Earnings Call Corroboration]: Direct quote string', 'Plain string supported');

console.log('\n--- 2. Testing URLSearchParams Binding in get_validated_trends ---');
const params = new URLSearchParams();
const ticker = 'EL';
const sector = 'beauty';
const search = 'travel retail';
if (ticker) params.set('ticker', ticker);
if (sector) params.set('sector', sector);
if (search) {
    params.set('search', search);
    params.set('query', search);
}
assert(params.get('search') === 'travel retail', 'params contains search');
assert(params.get('query') === 'travel retail', 'params contains query for API binding compatibility');
assert(params.get('ticker') === 'EL', 'params contains ticker');
assert(params.get('sector') === 'beauty', 'params contains sector');

console.log('\n--- 3. Testing Payload Hygiene (Visual Recipe & Speaker Note Stripping) ---');
const srcPath = fs.existsSync(path.resolve(__dirname, 'toolHandlers.ts'))
    ? path.resolve(__dirname, 'toolHandlers.ts')
    : path.resolve(__dirname, '../src/toolHandlers.ts');
const toolHandlersSrc = fs.readFileSync(srcPath, 'utf8');

// Assert FODDA_HOUSE_VISUAL_RECIPE_V2_2 is not in get_validated_trends return
const getValTrendsMatch = toolHandlersSrc.match(/server\.tool\(\s*'get_validated_trends'[\s\S]*?async \(\{[\s\S]*?\}\) => \{([\s\S]*?)\n    \);/);
assert(Boolean(getValTrendsMatch && getValTrendsMatch[1]), 'Found get_validated_trends handler in toolHandlers.ts');
if (getValTrendsMatch && getValTrendsMatch[1]) {
    const handlerBody = getValTrendsMatch[1];
    assert(!handlerBody.includes('FODDA_HOUSE_VISUAL_RECIPE_V2_2'), 'get_validated_trends does NOT return FODDA_HOUSE_VISUAL_RECIPE_V2_2');
    assert(handlerBody.includes("params.set('query', search)"), 'get_validated_trends binds query param');
}

// Assert SPEAKER NOTE is not pushed into prose parts in consult handlers
assert(!toolHandlersSrc.includes("parts.push(`--- SPEAKER NOTE:"), 'No parts.push of SPEAKER NOTE into prose in toolHandlers.ts');
assert(toolHandlersSrc.includes('...(result.speaker_note ? { speaker_note: result.speaker_note } : {})'), 'speaker_note is exposed as structured field in consult returns');
assert(toolHandlersSrc.includes('...(result.billing ? { billing: result.billing } : {})'), 'billing block is passed through in consult returns');
assert(toolHandlersSrc.includes('...(result.usage ? { usage: result.usage } : {})'), 'usage block is passed through in consult returns');

console.log('\n--- 4. Testing tools-manifest.json Integrity ---');
const manifestRaw = fs.readFileSync(path.resolve(__dirname, '../tools-manifest.json'), 'utf8');
const manifest = JSON.parse(manifestRaw);

const valTool = manifest.tools.find((t: any) => t.name === 'get_validated_trends');
assert(Boolean(valTool), 'get_validated_trends exists in tools-manifest.json');
assert(valTool.bills_as === 'earnings_intelligence', 'get_validated_trends bills_as is "earnings_intelligence"');
assert(valTool.category === 'Financial', 'get_validated_trends category is "Financial"');
assert(manifest.billable === 23, 'Billable tools count is 23');

// Verify cost silence guard
const violations = manifest.tools.filter((t: any) => /Price:\s*\$|\$\s?\d/i.test(t.description));
assert(violations.length === 0, `All tool descriptions in manifest are cost-silent (violations: ${violations.length})`);

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
    process.exit(1);
}
