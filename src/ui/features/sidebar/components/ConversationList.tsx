import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import type { SessionView } from "../../../store/useAppStore";

type ConversationListSession = Pick<SessionView, "id" | "title" | "updatedAt" | "lastPrompt">;

interface ConversationListProps {
  sessions: ConversationListSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  emptyMessage?: string;
  getSessionTitle?: (session: ConversationListSession) => string;
  getSessionSubtitle?: (session: ConversationListSession) => string | undefined;
}

export function ConversationList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onResumeSession,
  onRenameSession,
  emptyMessage = "No conversations yet.",
  getSessionTitle,
  getSessionSubtitle,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingId) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editingId]);

  const finishEditing = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  const commitRename = (session: ConversationListSession) => {
    if (!editingId || editingId !== session.id) return;
    const nextTitle = draftTitle.trim();
    if (nextTitle.length === 0 || nextTitle === session.title) {
      finishEditing();
      return;
    }
    onRenameSession(session.id, nextTitle);
    finishEditing();
  };

  if (sessions.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sessions.map((session) => {
        const isActive = activeSessionId === session.id;
        const isEditing = editingId === session.id;
        const displayTitle = getSessionTitle?.(session) || session.title || "Untitled session";
        const subtitle = getSessionSubtitle?.(session);

        return (
          <div
            key={session.id}
            className={`group flex items-center justify-between rounded-md border border-transparent pl-3 pr-2 py-2 text-sm text-ink-600 transition ${
              isActive
                ? "border-l-2 border-l-[var(--color-accent)] bg-[var(--color-sidebar-active)] text-ink-900"
                : "border-l-2 border-l-transparent hover:border-l-[var(--color-accent)] hover:bg-[var(--color-sidebar-hover)] hover:text-ink-800"
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectSession(session.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectSession(session.id);
              }
            }}
          >
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="w-full rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1 text-sm font-medium text-ink-900 shadow-sm focus:border-[var(--color-accent-hover)] focus:outline-none"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitRename(session)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename(session);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      finishEditing();
                    }
                  }}
                />
              ) : (
                <div className="min-w-0">
                  <span className="block truncate font-medium text-ink-800">
                    {displayTitle}
                  </span>
                  {subtitle ? (
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {subtitle}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-ink-400 opacity-0 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-600 focus:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  aria-label="Conversation menu"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 min-w-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
                  align="end"
                  sideOffset={6}
                >
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none transition hover:bg-[var(--color-sidebar-hover)]"
                    onSelect={(event) => {
                      event.preventDefault();
                      setDraftTitle(session.title ?? "Untitled session");
                      setEditingId(session.id);
                    }}
                  >
                    Rename
                  </DropdownMenu.Item>
                  {onResumeSession && (
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none transition hover:bg-[var(--color-sidebar-hover)]"
                      onSelect={() => onResumeSession(session.id)}
                    >
                      Resume in Vera
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-error outline-none transition hover:bg-error/10"
                    onSelect={() => onDeleteSession(session.id)}
                  >
                    Delete conversation
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        );
      })}
    </div>
  );
}
