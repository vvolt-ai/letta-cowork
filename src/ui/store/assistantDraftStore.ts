import type { SDKAssistantMessage } from '@letta-ai/letta-agent-sdk';

// Transient per-conversation snapshots, deliberately separate from the global
// sessions tree. Only the affected chat subscribers repaint, at most every50ms.
const drafts = new Map<string, SDKAssistantMessage>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const FRAME_MS = 50;

export function getAssistantDraft(sessionId: string | null): SDKAssistantMessage | null {
  return sessionId ? (drafts.get(sessionId) ?? null) : null;
}
function notify(sessionId: string): void {
  for (const listener of [...(listeners.get(sessionId) ?? [])]) listener();
}
export function setAssistantDraft(sessionId: string, draft: SDKAssistantMessage): void {
  drafts.set(sessionId, draft);
  if (!listeners.get(sessionId)?.size || timers.has(sessionId)) return;
  timers.set(
    sessionId,
    setTimeout(() => {
      timers.delete(sessionId);
      notify(sessionId);
    }, FRAME_MS),
  );
}
export function clearAssistantDraft(sessionId: string): void {
  const timer = timers.get(sessionId);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(sessionId);
  if (drafts.delete(sessionId)) notify(sessionId);
}
export function subscribeAssistantDraft(
  sessionId: string | null,
  listener: () => void,
): () => void {
  if (!sessionId) return () => undefined;
  let subscribers = listeners.get(sessionId);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(sessionId, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size || listeners.get(sessionId) !== subscribers) return;
    listeners.delete(sessionId);
    const timer = timers.get(sessionId);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(sessionId);
    // Keep an in-flight snapshot for switching away/back; canonical stream
    // result, next input, deletion or terminal status clears it explicitly.
  };
}
