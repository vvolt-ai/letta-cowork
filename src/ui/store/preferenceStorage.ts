import type { StateStorage } from 'zustand/middleware';

/** Avoid synchronous localStorage writes for unrelated store updates (typing/streaming).
 * Cache only successful reads/writes so a failed write can always be retried.
 */
export function createPreferenceStorage(getStorage: () => Storage): StateStorage {
  const lastValues = new Map<string, string | null>();
  return {
    getItem(name) {
      const value = getStorage().getItem(name);
      lastValues.set(name, value);
      return value;
    },
    setItem(name, value) {
      if (lastValues.has(name) && lastValues.get(name) === value) return;
      getStorage().setItem(name, value);
      lastValues.set(name, value);
    },
    removeItem(name) {
      getStorage().removeItem(name);
      lastValues.delete(name);
    },
  };
}
