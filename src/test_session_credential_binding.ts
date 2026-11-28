// Security bake 2026-11-27: session IDs are not credentials; raw keys never persisted.
import assert from 'assert';
import { storeSession, getStoredSession, sessionKeyMatches, sessionHasOwner, hashSessionKey, setDbForTesting } from './sessionStore.js';

setDbForTesting(null as any); // L1-only
(async () => {
    await storeSession('sid-1', { apiKey: 'sk_live_owner', userId: 'u1' });
    const s = await getStoredSession('sid-1');
    assert.ok(s, 'session stored');
    assert.strictEqual(s!.apiKey, '', 'raw key not persisted');
    assert.strictEqual(s!.apiKeyHash, hashSessionKey('sk_live_owner'));
    assert.ok(sessionKeyMatches(s!, 'sk_live_owner'), 'owner matches');
    assert.ok(!sessionKeyMatches(s!, ''), 'no credential rejected');
    assert.ok(!sessionKeyMatches(s!, 'sk_live_attacker'), 'other key rejected');
    const legacy = { sessionId: 'x', apiKey: 'sk_live_old', userId: 'u', createdAt: 0, updatedAt: 0 };
    assert.ok(sessionHasOwner(legacy) && sessionKeyMatches(legacy, 'sk_live_old'), 'legacy raw doc still verifies');
    assert.ok(!sessionKeyMatches(legacy, ''), 'legacy doc rejects empty');
    console.log('PASS test_session_credential_binding (7 assertions)');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
