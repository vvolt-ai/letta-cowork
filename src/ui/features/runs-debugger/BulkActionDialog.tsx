import * as Dialog from "@radix-ui/react-dialog";

interface Props {
  open: boolean;
  mode: "approve" | "reject";
  count: number;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BulkActionDialog({ open, mode, count, busy, onConfirm, onCancel }: Props) {
  const isApprove = mode === "approve";
  const title = isApprove ? "Approve all pending runs?" : "Reject all pending runs?";
  const description = isApprove
    ? `This will approve ${count} run${count === 1 ? "" : "s"} currently waiting for approval. This action cannot be undone.`
    : `This will cancel ${count} run${count === 1 ? "" : "s"} currently waiting for approval. This action cannot be undone.`;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-gray-900">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600">{description}</Dialog.Description>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
                isApprove ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {busy ? "Working…" : isApprove ? `Approve ${count}` : `Reject ${count}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
