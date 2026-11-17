import { waitForRead } from '../../services/letta-runtime/read-deadline.js';

export type RuntimeSecretCacheOutcome = 'hit' | 'miss' | 'joined';
type Env = Readonly<Record<string, string>>;
interface Entry {
  controller: AbortController;
  pending?: Promise<Env>;
  value?: Env;
}

/** Main-process RAM only. No persistence, process.env mutation or value logging.
 * Successful empty environments are cached too; failed reads are never cached.
 * Each caller may cancel its wait without cancelling another caller's load.
 */
export class RuntimeSecretCache {
  private context?: string;
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly timeoutMs = 10000, private readonly capacity = 128) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1024) {
      throw Error('INVALID_RUNTIME_SECRET_CACHE_LIMIT');
    }
  }

  clear(): void {
    const previous = [...this.entries.values()];
    this.entries.clear();
    this.context = undefined;
    for (const entry of previous) entry.controller.abort(Error('RUNTIME_SECRET_CACHE_INVALIDATED'));
  }

  async get(
    context: string,
    key: string,
    load: (signal: AbortSignal) => Promise<Record<string, string>>,
    options: { signal?: AbortSignal; onOutcome?: (outcome: RuntimeSecretCacheOutcome) => void; } = {},
  ): Promise<Record<string, string>> {
    options.signal?.throwIfAborted();
    if (this.context !== context) {
      this.clear();
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
        evicted.controller.abort(Error('RUNTIME_SECRET_CACHE_EVICTED'));
      }
      entry = { controller: new AbortController() };
      this.entries.set(key, entry);
      const current = entry;
      const signal = AbortSignal.any([current.controller.signal, AbortSignal.timeout(this.timeoutMs)]);
      const work = Promise.resolve().then(() => {
        signal.throwIfAborted();
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
        return current.value;
      }).catch(error => {
        if (this.entries.get(key) === current) this.entries.delete(key);
        throw error;
      });
      // A cancelled sole reader may leave a bounded shared read in progress.
      // Observe its rejection; invalidation and deadline still prohibit caching.
      void current.pending.catch(() => undefined);
    }
    return { ...(entry.value ?? await waitForRead(entry.pending!, options.signal)) };
  }
}
