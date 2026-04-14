import { memo, useCallback, useEffect, useState } from "react";
import { useAppStore } from "../../../../store/useAppStore";
import type { ZohoEmail } from "../../../../types";
import { EmailInboxModal } from "../../../email/components/EmailInboxModal";
import { NewMailPipelineSetting, ResumeSessionDialog } from "../index";
import type { AutoSyncProcessingMode } from "../../types";
// veraLogo kept for future use
// import veraLogo from "../../../../assets/vera-logo.svg";
import { SessionsTab } from "../SessionsTab";

export interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
  onOpenSchedules?: () => void;
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onConnectEmail: () => void;
  onDisconnectEmail: () => void;
  isEmailConnected: boolean;
  refetchEmails: () => void;
  emails: ZohoEmail[];
  onUseEmailAsInput: (email: ZohoEmail) => void;
  isProcessingEmailInput?: boolean;
  isFetchingEmails: boolean;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  autoSyncAgentIds: string[];
  onAddAutoSyncAgent: (agentId: string) => void;
  onRemoveAutoSyncAgent: (agentId: string) => void;
  autoSyncRoutingRules: { fromPattern: string; agentId: string }[];
  onAddAutoSyncRoutingRule: (fromPattern: string, agentId: string) => void;
  onRemoveAutoSyncRoutingRule: (index: number) => void;
  autoSyncSinceDate: string;
  onSetAutoSyncSinceDate: (date: string) => void;
  autoSyncProcessingMode: AutoSyncProcessingMode;
  onSetAutoSyncProcessingMode: (mode: AutoSyncProcessingMode) => void;
  autoSyncMarkAsRead: boolean;
  onSetAutoSyncMarkAsRead: (enabled: boolean) => void;
  autoSyncAccountId: string;
  autoSyncFolderId: string;
  onRunAutoSyncNow: () => Promise<void>;
  onRefreshEmailMailbox?: () => void | Promise<unknown>;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  processingEmailId?: string | null;
  awaitingConversationEmailId?: string | null;
  errorEmailId?: string | null;
  newlyCreatedConversations?: Map<string, { conversationId: string; agentId?: string }>;
  onOpenSettings?: () => void;
  onOpenConfiguration?: () => void;
  onOpenSkills?: () => void;
  // Pagination props
  hasMoreEmails?: boolean;
  isLoadingMoreEmails?: boolean;
  onLoadMoreEmails?: () => void;
  // Auth props
  userEmail?: string;
  onLogout?: () => void;
}

export const Sidebar = memo(function Sidebar({
  onNewSession,
  lettaEnvOpen: _lettaEnvOpen,
  onLettaEnvOpenChange: _onLettaEnvOpenChange,
  onDeleteSession,
  onConnectEmail: _onConnectEmail,
  onDisconnectEmail: _onDisconnectEmail,
  isEmailConnected,
  refetchEmails,
  emails,
  onUseEmailAsInput,
  isProcessingEmailInput,
  isFetchingEmails,
  autoSyncEnabled: _autoSyncEnabled,
  onToggleAutoSync: _onToggleAutoSync,
  autoSyncAgentIds,
  onAddAutoSyncAgent,
  onRemoveAutoSyncAgent,
  autoSyncRoutingRules,
  onAddAutoSyncRoutingRule,
  onRemoveAutoSyncRoutingRule,
  autoSyncSinceDate,
  onSetAutoSyncSinceDate,
  autoSyncProcessingMode,
  onSetAutoSyncProcessingMode,
  autoSyncMarkAsRead,
  onSetAutoSyncMarkAsRead,
  autoSyncAccountId,
  autoSyncFolderId,
  onRunAutoSyncNow,
  onRefreshEmailMailbox,
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  awaitingConversationEmailId,
  errorEmailId,
  newlyCreatedConversations,
  onOpenSettings: _onOpenSettings,
  onOpenConfiguration,
  onOpenSkills,
  onOpenSchedules,
  hasMoreEmails,
  isLoadingMoreEmails,
  onLoadMoreEmails,
  userEmail,
  onLogout,
}: SidebarProps) {
  const coworkSettings = useAppStore((state) => state.coworkSettings);

  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);

  useEffect(() => {
    if (!isEmailConnected) {
      setShowEmailView(false);
    }
  }, [isEmailConnected]);

  // unreadCount kept for potential future use in sidebar badges
  const _unreadCount = emails.filter((email) => {
    const status = String(email.status ?? "").toLowerCase();
    const status2 = String(email.status2 ?? "").toLowerCase();
    return (
      status.includes("unread") ||
      status2.includes("unread") ||
      status === "0" ||
      status2 === "0"
    );
  }).length;
  void _unreadCount;

  const handleOpenEmailView = useCallback(() => {
    setShowEmailView(true);
  }, []);

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)]/98 backdrop-blur-sm">

      {/* Top nav — Skills / Emails / Configuration (below traffic lights) */}
      <div className="pt-8 px-3 pb-2 flex flex-col gap-0.5">
        <button
          onClick={onOpenSkills}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-ink-700 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
        >
          <svg className="h-[18px] w-[18px] shrink-0 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Skills
        </button>
        <button
          onClick={onOpenSchedules}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-ink-700 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
        >
          <svg className="h-[18px] w-[18px] shrink-0 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Schedules
        </button>
        <button
          onClick={handleOpenEmailView}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-ink-700 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
        >
          <svg className="h-[18px] w-[18px] shrink-0 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          Emails
        </button>
        <button
          onClick={onOpenConfiguration}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-ink-700 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
        >
          <svg className="h-[18px] w-[18px] shrink-0 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configuration
        </button>
      </div>

      {/* Conversations list — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SessionsTab
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          onResumeSession={setResumeSessionId}
          onOpenEmailView={handleOpenEmailView}
          coworkSettings={coworkSettings}
          emails={emails}
        />
      </div>

      <ResumeSessionDialog
        open={!!resumeSessionId}
        resumeSessionId={resumeSessionId}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setResumeSessionId(null);
          }
        }}
      />

      <NewMailPipelineSetting
        open={showAddAgentsModal}
        onOpenChange={setShowAddAgentsModal}
        autoSyncAgentIds={autoSyncAgentIds}
        onAddAutoSyncAgent={onAddAutoSyncAgent}
        onRemoveAutoSyncAgent={onRemoveAutoSyncAgent}
        autoSyncRoutingRules={autoSyncRoutingRules}
        onAddAutoSyncRoutingRule={onAddAutoSyncRoutingRule}
        onRemoveAutoSyncRoutingRule={onRemoveAutoSyncRoutingRule}
        autoSyncSinceDate={autoSyncSinceDate}
        onSetAutoSyncSinceDate={onSetAutoSyncSinceDate}
        autoSyncProcessingMode={autoSyncProcessingMode}
        onSetAutoSyncProcessingMode={onSetAutoSyncProcessingMode}
        autoSyncMarkAsRead={autoSyncMarkAsRead}
        onSetAutoSyncMarkAsRead={onSetAutoSyncMarkAsRead}
        accountId={autoSyncAccountId}
        folderId={autoSyncFolderId}
        onRunAutoSyncNow={onRunAutoSyncNow}
        onRefreshEmailMailbox={onRefreshEmailMailbox}
      />

      {/* User Section */}
      {userEmail && (
        <div className="mt-auto flex-shrink-0 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-sm font-medium">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-ink-900 truncate max-w-[150px]">
                  {userEmail}
                </span>
                <span className="text-[10px] text-ink-500">Logged in</span>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-xs text-ink-500 hover:text-ink-700 hover:bg-ink-900/5 px-2 py-1 rounded transition"
                title="Logout"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}

      {/* Email Inbox Modal */}
      <EmailInboxModal
        open={showEmailView}
        onOpenChange={setShowEmailView}
        emails={emails}
        isFetching={isFetchingEmails}
        onUseEmailAsInput={onUseEmailAsInput}
        isProcessingEmailInput={isProcessingEmailInput}
        selectedAgentId={selectedAgentId}
        onProcessEmailToAgent={onProcessEmailToAgent}
        processingEmailId={processingEmailId}
        awaitingConversationEmailId={awaitingConversationEmailId}
        errorEmailId={errorEmailId}
        newlyCreatedConversations={newlyCreatedConversations}
        onRefresh={refetchEmails}
        hasMore={hasMoreEmails}
        isLoadingMore={isLoadingMoreEmails}
        onLoadMore={onLoadMoreEmails}
        accountId={autoSyncAccountId || undefined}
        folderId={autoSyncFolderId || undefined}
      />
    </aside>
  );
});
