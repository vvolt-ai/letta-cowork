import { useState } from "react";

import { McpServerFormDialog } from "./McpServerFormDialog";
import { useMcpServers } from "./useMcpServers";

import type { McpServer, UpdateMcpServerInput, CreateMcpServerInput } from "./types";

/**
 * MCP Servers table, surfaced from Configuration → MCP Servers.
 *
 * Single-page list + add/edit modal. The per-agent attachment UI is
 * intentionally split into a separate component that lives next to
 * the agent picker — most users will manage server configs once and
 * then attach from the agent context.
 */
export function McpSettings() {
  const {
    servers,
    loading,
    error,
    testStatus,
    refresh,
    createServer,
    updateServer,
    deleteServer,
    testServer,
    refreshTools,
  } = useMcpServers();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);

  const handleEdit = (server: McpServer) => {
    setEditing(server);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleSubmit = async (data: CreateMcpServerInput | UpdateMcpServerInput) => {
    return editing
      ? updateServer(editing.id, data)
      : createServer(data as CreateMcpServerInput);
  };

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`Delete MCP server "${server.name}"? Agents attached to it will lose access to its tools.`)) {
      return;
    }
    const result = await deleteServer(server.id);
    if (!result.ok) {
      alert(`Failed to delete: ${result.error}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg>
          </div>
          <h2 className="text-base font-semibold text-ink-900">Connected MCP servers</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">External tools available through the Model Context Protocol. Add or edit server configuration without leaving this list.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={refresh} disabled={loading} title="Refresh server list" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-500 transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">
            <svg viewBox="0 0 24 24" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15"/></svg>
          </button>
          <button onClick={handleAdd} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Add MCP
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <div className="rounded-xl border border-error/30 bg-[var(--color-error-light)] p-3 text-sm text-error">
          {error}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState onAdd={handleAdd} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]">
          {servers.map((server, index) => {
            const status = testStatus[server.id];
            return (
              <article key={server.id} className={`flex flex-col gap-4 p-4 lg:flex-row lg:items-center ${index ? "border-t border-[var(--color-border)]" : ""}`}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${server.enabled ? "bg-[var(--color-success-light)] text-success" : "bg-[var(--color-surface-secondary)] text-muted"}`}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{server.name}</h3>
                      <span className="rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{server.transport}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${server.ownerUserId === null ? "bg-[var(--color-info-light)] text-info" : "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"}`}>{server.ownerUserId === null ? "Organization" : "Private"}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted">{server.url}</p>
                    <div className="mt-1.5 text-xs"><ServerStatus server={server} status={status} /></div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <ActionButton onClick={() => testServer(server.id)} title="Test connection">Test</ActionButton>
                  <ActionButton onClick={() => refreshTools(server.id)} title="Re-discover tools">Refresh tools</ActionButton>
                  <IconButton onClick={() => handleEdit(server)} title="Edit"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></IconButton>
                  <IconButton onClick={() => handleDelete(server)} title="Delete" variant="danger"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4h8v2"/></svg></IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <McpServerFormDialog open={showForm} editing={editing} onClose={() => setShowForm(false)} onSubmit={handleSubmit} />
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ServerStatus({
  server,
  status,
}: {
  server: McpServer;
  status: ReturnType<typeof useMcpServers>["testStatus"][string] | undefined;
}) {
  if (status?.state === "running") return <span className="text-muted">Testing…</span>;
  if (status?.state === "ok") {
    return (
      <span className="text-success">
        ✓ {status.message ?? "OK"}
        {typeof status.toolCount === "number" && ` (${status.toolCount} tools)`}
      </span>
    );
  }
  if (status?.state === "error") {
    return (
      <span className="whitespace-normal break-words text-error" title={status.message}>
        ✗ {truncate(status.message ?? "Error", 160)}
      </span>
    );
  }
  // No live status — fall back to server.lastError / lastConnectedAt
  if (server.lastError) {
    return (
      <span className="whitespace-normal break-words text-error" title={server.lastError}>
        ✗ {truncate(server.lastError, 160)}
      </span>
    );
  }
  if (server.lastConnectedAt) {
    return (
      <span className="text-muted">
        Last seen {formatRelative(server.lastConnectedAt)}
      </span>
    );
  }
  return <span className="text-muted-light">Not tested</span>;
}

interface ActionButtonProps {
  onClick: () => void;
  title?: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}

function ActionButton({ onClick, title, variant = "default", children }: ActionButtonProps) {
  const base = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";
  const variantClass =
    variant === "danger"
      ? "border-error/40 bg-[var(--color-error-light)]/40 text-error hover:bg-[var(--color-error-light)]"
      : "border-[var(--color-border-hover)] bg-[var(--color-surface-secondary)] text-ink-700 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] hover:text-ink-900";
  return (
    <button onClick={onClick} title={title} className={`${base} ${variantClass}`}>
      {children}
    </button>
  );
}

/**
 * Square icon-only action button for row-level actions. Edit/Delete
 * use this; Test/Refresh use the wider <ActionButton> so the verb is
 * visible (they are the day-to-day buttons).
 */
interface IconButtonProps {
  onClick: () => void;
  title: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}

function IconButton({ onClick, title, variant = "default", children }: IconButtonProps) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors";
  const variantClass =
    variant === "danger"
      ? "border-error/40 bg-[var(--color-error-light)]/30 text-error hover:bg-[var(--color-error-light)]"
      : "border-[var(--color-border-hover)] bg-[var(--color-surface-secondary)] text-ink-600 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] hover:text-ink-900";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`${base} ${variantClass}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] py-12 text-center">
      <p className="mb-3 text-muted">No MCP servers configured yet.</p>
      <button
        onClick={onAdd}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-95"
      >
        + Add your first MCP server
      </button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 text-muted">
      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle className="opacity-25" cx="12" cy="12" r="10" />
        <path className="opacity-75" d="M4 12a8 8 0 018-8" />
      </svg>
      Loading MCP servers…
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)  }…` : s;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
