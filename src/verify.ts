import { spawn } from 'child_process';
import { createInterface } from 'readline';

async function runTest() {
    console.log('Starting Fodda MCP server verification...');
    const mcp = spawn('node', ['dist/index.js']);
    const rl = createInterface({
        input: mcp.stdout,
        terminal: false
    });

    mcp.stderr.on('data', (data) => {
        console.error(`[Server Log]: ${data}`);
    });

    const sendRequest = (req: any) => {
        mcp.stdin.write(JSON.stringify(req) + '\n');
    };

    const waitForResponse = (): Promise<any> => {
        return new Promise((resolve) => {
            rl.once('line', (line) => {
                resolve(JSON.parse(line));
            });
        });
    };

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('Testing tools/list...');
    sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
    });

    const listToolsRes = await waitForResponse();
    if (listToolsRes.result?.tools) {
        console.log('✅ Tools registered:', listToolsRes.result.tools.map((t: any) => t.name).join(', '));
    } else {
        console.error('❌ Failed to list tools:', JSON.stringify(listToolsRes));
    }

    // Cleanup
    mcp.kill();
    process.exit(0);
}

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
