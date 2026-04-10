/**
 * Session IPC handlers
 * Handles session lifecycle events: start, stop, continue, delete, list, history
 */

import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent, StreamMessage } from "../../types.js";
import { runLetta, type RunnerHandle, getCurrentAgentId, clearAgentCache, abortSessionById, abortAllSessions } from "../../libs/runner/index.js";
import type { PendingPermission } from "../../libs/runtime-state.js";
import {
    createRuntimeSession,
    getSession,
    updateSession,
    deleteSession,
} from "../../libs/runtime-state.js";
import { Letta } from "@letta-ai/letta-client";
import { normaliseHistoryBatch, type LettaMessage } from "../../libs/conversation.js";
import {
    getStoredSessions,
    addStoredSession,
    removeStoredSession,
    updateStoredSession,
    type StoredSession,
} from "../../services/settings/index.js";
import { getLettaAgent, getAgentRunApprovalCandidates, cancelAgentRunById } from "../../services/agents/index.js";

const DEBUG = process.env.DEBUG_IPC === "true";

/**
 * Generate a title from the first prompt message
 */
function generateTitleFromPrompt(prompt: string): string {
    if (!prompt?.trim()) return "New conversation";

    const cleaned = prompt.trim();
    const withoutPrefix = cleaned
        .replace(/^(please|can you|could you|help me|i want|i need|let's|lets)\s*/i, "")
        .trim();

    const firstSentence = withoutPrefix.split(/[.!?]\s/)[0] || withoutPrefix;

    let title = firstSentence;
    if (title.length > 50) {
        const words = title.split(/\s+/);
        title = "";
        for (const word of words) {
            if ((title + " " + word).trim().length > 50) break;
            title = (title + " " + word).trim();
        }
        if (title.length === 0) {
            title = firstSentence.slice(0, 47) + "...";
        }
    }

    title = title.charAt(0).toUpperCase() + title.slice(1);
    return title || "New conversation";
}

// Simple logger for IPC handlers
const log = (msg: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [ipc] ${msg}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${timestamp}] [ipc] ${msg}`);
    }
};

// Debug-only logging (verbose)
const debug = (msg: string, data?: Record<string, unknown>) => {
    console.log(`[${new Date().toISOString()}] [ipc] ${msg}`, data);
    if (!DEBUG) return;
    log(msg, data);
};

// Create Letta client helper
function createLettaClient(): Letta | null {
    try {
        const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
        const apiKey = (process.env.LETTA_API_KEY || "").trim();
        if (!apiKey) return null;
        return new Letta({
            baseURL,
            apiKey: apiKey || null,
        });
    } catch {
        return null;
    }
}

// Track active runner handles
const runnerHandles = new Map<string, RunnerHandle>();

// Cancel all runners and clear handles (used on error)
async function cancelAllRunners(): Promise<void> {
    debug("cancelAllRunners: cancelling all runners", { count: runnerHandles.size });
    await abortAllSessions();
    for (const [key, handle] of runnerHandles) {
        try {
            await handle.abort();
        } catch (err) {
            debug("cancelAllRunners: error aborting handle", { key, error: String(err) });
        }
    }
    runnerHandles.clear();
    debug("cancelAllRunners: all runners cancelled");
}

function extractMessageText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content) && content.length > 0) {
        const lastBlock = content[content.length - 1] as any;
        if (lastBlock && typeof lastBlock.text === "string") {
            return lastBlock.text;
        }
        if (typeof lastBlock === "string") {
            return lastBlock;
        }
        try {
            return JSON.stringify(lastBlock);
        } catch {
            return String(lastBlock ?? "");
        }
    }
    if (typeof content === "object") {
        try {
            return JSON.stringify(content);
        } catch {
            return String(content ?? "");
        }
    }
    return String(content ?? "");
}

function mapLettaMessagesToStreamMessages(rawMessages: LettaMessage[]): StreamMessage[] {
    const sorted = [...rawMessages].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const messages: StreamMessage[] = [];

    for (const msg of sorted) {
        const msgType = (msg.message_type || msg.type || "").toLowerCase();

        if (msgType === "user_message") {
            const promptText = extractMessageText(msg.content).trim();
            if (!promptText) continue;
            messages.push({
                type: "user_prompt",
                prompt: promptText,
                attachments: undefined,
                content: undefined,
            });
            continue;
        }

        if (msgType === "assistant_message") {
            const agentText = extractMessageText(msg.content).trim();
            if (!agentText) continue;
            messages.push({
                type: "assistant",
                content: agentText,
            } as StreamMessage);
            continue;
        }
    }

    return messages;
}

/**
 * Check if an ID looks like a valid Letta conversation/agent ID.
 * Valid IDs are: agent-*, conv-*, conversation-*, or UUIDs.
 */
function isValidLettaId(id: string | undefined): boolean {
    if (!id) return false;
    return /^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(id);
}

function broadcast(event: ServerEvent) {
    const payload = JSON.stringify(event);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        win.webContents.send("server-event", payload);
    }
}

function emit(event: ServerEvent) {
    // Update runtime state on status changes
    if (event.type === "session.status") {
        updateSession(event.payload.sessionId, { status: event.payload.status });
    }
    broadcast(event);
}

/**
 * Handle session-related client events
 */
export async function handleSessionEvent(event: ClientEvent): Promise<void> {
    debug(`handleClientEvent: ${event.type}`, { payload: 'payload' in event ? event.payload : undefined });

    if (event.type === "session.list") {
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
        return;
    }

    if (event.type === "session.history") {
        const conversationId = event.payload.sessionId;
        const limit = event.payload.limit || 50;
        const requestedBefore = event.payload.before || undefined;
        const status = getSession(conversationId)?.status || "idle";

        debug("session.history: request", { conversationId, limit, requestedBefore });

        // Guard: Only call Letta API with valid Letta conversation IDs
        if (!isValidLettaId(conversationId)) {
            debug("session.history: skipping remote fetch for non-Letta ID", { conversationId });
            emit({
                type: "session.history",
                payload: {
                    sessionId: conversationId,
                    status,
                    messages: [],
                    hasMore: false,
                    nextBefore: undefined,
                },
            });
            return;
        }

        const lettaClient = createLettaClient();
        if (!lettaClient) {
            emit({
                type: "session.history",
                payload: { sessionId: conversationId, status, messages: [], error: "Letta client not available" },
            });
            return;
        }

        try {
            const response = await lettaClient.conversations.messages.list(conversationId, {
                limit,
                ...(requestedBefore ? { before: requestedBefore } : {}),
            } as any);
            const items = (Array.isArray((response as any).items) ? (response as any).items : []) as unknown as LettaMessage[];

            const normalised = normaliseHistoryBatch(items, limit);
            const messages = normalised.messages.filter((msg) => (msg as any)?.type !== "reasoning");
            const totalFetchedCount = typeof (response as any)?.total === "number" ? (response as any).total : items.length;
            const totalDisplayableCount = normalised.allFiltered.length;
            const hasMore = typeof (response as any)?.has_more === "boolean"
                ? (response as any).has_more
                : normalised.hasMore;
            const nextBefore = ((response as any)?.next_before as string | undefined) ?? normalised.nextBefore;

            debug("session.history: response", {
                conversationId, requestedBefore, returned: messages.length,
                filteredTotal: normalised.allFiltered.length, totalFetchedCount,
                totalDisplayableCount, hasMore, nextBefore,
            });

            emit({
                type: "session.history",
                payload: {
                    sessionId: conversationId, status, messages, hasMore, nextBefore,
                    requestedBefore, totalFetchedCount, totalDisplayableCount,
                },
            });
        } catch (error) {
            console.error("Failed to fetch session history:", error);
            emit({
                type: "session.history",
                payload: { sessionId: conversationId, status, messages: [], error: String(error) },
            });
        }
        return;
    }

    if (event.type === "session.start") {
        const { prompt, content, attachments, cwd, agentId, model, title, background, isEmailSession } = event.payload;
        clearAgentCache();

        debug("session.start: starting new session", {
            prompt: (prompt ?? "").slice(0, 50), cwd,
            contentType: Array.isArray(content) ? "multimodal" : "text",
            attachments: attachments?.length ?? 0, background, isEmailSession,
        });
        const pendingPermissions = new Map<string, PendingPermission>();

        try {
            debug("session.start: calling runLetta (waits for real conversation ID)");
            const sessionTitle = (title?.trim() ?? "") || generateTitleFromPrompt(prompt);

            const handle = await runLetta({
                prompt, content, preferredAgentId: agentId, model,
                session: { id: "pending", title: sessionTitle, status: "running", cwd, pendingPermissions },
                onEvent: (e) => {
                    emit(e);
                },
                onSessionUpdate: async (updates) => {
                    debug("session.start: onSessionUpdate called", { updates });
                    if (updates.lettaConversationId) {
                        const conversationId = updates.lettaConversationId;
                        debug("session.start: session initialized", { conversationId });

                        createRuntimeSession(conversationId);
                        updateSession(conversationId, { status: "running", title: sessionTitle });

                        const resolvedAgentId = agentId || process.env.LETTA_AGENT_ID || "";
                        let agentName: string | undefined = undefined;
                        try {
                            console.log("[ipc] Getting agent name for agentId:", resolvedAgentId);
                            const agent = await getLettaAgent(resolvedAgentId);
                            console.log("[ipc] Got agent:", agent);
                            if (agent) agentName = agent.name;
                        } catch (e) {
                            console.log("[ipc] Failed to get agent name:", e);
                        }

                        addStoredSession({
                            id: conversationId, agentId: resolvedAgentId, agentName,
                            title: sessionTitle, createdAt: Date.now(), updatedAt: Date.now(),
                            isEmailSession: isEmailSession ?? false,
                        });

                        console.log("[session.start] Emitting session.status", { conversationId, isEmailSession, status: "running" });
                        emit({
                            type: "session.status",
                            payload: { sessionId: conversationId, status: "running", title: sessionTitle, cwd, agentName, agentId: resolvedAgentId, background, isEmailSession },
                        });
                        emit({
                            type: "stream.user_prompt",
                            payload: { sessionId: conversationId, prompt, attachments, content },
                        });
                    }
                },
            });

            // runLetta now returns a handle with the real conversation ID
            const conversationId = handle.sessionId;
            runnerHandles.set(conversationId, handle);
            debug("session.start: runLetta returned handle", { conversationId });

        } catch (error) {
            log("session.start: ERROR", { error: String(error) });
            console.error("Failed to start session:", error);
            await cancelAllRunners();
            emit({ type: "runner.error", payload: { message: String(error) } });
        }
        return;
    }

    if (event.type === "session.continue") {
        const { sessionId: conversationId, prompt, content, attachments, cwd, model } = event.payload;

        // Validate we have a real conversation ID
        if (!conversationId || !isValidLettaId(conversationId)) {
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

        let runtimeSession = getSession(conversationId);
        if (!runtimeSession) {
            debug("session.continue: no runtime session found, creating new one");
            runtimeSession = createRuntimeSession(conversationId);
        } else {
            debug("session.continue: found existing runtime session", { status: runtimeSession.status });
        }

        const storedSession = runtimeSession.title
            ? undefined
            : getStoredSessions().find((session) => session.id === conversationId);
        const resolvedTitle = runtimeSession.title ?? storedSession?.title ?? conversationId;

        runtimeSession = updateSession(conversationId, { status: "running", title: resolvedTitle }) ?? runtimeSession;

        emit({ type: "session.status", payload: { sessionId: conversationId, status: "running", title: resolvedTitle } });
        emit({ type: "stream.user_prompt", payload: { sessionId: conversationId, prompt, attachments, content } });

        try {
            debug("session.continue: calling runLetta", { conversationId });
            let actualConversationId = conversationId;

            const handle = await runLetta({
                prompt, content, model,
                session: {
                    id: conversationId, title: resolvedTitle, status: "running", cwd,
                    pendingPermissions: runtimeSession.pendingPermissions,
                },
                resumeConversationId: conversationId,
                onEvent: (e) => {
                    if (actualConversationId !== conversationId && "sessionId" in e.payload) {
                        const payload = e.payload as { sessionId: string };
                        payload.sessionId = actualConversationId;
                    }
                    emit(e);
                },
                onSessionUpdate: (updates) => {
                    if (updates.lettaConversationId && updates.lettaConversationId !== conversationId) {
                        log("session.continue: received new conversationId from runner", { old: conversationId, new: updates.lettaConversationId });
                        actualConversationId = updates.lettaConversationId;

                        deleteSession(conversationId);
                        emit({ type: "session.deleted", payload: { sessionId: conversationId } });

                        createRuntimeSession(actualConversationId);
                        updateSession(actualConversationId, { status: "running" });

                        emit({ type: "session.status", payload: { sessionId: actualConversationId, status: "running", title: actualConversationId, cwd } });
                        emit({ type: "stream.user_prompt", payload: { sessionId: actualConversationId, prompt, attachments, content } });
                    }
                },
            });
            debug("session.continue: runLetta returned handle");

            runnerHandles.set(actualConversationId, handle);
        } catch (error) {
            log("session.continue: ERROR", { error: String(error) });
            await cancelAllRunners();
            updateSession(conversationId, { status: "error" });
            emit({ type: "session.status", payload: { sessionId: conversationId, status: "error", error: String(error) } });
        }
        return;
    }

    if (event.type === "session.stop") {
        const conversationId = event.payload.sessionId;
        debug("session.stop: stopping session", { conversationId, availableHandles: Array.from(runnerHandles.keys()) });

        let handle = runnerHandles.get(conversationId);

        if (!handle) {
            for (const [key, h] of runnerHandles) {
                if (h.sessionId === conversationId) {
                    handle = h;
                    debug("session.stop: found handle by sessionId property", { key, sessionId: h.sessionId });
                    break;
                }
            }
        }

        if (handle) {
            debug("session.stop: aborting handle");
            await handle.abort();
            runnerHandles.delete(conversationId);
            for (const [key, h] of runnerHandles) {
                if (h.sessionId === conversationId) runnerHandles.delete(key);
            }
        } else {
            debug("session.stop: no handle found in runnerHandles, trying direct abort via runner");
            await abortSessionById(conversationId);
        }

        const runtimeSession = getSession(conversationId);
        if (runtimeSession?.pendingPermissions) {
            runtimeSession.pendingPermissions.clear();
        }

        updateSession(conversationId, { status: "idle" });
        emit({ type: "session.status", payload: { sessionId: conversationId, status: "idle" } });
        return;
    }

    if (event.type === "session.delete") {
        const conversationId = event.payload.sessionId;
        const handle = runnerHandles.get(conversationId);
        if (handle) {
            handle.abort();
            runnerHandles.delete(conversationId);
        }

        const lettaClient = createLettaClient();
        if (lettaClient && conversationId) {
            try {
                await lettaClient.conversations.delete(conversationId);
            } catch (err) {
                console.error("Failed to delete conversation from Letta:", err);
            }
        }

        deleteSession(conversationId);
        removeStoredSession(conversationId);
        emit({ type: "session.deleted", payload: { sessionId: conversationId } });
        return;
    }

    if (event.type === "session.cancelPending") {
        debug("session.cancelPending: cancelling all pending runners");
        await cancelAllRunners();
        emit({ type: "session.pendingCancelled", payload: {} });
        return;
    }

    if (event.type === "session.rename") {
        const { sessionId, title } = event.payload;
        updateStoredSession(sessionId, { title, updatedAt: Date.now() });
        const runtime = updateSession(sessionId, { title }) ?? getSession(sessionId);
        emit({
            type: "session.status",
            payload: { sessionId, status: runtime?.status ?? "idle", title },
        });
        return;
    }

    if (event.type === "permission.response") {
        const session = getSession(event.payload.sessionId);
        if (!session) return;

        const pending = session.pendingPermissions.get(event.payload.toolUseId);
        if (pending) {
            pending.resolve(event.payload.result);
        }
        return;
    }
}

/**
 * Recover pending approvals for a session
 */
export async function recoverPendingApprovalsForSession(sessionId: string, agentId?: string) {
    const resolvedAgentId = agentId
        || getSession(sessionId)?.agentId
        || getStoredSessions().find((session) => session.id === sessionId)?.agentId;

    if (!resolvedAgentId) return [];

    try {
        const candidates = await getAgentRunApprovalCandidates(resolvedAgentId, sessionId);
        for (const candidate of candidates) {
            emit({
                type: "permission.request",
                payload: {
                    sessionId,
                    toolUseId: candidate.toolUseId,
                    toolName: candidate.toolName,
                    input: candidate.input,
                    source: "recovered",
                    runId: candidate.runId,
                    conversationId: candidate.conversationId,
                    isStuckRun: true,
                    requestedAt: candidate.requestedAt,
                },
            });
        }
        return candidates;
    } catch (error) {
        console.warn("Failed to recover pending approvals for session", { sessionId, resolvedAgentId, error });
        return [];
    }
}

/**
 * Cancel a recovered run
 */
export async function cancelRecoveredRun(runId: string) {
    return cancelAgentRunById(runId);
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
