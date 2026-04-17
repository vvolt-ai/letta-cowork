import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZohoEmail } from "../../../../types";
import { buildZohoSearchKey, filterEmails } from "../EmailInboxModal/hooks/useEmailFilters";

interface SidebarEmailListProps {
  emails: ZohoEmail[];
  selectedEmailId?: string;
  isFetching: boolean;
  isProcessingEmailInput?: boolean;
  onSelectEmail: (email: ZohoEmail) => void;
  onViewEmail: (email: ZohoEmail) => void;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  onClose: () => void;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  processingEmailId?: string | null;
  successEmailId?: string | null;
  // Pagination props
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const SCROLL_THRESHOLD = 50;

const isUnreadEmail = (email: ZohoEmail) => {
  const status = String(email.status ?? "").toLowerCase();
  const status2 = String(email.status2 ?? "").toLowerCase();
  return (
    status.includes("unread") ||
    status2.includes("unread") ||
    status === "0" ||
    status2 === "0"
  );
};

export function SidebarEmailList({
  emails,
  selectedEmailId,
  isFetching,
  isProcessingEmailInput,
  onSelectEmail,
  onViewEmail,
  onUseEmailAsInput,
  onClose,
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  successEmailId,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: SidebarEmailListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Full-inbox server search state (debounced)
  const [serverResults, setServerResults] = useState<ZohoEmail[] | null>(null);
  const [serverSearching, setServerSearching] = useState(false);
  const [serverSearchError, setServerSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);

  // Client-side search across already-loaded emails. Matches subject, sender,
  // fromAddress, and summary — same semantics as the inbox modal.
  const localMatches = useMemo(
    () => (searchQuery.trim() ? filterEmails(emails, { searchQuery }) : emails),
    [emails, searchQuery]
  );
  const isSearching = searchQuery.trim().length > 0;

  // Debounced server search across the full inbox. Runs in parallel with the
  // local filter so the user sees instant client results, then sees older
  // matches merged in once the server responds.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setServerResults(null);
      setServerSearching(false);
      setServerSearchError(null);
      return;
    }

    const rid = ++searchRequestIdRef.current;
    setServerSearching(true);
    setServerSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const searchKey = buildZohoSearchKey(q);
        const resp: any = await (window as any).electron.searchEmails(undefined, {
          searchKey,
          limit: 50,
        });
        // Ignore if a newer request has superseded this one (race guard)
        if (rid !== searchRequestIdRef.current) return;
        const data: ZohoEmail[] = Array.isArray(resp?.data)
          ? (resp.data as ZohoEmail[])
          : Array.isArray(resp)
            ? (resp as ZohoEmail[])
            : [];
        setServerResults(data);
      } catch (err) {
        if (rid !== searchRequestIdRef.current) return;
        setServerSearchError(err instanceof Error ? err.message : "Search failed");
        setServerResults(null);
      } finally {
        if (rid === searchRequestIdRef.current) setServerSearching(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Merge local + server matches, dedupe by messageId. Local matches come
  // first so scroll position stays stable as server results arrive.
  const visibleEmails = useMemo(() => {
    if (!isSearching) return emails;
    if (!serverResults) return localMatches;
    const seen = new Set<string>();
    const merged: ZohoEmail[] = [];
    for (const e of localMatches) {
      const key = String(e.messageId ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
    for (const e of serverResults) {
      const key = String(e.messageId ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
    return merged;
  }, [isSearching, emails, localMatches, serverResults]);

  const serverOnlyCount = useMemo(() => {
    if (!serverResults || !isSearching) return 0;
    const localKeys = new Set(localMatches.map((e) => String(e.messageId ?? "")));
    return serverResults.filter((e) => {
      const k = String(e.messageId ?? "");
      return k && !localKeys.has(k);
    }).length;
  }, [serverResults, localMatches, isSearching]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    // Skip auto-pagination while actively searching — the filtered view is
    // client-side, so fetching more pages wouldn't necessarily reveal matches
    // and would confuse the search UX.
    if (!container || !onLoadMore || isLoadingMore || !hasMore || isSearching) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isNearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore, isSearching]);

  const formatDate = (timestamp: string) => {
    const ms = Number(timestamp);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toLocaleDateString();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-800">Inbox</span>
          {isSearching && (
            <span
              className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600"
              title={
                serverResults
                  ? `${localMatches.length} local + ${serverOnlyCount} from server`
                  : "Local matches (full-inbox search pending)"
              }
            >
              {visibleEmails.length} match{visibleEmails.length === 1 ? "" : "es"}
              {serverSearching && " …"}
            </span>
          )}
        </div>
        <button
          className="rounded-lg border border-[var(--color-border)] bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && searchQuery) {
              e.preventDefault();
              setSearchQuery("");
            }
          }}
          placeholder="Search full inbox… (try subject, sender, or sender:name@x.com)"
          aria-label="Search emails"
          className="w-full rounded-lg border border-[var(--color-border)] bg-surface py-1.5 pl-8 pr-7 text-xs text-ink-900 placeholder:text-ink-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 transition hover:bg-gray-100 hover:text-ink-700"
            aria-label="Clear search"
            title="Clear (Esc)"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        )}
      </div>

      {isFetching ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-xs text-muted">
          Loading emails…
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto pr-1"
              onScroll={handleScroll}
            >
              {visibleEmails.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted">
                  {isSearching ? (
                    serverSearching ? (
                      <span className="inline-flex items-center gap-2">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle className="opacity-20" cx="12" cy="12" r="10" />
                          <path d="M4 12a8 8 0 018-8" />
                        </svg>
                        Searching full inbox for &ldquo;{searchQuery}&rdquo;…
                      </span>
                    ) : (
                      <>
                        No emails match &ldquo;{searchQuery}&rdquo;.
                        <button
                          onClick={() => setSearchQuery("")}
                          className="ml-1 text-[var(--color-accent)] hover:underline"
                        >
                          Clear
                        </button>
                      </>
                    )
                  ) : (
                    "No emails found."
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1 px-1.5 py-1">
                  {visibleEmails.map((email) => {
                    const isUnread = isUnreadEmail(email);
                    const isSelected = selectedEmailId === email.messageId;
                    return (
                      <div
                        key={email.messageId}
                        className={`w-full cursor-pointer rounded-xl border px-2 py-1.5 text-left transition ${
                          isSelected
                            ? "border-accent/35 bg-accent-subtle"
                            : isUnread
                              ? "border-accent/30 bg-accent-subtle/50 hover:bg-accent-subtle"
                              : "border-ink-900/5 bg-surface hover:bg-surface-tertiary"
                        }`}
                        onClick={() => onSelectEmail(email)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectEmail(email);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-xs ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-800"}`}>
                            {email.sender || email.fromAddress || "Unknown sender"}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted">
                              {formatDate(email.receivedTime)}
                            </span>
                            <button
                              className="rounded-md border border-[var(--color-border)] bg-surface p-1 text-ink-600 hover:bg-surface-tertiary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewEmail(email);
                              }}
                              aria-label="View email details"
                              title="View email details"
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M1.5 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S1.5 12 1.5 12z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            <button
                              className="rounded-md border border-[var(--color-border)] bg-surface p-1 text-ink-600 hover:bg-surface-tertiary disabled:opacity-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUseEmailAsInput(email);
                              }}
                              disabled={isProcessingEmailInput}
                              aria-label="Use email as chat input"
                              title={isProcessingEmailInput ? "Processing email..." : "Use email as chat input"}
                            >
                              {isProcessingEmailInput ? (
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                  <path d="M12 2a10 10 0 0 1 10 10" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <path d="M4 5h16v10H7l-3 3z" />
                                </svg>
                              )}
                            </button>
                            {selectedAgentId && onProcessEmailToAgent && (
                              <button
                                className="rounded-md border border-[var(--color-border)] bg-surface p-1 text-ink-600 hover:bg-surface-tertiary disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onProcessEmailToAgent(email, selectedAgentId);
                                }}
                                disabled={!!processingEmailId}
                                aria-label="Process email to agent"
                                title={String(processingEmailId) === String(email.messageId)
                                  ? "Processing..."
                                  : String(successEmailId) === String(email.messageId)
                                    ? "Sent to agent!"
                                    : "Process email to agent session"}
                              >
                                {String(successEmailId) === String(email.messageId) ? (
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : String(processingEmailId) === String(email.messageId) ? (
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className={`mt-1 truncate text-xs ${isUnread ? "font-semibold text-ink-900" : "text-ink-700"}`}>
                          {email.subject || "(No subject)"}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted">
                          {email.summary || "No preview"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Loading more indicator (hidden while searching) */}
              {isLoadingMore && !isSearching && (
                <div className="flex items-center justify-center py-3">
                  <svg className="h-4 w-4 animate-spin text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle className="opacity-20" cx="12" cy="12" r="10" />
                    <path d="M4 12a8 8 0 018-8" />
                  </svg>
                  <span className="ml-2 text-xs text-muted">Loading more...</span>
                </div>
              )}
              {/* End of list indicator */}
              {!hasMore && emails.length > 0 && !isLoadingMore && !isSearching && (
                <div className="py-3 text-center text-xs text-muted">
                  No more emails
                </div>
              )}
              {/* Server search status */}
              {isSearching && serverSearching && (
                <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle className="opacity-20" cx="12" cy="12" r="10" />
                    <path d="M4 12a8 8 0 018-8" />
                  </svg>
                  Searching full inbox…
                </div>
              )}
              {isSearching && !serverSearching && serverSearchError && (
                <div className="py-2 px-2 text-center text-[11px] text-red-600">
                  Full-inbox search failed: {serverSearchError}
                </div>
              )}
              {isSearching && !serverSearching && serverResults && serverOnlyCount > 0 && (
                <div className="py-2 text-center text-[10px] text-muted">
                  +{serverOnlyCount} older match{serverOnlyCount === 1 ? "" : "es"} from server
                </div>
              )}
              {isSearching && !serverSearching && serverResults && serverResults.length === 0 && localMatches.length === 0 && (
                <div className="py-2 text-center text-[10px] text-muted">
                  No matches across the full inbox.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
