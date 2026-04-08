/**
 * Date separator for timeline message groups
 */

export type TimelineDateSeparatorProps = {
  date: Date;
};

export function TimelineDateSeparator({ date }: TimelineDateSeparatorProps) {
  const label = formatDateLabel(date);

  return (
    <div className="flex items-center gap-4 py-4">
      <div className="h-px flex-1 bg-ink-900/10" />
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="h-px flex-1 bg-ink-900/10" />
    </div>
  );
}

/**
 * Formats a date into a human-readable label
 */
function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetDate.getTime() === today.getTime()) {
    return "Today";
  }

  if (targetDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  // For dates within the last 7 days, show the day name
  const daysAgo = Math.floor((today.getTime() - targetDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysAgo < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  // For older dates, show the full date
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
