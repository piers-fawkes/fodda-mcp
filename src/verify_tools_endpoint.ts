import { spawn } from 'child_process';
import axios from 'axios';
import { MCP_SERVER_VERSION } from './tools.js';

async function runTest() {
    console.log('Starting Fodda MCP server verification for /mcp/tools endpoint...');
    const mcp = spawn('node', ['dist/index.js'], {
        env: { ...process.env, PORT: '3000' }
    });

    mcp.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
    mcp.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

    let serverReady = false;

    // Allow server time to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        const response = await axios.get('http://localhost:3000/mcp/tools');
        console.log('✅ Response Code:', response.status);
        console.log('✅ Tools Count:', response.data.count);
        console.log('✅ Server Version:', response.data.version);

        if (response.data.version !== MCP_SERVER_VERSION) {
            console.error(`❌ Version Mismatch: Expected ${MCP_SERVER_VERSION}, got ${response.data.version}`);
            process.exit(1);
        }

        if (response.data.count !== 6) {
            console.error('❌ Expected 6 tools, got ' + response.data.count);
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
