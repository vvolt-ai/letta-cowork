import type { ReactNode } from "react";

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SidebarSection({ title, children, action }: SidebarSectionProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.25em] text-muted">{title}</h2>
        {action ? <div className="text-xs text-ink-500">{action}</div> : null}
      </div>
      <div className="h-px w-full bg-[var(--color-border)]" />
      <div className="space-y-2 text-sm text-ink-700">
        {children}
      </div>
    </section>
  );
}
