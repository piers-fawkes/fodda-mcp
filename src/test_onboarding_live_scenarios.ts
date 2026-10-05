import assert from 'node:assert';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from './toolHandlers.js';

console.log('=== Running Live Scenario Tests for Onboarding Tools ===\n');

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
    let mockResponse: any = {};
    let mockStatus = 200;
    let mockShouldThrow = false;
    let mockErrorData: any = null;

    const mockFoddaRequest = async (method: string, path: string, key?: string, uid?: string, body?: any) => {
        if (mockShouldThrow) {
            const err: any = new Error(mockErrorData?.message || 'Mock Network Error');
            err.response = { status: mockStatus, data: mockErrorData };
            throw err;
        }
        return mockResponse;
    };

    const server = await createServer(
        'test-api-key',
        'test-user@example.com',
        mockFoddaRequest as any,
        (async () => ({})) as any,
        () => 'widget-id',
        () => 'https://mcp.fodda.ai'
    );

    const registeredTools = (server as any)._registeredTools;

    // Helper to call a tool handler directly
    const callTool = async (name: string, args: any) => {
        const tool = registeredTools[name];
        if (!tool) throw new Error(`Tool ${name} not found`);
        return await tool.handler(args, {});
    };

    // 1. Forced Failure: terms_required on submit_basic_info
    console.log('1. Testing forced failure: terms_required...');
    const termsRes = await callTool('submit_basic_info', {
        name: 'Jane Doe',
        role: 'Founder',
        knowledgeArea: 'Retail AI',
        termsAccepted: false
    });
    check(termsRes.isError === true, 'termsAccepted: false returns isError: true');
    const termsText = termsRes.content[0].text;
    check(termsText.includes('```json'), 'terms_required includes fenced JSON block');
    const termsJsonMatch = termsText.match(/```json\n([\s\S]*?)\n```/);
    const termsJson = JSON.parse(termsJsonMatch![1]);
    check(termsJson.error.code === 'terms_required', 'error code is terms_required');
    check(termsJson.error.cause === 'Terms not accepted yet.', 'error cause matches');
    check(termsJson.error.next_action.includes('submit_basic_info again'), 'error next_action matches');

    // 2. Forced Failure: mcp_auth_unsupported on submit_mcp_source
    console.log('\n2. Testing forced failure: mcp_auth_unsupported...');
    const authRes = await callTool('submit_mcp_source', {
        mcpUrl: 'https://games.thisisdelightful.com/mcp',
        mcpAuthType: 'bearer'
    });
    check(authRes.isError === true, 'mcpAuthType: bearer returns isError: true');
    const authText = authRes.content[0].text;
    const authJsonMatch = authText.match(/```json\n([\s\S]*?)\n```/);
    const authJson = JSON.parse(authJsonMatch![1]);
    check(authJson.error.code === 'mcp_auth_unsupported', 'error code is mcp_auth_unsupported');
    check(authJson.error.next_action.includes("authType 'none'"), 'next_action guides to authType none');

    // 3. Forced Failure: interview_slot_invalid on schedule_interview
    console.log('\n3. Testing forced failure: interview_slot_invalid...');
    mockShouldThrow = true;
    mockStatus = 400;
    mockErrorData = { error: 'interview_slot_invalid', message: 'The requested interview time is outside 15 min to 30 days.' };
    const slotRes = await callTool('schedule_interview', {
        datetime: '2026-10-02T16:00:00.000Z'
    });
    check(slotRes.isError === true, 'invalid slot returns isError: true');
    const slotText = slotRes.content[0].text;
    const slotJsonMatch = slotText.match(/```json\n([\s\S]*?)\n```/);
    const slotJson = JSON.parse(slotJsonMatch![1]);
    check(slotJson.error.code === 'interview_slot_invalid', 'error code is interview_slot_invalid');
    check(slotJson.error.next_action.includes('15 minutes and 30 days'), 'next_action guides on scheduling window');

    // 4. Forced Failure: upstream_error fallback
    console.log('\n4. Testing forced failure: upstream_error...');
    mockShouldThrow = true;
    mockStatus = 500;
    mockErrorData = { message: 'Database connection failed' };
    const upstreamRes = await callTool('get_detected_themes', {});
    check(upstreamRes.isError === true, 'upstream 500 returns isError: true');
    const upstreamText = upstreamRes.content[0].text;
    const upstreamJsonMatch = upstreamText.match(/```json\n([\s\S]*?)\n```/);
    const upstreamJson = JSON.parse(upstreamJsonMatch![1]);
    check(upstreamJson.error.code === 'upstream_error', 'fallback error code is upstream_error');
    check(upstreamJson.error.cause === 'Database connection failed', 'original error message preserved in cause');

    // Reset mock
    mockShouldThrow = false;
    mockStatus = 200;
    mockErrorData = null;

    // 5. get_onboarding_status reachable statuses
    console.log('\n5. Testing get_onboarding_status reachable statuses...');

    const testStatuses = [
        {
            status: 'not_started',
            expectedTool: 'begin_expert_onboarding',
            expectedAction: 'Start onboarding to set up your Human Agent.'
        },
        {
            status: 'basic_info_submitted',
            expectedTool: 'expert_onboarding_research',
            expectedAction: 'Next, Fodda researches your published work so your interview can focus on your thinking, not your CV.'
        },
        {
            status: 'research_complete',
            expectedTool: 'submit_expertise_analysis',
            expectedAction: 'Share your voice study and expertise map so we can find your core themes.'
        },
        {
            status: 'analysis_submitted',
            expectedTool: 'get_detected_themes',
            expectedAction: 'Review the themes Fodda found in your work and confirm the ones that fit, so we can prepare your interview questions.'
        },
        {
            status: 'awaiting_interview',
            expectedTool: 'schedule_interview',
            expectedAction: 'Book your quick 5–10 minute voice interview, now or at a time that suits you.'
        },
        {
            status: 'awaiting_interview',
            recallBotId: 'bot-12345',
            recallJoinAt: 'Friday, Oct 3 at 2:00 PM EDT',
            expectedTool: null,
            expectedAction: 'Your interview is booked for Friday, Oct 3 at 2:00 PM EDT. The interviewer will join your Google Meet.'
        },
        {
            status: 'pending_approval',
            expectedTool: null,
            expectedAction: "You're done. Fodda is reviewing your Human Agent and will email you before it goes live."
        },
        {
            status: 'active',
            expectedTool: null,
            expectedAction: 'Your Human Agent is live.'
        }
    ];

    for (const testCase of testStatuses) {
        mockResponse = {
            status: testCase.status,
            analystId: 'recAnalyst123',
            recallBotId: (testCase as any).recallBotId,
            recallJoinAt: (testCase as any).recallJoinAt
        };
        const statusRes = await callTool('get_onboarding_status', {});
        check(statusRes.isError !== true, `status ${testCase.status} returns clean result`);
        const prose = statusRes.content[0].text;
        const payload = JSON.parse(statusRes.content[1].text);

        check(prose.startsWith('**Where you are:**') && prose.includes('**Next step for you:**'), `prose format matches for ${testCase.status}`);
        check(prose.includes(testCase.expectedAction), `prose includes expected action for ${testCase.status}`);
        check(payload.next_tool === testCase.expectedTool, `payload next_tool is ${testCase.expectedTool} for ${testCase.status}`);
        check(payload.next_action === testCase.expectedAction, `payload next_action matches for ${testCase.status}`);
    }

    // 6. schedule_interview success: next_step: null and closing reassurance
    console.log('\n6. Testing schedule_interview success...');
    mockResponse = { scheduled: true, joinUrl: 'https://meet.google.com/abc-defg-hij' };
    const schedRes = await callTool('schedule_interview', { now: true });
    const schedProse = schedRes.content[0].text;
    const schedPayload = JSON.parse(schedRes.content[1].text);
    check(schedPayload.next_step === null, 'schedule_interview returns next_step: null');
    check(
        schedProse.includes('After the interview, Fodda reviews your Human Agent and emails you. You can check progress any time with get_onboarding_status.'),
        'schedule_interview includes closing reassurance line'
    );

    // 7. begin_expert_onboarding with inProgress
    console.log('\n7. Testing begin_expert_onboarding resume behavior...');
    mockResponse = {
        inProgress: {
            analystId: 'rec999',
            status: 'analysis_submitted'
        }
    };
    const resumeRes = await callTool('begin_expert_onboarding', {});
    const resumeProse = resumeRes.content[0].text;
    const resumePayload = JSON.parse(resumeRes.content[1].text);
    check(resumePayload.status === 'resumed', 'status is resumed');
    check(resumePayload.resume.next_step === 'get_detected_themes', 'resume next_step is get_detected_themes');
    check(resumeProse.includes("You've already started, so let's pick up at <get_detected_themes>."), 'prose includes "You\'ve already started, so let\'s pick up at <get_detected_themes>."');

    console.log(`\nLive Scenarios Verification Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

run().catch(err => {
    console.error('Fatal error in test runner:', err);
    process.exit(1);
});
