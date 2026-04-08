import { useState, useCallback } from "react";
import type { RoutingRule } from "../../../types";

interface UseRoutingRulesOptions {
  autoSyncRoutingRules: RoutingRule[];
  onAddAutoSyncRoutingRule: (fromPattern: string, agentId: string) => void;
  onRemoveAutoSyncRoutingRule: (index: number) => void;
}

export function useRoutingRules({
  autoSyncRoutingRules,
  onAddAutoSyncRoutingRule,
  onRemoveAutoSyncRoutingRule,
}: UseRoutingRulesOptions) {
  const [newRuleFromPattern, setNewRuleFromPattern] = useState("");
  const [newRuleAgentId, setNewRuleAgentId] = useState("");

  const handleAddRule = useCallback(() => {
    const fromPattern = newRuleFromPattern.trim();
    const agentId = newRuleAgentId.trim();
    if (!fromPattern || !agentId) return;
    onAddAutoSyncRoutingRule(fromPattern, agentId);
    setNewRuleFromPattern("");
    setNewRuleAgentId("");
  }, [newRuleFromPattern, newRuleAgentId, onAddAutoSyncRoutingRule]);

  const handleRemoveRule = useCallback(
    (index: number) => {
      onRemoveAutoSyncRoutingRule(index);
    },
    [onRemoveAutoSyncRoutingRule]
  );

  const canAddRule = newRuleFromPattern.trim().length > 0 && newRuleAgentId.trim().length > 0;

  return {
    rules: autoSyncRoutingRules,
    newRuleFromPattern,
    setNewRuleFromPattern,
    newRuleAgentId,
    setNewRuleAgentId,
    handleAddRule,
    handleRemoveRule,
    canAddRule,
  };
}
