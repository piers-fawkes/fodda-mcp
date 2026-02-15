import axios from 'axios';
import crypto from 'crypto';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SECRET = process.env.FODDA_MCP_SECRET || 'dev-secret-key';
const PORT = 3001; // Use a different port for testing

async function runTest() {
    console.log('Starting HMAC verification test...');

    // Start server
    const mcp = spawn('node', ['dist/src/index.js'], {
        env: { ...process.env, PORT: String(PORT), FODDA_MCP_SECRET: SECRET }
    });

    mcp.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
    mcp.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

    // Wait for server
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        const baseURL = `http://localhost:${PORT}`;

        // Hex 1: Public Endpoint (Should pass without signature)
        console.log('\n--- Test 1: Public Endpoint (No Signature) ---');
        try {
            const res1 = await axios.get(`${baseURL}/mcp/tools`);
            console.log('✅ Passed: Public endpoint accessible (Status:', res1.status, ')');
        } catch (e: any) {
            console.error('❌ Failed: Public endpoint blocked (', e.message, ')');
            process.exit(1);
        }

        // Test 2: Protected Endpoint (No Signature) - Should Fail 401
        console.log('\n--- Test 2: Protected Endpoint (No Signature) ---');
        try {
            await axios.post(`${baseURL}/messages`, { jsonrpc: '2.0', method: 'ping' });
            console.error('❌ Failed: Protected endpoint allowed without signature');
            process.exit(1);
        } catch (e: any) {
            if (e.response && e.response.status === 401) {
                console.log('✅ Passed: Request blocked (401)');
            } else {
                console.error('❌ Failed: Unexpected status', e.response?.status);
                process.exit(1);
            }
        }

        // Test 3: Protected Endpoint (Invalid Signature) - Should Fail 401
        console.log('\n--- Test 3: Protected Endpoint (Invalid Signature) ---');
        try {
            await axios.post(`${baseURL}/messages`, { jsonrpc: '2.0', method: 'ping' }, {
                headers: { 'X-Fodda-Signature': 'invalid' }
            });
            console.error('❌ Failed: Protected endpoint allowed with invalid signature');
            process.exit(1);
        } catch (e: any) {
            if (e.response && e.response.status === 401) {
                console.log('✅ Passed: Request blocked (401)');
            } else {
                console.error('❌ Failed: Unexpected status', e.response?.status);
                process.exit(1);
            }
        }

        // Test 4: Protected Endpoint (Valid Signature) - Should Pass (200 or other logic error, but not 401)
        console.log('\n--- Test 4: Protected Endpoint (Valid Signature) ---');
        const body = { jsonrpc: '2.0', method: 'ping', id: 1 }; // Simple body
        const payload = JSON.stringify(body);
        const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

        try {
            // Note: /messages expects specific MCP protocol, so it might 400 or fail logic, 
            // but we are testing Middleware auth here.
            // If we get passed the middleware, we might get "SSE connection not established" (400) 
            // because /messages requires an SSE session cookie or query param usually?
            // Actually in index.ts:
            // app.post("/messages", async (req, res) => { if (transport) ... else 400 "SSE connection not established" })
            // So if we get 400 "SSE connection not established", it means we PASSED auth!

            await axios.post(`${baseURL}/messages`, body, {
                headers: { 'X-Fodda-Signature': signature }
            });
            console.log('✅ Passed: Request allowed (200)');
        } catch (e: any) {
            if (e.response && e.response.data === "SSE connection not established") {
                console.log('✅ Passed: Request passed auth (reached logic handler)');
            } else if (e.response && e.response.status === 200) {
                console.log('✅ Passed: Request allowed (200)');
            } else {
                console.error('❌ Failed: Unexpected error', e.response?.status, e.response?.data);
                process.exit(1);
            }
        }

    } catch (e: any) {
        console.error('❌ Test Suite Error:', e.message);
        process.exit(1);
    } finally {
        mcp.kill();
    }
}

runTest();
