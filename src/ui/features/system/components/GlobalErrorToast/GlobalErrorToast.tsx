interface GlobalErrorToastProps {
  message: string;
  onClose: () => void;
}

export function GlobalErrorToast({ message, onClose }: GlobalErrorToastProps) {
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-error/20 bg-error-light px-4 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-sm text-error">{message}</span>
        <button className="text-error hover:text-error/80" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
