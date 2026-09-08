import { spawn } from 'child_process';
import axios from 'axios';
import { MCP_SERVER_VERSION } from './tools.js';

async function runTest() {
    const testPort = process.env.TEST_PORT || '3099';
    console.log(`Starting Fodda MCP server verification for /health endpoint on port ${testPort}...`);
    const mcp = spawn('node', ['dist/index.js'], {
        env: { ...process.env, PORT: testPort }
    });

    mcp.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
    mcp.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

    // Poll /health with retries up to 10s to allow async catalog loading
    let response: any = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
        try {
            response = await axios.get(`http://localhost:${testPort}/health`, { timeout: 1500 });
            if (response && response.status === 200) break;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 400));
        }
    }

    try {
        if (!response) {
            throw new Error(`Server did not respond with HTTP 200 within 10 seconds on port ${testPort}`);
        }
        console.log('✅ Response Code:', response.status);
        console.log('✅ Health Status:', response.data.status);
        console.log('✅ Server Version:', response.data.version);

        if (response.data.version !== MCP_SERVER_VERSION) {
            console.error(`❌ Version Mismatch: Expected ${MCP_SERVER_VERSION}, got ${response.data.version}`);
            process.exit(1);
        }

        if (response.data.status !== 'ok') {
            console.error('❌ Expected status ok, got ' + response.data.status);
            process.exit(1);
        }
    } catch (error: any) {
        console.error('❌ Request failed:', error.message);
        process.exit(1);
    } finally {
        mcp.kill();
    }
}

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
