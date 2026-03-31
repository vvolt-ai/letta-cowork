import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, type SessionView } from "../store/useAppStore";
import { useDownloadSkill } from "../hooks/useDownloadSkill";
import { SkillDownloadDialog } from "./SkillDownloadDialog";
import type { ZohoEmail } from "../types";
import { EmailInboxModal } from "./EmailInboxModal";
import { NewMailPipelineSetting, ResumeSessionDialog } from "./sidebar/index";
import {
  getAutoEmailSessionMetadata,
  getAutoEmailSessionSubject,
  isAutoEmailSession,
  sanitizeSessionTitle,
} from "../utils/session";
import { SidebarSection } from "./sidebar/SidebarSection";
import { IntegrationList } from "./sidebar/IntegrationList";
import { ConversationList } from "./sidebar/ConversationList";
import veraLogo from "../assets/vera-logo.svg";

type EmailConversationDateFilter = "all" | "today" | "yesterday" | "older";
type SidebarSessionSummary = Pick<SessionView, "id" | "title" | "status" | "updatedAt" | "createdAt" | "lastPrompt" | "isEmailSession">;

const selectSidebarSessionTokens = (state: ReturnType<typeof useAppStore.getState>): string[] => {
  return Object.values(state.sessions)
    .filter((session) => {
      // Filter out email sessions (marked with isEmailSession or title starts with "Email:")
      if (session.isEmailSession) return false;
      if (session.title?.startsWith("Email:")) return false;
      return true;
    })
    .map((session) => JSON.stringify({
      id: session.id,
      title: session.title,
      status: session.status,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      lastPrompt: session.lastPrompt,
      isEmailSession: session.isEmailSession,
    } satisfies SidebarSessionSummary))
    .sort((left, right) => {
      const parsedLeft = JSON.parse(left) as SidebarSessionSummary;
      const parsedRight = JSON.parse(right) as SidebarSessionSummary;
      return (parsedRight.updatedAt ?? 0) - (parsedLeft.updatedAt ?? 0);
    });
};

interface SidebarProps {
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
  onOpenSettings,
  hasMoreEmails,
  isLoadingMoreEmails,
  onLoadMoreEmails,
  userEmail,
  onLogout,
}: SidebarProps) {
  const sessionTokens = useAppStore(useShallow(selectSidebarSessionTokens));
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const renameSession = useAppStore((state) => state.renameSession);
  const coworkSettings = useAppStore((state) => state.coworkSettings);

  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
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

  const normalizedSessionList = useMemo(() => {
    return sessionTokens.map((token) => {
      const session = JSON.parse(token) as SidebarSessionSummary;
      return {
        ...session,
        title: !session.title || session.title.startsWith("conv-") ? "New conversation" : session.title,
      };
    });
  }, [sessionTokens]);

  const sessionById = useMemo(
    () => new Map(normalizedSessionList.map((session) => [session.id, session] as const)),
    [normalizedSessionList]
  );

  const regularSessions = useMemo(
    () => normalizedSessionList.filter((session) => !isAutoEmailSession(session)),
    [normalizedSessionList]
  );

  const autoEmailSessions = useMemo(
    () => normalizedSessionList.filter((session) => isAutoEmailSession(session)),
    [normalizedSessionList]
  );

  const [showEmailConversations, setShowEmailConversations] = useState(false);
  const [emailSenderFilter, setEmailSenderFilter] = useState("all");
  const [emailDateFilter, setEmailDateFilter] = useState<EmailConversationDateFilter>("all");

  const autoEmailSessionEntries = useMemo(
    () => autoEmailSessions.map((session) => ({ session, metadata: getAutoEmailSessionMetadata(session) })),
    [autoEmailSessions]
  );

  const autoEmailMetadataBySessionId = useMemo(() => {
    return new Map(
      autoEmailSessionEntries
        .filter((entry) => entry.metadata)
        .map((entry) => [entry.session.id, entry.metadata] as const)
    );
  }, [autoEmailSessionEntries]);

  const activeAutoEmailSession = useMemo(() => {
    if (!activeSessionId) return null;
    return autoEmailSessions.find((session) => session.id === activeSessionId) ?? null;
  }, [activeSessionId, autoEmailSessions]);

  useEffect(() => {
    if (activeAutoEmailSession) {
      setShowEmailConversations(true);
      setEmailSenderFilter("all");
      setEmailDateFilter("all");
    }
  }, [activeAutoEmailSession]);

  const emailSenderOptions = useMemo(() => {
    return Array.from(
      new Set(
        autoEmailSessionEntries
          .map((entry) => entry.metadata?.sender)
          .filter((sender): sender is string => Boolean(sender))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [autoEmailSessionEntries]);

  const filteredAutoEmailSessionEntries = useMemo(() => {
    return autoEmailSessionEntries.filter(({ metadata }) => {
      const senderMatches =
        emailSenderFilter === "all" ||
        (metadata?.sender ?? "Unknown sender") === emailSenderFilter;
      const dateMatches =
        emailDateFilter === "all" ||
        (metadata?.dateBucket ?? "unknown") === emailDateFilter;
      return senderMatches && dateMatches;
    });
  }, [autoEmailSessionEntries, emailDateFilter, emailSenderFilter]);

  const groupedAutoEmailSessions = useMemo(() => {
    const dateGroups = new Map<string, {
      key: string;
      label: string;
      sortValue: number;
      senders: Map<string, { key: string; label: string; sessions: typeof autoEmailSessions }>;
    }>();

    for (const { session, metadata } of filteredAutoEmailSessionEntries) {
      const dateKey = metadata?.receivedDateKey ?? "unknown-date";
      const dateLabel = metadata?.receivedDateLabel ?? "Unknown date";
      const senderKey = metadata?.senderKey ?? "unknown-sender";
      const senderLabel = metadata?.sender ?? "Unknown sender";
      const sortValue = metadata?.receivedAt ?? session.updatedAt ?? 0;

      let dateGroup = dateGroups.get(dateKey);
      if (!dateGroup) {
        dateGroup = {
          key: dateKey,
          label: dateLabel,
          sortValue,
          senders: new Map(),
        };
        dateGroups.set(dateKey, dateGroup);
      } else if (sortValue > dateGroup.sortValue) {
        dateGroup.sortValue = sortValue;
      }

      let senderGroup = dateGroup.senders.get(senderKey);
      if (!senderGroup) {
        senderGroup = {
          key: senderKey,
          label: senderLabel,
          sessions: [],
        };
        dateGroup.senders.set(senderKey, senderGroup);
      }

      senderGroup.sessions.push(session);
    }

    return Array.from(dateGroups.values())
      .sort((a, b) => b.sortValue - a.sortValue)
      .map((dateGroup) => ({
        ...dateGroup,
        senders: Array.from(dateGroup.senders.values())
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((senderGroup) => ({
            ...senderGroup,
            sessions: [...senderGroup.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
          })),
      }));
  }, [filteredAutoEmailSessionEntries]);

  const unreadCount = useMemo(() => {
    return emails.filter((email) => {
      const status = String(email.status ?? "").toLowerCase();
      const status2 = String(email.status2 ?? "").toLowerCase();
      return (
        status.includes("unread") ||
        status2.includes("unread") ||
        status === "0" ||
        status2 === "0"
      );
    }).length;
  }, [emails]);

  const handleRenameSession = useCallback(
    (sessionId: string, title: string) => {
      const session = sessionById.get(sessionId);
      if (!session) return;
      const sanitized = sanitizeSessionTitle(title, session.title?.trim() || "Untitled session");
      if (sanitized === session.title) return;
      renameSession(sessionId, sanitized);
    },
    [renameSession, sessionById]
  );

  const unreadLabel = isEmailConnected ? `${unreadCount} unread` : "Not connected";

  const handleOpenEmailView = useCallback(() => {
    setShowEmailView(true);
    setActiveTab("configuration");
  }, []);

  const tabs: Array<{ id: "sessions" | "configuration"; label: string }> = [
    { id: "sessions", label: "Sessions" },
    { id: "configuration", label: "Configuration" },
  ];

  const sessionsContent = (
    <div className="space-y-4">
      <button
        onClick={onNewSession}
        className="flex h-8 w-full items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
      >
        New Task
      </button>
      <SidebarSection title="Conversations">
        <ConversationList
          sessions={regularSessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onDeleteSession={onDeleteSession}
          onResumeSession={setResumeSessionId}
          onRenameSession={handleRenameSession}
          emptyMessage="No regular conversations yet."
        />
      </SidebarSection>

      {(coworkSettings.showEmailAutomation || autoEmailSessions.length > 0) ? (
        <SidebarSection
          title="Email Conversations"
          action={
            coworkSettings.showEmailAutomation ? (
              <button
                type="button"
                onClick={handleOpenEmailView}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0.5 text-[11px] font-semibold text-ink-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                <span>Inbox</span>
                <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                  {unreadCount}
                </span>
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                {unreadCount} unread
              </span>
            )
          }
        >
          {autoEmailSessions.length > 0 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowEmailConversations((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                  showEmailConversations || activeAutoEmailSession
                    ? "border-[var(--color-accent)] bg-[var(--color-sidebar-active)] text-ink-900"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 hover:border-[var(--color-accent)] hover:bg-[var(--color-sidebar-hover)]"
                }`}
                aria-expanded={showEmailConversations}
                aria-label="Toggle email conversations"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 shrink-0 transition-transform ${showEmailConversations ? "rotate-90" : "rotate-0"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="truncate font-medium">Show email conversations</span>
                </div>
                <span className="ml-3 inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs font-semibold text-ink-700">
                  {unreadCount}
                </span>
              </button>

              {showEmailConversations ? (
                <div className="space-y-3 pl-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Sender</span>
                      <select
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-ink-800 transition focus:border-[var(--color-accent)] focus:outline-none"
                        value={emailSenderFilter}
                        onChange={(event) => setEmailSenderFilter(event.target.value)}
                      >
                        <option value="all">All senders</option>
                        {emailSenderOptions.map((sender) => (
                          <option key={sender} value={sender}>
                            {sender}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Date</span>
                      <select
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-ink-800 transition focus:border-[var(--color-accent)] focus:outline-none"
                        value={emailDateFilter}
                        onChange={(event) => setEmailDateFilter(event.target.value as EmailConversationDateFilter)}
                      >
                        <option value="all">All dates</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="older">Older</option>
                      </select>
                    </label>
                  </div>

                  {groupedAutoEmailSessions.length > 0 ? (
                    <div className="space-y-3">
                      {groupedAutoEmailSessions.map((dateGroup) => (
                        <div key={dateGroup.key} className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            {dateGroup.label}
                          </div>
                          <div className="space-y-2">
                            {dateGroup.senders.map((senderGroup) => (
                              <div key={`${dateGroup.key}-${senderGroup.key}`} className="space-y-1.5">
                                <div className="text-xs font-medium text-ink-600">
                                  {senderGroup.label}
                                </div>
                                <ConversationList
                                  sessions={senderGroup.sessions}
                                  activeSessionId={activeSessionId}
                                  onSelectSession={setActiveSessionId}
                                  onDeleteSession={onDeleteSession}
                                  onResumeSession={setResumeSessionId}
                                  onRenameSession={handleRenameSession}
                                  getSessionTitle={(session) => getAutoEmailSessionSubject(session.title || "", session.lastPrompt)}
                                  getSessionSubtitle={(session) => {
                                    const metadata = autoEmailMetadataBySessionId.get(session.id);
                                    return metadata?.receivedTimeLabel ? `Received ${metadata.receivedTimeLabel}` : undefined;
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
                      No email conversations match the selected filters.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
              No email conversations yet.
            </div>
          )}
        </SidebarSection>
      ) : null}
    </div>
  );

  // Always show the configuration content when email automation is enabled
  const configurationContent = (
    <div className="flex h-full flex-col space-y-4">
      <SidebarSection title="Environment">
        <div className="space-y-2 text-sm text-ink-700">
          {coworkSettings.showLettaEnv && (
            <button
              onClick={() => {
                onLettaEnvOpenChange(!lettaEnvOpen);
                setActiveTab("configuration");
              }}
              className="flex h-8 w-full items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Environment
            </button>
          )}
          <button
            onClick={() => setSkillDownloadOpen(true)}
            className="flex h-8 w-full items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Download Skill
          </button>
        </div>
      </SidebarSection>

      <SidebarSection title="Channels">
        <div className="text-sm text-ink-600">
          <p>Manage channels in Settings</p>
          <button
            onClick={onOpenSettings}
            className="mt-2 text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            Open Settings →
          </button>
        </div>
      </SidebarSection>

      {coworkSettings.showEmailAutomation && (
        <SidebarSection title="Integrations">
          <IntegrationList
            isEmailConnected={isEmailConnected}
            unreadLabel={unreadLabel}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={onToggleAutoSync}
            onConnect={onConnectEmail}
            onDisconnect={onDisconnectEmail}
            onOpenInbox={handleOpenEmailView}
            onRefresh={refetchEmails}
            onManageRules={() => setShowAddAgentsModal(true)}
          />
        </SidebarSection>
      )}
    </div>
  );

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
        {activeTab === "sessions" ? sessionsContent : configurationContent}
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
