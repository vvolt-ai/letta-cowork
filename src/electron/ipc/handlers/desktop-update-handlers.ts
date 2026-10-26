import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import Store from 'electron-store';
import { release } from 'node:os';
import { getVeraCoworkApiClient } from '../../api/index.js';
import { validateEventFrame } from '../../utils/index.js';
import {
  DesktopUpdateService,
  targetOsVersion,
} from '../../services/desktop-updates/update-service.js';
import { fetchDesktopRelease } from '../../services/desktop-updates/update-transport.js';
import { registerUpdateIpc } from '../../services/desktop-updates/update-ipc.js';
let disposePrevious: (() => void) | undefined;
export function registerDesktopUpdateHandlers(window: BrowserWindow) {
  disposePrevious?.();
  let disposed = false;
  const preferences = new Store<{ snooze?: { scope: string; version: string; until: number } }>({
    name: 'desktop-update-preferences',
  });
  const alive = () => !disposed && !window.isDestroyed() && !window.webContents.isDestroyed();
  const service = new DesktopUpdateService({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    now: Date.now,
    scope: () => {
      const api = getVeraCoworkApiClient(),
        user = api.currentUser,
        token = api.accessToken;
      if (!api.isAuthenticated() || !user || !token) return null;
      const base = api.apiBaseUrl;
      return {
        key: JSON.stringify([base, user.id, user.organizationId]),
        fetchLatest: () =>
          fetchDesktopRelease(base, token, {
            version: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            osVersion:
              typeof process.getSystemVersion === 'function'
                ? process.getSystemVersion()
                : targetOsVersion(process.platform, release()),
          }),
      };
    },
    readSnooze: () => preferences.get('snooze'),
    writeSnooze: (value) => preferences.set('snooze', value),
    openDownload: async (url) => {
      if (!alive()) throw Error('Update window closed');
      await shell.openExternal(url);
    },
    emit: (state) => {
      if (alive()) window.webContents.send('desktop-updates:state', state);
    },
  });
  const unwire = registerUpdateIpc(window, service, ipcMain, validateEventFrame, alive);
  const initial = setTimeout(() => void service.check(false).catch(() => {}), 30000);
  initial.unref();
  const interval = setInterval(() => void service.check(false).catch(() => {}), 6 * 60 * 60 * 1000);
  interval.unref();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(initial);
    clearInterval(interval);
    unwire();
    app.off('before-quit', dispose);
    window.off('closed', dispose);
  };
  disposePrevious = dispose;
  app.once('before-quit', dispose);
  window.once('closed', dispose);
  return dispose;
}
