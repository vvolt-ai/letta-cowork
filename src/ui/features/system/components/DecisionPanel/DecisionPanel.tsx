import { useEffect, useState } from "react";

import type { PermissionRequest } from "../../../../store/useAppStore";
import type { CanUseToolResponse } from "../../../../types";

type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
  answers?: Record<string, string>;
};

export function DecisionPanel({
  request,
  onSubmit
}: {
  request: PermissionRequest;
  onSubmit: (result: CanUseToolResponse) => void;
}) {
  const input = request.input as AskUserQuestionInput | null;
  const questions = input?.questions ?? [];
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    setSelectedOptions({});
    setOtherInputs({});
  }, [request.toolUseId]);

  const toggleOption = (qIndex: number, optionLabel: string, multiSelect?: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[qIndex] ?? [];
      if (multiSelect) {
        const next = current.includes(optionLabel)
          ? current.filter((label) => label !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [qIndex]: next };
      }
      return { ...prev, [qIndex]: [optionLabel] };
    });
  };

  const canSubmit = questions.every((_, qIndex) => {
    const selected = selectedOptions[qIndex] ?? [];
    const otherText = otherInputs[qIndex]?.trim() ?? "";
    return selected.length > 0 || otherText.length > 0;
  });

  // Build answers object from selections
  const buildAnswers = (): Record<string, string> => {
    const answers: Record<string, string> = {};
    questions.forEach((q, qIndex) => {
      const selected = selectedOptions[qIndex] ?? [];
      const otherText = otherInputs[qIndex]?.trim() ?? "";
      // Prefer other text if provided, otherwise use selected options
      if (otherText) {
        answers[q.question] = otherText;
      } else if (selected.length > 0) {
        answers[q.question] = selected.join(", ");
      }
    });
    return answers;
  };

  // Build updatedInput with answers injected
  const buildUpdatedInput = (): Record<string, unknown> => ({
    ...input,
    answers: buildAnswers(),
  });

  if (request.toolName === "AskUserQuestion" && questions.length > 0) {
    const hasMultipleQuestions = questions.length > 1;
    const requiresSubmitButton = hasMultipleQuestions || questions.some((q) => q.multiSelect || !q.options?.length);

    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-soft)]">
        <div className="space-y-2">
          {questions.map((q, qIndex) => {
            const options = q.options ?? [];
            const selected = selectedOptions[qIndex] ?? [];
            return (
              <div key={qIndex} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-subtle)] text-[11px] font-bold text-[var(--color-accent)]">?</span>
                <span className="font-medium text-ink-800">{q.question}</span>
                {q.header ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{q.header}</span> : null}

                {options.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {options.map((option, optIndex) => {
                      const isSelected = selected.includes(option.label);
                      const shouldAutoSubmit = questions.length === 1 && !q.multiSelect;
                      return (
                        <button
                          key={optIndex}
                          type="button"
                          title={option.description}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                            isSelected
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                              : "border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-700 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
                          }`}
                          onClick={() => {
                            if (shouldAutoSubmit) {
                              onSubmit({
                                behavior: "allow",
                                updatedInput: {
                                  ...input,
                                  answers: { [q.question]: option.label },
                                },
                              });
                              return;
                            }
                            toggleOption(qIndex, option.label, q.multiSelect);
                          }}
                        >
                          {isSelected ? "✓ " : ""}{option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="min-w-[220px] flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-ink-800 focus:border-accent focus:outline-none"
                    placeholder="Type answer…"
                    value={otherInputs[qIndex] ?? ""}
                    onChange={(e) => setOtherInputs((prev) => ({ ...prev, [qIndex]: e.target.value }))}
                  />
                )}

                {q.multiSelect ? <span className="text-xs text-gray-500">multi-select</span> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
          <span className="text-xs text-gray-500">Input needed to continue</span>
          <div className="flex items-center gap-2">
            {requiresSubmitButton ? (
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  canSubmit ? "bg-accent text-white hover:bg-accent-hover" : "cursor-not-allowed bg-gray-100 text-gray-400"
                }`}
                onClick={() => {
                  if (!canSubmit) return;
                  onSubmit({ behavior: "allow", updatedInput: buildUpdatedInput() });
                }}
                disabled={!canSubmit}
              >
                Submit
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              onClick={() => onSubmit({ behavior: "deny", message: "User canceled the question" })}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-accent)]">Approval required</div>
          <p className="mt-1 text-sm text-ink-700">
            Vera wants to run <span className="font-semibold text-ink-900">{request.toolName}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3">
        <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap break-words max-h-40 overflow-auto">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-ink-700 transition hover:border-[var(--color-error)]/50 hover:text-[var(--color-error)]"
          onClick={() => onSubmit({ behavior: "deny", message: `User denied ${request.toolName}` })}
        >
          Deny
        </button>
        <button
          className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-[var(--color-accent-hover)]"
          onClick={() => onSubmit({ behavior: "allow" })}
        >
          Allow once
        </button>
      </div>
    </div>
  );
}
