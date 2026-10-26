import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopUpdateState } from '../../../electron/services/desktop-updates/update-types';
function useDesktopUpdates() {
  const [state, setState] = useState<DesktopUpdateState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const alive = useRef(false),
    revision = useRef(-1);
  const accept = useCallback((next: DesktopUpdateState) => {
    if (alive.current && next.revision >= revision.current) {
      revision.current = next.revision;
      setState(next);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const api = window.electron;
    if (!api?.getDesktopUpdateState || !api.onDesktopUpdateState) {
      setError('Restart Cowork to load the update checker.');
      return () => {
        alive.current = false;
      };
    }
    const off = api.onDesktopUpdateState(accept);
    void api
      .getDesktopUpdateState()
      .then(accept)
      .then(() => api.checkDesktopUpdates(false))
      .then(accept)
      .catch(() => {
        if (alive.current) setError('Could not load app update status.');
      });
    return () => {
      alive.current = false;
      off();
    };
  }, [accept]);
  const run = async (action: () => Promise<DesktopUpdateState | { opened: boolean }>) => {
    setBusy(true);
    setError(null);
    try {
      const value = await action();
      if ('revision' in value) accept(value);
    } catch {
      if (alive.current)
        setError(
          'Could not complete that update action. Check your Vera connection and try again.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return {
    state,
    busy,
    error,
    check: () => run(() => window.electron.checkDesktopUpdates(true)),
    later: () =>
      state?.release && run(() => window.electron.dismissDesktopUpdate(state.release!.version)),
    download: () =>
      state?.release && run(() => window.electron.downloadDesktopUpdate(state.release!.version)),
  };
}
export function AppUpdateNotice() {
  const { state, busy, error, later, download } = useDesktopUpdates();
  if (state?.status !== 'available' || !state.showPrompt || !state.release) return null;
  return (
    <aside
      role='status'
      aria-live='polite'
      className='fixed top-20 right-5 z-30 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-ink-900 shadow-elevated'
    >
      <p className='text-sm font-semibold'>New version available</p>
      <p className='mt-1 text-xs text-muted'>
        Vera Cowork {state.release.version} is ready. You are using {state.currentVersion}.
      </p>
      {state.release.notes && (
        <p className='mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-ink-700'>
          {state.release.notes}
        </p>
      )}
      <p className='mt-2 text-[11px] text-muted'>
        Download now and install when convenient. Your active work will not be restarted.
      </p>
      {error && (
        <p role='alert' className='mt-2 text-xs text-red-600'>
          {error}
        </p>
      )}
      <div className='mt-3 flex justify-end gap-2'>
        <button
          type='button'
          disabled={busy}
          onClick={() => void later()}
          className='rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-50'
        >
          Later
        </button>
        <button
          type='button'
          disabled={busy}
          onClick={() => void download()}
          className='rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50'
        >
          {busy ? 'Checking…' : 'Download update'}
        </button>
      </div>
    </aside>
  );
}
export function AppUpdatesPanel() {
  const { state, busy, error, check, download, later } = useDesktopUpdates();
  const status = state?.status ?? 'idle';
  const title: Record<string, string> = {
    idle: 'Check for a newer version',
    checking: 'Checking for updates…',
    available: `Vera Cowork ${state?.release?.version ?? ''} is available`,
    'up-to-date': 'You are up to date',
    unconfigured: 'Release feed not configured',
    unsupported: 'No compatible update available',
    error: 'Update check unavailable',
    'signed-out': 'Sign in to Vera to check updates',
  };
  return (
    <section className='space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6'>
      <div>
        <h2 className='text-lg font-semibold'>App updates</h2>
        <p className='mt-1 text-sm text-muted'>
          Current version: {state?.currentVersion ?? 'Loading…'}
          {state ? ` · ${state.platform} / ${state.arch}` : ''}
        </p>
      </div>
      <div role='status' aria-live='polite'>
        <h3 className='font-medium'>{title[status]}</h3>
        {state?.message && <p className='mt-1 text-sm text-muted'>{state.message}</p>}
        {state?.lastCheckedAt && (
          <p className='mt-1 text-xs text-muted'>
            Last checked {new Date(state.lastCheckedAt).toLocaleString()}
          </p>
        )}
      </div>
      {state?.release && (
        <div className='space-y-2'>
          <p className='whitespace-pre-wrap text-sm text-ink-700'>{state.release.notes}</p>
          <p className='text-xs text-muted'>
            Installer: {state.release.format}
            {state.release.minimumOsVersion
              ? ` · Requires OS ${state.release.minimumOsVersion}+`
              : ''}
          </p>
          <details className='text-xs text-muted'>
            <summary className='cursor-pointer'>Installer SHA-256</summary>
            <code className='mt-1 block break-all select-all'>{state.release.sha256}</code>
            <p className='mt-1'>
              Provided by Vera. The app opens your browser; it does not download, verify, or install
              the file for you.
            </p>
          </details>
        </div>
      )}
      {state?.downloadOpened && (
        <p className='text-sm text-green-700'>
          Download opened in your browser. Save your work before installing the new version.
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-red-600'>
          {error}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={busy || status === 'checking'}
          onClick={() => void check()}
          className='rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-50'
        >
          {busy || status === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        {status === 'available' && (
          <>
            <button
              type='button'
              disabled={busy}
              onClick={() => void download()}
              className='rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:opacity-50'
            >
              Download update
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={() => void later()}
              className='rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-50'
            >
              Remind me tomorrow
            </button>
          </>
        )}
      </div>
      <p className='text-xs text-muted'>
        Packaged apps check after sign-in and every six hours. Later snoozes this version for 24
        hours. Development builds check only when requested. No automatic install or restart.
      </p>
    </section>
  );
}
