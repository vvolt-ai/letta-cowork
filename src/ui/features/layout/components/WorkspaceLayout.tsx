import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

interface WorkspaceLayoutProps {
  sidebar: ReactNode;
  chat: ReactNode;
  activity?: ReactNode | null;
  sidebarWidth?: number;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
}

const DEFAULT_LAYOUT_SIDEBAR_WIDTH = 260;

export function WorkspaceLayout({
  sidebar,
  chat,
  activity,
  sidebarWidth = DEFAULT_LAYOUT_SIDEBAR_WIDTH,
  minSidebarWidth = 220,
  maxSidebarWidth = 420,
  onSidebarWidthChange,
}: WorkspaceLayoutProps) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!dragStateRef.current || !onSidebarWidthChange) return;
    const delta = event.clientX - dragStateRef.current.startX;
    const nextWidth = Math.min(
      maxSidebarWidth,
      Math.max(minSidebarWidth, dragStateRef.current.startWidth + delta),
    );
    onSidebarWidthChange(nextWidth);
  }, [maxSidebarWidth, minSidebarWidth, onSidebarWidthChange]);

  const stopResizing = useCallback(() => {
    dragStateRef.current = null;
    if (resizeHandleRef.current && activePointerIdRef.current !== null) {
      resizeHandleRef.current.releasePointerCapture(activePointerIdRef.current);
    }
    resizeHandleRef.current = null;
    activePointerIdRef.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopResizing);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      dragStateRef.current = null;
      if (resizeHandleRef.current && activePointerIdRef.current !== null) {
        resizeHandleRef.current.releasePointerCapture(activePointerIdRef.current);
      }
      resizeHandleRef.current = null;
      activePointerIdRef.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [handlePointerMove, stopResizing]);

  const startResizing = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSidebarWidthChange) return;
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    resizeHandleRef.current = event.currentTarget;
    activePointerIdRef.current = event.pointerId;
    resizeHandleRef.current.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
  }, [handlePointerMove, onSidebarWidthChange, sidebarWidth, stopResizing]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg-100)] text-ink-900">
      <aside
        className="flex shrink-0 bg-[var(--color-sidebar)] shadow-[inset_-1px_0_0_rgba(15,23,42,0.06)]"
        style={{ width: `${sidebarWidth}px` }}
      >
        {sidebar}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={Math.round(sidebarWidth)}
        aria-valuemin={minSidebarWidth}
        aria-valuemax={maxSidebarWidth}
        tabIndex={0}
        className="relative flex w-1 shrink-0 cursor-col-resize items-stretch"
        onPointerDown={startResizing}
        onKeyDown={(event) => {
          if (!onSidebarWidthChange) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? -10 : 10;
            const nextWidth = Math.min(
              maxSidebarWidth,
              Math.max(minSidebarWidth, sidebarWidth + delta),
            );
            onSidebarWidthChange(nextWidth);
          }
        }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-[var(--color-border)]" />
      </div>
      <main className="flex min-w-0 flex-1 flex-col">
        {chat}
      </main>
      {activity ? (
        <aside className="hidden shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] lg:flex lg:w-[280px] xl:w-[300px]">
          {activity}
        </aside>
      ) : null}
    </div>
  );
}
