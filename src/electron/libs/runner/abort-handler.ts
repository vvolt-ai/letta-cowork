import { getOwnedDesktopSdkSessions } from './sdk/session.js';
import { getSession, removeSession } from './state.js';
import type { RunnerLettaSession } from './types.js';

/** Stop exact locally-owned SDK executions. No agent-wide API cancellation or
 * fallback to another account, conversation, active session or global signal. */
export async function abortAllSessions(): Promise<void> {
  const sessions = getOwnedDesktopSdkSessions();
  const results = await Promise.allSettled(sessions.map((session) => session.abort()));
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'SDK stop could not be verified for every execution.',
    );
}
export function findOwnedAbortTarget(conversationId: string): RunnerLettaSession | undefined {
  const session = getSession(conversationId);
  const owned = getOwnedDesktopSdkSessions(conversationId);
  // Capture one concrete controller, never a different account on retry.
  if (owned.length !== 1 || (session && session !== owned[0])) return undefined;
  return owned[0];
}
export async function abortCapturedSession(conversationId: string, target: RunnerLettaSession): Promise<boolean> {
  if (target.conversationId !== conversationId) return false;
  await target.abort();
  // Disposal removes the verified target from this registry. Neither an old
  // state-map entry nor a replacement controller can count as stop proof.
  if (getOwnedDesktopSdkSessions(conversationId).length) return false;
  if (getSession(conversationId) === target) removeSession(conversationId);
  return true;
}
export async function abortSessionById(conversationId: string): Promise<boolean> {
  const target = findOwnedAbortTarget(conversationId);
  if (!target) return false;
  try { return await abortCapturedSession(conversationId, target); }
  catch { return false; }
}
export function createAbortHandler(
  sessionKey: string,
  session: RunnerLettaSession | null,
  controller: AbortController,
  onRequested?:()=>void,
): () => Promise<void> {
  return async () => {
    if (!session) throw Error('SDK_STOP_SCOPE_UNAVAILABLE');
    onRequested?.();
    // UI receives an abort only after native/backend/tool settlement verifies.
    // A failed stop leaves its owned control path available for another attempt.
    await session.abort();
    controller.abort();
    if (getSession(sessionKey) === session) removeSession(sessionKey);
  };
}
