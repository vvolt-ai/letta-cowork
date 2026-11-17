import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeSecretCache } from '../dist-electron/api/client/runtime-secret-cache.js';
import { VeraCoworkApiClient } from '../dist-electron/api/client/letta-client.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('successful environments and empty results are fetched once and caller mutations cannot poison RAM', async () => {
  for (const value of [{ FIXTURE: 'synthetic value' }, {}]) {
    const cache = new RuntimeSecretCache(), outcomes = []; let calls = 0;
    const load = async () => { calls++; return value; };
    const first = await cache.get('actor', 'agent', load, { onOutcome: x => outcomes.push(x) });
    first.FIXTURE = 'changed by caller';
    assert.deepEqual(await cache.get('actor', 'agent', load, { onOutcome: x => outcomes.push(x) }), value);
    assert.equal(calls, 1); assert.deepEqual(outcomes, ['miss', 'hit']); cache.clear();
  }
});
test('concurrent callers share a load and cancelling one wait does not cancel another', async () => {
  const cache = new RuntimeSecretCache(), pending = deferred(), controller = new AbortController(); let calls = 0, sharedSignal;
  const load = async signal => { calls++; sharedSignal = signal; return pending.promise; };
  const first = cache.get('actor', 'agent', load, { signal: controller.signal });
  const rejected = assert.rejects(first, /cancel fixture/);
  const second = cache.get('actor', 'agent', load);
  controller.abort(Error('cancel fixture')); await rejected; await tick();
  assert.equal(sharedSignal.aborted, false); pending.resolve({ FIXTURE: 'synthetic value' });
  assert.deepEqual(await second, { FIXTURE: 'synthetic value' }); assert.equal(calls, 1); cache.clear();
});
test('failures and malformed results are not cached', async () => {
  const cache = new RuntimeSecretCache(); let calls = 0;
  await assert.rejects(cache.get('actor', 'agent', async () => { calls++; throw Error('synthetic read failure'); }));
  await assert.rejects(cache.get('actor', 'agent', async () => ({ INVALID: 42 })), /ENV_INVALID/);
  assert.deepEqual(await cache.get('actor', 'agent', async () => { calls++; return {}; }), {});
  assert.equal(calls, 2); cache.clear();
});
test('shared read deadline rejects hung loads and late results cannot refill the cache', async () => {
  const cache = new RuntimeSecretCache(15), pending = deferred(), keepAlive = setTimeout(() => {}, 2000);
  try {
    await assert.rejects(cache.get('actor', 'agent', async () => pending.promise), /timeout/i);
    pending.resolve({ OLD: 'late synthetic fixture' }); await tick();
    assert.deepEqual(await cache.get('actor', 'agent', async () => ({ NEW: 'synthetic fixture' })), { NEW: 'synthetic fixture' });
  } finally { clearTimeout(keepAlive); cache.clear(); }
});
test('invalidation rejects pending readers and an old finalizer cannot delete a replacement entry', async () => {
  const cache = new RuntimeSecretCache(), pending = deferred();
  const first = cache.get('actor', 'agent', async () => pending.promise);
  const rejected = assert.rejects(first, /INVALIDATED/); await tick(); cache.clear();
  const next = await cache.get('actor', 'agent', async () => ({ NEW: 'synthetic fixture' }));
  await rejected; pending.resolve({ OLD: 'synthetic fixture' }); await tick();
  assert.deepEqual(await cache.get('actor', 'agent', async () => { throw Error('unexpected reload'); }), next); cache.clear();
});
test('actor changes and agent keys remain isolated; bounded LRU evicts without stale fallback', async () => {
  const cache = new RuntimeSecretCache(10000, 2); let calls = 0;
  const load = async () => ({ VERSION: String(++calls) });
  await cache.get('actor-a', 'agent-a', load); await cache.get('actor-a', 'agent-b', load);
  assert.deepEqual(await cache.get('actor-a', 'agent-a', load), { VERSION: '1' });
  await cache.get('actor-a', 'agent-c', load); await cache.get('actor-a', 'agent-b', load);
  assert.equal(calls, 4); await cache.get('actor-b', 'agent-a', load); assert.equal(calls, 5); cache.clear();
});
function clientFixture() {
  // No constructor: never touch credential files, shell env or a real endpoint.
  const client = Object.create(VeraCoworkApiClient.prototype), calls = [];
  Object.assign(client, { baseUrl: 'https://fixture.invalid', authGeneration: 0, tokens: {
    accessToken: 'synthetic-access', user: { id: 'fixture-user', email: 'fixture@example.invalid', organizationId: 'fixture-org', role: 'member' },
  } });
  client.lastAuthIdentity = client.authIdentity();
  client.saveTokens = () => client.fenceAuthIdentity();
  client.clearTokens = () => client.resetAuthState();
  client.request = async (path, options) => { calls.push({ path, options }); return path.endsWith('/runtime-env') ? { env: { FIXTURE: 'synthetic value' } } : {}; };
  return { client, calls, count: () => calls.filter(x => x.path.endsWith('/runtime-env')).length };
}
test('API reuses values across logical turns while agent/connection changes fetch separately', async () => {
  const f = clientFixture();
  const first = await f.client.getAgentSecretRuntimeEnv('agent-a');
  await f.client.getAgentSecretRuntimeEnv('agent-a'); assert.equal(f.count(), 1);
  first.FIXTURE = 'caller mutation'; assert.equal((await f.client.getAgentSecretRuntimeEnv('agent-a')).FIXTURE, 'synthetic value');
  await f.client.getAgentSecretRuntimeEnv('agent-b');
  await f.client.getAgentSecretRuntimeEnv('agent-a', { connectionId: 'another-account' }); assert.equal(f.count(), 3);
  assert.deepEqual(f.calls[0].options.body, { agentId: 'agent-a' }); f.client.runtimeSecretEnvCache.clear();
});
test('same-principal token rotation reuses cache; logout, login, retirement and role/org changes do not', async () => {
  const f = clientFixture();
  await f.client.getAgentSecretRuntimeEnv('agent');
  f.client.tokens.accessToken = 'synthetic-refreshed-access';
  await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 1);
  f.client.tokens.user.organizationId = 'another-org'; f.client.saveTokens();
  await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 2);
  f.client.tokens.user.role = 'owner'; await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 3);
  const login = { accessToken: 'synthetic-login', refreshToken: 'synthetic-refresh', expiresIn: 3600, user: { ...f.client.currentUser } };
  f.client.applyAuthResponse(login);
  await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 4);
  f.client.clearTokens(); assert.equal(f.client.runtimeSecretEnvCache.entries.size, 0);
  f.client.applyAuthResponse(login);
  await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 5);
  f.client.retireAuthenticationContext(); assert.equal(f.client.runtimeSecretEnvCache.entries.size, 0);
});
test('client replacement never reuses another instance cache', async () => {
  const first = clientFixture(), second = clientFixture();
  await first.client.getAgentSecretRuntimeEnv('agent'); await second.client.getAgentSecretRuntimeEnv('agent');
  assert.equal(first.count(), 1); assert.equal(second.count(), 1);
  first.client.runtimeSecretEnvCache.clear(); second.client.runtimeSecretEnvCache.clear();
});
test('secret create/update/delete/list refresh invalidate cache even when a mutation has uncertain failure', async () => {
  for (const operation of [c => c.upsertAgentSecret({ name: 'FIXTURE', value: 'synthetic value' }), c => c.deleteAgentSecret('fixture-id'), c => c.listAgentSecrets()]) {
    const f = clientFixture(); await f.client.getAgentSecretRuntimeEnv('agent'); await operation(f.client);
    await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 2);
    const original = f.client.request; f.client.request = async (path, options) => { if (!path.endsWith('/runtime-env')) throw Error('synthetic uncertain mutation'); return original(path, options); };
    await assert.rejects(operation(f.client)); await f.client.getAgentSecretRuntimeEnv('agent'); assert.equal(f.count(), 3);
    f.client.runtimeSecretEnvCache.clear();
  }
});
test('late API response after actor changes is rejected and never cached', async () => {
  const f = clientFixture(), pending = deferred(); f.client.request = async () => pending.promise;
  const first = f.client.getAgentSecretRuntimeEnv('agent'), rejected = assert.rejects(first, /AUTH_STATE_CHANGED|INVALIDATED/);
  await tick(); f.client.tokens.user.id = 'new-fixture-user'; f.client.saveTokens();
  pending.resolve({ env: { OLD: 'synthetic value' } }); await rejected;
  assert.equal(f.client.runtimeSecretEnvCache.entries.size, 0);
});
test('a cache hit cannot return credentials across an actor switch in the same microtask window', async () => {
  const f = clientFixture();
  await f.client.getAgentSecretRuntimeEnv('agent');
  const hit = f.client.getAgentSecretRuntimeEnv('agent');
  f.client.tokens.user.id = 'changed-fixture-user'; f.client.saveTokens();
  await assert.rejects(hit, /API_AUTH_STATE_CHANGED/);
  assert.equal(f.client.runtimeSecretEnvCache.entries.size, 0);
});
test('already-cancelled callers do not start a load or disturb a valid cache', async () => {
  const cache = new RuntimeSecretCache(), controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(cache.get('actor', 'agent', async () => { calls++; return {}; }, { signal: controller.signal }));
  assert.equal(calls, 0); cache.clear();
});
