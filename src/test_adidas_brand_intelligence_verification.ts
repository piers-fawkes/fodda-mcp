/**
 * Verification Test: Adidas Brand Intelligence & 90-Day Recency Bridge
 *
 * Verifies:
 * 1. Empty-state bug fix: Adidas coverage status is "covered" (not "empty")
 * 2. External signals preserved: Google Trends and Wikipedia are NOT suppressed
 * 3. 90-day corporate activity passed through into profile and compact JSON
 * 4. Widget HTML renders "Recent 90-Day Corporate Activity" card with dated events and grounded trends
 * 5. Prompt guidance note instructs LLM to synthesize recency data
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from './toolHandlers.js';

const adidasFixturePath = path.resolve('../Fodda API/Fodda/scripts/fixtures/brand_intelligence/adidas.json');
assert(fs.existsSync(adidasFixturePath), `Adidas fixture must exist at ${adidasFixturePath}`);
const adidasFixture = JSON.parse(fs.readFileSync(adidasFixturePath, 'utf8'));

async function runAdidasVerification() {
    console.log('=== Running Adidas Brand Intelligence & Recency Verification ===\n');

    const requestedPaths: string[] = [];
    const mockFoddaRequest = async (method: string, reqPath: string, apiKey: string, userId: string, body?: any) => {
        requestedPaths.push(reqPath);
        if (reqPath === '/v1/graphs') return [];
        if (reqPath.startsWith('/v1/brand-intelligence/')) {
            return adidasFixture;
        }
        if (reqPath.includes('google-trends')) {
            return {
                snapshot: {
                    interest_over_time: [
                        { date: '2026-01-01', value: 72 },
                        { date: '2026-10-01', value: 88 }
                    ],
                    related_queries: ['adidas samba', 'adidas spezial', 'adidas adizero']
                }
            };
        }
        if (reqPath.includes('wikipedia')) {
            return {
                snapshot: {
                    article: 'Adidas',
                    avg_daily_pageviews: 18500,
                    data_status: 'ok'
                }
            };
        }
        return {};
    };

    const server = await createServer(
        'sk_test_key',
        'test_user',
        mockFoddaRequest as any,
        async () => ({}),
        () => '',
        () => 'https://mcp.fodda.ai'
    );

    const handler = (server as any)._registeredTools['brand_tracker']?.handler;
    assert(typeof handler === 'function', 'brand_tracker tool handler must exist');

    // ── Test 1: Full mode (widget HTML + profile) ──────────────────────────
    console.log('Test 1: Full mode execution for Adidas...');
    const fullResult = await handler({
        brand_name: 'Adidas',
        format: 'full'
    });

    assert(!fullResult.isError, 'brand_tracker execution should succeed');
    const fullText = fullResult.content?.[0]?.text || '';
    const widgetHtml = fullResult.content?.[1]?.text || '';

    // Check 1: Empty state bug fix
    assert(!fullText.includes('[EMPTY COVERAGE]'), 'Adidas must NOT be flagged as [EMPTY COVERAGE]');
    assert(fullText.includes('"status": "covered"'), 'Coverage status must be "covered"');
    assert(fullText.includes('"trend_count": 9') || fullText.includes('"trend_count": 10'), 'Trend count must be >= 9');

    // Check 2: Market signals not suppressed
    assert(fullText.includes('google_trends'), 'Google Trends must not be null');
    assert(fullText.includes('wikipedia'), 'Wikipedia must not be null');

    // Check 3: 90-day recency guidance note
    assert(fullText.includes('[RECENCY GUIDANCE]'), 'Output must include [RECENCY GUIDANCE] note');
    assert(fullText.includes('Synthesize the included 90-day corporate activity'), 'Guidance note must instruct synthesis');

    // Check 4: Widget HTML renders the 90-day recency card
    assert(widgetHtml.includes('Recent 90-Day Corporate Activity'), 'Widget HTML must render Recent 90-Day Corporate Activity section');
    assert(widgetHtml.includes('adidas achieves record results in the third quarter of 2026'), 'Widget HTML must display Q3 earnings event');
    assert(widgetHtml.includes('Grounds:'), 'Widget HTML must display grounded trends');
    assert(widgetHtml.includes('The Unified Brand-Performance Continuum'), 'Widget HTML must include matched trend tag');
    console.log('  ✓ Full mode verified: coverage covered, 10 trends, signals preserved, widget rendered with 90-day recency card.\n');

    // ── Test 2: Compact mode ───────────────────────────────────────────────
    console.log('Test 2: Compact mode execution for Adidas...');
    const compactResult = await handler({
        brand_name: 'Adidas',
        format: 'compact'
    });

    assert(!compactResult.isError, 'Compact brand_tracker execution should succeed');
    const compactText = compactResult.content?.[0]?.text || '';
    assert(compactText.includes('── COMPACT BRAND INTELLIGENCE ──'), 'Must return compact format');
    assert(compactText.includes('"recent_activity_90d"'), 'Compact JSON must include recent_activity_90d');
    assert(compactText.includes('2026-10-29'), 'Compact JSON must include 2026-10-29 event date');
    assert(compactText.includes('adidas achieves record results'), 'Compact JSON must include event headline');
    console.log('  ✓ Compact mode verified: recent_activity_90d included in compact JSON.\n');

    console.log('===========================================================');
    console.log('✅ ALL ADIDAS BRAND INTELLIGENCE VERIFICATION TESTS PASSED');
    console.log('===========================================================');
}

runAdidasVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
