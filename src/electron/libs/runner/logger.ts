/**
 * Logging utilities for the runner module.
 */

const DEBUG = process.env.LETTA_DEBUG === "true" || process.env.NODE_ENV === "development";

// Request-local performance tracing lives in sdk/startup-timing.ts.
// Do not use module-load time as a request-duration baseline.

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
