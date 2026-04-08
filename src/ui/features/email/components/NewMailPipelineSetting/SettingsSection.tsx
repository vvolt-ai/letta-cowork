import type { SettingsSectionProps } from "../../types";

export function SettingsSection({ eyebrow, title, description, children }: SettingsSectionProps) {
  return (
    <section className="rounded-2xl border border-ink-900/10 bg-white p-4 shadow-sm">
      <div>
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{eyebrow}</div>
        ) : null}
        <h3 className="mt-1 text-sm font-semibold text-ink-800">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
