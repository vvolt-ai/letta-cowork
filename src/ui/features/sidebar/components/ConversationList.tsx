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
  maxVisible?: number;
}

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
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
  maxVisible = 4,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [showAll, setShowAll] = useState(false);
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
      <div className="px-3 py-2 text-xs text-muted">{emptyMessage}</div>
    );
  }

  const visible = showAll ? sessions : sessions.slice(0, maxVisible);
  const hasMore = sessions.length > maxVisible;

  return (
    <div className="flex flex-col">
      {visible.map((session) => {
        const isActive = activeSessionId === session.id;
        const isEditing = editingId === session.id;
        const displayTitle = getSessionTitle?.(session) || session.title || "Untitled session";
        const subtitle = getSessionSubtitle?.(session);
        const relTime = formatRelativeTime(session.updatedAt);

        return (
          <div
            key={session.id}
            className={`group relative flex items-center gap-2 px-4 py-[7px] cursor-pointer transition-colors ${
              isActive
                ? "bg-[var(--color-sidebar-active)] text-ink-900"
                : "text-ink-600 hover:bg-[var(--color-sidebar-hover)] hover:text-ink-800"
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
                  className="w-full rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-1.5 py-0.5 text-sm text-ink-900 outline-none"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitRename(session)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); commitRename(session); }
                    if (event.key === "Escape") { event.preventDefault(); finishEditing(); }
                  }}
                />
              ) : (
                <div className="min-w-0">
                  <span className={`block truncate text-[13.5px] ${isActive ? "font-medium text-ink-900" : "text-ink-700"}`}>
                    {displayTitle}
                  </span>
                  {subtitle ? (
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{subtitle}</span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Relative time — hidden on hover, replaced by menu */}
            <span className={`shrink-0 text-[11.5px] text-muted transition-opacity ${!isEditing ? "group-hover:opacity-0" : ""}`}>
              {relTime}
            </span>

            {/* Context menu — appears on hover */}
            {!isEditing && (
              <div className="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:text-ink-600"
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
                      className="z-50 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
                      align="end"
                      sideOffset={6}
                    >
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-[var(--color-sidebar-hover)]"
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
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-[var(--color-sidebar-hover)]"
                          onSelect={() => onResumeSession(session.id)}
                        >
                          Resume in Vera
                        </DropdownMenu.Item>
                      )}
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-error outline-none hover:bg-error/10"
                        onSelect={() => onDeleteSession(session.id)}
                      >
                        Delete conversation
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            )}
          </div>
        );
      })}

      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="px-4 py-1.5 text-left text-[12.5px] text-muted hover:text-ink-700 transition-colors"
        >
          Show more
        </button>
      )}
      {showAll && hasMore && (
        <button
          onClick={() => setShowAll(false)}
          className="px-4 py-1.5 text-left text-[12.5px] text-muted hover:text-ink-700 transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}
