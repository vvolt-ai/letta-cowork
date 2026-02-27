import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "../store/useAppStore";
import { useDownloadSkill } from "../hooks/useDownloadSkill";
import { SkillDownloadDialog } from "./SkillDownloadDialog";
import type { ZohoEmail } from "../types";
import { SidebarEmailList } from "./SidebarEmailList";
import { ChangeEnv } from "./ChangeEnv";

const AUTO_PIPELINE_TITLE_PREFIX = "Auto Email:";

interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
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
  const [copied, setCopied] = useState(false);
  const [skillDownloadOpen, setSkillDownloadOpen] = useState(false);
  const [showEmailView, setShowEmailView] = useState(false);
  const [showPipelineRuns, setShowPipelineRuns] = useState(false);
  const [showAddAgentsModal, setShowAddAgentsModal] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newRuleFromPattern, setNewRuleFromPattern] = useState("");
  const [newRuleAgentId, setNewRuleAgentId] = useState("");
  const closeTimerRef = useRef<number | null>(null);

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
    setCopied(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [resumeSessionId]);

  useEffect(() => {
    if (!isEmailConnected) {
      setShowEmailView(false);
    }
  }, [isEmailConnected]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const handleCopyCommand = async () => {
    if (!resumeSessionId) return;
    const command = `letta --conv ${resumeSessionId}`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setResumeSessionId(null);
    }, 3000);
  };

  const handleAddAgent = () => {
    const trimmed = newAgentId.trim();
    if (!trimmed) return;
    onAddAutoSyncAgent(trimmed);
    setNewAgentId("");
  };

  const handleAddRule = () => {
    const fromPattern = newRuleFromPattern.trim();
    const agentId = newRuleAgentId.trim();
    if (!fromPattern || !agentId) return;
    onAddAutoSyncRoutingRule(fromPattern, agentId);
    setNewRuleFromPattern("");
    setNewRuleAgentId("");
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
            <div className="grid grid-cols-3 gap-2">
              <ChangeEnv className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors" />
              <button
                className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
                onClick={onNewSession}
              >
                New Task
              </button>
              <button
                className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
                onClick={() => setSkillDownloadOpen(true)}
              >
                Download Skill
              </button>
            </div>
            {isEmailConnected && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    className="flex flex-1 items-center justify-between rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
                    onClick={() => setShowEmailView(true)}
                  >
                    <span className="flex items-center gap-2">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M4 6h16v12H4z" />
                        <path d="M4 7l8 6 8-6" />
                      </svg>
                      Emails
                    </span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    className="rounded-xl border border-ink-900/10 bg-surface p-2 text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
                    onClick={refetchEmails}
                    aria-label="Refresh emails"
                    title="Refresh emails"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 12a8 8 0 10-2.34 5.66" />
                      <path d="M20 4v6h-6" />
                    </svg>
                  </button>
                  <button
                    className="rounded-xl border border-error/20 bg-error-light p-2 text-error hover:bg-error-light/80 transition-colors"
                    onClick={onDisconnectEmail}
                    aria-label="Disconnect email"
                    title="Disconnect email"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10 17l5-5-5-5" />
                      <path d="M15 12H3" />
                      <path d="M21 3v18H9" />
                    </svg>
                  </button>
                </div>
                <div className="rounded-xl border border-ink-900/10 bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(e) => onToggleAutoSync(e.target.checked)}
                      />
                      <span>Unread Pipeline</span>
                    </label>
                    <button
                      className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                      onClick={() => setShowAddAgentsModal(true)}
                    >
                      Add Agents ({autoSyncAgentIds.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {
            !isEmailConnected ? (
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
                  onClick={onConnectEmail}
                >
                  + Connect to Emails
                </button>
              </div>
            ) : null
          }

          <div className="flex flex-col gap-2 overflow-y-auto">
            {regularSessionList.length === 0 && (
              <div className="rounded-xl border border-ink-900/5 bg-surface px-4 py-5 text-center text-xs text-muted">
                No sessions yet. Click "+ New Task" to start.
              </div>
            )}
            {regularSessionList.map((session) => (
              <div
                key={session.id}
                className={`cursor-pointer rounded-xl border px-2 py-3 text-left transition ${activeSessionId === session.id ? "border-accent/30 bg-accent-subtle" : "border-ink-900/5 bg-surface hover:bg-surface-tertiary"}`}
                onClick={() => setActiveSessionId(session.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveSessionId(session.id); } }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <div className={`text-[12px] font-medium ${session.status === "running" ? "text-info" : session.status === "completed" ? "text-success" : session.status === "error" ? "text-error" : "text-ink-800"}`}>
                      {session.title}
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-xs text-muted">
                      <span className="truncate">{formatCwd(session.cwd)}</span>
                    </div>
                  </div>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className="flex-shrink-0 rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10" aria-label="Open session menu" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                          <circle cx="5" cy="12" r="1.7" />
                          <circle cx="12" cy="12" r="1.7" />
                          <circle cx="19" cy="12" r="1.7" />
                        </svg>
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="z-50 min-w-[220px] rounded-xl border border-ink-900/10 bg-surface p-1 shadow-lg" align="center" sideOffset={8}>
                        <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5" onSelect={() => onDeleteSession(session.id)}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-error/80" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
                          </svg>
                          Delete this session
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5" onSelect={() => setResumeSessionId(session.id)}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M4 5h16v14H4z" /><path d="M7 9h10M7 12h6" /><path d="M13 15l3 2-3 2" />
                          </svg>
                          Resume in Letta Code
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>
            ))}

            {pipelineSessionList.length > 0 && (
              <div className="mt-2 rounded-xl border border-ink-900/10 bg-surface p-2">
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink-700 hover:bg-surface-tertiary"
                  onClick={() => setShowPipelineRuns((prev) => !prev)}
                >
                  <span>Unread Pipeline Runs</span>
                  <span className="text-[10px] text-muted">
                    {pipelineSessionList.length} {showPipelineRuns ? "hide" : "show"}
                  </span>
                </button>
                {showPipelineRuns && (
                  <div className="mt-2 flex flex-col gap-2">
                    {pipelineSessionList.map((session) => (
                      <div
                        key={session.id}
                        className={`cursor-pointer rounded-xl border px-2 py-3 text-left transition ${activeSessionId === session.id ? "border-accent/30 bg-accent-subtle" : "border-ink-900/5 bg-surface hover:bg-surface-tertiary"}`}
                        onClick={() => setActiveSessionId(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveSessionId(session.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className={`truncate text-[12px] font-medium ${session.status === "running" ? "text-info" : session.status === "completed" ? "text-success" : session.status === "error" ? "text-error" : "text-ink-800"}`}>
                              {session.title}
                            </div>
                            <div className="mt-0.5 text-xs text-muted">{formatCwd(session.cwd)}</div>
                          </div>
                          <button
                            className="rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10"
                            aria-label="Delete pipeline session"
                            title="Delete pipeline session"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(session.id);
                            }}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 7h16" />
                              <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <Dialog.Root open={!!resumeSessionId} onOpenChange={(open) => !open && setResumeSessionId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Resume</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-900/10 bg-surface px-3 py-2 font-mono text-xs text-ink-700">
              <span className="flex-1 break-all">{resumeSessionId ? `letta --conv ${resumeSessionId}` : ""}</span>
              <button className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-900/10" onClick={handleCopyCommand} aria-label="Copy resume command">
                {copied ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={showAddAgentsModal} onOpenChange={setShowAddAgentsModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-base font-semibold text-ink-800">Unread Pipeline Agents</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
                placeholder="agent-xxxx"
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddAgent();
                  }
                }}
              />
              <button
                className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                onClick={handleAddAgent}
              >
                Add
              </button>
            </div>
            <div className="mt-3 max-h-52 overflow-y-auto">
              {autoSyncAgentIds.length === 0 ? (
                <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs text-muted">
                  No agents selected.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {autoSyncAgentIds.map((agentId) => (
                    <div key={agentId} className="flex items-center justify-between gap-2 rounded-lg border border-ink-900/10 bg-surface px-2.5 py-2">
                      <span className="truncate text-xs text-ink-800">{agentId}</span>
                      <button
                        className="rounded-md border border-error/20 bg-error-light px-2 py-1 text-[11px] font-medium text-error hover:bg-error-light/80"
                        onClick={() => onRemoveAutoSyncAgent(agentId)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-ink-900/10 pt-3">
              <div className="text-xs font-semibold text-ink-700">From Address Routing</div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  className="rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="From contains (example: billing@company.com)"
                  value={newRuleFromPattern}
                  onChange={(e) => setNewRuleFromPattern(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    placeholder="Target agent ID"
                    value={newRuleAgentId}
                    onChange={(e) => setNewRuleAgentId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddRule();
                      }
                    }}
                  />
                  <button
                    className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                    onClick={handleAddRule}
                  >
                    Add Rule
                  </button>
                </div>
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto">
                {autoSyncRoutingRules.length === 0 ? (
                  <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs text-muted">
                    No routing rules.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {autoSyncRoutingRules.map((rule, index) => (
                      <div key={`${rule.fromPattern}-${rule.agentId}-${index}`} className="rounded-lg border border-ink-900/10 bg-surface px-2.5 py-2">
                        <div className="text-[11px] text-ink-800">
                          From contains: <span className="font-medium">{rule.fromPattern}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted">{rule.agentId}</span>
                          <button
                            className="rounded-md border border-error/20 bg-error-light px-2 py-1 text-[11px] font-medium text-error hover:bg-error-light/80"
                            onClick={() => onRemoveAutoSyncRoutingRule(index)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
    </aside>
  );
}
