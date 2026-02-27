import * as Dialog from "@radix-ui/react-dialog";
import type { ZohoEmail } from "../types";

interface EmailDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: ZohoEmail | null;
  details: unknown;
  loading: boolean;
  error: string | null;
}

const extractContent = (details: unknown) => {
  if (!details || typeof details !== "object") return "";
  const data = (details as any).data ?? details;
  return (
    data?.content ??
    data?.htmlContent ??
    data?.message ??
    data?.summary ??
    ""
  );
};

const isHtmlContent = (content: string) => /<\/?[a-z][\s\S]*>/i.test(content);

export function EmailDetailsDialog({
  open,
  onOpenChange,
  email,
  details,
  loading,
  error,
}: EmailDetailsDialogProps) {
  const content = extractContent(details);
  const html = isHtmlContent(content);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 h-[80vh] w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-900/10 bg-surface p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-ink-900/10 pb-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold text-ink-900">
                {email?.subject || "Email Details"}
              </Dialog.Title>
              <div className="mt-1 truncate text-xs text-muted">
                {email?.sender || email?.fromAddress || "Unknown sender"}
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close details">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-3 h-[calc(80vh-92px)] overflow-auto rounded-xl border border-ink-900/10 bg-surface-cream p-3">
            {loading ? (
              <div className="text-sm text-muted">Loading email details...</div>
            ) : error ? (
              <div className="text-sm text-error">{error}</div>
            ) : html ? (
              <iframe
                title="Email HTML content"
                className="h-full w-full rounded-lg bg-white"
                sandbox=""
                srcDoc={content}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words text-sm text-ink-800">
                {content || "No detail content available."}
              </pre>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
