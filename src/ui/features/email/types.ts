import type { ZohoEmail } from "../../types";
import type { ProcessedUnreadEmailDebugInfo } from "../../../electron/services/settings/index.js";

/**
 * Email Inbox Types
 */

export type AutoSyncProcessingMode = "unread_only" | "today_all";

export interface RoutingRule {
  fromPattern: string;
  agentId: string;
}

export interface NewMailPipelineSettingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoSyncAgentIds: string[];
  onAddAutoSyncAgent: (agentId: string) => void;
  onRemoveAutoSyncAgent: (agentId: string) => void;
  autoSyncRoutingRules: RoutingRule[];
  onAddAutoSyncRoutingRule: (fromPattern: string, agentId: string) => void;
  onRemoveAutoSyncRoutingRule: (index: number) => void;
  autoSyncSinceDate: string;
  onSetAutoSyncSinceDate: (date: string) => void;
  autoSyncProcessingMode: AutoSyncProcessingMode;
  onSetAutoSyncProcessingMode: (mode: AutoSyncProcessingMode) => void;
  autoSyncMarkAsRead: boolean;
  onSetAutoSyncMarkAsRead: (enabled: boolean) => void;
  accountId: string;
  folderId: string;
  onRunAutoSyncNow: () => Promise<void>;
  onRefreshEmailMailbox?: () => void | Promise<unknown>;
}

export interface SettingsSectionProps {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export interface ProcessedEmailEntry {
  id: string;
  processedAt: number;
}

export type { ProcessedUnreadEmailDebugInfo };

export interface EmailInboxModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emails: ZohoEmail[];
  isFetching: boolean;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  isProcessingEmailInput?: boolean;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string, additionalInstructions?: string) => void;
  processingEmailId?: string | null;
  awaitingConversationEmailId?: string | null;
  errorEmailId?: string | null;
  newlyCreatedConversations?: Map<string, { conversationId: string; agentId?: string }>;
  onRefresh?: () => void;
  onSearch?: (query: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  accountId?: string;
  folderId?: string;
}

export interface ProcessedEmailData {
  conversationId: string;
  agentId?: string;
}

export interface EmailPreviewData {
  localEmailDetails: unknown;
  localEmailDetailsError: string | null;
  isFetchingLocalContent: boolean;
}

export interface EmailListState {
  localSelectedId: string | null;
  viewingConversationId: string | null;
  listWidth: number;
  isResizingList: boolean;
}

/**
 * Email Helper Functions
 */

export const SCROLL_THRESHOLD = 50;
export const DEFAULT_LIST_WIDTH = 420;
export const MIN_LIST_WIDTH = 320;
export const MAX_LIST_WIDTH = 620;

export const clampListWidth = (value: number) => 
  Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, value));

export const isUnreadEmail = (email: ZohoEmail) => {
  const status = String(email.status ?? "").toLowerCase();
  const status2 = String(email.status2 ?? "").toLowerCase();
  return (
    status.includes("unread") ||
    status2.includes("unread") ||
    status === "0" ||
    status2 === "0"
  );
};

export const extractContent = (details: unknown) => {
  if (!details || typeof details !== "object") return "";
  const data = (details as any).data ?? details;
  return (
    data?.content ??
    data?.htmlContent ??
    data?.message ??
    data?.summary ??
    ""
  );
};

export const isHtmlContent = (content: string) => 
  /<\/?[a-z][\s\S]*>/i.test(content);

export const formatDate = (timestamp: string) => {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
