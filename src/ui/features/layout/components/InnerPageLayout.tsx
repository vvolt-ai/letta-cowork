import type { ReactNode } from "react";

interface InnerPageLayoutProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  headerContent?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  contentClassName?: string;
  contentWidthClassName?: string;
}

/**
 * Shared shell for every full-size page shown inside the workspace.
 * It owns the single vertical scroll region so nested pages cannot grow the
 * Electron window or compete with the workspace layout for scrolling.
 */
export function InnerPageLayout({
  title,
  description,
  actions,
  headerContent,
  onClose,
  closeLabel = `Close ${title}`,
  children,
  contentClassName = "px-6 py-6 sm:px-8",
  contentWidthClassName = "max-w-6xl",
}: InnerPageLayoutProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--color-bg-000)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-000)]">
        <div className={`mx-auto w-full ${contentWidthClassName} px-6 py-4 sm:px-8`}>
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-[-0.01em] text-ink-900">
                {title}
              </h1>
              {description ? (
                <div className="mt-1 text-xs leading-5 text-muted">{description}</div>
              ) : null}
            </div>

            {(actions || onClose) && (
              <div className="flex shrink-0 items-center gap-2">
                {actions}
                {onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    title={closeLabel}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {headerContent ? <div className="mt-4">{headerContent}</div> : null}
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full ${contentWidthClassName} ${contentClassName}`}>
          {children}
        </div>
      </div>
    </section>
  );
}
