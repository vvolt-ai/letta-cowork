import { getResourceKey, isParallelSafe } from '../../../services/agent/subagents/parallelism.js';

/** SDK external RPCs arrive independently, not as one old REST tool batch.
 * Carry contention across callbacks while allowing reads/unrelated file writes. */
export class SdkToolScheduler {
  private global: Promise<unknown> = Promise.resolve();
  private readonly files = new Map<string, Promise<unknown>>();
  run<T>(
    name: string,
    input: Record<string, unknown>,
    cwd: string,
    execute: () => Promise<T>,
  ): Promise<T> {
    // Delegation is not a file effect and must not hold a lock while its child
    // needs that same lock. Child effects use this shared scheduler themselves.
    if (name === 'Task' || name === 'Agent' || isParallelSafe(name)) return execute();
    const key = getResourceKey(name, input, cwd);
    if (key === '__global__') {
      const work = Promise.allSettled([this.global, ...this.files.values()]).then(execute);
      this.global = work.catch(() => undefined);
      this.files.clear();
      return work;
    }
    const work = Promise.allSettled([this.global, this.files.get(key)]).then(execute);
    this.files.set(key, work);
    void work
      .finally(() => {
        if (this.files.get(key) === work) this.files.delete(key);
      })
      .catch(() => undefined);
    return work;
  }
}
