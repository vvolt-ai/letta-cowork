import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AgentDropdown } from "../AgentDropdown";

interface NewMailPipelineSettingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  accountId: string;
  folderId: string;
  onRunAutoSyncNow: () => Promise<void>;
  onRefreshEmailMailbox?: () => void | Promise<unknown>;
}

interface SettingsSectionProps {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}

function SettingsSection({ eyebrow, title, description, children }: SettingsSectionProps) {
  return (
    <section className="rounded-2xl border border-ink-900/10 bg-white p-4 shadow-sm">
      <div>
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{eyebrow}</div>
        ) : null}
        <h3 className="mt-1 text-sm font-semibold text-ink-800">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTodayDateInputValue = (): string => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
};

export function NewMailPipelineSetting({
  open,
  onOpenChange,
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
  accountId,
  folderId,
  onRunAutoSyncNow,
  onRefreshEmailMailbox,
}: NewMailPipelineSettingProps) {
  const [newAgentId, setNewAgentId] = useState("");
  const [newRuleFromPattern, setNewRuleFromPattern] = useState("");
  const [newRuleAgentId, setNewRuleAgentId] = useState("");
  const [debugInfo, setDebugInfo] = useState<ProcessedUnreadEmailDebugInfo | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"refresh" | "clear" | "reprocess" | null>(null);

  const canInspectMailbox = Boolean(accountId && folderId);
  const recentEntries = useMemo(() => debugInfo?.entries ?? [], [debugInfo]);

  const loadDebugInfo = useCallback(async () => {
    if (!accountId || !folderId) {
      setDebugInfo(null);
      setDebugError(null);
      return;
    }

    setDebugLoading(true);
    setDebugError(null);

    try {
      const info = await window.electron.getProcessedUnreadEmailDebugInfo(accountId, folderId, 10);
      setDebugInfo(info);
    } catch (error) {
      console.error("Failed to load processed unread email debug info:", error);
      setDebugError("Could not load processed unread state for the current mailbox.");
    } finally {
      setDebugLoading(false);
    }
  }, [accountId, folderId]);

  useEffect(() => {
    if (!open) {
      setActionStatus(null);
      setActiveAction(null);
      return;
    }

    if (!autoSyncSinceDate && autoSyncAgentIds.length === 0 && autoSyncRoutingRules.length === 0) {
      onSetAutoSyncSinceDate(getTodayDateInputValue());
    }

    void loadDebugInfo();
  }, [
    autoSyncAgentIds.length,
    autoSyncRoutingRules.length,
    autoSyncSinceDate,
    loadDebugInfo,
    onSetAutoSyncSinceDate,
    open,
  ]);

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

  const handleRefreshDebugInfo = useCallback(async () => {
    setActiveAction("refresh");
    setActionStatus(null);
    try {
      await loadDebugInfo();
      setActionStatus("Mailbox state refreshed.");
    } finally {
      setActiveAction(null);
    }
  }, [loadDebugInfo]);

  const handleClearProcessedIds = useCallback(async () => {
    if (!accountId || !folderId) return;

    setActiveAction("clear");
    setActionStatus(null);
    setDebugError(null);

    try {
      await window.electron.clearProcessedUnreadEmailIds(accountId, folderId);
      await loadDebugInfo();
      setActionStatus("Cleared processed unread IDs for this mailbox.");
    } catch (error) {
      console.error("Failed to clear processed unread IDs:", error);
      setDebugError("Could not clear processed unread IDs for the current mailbox.");
    } finally {
      setActiveAction(null);
    }
  }, [accountId, folderId, loadDebugInfo]);

  const handleReprocessUnreadNow = useCallback(async () => {
    if (!accountId || !folderId) return;

    setActiveAction("reprocess");
    setActionStatus(null);
    setDebugError(null);

    try {
      await window.electron.clearProcessedUnreadEmailIds(accountId, folderId);
      await loadDebugInfo();
      await onRunAutoSyncNow();
      await onRefreshEmailMailbox?.();
      await loadDebugInfo();
      setActionStatus("Unread email reprocessing started for this mailbox.");
    } catch (error) {
      console.error("Failed to reprocess unread emails:", error);
      setDebugError("Could not reprocess unread emails for the current mailbox.");
    } finally {
      setActiveAction(null);
    }
  }, [accountId, folderId, loadDebugInfo, onRefreshEmailMailbox, onRunAutoSyncNow]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-ink-900/10 bg-surface p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Email automation</div>
              <Dialog.Title className="mt-1 text-lg font-semibold text-ink-900">Configure how unread email is routed</Dialog.Title>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Choose where unmatched email should go, optionally route specific senders to different agents,
                and use mailbox recovery tools if you need to inspect or rerun automation.
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 max-h-[78vh] overflow-y-auto pr-1">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-ink-900/10 bg-surface-secondary/60 p-4 md:grid-cols-3">
                  <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Mailbox</div>
                    <div className="mt-2 text-sm font-medium text-ink-800">{accountId ? "Connected" : "Not connected"}</div>
                    <div className="mt-1 text-xs text-muted">
                      {folderId ? `Folder ${folderId}` : "Connect an inbox to configure mailbox-specific tools."}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Fallback agents</div>
                    <div className="mt-2 text-sm font-medium text-ink-800">
                      {autoSyncAgentIds.length === 0 ? "Not set" : `${autoSyncAgentIds.length} selected`}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Used when an unread email does not match a sender rule.
                    </div>
                  </div>
                  <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Sender routing</div>
                    <div className="mt-2 text-sm font-medium text-ink-800">
                      {autoSyncRoutingRules.length === 0 ? "No rules" : `${autoSyncRoutingRules.length} rules`}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Matching rules override the fallback destination for specific senders.
                    </div>
                  </div>
                </div>

                <SettingsSection
                  eyebrow="Step 1"
                  title="Choose a default destination"
                  description="These agents receive unread email when no sender-based rule matches. Add one or more agents to define your fallback automation path."
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <AgentDropdown value={newAgentId} onChange={setNewAgentId} />
                    </div>
                    <button
                      className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                      onClick={handleAddAgent}
                    >
                      Add agent
                    </button>
                  </div>

                  <div className="mt-3 max-h-56 overflow-y-auto">
                    {autoSyncAgentIds.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-ink-900/15 bg-surface-secondary/50 px-4 py-4 text-xs text-muted">
                        No fallback agents selected yet. Add at least one agent so unmatched unread email has a clear destination.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {autoSyncAgentIds.map((agentId) => (
                          <div
                            key={agentId}
                            className="flex items-center justify-between gap-3 rounded-xl border border-ink-900/10 bg-surface px-3 py-2.5"
                          >
                            <div>
                              <div className="text-xs font-medium text-ink-800">Fallback agent</div>
                              <div className="mt-0.5 text-xs text-muted">{agentId}</div>
                            </div>
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
                </SettingsSection>

                <SettingsSection
                  eyebrow="Step 2"
                  title="Route specific senders to different agents"
                  description="Use sender rules when certain email sources should always go to a dedicated agent. Rules are matched by text contained in the sender address."
                >
                  <div className="grid gap-2 rounded-xl border border-ink-900/10 bg-surface-secondary/50 p-3">
                    <div className="text-[11px] font-medium text-ink-700">If sender contains… send to…</div>
                    <input
                      className="rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
                      placeholder="billing@company.com or domain fragment"
                      value={newRuleFromPattern}
                      onChange={(e) => setNewRuleFromPattern(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <AgentDropdown value={newRuleAgentId} onChange={setNewRuleAgentId} />
                      </div>
                      <button
                        className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                        onClick={handleAddRule}
                      >
                        Add rule
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 max-h-56 overflow-y-auto">
                    {autoSyncRoutingRules.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-ink-900/15 bg-surface-secondary/50 px-4 py-4 text-xs text-muted">
                        No sender rules yet. If all unread email can go to the same fallback agents, you can leave this empty.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {autoSyncRoutingRules.map((rule, index) => (
                          <div
                            key={`${rule.fromPattern}-${rule.agentId}-${index}`}
                            className="rounded-xl border border-ink-900/10 bg-surface px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Rule</div>
                                <div className="mt-1 text-xs text-ink-800">
                                  If sender contains <span className="font-semibold">{rule.fromPattern}</span>
                                </div>
                                <div className="mt-1 truncate text-xs text-muted">Send to {rule.agentId}</div>
                              </div>
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
                </SettingsSection>

                <SettingsSection
                  eyebrow="Step 3"
                  title="Choose what gets processed"
                  description="Pick whether automation should only handle unread email or process every email received today, even if it is already read."
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onSetAutoSyncProcessingMode("unread_only")}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        autoSyncProcessingMode === "unread_only"
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                          : "border-ink-900/10 bg-surface-secondary/50 hover:border-[var(--color-accent)]/40"
                      }`}
                    >
                      <div className="text-xs font-semibold text-ink-800">Process unread emails only</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted">
                        Uses unread state as the gate and only routes unread messages.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetAutoSyncProcessingMode("today_all")}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        autoSyncProcessingMode === "today_all"
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                          : "border-ink-900/10 bg-surface-secondary/50 hover:border-[var(--color-accent)]/40"
                      }`}
                    >
                      <div className="text-xs font-semibold text-ink-800">Process all emails from today</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted">
                        Includes both read and unread emails received during the current local day.
                      </div>
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection
                  eyebrow="Step 4"
                  title="Set a sync boundary"
                  description="Use a start date when you want automation to ignore older email. Leaving this blank allows all eligible messages in the selected mode to be considered."
                >
                  <div className="rounded-xl border border-ink-900/10 bg-surface-secondary/50 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="flex-1 rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
                        value={autoSyncSinceDate}
                        onChange={(e) => onSetAutoSyncSinceDate(e.target.value)}
                      />
                      {autoSyncSinceDate ? (
                        <button
                          className="rounded-lg border border-ink-900/10 bg-surface px-2.5 py-2 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary"
                          onClick={() => onSetAutoSyncSinceDate("")}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[11px] text-muted">
                      Current boundary: {autoSyncSinceDate || "No date limit — all unread email is eligible."}
                    </div>
                  </div>
                </SettingsSection>
              </div>

              <div className="space-y-4">
                <SettingsSection
                  eyebrow="Recovery tools"
                  title="Mailbox state and reprocessing"
                  description="These tools are for inspection and recovery. Use them when you need to understand what has already been processed or force the current mailbox to be reconsidered."
                >
                  <div className="rounded-xl border border-ink-900/10 bg-surface-secondary/50 p-3 text-[11px] text-ink-700">
                    <div>
                      <span className="font-semibold">Account:</span> {accountId || "Not connected"}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Folder:</span> {folderId || "Not selected"}
                    </div>
                    {debugInfo ? (
                      <div className="mt-1 break-all text-muted">Mailbox key: {debugInfo.mailboxKey}</div>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                      <div className="text-muted">Stored processed IDs</div>
                      <div className="mt-1 text-lg font-semibold text-ink-800">{debugInfo?.count ?? 0}</div>
                    </div>
                    <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                      <div className="text-muted">Retention window</div>
                      <div className="mt-1 text-sm font-semibold text-ink-800">
                        {debugInfo ? `${debugInfo.retentionDays} days` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-ink-900/10 bg-white px-3 py-3 text-[11px] text-ink-700">
                    <div>
                      <span className="font-semibold">Newest processed:</span> {formatTimestamp(debugInfo?.newestProcessedAt)}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Oldest retained:</span> {formatTimestamp(debugInfo?.oldestProcessedAt)}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Retention cap:</span> {debugInfo?.maxEntries ?? "—"}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      className="rounded-lg border border-ink-900/10 bg-white px-3 py-2 font-medium text-ink-700 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleRefreshDebugInfo()}
                      disabled={!canInspectMailbox || activeAction !== null}
                    >
                      {activeAction === "refresh" ? "Refreshing…" : "Refresh state"}
                    </button>
                    <button
                      className="rounded-lg border border-ink-900/10 bg-white px-3 py-2 font-medium text-ink-700 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleClearProcessedIds()}
                      disabled={!canInspectMailbox || activeAction !== null}
                    >
                      {activeAction === "clear" ? "Clearing…" : "Clear processed IDs"}
                    </button>
                    <button
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-2 font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleReprocessUnreadNow()}
                      disabled={!canInspectMailbox || activeAction !== null}
                    >
                      {activeAction === "reprocess" ? "Reprocessing…" : "Reprocess unread now"}
                    </button>
                  </div>

                  {actionStatus ? (
                    <div className="mt-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-3 py-2 text-xs text-[var(--color-accent-hover)]">
                      {actionStatus}
                    </div>
                  ) : null}

                  {debugError ? (
                    <div className="mt-3 rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
                      {debugError}
                    </div>
                  ) : null}
                </SettingsSection>

                <SettingsSection
                  eyebrow="Recent activity"
                  title="Recently retained message IDs"
                  description="This sample shows the most recent processed unread messages remembered for this mailbox."
                >
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-ink-900/10 bg-white">
                    {debugLoading ? (
                      <div className="px-3 py-3 text-xs text-muted">Loading mailbox state…</div>
                    ) : !canInspectMailbox ? (
                      <div className="px-3 py-3 text-xs text-muted">
                        Connect an inbox and select a folder to inspect processed unread state.
                      </div>
                    ) : recentEntries.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted">
                        No processed unread IDs are currently stored for this mailbox.
                      </div>
                    ) : (
                      <div className="divide-y divide-ink-900/10">
                        {recentEntries.map((entry) => (
                          <div key={`${entry.id}-${entry.processedAt}`} className="px-3 py-2 text-[11px]">
                            <div className="break-all font-medium text-ink-800">{entry.id}</div>
                            <div className="mt-0.5 text-muted">Processed {formatTimestamp(entry.processedAt)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsSection>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
