// Local-only component fixture: no Vera connection, real download or account state.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../src/ui/index.css';
import { AppUpdateNotice, AppUpdatesPanel } from '../src/ui/features/updates/DesktopUpdates';
import type { DesktopUpdateState } from '../src/electron/services/desktop-updates/update-types';
const listeners = new Set<(state: DesktopUpdateState) => void>();
let downloads = 0,
  checks = 0;
let state: DesktopUpdateState = {
  revision: 1,
  currentVersion: '1.0.2',
  platform: 'darwin',
  arch: 'arm64',
  status: 'available',
  showPrompt: true,
  release: {
    version: '1.0.3',
    format: 'dmg',
    publishedAt: '2020-01-01T00:00:00Z',
    notes: 'A safer and faster Cowork. <script>not executable</script>',
    sha256: 'a'.repeat(64),
  },
};
function publish(next: DesktopUpdateState) {
  state = { ...next, revision: state.revision + 1 };
  for (const listener of listeners) listener({ ...state });
  return { ...state };
}
Object.defineProperty(window, 'electron', {
  value: {
    getDesktopUpdateState: async () => ({ ...state }),
    onDesktopUpdateState: (fn: (state: DesktopUpdateState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    checkDesktopUpdates: async (manual: boolean) => {
      if (manual) checks++;
      return publish({
        ...state,
        showPrompt: manual && state.status === 'available' ? true : state.showPrompt,
        lastCheckedAt: Date.now(),
      });
    },
    dismissDesktopUpdate: async () => publish({ ...state, showPrompt: false }),
    downloadDesktopUpdate: async () => {
      downloads++;
      publish({ ...state, showPrompt: false, downloadOpened: true });
      return { opened: true };
    },
  },
});
function Fixture() {
  const [counts, setCounts] = useState('');
  return (
    <main className='min-h-screen bg-[var(--color-bg-100)] p-8 text-ink-900'>
      <div className='mx-auto max-w-3xl space-y-4'>
        <h1 className='text-xl font-semibold'>Isolated app-update UI fixture</h1>
        <div className='flex gap-2'>
          <button
            onClick={() =>
              publish({
                ...state,
                status: 'unconfigured',
                showPrompt: false,
                release: undefined,
                message: 'No app release feed has been configured on Vera.',
              })
            }
          >
            Simulate unconfigured
          </button>
          <button
            onClick={() =>
              publish({
                ...state,
                status: 'up-to-date',
                showPrompt: false,
                release: undefined,
                message: undefined,
              })
            }
          >
            Simulate current
          </button>
          <button onClick={() => setCounts(`Downloads ${downloads}, manual checks ${checks}`)}>
            Inspect actions
          </button>
        </div>
        <p role='log'>{counts}</p>
        <AppUpdatesPanel />
      </div>
      <AppUpdateNotice />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
