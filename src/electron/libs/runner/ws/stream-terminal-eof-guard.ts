const DEFAULT_TERMINAL_EOF_GRACE_MS = 2_000;

function getTerminalEofGraceMs(): number {
  const parsed = Number(process.env.LETTA_STREAM_TERMINAL_EOF_GRACE_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TERMINAL_EOF_GRACE_MS;
}

export interface TerminalEofGuard {
  arm(): void;
  clear(): void;
  fired(): boolean;
}

/**
 * Abort only the HTTP stream read when semantic termination arrived but the
 * response body never reports EOF. The caller already has the stop reason and
 * can safely continue tool dispatch or turn completion.
 */
export function createTerminalEofGuard(context: {
  getStopReason: () => string | null;
  abortHttpRead: () => void;
  warn: (message: string) => void;
}): TerminalEofGuard {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let didFire = false;

  return {
    arm() {
      if (timer) clearTimeout(timer);
      const graceMs = getTerminalEofGraceMs();
      timer = setTimeout(() => {
        didFire = true;
        context.warn(
          `Stream received stop_reason=${context.getStopReason()} but did not close within ${graceMs}ms; aborting the HTTP read.`
        );
        context.abortHttpRead();
      }, graceMs);
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    fired: () => didFire,
  };
}
