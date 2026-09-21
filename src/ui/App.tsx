import { useEffect, useState } from "react";
import { LoginScreen } from "./features/auth/components/LoginScreen";
import { SuperAdminPanel } from "./features/admin/SuperAdminPanel";
import { ConfigurationTab } from "./features/sidebar/components/ConfigurationTab";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { isAuthenticated, isLoading, checkAuth, user, logout } = useAuth();
  const [showSuperAdmin, setShowSuperAdmin] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const unsubscribe = window.electron?.onAuthExpired?.(() => {
      void logout();
    }) ?? (() => {});

    return unsubscribe;
  }, [logout]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setShowSuperAdmin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" />
            <path className="opacity-75" d="M4 12a8 8 0 018-8" />
          </svg>
          <p className="text-sm text-slate-600">Loading configuration…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={checkAuth} />;
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-slate-50 text-ink-900">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-white px-8 py-4 pl-24">
        <div>
          <h1 className="text-base font-semibold text-ink-900">Remote access configuration</h1>
          <p className="mt-0.5 text-xs text-muted">
            Configure this computer as a remote tool runner.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.email ? <span className="text-xs text-muted">{user.email}</span> : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {showSuperAdmin ? (
          <SuperAdminPanel onClose={() => setShowSuperAdmin(false)} />
        ) : (
          <ConfigurationTab onOpenSuperAdmin={() => setShowSuperAdmin(true)} />
        )}
      </main>
    </div>
  );
}

export default App;
