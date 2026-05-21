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
  const [authHeaderName, setAuthHeaderName] = useState("Authorization");
  const [authToken, setAuthToken] = useState("");
  const [secretEnvText, setSecretEnvText] = useState("");
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
      setAuthHeaderName(editing.authHeaderName ?? "Authorization");
      setAuthToken(""); // never pre-fill — token is write-only
      setSecretEnvText(""); // write-only — blank preserves existing env
      setShareOrgWide(editing.ownerUserId === null);
      setEnabled(editing.enabled);
    } else {
      setName("");
      setTransport("http");
      setUrl("");
      setAuthHeaderName("Authorization");
      setAuthToken("");
      setSecretEnvText("");
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

    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }

    let env: Record<string, string> | undefined;
    try {
      env = parseSecretEnv(secretEnvText);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    // Build the auth bundle. Secrets are write-only. In edit mode, omitted
    // secret fields are preserved server-side; only entered fields are changed.
    const hasAuthToken = authToken.trim().length > 0;
    const hasEnv = env !== undefined && Object.keys(env).length > 0;
    const shouldSendAuth = hasAuthToken || hasEnv || editing !== null;
    const auth =
      shouldSendAuth
        ? {
            authHeaderName: authHeaderName.trim() || "Authorization",
            ...(hasAuthToken ? { authToken: authToken.trim() } : {}),
            ...(hasEnv ? { env } : {}),
          }
        : undefined;

    setSubmitting(true);
    const payload: CreateMcpServerInput = {
      name: name.trim(),
      transport,
      url: url.trim(),
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {editing ? "Edit MCP server" : "Add MCP server"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[60vh] overflow-auto">
            <Field label="Name" hint="Shown in the agent settings UI.">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="e.g. Linear, Notion, Github"
                autoFocus
              />
            </Field>

            <Field label="Transport">
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as McpTransport)}
                className="w-full px-3 py-2 border rounded-md text-sm"
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
                className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                placeholder="https://example.com/mcp"
              />
            </Field>

            <Field label="Auth header name" hint="Defaults to Authorization. Leave blank if the server is public.">
              <input
                type="text"
                value={authHeaderName}
                onChange={(e) => setAuthHeaderName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                placeholder="Authorization"
              />
            </Field>

            <Field
              label="Auth token"
              hint={
                editing
                  ? "Leave blank to keep the existing token. Enter a new value to replace it."
                  : "Bearer token or API key. Stored encrypted at rest, never returned by the API."
              }
            >
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                placeholder={editing ? "•••••••••• (unchanged)" : "Bearer xxxxxxxx"}
                autoComplete="off"
              />
            </Field>

            <Field
              label="Secret env vars"
              hint={
                editing
                  ? "Optional KEY=value lines injected into Bash only for agents this MCP server is attached to. Leave blank to keep existing env secrets."
                  : "Optional KEY=value lines. Stored encrypted; injected into Bash child-process env for attached agents."
              }
            >
              <textarea
                value={secretEnvText}
                onChange={(e) => setSecretEnvText(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono min-h-24"
                placeholder={"ZOHO_ACCESS_TOKEN=1000.xxxxx\nZOHO_ACCOUNT_ID=2467477000000008002\nZOHO_API_BASE_URL=https://mail.zoho.com/api"}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900 text-sm">Share with organization</p>
                <p className="text-xs text-gray-500">
                  When off, only you can attach this server to agents. Turn on if your
                  team should be able to attach it too.
                </p>
              </div>
              <Toggle enabled={shareOrgWide} onToggle={() => setShareOrgWide((v) => !v)} />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-gray-900 text-sm">Enabled</p>
                <p className="text-xs text-gray-500">
                  Disable to keep the config but stop the server from being used by agents.
                </p>
              </div>
              <Toggle enabled={enabled} onToggle={() => setEnabled((v) => !v)} />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? "Saving…" : editing ? "Save changes" : "Add server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseSecretEnv(text: string): Record<string, string> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const env: Record<string, string> = {};
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid env line: ${rawLine}. Use KEY=value.`);
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env name '${key}'. Use uppercase letters, numbers, and underscores.`);
    }
    env[key] = value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
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

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? "bg-blue-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
