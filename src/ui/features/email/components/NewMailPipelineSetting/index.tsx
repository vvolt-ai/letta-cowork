import * as Dialog from "@radix-ui/react-dialog";
import { AgentSelector } from "./AgentSelector";
import { RoutingRules } from "./RoutingRules";
import { ProcessingModeSelector } from "./ProcessingModeSelector";
import { SyncSettings } from "./SyncSettings";
import { MailboxRecovery } from "./MailboxRecovery";
import { RecentActivity } from "./RecentActivity";
import { useMailPipeline } from "./hooks/useMailPipeline";
import { useRoutingRules } from "./hooks/useRoutingRules";
import type { NewMailPipelineSettingProps } from "../../types";

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
  autoSyncMarkAsRead,
  onSetAutoSyncMarkAsRead,
  accountId,
  folderId,
  onRunAutoSyncNow,
  onRefreshEmailMailbox,
}: NewMailPipelineSettingProps) {
  const {
    debugInfo,
    debugLoading,
    debugError,
    actionStatus,
    activeAction,
    canInspectMailbox,
    recentEntries,
    handleRefreshDebugInfo,
    handleClearProcessedIds,
    handleReprocessUnreadNow,
  } = useMailPipeline({
    open,
    accountId,
    folderId,
    autoSyncAgentIds,
    autoSyncRoutingRules,
    autoSyncSinceDate,
    onSetAutoSyncSinceDate,
    onRunAutoSyncNow,
    onRefreshEmailMailbox,
  });

  const routingRules = useRoutingRules({
    autoSyncRoutingRules,
    onAddAutoSyncRoutingRule,
    onRemoveAutoSyncRoutingRule,
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-ink-900/10 bg-surface p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Email automation</div>
              <Dialog.Title className="mt-1 text-lg font-semibold text-ink-900">
                Configure how unread email is routed
              </Dialog.Title>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Choose where unmatched email should go, optionally route specific senders to different agents, and use
                mailbox recovery tools if you need to inspect or rerun automation.
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
                    <div className="mt-2 text-sm font-medium text-ink-800">
                      {accountId ? "Connected" : "Not connected"}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {folderId ? `Folder ${folderId}` : "Connect an inbox to configure mailbox-specific tools."}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Fallback agents
                    </div>
                    <div className="mt-2 text-sm font-medium text-ink-800">
                      {autoSyncAgentIds.length === 0 ? "Not set" : `${autoSyncAgentIds.length} selected`}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Used when an unread email does not match a sender rule.
                    </div>
                  </div>
                  <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Sender routing
                    </div>
                    <div className="mt-2 text-sm font-medium text-ink-800">
                      {autoSyncRoutingRules.length === 0 ? "No rules" : `${autoSyncRoutingRules.length} rules`}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Matching rules override the fallback destination for specific senders.
                    </div>
                  </div>
                </div>

                <AgentSelector
                  autoSyncAgentIds={autoSyncAgentIds}
                  onAddAutoSyncAgent={onAddAutoSyncAgent}
                  onRemoveAutoSyncAgent={onRemoveAutoSyncAgent}
                />

                <RoutingRules
                  rules={routingRules.rules}
                  newRuleFromPattern={routingRules.newRuleFromPattern}
                  setNewRuleFromPattern={routingRules.setNewRuleFromPattern}
                  newRuleAgentId={routingRules.newRuleAgentId}
                  setNewRuleAgentId={routingRules.setNewRuleAgentId}
                  onAddRule={routingRules.handleAddRule}
                  onRemoveRule={routingRules.handleRemoveRule}
                  canAddRule={routingRules.canAddRule}
                />

                <ProcessingModeSelector
                  autoSyncProcessingMode={autoSyncProcessingMode}
                  onSetAutoSyncProcessingMode={onSetAutoSyncProcessingMode}
                />

                <SyncSettings
                  autoSyncMarkAsRead={autoSyncMarkAsRead}
                  onSetAutoSyncMarkAsRead={onSetAutoSyncMarkAsRead}
                  autoSyncSinceDate={autoSyncSinceDate}
                  onSetAutoSyncSinceDate={onSetAutoSyncSinceDate}
                />
              </div>

              <div className="space-y-4">
                <MailboxRecovery
                  accountId={accountId}
                  folderId={folderId}
                  debugInfo={debugInfo}
                  debugError={debugError}
                  actionStatus={actionStatus}
                  activeAction={activeAction}
                  canInspectMailbox={canInspectMailbox}
                  onRefresh={handleRefreshDebugInfo}
                  onClearProcessedIds={handleClearProcessedIds}
                  onReprocessUnreadNow={handleReprocessUnreadNow}
                />

                <RecentActivity
                  debugLoading={debugLoading}
                  canInspectMailbox={canInspectMailbox}
                  recentEntries={recentEntries}
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
