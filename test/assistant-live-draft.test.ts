import { expect, test } from 'bun:test';
import { useAppStore } from '../src/ui/store/useAppStore';
import {
  getAssistantDraft,
  setAssistantDraft,
  clearAssistantDraft,
  subscribeAssistantDraft,
} from '../src/ui/store/assistantDraftStore';
const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
const emit = (sessionId: string, content: string, uuid = 'message-live', extra = {}) =>
  useAppStore
    .getState()
    .handleServerEvent({
      type: 'stream.message',
      payload: { sessionId, message: { type: 'assistant', uuid, content, ...extra } },
    });

test('assistant draft is visible before result without per-token global store churn', async () => {
  const id = 'live-progress-before-result';
  useAppStore.setState({ fetchSessionHistory: () => undefined });
  useAppStore
    .getState()
    .handleServerEvent({ type: 'session.status', payload: { sessionId: id, status: 'running' } });
  const seen: Array<string | null> = [];
  const stop = subscribeAssistantDraft(id, () => seen.push(getAssistantDraft(id)?.content ?? null));
  emit(id, 'Hello');
  let globalUpdates = 0;
  const stopGlobal = useAppStore.subscribe(() => globalUpdates++);
  for (const chunk of [' ', 'progressive', ' ', 'world']) emit(id, chunk);
  await pause();
  expect(seen).toEqual(['Hello progressive world']);
  expect(globalUpdates).toBe(0);
  expect(
    useAppStore.getState().sessions[id].messages.some((message) => message.type === 'assistant'),
  ).toBe(false);
  useAppStore
    .getState()
    .handleServerEvent({
      type: 'stream.message',
      payload: {
        sessionId: id,
        message: { type: 'result', success: true, durationMs: 1, conversationId: id },
      },
    });
  expect(getAssistantDraft(id)).toBeNull();
  const messages = useAppStore
    .getState()
    .sessions[id].messages.filter((message) => message.type === 'assistant');
  expect(messages.length).toBe(1);
  expect((messages[0] as { content: string }).content).toBe('Hello progressive world');
  expect(seen.at(-1)).toBeNull();
  stop();
  stopGlobal();
});
test('draft subscriptions isolate chats and a mid-turn viewer reads the existing prefix', async () => {
  let a = 0,
    b = 0;
  const stopA = subscribeAssistantDraft('draft-a', () => a++),
    stopB = subscribeAssistantDraft('draft-b', () => b++);
  setAssistantDraft('draft-a', { type: 'assistant', uuid: 'a', content: 'Already streamed' });
  await pause();
  expect(a).toBe(1);
  expect(b).toBe(0);
  stopA();
  expect(getAssistantDraft('draft-a')?.content).toBe('Already streamed');
  const stopLate = subscribeAssistantDraft('draft-a', () => a++);
  expect(getAssistantDraft('draft-a')?.content).toBe('Already streamed');
  clearAssistantDraft('draft-a');
  expect(a).toBe(2);
  expect(getAssistantDraft('draft-b')).toBeNull();
  stopLate();
  stopB();
});
test('clearing a draft cancels pending publication and cannot resurrect completed text', async () => {
  const id = 'draft-clear-race',
    seen: Array<string | null> = [];
  const stop = subscribeAssistantDraft(id, () => seen.push(getAssistantDraft(id)?.content ?? null));
  setAssistantDraft(id, { type: 'assistant', uuid: 'clear', content: 'Transient' });
  clearAssistantDraft(id);
  await pause();
  expect(seen).toEqual([null]);
  expect(getAssistantDraft(id)).toBeNull();
  stop();
});
test('SDK chunks follow stable lineage across fallback UUIDs but never merge different API runs', () => {
  const id = 'draft-otid-lineage';
  emit(id, 'First', 'sdk-generated-1', { otid: 'lineage', runId: 'run-one' });
  emit(id, ' second', 'sdk-generated-2', { otid: 'lineage', runId: 'run-one' });
  expect(getAssistantDraft(id)?.content).toBe('First second');
  emit(id, 'New run', 'sdk-generated-3', { otid: 'lineage', runId: 'run-two' });
  expect(getAssistantDraft(id)?.content).toBe('New run');
  clearAssistantDraft(id);
});
