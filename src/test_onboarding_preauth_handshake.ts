import assert from 'node:assert';
import { createServer } from './toolHandlers.js';
import { foddaRequest } from './foddaClient.js';

console.log('=== Running Clean-Room Onboarding Pre-Auth Handshake Tests ===\n');

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

async function run() {
    let lastRequest: { method: string; path: string; apiKey?: string; userId?: string; body?: any } | null = null;
    let mockResponse: any = {};
    let mockShouldThrow = false;
    let mockErrorData: any = null;

    const mockFoddaRequest = async (method: string, path: string, key?: string, uid?: string, body?: any) => {
        lastRequest = { method, path, apiKey: key, userId: uid, body };
        if (mockShouldThrow) {
            const err: any = new Error(mockErrorData?.message || 'Mock Network Error');
            err.response = { status: 400, data: mockErrorData };
            throw err;
        }
        return mockResponse;
    };

    // ─────────────────────────────────────────────────────────────
    // Scenario 1: Clean-room Claude MCP setup (No API key, No userId)
    // Prospective expert installs MCP in Claude and calls begin_expert_onboarding
    // with quickstart params (name, email, knowledgeArea)
    // ─────────────────────────────────────────────────────────────
    console.log('Scenario 1: Clean-room begin_expert_onboarding with quickstart auto-provisioning...');

    const server1 = await createServer(
        '', // No API key
        '', // No userId
        mockFoddaRequest as any,
        (async () => ({})) as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai'
    );

    const tools1 = (server1 as any)._registeredTools;
    const call1 = async (name: string, args: any) => tools1[name].handler(args, {});

    mockResponse = {
        success: true,
        analystId: 'analyst_carlyn_123',
        apiKey: 'fodda_live_key_carlyn_abc',
        email: 'carlyn@example.com'
    };

    const beginRes = await call1('begin_expert_onboarding', {
        name: 'Carlyn Bushman',
        email: 'carlyn@example.com',
        knowledgeArea: 'Retail Systems and AI'
    });

    check(!beginRes.isError, 'begin_expert_onboarding should succeed without pre-existing API key');
    check(lastRequest?.path === '/api/prepare-voice-interview', 'Forwarded to /api/prepare-voice-interview');
    check(lastRequest?.body?.action === 'basic_info', 'Action is basic_info');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'Passed intakeSource: mcp_conversational');
    check(lastRequest?.body?.email === 'carlyn@example.com', 'Forwarded expert email');

    const beginContent = beginRes.content.map((c: any) => c.text).join('\n');
    check(beginContent.includes('expert_onboarding_research'), 'Prompted to advance to expert_onboarding_research');
    check(beginContent.includes('Retail Systems and AI'), 'Includes confirmed knowledge area');

    // ─────────────────────────────────────────────────────────────
    // Scenario 2: Subsequent tool call inherits auto-provisioned key
    // In the same session, calling expert_onboarding_research without
    // passing credentials should use the key auto-provisioned from Scenario 1!
    // ─────────────────────────────────────────────────────────────
    console.log('\nScenario 2: Subsequent tool in session uses auto-provisioned credentials...');

    mockResponse = {
        success: true,
        status: 'research_started',
        jobId: 'job_research_456'
    };

    const researchRes = await call1('expert_onboarding_research', {});
    check(!researchRes.isError, 'expert_onboarding_research succeeded using session credentials');
    check(lastRequest?.apiKey === 'fodda_live_key_carlyn_abc', 'Request carried auto-provisioned apiKey');
    check(lastRequest?.userId === 'carlyn@example.com', 'Request carried expert email as userId');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'Carried intakeSource tag');

    // ─────────────────────────────────────────────────────────────
    // Scenario 3: Pre-auth intake across all remaining onboarding tools
    // In a fresh unauthenticated session, passing `email` allows all
    // onboarding tools to execute without credentials_missing deadlock.
    // ─────────────────────────────────────────────────────────────
    console.log('\nScenario 3: Pre-auth intake with declared email on all tools...');

    const server2 = await createServer(
        '',
        '',
        mockFoddaRequest as any,
        (async () => ({})) as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai'
    );
    const tools2 = (server2 as any)._registeredTools;
    const call2 = async (name: string, args: any) => tools2[name].handler(args, {});

    // 3a. submit_basic_info
    mockResponse = { success: true, apiKey: 'new_key_1' };
    const basicRes = await call2('submit_basic_info', {
        name: 'Alex Retail',
        email: 'alex@retail.com',
        knowledgeArea: 'Omnichannel Logistics',
        termsAccepted: true
    });
    check(!basicRes.isError, 'submit_basic_info accepted with email');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'submit_basic_info intakeSource present');

    // 3b. submit_expertise_analysis
    mockResponse = { success: true };
    const analysisRes = await call2('submit_expertise_analysis', {
        voiceStudy: 'Analytical and contrarian on store closures.',
        expertTopics: ['Logistics', 'Fulfillment', 'POS Systems'],
        email: 'alex@retail.com',
        termsAccepted: true
    });
    check(!analysisRes.isError, 'submit_expertise_analysis accepted with email');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'submit_expertise_analysis intakeSource present');

    // 3c. get_detected_themes
    mockResponse = {
        themes: [{ name: 'Logistics Optimizations', description: 'Store-level routing' }],
        findings: [{ claim: 'Pioneered micro-fulfillment hubs', url: 'https://example.com/article' }]
    };
    const themesRes = await call2('get_detected_themes', { email: 'alex@retail.com' });
    check(!themesRes.isError, 'get_detected_themes accepted with email');
    check(lastRequest?.path.includes('intakeSource=mcp_conversational'), 'get_detected_themes query includes intakeSource');
    check(lastRequest?.userId === 'alex@retail.com', 'get_detected_themes effectiveEmail forwarded');

    // 3d. confirm_themes
    mockResponse = { success: true, questions: ['What led to your micro-fulfillment thesis?'] };
    const confirmRes = await call2('confirm_themes', {
        themes: ['Logistics Optimizations'],
        email: 'alex@retail.com'
    });
    check(!confirmRes.isError, 'confirm_themes accepted with email');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'confirm_themes intakeSource present');

    // 3e. get_onboarding_status
    mockResponse = { status: 'in_progress', completedSteps: ['basic_info', 'expertise_analysis', 'confirm_themes'] };
    const statusRes = await call2('get_onboarding_status', { email: 'alex@retail.com' });
    check(!statusRes.isError, 'get_onboarding_status accepted with email');
    check(lastRequest?.path.includes('intakeSource=mcp_conversational'), 'get_onboarding_status query includes intakeSource');

    // 3f. schedule_interview
    mockResponse = { success: true, meetUrl: 'https://meet.google.com/abc-defg-hij' };
    const interviewRes = await call2('schedule_interview', {
        email: 'alex@retail.com',
        now: true
    });
    check(!interviewRes.isError, 'schedule_interview accepted with email');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'schedule_interview intakeSource present');

    // ─────────────────────────────────────────────────────────────
    // Scenario 4: Missing both apiKey AND email produces structured onboarding error
    // ─────────────────────────────────────────────────────────────
    console.log('\nScenario 4: Graceful structured prompt when email is completely omitted...');

    const server3 = await createServer(
        '',
        '',
        mockFoddaRequest as any,
        (async () => ({})) as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai'
    );
    const tools3 = (server3 as any)._registeredTools;
    const call3 = async (name: string, args: any) => tools3[name].handler(args, {});

    const noCredsRes = await call3('submit_basic_info', {
        name: 'No Email User',
        knowledgeArea: 'Unknown',
        termsAccepted: true
    });

    check(noCredsRes.isError === true, 'submit_basic_info returns error when no email or key is present');
    const errText = noCredsRes.content[0].text;
    check(errText.includes('"credentials_missing"'), 'Returns structured credentials_missing code');
    check(errText.includes('email'), 'Instructs expert to provide email address');

    // ─────────────────────────────────────────────────────────────
    // Scenario 5: Bring-Your-Own-MCP tools pre-auth support
    // ─────────────────────────────────────────────────────────────
    console.log('\nScenario 5: Bring-Your-Own-MCP onboarding pre-auth support...');

    const server4 = await createServer(
        '',
        '',
        mockFoddaRequest as any,
        (async () => ({})) as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai'
    );
    const tools4 = (server4 as any)._registeredTools;
    const call4 = async (name: string, args: any) => tools4[name].handler(args, {});

    // 5a. submit_mcp_source
    mockResponse = { success: true, verified: true };
    const mcpSourceRes = await call4('submit_mcp_source', {
        mcpUrl: 'https://mcp.myretailtwin.com/sse',
        email: 'byo@expert.com',
        termsAccepted: true
    });
    check(!mcpSourceRes.isError, 'submit_mcp_source accepted with email without apiKey');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'submit_mcp_source passed intakeSource');

    // 5b. finalize_byo_mcp_onboarding
    mockResponse = { success: true, analystId: 'analyst_byo_789' };
    const finalizeRes = await call4('finalize_byo_mcp_onboarding', {
        name: 'BYO Expert',
        role: 'Consultant',
        knowledgeArea: 'Supply Chain',
        mcpUrl: 'https://mcp.myretailtwin.com/sse',
        email: 'byo@expert.com',
        termsAccepted: true
    });
    check(!finalizeRes.isError, 'finalize_byo_mcp_onboarding accepted with email without apiKey');
    check(lastRequest?.body?.intakeSource === 'mcp_conversational', 'finalize_byo_mcp_onboarding passed intakeSource');

    // ─────────────────────────────────────────────────────────────
    // Scenario 6: foddaRequest Header Verification
    // ─────────────────────────────────────────────────────────────
    console.log('\nScenario 6: foddaRequest header inspection...');
    const axios = (await import('axios')).default;
    const originalPost = axios.post;
    const originalGet = axios.get;
    let interceptedHeaders: any = null;
    axios.post = (async (url: string, body: any, config: any) => {
        interceptedHeaders = config?.headers;
        return { data: { success: true } };
    }) as any;
    axios.get = (async (url: string, config: any) => {
        interceptedHeaders = config?.headers;
        return { data: { success: true } };
    }) as any;

    try {
        await foddaRequest('POST', '/api/prepare-voice-interview', undefined, 'expert@domain.com', { action: 'basic_info' });
        check(interceptedHeaders?.['X-Onboarding-Session'] === 'pre_auth_mcp', 'foddaRequest sets X-Onboarding-Session: pre_auth_mcp when apiKey is undefined');
        check(interceptedHeaders?.['X-Fodda-Source'] === 'onboarding', 'foddaRequest sets X-Fodda-Source: onboarding');
        check(interceptedHeaders?.['X-User-Id'] === 'expert@domain.com', 'foddaRequest sets X-User-Id from userId');
        check(interceptedHeaders?.['X-User-Email'] === 'expert@domain.com', 'foddaRequest sets X-User-Email from userId');

        await foddaRequest('POST', '/api/prepare-voice-interview', undefined, undefined, { email: 'body@domain.com', intakeSource: 'mcp_conversational' });
        check(interceptedHeaders?.['X-User-Id'] === 'body@domain.com', 'foddaRequest extracts X-User-Id from body.email');
        check(interceptedHeaders?.['X-User-Email'] === 'body@domain.com', 'foddaRequest extracts X-User-Email from body.email');
        check(interceptedHeaders?.['X-Fodda-Source'] === 'onboarding', 'foddaRequest infers X-Fodda-Source: onboarding from intakeSource');
    } finally {
        axios.post = originalPost;
        axios.get = originalGet;
    }

    console.log(`\n=== Pre-Auth Handshake Tests Complete: ${passed} passed, ${failed} failed ===\n`);
    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
