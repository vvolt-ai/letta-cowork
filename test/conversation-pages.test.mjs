import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile only the pure helper in memory: no generated output, Electron startup,
// account configuration, SDK construction, or network access is needed.
const helperSource = readFileSync(new URL('../src/electron/services/agents/conversation-pages.ts', import.meta.url), 'utf8');
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { loadConversationPages } = await import(`data:text/javascript;base64,${Buffer.from(helperJs).toString('base64')}`);

const row = (id, fields = {}) => ({ id, agent_id: 'agent-a', ...fields });
function mockPages(pages) {
  const calls = [];
  const client = { conversations: { list: async (query, options) => {
    calls.push({ query, options });
    assert.ok(pages.length > 0, 'unexpected extra page request');
    const next = pages.shift();
    if (next instanceof Error) throw next;
    return next;
  } } };
  return { client, calls };
}

test('loads more than 100 conversations with one scoped client and stable query/order', async () => {
  const first = Array.from({ length: 100 }, (_, i) => row(`conv-${i}`));
  const second = [row('conv-100'), row('conv-101')];
  const { client, calls } = mockPages([first, second, []]);
  assert.deepEqual(await loadConversationPages(client, 'agent-a'), [...first, ...second]);
  assert.deepEqual(calls.map(({ query }) => query), [undefined, 'conv-99', 'conv-101'].map(after => ({
    agent_id: 'agent-a', archive_status: 'unarchived', limit: 100,
    order: 'desc', order_by: 'last_message_at', ...(after ? { after } : {}),
  })));
  for (const { options } of calls) {
    assert.equal(options.maxRetries, 0);
    assert.ok(options.timeout > 0 && options.timeout <= 30_000);
  }
});

test('retains legacy items-envelope compatibility while keeping cursor scoping', async () => {
  const {client}=mockPages([{items:[row('one')]},{items:[]}]);
  assert.deepEqual(await loadConversationPages(client,'agent-a'),[row('one')]);
});

test('empty first page returns an empty list', async () => {
  const { client, calls } = mockPages([[]]);
  assert.deepEqual(await loadConversationPages(client, 'agent-a'), []);
  assert.equal(calls.length, 1);
});

test('continues through short server-capped pages and removes overlapping IDs in first-seen order', async () => {
  const a = row('a', { summary: 'first' });
  const b = row('b');
  const c = row('c');
  const { client } = mockPages([[a, a, b], [row('b', { summary: 'later' }), c], []]);
  assert.deepEqual(await loadConversationPages(client, 'agent-a'), [a, b, c]);
});

test('rejects repeated cursors even if the page includes a new ID', async () => {
  const { client, calls } = mockPages([[row('a'), row('b')], [row('c'), row('b')]]);
  await assert.rejects(loadConversationPages(client, 'agent-a'), /no progress/);
  assert.equal(calls.length, 2);
});

test('rejects duplicate-only pages with a different final cursor', async () => {
  const { client } = mockPages([[row('a'), row('b')], [row('a')]]);
  await assert.rejects(loadConversationPages(client, 'agent-a'), /no progress/);
});

for (const page of [null, {}, [null], [{}], [row('')], [row('  ')], Array.from({ length: 101 }, (_, i) => row(String(i)))]) {
  test(`rejects malformed/oversized page ${JSON.stringify(page).slice(0, 50)}`, async () => {
    const { client } = mockPages([page]);
    await assert.rejects(loadConversationPages(client, 'agent-a'), /Invalid conversation page|invalid conversation ID/);
  });
}

test('does not return accumulated rows after a later request fails', async () => {
  const failure = new Error('mock read failure');
  const { client } = mockPages([[row('a')], failure]);
  await assert.rejects(loadConversationPages(client, 'agent-a'), error => error === failure);
});

test('rejects an empty agent scope before admitting a request', async () => {
  const { client, calls } = mockPages([]);
  await assert.rejects(loadConversationPages(client, ' '), /non-empty agent ID/);
  assert.equal(calls.length, 0);
});

test('bounds endlessly advancing pagination without returning a partial list', async () => {
  let calls = 0;
  const client = { conversations: { list: async () => [row(`conv-${calls++}`)] } };
  await assert.rejects(loadConversationPages(client, 'agent-a'), /page limit/);
  assert.equal(calls, 100);
});

test('bounds row admission for a large listing without silent truncation', async () => {
  let calls = 0;
  const client = { conversations: { list: async () => {
    const page = calls++;
    return Array.from({ length: 100 }, (_, i) => row(`conv-${page * 100 + i}`));
  } } };
  await assert.rejects(loadConversationPages(client, 'agent-a'), /page limit|item limit/);
  assert.equal(calls, 100);
});

test('rejects a response arriving after the total time budget', async () => {
  // Isolated VM clock avoids changing the process clock or other tests.
  const compiled = ts.transpileModule(helperSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let now = 0;
  const context = { exports: {}, Date: { now: () => now } };
  vm.runInNewContext(compiled, context);
  let calls = 0;
  const client = { conversations: { list: async () => { calls++; now = 120_001; return []; } } };
  await assert.rejects(context.exports.loadConversationPages(client, 'agent-a'), /time budget/);
  assert.equal(calls, 1);
});

// Exercise the actual public wrapper with injected read-only dependencies, without
// importing the Electron/API service graph. Keep mapping and signature regressions visible.
const agentsSource = readFileSync(new URL('../src/electron/services/agents/index.ts', import.meta.url), 'utf8');
const wrapperSource = agentsSource.slice(agentsSource.indexOf('export async function listLettaConversations('), agentsSource.indexOf('\nfunction normalizeApprovalCandidatesFromRun'));
function wrapperWith(createLettaClient) {
  const js = ts.transpileModule(wrapperSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, createLettaClient, loadConversationPages, console: { error() {} } };
  vm.runInNewContext(js, context);
  return context.exports.listLettaConversations;
}

test('public wrapper creates exactly one connection-scoped client and preserves mapped array fields', async () => {
  const { client } = mockPages([[row('a', { summary: 'Summary', created_at: 'created', updated_at: 'updated', last_message_at: 'last', model: 'provider/model', archived: false })], [row('b')], []]);
  const scopes = [];
  const list = wrapperWith(connectionId => { scopes.push(connectionId); return client; });
  const result = await list('agent-a', 'connection-a');
  assert.deepEqual(scopes, ['connection-a']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { id: 'a', agentId: 'agent-a', summary: 'Summary', createdAt: 'created', updatedAt: 'updated', lastMessageAt: 'last', model: 'provider/model', archived: false },
    { id: 'b', agentId: 'agent-a', summary: null, createdAt: null, updatedAt: null, lastMessageAt: null, model: null, archived: false },
  ]);
});

test('public wrapper rejects failed pagination rather than returning partial navigation', async () => {
  const { client } = mockPages([[row('a')], new Error('mock failure')]);
  await assert.rejects(wrapperWith(() => client)('agent-a'), /Failed to fetch conversations from Letta/);
});
