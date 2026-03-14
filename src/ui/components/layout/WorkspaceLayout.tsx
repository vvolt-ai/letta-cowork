import type { ReactNode } from "react";

interface WorkspaceLayoutProps {
  sidebar: ReactNode;
  chat: ReactNode;
  activity: ReactNode;
}

export function WorkspaceLayout({ sidebar, chat, activity }: WorkspaceLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg-100)] text-ink-900">
      <aside className="flex shrink-0 bg-[var(--color-sidebar)] shadow-[inset_-1px_0_0_rgba(15,23,42,0.06)] md:w-[240px] lg:w-[260px] xl:w-[280px]">
        {sidebar}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {chat}
      </main>
      <aside className="hidden shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] lg:flex lg:w-[280px] xl:w-[300px]">
        {activity}
      </aside>
    </div>
  );
}
