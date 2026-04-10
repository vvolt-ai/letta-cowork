import { useState, useCallback, useRef, useEffect } from "react";
import type { ZohoEmail, SessionInfo } from "../../../../../types";
import { useAppStore } from "../../../../../store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import {
  SCROLL_THRESHOLD,
  DEFAULT_LIST_WIDTH,
  clampListWidth,
  type ProcessedEmailData,
} from "../../../types";

interface UseEmailInboxProps {
  open: boolean;
  accountId?: string;
  folderId?: string;
  emails: ZohoEmail[];
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string, additionalInstructions?: string) => void;
  newlyCreatedConversations?: Map<string, { conversationId: string; agentId?: string }>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

interface UseEmailInboxReturn {
  // Selected email state
  localSelectedId: string | null;
  selectedEmail: ZohoEmail | undefined;
  localEmailDetails: unknown;
  localEmailDetailsError: string | null;
  isFetchingLocalContent: boolean;
  
  // Conversation state
  processedEmailsFromServer: Map<string, ProcessedEmailData>;
  viewingConversationId: string | null;
  
  // List resize state
  listWidth: number;
  isResizingList: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  
  // Handlers
  handleSelectEmail: (email: ZohoEmail) => Promise<void>;
  handleProcessEmailToAgent: (email: ZohoEmail, agentId: string, additionalInstructions?: string) => Promise<void>;
  handleViewConversation: (conversationId: string) => void;
  handleBackFromConversation: () => void;
  handleOpenInLetta: (conversationId: string, agentId?: string) => void;
  handleScroll: () => void;
  handleResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  
  // Utility functions
  isEmailProcessed: (email: ZohoEmail) => boolean;
  findConversationIdForEmail: (email: ZohoEmail) => string | null;
}

export function useEmailInbox({
  open,
  accountId,
  folderId,
  emails,
  onProcessEmailToAgent,
  newlyCreatedConversations,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: UseEmailInboxProps): UseEmailInboxReturn {
  // Selection state
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [localEmailDetails, setLocalEmailDetails] = useState<unknown>(null);
  const [localEmailDetailsError, setLocalEmailDetailsError] = useState<string | null>(null);
  const [isFetchingLocalContent, setIsFetchingLocalContent] = useState(false);
  
  // Processed emails state
  const [processedEmailsFromServer, setProcessedEmailsFromServer] = useState<Map<string, ProcessedEmailData>>(new Map());
  
  // Conversation view state
  const [viewingConversationId, setViewingConversationId] = useState<string | null>(null);
  
  // List resize state
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const [isResizingList, setIsResizingList] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Get session data from store
  const sessions = useAppStore(useShallow((state) => state.sessions)) as Record<string, SessionInfo>;

  // Get selected email
  const selectedEmail = emails.find(e => e.messageId === localSelectedId);

  // Load processed emails from server when modal opens
  useEffect(() => {
    if (open && accountId && folderId) {
      window.electron.getProcessedEmailDetailsFromServer(accountId, folderId)
        .then((records) => {
          console.log(`[EmailInboxModal] Loaded ${records.length} processed emails from server:`, records);
          const map = new Map<string, ProcessedEmailData>();
          let noConversationCount = 0;
          for (const record of records) {
            if (record.conversationId) {
              map.set(record.messageId, {
                conversationId: record.conversationId,
                agentId: record.agentId ?? undefined,
              });
            } else {
              noConversationCount++;
              console.log(`[EmailInboxModal] Email ${record.messageId} processed but no conversationId - can reprocess`);
            }
          }
          setProcessedEmailsFromServer(map);
          console.log(`[EmailInboxModal] ${map.size} emails have conversationId, ${noConversationCount} can be reprocessed`);
        })
        .catch((err) => {
          console.warn(`[EmailInboxModal] Failed to load from server:`, err);
        });
    }
  }, [open, accountId, folderId]);

  // Clear processed emails when modal closes
  useEffect(() => {
    if (!open) {
      setProcessedEmailsFromServer(new Map());
    }
  }, [open]);

  // Update local state when new conversations are created
  useEffect(() => {
    console.log(`[EmailInboxModal] Effect running, newlyCreatedConversations:`, newlyCreatedConversations);
    if (newlyCreatedConversations && newlyCreatedConversations.size > 0) {
      console.log(`[EmailInboxModal] Received ${newlyCreatedConversations.size} newly created conversations`);
      setProcessedEmailsFromServer(prev => {
        const newMap = new Map(prev);
        newlyCreatedConversations.forEach((value, messageId) => {
          if (value.conversationId) {
            newMap.set(messageId, value);
            console.log(`[EmailInboxModal] Updated email ${messageId} with conversationId ${value.conversationId}`);
          }
        });
        console.log(`[EmailInboxModal] After update, map size: ${newMap.size}`);
        return newMap;
      });
    }
  }, [newlyCreatedConversations]);

  // Resize effect
  useEffect(() => {
    if (!isResizingList) return;

    const handleMouseMove = (event: MouseEvent) => {
      setListWidth(clampListWidth(event.clientX));
    };

    const handleMouseUp = () => {
      setIsResizingList(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingList]);

  // Clear local state when modal closes
  useEffect(() => {
    if (!open) {
      setLocalSelectedId(null);
      setLocalEmailDetails(null);
      setLocalEmailDetailsError(null);
      setViewingConversationId(null);
    }
  }, [open]);

  // Check if an email is already processed
  const isEmailProcessed = useCallback((email: ZohoEmail) => {
    const messageId = String(email.messageId);
    const serverData = processedEmailsFromServer.get(messageId);
    const isProcessed = !!(serverData?.conversationId);
    console.log(`[EmailInboxModal] isEmailProcessed(${messageId}): ${isProcessed}, serverData:`, serverData);
    return isProcessed;
  }, [processedEmailsFromServer]);

  // Find conversation ID for a processed email
  const findConversationIdForEmail = useCallback((email: ZohoEmail): string | null => {
    const messageId = String(email.messageId);

    // Check server data
    const serverData = processedEmailsFromServer.get(messageId);
    if (serverData?.conversationId) {
      return serverData.conversationId;
    }

    // Fallback: check local sessions by title matching
    const emailSubject = email.subject || messageId;
    for (const session of Object.values(sessions)) {
      const isEmailRelatedSession = session.isEmailSession || session.title?.startsWith("Email:");
      if (isEmailRelatedSession && session.title?.includes(emailSubject)) {
        return session.id;
      }
    }
    return null;
  }, [sessions, processedEmailsFromServer]);

  // Handle process email to agent
  const handleProcessEmailToAgent = useCallback(async (email: ZohoEmail, agentId: string, additionalInstructions?: string) => {
    if (!onProcessEmailToAgent) return;

    await onProcessEmailToAgent(email, agentId, additionalInstructions);

    // Update local state to mark as processed immediately
    const messageId = String(email.messageId);
    setProcessedEmailsFromServer(prev => {
      const newMap = new Map(prev);
      newMap.set(messageId, { conversationId: '', agentId });
      return newMap;
    });
  }, [onProcessEmailToAgent]);

  // Handle view conversation
  const handleViewConversation = useCallback((conversationId: string) => {
    setViewingConversationId(conversationId);
  }, []);

  // Handle back from conversation view
  const handleBackFromConversation = useCallback(() => {
    setViewingConversationId(null);
  }, []);

  // Handle open in Letta
  const handleOpenInLetta = useCallback((conversationId: string, agentId?: string) => {
    const session = sessions[conversationId];
    const effectiveAgentId = agentId || session?.agentId;
    if (!effectiveAgentId) return;
    const lettaUrl = `https://app.letta.com/projects/default-project/agents/${effectiveAgentId}?conversation=${conversationId}`;
    window.electron.openExternal(lettaUrl);
  }, [sessions]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !onLoadMore || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isNearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  // Handle email selection
  const handleSelectEmail = useCallback(async (email: ZohoEmail) => {
    setViewingConversationId(null);
    setLocalSelectedId(email.messageId);
    setLocalEmailDetails(null);
    setLocalEmailDetailsError(null);
    setIsFetchingLocalContent(true);

    try {
      const details = await window.electron.fetchEmailById(
        email.accountId || '',
        email.folderId || '',
        email.messageId
      );
      setLocalEmailDetails(details);
    } catch (err) {
      console.error("Failed to fetch email details:", err);
      setLocalEmailDetailsError("Failed to load email content");
    } finally {
      setIsFetchingLocalContent(false);
    }
  }, []);

  // Handle resize start
  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingList(true);
  }, []);

  return {
    localSelectedId,
    selectedEmail,
    localEmailDetails,
    localEmailDetailsError,
    isFetchingLocalContent,
    processedEmailsFromServer,
    viewingConversationId,
    listWidth,
    isResizingList,
    scrollContainerRef,
    handleSelectEmail,
    handleProcessEmailToAgent,
    handleViewConversation,
    handleBackFromConversation,
    handleOpenInLetta,
    handleScroll,
    handleResizeStart,
    isEmailProcessed,
    findConversationIdForEmail,
  };
}
