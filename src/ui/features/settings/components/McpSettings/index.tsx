import { useState } from "react";
import { useMcpServers } from "./useMcpServers";
import { McpServerFormDialog } from "./McpServerFormDialog";
import type { McpServer, UpdateMcpServerInput, CreateMcpServerInput } from "./types";

/**
 * MCP Servers tab inside the Cowork Settings dialog.
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
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">MCP Servers</h2>
          <p className="text-sm text-slate-500">
            Connect external tools via the Model Context Protocol. Agents attach
            servers individually and pick which tools they expose.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-sm border rounded-lg text-slate-700 hover:bg-slate-50"
            disabled={loading}
            title="Refresh server list"
          >
            ↻
          </button>
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            + Add server
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState onAdd={handleAdd} />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700">Name</th>
                <th className="px-3 py-2 font-medium text-slate-700">Transport</th>
                <th className="px-3 py-2 font-medium text-slate-700">Scope</th>
                <th className="px-3 py-2 font-medium text-slate-700">Status</th>
                <th className="px-3 py-2 font-medium text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => {
                const status = testStatus[server.id];
                return (
                  <tr key={server.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{server.name}</div>
                      <div className="text-xs text-slate-500 font-mono truncate max-w-xs">
                        {server.url}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 uppercase text-xs">
                      {server.transport}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {server.ownerUserId === null ? (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                          Org-shared
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                          Private
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <ServerStatus server={server} status={status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <ActionButton onClick={() => testServer(server.id)} title="Test connection">
                          Test
                        </ActionButton>
                        <ActionButton onClick={() => refreshTools(server.id)} title="Re-discover tools">
                          Refresh
                        </ActionButton>
                        <ActionButton onClick={() => handleEdit(server)} title="Edit">
                          Edit
                        </ActionButton>
                        <ActionButton
                          onClick={() => handleDelete(server)}
                          title="Delete"
                          variant="danger"
                        >
                          Delete
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <McpServerFormDialog
        open={showForm}
        editing={editing}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
      />
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
  if (status?.state === "running") return <span className="text-slate-500">Testing…</span>;
  if (status?.state === "ok") {
    return (
      <span className="text-green-700">
        ✓ {status.message ?? "OK"}
        {typeof status.toolCount === "number" && ` (${status.toolCount} tools)`}
      </span>
    );
  }
  if (status?.state === "error") {
    return (
      <span className="text-red-700" title={status.message}>
        ✗ {truncate(status.message ?? "Error", 40)}
      </span>
    );
  }
  // No live status — fall back to server.lastError / lastConnectedAt
  if (server.lastError) {
    return (
      <span className="text-red-700" title={server.lastError}>
        ✗ {truncate(server.lastError, 40)}
      </span>
    );
  }
  if (server.lastConnectedAt) {
    return (
      <span className="text-slate-500">
        Last seen {formatRelative(server.lastConnectedAt)}
      </span>
    );
  }
  return <span className="text-slate-400">Not tested</span>;
}

interface ActionButtonProps {
  onClick: () => void;
  title?: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}

function ActionButton({ onClick, title, variant = "default", children }: ActionButtonProps) {
  const base = "px-2 py-1 text-xs rounded border";
  const variantClass =
    variant === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : "border-slate-200 text-slate-700 hover:bg-slate-50";
  return (
    <button onClick={onClick} title={title} className={`${base} ${variantClass}`}>
      {children}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
      <p className="text-slate-500 mb-3">No MCP servers configured yet.</p>
      <button
        onClick={onAdd}
        className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        + Add your first MCP server
      </button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 text-slate-500">
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
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
