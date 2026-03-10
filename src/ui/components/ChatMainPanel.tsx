import React from "react";
import type { CanUseToolResponse, ClientEvent } from "../types";
import type { PermissionRequest } from "../store/useAppStore";
import type { IndexedMessage } from "../hooks/useMessageWindow";
import { PromptInput } from "./PromptInput";
import { MessageCard } from "./EventCard";
import MDContent from "../render/markdown";

interface ChatMainPanelProps {
  title?: string;
  activeSessionId: string | null;
  isRunning: boolean;
  permissionRequests: PermissionRequest[];
  visibleMessages: IndexedMessage[];
  hasMoreHistory: boolean;
  totalMessages: number;
  isLoadingHistory: boolean;
  partialMessage: string;
  showPartialMessage: boolean;
  hasNewMessages: boolean;
  shouldAutoScroll: boolean;
  onPermissionResult: (toolUseId: string, result: CanUseToolResponse) => void;
  onScroll: () => void;
  onScrollToBottom: () => void;
  onSendMessage: () => void;
  sendEvent: (event: ClientEvent) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  topSentinelRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  sidebarCollapsed?: boolean;
}

export function ChatMainPanel({
  title,
  activeSessionId,
  isRunning,
  permissionRequests,
  visibleMessages,
  hasMoreHistory,
  totalMessages,
  isLoadingHistory,
  partialMessage,
  showPartialMessage,
  hasNewMessages,
  shouldAutoScroll,
  onPermissionResult,
  onScroll,
  onScrollToBottom,
  onSendMessage,
  sendEvent,
  scrollContainerRef,
  topSentinelRef,
  messagesEndRef,
  sidebarCollapsed = false,
}: ChatMainPanelProps) {
  const marginLeft = sidebarCollapsed ? 'ml-16' : 'ml-[280px]';
  return (
    <main className={`flex flex-1 flex-col ${marginLeft} bg-surface-cream`}>
      <div
        className="flex items-center justify-center h-12 border-b border-ink-900/10 bg-surface-cream select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-ink-700">{title || "Letta Cowork"}</span>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-8 pb-40 pt-3"
      >
        <div className="mx-auto">
          <div ref={topSentinelRef} className="h-1" />

          {!hasMoreHistory && totalMessages > 0 && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <div className="h-px w-12 bg-ink-900/10" />
                <span>Beginning of conversation</span>
                <div className="h-px w-12 bg-ink-900/10" />
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading...</span>
              </div>
            </div>
          )}

          {visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-lg font-medium text-ink-700">No messages yet</div>
              <p className="mt-2 text-sm text-muted">Start a conversation with Letta Cowork</p>
            </div>
          ) : (
            visibleMessages.map((item, idx) => (
              <MessageCard
                key={`${activeSessionId}-msg-${item.originalIndex}`}
                message={item.message}
                isLast={idx === visibleMessages.length - 1}
                isRunning={isRunning}
                permissionRequest={permissionRequests[0]}
                onPermissionResult={onPermissionResult}
              />
            ))
          )}

          {partialMessage && (
            <div className="partial-message mt-4">
              <div className="header text-accent">Assistant</div>
              <MDContent text={partialMessage} />
            </div>
          )}
          {showPartialMessage && !partialMessage && (
            <div className="mt-3 flex flex-col gap-2 px-1">
              <div className="relative h-3 w-2/12 overflow-hidden rounded-full bg-ink-900/10">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <PromptInput sendEvent={sendEvent} onSendMessage={onSendMessage} disabled={visibleMessages.length === 0} />

      {hasNewMessages && !shouldAutoScroll && (
        <button
          onClick={onScrollToBottom}
          className={`fixed bottom-28 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:scale-105 animate-bounce-subtle ${sidebarCollapsed ? 'ml-8 left-[88px]' : 'ml-[140px] left-1/2'}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>New messages</span>
        </button>
      )}
    </main>
  );
}
