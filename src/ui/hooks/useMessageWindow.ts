import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ServerEvent, StreamMessage } from "../types";

const PARTIAL_MESSAGE_RESET_DELAY_MS = 500;
const INITIAL_VISIBLE_HISTORY_COUNT = 50;
const HISTORY_PAGE_SIZE = 50;

type StreamEventMessage = {
  type: "stream_event";
  event: { type: string; delta?: { text?: string; reasoning?: string } };
};

type AssistantDeltaMessage = {
  type: "assistant";
  content?: string;
  uuid?: string;
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
  const partialFlushRafRef = useRef<number | null>(null);
  const shouldFlushPartialMessageRef = useRef(false);
  const shouldFlushPartialReasoningRef = useRef(false);
  const shouldNotifyPartialUpdateRef = useRef(false);

  const cancelPendingPartialFlush = useCallback(() => {
    if (partialFlushRafRef.current) {
      window.cancelAnimationFrame(partialFlushRafRef.current);
      partialFlushRafRef.current = null;
    }
    shouldFlushPartialMessageRef.current = false;
    shouldFlushPartialReasoningRef.current = false;
    shouldNotifyPartialUpdateRef.current = false;
  }, []);

  const flushPendingPartialNow = useCallback(() => {
    if (partialFlushRafRef.current) {
      window.cancelAnimationFrame(partialFlushRafRef.current);
      partialFlushRafRef.current = null;
    }

    const shouldFlushMessage = shouldFlushPartialMessageRef.current;
    const shouldFlushReasoning = shouldFlushPartialReasoningRef.current;

    shouldFlushPartialMessageRef.current = false;
    shouldFlushPartialReasoningRef.current = false;
    shouldNotifyPartialUpdateRef.current = false;

    if (shouldFlushMessage) {
      setPartialMessage(partialMessageRef.current);
    }

    if (shouldFlushReasoning) {
      setPartialReasoning(partialReasoningRef.current);
    }
  }, []);

  useEffect(() => {
    if (partialResetTimeoutRef.current) {
      window.clearTimeout(partialResetTimeoutRef.current);
      partialResetTimeoutRef.current = null;
    }
    cancelPendingPartialFlush();
    partialMessageRef.current = "";
    partialReasoningRef.current = "";
    setPartialMessage("");
    setPartialReasoning("");
    setShowPartialMessage(false);
    setVisibleHistoryCount(INITIAL_VISIBLE_HISTORY_COUNT);
  }, [cancelPendingPartialFlush, sessionId]);

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
      cancelPendingPartialFlush();
    };
  }, [cancelPendingPartialFlush]);

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

  const schedulePartialFlush = useCallback(
    ({ message = false, reasoning = false, notify = false } = {}) => {
      shouldFlushPartialMessageRef.current ||= message;
      shouldFlushPartialReasoningRef.current ||= reasoning;
      shouldNotifyPartialUpdateRef.current ||= notify;

      if (partialFlushRafRef.current) {
        return;
      }

      partialFlushRafRef.current = window.requestAnimationFrame(() => {
        partialFlushRafRef.current = null;

        const shouldFlushMessage = shouldFlushPartialMessageRef.current;
        const shouldFlushReasoning = shouldFlushPartialReasoningRef.current;
        const shouldNotify = shouldNotifyPartialUpdateRef.current;

        shouldFlushPartialMessageRef.current = false;
        shouldFlushPartialReasoningRef.current = false;
        shouldNotifyPartialUpdateRef.current = false;

        if (shouldFlushMessage) {
          setPartialMessage(partialMessageRef.current);
        }

        if (shouldFlushReasoning) {
          setPartialReasoning(partialReasoningRef.current);
        }

        if (shouldNotify) {
          if (shouldAutoScroll) {
            performAutoScroll("auto");
          } else if (onNewMessage) {
            onNewMessage();
          }
        }
      });
    },
    [onNewMessage, performAutoScroll, shouldAutoScroll]
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
      if (partialEvent.type === "stream.user_prompt" && partialEvent.payload.sessionId === sessionId) {
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
          partialResetTimeoutRef.current = null;
        }
        cancelPendingPartialFlush();
        partialMessageRef.current = "";
        partialReasoningRef.current = "";
        setPartialMessage("");
        setPartialReasoning("");
        setShowPartialMessage(false);
        return;
      }

      if (
        partialEvent.type === "session.status" &&
        partialEvent.payload.sessionId === sessionId &&
        (partialEvent.payload.status === "idle" || partialEvent.payload.status === "error")
      ) {
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
          partialResetTimeoutRef.current = null;
        }
        cancelPendingPartialFlush();
        partialMessageRef.current = "";
        partialReasoningRef.current = "";
        setPartialMessage("");
        setPartialReasoning("");
        setShowPartialMessage(false);
        return;
      }

      if (partialEvent.type !== "stream.message" || partialEvent.payload.sessionId !== sessionId) {
        return;
      }

      if (partialEvent.payload.message.type === "result") {
        setShowPartialMessage(false);
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
        }
        flushPendingPartialNow();
        partialResetTimeoutRef.current = window.setTimeout(() => {
          partialMessageRef.current = "";
          setPartialMessage("");
          partialResetTimeoutRef.current = null;
        }, PARTIAL_MESSAGE_RESET_DELAY_MS);
        return;
      }

      if (partialEvent.payload.message.type === "assistant") {
        const message = partialEvent.payload.message as AssistantDeltaMessage;
        const deltaText = typeof message.content === "string" ? message.content : "";
        if (!deltaText) return;

        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
          partialResetTimeoutRef.current = null;
        }

        partialMessageRef.current += deltaText;
        setShowPartialMessage(true);
        schedulePartialFlush({ message: true, notify: true });
        return;
      }

      if (partialEvent.payload.message.type !== "stream_event") {
        return;
      }

      const message = partialEvent.payload.message as StreamEventMessage;
      const event = message.event;

      if (event.type === "content_block_start") {
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
          partialResetTimeoutRef.current = null;
        }
        cancelPendingPartialFlush();
        partialMessageRef.current = "";
        setPartialMessage("");
        setShowPartialMessage(true);
        performAutoScroll("auto");
      }

      if (event.type === "content_block_delta" && event.delta) {
        const deltaText = event.delta.text || "";
        const reasoningText = event.delta.reasoning || "";

        if (reasoningText) {
          partialReasoningRef.current += reasoningText;
          schedulePartialFlush({ reasoning: true, notify: true });
        }

        if (deltaText && !reasoningText) {
          partialMessageRef.current += deltaText;
          schedulePartialFlush({ message: true, notify: true });
        }
      }

      if (event.type === "content_block_stop") {
        setShowPartialMessage(false);
        if (partialResetTimeoutRef.current) {
          window.clearTimeout(partialResetTimeoutRef.current);
        }
        flushPendingPartialNow();
        partialResetTimeoutRef.current = window.setTimeout(() => {
          partialMessageRef.current = "";
          setPartialMessage("");
          partialResetTimeoutRef.current = null;
        }, PARTIAL_MESSAGE_RESET_DELAY_MS);
      }
    },
    [cancelPendingPartialFlush, flushPendingPartialNow, performAutoScroll, schedulePartialFlush, sessionId]
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
