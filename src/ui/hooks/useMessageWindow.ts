import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerEvent, StreamMessage } from "../types";

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
  totalMessages: number;
  partialMessage: string;
  showPartialMessage: boolean;
  handlePartialMessages: (event: ServerEvent) => void;
}

export function useMessageWindow(
  messages: StreamMessage[],
  sessionId: string | null,
  messagesEndRef?: React.RefObject<HTMLDivElement | null>,
  shouldAutoScroll?: boolean,
  onNewMessage?: () => void
): MessageWindowState {
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const partialMessageRef = useRef("");

  useEffect(() => {
    partialMessageRef.current = "";
    setPartialMessage("");
    setShowPartialMessage(false);
  }, [sessionId]);

  const visibleMessages = useMemo<IndexedMessage[]>(
    () => messages.map((message, index) => ({ originalIndex: index, message })),
    [messages]
  );

  const handlePartialMessages = useCallback(
    (partialEvent: ServerEvent) => {
      if (
        partialEvent.type !== "stream.message" ||
        partialEvent.payload.message.type !== "stream_event"
      ) {
        return;
      }

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
    },
    [messagesEndRef, onNewMessage, shouldAutoScroll]
  );

  return {
    visibleMessages,
    totalMessages: messages.length,
    partialMessage,
    showPartialMessage,
    handlePartialMessages,
  };
}
