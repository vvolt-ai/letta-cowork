import { beforeEach, expect, test } from 'bun:test';
import { useAppStore } from '../src/ui/store/useAppStore';
import {
  mergeNavigationChats,
  navigationAgents,
  agentGradient,
  NAVIGATION_PAGE_SIZE,
  readAgentRecency,
  writeAgentRecency,
} from '../src/ui/features/sidebar/navigation';

beforeEach(() => {
  useAppStore.getState().resetOrganizationState();
  useAppStore.setState({ ipcSendEvent: undefined, selectedModel: '', newConversationAgentId: '' });
});
test('agent navigation includes agents without local chats and retains unknown cached chats in All', () => {
  const local: any[] = [
    { id: 'mail', agentId: 'a', agentName: 'A', title: 'Email: Fixture', updatedAt: 3 },
    { id: 'unknown', title: 'Legacy', updatedAt: 1 },
  ];
  expect(navigationAgents([{ id: 'b', name: 'B' }], local).map((a) => a.id)).toEqual(['a', 'b']);
  expect(mergeNavigationChats([], local, 'a').map((c) => c.id)).toEqual(['mail']);
  expect(mergeNavigationChats([], local).map((c) => c.id)).toEqual(['mail', 'unknown']);
});
test('merge deduplicates remote/cached conversations, preserves connection and live state, and sorts recent first', () => {
  const rows = mergeNavigationChats(
    [
      { id: 'one', agentId: 'a', summary: 'Remote old', lastMessageAt: '2026-01-01T00:00:00Z' },
      { id: 'two', agentId: 'a', summary: 'Remote only', lastMessageAt: '2026-01-02T00:00:00Z' },
      { id: 'foreign', agentId: 'b' },
    ],
    [
      {
        id: 'one',
        title: 'My renamed chat',
        agentId: 'a',
        status: 'running',
        updatedAt: Date.parse('2026-01-03'),
        lettaConnectionId: 'same-original',
        ephemeralStatus: 'waiting_approval',
      },
    ],
    'a',
  );
  expect(rows.map((c) => c.id)).toEqual(['one', 'two']);
  expect(rows[0].title).toBe('My renamed chat');
  expect(rows[0].lettaConnectionId).toBe('same-original');
  expect(rows[0].ephemeralStatus).toBe('waiting_approval');
  expect(agentGradient('a')).toBe(agentGradient('a'));
});
test('new-chat drafts remain scoped to their chosen agent and are not persisted in preferences', () => {
  const s = () => useAppStore.getState();
  s().setNewConversationAgentId('a');
  s().setPrompt('Draft for A');
  s().setNewConversationAgentId('b');
  expect(s().prompt).toBe('');
  s().setPrompt('Draft for B');
  s().setNewConversationAgentId('a');
  expect(s().prompt).toBe('Draft for A');
  s().setNewConversationAgentId('b');
  expect(s().prompt).toBe('Draft for B');
});
test('conversation switching restores drafts and never stops or clears an active request/approval', () => {
  const running: any = {
    id: 'one',
    title: 'One',
    agentId: 'a',
    status: 'running',
    messages: [{ type: 'assistant', content: 'Partial' }],
    permissionRequests: [{ toolUseId: 'approval' }],
    ephemeral: { status: 'waiting_approval' },
  };
  useAppStore.setState({
    sessions: {
      one: running,
      two: { ...running, id: 'two', status: 'idle', permissionRequests: [] },
    },
    activeSessionId: 'one',
  });
  const s = () => useAppStore.getState();
  s().setPrompt('Question one');
  s().setActiveSessionId('two', false);
  expect(s().prompt).toBe('');
  expect(s().sessions.one).toBe(running);
  s().setPrompt('Question two');
  s().setActiveSessionId('one', false);
  expect(s().prompt).toBe('Question one');
  expect(s().sessions.one.permissionRequests).toHaveLength(1);
});
test('confirmed startup consumes the new-chat draft, failed startup retains it', () => {
  const s = () => useAppStore.getState();
  s().setNewConversationAgentId('a');
  s().setPrompt('Approved first question');
  s().setPendingStart(true);
  s().handleServerEvent({
    type: 'session.status',
    payload: { sessionId: 'new-running', status: 'running' },
  });
  expect(s().prompt).toBe('');
  s().setActiveSessionId(null, false);
  expect(s().prompt).toBe('');
  s().setPrompt('Preserve on failure');
  s().setPendingStart(true);
  s().handleServerEvent({
    type: 'session.status',
    payload: { sessionId: 'failed-start', status: 'error' },
  });
  expect(s().prompt).toBe('Preserve on failure');
});
test('deleting an inactive conversation removes only its saved draft', () => {
  const s = () => useAppStore.getState();
  s().handleServerEvent({ type: 'session.status', payload: { sessionId: 'one', status: 'idle' } });
  s().handleServerEvent({ type: 'session.status', payload: { sessionId: 'two', status: 'idle' } });
  s().setActiveSessionId('one', false);
  s().setPrompt('Deleted draft');
  s().setActiveSessionId('two', false);
  s().setPrompt('Keep this draft');
  s().handleServerEvent({ type: 'session.deleted', payload: { sessionId: 'one' } });
  expect(s().composerDrafts['chat:one']).toBeUndefined();
  expect(s().prompt).toBe('Keep this draft');
});

test('recent agents rank by actual usage metadata rather than alphabet and keep the current agent reachable', () => {
  const agents = Array.from({ length: 25 }, (_, i) => ({
    id: 'a' + i,
    name: 'Agent ' + String(24 - i).padStart(2, '0'),
    lastUsedAt: new Date(1700000000000 + i * 1000).toISOString(),
  }));
  const rows = navigationAgents(agents, [], { a0: 1800000000000 });
  expect(NAVIGATION_PAGE_SIZE).toBe(10);
  expect(rows.slice(0, 10).map((a) => a.id)).toEqual([
    'a0',
    'a24',
    'a23',
    'a22',
    'a21',
    'a20',
    'a19',
    'a18',
    'a17',
    'a16',
  ]);
  expect(rows.slice(0, 20)).toHaveLength(20);
  expect(navigationAgents(agents, [], {}, 'a1')[0].id).toBe('a1');
});
test('agent recency storage is owner-scoped, bounded and does not create unauthorized agent entries', () => {
  const map = new Map<string, string>(),
    storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
  writeAgentRecency(storage, 'user-one:org-one', { a: 1234 });
  expect(readAgentRecency(storage, 'user-one:org-one')).toEqual({ a: 1234 });
  expect(readAgentRecency(storage, 'user-two:org-one')).toEqual({});
  expect(navigationAgents([], [], readAgentRecency(storage, 'user-one:org-one'))).toEqual([]);
  writeAgentRecency(
    storage,
    'bulk',
    Object.fromEntries(Array.from({ length: 700 }, (_, i) => ['a' + i, i + 1])),
  );
  expect(Object.keys(readAgentRecency(storage, 'bulk'))).toHaveLength(500);
  expect(() =>
    writeAgentRecency(
      {
        setItem: () => {
          throw Error('storage denied');
        },
      },
      'owner',
      { a: 1 },
    ),
  ).not.toThrow();
  expect(readAgentRecency({ getItem: () => '{broken' }, 'owner')).toEqual({});
});

test('workspace reset clears all private composer drafts', () => {
  useAppStore.getState().setPrompt('Private draft');
  useAppStore.getState().resetOrganizationState();
  expect(useAppStore.getState().composerDrafts).toEqual({});
  expect(useAppStore.getState().prompt).toBe('');
});
