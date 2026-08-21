/**
 * Searchable Letta-style model picker and reasoning toggle.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";

export interface ModelOption {
  /** Fully qualified model handle used for runtime selection. */
  name: string;
  model_name?: string | null;
  display_name?: string | null;
  provider_type: string;
  provider_name?: string | null;
  provider_category?: "base" | "byok" | null;
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

type ModelFilter = "all" | "hosted" | "byok";
type ModelCategory = "hosted" | "byok" | "other";

function getModelCategory(model: ModelOption): ModelCategory {
  if (model.provider_category === "byok") return "byok";
  if (model.provider_category === "base") return "hosted";
  return "other";
}

function getModelLabel(model: ModelOption): string {
  return model.display_name?.trim() || model.model_name?.trim() || model.name;
}

function getProviderLabel(model: ModelOption): string {
  return model.provider_name?.trim() || model.provider_type?.trim() || "Other";
}

function ModelBadge({ category }: { category: ModelCategory }) {
  if (category === "other") return null;
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none ${
        category === "byok"
          ? "border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
          : "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:text-violet-300"
      }`}
    >
      {category === "byok" ? "BYOK" : "Hosted"}
    </span>
  );
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModelFilter>("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => models.find((model) => model.name === selectedModel),
    [models, selectedModel],
  );

  const counts = useMemo(() => {
    let hosted = 0;
    let byok = 0;
    for (const model of models) {
      const category = getModelCategory(model);
      if (category === "hosted") hosted += 1;
      if (category === "byok") byok += 1;
    }
    return { all: models.length, hosted, byok };
  }, [models]);

  const visibleModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return models
      .filter((model) => {
        const category = getModelCategory(model);
        if (filter !== "all" && category !== filter) return false;
        if (!normalizedQuery) return true;
        return [
          getModelLabel(model),
          model.name,
          model.model_name,
          getProviderLabel(model),
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        const providerOrder = getProviderLabel(left).localeCompare(getProviderLabel(right));
        return providerOrder || getModelLabel(left).localeCompare(getModelLabel(right));
      });
  }, [filter, models, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => searchRef.current?.focus());

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!modelsLoading && models.length === 0) return null;

  const selectModel = (model: string) => {
    onSelectModel(model);
    setOpen(false);
  };
  const triggerLabel = selectedOption
    ? getModelLabel(selectedOption)
    : selectedModel || "Default (agent model)";

  return (
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-ink-500">
      <div ref={rootRef} className="relative min-w-0">
        <button
          type="button"
          className="flex h-7 min-w-[190px] max-w-[580px] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-000)]/60 px-3 text-left text-[11px] text-ink-600 transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setOpen((current) => !current)}
          disabled={modelsLoading}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select model"
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          {selectedOption ? <ModelBadge category={getModelCategory(selectedOption)} /> : null}
          <svg
            viewBox="0 0 20 20"
            className={`h-3 w-3 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </button>

        {open ? (
          <div className="absolute bottom-full left-0 z-[80] mb-2 w-[min(720px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="p-2 pb-0">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 focus-within:border-[var(--color-accent)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && visibleModels[0]) {
                      event.preventDefault();
                      selectModel(visibleModels[0].name);
                    }
                  }}
                  placeholder="Search models or providers"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink-800 outline-none placeholder:text-muted"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="rounded p-1 text-muted transition hover:bg-[var(--color-bg-100)] hover:text-ink-700"
                    aria-label="Clear model search"
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m5 5 10 10M15 5 5 15" />
                    </svg>
                  </button>
                ) : null}
              </label>
            </div>

            <div className="flex gap-1 border-b border-[var(--color-border)] px-2 py-2" role="tablist" aria-label="Model categories">
              {([
                ["all", "All", counts.all],
                ["hosted", "Hosted", counts.hosted],
                ["byok", "BYOK", counts.byok],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    filter === value
                      ? "bg-[var(--color-bg-200)] text-ink-900"
                      : "text-muted hover:bg-[var(--color-bg-100)] hover:text-ink-700"
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

            <div className="max-h-[440px] overflow-y-auto p-2" role="listbox" aria-label="Available models">
              {!query && filter === "all" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedModel}
                  onClick={() => selectModel("")}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    !selectedModel
                      ? "bg-[var(--color-accent-light)]"
                      : "hover:bg-[var(--color-bg-100)]"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-muted">
                    A
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-800">Default (agent model)</span>
                    <span className="block text-[11px] text-muted">Use the model configured on this agent</span>
                  </span>
                  {!selectedModel ? (
                    <svg viewBox="0 0 20 20" className="h-4 w-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m4 10 4 4 8-9" />
                    </svg>
                  ) : null}
                </button>
              ) : null}

              {hasSelectedModelOption && selectedModel && !selectedOption ? (
                <button
                  type="button"
                  role="option"
                  aria-selected="true"
                  onClick={() => selectModel(selectedModel)}
                  className="mb-1 flex w-full items-center rounded-lg bg-[var(--color-accent-light)] px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{selectedModel}</span>
                  <span className="ml-3 text-[10px] text-muted">Current</span>
                </button>
              ) : null}

              {visibleModels.map((model) => {
                const category = getModelCategory(model);
                const isSelected = model.name === selectedModel;
                return (
                  <button
                    key={model.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectModel(model.name)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "bg-[var(--color-accent-light)]"
                        : "hover:bg-[var(--color-bg-100)]"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] font-semibold uppercase text-muted">
                      {getProviderLabel(model).slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-800">
                        {getModelLabel(model)}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{model.name}</span>
                    </span>
                    <ModelBadge category={category} />
                    {isSelected ? (
                      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m4 10 4 4 8-9" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}

              {visibleModels.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted">
                  No models match this search and category.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {modelsLoading ? <span className="mr-auto text-muted">Loading…</span> : null}
      <button
        type="button"
        onClick={onToggleReasoning}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
          showReasoningInChat
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-bg-000)]/60 text-ink-600"
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
