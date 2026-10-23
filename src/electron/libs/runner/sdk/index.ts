import { DesktopSdkSession, type DesktopSdkSessionOptions } from './session.js';
export { DesktopSdkSession, getOwnedDesktopSdkSessions } from './session.js';
export type { DesktopSdkSessionOptions } from './session.js';
export function createSdkSession(agentId: string | undefined, options: DesktopSdkSessionOptions) {
  return new DesktopSdkSession({ ...options, agentId: agentId ?? options.agentId });
}
export function resumeSdkSession(conversationId: string, options: DesktopSdkSessionOptions) {
  return new DesktopSdkSession({ ...options, conversationId });
}
export async function shutdownDesktopSdkSessions(): Promise<void> {
  const { getOwnedDesktopSdkSessions } = await import('./session.js');
  const results = await Promise.allSettled(
    getOwnedDesktopSdkSessions().map((session) => session.abort()),
  );
  const failed = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed.length)
    throw new AggregateError(
      failed.map((result) => result.reason),
      'Some SDK executions could not be verified stopped.',
    );
}
