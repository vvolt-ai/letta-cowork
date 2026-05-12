import { useCallback, useEffect, useState } from "react";
import type {
  CreateMcpServerInput,
  McpServer,
  McpServerWithTools,
  McpTool,
  UpdateMcpServerInput,
} from "./types";

// Renderer-side reference to the preload bridge. Typed as `any` to
// avoid forcing a renderer-wide ambient type extension just for MCP.
const getApi = () => (window as any).electron;

interface ServerActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Single source of truth for MCP server state on the settings page.
 * Owns the list, mutation handlers, and per-row connection status
 * (test result, last refresh tool count). Components stay dumb.
 */
export function useMcpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Maps server.id -> ephemeral status from the last test/refresh
  // click. Not persisted; cleared on refetch.
  const [testStatus, setTestStatus] = useState<Record<string, {
    state: "idle" | "running" | "ok" | "error";
    message?: string;
    toolCount?: number;
  }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getApi().apiMcpListServers();
      if (result.success) {
        setServers(result.servers ?? []);
        setError(null);
      } else {
        setError(result.error ?? "Failed to load MCP servers");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createServer = useCallback(
    async (data: CreateMcpServerInput): Promise<ServerActionResult<McpServer>> => {
      const result = await getApi().apiMcpCreateServer(data);
      if (result.success) {
        await load();
        return { ok: true, data: result.server };
      }
      return { ok: false, error: result.error };
    },
    [load],
  );

  const updateServer = useCallback(
    async (id: string, data: UpdateMcpServerInput): Promise<ServerActionResult<McpServer>> => {
      const result = await getApi().apiMcpUpdateServer(id, data);
      if (result.success) {
        await load();
        return { ok: true, data: result.server };
      }
      return { ok: false, error: result.error };
    },
    [load],
  );

  const deleteServer = useCallback(
    async (id: string): Promise<ServerActionResult> => {
      const result = await getApi().apiMcpDeleteServer(id);
      if (result.success) {
        await load();
        return { ok: true };
      }
      return { ok: false, error: result.error };
    },
    [load],
  );

  const testServer = useCallback(async (id: string): Promise<void> => {
    setTestStatus((prev) => ({ ...prev, [id]: { state: "running" } }));
    const result = await getApi().apiMcpTestServer(id);
    if (result.success && result.result?.ok) {
      setTestStatus((prev) => ({
        ...prev,
        [id]: { state: "ok", message: "Connected" },
      }));
    } else {
      const message = result.success
        ? (result.result?.error ?? "Test failed")
        : (result.error ?? "IPC error");
      setTestStatus((prev) => ({
        ...prev,
        [id]: { state: "error", message },
      }));
    }
  }, []);

  const refreshTools = useCallback(
    async (id: string): Promise<ServerActionResult<McpTool[]>> => {
      setTestStatus((prev) => ({ ...prev, [id]: { state: "running" } }));
      const result = await getApi().apiMcpRefreshTools(id);
      if (result.success) {
        setTestStatus((prev) => ({
          ...prev,
          [id]: { state: "ok", message: "Refreshed", toolCount: result.tools?.length ?? 0 },
        }));
        // Refresh the list so lastConnectedAt / lastError pick up changes.
        await load();
        return { ok: true, data: result.tools };
      }
      setTestStatus((prev) => ({
        ...prev,
        [id]: { state: "error", message: result.error },
      }));
      return { ok: false, error: result.error };
    },
    [load],
  );

  const getServerWithTools = useCallback(
    async (id: string): Promise<McpServerWithTools | null> => {
      const result = await getApi().apiMcpGetServer(id);
      if (result.success) return result.server;
      return null;
    },
    [],
  );

  return {
    servers,
    loading,
    error,
    testStatus,
    refresh: load,
    createServer,
    updateServer,
    deleteServer,
    testServer,
    refreshTools,
    getServerWithTools,
  };
}
