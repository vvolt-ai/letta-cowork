import { useEffect, useMemo, useState } from "react";

interface MemoryEntry {
  path: string;
  description?: string;
  preview: string;
  category: "system" | "reference" | "other";
}

interface MemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryDialog({ open, onOpenChange }: MemoryDialogProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.listAgentMemoryFiles();
        if (!cancelled) {
          setEntries(result);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load memory files:", err);
          setError("Could not load memory files for the current agent.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return entries;
    return entries.filter((entry) =>
      entry.path.toLowerCase().includes(normalizedQuery)
      || (entry.description ?? "").toLowerCase().includes(normalizedQuery)
      || entry.preview.toLowerCase().includes(normalizedQuery)
    );
  }, [entries, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative z-[10001] w-full max-w-5xl rounded-3xl border border-ink-900/10 bg-white shadow-xl mx-4 max-h-[84vh] overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-900/10 px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Agent memory</div>
            <h2 className="mt-1 text-lg font-semibold text-ink-900">Memory blocks</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-ink-500 hover:bg-ink-900/5 hover:text-ink-700"
            aria-label="Close memory dialog"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="border-b border-ink-900/10 px-6 py-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memory by path, description, or content preview"
            className="w-full rounded-2xl border border-ink-900/10 bg-surface-secondary px-4 py-3 text-sm text-ink-800 placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted">Loading memory…</div>
          ) : error ? (
            <div className="rounded-2xl border border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/5 px-4 py-3 text-sm text-[var(--color-status-error)]">
              {error}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted">No memory blocks matched your search.</div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry) => (
                <article key={entry.path} className="rounded-2xl border border-ink-900/10 bg-surface px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-ink-800">{entry.path}</div>
                      {entry.description ? (
                        <div className="mt-1 text-xs text-muted">{entry.description}</div>
                      ) : null}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      entry.category === "system"
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : entry.category === "reference"
                          ? "bg-[var(--color-status-completed)]/10 text-[var(--color-status-completed)]"
                          : "bg-ink-900/6 text-muted"
                    }`}>
                      {entry.category}
                    </span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-secondary px-3 py-3 text-xs leading-5 text-ink-700">
                    {entry.preview || "(No preview content)"}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
