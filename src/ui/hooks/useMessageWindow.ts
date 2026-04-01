import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerEvent, StreamMessage } from "../types";

const PARTIAL_MESSAGE_RESET_DELAY_MS = 500;
const INITIAL_VISIBLE_HISTORY_COUNT = 50;
const HISTORY_PAGE_SIZE = 50;

type StreamEventMessage = {
  type: "stream_event";
  event: { type: string; delta?: { text?: string; reasoning?: string } };
};

const getMessageTimestamp = (message: StreamMessage): number => {
  const candidate = (message as { createdAt?: number }).createdAt;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
};

export interface IndexedMessage {
  originalIndex: number;
  message: StreamMessage;
}

export interface MessageWindowState {
  visibleMessages: IndexedMessage[];
  totalMessages: number;
  hasMoreHistory: boolean;
  visibleHistoryCount: number;
  partialMessage: string;
  showPartialMessage: boolean;
  partialReasoning: string;
  handlePartialMessages: (event: ServerEvent) => void;
  loadMoreHistory: () => void;
}

export function useMessageWindow(
  messages: StreamMessage[],
  sessionId: string | null,
  messagesEndRef?: React.RefObject<HTMLDivElement | null>,
  shouldAutoScroll?: boolean,
  onNewMessage?: () => void,
  scheduleScrollToBottom?: (behavior?: ScrollBehavior) => void
): MessageWindowState {
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [partialReasoning, setPartialReasoning] = useState("");
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(INITIAL_VISIBLE_HISTORY_COUNT);
  const partialMessageRef = useRef("");
  const partialReasoningRef = useRef("");
  const partialResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (partialResetTimeoutRef.current) {
      window.clearTimeout(partialResetTimeoutRef.current);
      partialResetTimeoutRef.current = null;
    }
    partialMessageRef.current = "";
    partialReasoningRef.current = "";
    setPartialMessage("");
    setPartialReasoning("");
    setShowPartialMessage(false);
    setVisibleHistoryCount(INITIAL_VISIBLE_HISTORY_COUNT);
  }, [sessionId]);

  useEffect(() => {
    if (messages.length <= INITIAL_VISIBLE_HISTORY_COUNT) {
      setVisibleHistoryCount(INITIAL_VISIBLE_HISTORY_COUNT);
    }
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (partialResetTimeoutRef.current) {
        window.clearTimeout(partialResetTimeoutRef.current);
      }
    };
  }, []);

  const performAutoScroll = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (scheduleScrollToBottom) {
        scheduleScrollToBottom(behavior);
        return;
      }

      if (messagesEndRef?.current) {
        messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
      }
    },
    [messagesEndRef, scheduleScrollToBottom]
  );

  const orderedMessages = useMemo(
    () => messages
      .map((message, index) => ({ originalIndex: index, message }))
      .sort((a, b) => {
        const timestampDelta = getMessageTimestamp(a.message) - getMessageTimestamp(b.message);
        if (timestampDelta !== 0) return timestampDelta;
        return a.originalIndex - b.originalIndex;
      }),
    [messages]
  );

  const visibleMessages = useMemo<IndexedMessage[]>(() => {
    const startIndex = Math.max(0, orderedMessages.length - visibleHistoryCount);
    return orderedMessages.slice(startIndex);
  }, [orderedMessages, visibleHistoryCount]);

  const hasMoreHistory = orderedMessages.length > visibleMessages.length;

  const loadMoreHistory = useCallback(() => {
    setVisibleHistoryCount((current) => current + HISTORY_PAGE_SIZE);
  }, []);

  const handlePartialMessages = useCallback(
    (partialEvent: ServerEvent) => {
      if (
        partialEvent.type !== "stream.message" ||
        partialEvent.payload.sessionId !== sessionId ||
        partialEvent.payload.message.type !== "stream_event"
      ) {
        return;
      }

      const message = partialEvent.payload.message as StreamEventMessage;
      const event = message.event;

      if (event.type === "content_block_start") {
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
          partialResetTimeoutRef.current = null;
        }
        partialMessageRef.current = "";
        partialReasoningRef.current = "";
        setPartialMessage("");
        setPartialReasoning("");
        setShowPartialMessage(true);
        performAutoScroll("auto");
      }

      if (event.type === "content_block_delta" && event.delta) {
        const deltaText = event.delta.text || "";
        const reasoningText = event.delta.reasoning || "";

        if (reasoningText) {
          partialReasoningRef.current += reasoningText;
          setPartialReasoning(partialReasoningRef.current);
        }

        if (deltaText && !reasoningText) {
          partialMessageRef.current += deltaText;
          setPartialMessage(partialMessageRef.current);
        }

        if (shouldAutoScroll) {
          performAutoScroll("auto");
        } else if (onNewMessage) {
          onNewMessage();
        }
      }

      if (event.type === "content_block_stop") {
        setShowPartialMessage(false);
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
        }
        partialResetTimeoutRef.current = window.setTimeout(() => {
          partialMessageRef.current = "";
          partialReasoningRef.current = "";
          setPartialMessage("");
          setPartialReasoning("");
          partialResetTimeoutRef.current = null;
        }, PARTIAL_MESSAGE_RESET_DELAY_MS);
      }
    },
    [onNewMessage, performAutoScroll, sessionId, shouldAutoScroll]
  );

  return {
    visibleMessages,
    totalMessages: messages.length,
    hasMoreHistory,
    visibleHistoryCount,
    partialMessage,
    showPartialMessage,
    partialReasoning,
    handlePartialMessages,
    loadMoreHistory,
  };
}
