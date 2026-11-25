/**
 * Test Suite: Durable Firestore Async Jobs & A2A Tasks
 *
 * Verifies:
 * 1. Write a RUNNING job -> transition to COMPLETE.
 * 2. Wipe L1 memory map.
 * 3. Poll jobId twice -> both polls return COMPLETE (non-destructive read receipt).
 * 4. Cross-user poll with different ownerScope is rejected with JobUnauthorizedError.
 * 5. Stale RUNNING job (startedAt 5 minutes ago) resolves as FAILED (interrupted/retryable).
 * 6. A2A Task persistence: save working task -> wipe L1 -> fetch from Firestore -> complete with artifacts -> non-destructive read -> cross-user rejection -> stale working task timeout.
 * 7. Clean up all created test documents.
 */

import {
    setResearchJob,
    getResearchJob,
    deleteResearchJob,
    computeOwnerScope,
    clearL1Cache,
    getL1ResearchJobsCount,
    JobUnauthorizedError,
    saveA2ATask,
    getA2ATask,
    deleteA2ATask,
    TaskUnauthorizedError,
    type A2ATask,
} from '../src/jobStore.js';

function assert(condition: boolean, msg: string): void {
    if (!condition) {
        console.error(`❌ ASSERTION FAILED: ${msg}`);
        process.exit(1);
    }
    console.log(`  ✅ ${msg}`);
}

async function runTestSuite() {
    console.log('========================================================');
    console.log('   Testing Durable Firestore Async Jobs & A2A Tasks');
    console.log('========================================================\n');

    const testRunId = Date.now().toString(36);
    const primaryApiKey = `sk_test_primary_${testRunId}`;
    const primaryUserId = `user_primary_${testRunId}`;
    const primaryOwnerScope = computeOwnerScope(primaryApiKey, primaryUserId);

    const crossUserApiKey = `sk_test_cross_${testRunId}`;
    const crossUserId = `user_cross_${testRunId}`;
    const crossUserOwnerScope = computeOwnerScope(crossUserApiKey, crossUserId);

    // ─────────────────────────────────────────────────────────────
    // Test 1: Research Job Lifecycle & Non-Destructive Polling
    // ─────────────────────────────────────────────────────────────
    console.log('Test 1: Research Job Lifecycle & Non-Destructive Read Receipt');
    const jobId = `job_test_${testRunId}`;

    // Step 1a: Write a RUNNING job
    const runningJob = await setResearchJob(jobId, {
        status: 'RUNNING',
        result: null,
        error: null,
        ownerScope: primaryOwnerScope,
        isConsult: false,
    });
    assert(runningJob.status === 'RUNNING', 'Job created in RUNNING status');
    assert(getL1ResearchJobsCount() > 0, 'L1 cache holds the new job');

    // Step 1b: Transition to COMPLETE
    const mockReport = `# Deep Research: Sustainable Luxury Materials\n\nExecutive briefing on biopolymers and recycled cashmere trends.`;
    const mockResult = {
        report: mockReport,
        sub_themes_used: ['biopolymers', 'recycled cashmere'],
        duration_sec: 42,
        graphs_searched: ['retail-luxury', 'materials-innovation']
    };
    const completedJob = await setResearchJob(jobId, {
        status: 'COMPLETE',
        result: mockResult,
        firstOverageChargeNotice: false,
    });
    assert(completedJob.status === 'COMPLETE', 'Job transitioned to COMPLETE');
    assert(completedJob.ownerScope === primaryOwnerScope, 'Job preserved ownerScope across status update');

    // Step 1c: Wipe L1 memory map to simulate cold start or cross-instance routing
    clearL1Cache();
    assert(getL1ResearchJobsCount() === 0, 'L1 memory cache wiped to 0 entries');

    // Step 1d: First poll from Firestore (cache miss -> Firestore load)
    const poll1 = await getResearchJob(jobId, primaryOwnerScope);
    assert(poll1 !== null, 'Poll 1: Job successfully read from Firestore on cache miss');
    assert(poll1?.status === 'COMPLETE', 'Poll 1: Status is COMPLETE');
    assert(poll1?.result?.report === mockReport, 'Poll 1: Report payload intact');

    // Step 1e: Second poll (idempotent, non-destructive read receipt)
    const poll2 = await getResearchJob(jobId, primaryOwnerScope);
    assert(poll2 !== null, 'Poll 2: Job still exists on second poll (not destroyed on first read)');
    assert(poll2?.status === 'COMPLETE', 'Poll 2: Status is still COMPLETE');
    assert(poll2?.result?.duration_sec === 42, 'Poll 2: Full result payload intact on retry');

    // ─────────────────────────────────────────────────────────────
    // Test 2: Cross-User Tenant Isolation Guard
    // ─────────────────────────────────────────────────────────────
    console.log('\nTest 2: Cross-User Tenant Isolation Guard');
    let crossUserBlocked = false;
    try {
        await getResearchJob(jobId, crossUserOwnerScope);
    } catch (err: any) {
        if (err instanceof JobUnauthorizedError || err.name === 'JobUnauthorizedError') {
            crossUserBlocked = true;
        }
    }
    assert(crossUserBlocked, 'Cross-user poll with different ownerScope was rejected with JobUnauthorizedError');

    // ─────────────────────────────────────────────────────────────
    // Test 3: Stale RUNNING Job Recovery (Interrupted-Job Detection)
    // ─────────────────────────────────────────────────────────────
    console.log('\nTest 3: Stale RUNNING Job Recovery (Interrupted-Job Detection)');
    const staleJobId = `job_stale_${testRunId}`;
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 300s > 260s ceiling

    await setResearchJob(staleJobId, {
        status: 'RUNNING',
        result: null,
        error: null,
        ownerScope: primaryOwnerScope,
        startedAt: fiveMinutesAgo,
    });

    // Wipe L1 so getResearchJob reads from Firestore and runs the ceiling check
    clearL1Cache();

    const staleResult = await getResearchJob(staleJobId, primaryOwnerScope);
    assert(staleResult !== null, 'Stale job retrieved');
    assert(staleResult?.status === 'FAILED', 'Stale job (>260s) automatically resolved to status: FAILED');
    assert(
        Boolean(staleResult?.error && staleResult.error.includes('maximum execution window')),
        `Stale job returned retryable interrupted message: "${staleResult?.error}"`
    );

    // Verify that Firestore also persisted this FAILED status
    clearL1Cache();
    const persistedStale = await getResearchJob(staleJobId, primaryOwnerScope);
    assert(persistedStale?.status === 'FAILED', 'Interrupted FAILED status persisted in Firestore');

    // ─────────────────────────────────────────────────────────────
    // Test 4: A2A Task Store Persistence & Recovery
    // ─────────────────────────────────────────────────────────────
    console.log('\nTest 4: Google A2A Task Store Persistence');
    const a2aTaskId = `task_test_${testRunId}`;
    const a2aCallerHash = primaryOwnerScope;
    const a2aCrossHash = crossUserOwnerScope;

    const initialA2ATask: A2ATask = {
        id: a2aTaskId,
        contextId: `ctx_${testRunId}`,
        status: {
            state: 'working',
            message: { role: 'agent', parts: [{ kind: 'text', text: 'Deep research in progress' }] },
        },
    };

    // Save initial task
    await saveA2ATask(initialA2ATask, a2aCallerHash);
    clearL1Cache();

    // Read back from Firestore
    const a2aRead1 = await getA2ATask(a2aTaskId);
    assert(a2aRead1 !== null, 'A2A task retrieved from Firestore after L1 wipe');
    assert(a2aRead1?.task.status.state === 'working', 'A2A task state is working');

    // Complete task with artifacts
    if (a2aRead1) {
        a2aRead1.task.status = { state: 'completed' };
        a2aRead1.task.artifacts = [
            {
                name: 'research_report',
                description: 'A2A research report',
                parts: [{ kind: 'text', text: 'Artifact generated via A2A protocol.' }],
            },
        ];
        await saveA2ATask(a2aRead1.task, a2aRead1.ownerKeyHash);
    }

    clearL1Cache();

    // Verify completed task with artifacts
    const a2aRead2 = await getA2ATask(a2aTaskId);
    assert(a2aRead2?.task.status.state === 'completed', 'A2A task updated to completed in Firestore');
    assert(a2aRead2?.task.artifacts?.[0]?.parts?.[0]?.text === 'Artifact generated via A2A protocol.', 'A2A artifacts persisted intact');

    // Cross-user check
    let a2aCrossBlocked = false;
    try {
        await getA2ATask(a2aTaskId, a2aCrossHash);
    } catch (err: any) {
        if (err instanceof TaskUnauthorizedError || err.name === 'TaskUnauthorizedError') {
            a2aCrossBlocked = true;
        }
    }
    assert(a2aCrossBlocked, 'Cross-user A2A task lookup rejected with TaskUnauthorizedError');

    // Stale working task timeout test
    const staleA2ATaskId = `task_stale_${testRunId}`;
    const sixteenMinAgo = Date.now() - (16 * 60 * 1000); // 16 min > 15 min TTL
    const staleTask: A2ATask = {
        id: staleA2ATaskId,
        contextId: `ctx_stale_${testRunId}`,
        status: { state: 'working' },
    };
    await saveA2ATask(staleTask, a2aCallerHash);

    // Manually backdate createdAt to test timeout
    const db = (await import('../src/sessionStore.js')).getDb();
    if (db) {
        await db.collection('mcp_a2a_tasks').doc(staleA2ATaskId).update({
            createdAt: sixteenMinAgo,
        });
    }
    clearL1Cache();

    const timedOutTask = await getA2ATask(staleA2ATaskId);
    assert(timedOutTask?.task.status.state === 'failed', 'A2A task exceeding 15min auto-failed on read');

    // ─────────────────────────────────────────────────────────────
    // Cleanup Test Records
    // ─────────────────────────────────────────────────────────────
    console.log('\nCleaning up test artifacts from Firestore...');
    await deleteResearchJob(jobId);
    await deleteResearchJob(staleJobId);
    await deleteA2ATask(a2aTaskId);
    await deleteA2ATask(staleA2ATaskId);
    console.log('  ✅ Test documents deleted from Firestore');

    console.log('\n========================================================');
    console.log('🎉 ALL DURABLE JOBS & A2A TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');
}

runTestSuite().catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
