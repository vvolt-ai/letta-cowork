/**
 * PromptTextArea component - textarea with attach, mic, and send buttons.
 */

import { memo, useCallback } from "react";

export interface PromptTextAreaProps {
  prompt: string;
  disabled: boolean;
  isRunning: boolean;
  isUploading: boolean;
  canSend: boolean;
  placeholder: string;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  onPromptChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onAttach: () => void;
  onSend: () => void;
  onStop: () => void;
  /** Speech-to-text */
  onMicToggle?: () => void;
  isMicListening?: boolean;
  interimTranscript?: string;
  isMicSupported?: boolean;
}

const MAX_HEIGHT = 12 * 21;

export const PromptTextArea = memo(function PromptTextArea({
  prompt,
  disabled,
  isRunning,
  isUploading,
  canSend,
  placeholder,
  promptRef,
  onPromptChange,
  onKeyDown,
  onPaste,
  onAttach,
  onSend,
  onStop,
  onMicToggle,
  isMicListening = false,
  interimTranscript = "",
  isMicSupported = false,
}: PromptTextAreaProps) {
  const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  }, []);

  return (
    <div className="mt-2 flex flex-col gap-1">
      {/* Interim transcript ghost text */}
      {isMicListening && interimTranscript && (
        <p className="px-4 text-xs text-muted italic truncate">{interimTranscript}…</p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onAttach}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          disabled={disabled && !isRunning}
          aria-label="Attach files"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M16.5 6.5l-7.1 7.1a3 3 0 104.2 4.2l6-6a4 4 0 10-5.7-5.7l-6.3 6.3" />
          </svg>
        </button>

        {/* Mic button — only rendered when Speech API is available */}
        {isMicSupported && (
          <button
            type="button"
            onClick={onMicToggle}
            title={isMicListening ? "Stop recording" : "Speak to write"}
            aria-label={isMicListening ? "Stop recording" : "Speak to write"}
            disabled={disabled && !isRunning}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border transition ${
              isMicListening
                ? "border-red-400 bg-red-50 text-red-500"
                : "border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-600 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            }`}
          >
            {/* Pulsing ring when listening */}
            {isMicListening && (
              <span className="absolute inset-0 rounded-[18px] animate-ping bg-red-400/30" />
            )}
            <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <textarea
          rows={1}
          className="flex-1 min-h-[52px] resize-none rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/70 px-3.5 py-2.5 text-sm leading-5 text-ink-800 placeholder:text-muted focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/10 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={isMicListening ? "Listening…" : placeholder}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={handleInput}
          onPaste={onPaste}
          ref={promptRef}
          disabled={disabled && !isRunning}
        />
        <button
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isRunning
              ? "bg-[var(--color-status-error)] text-white hover:bg-[var(--color-status-error)]/90"
              : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
          }`}
          onClick={isRunning ? onStop : onSend}
          aria-label={isRunning ? "Stop session" : "Send prompt"}
          disabled={(disabled && !isRunning) || (!isRunning && (!canSend || isUploading))}
        >
          {isRunning ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : isUploading ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" />
              <path className="opacity-75" d="M4 12a8 8 0 018-8" stroke="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});
