export type StreamTerminationDisposition = 'resume' | 'complete' | 'error';

const ERROR_STOP_REASON_PATTERN = /(?:^|_)(?:error|failed|failure)(?:$|_)/i;

/**
 * Decide whether a broken stream is safe to resume.
 *
 * A stop_reason is semantic termination. Once one arrives, reconnecting the
 * accepted run can only wait for a tail that will never be produced. Error
 * stop reasons are propagated so the logical-turn pump can apply its provider
 * retry policy; non-error stop reasons complete locally.
 */
export function classifyStreamTermination(
  stopReason: string | null | undefined,
): StreamTerminationDisposition {
  const normalized = stopReason?.trim().toLowerCase() ?? '';
  if (!normalized) return 'resume';
  return ERROR_STOP_REASON_PATTERN.test(normalized) ? 'error' : 'complete';
}

export class TerminalStopReasonError extends Error {
  readonly runId: string | null;
  readonly stopReason: string;

  constructor(runId: string | null, stopReason: string, cause?: unknown) {
    const causeMessage = cause instanceof Error && cause.message ? `: ${cause.message}` : '';
    super(`Run ${runId ?? 'unknown'} ended with stop_reason=${stopReason}${causeMessage}`);
    this.name = 'TerminalStopReasonError';
    this.runId = runId;
    this.stopReason = stopReason;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
