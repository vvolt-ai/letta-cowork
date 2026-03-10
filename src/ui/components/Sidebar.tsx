import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useDownloadSkill } from "../hooks/useDownloadSkill";
import { SkillDownloadDialog } from "./SkillDownloadDialog";
import type { ZohoEmail } from "../types";
import { SidebarEmailList } from "./SidebarEmailList";
import { ChannelSetupDialog } from "./ChannelSetupDialog";
import { ChannelButtons, SessionList, PipelineSessions, ActionButtons, EmailSection, NewMailPipelineSetting, ResumeSessionDialog } from "./sidebar/index";

const AUTO_PIPELINE_TITLE_PREFIX = "Auto Email:";
type ChannelType = "whatsapp" | "telegram" | "slack" | "discord";

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
  selectedEmailId?: string;
  onSelectEmail: (email: ZohoEmail) => void;
  onViewEmail: (email: ZohoEmail) => void;
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
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  isProcessingEmailToAgent?: boolean;
  processingEmailId?: string | null;
  successEmailId?: string | null;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({
  onNewSession,
  lettaEnvOpen,
  onLettaEnvOpenChange,
  onDeleteSession,
  onConnectEmail,
  onDisconnectEmail,
  isEmailConnected,
  refetchEmails,
  emails,
  selectedEmailId,
  onSelectEmail,
  onViewEmail,
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
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  successEmailId,
  onCollapsedChange,
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [showEmailView, setShowEmailView] = useState(() => isEmailConnected);
  const [showPipelineRuns, setShowPipelineRuns] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
  const [channelSetupOpen, setChannelSetupOpen] = useState(false);
  const [setupChannel, setSetupChannel] = useState<ChannelType>("whatsapp");
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Notify parent when collapsed state changes
  const handleSetCollapsed = (newValue: boolean) => {
    setCollapsed(newValue);
    onCollapsedChange?.(newValue);
  };

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

  const formatCwd = (cwd?: string) => {
    if (!cwd) return "Working dir unavailable";
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    const tail = parts.slice(-2).join("/");
    return `/${tail || cwd}`;
  };

  const sessionList = useMemo(() => {
    const list = Object.values(sessions);
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return list;
  }, [sessions]);

  const regularSessionList = useMemo(
    () => sessionList.filter((session) => !session.title.startsWith(AUTO_PIPELINE_TITLE_PREFIX)),
    [sessionList]
  );

  const pipelineSessionList = useMemo(
    () => sessionList.filter((session) => session.title.startsWith(AUTO_PIPELINE_TITLE_PREFIX)),
    [sessionList]
  );

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

  const openChannelSetup = (channel: ChannelType) => {
    setSetupChannel(channel);
    setChannelSetupOpen(true);
  };

  return (
    <aside className={`fixed inset-y-0 left-0 flex h-full flex-col gap-4 border-r border-border bg-sidebar px-4 pb-4 pt-12 transition-all duration-300 ${collapsed ? 'w-16' : 'w-[280px]'} overflow-hidden`}>
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      
      {/* Collapse toggle button - fixed position to stay visible when collapsed */}
      <button
        className="fixed top-14 flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-ink-600 hover:bg-surface-tertiary z-50"
        style={{ left: collapsed ? '68px' : '268px' }}
        onClick={() => handleSetCollapsed(!collapsed)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg 
          className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Collapsed view - show icons with tooltips */}
      {collapsed && !showEmailView && (
        <div className="flex flex-col items-center gap-4 pt-16">
          {/* New Session */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors"
            onClick={onNewSession}
            title="New Session"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* Environment */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors"
            onClick={() => onLettaEnvOpenChange(!lettaEnvOpen)}
            title="Environment Settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* Channels - only show if SHOW_CHANNELS is true */}
          {SHOW_CHANNELS === true && (
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors"
              onClick={() => openChannelSetup('whatsapp')}
              title="Channels"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
          {/* Email - only show if SHOW_EMAIL_OPTION is true */}
          {SHOW_EMAIL_OPTION === true && (
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors relative"
              onClick={() => setShowEmailView(true)}
              title="Emails"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}
          {/* Sessions */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors"
            title="Sessions"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>
          {/* Skills */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary text-ink-600 hover:bg-accent hover:text-white transition-colors"
            onClick={() => setSkillDownloadOpen(true)}
            title="Download Skills"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      )}

      {/* Show email view only if SHOW_EMAIL_OPTION is true */}
      {(showEmailView && SHOW_EMAIL_OPTION === true) ? (
        <SidebarEmailList
          emails={emails}
          selectedEmailId={selectedEmailId}
          isFetching={isFetchingEmails}
          isProcessingEmailInput={isProcessingEmailInput}
          onSelectEmail={onSelectEmail}
          onViewEmail={onViewEmail}
          onUseEmailAsInput={onUseEmailAsInput}
          onClose={() => setShowEmailView(false)}
          selectedAgentId={selectedAgentId}
          onProcessEmailToAgent={onProcessEmailToAgent}
          processingEmailId={processingEmailId}
          successEmailId={successEmailId}
        />
      ) : (
        <>
          <div className={`flex flex-col gap-2 ${collapsed ? 'hidden' : ''}`}>
            <ActionButtons
              lettaEnvOpen={lettaEnvOpen}
              onLettaEnvOpenChange={onLettaEnvOpenChange}
              onNewSession={onNewSession}
              onOpenSkillDownload={() => setSkillDownloadOpen(true)}
            />
            {/* ChannelButtons - only show if SHOW_CHANNELS is true */}
            {SHOW_CHANNELS === true && (
              <ChannelButtons
                expanded={channelsExpanded}
                onToggle={() => setChannelsExpanded(!channelsExpanded)}
                onSelectChannel={openChannelSetup}
              />
            )}
            {/* EmailSection - only show if SHOW_EMAIL_OPTION is true */}
            {SHOW_EMAIL_OPTION === true && (
              <EmailSection
                isConnected={isEmailConnected}
                unreadCount={unreadCount}
                autoSyncEnabled={autoSyncEnabled}
                agentIds={autoSyncAgentIds}
                onConnect={onConnectEmail}
                onDisconnect={onDisconnectEmail}
                onRefresh={refetchEmails}
                onToggleAutoSync={onToggleAutoSync}
                onOpenEmailView={() => setShowEmailView(true)}
                onOpenAddAgents={() => setShowAddAgentsModal(true)}
              />
            )}
          </div>

          <div className={`flex flex-col gap-2 overflow-y-auto ${collapsed ? 'hidden' : ''}`}>
            <SessionList
              sessions={regularSessionList}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onDeleteSession={onDeleteSession}
              onResumeSession={setResumeSessionId}
              formatCwd={formatCwd}
            />

            <PipelineSessions
                sessions={pipelineSessionList}
                activeSessionId={activeSessionId}
                expanded={showPipelineRuns}
                onToggle={() => setShowPipelineRuns((prev) => !prev)}
                onSelectSession={setActiveSessionId}
                onDeleteSession={onDeleteSession}
                formatCwd={formatCwd}
              />
          </div>
        </>
      )}
      <ResumeSessionDialog
        open={!!resumeSessionId}
        resumeSessionId={resumeSessionId}
        onOpenChange={(open) => !open && setResumeSessionId(null)}
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
      />

      <SkillDownloadDialog
        open={skillDownloadOpen}
        onOpenChange={setSkillDownloadOpen}
        skillUrl={skillUrl}
        onSkillUrlChange={setSkillUrl}
        skillName={skillName}
        onSkillNameChange={setSkillName}
        skillDownloading={skillDownloading}
        skillDownloadSuccess={skillDownloadSuccess}
        skillDownloadError={skillDownloadError}
        onDownload={handleDownloadSkill}
        onReset={resetSkillForm}
      />
      <ChannelSetupDialog
        open={channelSetupOpen}
        onOpenChange={setChannelSetupOpen}
        initialChannel={setupChannel}
      />
    </aside>
  );
}
