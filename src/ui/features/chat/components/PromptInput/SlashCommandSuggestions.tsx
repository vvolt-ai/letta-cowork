/**
 * SlashCommandSuggestions component - shows slash command dropdown.
 */

import { memo } from "react";
import type { SlashCommandSuggestion } from "./hooks/useSlashCommands";

export interface SlashCommandSuggestionsProps {
  suggestions: SlashCommandSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SlashCommandSuggestion) => void;
}

export const SlashCommandSuggestions = memo(function SlashCommandSuggestions({
  suggestions,
  selectedIndex,
  onSelect,
}: SlashCommandSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/70 p-2">
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        Commands
      </div>
      <div className="space-y-1">
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.command}
            type="button"
            onClick={() => onSelect(suggestion)}
            className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition ${
              index === selectedIndex
                ? "bg-[var(--color-accent)]/10 text-ink-800"
                : "hover:bg-white/80 text-ink-700"
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {suggestion.command}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  suggestion.status === "supported"
                    ? "bg-[var(--color-status-completed)]/10 text-[var(--color-status-completed)]"
                    : "bg-ink-900/6 text-muted"
                }`}
              >
                {suggestion.status === "supported" ? "Live" : "Info"}
              </span>
            </span>
            <span className="ml-3 text-[11px] text-muted">{suggestion.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
