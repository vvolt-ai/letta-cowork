import { test, expect } from 'bun:test';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';
import { useAppStore } from '../src/ui/store/useAppStore';

test('SDK cancellation removes only its pending UI permission and ignores a late answer', async () => {
  const session = {
    id: 'sdk-policy-test',
    title: 'Fixture',
    status: 'running',
    pendingPermissions: new Map(),
    permissionGrants: { allowAll: false, allowedTools: new Set<string>() },
  };
  const requests: string[] = [],
    cancelled: string[] = [];
  const handler = createCanUseToolHandler(
    session,
    (id: string) => requests.push(id),
    'strict',
    (id: string) => cancelled.push(id),
  );
  const first = new AbortController(),
    second = new AbortController();
  const decision = handler('Write', { file_path: 'first' }, first.signal);
  const other = handler('Write', { file_path: 'second' }, second.signal);
  const stale = session.pendingPermissions.get(requests[0]);
  first.abort();
  expect((await decision).behavior).toBe('deny');
  expect(session.pendingPermissions.has(requests[0])).toBe(false);
  expect(session.pendingPermissions.has(requests[1])).toBe(true);
  stale.resolve({ behavior: 'allow' });
  expect((await decision).behavior).toBe('deny');
  second.abort();
  await other;
  expect(session.pendingPermissions.size).toBe(0);
  expect(cancelled).toEqual(requests);
});
test('cancelled permission disappears without falsely completing a running SDK turn', () => {
  const sessionId = 'sdk-cancel-ui-fixture',
    store = useAppStore.getState();
  for (const toolUseId of ['one', 'two'])
    store.handleServerEvent({
      type: 'permission.request',
      payload: { sessionId, toolUseId, toolName: 'Write', input: {} },
    });
  store.handleServerEvent({
    type: 'permission.cancelled',
    payload: { sessionId, toolUseId: 'one' },
  });
  expect(
    useAppStore
      .getState()
      .sessions[sessionId].permissionRequests.map((request) => request.toolUseId),
  ).toEqual(['two']);
  expect(useAppStore.getState().sessions[sessionId].ephemeral.status).toBe('waiting_approval');
  store.handleServerEvent({
    type: 'permission.cancelled',
    payload: { sessionId, toolUseId: 'two' },
  });
  expect(useAppStore.getState().sessions[sessionId].permissionRequests).toEqual([]);
  expect(useAppStore.getState().sessions[sessionId].ephemeral.status).toBe('thinking');
  store.handleServerEvent({
    type: 'permission.cancelled',
    payload: { sessionId: 'missing-sdk-session', toolUseId: 'stale' },
  });
  expect(useAppStore.getState().sessions['missing-sdk-session']).toBeUndefined();
});
