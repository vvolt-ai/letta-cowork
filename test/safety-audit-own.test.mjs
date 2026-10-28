import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafetyAuditListOwnTool } from '../dist-electron/services/client-tools/runners/safetyAuditListOwn.js';
import { getClientToolsForWire } from '../dist-electron/services/client-tools/index.js';
import { RemoteToolDispatcher } from '../dist-electron/services/remote-access/remoteToolDispatcher.js';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';
test('standard permission mode recognizes audit listing as read-only', async () => {
  const session = {
    pendingPermissions: new Map(),
    permissionGrants: { allowAll: false, allowedTools: new Set() },
  };
  const handler = createCanUseToolHandler(
    session,
    () => {
      throw Error('Unexpected prompt');
    },
    'standard',
  );
  assert.equal(
    (await handler('SafetyAuditListOwn', {}, new AbortController().signal)).behavior,
    'allow',
  );
});
const actor = () => ({
  apiBaseUrl: 'https://vera.example.test',
  accessToken: 'fixture-only',
  currentUser: { id: 'user-1', organizationId: 'org-1' },
  isAuthenticated() {
    return !!this.accessToken;
  },
});
const context = () => ({ signal: new AbortController().signal });
const payload = () => ({
  items: [
    {
      id: 'audit-fixture',
      summary: 'Fixture tool failure',
      status: 'failed',
      toolName: 'Bash',
      redactedExcerpt: '[Tool output omitted]',
      content: 'PRIVATE_RAW_CONTENT',
      userId: 'hidden-owner',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
});

test('own database audit reader is exposed as a bounded local tool', () => {
  const tool = getClientToolsForWire().find((tool) => tool.name === 'SafetyAuditListOwn');
  assert.ok(tool);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(tool.parameters.properties.pageSize.maximum, 25);
  assert.equal(tool.parameters.properties.userId, undefined);
  assert.equal(tool.parameters.properties.organizationId, undefined);
});
test('reader calls only authenticated own-user endpoint and projects safe fields', async () => {
  const api = actor(),
    calls = [];
  const tool = createSafetyAuditListOwnTool(
    () => api,
    async (url, options) => {
      calls.push({ url: new URL(url), options });
      return new Response(JSON.stringify(payload()));
    },
  );
  const result = await tool.run(
    { status: 'failed', toolName: 'Bash', pageSize: 10, from: '2026-10-23T00:00:00Z' },
    context(),
  );
  assert.equal(result.isError, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/safety-audit-events/me');
  assert.equal(calls[0].url.searchParams.get('toolName'), 'Bash');
  assert.equal(calls[0].url.searchParams.has('userId'), false);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-only');
  assert.ok(!result.output.includes('PRIVATE_RAW_CONTENT'));
  assert.ok(!result.output.includes('hidden-owner'));
  assert.equal(JSON.parse(result.output).items[0].id, 'audit-fixture');
});
test('model identity overrides, invalid filters and missing login are denied without fetching', async () => {
  let calls = 0;
  const api = actor(),
    tool = createSafetyAuditListOwnTool(
      () => api,
      async () => {
        calls++;
        throw Error('must not fetch');
      },
    );
  for (const args of [
    { userId: 'another' },
    { organizationId: 'another' },
    { pageSize: 26 },
    { page: 0 },
    { source: 'unknown' },
    { from: 'not-a-date' },
    { from: '2026-10-24T00:00:00Z', to: '2026-10-23T00:00:00Z' },
  ])
    assert.equal((await tool.run(args, context())).isError, true);
  api.accessToken = null;
  assert.equal((await tool.run({}, context())).isError, true);
  assert.equal(calls, 0);
});
test('Vera denial never falls back to admin routes or exposes upstream error content', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const tool = createSafetyAuditListOwnTool(actor, async () => {
      calls++;
      return new Response('PRIVATE_PROVIDER_ERROR', { status });
    });
    const result = await tool.run({}, context());
    assert.equal(result.isError, true);
    assert.match(result.output, new RegExp('HTTP ' + status));
    assert.ok(!result.output.includes('PRIVATE_PROVIDER_ERROR'));
    assert.equal(calls, 1);
  }
});
test('login/organization/server changes during response discard old data', async () => {
  for (const change of [
    (api) => (api.currentUser = { id: 'user-2', organizationId: 'org-1' }),
    (api) => (api.currentUser.organizationId = 'org-2'),
    (api) => (api.apiBaseUrl = 'https://another.example.test'),
  ]) {
    const api = actor(),
      tool = createSafetyAuditListOwnTool(
        () => api,
        async () => {
          change(api);
          return new Response(JSON.stringify(payload()));
        },
      );
    const result = await tool.run({}, context());
    assert.equal(result.isError, true);
    assert.ok(!result.output.includes('audit-fixture'));
  }
});
test('replacing the API session object discards in-flight results', async () => {
  let api = actor();
  const tool = createSafetyAuditListOwnTool(
    () => api,
    async () => {
      api = actor();
      return new Response(JSON.stringify(payload()));
    },
  );
  const result = await tool.run({}, context());
  assert.equal(result.isError, true);
  assert.ok(!result.output.includes('audit-fixture'));
});
test('cancellation and response limits prevent returning audit data', async () => {
  const ctrl = new AbortController(),
    tool = createSafetyAuditListOwnTool(actor, async () => {
      ctrl.abort();
      return new Response(JSON.stringify(payload()));
    });
  assert.equal((await tool.run({}, { signal: ctrl.signal })).isError, true);
  const large = createSafetyAuditListOwnTool(
    actor,
    async () => new Response('x'.repeat(256 * 1024 + 1)),
  );
  assert.equal((await large.run({}, context())).isError, true);
});
test('shared remote execution cannot borrow the remote owner audit session', async () => {
  const dispatcher = new RemoteToolDispatcher({
    enabled: true,
    autoApprove: true,
    allowedDirectories: ['/'],
  });
  const result = await dispatcher.runTool({
    requestId: 'fixture',
    toolName: 'SafetyAuditListOwn',
    args: {},
  });
  assert.equal(result.status, 'error');
  assert.match(result.output, /verified caller session/);
});
