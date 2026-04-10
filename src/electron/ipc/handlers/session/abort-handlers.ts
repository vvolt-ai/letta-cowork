/**
 * Abort/cancellation handlers
 * Handles session abort operations
 */

import { abortSessionById, abortAllSessions } from "../../../libs/runner/index.js";
import { debug } from "./utils.js";
import { runnerHandles, emit, cancelAllRunners } from "./session-creation.js";

/**
 * Handle session.abort event - abort a specific session
 * Only works with real Letta conversation IDs.
 */
export async function handleAbortSession(sessionId: string): Promise<void> {
    debug("session.abort: aborting session", { sessionId, availableHandles: Array.from(runnerHandles.keys()) });

    // Try direct handle lookup by real conversation ID
    let handle = runnerHandles.get(sessionId);

    // Search by sessionId property if not found by key
    if (!handle) {
        for (const [key, h] of runnerHandles) {
            if (h.sessionId === sessionId) {
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
        // Also clean up any entries matching this sessionId
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
