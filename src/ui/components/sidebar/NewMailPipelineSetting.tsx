import { useState } from "react";
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
}

export function NewMailPipelineSetting({
  open,
  onOpenChange,
  autoSyncAgentIds,
  onAddAutoSyncAgent,
  onRemoveAutoSyncAgent,
  autoSyncRoutingRules,
  onAddAutoSyncRoutingRule,
  onRemoveAutoSyncRoutingRule,
}: NewMailPipelineSettingProps) {
  const [newAgentId, setNewAgentId] = useState("");
  const [newRuleFromPattern, setNewRuleFromPattern] = useState("");
  const [newRuleAgentId, setNewRuleAgentId] = useState("");

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl">
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
            <div className="flex-1">
              <AgentDropdown
                value={newAgentId}
                onChange={setNewAgentId}
              />
            </div>
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
                <div className="flex-1">
                  <AgentDropdown
                    value={newRuleAgentId}
                    onChange={setNewRuleAgentId}
                  />
                </div>
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
  );
}
