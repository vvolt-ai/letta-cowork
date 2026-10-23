/** UI approval delivery. Native SDK owns execution/recovery decisions. */
import { emit } from './session-creation.js';
import { getSession, resolveSessionPermission } from '../../../libs/runtime-state.js';
import { cancelAgentRunById } from '../../../services/agents/index.js';
import { snapshotPendingPermissionRequests } from './pending-permission-replay.js';
import type { CanUseToolResponse } from '@letta-ai/letta-agent-sdk';

export function handlePermissionResult(
  sessionId: string,
  toolUseId: string,
  result: CanUseToolResponse,
  scope: 'once' | 'tool' | 'session' = 'once',
): void {
  const session = getSession(sessionId);
  if (session) resolveSessionPermission(session, toolUseId, result, scope);
}

/** A reconnect may replay live UI cards, never approve/cancel backend runs.
 * Terminal renderer state is not proof an SDK execution/approval is orphaned. */
export async function recoverPendingApprovalsForSession(
  sessionId: string,
  _agentId?: string,
): Promise<
  Array<{
    toolUseId: string;
    toolName: string;
    input: unknown;
    runId: string;
    conversationId: string;
    requestedAt?: string;
  }>
> {
  const pending = snapshotPendingPermissionRequests(
    getSession(sessionId)?.pendingPermissions.values() ?? [],
  );
  for (const request of pending) {
    emit({ type: 'permission.request', payload: { sessionId, ...request, source: 'live' } });
  }
  return [];
}

/** Existing explicit Runs Debugger action; never called by automatic replay. */
export async function cancelRecoveredRun(runId: string): Promise<void> {
  await cancelAgentRunById(runId);
}
