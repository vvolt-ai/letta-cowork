import { useMemo } from "react";
import { useAppStore } from "../../../../store/useAppStore";

export function SessionNotifications() {
  const notifications = useAppStore((state) => state.notifications);
  const dismissNotification = useAppStore((state) => state.dismissNotification);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);

  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => a.timestamp - b.timestamp),
    [notifications]
  );

  if (sortedNotifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex w-80 flex-col gap-3">
      {sortedNotifications.map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto rounded-2xl border border-ink-200/60 bg-white/95 p-4 shadow-xl backdrop-blur"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Session {notification.status}
          </p>
          <p className="mt-1 text-sm font-medium text-ink-900">
            {notification.title || "Untitled session"}
          </p>
          {notification.agentName ? (
            <p className="text-xs text-ink-600">by {notification.agentName}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-800"
              onClick={() => {
                setActiveSessionId(notification.sessionId);
                dismissNotification(notification.id);
              }}
            >
              View session
            </button>
            <button
              className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-600 hover:border-ink-300"
              onClick={() => dismissNotification(notification.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
