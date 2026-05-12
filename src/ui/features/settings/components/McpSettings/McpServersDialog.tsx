import * as Dialog from "@radix-ui/react-dialog";
import { McpSettings } from "./index";

/**
 * Dialog wrapper around the MCP servers table.
 *
 * MCP server management used to live as a tab inside CoworkSettingsDialog,
 * but it doesn't really belong with channels/features — it is a
 * configuration concern. We moved the entry point to the sidebar's
 * Configuration page (ConfigurationTab) and surface the existing
 * <McpSettings /> table inside this Radix dialog. The table itself
 * is unchanged — only the chrome around it differs.
 */
interface McpServersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function McpServersDialog({ open, onOpenChange }: McpServersDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-white shadow-2xl focus:outline-none flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <Dialog.Title className="text-base font-semibold text-ink-900">
              MCP Servers
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-[var(--color-sidebar-hover)] hover:text-ink-700 transition"
                aria-label="Close MCP servers"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto">
            <McpSettings />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default McpServersDialog;
