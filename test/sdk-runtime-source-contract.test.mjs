import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SDK turn deadline is not coupled to the short management probe deadline', async () => {
  const source = await readFile(
    new URL('../src/electron/libs/runner/sdk/session.ts', import.meta.url),
    'utf8',
  );
  const open = source.slice(
    source.indexOf('return new LettaAgentClient'),
    source.indexOf('function json('),
  );
  assert.ok(open.includes("backend: 'remote'"));
  assert.doesNotMatch(open, /requestTimeoutMs\s*:/);
});
test('automatic UI approval replay has no backend approve, cancel or false-idle mutation', async () => {
  const source = await readFile(
    new URL('../src/electron/ipc/handlers/session/permission-handlers.ts', import.meta.url),
    'utf8',
  );
  const replay = source.slice(
    source.indexOf('export async function recoverPendingApprovalsForSession'),
    source.indexOf('/** Existing explicit'),
  );
  assert.ok(replay.includes('snapshotPendingPermissionRequests'));
  assert.doesNotMatch(
    replay,
    /approveRunById|cancelAgentRunById|getAgentRunApprovalCandidates|session\.status/,
  );
});
