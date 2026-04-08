interface EmailSearchBarProps {
  searchQuery: string;
  onSearch: (e: React.FormEvent) => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
}

/**
 * Search bar for filtering emails by subject, sender, or content
 */
export function EmailSearchBar({
  searchQuery,
  onSearch,
  onSearchChange,
  onClearSearch,
}: EmailSearchBarProps) {
  return (
    <form onSubmit={onSearch} className="px-4 py-2 border-b border-[var(--color-border)]">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" 
            viewBox="0 0 24 24" 
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
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search emails by subject, sender, or content..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pl-10 pr-4 text-sm text-ink-800 placeholder:text-muted focus:border-accent/40 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Search
        </button>
        {searchQuery && (
          <button
            type="button"
            onClick={onClearSearch}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-ink-700 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
