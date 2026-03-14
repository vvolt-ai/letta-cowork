import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useDownloadSkill } from "../hooks/useDownloadSkill";
import { SkillDownloadDialog } from "./SkillDownloadDialog";
import type { ZohoEmail } from "../types";
import { SidebarEmailList } from "./SidebarEmailList";
import { ChannelSetupDialog } from "./ChannelSetupDialog";
import { NewMailPipelineSetting, ResumeSessionDialog } from "./sidebar/index";
import { sanitizeSessionTitle } from "../utils/session";
import type { ChannelType } from "./channel-settings";
import { SidebarSection } from "./sidebar/SidebarSection";
import { ChannelList } from "./sidebar/ChannelList";
import { IntegrationList } from "./sidebar/IntegrationList";
import { ConversationList } from "./sidebar/ConversationList";
import veraLogo from "../assets/vera-logo.svg";

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
  processingEmailId?: string | null;
  successEmailId?: string | null;
  onOpenSettings?: () => void;
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
  onOpenSettings,
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const renameSession = useAppStore((state) => state.renameSession);
  const coworkSettings = useAppStore((state) => state.coworkSettings);

  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
  const [channelSetupOpen, setChannelSetupOpen] = useState(false);
  const [setupChannel, setSetupChannel] = useState<ChannelType>("whatsapp");
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

  const channelItems = useMemo(
    () => [
      { id: "whatsapp", label: "WhatsApp", enabled: coworkSettings.showWhatsApp },
      { id: "telegram", label: "Telegram", enabled: coworkSettings.showTelegram },
      { id: "slack", label: "Slack", enabled: coworkSettings.showSlack },
      { id: "discord", label: "Discord", enabled: coworkSettings.showDiscord },
    ],
    [coworkSettings]
  );

  const sessionList = useMemo(() => {
    return Object.values(sessions)
      .map((session) => ({
        ...session,
        title: session.title || "Untitled session",
      }))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [sessions]);

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
      const session = sessions[sessionId];
      if (!session) return;
      const sanitized = sanitizeSessionTitle(title, session.title?.trim() || "Untitled session");
      if (sanitized === session.title) return;
      renameSession(sessionId, sanitized);
    },
    [renameSession, sessions]
  );

  const defaultChannel = useMemo<ChannelType>(() => {
    const firstEnabled = channelItems.find((channel) => channel.enabled);
    return (firstEnabled?.id as ChannelType) ?? "whatsapp";
  }, [channelItems]);

  const openChannelSetup = (channel: ChannelType) => {
    setSetupChannel(channel);
    setChannelSetupOpen(true);
  };

  const unreadLabel = isEmailConnected ? `${unreadCount} unread` : "Not connected";

  const handleOpenEmailView = useCallback(() => {
    setShowEmailView(true);
    setActiveTab("configuration");
  }, []);

  const handleCloseEmailView = useCallback(() => {
    setShowEmailView(false);
    setActiveTab("sessions");
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
          sessions={sessionList}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onDeleteSession={onDeleteSession}
          onResumeSession={setResumeSessionId}
          onRenameSession={handleRenameSession}
        />
      </SidebarSection>
    </div>
  );

  const configurationContent = showEmailView && coworkSettings.showEmailAutomation ? (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <SidebarEmailList
        emails={emails}
        selectedEmailId={selectedEmailId}
        isFetching={isFetchingEmails}
        isProcessingEmailInput={isProcessingEmailInput}
        onSelectEmail={onSelectEmail}
        onViewEmail={onViewEmail}
        onUseEmailAsInput={onUseEmailAsInput}
        onClose={handleCloseEmailView}
        selectedAgentId={selectedAgentId}
        onProcessEmailToAgent={onProcessEmailToAgent}
        processingEmailId={processingEmailId}
        successEmailId={successEmailId}
      />
    </div>
  ) : (
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

      <SidebarSection
        title="Channels"
        action={
          <button
            onClick={() => openChannelSetup(defaultChannel)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-ink-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Configure
          </button>
        }
      >
        <ChannelList
          channels={channelItems}
          onConfigure={() => openChannelSetup(defaultChannel)}
        />
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
    <aside className="flex h-full w-full flex-col gap-4 border-r border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-4">
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

      <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs font-medium">
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

      <ChannelSetupDialog
        open={channelSetupOpen}
        onOpenChange={setChannelSetupOpen}
        initialChannel={setupChannel}
        enabledChannels={channelItems
          .filter((channel) => channel.enabled)
          .map((channel) => channel.id as ChannelType)}
      />

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
    </aside>
  );
}
