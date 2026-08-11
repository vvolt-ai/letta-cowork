import { useEffect, useState } from "react";

import type {
  CreateMcpServerInput,
  McpServer,
  McpTransport,
  UpdateMcpServerInput,
} from "./types";

interface Props {
  open: boolean;
  /** When set, the form is in edit mode and pre-fills these values. */
  editing: McpServer | null;
  onClose: () => void;
  onSubmit: (
    data: CreateMcpServerInput | UpdateMcpServerInput,
  ) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Add/Edit modal for an MCP server.
 *
 * Important UX rule on edit: the previously-saved auth token is
 * never returned by the API (write-only). The token input is
 * therefore left blank in edit mode, with a hint that the existing
 * token is preserved unless a new value is entered. This is the same
 * pattern used by the channel credentials modal in this app.
 */
export function McpServerFormDialog({ open, editing, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("http");
  const [url, setUrl] = useState("");
  const [configJson, setConfigJson] = useState("");
  const [shareOrgWide, setShareOrgWide] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / hydrate when opening or switching between add and edit.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTransport(editing.transport);
      setUrl(editing.url);
      setConfigJson(buildSavedMcpConfigJson(editing));
      setShareOrgWide(editing.ownerUserId === null);
      setEnabled(editing.enabled);
    } else {
      setName("");
      setTransport("http");
      setUrl("");
      setConfigJson("");
      setShareOrgWide(false);
      setEnabled(true);
    }
    setError(null);
    setSubmitting(false);
  }, [open, editing]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsed: ParsedMcpConfig | undefined;
    try {
      parsed = parseMcpConfigJson(configJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    const resolvedName = parsed?.name ?? name.trim();
    const resolvedTransport = parsed?.transport ?? transport;
    const resolvedUrl = parsed?.url ?? url.trim();

    if (!resolvedName || !resolvedUrl) {
      setError("Name and URL are required. Add them in the fields above or paste a JSON config with url.");
      return;
    }

    const auth = parsed?.auth ?? (editing ? {} : undefined);

    setSubmitting(true);
    const payload: CreateMcpServerInput = {
      name: resolvedName,
      transport: resolvedTransport,
      url: resolvedUrl,
      auth,
      enabled,
      shareOrgWide,
    };

    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? "Failed to save server.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" onClick={onClose} aria-label="Close MCP form" />
      <form onSubmit={handleSubmit} className="relative flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-[var(--color-surface)] shadow-2xl">
          <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
            <div>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg></div>
              <h3 className="text-lg font-semibold text-ink-900">{editing ? "Edit MCP server" : "Add MCP server"}</h3>
              <p className="mt-1 text-sm text-muted">Connect an HTTP or SSE tool provider to Vera.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <Field label="Name" hint="Shown in the agent settings UI.">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10"
                placeholder="e.g. Linear, Notion, Github"
                autoFocus
              />
            </Field>

            <Field label="Transport">
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as McpTransport)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10"
              >
                <option value="http">Streamable HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </Field>

            <Field
              label="Endpoint URL"
              hint={transport === "http" ? "Usually ends in /mcp." : "Usually ends in /sse."}
            >
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 font-mono text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10"
                placeholder="https://example.com/mcp"
              />
            </Field>

            <Field
              label="MCP JSON config"
              hint={
                editing
                  ? "Saved non-secret config is loaded. Token/env secrets are write-only and preserved unless you paste new headers/env values. Supports Claude/OpenAI mcpServers format."
                  : "Paste the MCP config JSON from Claude/OpenAI docs. Supports url, headers, env, and mcpServers wrappers. Secrets are encrypted."
              }
            >
              <textarea
                value={configJson}
                onChange={(e) => setConfigJson(e.target.value)}
                className="mt-1.5 min-h-40 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 py-2.5 font-mono text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10"
                placeholder={defaultMcpJsonExample}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="font-medium text-gray-900 text-sm">Share with organization</p>
                <p className="text-xs text-gray-500">
                  When off, only you can attach this server to agents. Turn on if your
                  team should be able to attach it too.
                </p>
              </div>
              <CheckboxToggle
                id="mcp-share-org-wide"
                checked={shareOrgWide}
                onChange={setShareOrgWide}
                ariaLabel="Share MCP server with organization"
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="font-medium text-gray-900 text-sm">Enabled</p>
                <p className="text-xs text-gray-500">
                  Disable to keep the config but stop the server from being used by agents.
                </p>
              </div>
              <CheckboxToggle
                id="mcp-enabled"
                checked={enabled}
                onChange={setEnabled}
                ariaLabel="Enable MCP server"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-[var(--color-surface-secondary)]"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? "Saving…" : editing ? "Save changes" : "Add server"}
            </button>
          </div>
      </form>
    </div>
  );
}

const defaultMcpJsonExample = `{
  "mcpServers": {
    "ryze": {
      "url": "https://mcp.get-ryze.ai/mcp/unified/",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      },
      "env": {
        "RYZE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}`;

interface ParsedMcpConfig {
  name?: string;
  transport?: McpTransport;
  url?: string;
  auth?: CreateMcpServerInput["auth"];
}

function parseMcpConfigJson(text: string): ParsedMcpConfig | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const root = JSON.parse(trimmed) as Record<string, unknown>;
  let name: string | undefined;
  let config: Record<string, unknown> = root;

  if (isRecord(root.mcpServers)) {
    const entries = Object.entries(root.mcpServers).filter(([, value]) => isRecord(value));
    if (entries.length === 0) {
      throw new Error("mcpServers must contain at least one server config.");
    }
    [name, config] = entries[0] as [string, Record<string, unknown>];
  } else if (typeof root.name === "string") {
    name = root.name;
  }

  if (typeof config.command === "string") {
    throw new Error("Stdio MCP configs with command/args are not supported here yet. Use an HTTP/SSE MCP URL.");
  }

  const url = typeof config.url === "string" ? config.url : undefined;
  const transport = parseTransport(config.transport, url);
  const headers = isRecord(config.headers) ? stringRecord(config.headers, "headers") : undefined;
  const env = isRecord(config.env) ? stringRecord(config.env, "env") : undefined;

  const authHeader = typeof config.authHeaderName === "string" ? config.authHeaderName : "Authorization";
  const directToken = typeof config.authToken === "string" ? config.authToken : undefined;
  const authorization = headers?.Authorization ?? headers?.authorization ?? directToken;
  const customHeaders = headers
    ? Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "authorization"))
    : undefined;

  const auth: CreateMcpServerInput["auth"] = {
    ...(authorization ? { authHeaderName: authHeader, authToken: authorization } : {}),
    ...(customHeaders && Object.keys(customHeaders).length > 0 ? { customHeaders } : {}),
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
  };

  return {
    name,
    transport,
    url,
    auth: Object.keys(auth).length > 0 ? auth : undefined,
  };
}

function buildSavedMcpConfigJson(server: McpServer): string {
  const headers: Record<string, string> = {
    ...(server.customHeaders ?? {}),
  };

  const config: Record<string, unknown> = {
    url: server.url,
    transport: server.transport,
  };

  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  }

  return JSON.stringify(
    {
      mcpServers: {
        [server.slug || server.name]: config,
      },
    },
    null,
    2,
  );
}

function parseTransport(value: unknown, url?: string): McpTransport | undefined {
  if (value === "http" || value === "sse") return value;
  if (typeof value === "string" && value.toLowerCase().includes("sse")) return "sse";
  if (url?.endsWith("/sse")) return "sse";
  if (url) return "http";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: Record<string, unknown>, label: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      throw new Error(`${label}.${key} must be a string.`);
    }
    output[key] = raw;
  }
  return output;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-500 mt-1 block">{hint}</span>}
    </label>
  );
}

function CheckboxToggle({
  id,
  checked,
  onChange,
  ariaLabel,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <label
      htmlFor={id}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
        aria-label={ariaLabel}
      />
      <span className="absolute inset-0 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500" />
      <span
        className="relative inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform peer-checked:translate-x-6"
      />
    </label>
  );
}
