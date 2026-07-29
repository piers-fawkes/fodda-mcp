import { resolveAnalystAlias } from './toolHandlers.js';
import assert from 'assert';

console.log("Running tests for resolveAnalystAlias...");

const tests = [
    {
        input: { analyst_id: "Nike CMO" },
        expected: { analyst_id: "brand-cmo", company: "Nike" }
    },
    {
        input: { analyst_id: "Nike CFO" },
        expected: { analyst_id: "brand-cfo", company: "Nike" }
    },
    {
        input: { analyst_id: "Nike CEO" },
        expected: { analyst_id: "brand-ceo", company: "Nike" }
    },
    {
        input: { analyst_id: "Ask Nike CFO" },
        expected: { analyst_id: "brand-cfo", company: "Nike" }
    },
    {
        input: { analyst_id: "Consult Nike CEO" },
        expected: { analyst_id: "brand-ceo", company: "Nike" }
    },
    {
        input: { analyst_id: "nike-cmo" },
        expected: { analyst_id: "brand-cmo", company: "Nike" }
    },
    {
        input: { analyst_id: "Nike Synthetic CMO" },
        expected: { analyst_id: "brand-cmo", company: "Nike" }
    },
    {
        input: { analyst_id: "Apple CEO" },
        expected: { analyst_id: "brand-ceo", company: "Apple" }
    },
    {
        input: { analyst_id: "Target CFO" },
        expected: { analyst_id: "brand-cfo", company: "Target" }
    },
    {
        input: { analyst_id: "brand-cmo", company: "Nike" },
        expected: { analyst_id: "brand-cmo", company: "Nike" }
    },
    {
        input: { analyst_id: "brand-cmo" },
        expected: { analyst_id: "brand-cmo", company: undefined }
    },
    {
        input: { analyst_id: "ben-dietz-sic" },
        expected: { analyst_id: "ben-dietz-sic", company: undefined }
    },
    {
        input: { analyst_id: "Starbucks Chief Marketing Officer" },
        expected: { analyst_id: "brand-cmo", company: "Starbucks" }
    }
];

let passed = 0;
for (const t of tests) {
    const res = resolveAnalystAlias(t.input.analyst_id, t.input.company);
    try {
        assert.strictEqual(res.analyst_id, t.expected.analyst_id, `analyst_id mismatch for ${JSON.stringify(t.input)}`);
        assert.strictEqual(res.company, t.expected.company, `company mismatch for ${JSON.stringify(t.input)}`);
        console.log(`✅ PASS: ${JSON.stringify(t.input)} -> ${JSON.stringify(res)}`);
        passed++;
    } catch (err: any) {
        console.error(`❌ FAIL: ${JSON.stringify(t.input)} -> got ${JSON.stringify(res)}, expected ${JSON.stringify(t.expected)}`);
        console.error(err.message);
    }
}

console.log(`\nTest Summary: ${passed}/${tests.length} passed.`);
if (passed !== tests.length) {
    process.exit(1);
}
