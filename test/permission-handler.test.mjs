import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';

function createSession() {
  return {
    id: 'test-session',
    title: 'test',
    status: 'running',
    pendingPermissions: new Map(),
    permissionGrants: { allowAll: false, allowedTools: new Set() },
  };
}

test('strict mode prompts even for read-only tools', async () => {
  const session = createSession();
  const requests = [];
  const handler = createCanUseToolHandler(
    session,
    (toolUseId, toolName) => requests.push({ toolUseId, toolName }),
    'strict',
  );

  const decision = handler('Read', { file_path: '/tmp/example' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].toolName, 'Read');
  assert.equal(session.pendingPermissions.size, 1);

  session.pendingPermissions.get(requests[0].toolUseId).resolve({ behavior: 'allow' });
  assert.deepEqual(await decision, { behavior: 'allow' });
});

test('strict mode honors an explicit session grant', async () => {
  const session = createSession();
  session.permissionGrants.allowedTools.add('Read');
  const handler = createCanUseToolHandler(
    session,
    () => assert.fail('granted tool should not prompt'),
    'strict',
  );

  assert.deepEqual(await handler('Read', {}), { behavior: 'allow' });
});

test('unrestricted mode still prompts for AskUserQuestion', async () => {
  const session = createSession();
  session.permissionGrants.allowAll = true;
  let requestId;
  const handler = createCanUseToolHandler(
    session,
    (toolUseId) => {
      requestId = toolUseId;
    },
    'unrestricted',
  );

  const decision = handler('AskUserQuestion', { questions: [] });
  assert.ok(requestId);
  session.pendingPermissions.get(requestId).resolve({
    behavior: 'allow',
    updatedInput: { questions: [] },
  });
  assert.equal((await decision).behavior, 'allow');
});
