import {randomUUID} from 'node:crypto';
import {cancelQueuedConversationTurns, enqueueConversationTurn, conversationQueueVersion} from './conversation-turn-queue.js';

export type StopPhase = 'stopping' | 'verified' | 'unverified';
interface StopTarget { abort(): Promise<boolean>; }
interface StopBindings {
  capture(): StopTarget | undefined;
  publish(phase: StopPhase, requestId: string, errorCode?: string): void;
}
const active = new Map<string, Promise<void>>();
const recovery = new Map<string, StopTarget>();
const blocked = new Set<string>();
const admissions = new Map<string,number>();
const recoveryAdmission = new Map<string,number>();

/** New intent is admitted independently of old stop diagnostics. Dispatch still
 * uses the FIFO and SDK's exact current-owner checks; this releases no owner. */
export function recordConversationMessageAdmission(conversationId:string):{afterStop:boolean;requestId:string} {
  const afterStop=active.has(conversationId)||blocked.has(conversationId)||recovery.has(conversationId);
  admissions.set(conversationId,(admissions.get(conversationId)??0)+1);
  return {afterStop,requestId:randomUUID()};
}

/** Diagnostic only, never a user-message admission gate. Unknown ownership
 * remains enforced by the SDK controller rather than a historical UI fence. */
export function assertConversationStopVerified(conversationId: string): void {
  if ((blocked.has(conversationId) || recovery.has(conversationId)) && !active.has(conversationId)) throw Error('SDK_STOP_NOT_VERIFIED');
}

/** Stop runs outside the turn FIFO so it can interrupt its active owner. Its
 * barrier holds later work until proof + final UI state, never a generic Idle. */
export function stopConversationVerified(conversationId: string, bindings: StopBindings): Promise<void> {
  const previous = active.get(conversationId);
  if (previous) return previous;
  cancelQueuedConversationTurns(conversationId);
  const generation = conversationQueueVersion(conversationId);
  const admission=admissions.get(conversationId)??0;
  const requestId = randomUUID();
  const publish = (phase: StopPhase, errorCode?: string) => { try { bindings.publish(phase, requestId, errorCode); } catch { /* renderer delivery cannot authorize or prevent exact stop */ } };
  let release!: () => void;
  const settled = new Promise<void>(resolve => { release = resolve; });
  let verified = false;
  const barrier = enqueueConversationTurn(conversationId, async isCancelled => {
    await settled;
    if (isCancelled() || !verified) return;
    recovery.delete(conversationId);
    recoveryAdmission.delete(conversationId);
    blocked.delete(conversationId);
    publish('verified');
  });
  void barrier.catch(() => undefined);
  const operation = Promise.resolve().then(async () => {
    publish('stopping');
    try {
      let target = recovery.get(conversationId);
      if (!target || recoveryAdmission.get(conversationId)!==admission) {
        target = bindings.capture();
        if (!target) throw Error('SDK_STOP_SCOPE_UNAVAILABLE');
        recovery.set(conversationId, target);
        recoveryAdmission.set(conversationId,admission);
      }
      if (await target.abort() !== true) throw Error('SDK_STOP_NOT_VERIFIED');
      verified = true;
    } catch (error) {
      // Keep this exact failure/target for review or an explicit Stop retry.
      // Independent new requests are not cancelled or rejected by old history.
      // Their dispatch must still pass the SDK's live ownership checks.
      blocked.add(conversationId);
      const code = error instanceof Error && error.message === 'SDK_STOP_SCOPE_UNAVAILABLE' ? error.message : 'SDK_STOP_NOT_VERIFIED';
      if (conversationQueueVersion(conversationId) === generation) {
        publish('unverified',code);
      }
      throw Error(code);
    } finally {
      release();
    }
    await barrier;
  });
  active.set(conversationId, operation);
  void operation.finally(() => { if (active.get(conversationId) === operation) active.delete(conversationId); }).catch(() => undefined);
  return operation;
}

export interface CanonicalStopHandle { sessionId: string; abort(): Promise<void>; done: Promise<void>; }
export function findCanonicalStopHandle<T extends CanonicalStopHandle>(handles: ReadonlyMap<string,T>, conversationId: string): T | undefined {
  const exact = handles.get(conversationId);
  if (exact && exact.sessionId !== conversationId) throw Error('SDK_STOP_SCOPE_UNAVAILABLE');
  const matches = new Set([...handles.values()].filter(handle => handle.sessionId === conversationId));
  if (matches.size > 1) throw Error('SDK_STOP_SCOPE_UNAVAILABLE');
  return exact ?? [...matches][0];
}
