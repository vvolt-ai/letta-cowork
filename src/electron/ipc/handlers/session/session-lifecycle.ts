/**
 * Session lifecycle handlers
 * Handles stop, delete, list, rename, and cancel pending operations
 */

import { deleteSession, updateSession, getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions, removeStoredSession, updateStoredSession, type StoredSession } from "../../../services/settings/index.js";
import { debug, broadcast, createLettaClient } from "./utils.js";
import { runnerHandles, emit, cancelAllRunners } from "./session-creation.js";
import { abortSessionById, abortAllSessions } from "../../../libs/runner/index.js";
import type { ServerEvent } from "./types.js";

/**
 * Handle session.stop event
 * Only works with real Letta conversation IDs.
 */
export async function handleStopSession(sessionId: string): Promise<void> {
    debug("session.stop: stopping session", { sessionId, availableHandles: Array.from(runnerHandles.keys()) });

    let handle = runnerHandles.get(sessionId);

    if (!handle) {
        for (const [key, h] of runnerHandles) {
            if (h.sessionId === sessionId) {
                handle = h;
                debug("session.stop: found handle by sessionId property", { key, sessionId: h.sessionId });
                break;
            }
        }
    }

    if (handle) {
        debug("session.stop: aborting handle");
        await handle.abort();
        runnerHandles.delete(sessionId);
        for (const [key, h] of runnerHandles) {
            if (h.sessionId === sessionId) runnerHandles.delete(key);
        }
    } else {
        debug("session.stop: no handle found in runnerHandles, trying direct abort via runner");
        await abortSessionById(sessionId);
    }

    const runtimeSession = getSession(sessionId);
    if (runtimeSession?.pendingPermissions) {
        runtimeSession.pendingPermissions.clear();
    }

    updateSession(sessionId, { status: "idle" });
    emit({ type: "session.status", payload: { sessionId, status: "idle" } });
}

/**
 * Handle session.delete event
 */
export async function handleDeleteSession(sessionId: string): Promise<void> {
    const handle = runnerHandles.get(sessionId);
    if (handle) {
        handle.abort();
        runnerHandles.delete(sessionId);
    }

    const lettaClient = createLettaClient();
    if (lettaClient && sessionId) {
        try {
            await lettaClient.conversations.delete(sessionId);
        } catch (err) {
            console.error("Failed to delete conversation from Letta:", err);
        }
    }

    deleteSession(sessionId);
    removeStoredSession(sessionId);
    emit({ type: "session.deleted", payload: { sessionId } });
}

/**
 * Handle session.list event
 */
export function handleListSessions(): void {
    const storedSessions = getStoredSessions();
    const sessions = storedSessions.map((session: StoredSession) => ({
        id: session.id,
        title: session.title,
        agentName: session.agentName,
        agentId: session.agentId,
        status: getSession(session.id)?.status || "idle",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isEmailSession: session.isEmailSession ?? false,
    }));
    emit({ type: "session.list", payload: { sessions } });
}

/**
 * Handle session.cancelPending event
 */
export async function handleCancelPending(): Promise<void> {
    debug("session.cancelPending: cancelling all pending runners");
    await cancelAllRunners();
    await abortAllSessions();
    emit({ type: "session.pendingCancelled", payload: {} });
}

/**
 * Handle session.rename event
 */
export function handleRenameSession(sessionId: string, title: string): void {
    updateStoredSession(sessionId, { title, updatedAt: Date.now() });
    const runtime = updateSession(sessionId, { title }) ?? getSession(sessionId);
    emit({
        type: "session.status",
        payload: { sessionId, status: runtime?.status ?? "idle", title },
    });
}

/**
 * Cleanup all sessions on app quit
 */
export async function cleanupAllSessions(): Promise<void> {
    const abortPromises: Promise<void>[] = [];
    for (const [, handle] of runnerHandles) {
        abortPromises.push(handle.abort());
    }
    await Promise.all(abortPromises);
    runnerHandles.clear();
}
