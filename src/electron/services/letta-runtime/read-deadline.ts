/** Stop waiting for a read on cancellation, observing even late rejection.
 * This does not cancel shared authentication work belonging to other readers. */
export function waitForRead<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException('Read aborted', 'AbortError')); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

/** Deadline only for canonical read-only setup. Never wrap model/tool execution
 * or uncertain writes in this helper, and never replay on deadline expiry. */
export async function readWithDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw Error('INVALID_CONVERSATION_READ_DEADLINE');
  parent.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(Error(timeoutCode)), timeoutMs);
  try {
    const work = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return read(controller.signal); });
    return await waitForRead(work, controller.signal);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
  }
}
