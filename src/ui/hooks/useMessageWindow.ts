import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { StreamMessage, ServerEvent } from "../types";
import { useAppStore, type PermissionRequest } from "../store/useAppStore";

const VISIBLE_WINDOW_SIZE = 20; // Show 20 messages initially
const LOAD_BATCH_SIZE = 20; // Load 20 more on scroll
const MAX_VISIBLE_MESSAGES = 100; // Maximum 100 messages at a time
const PARTIAL_MESSAGE_RESET_DELAY_MS = 500;

type StreamEventMessage = {
  type: "stream_event";
  event: { type: string; delta?: { text?: string; reasoning?: string } };
};

export interface IndexedMessage {
    originalIndex: number;
    message: StreamMessage;
}

export interface MessageWindowState {
    visibleMessages: IndexedMessage[];
    hasMoreHistory: boolean;
    isLoadingHistory: boolean;
    isAtBeginning: boolean;
    loadMoreMessages: () => void;
    resetToLatest: () => void;
    totalMessages: number;
    totalUserInputs: number;
    visibleUserInputs: number;
    // Partial message handling
    partialMessage: string;
    showPartialMessage: boolean;
    handlePartialMessages: (event: ServerEvent) => void;
}

function getUserInputIndices(messages: StreamMessage[]): number[] {
    const indices: number[] = [];
    messages.forEach((msg, idx) => {
        if (msg.type === "user_prompt") {
            indices.push(idx);
        }
    });
    return indices;
}

function calculateVisibleStartIndex(
    messages: StreamMessage[],
    visibleUserInputCount: number
): number {
    const userInputIndices = getUserInputIndices(messages);
    const totalUserInputs = userInputIndices.length;

    if (totalUserInputs <= visibleUserInputCount) {
        return 0;
    }

    const startUserInputPosition = totalUserInputs - visibleUserInputCount;
    return userInputIndices[startUserInputPosition];
}

export function useMessageWindow(
    messages: StreamMessage[],
    permissionRequests: PermissionRequest[],
    sessionId: string | null,
    // Optional refs for scrolling - passed from parent
    messagesEndRef?: React.RefObject<HTMLDivElement | null>,
    shouldAutoScroll?: boolean,
    onNewMessage?: () => void
): MessageWindowState {
    const [visibleUserInputCount, setVisibleUserInputCount] = useState(VISIBLE_WINDOW_SIZE);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const prevSessionIdRef = useRef<string | null>(null);
    
    // Partial message state
    const [partialMessage, setPartialMessage] = useState("");
    const [showPartialMessage, setShowPartialMessage] = useState(false);
    const partialMessageRef = useRef("");
    
    // Get session info from store for pagination
    const sessionInfo = useAppStore((state) => sessionId ? state.sessions[sessionId] : null);
    const hasMoreFromServer = sessionInfo?.hasMoreHistory ?? false;
    const historyBefore = sessionInfo?.historyBefore;
    const isLoadingFromServer = sessionInfo?.isLoadingHistory ?? false;
    const fetchSessionHistory = useAppStore((state) => state.fetchSessionHistory);

    const userInputIndices = useMemo(() => getUserInputIndices(messages), [messages]);
    const totalUserInputs = userInputIndices.length;

    // Reset window state on session change
    useEffect(() => {
        if (sessionId !== prevSessionIdRef.current) {
            setVisibleUserInputCount(VISIBLE_WINDOW_SIZE);
            setIsLoadingHistory(false);
            prevSessionIdRef.current = sessionId;
        }
    }, [sessionId]);

    const { visibleMessages, visibleStartIndex } = useMemo(() => {
        if (messages.length === 0) {
            return { visibleMessages: [], visibleStartIndex: 0 };
        }

        const startIndex = calculateVisibleStartIndex(messages, visibleUserInputCount);

        // Filter out system messages (they are shown as part of agent init, not in chat)
        const filteredMessages = messages.filter(() => true);

        const visible: IndexedMessage[] = filteredMessages
            .slice(startIndex)
            .map((message, idx) => ({
                originalIndex: startIndex + idx,
                message,
            }));

        return { visibleMessages: visible, visibleStartIndex: startIndex };
    }, [messages, visibleUserInputCount, permissionRequests.length]);

    const hasMoreHistory = visibleStartIndex > 0;

    const loadMoreMessages = useCallback(() => {
        // If we have more history from the server and not currently loading, fetch more
        if (sessionId && hasMoreFromServer && !isLoadingFromServer && !isLoadingHistory) {
            fetchSessionHistory(sessionId, LOAD_BATCH_SIZE, historyBefore);
            setIsLoadingHistory(true);
            return;
        }
        
        // Otherwise, just show more messages from local buffer
        if (!hasMoreHistory || isLoadingHistory) return;

        setIsLoadingHistory(true);

        requestAnimationFrame(() => {
            setVisibleUserInputCount((prev) => Math.min(prev + LOAD_BATCH_SIZE, totalUserInputs, MAX_VISIBLE_MESSAGES));

            setTimeout(() => {
                setIsLoadingHistory(false);
            }, 100);
        });
    }, [hasMoreHistory, isLoadingHistory, totalUserInputs, sessionId, hasMoreFromServer, isLoadingFromServer, historyBefore, fetchSessionHistory]);

    const resetToLatest = useCallback(() => {
        setVisibleUserInputCount(VISIBLE_WINDOW_SIZE);
    }, []);

    // Handle partial streaming tokens for assistant responses
    const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
        if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

        const message = partialEvent.payload.message as StreamEventMessage;
        const event = message.event;

        if (event.type === "content_block_start") {
            partialMessageRef.current = "";
            setPartialMessage(partialMessageRef.current);
            setShowPartialMessage(true);
        }

        if (event.type === "content_block_delta" && event.delta) {
            const text = event.delta.text || event.delta.reasoning || "";
            partialMessageRef.current += text;
            setPartialMessage(partialMessageRef.current);
            if (shouldAutoScroll && messagesEndRef?.current) {
                messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            } else if (onNewMessage) {
                onNewMessage();
            }
        }

        if (event.type === "content_block_stop") {
            setShowPartialMessage(false);
            setTimeout(() => {
                partialMessageRef.current = "";
                setPartialMessage(partialMessageRef.current);
            }, PARTIAL_MESSAGE_RESET_DELAY_MS);
        }
    }, [shouldAutoScroll, messagesEndRef, onNewMessage]);

    const visibleUserInputs = useMemo(() => {
        return visibleMessages.filter((item) => item.message.type === "user_prompt").length;
    }, [visibleMessages]);

    return {
        visibleMessages,
        hasMoreHistory,
        isLoadingHistory,
        isAtBeginning: !hasMoreHistory && messages.length > 0,
        loadMoreMessages,
        resetToLatest,
        totalMessages: messages.length,
        totalUserInputs,
        visibleUserInputs,
        // Partial message handling
        partialMessage,
        showPartialMessage,
        handlePartialMessages,
    };
}
