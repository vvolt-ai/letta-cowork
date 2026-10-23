import { createSdkSession, resumeSdkSession, type DesktopSdkSessionOptions } from './sdk/index.js';
import { captureDesktopSdkScope } from './sdk/session.js';
import {
  DEFAULT_CWD,
  storeSession,
  removeSession,
  getSession,
  getActiveLettaSession,
  setActiveLettaSession,
} from './state.js';
import type { RunnerLettaSession, RunnerSession, RunnerOptions } from './types.js';
import type { CanUseToolResponse } from '@letta-ai/letta-agent-sdk';

const agentsByAccount = new Map<string, string>();
export type SessionOptions = DesktopSdkSessionOptions;
export function isValidLettaId(id: string | undefined): boolean {
  return Boolean(
    id &&
    /^(?:agent-|conv-|conversation-)[a-zA-Z0-9-]+$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
      id,
    ),
  );
}
export function createSessionOptions(
  session: RunnerSession,
  model: string | undefined,
  permissionMode: RunnerOptions['permissionMode'],
  canUseTool: (name: string, input: unknown) => Promise<CanUseToolResponse>,
  lettaConnectionId?: string,
): SessionOptions {
  return {
    cwd: session.cwd ?? DEFAULT_CWD,
    model,
    permissionMode: permissionMode ?? 'unrestricted',
    canUseTool,
    lettaConnectionId,
  };
}
export function createOrResumeSession(
  options: RunnerOptions,
  canUseTool: (name: string, input: unknown) => Promise<CanUseToolResponse>,
): RunnerLettaSession {
  const scope = captureDesktopSdkScope(options.lettaConnectionId);
  const settings = {
    ...createSessionOptions(
      options.session,
      options.model,
      options.permissionMode,
      canUseTool,
      options.lettaConnectionId,
    ),
    scope,
  };
  if (options.resumeConversationId) {
    if (!isValidLettaId(options.resumeConversationId))
      throw Error('Invalid conversation identity; no agent/account fallback was attempted.');
    return resumeSdkSession(options.resumeConversationId, {
      ...settings,
      agentId: options.preferredAgentId,
    });
  }
  const agentId =
    options.preferredAgentId?.trim() ||
    agentsByAccount.get(scope.key) ||
    process.env.LETTA_AGENT_ID?.trim();
  return createSdkSession(agentId, settings);
}
export async function initializeSession(
  session: RunnerLettaSession,
  _resumeConversationId: string | undefined,
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void,
): Promise<{ sessionKey: string; currentSessionId: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      session.initialize(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('SDK_SESSION_INITIALIZATION_TIMEOUT')), 60000);
      }),
    ]);
    if (!result.conversationId || !result.agentId)
      throw Error('Native SDK did not return canonical conversation/agent identity.');
    const key = result.conversationId;
    storeSession(key, session);
    if (session.accountScopeKey) agentsByAccount.set(session.accountScopeKey, result.agentId);
    onSessionUpdate?.({ lettaConversationId: key });
    return { sessionKey: key, currentSessionId: key };
  } catch (error) {
    void session.abort().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function cleanupSession(sessionKey: string, session: RunnerLettaSession | null): void {
  // UI bookkeeping is not proof that native execution has stopped. The SDK
  // owner registry keeps unresolved executions fenced until verified disposal.
  if (sessionKey && getSession(sessionKey) === session) removeSession(sessionKey);
  if (session && getActiveLettaSession() === session) setActiveLettaSession(null);
  session?.close?.();
}
export { getActiveLettaSession } from './state.js';
