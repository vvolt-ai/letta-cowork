/**
 * ModelSelector component - model dropdown and reasoning toggle.
 */

import { memo } from "react";

export interface ModelOption {
  name: string;
  display_name?: string | null;
  provider_type: string;
}

export interface ModelSelectorProps {
  models: ModelOption[];
  selectedModel: string;
  hasSelectedModelOption: boolean;
  modelsLoading: boolean;
  showReasoningInChat: boolean;
  onSelectModel: (model: string) => void;
  onToggleReasoning: () => void;
}

export const ModelSelector = memo(function ModelSelector({
  models,
  selectedModel,
  hasSelectedModelOption,
  modelsLoading,
  showReasoningInChat,
  onSelectModel,
  onToggleReasoning,
}: ModelSelectorProps) {
  if (!modelsLoading && models.length === 0) return null;

  return (
    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-500">
      <div className="flex items-center gap-2 min-w-0">
        <select
          className="h-6 min-w-[140px] rounded-full border border-[var(--color-border)] bg-transparent px-2 text-[11px] text-ink-600 transition hover:border-[var(--color-accent)] focus:border-[var(--color-border)] focus:outline-none focus:ring-0"
          value={selectedModel}
          onChange={(event) => onSelectModel(event.target.value)}
          disabled={modelsLoading}
          aria-label="Select model"
        >
          <option value="">Default (agent model)</option>
          {hasSelectedModelOption ? <option value={selectedModel}>{selectedModel}</option> : null}
          {models.map((model) => (
            <option key={model.name} value={model.name}>
              {(model.display_name || model.name) +
                (model.provider_type ? ` · ${model.provider_type}` : "")}
            </option>
          ))}
        </select>
        {modelsLoading ? <span className="text-muted">Loading…</span> : null}
      </div>
      <button
        type="button"
        onClick={onToggleReasoning}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
          showReasoningInChat
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-600"
        }`}
        aria-pressed={showReasoningInChat}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            showReasoningInChat ? "bg-[var(--color-accent)]" : "bg-ink-400"
          }`}
        />
        Reasoning
      </button>
    </div>
  );
});
