import { useState, useCallback } from "react";
import { AgentDropdown } from "../../../../features/chat/components/AgentDropdown";
import { SettingsSection } from "./SettingsSection";

interface AgentSelectorProps {
  autoSyncAgentIds: string[];
  onAddAutoSyncAgent: (agentId: string) => void;
  onRemoveAutoSyncAgent: (agentId: string) => void;
}

export function AgentSelector({
  autoSyncAgentIds,
  onAddAutoSyncAgent,
  onRemoveAutoSyncAgent,
}: AgentSelectorProps) {
  const [newAgentId, setNewAgentId] = useState("");

  const handleAddAgent = useCallback(() => {
    const trimmed = newAgentId.trim();
    if (!trimmed) return;
    onAddAutoSyncAgent(trimmed);
    setNewAgentId("");
  }, [newAgentId, onAddAutoSyncAgent]);

  return (
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
  );
}
