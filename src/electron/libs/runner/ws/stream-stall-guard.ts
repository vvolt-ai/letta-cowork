const ACTIVE_RUN_STATUSES = new Set(['created', 'running', 'pending', 'requires_approval']);

export interface StreamStallGuard {
  noteActivity(): void;
  clear(): void;
  fired(): boolean;
}

/**
 * Reconnect a semantically live run when its HTTP/SSE reader goes silent.
 * Aborting this reader never cancels the server run; the caller resumes from
 * its last sequence id. A server-confirmed active run receives another grace
 * window, while a terminal or uncheckable run is reconnected immediately.
 */
export function createStreamStallGuard(context: {
  getRunId: () => string | null;
  getStopReason: () => string | null;
  retrieveRunStatus: (runId: string, signal: AbortSignal) => Promise<string | null | undefined>;
  abortHttpRead: () => void;
  warn?: (message: string) => void;
  stallMs?: number;
  statusTimeoutMs?: number;
}): StreamStallGuard {
  const stallMs = context.stallMs ?? 60_000;
  const statusTimeoutMs = context.statusTimeoutMs ?? 5_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let statusController: AbortController | null = null;
  let activityGeneration = 0;
  let didFire = false;
  let cleared = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const arm = () => {
    if (cleared || didFire) return;
    activityGeneration += 1;
    clearTimer();
    timer = setTimeout(() => void reconcile(), stallMs);
    timer.unref?.();
  };

  const reconcile = async () => {
    timer = null;
    if (cleared || didFire || context.getStopReason() !== null) return;
    const runId = context.getRunId();
    if (!runId) {
      arm();
      return;
    }

    const generation = activityGeneration;
    statusController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let status: string | null | undefined;
    try {
      status = await Promise.race([
        context.retrieveRunStatus(runId, statusController.signal),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            statusController?.abort();
            reject(new Error('Run status lookup timed out'));
          }, statusTimeoutMs);
          timeout.unref?.();
        }),
      ]);
    } catch {
      status = undefined;
    } finally {
      if (timeout) clearTimeout(timeout);
      statusController = null;
    }

    if (cleared || didFire || context.getStopReason() !== null) return;
    if (activityGeneration !== generation) return;
    if (status != null && ACTIVE_RUN_STATUSES.has(status.toLowerCase())) {
      arm();
      return;
    }

    didFire = true;
    context.warn?.(
      status
        ? `Stream went silent while run ${runId} was ${status}; reconnecting to recover the missed tail`
        : `Stream went silent and run ${runId} status could not be checked; reconnecting to recover the missed tail`,
    );
    context.abortHttpRead();
  };

  arm();
  return {
    noteActivity: arm,
    clear: () => {
      cleared = true;
      clearTimer();
      statusController?.abort();
      statusController = null;
    },
    fired: () => didFire,
  };
}
