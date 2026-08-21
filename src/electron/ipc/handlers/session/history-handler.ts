/**
 * History retrieval handler
 * Handles fetching session message history
 */

import { emit } from "./session-creation.js";
import { debug, createLettaClient, extractMessageText } from "./utils.js";
import { normaliseHistoryBatch, type LettaMessage } from "../../../libs/conversation.js";
import { getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions } from "../../../services/settings/index.js";

import type { StreamMessage } from "../../../types.js";

/**
 * Check if an ID looks like a valid Letta conversation/agent ID.
 * Valid IDs are: agent-*, conv-*, conversation-*, or UUIDs.
 */
function isValidLettaId(id: string | undefined): boolean {
    if (!id) return false;
    return /^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(id);
}

/**
 * Letta history cursors are canonical message IDs. UI-only message identities
 * such as `<tool-call-id>::result` must never be sent as API cursors.
 */
function isValidHistoryCursor(cursor: string | undefined): cursor is string {
    return Boolean(cursor && cursor.length >= 44 && !cursor.includes("::"));
}

/**
 * Map Letta messages to stream messages format
 */
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
                id: (msg as any).id || (msg as any).message_id || (msg as any).uuid,
            } as StreamMessage);
            continue;
        }

        if (msgType === "assistant_message") {
            const agentText = extractMessageText(msg.content).trim();
            if (!agentText) continue;
            messages.push({
                type: "assistant",
                content: agentText,
                uuid: (msg as any).id || (msg as any).message_id || (msg as any).uuid,
            } as StreamMessage);
            continue;
        }
    }

    return messages;
}

/**
 * Handle session.history event
 */
export async function handleGetSessionHistory(
    sessionId: string,
    limit: number = 50,
    before?: string,
    lettaConnectionId?: string
): Promise<void> {
    const conversationId = sessionId;
    const requestedBefore = isValidHistoryCursor(before) ? before : undefined;
    const discardedBefore = before && !requestedBefore ? before : undefined;
    const status = getSession(conversationId)?.status || "idle";

    debug("session.history: request", { conversationId, limit, requestedBefore, discardedBefore });

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

    const connectionId = lettaConnectionId !== undefined
        ? lettaConnectionId.trim() || undefined
        : getStoredSessions().find(
            (session) => session.id === conversationId
        )?.lettaConnectionId;
    const lettaClient = createLettaClient(connectionId);

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
            // Conversation messages are returned newest-first. In Letta's cursor
            // semantics `after` advances past the oldest item in that descending
            // page and therefore loads older history. `before` walks back toward
            // newer records and causes heavily overlapping/shrinking pages.
            ...(requestedBefore ? { after: requestedBefore } : {}),
        } as Record<string, unknown>);

        const items = (Array.isArray((response as { items?: unknown[] }).items)
            ? (response as { items: unknown[] }).items
            : []) as unknown as LettaMessage[];

        const normalised = normaliseHistoryBatch(items, limit);
        const messages = normalised.messages.filter((msg) => (msg as { type?: string })?.type !== "reasoning");
        const totalFetchedCount = typeof (response as unknown as { total?: number }).total === "number"
            ? (response as unknown as { total: number }).total
            : items.length;
        const totalDisplayableCount = normalised.allFiltered.length;
        const responseHasMore = (response as unknown as { has_more?: boolean }).has_more;
        // conversations.messages.list returns an ArrayPage, which does not expose
        // has_more. A short page is not reliable evidence of exhaustion because the
        // server can return partial pages. Keep pagination available until a request
        // for an older cursor actually returns no raw records.
        // Keep API pagination state separate from normalized display-message IDs.
        // The SDK's ArrayPage items carry canonical Letta message IDs.
        const nextBefore = items.at(-1)?.id;
        const hasMore = typeof responseHasMore === "boolean"
            ? responseHasMore && Boolean(nextBefore)
            : Boolean(nextBefore) && nextBefore !== requestedBefore;

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
}
