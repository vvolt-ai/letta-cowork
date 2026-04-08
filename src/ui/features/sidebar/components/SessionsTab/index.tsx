import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../../store/useAppStore";
import { SidebarSection } from "../SidebarSection";
import { AgentGroup } from "../AgentGroup";
import { ConversationList } from "../ConversationList";
import type { SidebarSessionSummary, EmailConversationDateFilter } from "../../types";
import {
  getAutoEmailSessionMetadata,
  getAutoEmailSessionSubject,
  isAutoEmailSession,
  sanitizeSessionTitle,
} from "../../../../utils/session";

const selectSidebarSessionTokens = (state: ReturnType<typeof useAppStore.getState>): string[] => {
  return Object.values(state.sessions)
    .filter((session) => {
      // Filter out email/background sessions
      if (session.isEmailSession) return false;
      if (session.title?.startsWith("Email:")) return false;
      if (session.title?.startsWith("Auto Email:")) return false;
      return true;
    })
    .map((session) => JSON.stringify({
      id: session.id,
      title: session.title,
      status: session.status,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      lastPrompt: session.lastPrompt,
      isEmailSession: session.isEmailSession,
      agentId: session.agentId,
      agentName: session.agentName,
    } satisfies SidebarSessionSummary))
    .sort((left, right) => {
      const parsedLeft = JSON.parse(left) as SidebarSessionSummary;
      const parsedRight = JSON.parse(right) as SidebarSessionSummary;
      return (parsedRight.updatedAt ?? 0) - (parsedLeft.updatedAt ?? 0);
    });
};

interface SessionsTabProps {
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onOpenEmailView: () => void;
  coworkSettings: {
    showEmailAutomation: boolean;
    showLettaEnv: boolean;
  };
  emails: Array<{
    status?: string | number;
    status2?: string | number;
  }>;
}

export const SessionsTab = memo(function SessionsTab({
  onNewSession,
  onDeleteSession,
  onResumeSession,
  onOpenEmailView,
  coworkSettings,
  emails,
}: SessionsTabProps) {
  const sessionTokens = useAppStore(useShallow(selectSidebarSessionTokens));
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const renameSession = useAppStore((state) => state.renameSession);

  const normalizedSessionList = useMemo(() => {
    return sessionTokens.map((token) => {
      const session = JSON.parse(token) as SidebarSessionSummary;
      return {
        ...session,
        title: !session.title || session.title.startsWith("conv-") ? "New conversation" : session.title,
      };
    });
  }, [sessionTokens]);

  const sessionById = useMemo(
    () => new Map(normalizedSessionList.map((session) => [session.id, session] as const)),
    [normalizedSessionList]
  );

  const regularSessions = useMemo(
    () => normalizedSessionList.filter((session) => !isAutoEmailSession(session)),
    [normalizedSessionList]
  );

  // Group regular sessions by agent
  const sessionsGroupedByAgent = useMemo(() => {
    const groups = new Map<string, { agentId: string | undefined; agentName: string | undefined; sessions: typeof regularSessions }>();
    
    // Add "Unknown" group first
    groups.set("unknown", { agentId: undefined, agentName: undefined, sessions: [] });
    
    for (const session of regularSessions) {
      const agentKey = session.agentId || "unknown";
      if (!groups.has(agentKey)) {
        groups.set(agentKey, {
          agentId: session.agentId,
          agentName: session.agentName,
          sessions: [],
        });
      }
      groups.get(agentKey)!.sessions.push(session);
    }
    
    // Remove empty "unknown" group
    if (groups.get("unknown")?.sessions.length === 0) {
      groups.delete("unknown");
    }
    
    // Convert to array and sort by agent name
    return Array.from(groups.values()).sort((a, b) => {
      const aName = a.agentName || "Unknown";
      const bName = b.agentName || "Unknown";
      return aName.localeCompare(bName);
    });
  }, [regularSessions]);

  const autoEmailSessions = useMemo(
    () => normalizedSessionList.filter((session) => isAutoEmailSession(session)),
    [normalizedSessionList]
  );

  const [showEmailConversations, setShowEmailConversations] = useState(false);
  const [emailSenderFilter, setEmailSenderFilter] = useState("all");
  const [emailDateFilter, setEmailDateFilter] = useState<EmailConversationDateFilter>("all");

  const autoEmailSessionEntries = useMemo(
    () => autoEmailSessions.map((session) => ({ session, metadata: getAutoEmailSessionMetadata(session) })),
    [autoEmailSessions]
  );

  const autoEmailMetadataBySessionId = useMemo(() => {
    return new Map(
      autoEmailSessionEntries
        .filter((entry) => entry.metadata)
        .map((entry) => [entry.session.id, entry.metadata] as const)
    );
  }, [autoEmailSessionEntries]);

  const activeAutoEmailSession = useMemo(() => {
    if (!activeSessionId) return null;
    return autoEmailSessions.find((session) => session.id === activeSessionId) ?? null;
  }, [activeSessionId, autoEmailSessions]);

  useEffect(() => {
    if (activeAutoEmailSession) {
      setShowEmailConversations(true);
      setEmailSenderFilter("all");
      setEmailDateFilter("all");
    }
  }, [activeAutoEmailSession]);

  const emailSenderOptions = useMemo(() => {
    return Array.from(
      new Set(
        autoEmailSessionEntries
          .map((entry) => entry.metadata?.sender)
          .filter((sender): sender is string => Boolean(sender))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [autoEmailSessionEntries]);

  const filteredAutoEmailSessionEntries = useMemo(() => {
    return autoEmailSessionEntries.filter(({ metadata }) => {
      const senderMatches =
        emailSenderFilter === "all" ||
        (metadata?.sender ?? "Unknown sender") === emailSenderFilter;
      const dateMatches =
        emailDateFilter === "all" ||
        (metadata?.dateBucket ?? "unknown") === emailDateFilter;
      return senderMatches && dateMatches;
    });
  }, [autoEmailSessionEntries, emailDateFilter, emailSenderFilter]);

  const groupedAutoEmailSessions = useMemo(() => {
    const dateGroups = new Map<string, {
      key: string;
      label: string;
      sortValue: number;
      senders: Map<string, { key: string; label: string; sessions: typeof autoEmailSessions }>;
    }>();

    for (const { session, metadata } of filteredAutoEmailSessionEntries) {
      const dateKey = metadata?.receivedDateKey ?? "unknown-date";
      const dateLabel = metadata?.receivedDateLabel ?? "Unknown date";
      const senderKey = metadata?.senderKey ?? "unknown-sender";
      const senderLabel = metadata?.sender ?? "Unknown sender";
      const sortValue = metadata?.receivedAt ?? session.updatedAt ?? 0;

      let dateGroup = dateGroups.get(dateKey);
      if (!dateGroup) {
        dateGroup = {
          key: dateKey,
          label: dateLabel,
          sortValue,
          senders: new Map(),
        };
        dateGroups.set(dateKey, dateGroup);
      } else if (sortValue > dateGroup.sortValue) {
        dateGroup.sortValue = sortValue;
      }

      let senderGroup = dateGroup.senders.get(senderKey);
      if (!senderGroup) {
        senderGroup = {
          key: senderKey,
          label: senderLabel,
          sessions: [],
        };
        dateGroup.senders.set(senderKey, senderGroup);
      }

      senderGroup.sessions.push(session);
    }

    return Array.from(dateGroups.values())
      .sort((a, b) => b.sortValue - a.sortValue)
      .map((dateGroup) => ({
        ...dateGroup,
        senders: Array.from(dateGroup.senders.values())
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((senderGroup) => ({
            ...senderGroup,
            sessions: [...senderGroup.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
          })),
      }));
  }, [filteredAutoEmailSessionEntries]);

  const unreadCount = useMemo(() => {
    return emails.filter((email) => {
      const status = String(email.status ?? "").toLowerCase();
      const status2 = String(email.status2 ?? "").toLowerCase();
      return (
        status.includes("unread") ||
        status2.includes("unread") ||
        status === "0" ||
        status2 === "0"
      );
    }).length;
  }, [emails]);

  const handleRenameSession = useCallback(
    (sessionId: string, title: string) => {
      const session = sessionById.get(sessionId);
      if (!session) return;
      const sanitized = sanitizeSessionTitle(title, session.title?.trim() || "Untitled session");
      if (sanitized === session.title) return;
      renameSession(sessionId, sanitized);
    },
    [renameSession, sessionById]
  );

  return (
    <div className="space-y-4">
      <button
        onClick={onNewSession}
        className="flex h-8 w-full items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
      >
        New Task
      </button>
      <SidebarSection title="Conversations">
        {sessionsGroupedByAgent.length > 0 ? (
          <div className="space-y-1">
            {sessionsGroupedByAgent.map((group) => (
              <AgentGroup
                key={group.agentId || "unknown"}
                agentId={group.agentId}
                agentName={group.agentName}
                sessions={group.sessions}
                activeSessionId={activeSessionId}
                onSelectSession={setActiveSessionId}
                onDeleteSession={onDeleteSession}
                onResumeSession={onResumeSession}
                onRenameSession={handleRenameSession}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
            No conversations yet.
          </div>
        )}
      </SidebarSection>

      {(coworkSettings.showEmailAutomation || autoEmailSessions.length > 0) ? (
        <SidebarSection
          title="Email Conversations"
          action={
            coworkSettings.showEmailAutomation ? (
              <button
                type="button"
                onClick={onOpenEmailView}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0.5 text-[11px] font-semibold text-ink-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                <span>Inbox</span>
                <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                  {unreadCount}
                </span>
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                {unreadCount} unread
              </span>
            )
          }
        >
          {autoEmailSessions.length > 0 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowEmailConversations((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                  showEmailConversations || activeAutoEmailSession
                    ? "border-[var(--color-accent)] bg-[var(--color-sidebar-active)] text-ink-900"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 hover:border-[var(--color-accent)] hover:bg-[var(--color-sidebar-hover)]"
                }`}
                aria-expanded={showEmailConversations}
                aria-label="Toggle email conversations"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 shrink-0 transition-transform ${showEmailConversations ? "rotate-90" : "rotate-0"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="truncate font-medium">Show email conversations</span>
                </div>
                <span className="ml-3 inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs font-semibold text-ink-700">
                  {unreadCount}
                </span>
              </button>

              {showEmailConversations ? (
                <div className="space-y-3 pl-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Sender</span>
                      <select
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-ink-800 transition focus:border-[var(--color-accent)] focus:outline-none"
                        value={emailSenderFilter}
                        onChange={(event) => setEmailSenderFilter(event.target.value)}
                      >
                        <option value="all">All senders</option>
                        {emailSenderOptions.map((sender) => (
                          <option key={sender} value={sender}>
                            {sender}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Date</span>
                      <select
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-ink-800 transition focus:border-[var(--color-accent)] focus:outline-none"
                        value={emailDateFilter}
                        onChange={(event) => setEmailDateFilter(event.target.value as EmailConversationDateFilter)}
                      >
                        <option value="all">All dates</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="older">Older</option>
                      </select>
                    </label>
                  </div>

                  {groupedAutoEmailSessions.length > 0 ? (
                    <div className="space-y-3">
                      {groupedAutoEmailSessions.map((dateGroup) => (
                        <div key={dateGroup.key} className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            {dateGroup.label}
                          </div>
                          <div className="space-y-2">
                            {dateGroup.senders.map((senderGroup) => (
                              <div key={`${dateGroup.key}-${senderGroup.key}`} className="space-y-1.5">
                                <div className="text-xs font-medium text-ink-600">
                                  {senderGroup.label}
                                </div>
                                <ConversationList
                                  sessions={senderGroup.sessions}
                                  activeSessionId={activeSessionId}
                                  onSelectSession={setActiveSessionId}
                                  onDeleteSession={onDeleteSession}
                                  onResumeSession={onResumeSession}
                                  onRenameSession={handleRenameSession}
                                  getSessionTitle={(session) => getAutoEmailSessionSubject(session.title || "", session.lastPrompt)}
                                  getSessionSubtitle={(session) => {
                                    const metadata = autoEmailMetadataBySessionId.get(session.id);
                                    return metadata?.receivedTimeLabel ? `Received ${metadata.receivedTimeLabel}` : undefined;
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
                      No email conversations match the selected filters.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-muted">
              No email conversations yet.
            </div>
          )}
        </SidebarSection>
      ) : null}
    </div>
  );
});

export default SessionsTab;
