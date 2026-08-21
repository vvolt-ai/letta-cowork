/**
 * Session resumption handler
 * Handles continuing existing sessions
 */

import { enqueueConversationTurn } from "./conversation-turn-queue.js";
import {
    runnerHandles,
    emit,
    trackRunnerHandle,
} from "./session-creation.js";
import { log, debug } from "./utils.js";
import { runLetta } from "../../../libs/runner/index.js";
import { createRuntimeSession, updateSession, deleteSession, getSession } from "../../../libs/runtime-state.js";
import { addStoredSession, getStoredSessions, updateStoredSession } from "../../../services/settings/index.js";

import type { SessionContinueOptions } from "./types.js";
import type { MessageContentItem } from "@letta-ai/letta-agent-sdk";


/**
 * Handle session.continue event
 * Only works with real Letta conversation IDs.
 */
export async function handleContinueSession(
    options: SessionContinueOptions
): Promise<void> {
    const { sessionId: conversationId, prompt, content, attachments, cwd, agentId, lettaConnectionId, model, permissionMode } = options;

    // Validate we have a real conversation ID
    if (!conversationId || !/^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(conversationId)) {
        log("session.continue: ERROR - invalid conversation ID", { conversationId });
        emit({ type: "session.status", payload: { sessionId: conversationId || "unknown", status: "error", error: "Invalid conversation ID" } });
        return;
    }

    const previewPrompt = (prompt ?? "").slice(0, 50);
    debug("session.continue: continuing session", {
        conversationId, prompt: previewPrompt,
        contentType: Array.isArray(content) ? "multimodal" : "text",
        attachments: attachments?.length ?? 0,
    });

    await enqueueConversationTurn(conversationId, async (isCancelled) => {
        // A handle may predate the FIFO (for example, the initial session.start
        // turn). Its done promise is the ownership boundary: wait for actual
        // stream cleanup, not for the control handle to have been returned.
        const priorHandle = runnerHandles.get(conversationId);
        if (priorHandle) {
            debug("session.continue: queued behind active turn", {
                conversationId,
            });
            await priorHandle.done;
        }
        // Stop/delete may have invalidated this queued turn while it waited for
        // the previous owner to release the conversation.
        if (isCancelled()) return;

        let runtimeSession = getSession(conversationId);
        if (!runtimeSession) {
            debug("session.continue: no runtime session found, creating new one");
            runtimeSession = createRuntimeSession(conversationId);
        } else {
            debug("session.continue: found existing runtime session", {
                status: runtimeSession.status,
            });
        }

        const storedSession = getStoredSessions().find(
            (session) => session.id === conversationId
        );
        const resolvedTitle =
            runtimeSession.title ?? storedSession?.title ?? conversationId;
        // A missing connection always falls back to the account originally stored
        // with this conversation; if neither exists, the runtime uses Vera's
        // organization-default Letta account.
        const resolvedConnectionId = lettaConnectionId !== undefined
            ? lettaConnectionId.trim() || undefined
            : storedSession?.lettaConnectionId;
        const resolvedModel = typeof model === "string"
            ? model.trim() || undefined
            : storedSession?.model;
        if (!storedSession && agentId) {
            addStoredSession({
                id: conversationId,
                agentId,
                lettaConnectionId: resolvedConnectionId,
                model: resolvedModel,
                title: resolvedTitle,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        } else if (storedSession) {
            updateStoredSession(conversationId, {
                lettaConnectionId: resolvedConnectionId,
                model: resolvedModel,
                updatedAt: Date.now(),
            });
        }

        runtimeSession =
            updateSession(conversationId, {
                status: "running",
                title: resolvedTitle,
            }) ?? runtimeSession;

        emit({
            type: "session.status",
            payload: {
                sessionId: conversationId,
                status: "running",
                title: resolvedTitle,
                lettaConnectionId: resolvedConnectionId ?? "",
                model: resolvedModel ?? "",
            },
        });
        emit({
            type: "stream.user_prompt",
            payload: {
                sessionId: conversationId,
                prompt,
                attachments,
                content,
            },
        });

        try {
            debug("session.continue: calling runLetta", { conversationId });
            let actualConversationId = conversationId;

            const handle = await runLetta({
                prompt: prompt ?? "",
                content: content as MessageContentItem[] | undefined,
                model: resolvedModel,
                permissionMode,
                session: {
                    id: conversationId,
                    title: resolvedTitle,
                    status: "running",
                    cwd,
                    pendingPermissions: runtimeSession.pendingPermissions,
                    permissionGrants: runtimeSession.permissionGrants,
                },
                resumeConversationId: conversationId,
                lettaConnectionId: resolvedConnectionId,
                onEvent: (e) => {
                    if (
                        actualConversationId !== conversationId &&
                        "sessionId" in e.payload
                    ) {
                        const payload = e.payload as { sessionId: string };
                        payload.sessionId = actualConversationId;
                    }
                    emit(e);
                },
                onSessionUpdate: (updates) => {
                    if (
                        updates.lettaConversationId &&
                        updates.lettaConversationId !== conversationId
                    ) {
                        log(
                            "session.continue: received new conversationId from runner",
                            {
                                old: conversationId,
                                new: updates.lettaConversationId,
                            }
                        );
                        actualConversationId = updates.lettaConversationId;

                        deleteSession(conversationId);
                        emit({
                            type: "session.deleted",
                            payload: { sessionId: conversationId },
                        });

                        createRuntimeSession(
                            actualConversationId,
                            runtimeSession.pendingPermissions,
                            runtimeSession.permissionGrants
                        );
                        updateSession(actualConversationId, { status: "running" });

                        emit({
                            type: "session.status",
                            payload: {
                                sessionId: actualConversationId,
                                status: "running",
                                title: actualConversationId,
                                cwd,
                            },
                        });
                        emit({
                            type: "stream.user_prompt",
                            payload: {
                                sessionId: actualConversationId,
                                prompt,
                                attachments,
                                content,
                            },
                        });
                    }
                },
            });
            debug("session.continue: runLetta returned handle");

            // Stop/delete can race with initialization before the handle is
            // visible in runnerHandles. Settle that just-created run instead of
            // allowing a cancelled queued prompt to resurrect the session.
            if (isCancelled()) {
                await handle.abort();
                return;
            }

            trackRunnerHandle(actualConversationId, handle);
            await handle.done;
        } catch (error) {
            log("session.continue: ERROR", { error: String(error) });
            const activeHandle = runnerHandles.get(conversationId);
            if (activeHandle) await activeHandle.abort();
            updateSession(conversationId, { status: "error" });
            emit({
                type: "session.status",
                payload: {
                    sessionId: conversationId,
                    status: "error",
                    error: String(error),
                },
            });
        }
    });
}
