/**
 * History retrieval handler
 * Handles fetching session message history
 */

import { normaliseHistoryBatch, type LettaMessage } from "../../../libs/conversation.js";
import { getSession } from "../../../libs/runtime-state.js";
import { debug, createLettaClient, extractMessageText } from "./utils.js";
import { emit } from "./session-creation.js";
import type { StreamMessage } from "../../../types.js";

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
 * Handle session.history event
 */
export async function handleGetSessionHistory(
    sessionId: string,
    limit: number = 50,
    before?: string
): Promise<void> {
    const conversationId = sessionId;
    const requestedBefore = before;
    const status = getSession(conversationId)?.status || "idle";

    const lettaClient = createLettaClient();
    debug("session.history: request", { conversationId, limit, requestedBefore });

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
        const hasMore = typeof (response as unknown as { has_more?: boolean }).has_more === "boolean"
            ? (response as unknown as { has_more: boolean }).has_more
            : normalised.hasMore;
        const nextBefore = ((response as { next_before?: string }).next_before as string | undefined) ?? normalised.nextBefore;

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
