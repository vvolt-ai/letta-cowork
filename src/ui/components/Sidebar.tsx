import { useEffect, useMemo, useState } from "react";
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
  isFetchingEmails: boolean;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  autoSyncAgentIds: string[];
  onAddAutoSyncAgent: (agentId: string) => void;
  onRemoveAutoSyncAgent: (agentId: string) => void;
  autoSyncRoutingRules: { fromPattern: string; agentId: string }[];
  onAddAutoSyncRoutingRule: (fromPattern: string, agentId: string) => void;
  onRemoveAutoSyncRoutingRule: (index: number) => void;
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
  isFetchingEmails,
  autoSyncEnabled,
  onToggleAutoSync,
  autoSyncAgentIds,
  onAddAutoSyncAgent,
  onRemoveAutoSyncAgent,
  autoSyncRoutingRules,
  onAddAutoSyncRoutingRule,
  onRemoveAutoSyncRoutingRule,
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showPipelineRuns, setShowPipelineRuns] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
  const [channelSetupOpen, setChannelSetupOpen] = useState(false);
  const [setupChannel, setSetupChannel] = useState<ChannelType>("whatsapp");
  const [channelsExpanded, setChannelsExpanded] = useState(true);

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

  useEffect(() => {
    if (!isEmailConnected) {
      setShowEmailView(false);
    }
  }, [isEmailConnected]);

  const openChannelSetup = (channel: ChannelType) => {
    setSetupChannel(channel);
    setChannelSetupOpen(true);
  };

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col gap-4 border-r border-border bg-sidebar px-4 pb-4 pt-12">
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {showEmailView ? (
        <SidebarEmailList
          emails={emails}
          selectedEmailId={selectedEmailId}
          isFetching={isFetchingEmails}
          onSelectEmail={onSelectEmail}
          onViewEmail={onViewEmail}
          onUseEmailAsInput={onUseEmailAsInput}
          onClose={() => setShowEmailView(false)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <ActionButtons
              lettaEnvOpen={lettaEnvOpen}
              onLettaEnvOpenChange={onLettaEnvOpenChange}
              onNewSession={onNewSession}
              onOpenSkillDownload={() => setSkillDownloadOpen(true)}
            />
            <ChannelButtons
              expanded={channelsExpanded}
              onToggle={() => setChannelsExpanded(!channelsExpanded)}
              onSelectChannel={openChannelSetup}
            />
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
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto">
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
