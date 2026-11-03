import { randomUUID } from 'node:crypto';

export interface MetadataHttpEvent {
  clientId: string;
  request: number;
  source: 'local' | 'vera';
  operation: 'conversation_metadata';
  conversationId?: string;
  idKind: 'uuid' | 'default' | 'other';
  stage: 'start' | 'headers' | 'abort' | 'error';
  elapsedMs: number;
  status?: number;
  aborted: boolean;
  errorKind?: 'abort' | 'timeout' | 'network' | 'other';
}

/** Diagnostics only. Do not log URLs, query strings, headers, bodies, keys or
 * arbitrary error text. Each underlying fetch is one SDK attempt, not a retry
 * initiated here. A headers event is NOT proof the body parsed or the turn ended. */
export function observeMetadataFetch(
  original: typeof fetch,
  source: MetadataHttpEvent['source'],
  sink: (event: MetadataHttpEvent) => void = event => console.log('[runtime-http]', JSON.stringify(event)),
  clock: () => number = () => performance.now(),
): typeof fetch {
  const clientId = randomUUID();
  let sequence = 0;
  return async (input, init) => {
    let id: string | undefined;
    try {
      const requestInput = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
      if ((init?.method ?? requestInput?.method ?? 'GET').toUpperCase() !== 'GET') return original(input, init);
      const url = new URL(requestInput ? requestInput.url : String(input));
      const match = url.pathname.match(/\/v1\/conversations\/([^/]+)\/?$/);
      if (!match) return original(input, init);
      id = decodeURIComponent(match[1]);
    } catch {
      return original(input, init);
    }
    const signal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const validId = /^conv-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const fields = {clientId, request: ++sequence, source, operation: 'conversation_metadata' as const,
      ...(validId ? {conversationId: id} : {}), idKind: (validId ? 'uuid' : id === 'default' ? 'default' : 'other') as MetadataHttpEvent['idKind']};
    const started = clock();
    const emit = (stage: MetadataHttpEvent['stage'], extra: Partial<MetadataHttpEvent> = {}) => {
      try { sink({...fields, stage, elapsedMs: Math.max(0, Math.round(clock() - started)), aborted: Boolean(signal?.aborted), ...extra}); } catch { /* logging cannot alter a request */ }
    };
    const aborted = () => emit('abort');
    emit('start');
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, {once: true});
    try {
      const response = await original(input, init);
      emit('headers', {status: response.status});
      return response;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      emit('error', {errorKind: signal?.aborted || name === 'AbortError' ? 'abort' : name === 'TimeoutError' ? 'timeout' : name === 'TypeError' ? 'network' : 'other'});
      throw error;
    } finally {
      signal?.removeEventListener('abort', aborted);
    }
  };
}
