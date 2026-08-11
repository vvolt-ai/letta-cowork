/**
 * Session lifecycle handlers
 * Handles stop, delete, list, rename, and cancel pending operations
 */

import {
    cancelQueuedConversationTurns,
    enqueueConversationTurn,
} from "./conversation-turn-queue.js";
import {
    runnerHandles,
    emit,
    cancelAllRunners,
} from "./session-creation.js";
import { debug, createLettaClient } from "./utils.js";
import { abortSessionById, abortAllSessions } from "../../../libs/runner/index.js";
import { deleteSession, updateSession, getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions, removeStoredSession, updateStoredSession, type StoredSession } from "../../../services/settings/index.js";

/**
 * Handle session.stop event
 * Only works with real Letta conversation IDs.
 */
export async function handleStopSession(sessionId: string): Promise<void> {
    debug("session.stop: stopping session", { sessionId, availableHandles: Array.from(runnerHandles.keys()) });
    cancelQueuedConversationTurns(sessionId);

    // Reflect the user's stop intent immediately. Actual stream/server abort can
    // take seconds, especially while Letta/provider cancellation settles, but UI
    // should not stay stuck on "running" during that cleanup.
    const runtimeSession = getSession(sessionId);
    runtimeSession?.pendingPermissions?.clear();
    updateSession(sessionId, { status: "idle" });
    emit({
        type: "session.status",
        payload: { sessionId, status: "idle" },
    });

    // Install a barrier before awaiting cancellation. Prompts arriving while
    // Stop is settling are queued behind this operation, so the final idle
    // status cannot overwrite a newer turn's running state.
    let releaseStop!: () => void;
    const stopSettled = new Promise<void>((resolve) => {
        releaseStop = resolve;
    });
    const stopBarrier = enqueueConversationTurn(
        sessionId,
        async (isCancelled) => {
            await stopSettled;
            if (isCancelled()) return;

            const runtimeSession = getSession(sessionId);
            runtimeSession?.pendingPermissions?.clear();
            updateSession(sessionId, { status: "idle" });
            emit({
                type: "session.status",
                payload: { sessionId, status: "idle" },
            });
        }
    );

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

    try {
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
    } finally {
        releaseStop();
    }

    await stopBarrier;
}

/**
 * Handle session.delete event
 */
export async function handleDeleteSession(sessionId: string): Promise<void> {
    cancelQueuedConversationTurns(sessionId);

    // Hold later prompts until deletion finishes, then invalidate anything
    // that arrived during deletion so the removed session cannot resurrect.
    let releaseDelete!: () => void;
    const deleteSettled = new Promise<void>((resolve) => {
        releaseDelete = resolve;
    });
    const deleteBarrier = enqueueConversationTurn(sessionId, async () => {
        await deleteSettled;
    });

    try {
        const handle = runnerHandles.get(sessionId);
        if (handle) {
            await handle.abort();
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
    } finally {
        // Cancel prompts queued behind the deletion barrier before releasing it.
        cancelQueuedConversationTurns(sessionId);
        releaseDelete();
    }

    await deleteBarrier;
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
