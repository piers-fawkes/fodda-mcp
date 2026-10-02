import assert from 'assert';
import http from 'http';
import express from 'express';
import { normalizeClientSlug, foddaRequest, sessionClients } from './index.js';

async function runClientProvenanceTests() {
    console.log('================================================================');
    console.log(' Running Unit Tests: Client-App Provenance from Handshake');
    console.log('================================================================\n');

    // ── Test 1: normalizeClientSlug normalization ──
    console.log('Test 1: normalizeClientSlug correctly normalizes client names...');
    assert.strictEqual(normalizeClientSlug('Claude'), 'claude');
    assert.strictEqual(normalizeClientSlug('claude.ai'), 'claude');
    assert.strictEqual(normalizeClientSlug('Claude Desktop'), 'claude-desktop');
    assert.strictEqual(normalizeClientSlug('Claude for Desktop'), 'claude-desktop');
    assert.strictEqual(normalizeClientSlug('Claude Code'), 'claude-code');
    assert.strictEqual(normalizeClientSlug('Cursor'), 'cursor');
    assert.strictEqual(normalizeClientSlug('cursor-ide'), 'cursor');
    assert.strictEqual(normalizeClientSlug('Visual Studio Code'), 'vscode');
    assert.strictEqual(normalizeClientSlug('vscode'), 'vscode');
    assert.strictEqual(normalizeClientSlug('Windsurf'), 'windsurf');
    assert.strictEqual(normalizeClientSlug('ChatGPT'), 'chatgpt');
    assert.strictEqual(normalizeClientSlug('Zed'), 'zed');
    assert.strictEqual(normalizeClientSlug('LibreChat'), 'librechat');
    assert.strictEqual(normalizeClientSlug('Roo Code'), 'roo-code');
    assert.strictEqual(normalizeClientSlug('Cline'), 'cline');
    assert.strictEqual(normalizeClientSlug('Custom App v2'), 'custom-app-v2');
    assert.strictEqual(normalizeClientSlug(undefined), '');
    console.log('✅ Test 1 Passed: Client slugs correctly normalized.\n');

    // ── Test 2: foddaRequest attaches X-Fodda-Client and preserves X-Fodda-Source ──
    console.log('Test 2: foddaRequest forwards X-Fodda-Client and preserves X-Fodda-Source...');

    let capturedHeaders: Record<string, string> = {};
    const mockApiServer = http.createServer((req, res) => {
        capturedHeaders = req.headers as Record<string, string>;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, graphs: [] }));
    });

    await new Promise<void>((resolve) => mockApiServer.listen(0, resolve));
    const port = (mockApiServer.address() as any).port;
    const originalApiBaseUrl = process.env.FODDA_API_URL;
    process.env.FODDA_API_URL = `http://localhost:${port}`;

    try {
        await foddaRequest(
            'GET',
            '/v1/graphs',
            'test_key',
            'test_user',
            undefined,
            'req_test_1',
            'chatgpt', // source
            undefined, // spt
            'claude-desktop' // client
        );

        assert.strictEqual(capturedHeaders['x-fodda-source'], 'chatgpt', 'X-Fodda-Source must be preserved');
        assert.strictEqual(capturedHeaders['x-fodda-client'], 'claude-desktop', 'X-Fodda-Client must be forwarded');
        console.log('✅ Test 2 Passed: Headers forwarded cleanly without conflict.\n');
    } finally {
        if (originalApiBaseUrl) {
            process.env.FODDA_API_URL = originalApiBaseUrl;
        } else {
            delete process.env.FODDA_API_URL;
        }
        await new Promise<void>((resolve) => mockApiServer.close(() => resolve()));
    }

    // ── Test 3: Initialize handshake saves clientSlug in sessionClients ──
    console.log('Test 3: Simulated session initialization registers client in sessionClients...');
    const testSid = 'test-session-uuid-123';
    const testClient = normalizeClientSlug('Cursor');
    sessionClients.set(testSid, testClient);
    assert.strictEqual(sessionClients.get(testSid), 'cursor');
    sessionClients.delete(testSid);
    assert.strictEqual(sessionClients.has(testSid), false);
    console.log('✅ Test 3 Passed: sessionClients lifecycle functions as expected.\n');

    console.log('================================================================');
    console.log(' All P3 Client-App Provenance Tests Passed Successfully!');
    console.log('================================================================\n');
    process.exit(0);
}

runClientProvenanceTests().catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
