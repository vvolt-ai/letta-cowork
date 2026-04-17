import { useState } from "react";
import { useListSkills } from "../../hooks/useListSkills";
import { useDownloadSkill } from "../../hooks/useDownloadSkill";
import { SkillPreviewDialog } from "./SkillPreviewDialog";

interface SkillsPanelProps {
  onClose: () => void;
}

export function SkillsPanel({ onClose }: SkillsPanelProps) {
  const { skills, loading, refresh } = useListSkills();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFolder, setPreviewFolder] = useState<string | null>(null);

  const {
    skillUrl,
    setSkillUrl,
    skillName,
    setSkillName,
    skillDownloading,
    skillDownloadSuccess,
    skillDownloadError,
    handleDownloadSkill,
    resetForm,
  } = useDownloadSkill();

  const handleInstall = async () => {
    await handleDownloadSkill();
    if (!skillDownloadError) {
      setTimeout(() => {
        refresh();
        resetForm();
      }, 500);
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-ink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <h2 className="text-base font-semibold text-ink-900">Skills</h2>
          {!loading && (
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
              {skills.length} installed
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-[var(--color-sidebar-hover)] hover:text-ink-700 transition"
          aria-label="Close skills panel"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl">

          {/* Install section */}
          <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h3 className="mb-1 text-[13.5px] font-semibold text-ink-900">Install from GitHub</h3>
            <p className="mb-4 text-[12.5px] text-muted">
              Paste a GitHub URL or <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">owner/repo/path</code> to install a skill.
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink-700">GitHub URL</label>
                <input
                  type="text"
                  value={skillUrl}
                  onChange={(e) => setSkillUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/tree/main/skills/my-skill"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink-700">
                  Skill Name <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="my-skill"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              {skillDownloadError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12.5px] text-red-700">
                  {skillDownloadError}
                </div>
              )}

              {skillDownloadSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-[12.5px] text-green-700">
                  ✓ Skill installed successfully
                </div>
              )}

              <button
                onClick={handleInstall}
                disabled={skillDownloading || !skillUrl.trim()}
                className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {skillDownloading ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Installing...
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Install Skill
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Installed skills */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Installed Skills
              </h3>
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1 rounded text-[11.5px] text-muted hover:text-ink-700 transition"
              >
                <svg className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Search */}
            {skills.length > 4 && (
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[13px] placeholder:text-ink-400 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-[13px] text-muted">Loading skills...</div>
            ) : filteredSkills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] py-10 text-center">
                <svg className="mx-auto mb-2 h-6 w-6 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <p className="text-[13px] text-muted">
                  {searchQuery ? "No skills match your search" : "No skills installed yet"}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setPreviewFolder(skill.folder)}
                    className="group flex w-full items-start gap-3.5 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3.5 text-left transition hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/[0.03] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                    aria-label={`Preview skill ${skill.name}`}
                  >
                    {/* Icon */}
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-accent)]/10 to-[var(--color-accent)]/20 text-[var(--color-accent)]">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-ink-900">
                          {skill.name}
                        </span>
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                          {skill.folder}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                          {skill.description}
                        </p>
                      )}
                    </div>
                    {/* Preview affordance */}
                    <div className="ml-auto flex shrink-0 items-center gap-1 self-center text-[11px] font-medium text-ink-400 transition group-hover:text-[var(--color-accent)]">
                      <span>Preview</span>
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <SkillPreviewDialog
        open={!!previewFolder}
        folder={previewFolder}
        onOpenChange={(v) => { if (!v) setPreviewFolder(null); }}
        onDeleted={() => { setPreviewFolder(null); refresh(); }}
      />
    </div>
  );
}
