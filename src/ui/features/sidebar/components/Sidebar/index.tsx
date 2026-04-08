import { memo, useCallback, useEffect, useState } from "react";
import { useAppStore } from "../../../../store/useAppStore";
import { useDownloadSkill } from "../../../../hooks/useDownloadSkill";
import { SkillDownloadDialog } from "../../../settings/components/SkillDownloadDialog";
import type { ZohoEmail } from "../../../../types";
import { EmailInboxModal } from "../../../email/components/EmailInboxModal";
import { NewMailPipelineSetting, ResumeSessionDialog } from "../index";
import { LettaTerminal } from "../../../settings/components/LettaTerminal";
import * as Dialog from "@radix-ui/react-dialog";
import type { AutoSyncProcessingMode } from "../../types";
import veraLogo from "../../../../assets/vera-logo.svg";
import { SessionsTab } from "../SessionsTab";
import { ConfigurationTab } from "../ConfigurationTab";

export interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
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
  successEmailId?: string | null;
  newlyCreatedConversations?: Map<string, { conversationId: string; agentId?: string }>;
  onOpenSettings?: () => void;
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
  lettaEnvOpen,
  onLettaEnvOpenChange,
  onDeleteSession,
  onConnectEmail,
  onDisconnectEmail,
  isEmailConnected,
  refetchEmails,
  emails,
  onUseEmailAsInput,
  isProcessingEmailInput,
  isFetchingEmails,
  autoSyncEnabled,
  onToggleAutoSync,
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
  successEmailId,
  newlyCreatedConversations,
  onOpenSettings,
  hasMoreEmails,
  isLoadingMoreEmails,
  onLoadMoreEmails,
  userEmail,
  onLogout,
}: SidebarProps) {
  const coworkSettings = useAppStore((state) => state.coworkSettings);

  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
  const [showLettaCli, setShowLettaCli] = useState(false);
  const [activeTab, setActiveTab] = useState<"sessions" | "configuration">("sessions");

  const {
    skillUrl,
    setSkillUrl,
    skillName,
    setSkillName,
    skillDownloading,
    skillDownloadSuccess,
    skillDownloadError,
    handleDownloadSkill,
    resetForm: resetSkillForm,
  } = useDownloadSkill();

  useEffect(() => {
    if (!isEmailConnected) {
      setShowEmailView(false);
      setActiveTab("sessions");
    }
  }, [isEmailConnected]);

  const unreadCount = emails.filter((email) => {
    const status = String(email.status ?? "").toLowerCase();
    const status2 = String(email.status2 ?? "").toLowerCase();
    return (
      status.includes("unread") ||
      status2.includes("unread") ||
      status === "0" ||
      status2 === "0"
    );
  }).length;

  const unreadLabel = isEmailConnected ? `${unreadCount} unread` : "Not connected";

  const handleOpenEmailView = useCallback(() => {
    setShowEmailView(true);
    setActiveTab("configuration");
  }, []);

  const tabs: Array<{ id: "sessions" | "configuration"; label: string }> = [
    { id: "sessions", label: "Sessions" },
    { id: "configuration", label: "Configuration" },
  ];

  return (
    <aside className="flex h-full w-full flex-col gap-5 border-r border-[var(--color-border)] bg-[var(--color-sidebar)]/98 px-4 py-5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="mt-5 flex items-center gap-3">
          <img src={veraLogo} alt="Vera logo" className="h-6 w-auto" />
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Workspace</span>
            <h1 className="mt-1 text-sm font-semibold text-ink-900">Vera Cowork</h1>
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-600 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
          aria-label="Open settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/92 p-1.5 text-xs font-medium shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-full px-3 py-1 transition ${
              activeTab === tab.id
                ? "bg-[var(--color-accent)] text-white shadow-sm"
                : "text-ink-500 hover:bg-[var(--color-sidebar-hover)] hover:text-ink-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pt-1">
        {activeTab === "sessions" ? (
          <SessionsTab
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
            onResumeSession={setResumeSessionId}
            onOpenEmailView={handleOpenEmailView}
            coworkSettings={coworkSettings}
            emails={emails}
          />
        ) : (
          <ConfigurationTab
            coworkSettings={coworkSettings}
            lettaEnvOpen={lettaEnvOpen}
            onLettaEnvOpenChange={onLettaEnvOpenChange}
            onOpenSettings={onOpenSettings}
            onOpenSkillDownload={() => setSkillDownloadOpen(true)}
            onOpenLettaCli={() => setShowLettaCli(true)}
            isEmailConnected={isEmailConnected}
            unreadLabel={unreadLabel}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={onToggleAutoSync}
            onConnectEmail={onConnectEmail}
            onDisconnectEmail={onDisconnectEmail}
            onOpenEmailView={handleOpenEmailView}
            onRefreshEmails={refetchEmails}
            onOpenAddAgentsModal={() => setShowAddAgentsModal(true)}
          />
        )}
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

      <SkillDownloadDialog
        open={skillDownloadOpen}
        onOpenChange={(open) => {
          setSkillDownloadOpen(open);
          if (!open) {
            resetSkillForm();
          }
        }}
        skillUrl={skillUrl}
        onSkillUrlChange={setSkillUrl}
        skillName={skillName}
        onSkillNameChange={setSkillName}
        skillDownloading={skillDownloading}
        skillDownloadError={skillDownloadError}
        skillDownloadSuccess={skillDownloadSuccess}
        onDownload={handleDownloadSkill}
        onReset={resetSkillForm}
      />

      {/* Letta CLI Dialog */}
      <Dialog.Root open={showLettaCli} onOpenChange={setShowLettaCli}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-900/10 bg-[#0d1117] shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-900/20">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <Dialog.Title className="text-sm font-semibold text-ink-100">Letta CLI</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="rounded-full p-1.5 text-ink-500 hover:bg-ink-900/30 hover:text-ink-300 transition" aria-label="Close">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <LettaTerminal className="rounded-b-2xl" style={{ height: "520px" }} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* User Section */}
      {userEmail && (
        <div className="mt-auto pt-4 border-t border-[var(--color-border)]">
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
        successEmailId={successEmailId}
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
