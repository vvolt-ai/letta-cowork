import { AgentDropdown } from "../../../../features/chat/components/AgentDropdown";
import { SettingsSection } from "./SettingsSection";
import type { RoutingRule } from "../../types";

interface RoutingRulesProps {
  rules: RoutingRule[];
  newRuleFromPattern: string;
  setNewRuleFromPattern: (value: string) => void;
  newRuleAgentId: string;
  setNewRuleAgentId: (value: string) => void;
  onAddRule: () => void;
  onRemoveRule: (index: number) => void;
  canAddRule: boolean;
}

export function RoutingRules({
  rules,
  newRuleFromPattern,
  setNewRuleFromPattern,
  newRuleAgentId,
  setNewRuleAgentId,
  onAddRule,
  onRemoveRule,
}: RoutingRulesProps) {
  return (
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
            onClick={onAddRule}
          >
            Add rule
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-56 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-900/15 bg-surface-secondary/50 px-4 py-4 text-xs text-muted">
            No sender rules yet. If all unread email can go to the same fallback agents, you can leave this empty.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => (
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
                    onClick={() => onRemoveRule(index)}
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
  );
}
