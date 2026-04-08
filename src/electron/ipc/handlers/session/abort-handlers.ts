/**
 * Abort/cancellation handlers
 * Handles session abort operations
 */

import { abortSessionById, abortAllSessions } from "../../../libs/runner/index.js";
import { debug } from "./utils.js";
import { runnerHandles, emit, cancelAllRunners } from "./session-creation.js";

/**
 * Handle session.abort event - abort a specific session
 */
export async function handleAbortSession(sessionId: string): Promise<void> {
    debug("session.abort: aborting session", { sessionId, availableHandles: Array.from(runnerHandles.keys()) });

    // Try direct handle abort first
    let handle = runnerHandles.get(sessionId);
    if (!handle) handle = runnerHandles.get("pending");
    if (!handle) handle = runnerHandles.get(`pending-${sessionId}`);

    // Search by sessionId property
    if (!handle) {
        for (const [key, h] of runnerHandles) {
            if (h.sessionId === sessionId || h.sessionId === "pending") {
                handle = h;
                debug("session.abort: found handle by sessionId property", { key, sessionId: h.sessionId });
                break;
            }
        }
    }

    if (handle) {
        debug("session.abort: aborting handle");
        await handle.abort();
        runnerHandles.delete(sessionId);
        runnerHandles.delete("pending");
        runnerHandles.delete(`pending-${sessionId}`);
        for (const [key, h] of runnerHandles) {
            if (h.sessionId === sessionId) runnerHandles.delete(key);
        }
    } else {
        debug("session.abort: no handle found, trying direct abort via runner");
        await abortSessionById(sessionId);
    }

    emit({ type: "session.aborted", payload: { sessionId } });
}

/**
 * Handle session.abortAll event - abort all active sessions
 */
export async function handleAbortAllSessions(): Promise<void> {
    debug("session.abortAll: aborting all sessions", { count: runnerHandles.size });

    // Cancel all runner handles
    await cancelAllRunners();

    // Also abort via runner module
    await abortAllSessions();

    emit({ type: "session.allAborted", payload: {} });
}
