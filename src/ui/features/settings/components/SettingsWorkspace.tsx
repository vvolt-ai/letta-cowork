import type { ReactNode } from "react";

export type SettingsSection =
  | "profile"
  | "skills"
  | "schedules"
  | "communication"
  | "mcp-servers"
  | "runtime-secrets"
  | "vera-environment"
  | "remote-access"
  | "administration";

interface SettingsWorkspaceProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  children: ReactNode;
}

const groups: Array<{
  label: string;
  items: Array<{ id: SettingsSection; label: string; description: string; icon: ReactNode }>;
}> = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", description: "Identity and phone", icon: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" /> },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "skills", label: "Skills", description: "Reusable agent capabilities", icon: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></> },
      { id: "schedules", label: "Schedules", description: "Recurring and one-off tasks", icon: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></> },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "communication", label: "Communication", description: "Channels and email", icon: <><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/></> },
      { id: "mcp-servers", label: "MCP servers", description: "External tool providers", icon: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></> },
      { id: "runtime-secrets", label: "Runtime secrets", description: "Encrypted account secrets", icon: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></> },
    ],
  },
  {
    label: "System",
    items: [
      { id: "vera-environment", label: "Vera Environment", description: "Runtime configuration", icon: <><circle cx="12" cy="12" r="3"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2M4.9 4.9a10 10 0 0 0 0 14.2"/></> },
      { id: "remote-access", label: "Remote access", description: "Desktop tool runner", icon: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></> },
      { id: "administration", label: "Administration", description: "Users and organizations", icon: <><path d="M12 3 4 7v6c0 5 3.4 7.6 8 8 4.6-.4 8-3 8-8V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></> },
    ],
  },
];

export function SettingsWorkspace({ activeSection, onSectionChange, onClose, children }: SettingsWorkspaceProps) {
  return (
    <div className="fixed inset-0 z-40 flex min-h-0 bg-[var(--color-bg-100)] text-ink-900">
      <aside className="flex w-[270px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)]">
        <div className="flex h-[76px] items-center justify-between border-b border-[var(--color-border)] px-5 pt-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Vera Cowork</div>
            <h1 className="mt-1 text-lg font-semibold">Settings</h1>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.id === activeSection;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSectionChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-[var(--color-surface)] text-ink-900 shadow-sm" : "text-ink-600 hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" : "bg-black/[0.035] text-ink-500"}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{item.label}</span>
                        <span className="block truncate text-[10px] text-muted">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] p-3">
          <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-medium text-ink-700 shadow-sm transition hover:text-ink-900">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 18-6-6 6-6"/></svg>
            Back to Cowork
          </button>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--color-bg-000)]">{children}</main>
    </div>
  );
}
