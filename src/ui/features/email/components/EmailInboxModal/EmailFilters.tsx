/**
 * Email filter controls component
 * Currently provides header with email count and selected email info
 * Can be extended for additional filter options
 */

interface EmailFiltersProps {
  emailCount: number;
  selectedEmailSubject?: string;
}

export function EmailFilters({ emailCount, selectedEmailSubject }: EmailFiltersProps) {
  return (
    <div className="px-3 py-2 border-b border-[var(--color-border)] text-xs text-muted">
      {emailCount} email{emailCount !== 1 ? 's' : ''}
      {selectedEmailSubject && ` • ${selectedEmailSubject.slice(0, 30)}...`}
    </div>
  );
}

/**
 * Future filter options can include:
 * - Show unread only toggle
 * - Show processed/unprocessed toggle
 * - Date range filter
 * - Sender filter
 */
