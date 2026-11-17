import { randomUUID } from 'node:crypto';
import { waitForRead } from '../../services/letta-runtime/read-deadline.js';

export type RuntimeSecretCacheOutcome = 'hit' | 'miss' | 'joined';
export type RuntimeSecretClearReason = 'manual_refresh' | 'actor_context_changed' | 'auth_context_changed' | 'settings_refresh' | 'secret_write' | 'secret_delete' | 'missing_verified_context';
const diagnosticEvents = ['cache_created', 'cache_hit', 'cache_miss', 'cache_joined', 'fetch_started', 'fetch_succeeded', 'fetch_failed', 'cache_cleared', 'cache_evicted', 'inherited_env', 'skipped_no_vera_session', 'cache_bypassed', 'runtime_env_applied', 'runtime_env_unavailable'] as const;
type DiagnosticEvent = typeof diagnosticEvents[number];
const diagnosticReasons = new Set(['manual_refresh', 'actor_context_changed', 'auth_context_changed', 'settings_refresh', 'secret_write', 'secret_delete', 'missing_verified_context', 'timeout', 'invalidated', 'read_failed']);
/** Deliberately no error bodies, environment names/values, user/agent IDs or URLs. */
export function logRuntimeSecretEvent(event: DiagnosticEvent, detail: {
  cacheId?: string; entryId?: string; traceId?: string;
  reason?: RuntimeSecretClearReason | 'timeout' | 'invalidated' | 'read_failed'; durationMs?: number;
} = {}): void {
  if (!diagnosticEvents.includes(event)) return;
  const uuid = (value?: string) => value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
  try {
    console.log('[runtime-secrets]', JSON.stringify({ event,
      cacheId: uuid(detail.cacheId), entryId: uuid(detail.entryId), traceId: uuid(detail.traceId),
      reason: detail.reason && diagnosticReasons.has(detail.reason) ? detail.reason : undefined,
      durationMs: typeof detail.durationMs === 'number' && Number.isFinite(detail.durationMs) ? Math.max(0, Math.round(detail.durationMs)) : undefined,
    }));
  } catch { /* logging never changes runtime-secret behavior */ }
}
type Env = Readonly<Record<string, string>>;
interface Entry {
  id: string;
  controller: AbortController;
  pending?: Promise<Env>;
  value?: Env;
}

/** Main-process RAM only. No persistence, process.env mutation or value logging.
 * Successful empty environments are cached too; failed reads are never cached.
 * Each caller may cancel its wait without cancelling another caller's load.
 */
export class RuntimeSecretCache {
  private readonly cacheId = randomUUID();
  private context?: string;
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly timeoutMs = 10000, private readonly capacity = 128) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1024) {
      throw Error('INVALID_RUNTIME_SECRET_CACHE_LIMIT');
    }
    logRuntimeSecretEvent('cache_created', { cacheId: this.cacheId });
  }

  clear(reason: RuntimeSecretClearReason = 'manual_refresh'): void {
    const previous = [...this.entries.values()];
    this.entries.clear();
    this.context = undefined;
    if (previous.length) logRuntimeSecretEvent('cache_cleared', { cacheId: this.cacheId, reason });
    for (const entry of previous) entry.controller.abort(Error('RUNTIME_SECRET_CACHE_INVALIDATED'));
  }

  async get(
    context: string,
    key: string,
    load: (signal: AbortSignal) => Promise<Record<string, string>>,
    options: { signal?: AbortSignal; traceId?: string; onOutcome?: (outcome: RuntimeSecretCacheOutcome) => void; } = {},
  ): Promise<Record<string, string>> {
    options.signal?.throwIfAborted();
    if (this.context !== context) {
      this.clear('actor_context_changed');
      this.context = context;
    }
    let entry = this.entries.get(key);
    const outcome: RuntimeSecretCacheOutcome = entry?.value !== undefined ? 'hit' : entry ? 'joined' : 'miss';
    try { options.onOutcome?.(outcome); } catch { /* telemetry cannot affect credentials */ }
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    } else {
      if (this.entries.size >= this.capacity) {
        const oldest = this.entries.keys().next().value!;
        const evicted = this.entries.get(oldest)!;
        this.entries.delete(oldest);
        logRuntimeSecretEvent('cache_evicted', { cacheId: this.cacheId, entryId: evicted.id });
        evicted.controller.abort(Error('RUNTIME_SECRET_CACHE_EVICTED'));
      }
      entry = { id: randomUUID(), controller: new AbortController() };
      this.entries.set(key, entry);
      const current = entry;
      const started = performance.now();
      const diagnostic = { cacheId: this.cacheId, entryId: current.id, traceId: options.traceId };
      const signal = AbortSignal.any([current.controller.signal, AbortSignal.timeout(this.timeoutMs)]);
      const work = Promise.resolve().then(() => {
        signal.throwIfAborted();
        logRuntimeSecretEvent('fetch_started', diagnostic);
        return load(signal);
      });
      current.pending = waitForRead(work, signal).then(env => {
        signal.throwIfAborted();
        if (this.context !== context || this.entries.get(key) !== current) {
          throw Error('RUNTIME_SECRET_CACHE_INVALIDATED');
        }
        if (!env || typeof env !== 'object' || Array.isArray(env) ||
          Object.values(env).some(value => typeof value !== 'string')) {
          throw Error('RUNTIME_SECRET_ENV_INVALID');
        }
        current.value = Object.freeze({ ...env });
        current.pending = undefined;
        logRuntimeSecretEvent('fetch_succeeded', { ...diagnostic, durationMs: performance.now() - started });
        return current.value;
      }).catch(error => {
        logRuntimeSecretEvent('fetch_failed', { ...diagnostic, durationMs: performance.now() - started,
          reason: current.controller.signal.aborted ? 'invalidated' : signal.aborted ? 'timeout' : 'read_failed' });
        if (this.entries.get(key) === current) this.entries.delete(key);
        throw error;
      });
      // A cancelled sole reader may leave a bounded shared read in progress.
      // Observe its rejection; invalidation and deadline still prohibit caching.
      void current.pending.catch(() => undefined);
    }
    logRuntimeSecretEvent(outcome === 'hit' ? 'cache_hit' : outcome === 'joined' ? 'cache_joined' : 'cache_miss',
      { cacheId: this.cacheId, entryId: entry.id, traceId: options.traceId });
    return { ...(entry.value ?? await waitForRead(entry.pending!, options.signal)) };
  }
}
