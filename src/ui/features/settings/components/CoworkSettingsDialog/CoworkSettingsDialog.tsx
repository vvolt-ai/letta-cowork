import { ChannelsManager } from "../../../channels/components/ChannelsManager";

interface CoworkSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthError?: (error: Error) => void;
}

export function CoworkSettingsDialog({ open, onOpenChange, onAuthError }: CoworkSettingsDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-7xl mx-4 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Vera Cowork</p><h2 className="text-xl font-semibold text-gray-900">Cowork Configuration</h2></div>

          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <ChannelsManager onAuthError={onAuthError} />
        </div>
      </div>
    </div>
  );
}
