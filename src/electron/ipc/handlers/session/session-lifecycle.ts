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
import { abortAllSessions } from "../../../libs/runner/index.js";
import { deleteSession, updateSession, getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions, removeStoredSession, updateStoredSession, type StoredSession } from "../../../services/settings/index.js";
import {findOwnedAbortTarget,abortCapturedSession} from '../../../libs/runner/abort-handler.js';
import {getOwnedDesktopSdkSessions} from '../../../libs/runner/sdk/session.js';
import {stopConversationVerified,findCanonicalStopHandle} from './verified-stop.js';

/**
 * Handle session.stop event
 * Only works with real Letta conversation IDs.
 */
export async function handleStopSession(sessionId: string): Promise<void> {
    debug("session.stop: stopping session", { sessionId, availableHandles: Array.from(runnerHandles.keys()) });
    return stopConversationVerified(sessionId, {
        capture: () => {
            const handle = findCanonicalStopHandle(runnerHandles, sessionId);
            if (handle) return {abort: async () => {
                await handle.abort();
                // Cancellation proof came from abort(); done is a cleanup
                // boundary, not a requirement that the model itself succeeded.
                await handle.done.catch(() => undefined);
                const current = findCanonicalStopHandle(runnerHandles, sessionId);
                if ((current && current !== handle) || getOwnedDesktopSdkSessions(sessionId).length) return false;
                for (const [key, candidate] of runnerHandles) if (candidate === handle) runnerHandles.delete(key);
                return true;
            }};
            const target = findOwnedAbortTarget(sessionId);
            return target ? {abort: () => abortCapturedSession(sessionId, target)} : undefined;
        },
        publish: (stopState, stopRequestId, errorCode) => {
            if (stopState === 'verified') getSession(sessionId)?.pendingPermissions?.clear();
            emit({type:'session.status',payload:{sessionId,
                status: stopState === 'verified' ? 'idle' : stopState === 'unverified' ? 'error' : 'running',
                error: stopState === 'unverified' ? errorCode ?? 'SDK_STOP_NOT_VERIFIED' : undefined,
                stopState,stopRequestId}});
        },
    });
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

        const connectionId = getStoredSessions().find(
            (session) => session.id === sessionId
        )?.lettaConnectionId;
        const lettaClient = createLettaClient(connectionId);
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
        lettaConnectionId: session.lettaConnectionId,
        model: session.model,
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
