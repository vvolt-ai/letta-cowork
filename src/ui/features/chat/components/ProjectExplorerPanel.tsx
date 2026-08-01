import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ProjectExplorerPanelProps {
  rootPath: string;
  onClose: () => void;
}

type EntriesByDirectory = Record<string, ProjectFileEntry[]>;

function formatBytes(size?: number): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileAccent(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx"].includes(extension ?? "")) return "text-blue-500";
  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) return "text-amber-500";
  if (["json", "yaml", "yml", "toml"].includes(extension ?? "")) return "text-orange-500";
  if (["md", "mdx", "txt"].includes(extension ?? "")) return "text-violet-500";
  if (["css", "scss", "less"].includes(extension ?? "")) return "text-pink-500";
  return "text-ink-400";
}

function TreeRows({
  directory,
  depth,
  entriesByDirectory,
  expanded,
  loadingDirectories,
  selectedPath,
  onToggleDirectory,
  onSelectFile,
}: {
  directory: string;
  depth: number;
  entriesByDirectory: EntriesByDirectory;
  expanded: Set<string>;
  loadingDirectories: Set<string>;
  selectedPath?: string;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (entry: ProjectFileEntry) => void;
}) {
  const entries = entriesByDirectory[directory] ?? [];
  return entries.map((entry) => {
    const isDirectory = entry.kind === "directory";
    const isExpanded = isDirectory && expanded.has(entry.path);
    const isLoading = isDirectory && loadingDirectories.has(entry.path);
    return (
      <div key={entry.path}>
        <button
          type="button"
          onClick={() => isDirectory ? onToggleDirectory(entry.path) : onSelectFile(entry)}
          className={`group flex h-7 w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-[11px] transition ${selectedPath === entry.path ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]" : "text-ink-700 hover:bg-[var(--color-surface-hover)]"}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          title={entry.path}
        >
          {isDirectory ? (
            <span className="w-3 shrink-0 text-center text-[9px] text-ink-400">{isLoading ? "·" : isExpanded ? "▼" : "▶"}</span>
          ) : <span className="w-3 shrink-0" />}
          <span className={`shrink-0 ${isDirectory ? "text-amber-500" : fileAccent(entry.name)}`} aria-hidden="true">
            {isDirectory ? "▰" : "●"}
          </span>
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {!isDirectory && entry.size !== undefined ? <span className="shrink-0 text-[9px] text-muted opacity-0 group-hover:opacity-100">{formatBytes(entry.size)}</span> : null}
        </button>
        {isExpanded ? (
          <TreeRows
            directory={entry.path}
            depth={depth + 1}
            entriesByDirectory={entriesByDirectory}
            expanded={expanded}
            loadingDirectories={loadingDirectories}
            selectedPath={selectedPath}
            onToggleDirectory={onToggleDirectory}
            onSelectFile={onSelectFile}
          />
        ) : null}
      </div>
    );
  });
}

export function ProjectExplorerPanel({ rootPath, onClose }: ProjectExplorerPanelProps) {
  const [entriesByDirectory, setEntriesByDirectory] = useState<EntriesByDirectory>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootGenerationRef = useRef(0);
  const previewRequestRef = useRef(0);
  const projectName = useMemo(() => rootPath.split(/[\\/]/).filter(Boolean).pop() || rootPath, [rootPath]);

  const loadDirectory = useCallback(async (directory: string, force = false) => {
    if (!force && entriesByDirectory[directory]) return;
    const generation = rootGenerationRef.current;
    setLoadingDirectories((current) => new Set(current).add(directory));
    setError(null);
    try {
      const entries = await window.electron.listProjectFiles(rootPath, directory);
      if (generation === rootGenerationRef.current) {
        setEntriesByDirectory((current) => ({ ...current, [directory]: entries }));
      }
    } catch (cause) {
      if (generation === rootGenerationRef.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation === rootGenerationRef.current) {
        setLoadingDirectories((current) => {
          const next = new Set(current);
          next.delete(directory);
          return next;
        });
      }
    }
  }, [entriesByDirectory, rootPath]);

  useEffect(() => {
    const generation = ++rootGenerationRef.current;
    previewRequestRef.current += 1;
    setEntriesByDirectory({});
    setExpanded(new Set());
    setLoadingDirectories(new Set([""]));
    setPreview(null);
    setSelectedPath(undefined);
    setLoadingPreview(false);
    setError(null);
    void window.electron.listProjectFiles(rootPath, "")
      .then((entries) => { if (generation === rootGenerationRef.current) setEntriesByDirectory({ "": entries }); })
      .catch((cause) => { if (generation === rootGenerationRef.current) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => {
        if (generation === rootGenerationRef.current) setLoadingDirectories(new Set());
      });
  }, [rootPath]);

  const toggleDirectory = useCallback((path: string) => {
    const opening = !expanded.has(path);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (opening) void loadDirectory(path);
  }, [expanded, loadDirectory]);

  const selectFile = useCallback(async (entry: ProjectFileEntry) => {
    const request = ++previewRequestRef.current;
    const generation = rootGenerationRef.current;
    setSelectedPath(entry.path);
    setLoadingPreview(true);
    setError(null);
    try {
      const nextPreview = await window.electron.readProjectFile(rootPath, entry.path);
      if (request === previewRequestRef.current && generation === rootGenerationRef.current) setPreview(nextPreview);
    } catch (cause) {
      if (request === previewRequestRef.current && generation === rootGenerationRef.current) {
        setPreview(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (request === previewRequestRef.current && generation === rootGenerationRef.current) setLoadingPreview(false);
    }
  }, [rootPath]);

  const refresh = useCallback(() => {
    previewRequestRef.current += 1;
    setEntriesByDirectory({});
    setExpanded(new Set());
    setPreview(null);
    setSelectedPath(undefined);
    setLoadingPreview(false);
    void loadDirectory("", true);
  }, [loadDirectory]);

  const previewLines = useMemo(() => preview?.content.split(/\r?\n/).slice(0, 5000) ?? [], [preview]);
  const lineLimited = preview ? preview.content.split(/\r?\n/).length > previewLines.length : false;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-[var(--color-surface)]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-ink-800">{projectName}</div>
          <div className="truncate text-[9px] text-muted" title={rootPath}>{rootPath}</div>
        </div>
        <button type="button" onClick={refresh} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-[var(--color-surface-hover)]" title="Refresh project files" aria-label="Refresh project files">↻</button>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-[var(--color-surface-hover)]" title="Close project files" aria-label="Close project files">×</button>
      </header>

      <div className="flex min-h-0 basis-[42%] flex-col border-b border-[var(--color-border)]">
        <div className="shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Explorer</div>
        <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          {loadingDirectories.has("") && !entriesByDirectory[""] ? <div className="px-3 py-4 text-xs text-muted">Loading files…</div> : null}
          <TreeRows
            directory=""
            depth={0}
            entriesByDirectory={entriesByDirectory}
            expanded={expanded}
            loadingDirectories={loadingDirectories}
            selectedPath={selectedPath}
            onToggleDirectory={toggleDirectory}
            onSelectFile={(entry) => void selectFile(entry)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-600">{selectedPath ?? "Select a file to preview"}</span>
          {preview ? <span className="shrink-0 text-[9px] text-muted">{formatBytes(preview.size)}</span> : null}
        </div>
        {error ? <div role="alert" className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
        {loadingPreview ? <div className="px-4 py-5 text-xs text-muted">Opening file…</div> : preview ? (
          <div className="min-h-0 flex-1 overflow-auto bg-[#fbfbfc]">
            {(preview.truncated || lineLimited) ? <div className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800">Preview truncated for performance.</div> : null}
            <div className="grid min-w-max grid-cols-[auto_1fr] font-mono text-[11px] leading-[18px]">
              <pre className="select-none border-r border-gray-200 bg-gray-50 px-2 py-2 text-right text-gray-400">{previewLines.map((_, index) => index + 1).join("\n")}</pre>
              <pre className="m-0 whitespace-pre px-3 py-2 text-ink-800">{previewLines.join("\n")}</pre>
            </div>
          </div>
        ) : !error ? <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted">Browse the project tree and select a text file.</div> : null}
      </div>
    </aside>
  );
}
