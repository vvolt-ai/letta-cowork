/**
 * Logging utilities for the runner module.
 */

const DEBUG = process.env.LETTA_DEBUG === "true" || process.env.NODE_ENV === "development";

/**
 * Simple timing helper for performance tracking.
 */
export const timing = {
  start: Date.now(),
  mark: (label: string) => {
    const elapsed = Date.now() - timing.start;
    console.log(`[timing] ${elapsed}ms: ${label}`);
  }
};

/**
 * Standard logger for runner operations.
 */
export const log = (msg: string, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [runner] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [runner] ${msg}`);
  }
};

/**
 * Debug-only logging (verbose).
 */
export const debug = (msg: string, data?: Record<string, unknown>) => {
  if (DEBUG) {
    log(msg, data);
  }
};
