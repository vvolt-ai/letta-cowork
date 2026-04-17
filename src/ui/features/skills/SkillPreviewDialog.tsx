import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import MarkdownRenderer from "../../render/markdownRenderer";

interface SkillFileEntry {
  path: string;
  size: number;
}

interface SkillDetails {
  folder: string;
  name: string;
  description: string;
  frontmatter: Record<string, string>;
  body: string;
  rawContent: string;
  path: string;
  files: SkillFileEntry[];
  updatedAt: number;
  truncated: boolean;
}

interface Props {
  open: boolean;
  folder: string | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

type PreviewTab = "overview" | "content" | "files";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

export function SkillPreviewDialog({ open, folder, onOpenChange, onDeleted }: Props) {
  const [details, setDetails] = useState<SkillDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewTab>("overview");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !folder) return;
    setTab("overview");
    setConfirmingDelete(false);
    setActionToast(null);
    setError(null);
    setDetails(null);
    setLoading(true);
    (window as any).electron
      .readSkill(folder)
      .then((res: { success: boolean; skill?: SkillDetails; error?: string }) => {
        if (!res?.success || !res.skill) {
          setError(res?.error ?? "Failed to load skill");
        } else {
          setDetails(res.skill);
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, folder]);

  const handleCopySlash = async () => {
    if (!details) return;
    const handle = details.frontmatter.name || details.folder;
    const cmd = `/${handle}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setActionToast(`Copied ${cmd}`);
    } catch {
      setActionToast("Failed to copy");
    }
    setTimeout(() => setActionToast(null), 2000);
  };

  const handleCopyPath = async () => {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details.path);
      setActionToast("Copied path");
    } catch {
      setActionToast("Failed to copy");
    }
    setTimeout(() => setActionToast(null), 2000);
  };

  const handleOpenFolder = async () => {
    if (!folder) return;
    try {
      await (window as any).electron.openSkillFolder(folder);
    } catch (e) {
      setActionToast(`Failed: ${String(e)}`);
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    setDeleting(true);
    try {
      const res = await (window as any).electron.deleteSkill(folder);
      if (res?.success) {
        onDeleted?.();
        onOpenChange(false);
      } else {
        setActionToast(`Failed: ${res?.error ?? "Unknown error"}`);
        setTimeout(() => setActionToast(null), 3000);
      }
    } catch (e) {
      setActionToast(`Failed: ${String(e)}`);
      setTimeout(() => setActionToast(null), 3000);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <svg className="h-4 w-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <span className="truncate">{details?.name || folder || "Skill"}</span>
                {details?.frontmatter.name && details.frontmatter.name !== details.folder && (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                    /{details.folder}
                  </span>
                )}
              </Dialog.Title>
              {details?.description && (
                <Dialog.Description className="mt-1 line-clamp-2 text-xs text-gray-600">
                  {details.description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-100 px-4 pt-2">
            {(["overview", "content", "files"] as PreviewTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-3 py-2 text-xs font-medium transition ${
                  tab === t
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "overview" && "Overview"}
                {t === "content" && "SKILL.md"}
                {t === "files" && `Files${details ? ` (${details.files.length}${details.truncated ? "+" : ""})` : ""}`}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Loading skill…
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {details && !loading && !error && (
              <>
                {tab === "overview" && (
                  <div className="space-y-5">
                    {/* Metadata grid */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Metadata
                      </p>
                      <div className="rounded-lg border border-gray-200 bg-gray-50">
                        <MetaRow label="Name" value={details.name} mono />
                        <MetaRow label="Folder" value={details.folder} mono />
                        <MetaRow label="Path" value={details.path} mono wrap />
                        <MetaRow label="Updated" value={formatDate(details.updatedAt)} />
                        <MetaRow label="Files" value={`${details.files.length}${details.truncated ? "+" : ""}`} />
                      </div>
                    </div>

                    {/* Full description */}
                    {details.description && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Description
                        </p>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                          {details.description}
                        </div>
                      </div>
                    )}

                    {/* Extra frontmatter keys */}
                    {Object.keys(details.frontmatter).filter((k) => k !== "name" && k !== "description").length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Frontmatter
                        </p>
                        <div className="rounded-lg border border-gray-200 bg-gray-50">
                          {Object.entries(details.frontmatter)
                            .filter(([k]) => k !== "name" && k !== "description")
                            .map(([k, v]) => (
                              <MetaRow key={k} label={k} value={v} mono />
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Preview of body content */}
                    {details.body && (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Content preview
                          </p>
                          <button
                            onClick={() => setTab("content")}
                            className="text-[11px] text-[var(--color-accent)] hover:underline"
                          >
                            View full →
                          </button>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                          <div className="max-h-56 overflow-hidden text-sm">
                            <MarkdownRenderer text={details.body.slice(0, 800)} />
                          </div>
                          {details.body.length > 800 && (
                            <div className="pointer-events-none h-6 bg-gradient-to-t from-white to-transparent" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "content" && (
                  <div className="prose prose-sm max-w-none">
                    {details.body ? (
                      <MarkdownRenderer text={details.body} />
                    ) : details.rawContent ? (
                      <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-700">
                        {details.rawContent}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-500">No SKILL.md found.</p>
                    )}
                  </div>
                )}

                {tab === "files" && (
                  <div>
                    {details.files.length === 0 ? (
                      <p className="text-sm text-gray-500">No files found in this skill.</p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-500">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Path</th>
                              <th className="px-3 py-2 text-right font-semibold">Size</th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.files.map((f) => (
                              <tr key={f.path} className="border-t border-gray-100">
                                <td className="px-3 py-1.5 font-mono text-xs text-gray-800">{f.path}</td>
                                <td className="px-3 py-1.5 text-right text-xs text-gray-500">
                                  {formatBytes(f.size)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {details.truncated && (
                          <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                            File list truncated at 200 entries. Open in file manager to see everything.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer / Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionButton onClick={handleCopySlash} disabled={!details} label="Copy /command" />
              <ActionButton onClick={handleOpenFolder} disabled={!folder} label="Open folder" />
              <ActionButton onClick={handleCopyPath} disabled={!details} label="Copy path" />
            </div>
            <div className="flex items-center gap-2">
              {actionToast && (
                <span className="rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white">
                  {actionToast}
                </span>
              )}
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={!details || deleting}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Uninstall
                </button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1">
                  <span className="text-[11px] text-red-800">Delete skill folder?</span>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Confirm"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MetaRow({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-200 px-3 py-2 last:border-b-0">
      <span className="w-24 shrink-0 text-[11px] font-medium text-gray-500">{label}</span>
      <span
        className={`min-w-0 flex-1 text-xs text-gray-800 ${mono ? "font-mono" : ""} ${
          wrap ? "break-all" : "truncate"
        }`}
        title={value}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
