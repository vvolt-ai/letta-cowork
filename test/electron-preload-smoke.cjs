// Isolated real-Electron fixture. Does not start Cowork services, read account
// tokens, install login items, or contact providers. Run with a fresh userData.
const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');
const profile = process.argv[2];
if (!profile) throw Error('Explicit isolated profile directory required');
app.setPath('userData', resolve(profile));
app.disableHardwareAcceleration();
const timer = setTimeout(() => {
  console.error('PRELOAD_SMOKE_TIMEOUT');
  app.exit(1);
}, 15000);
app
  .whenReady()
  .then(async () => {
    let win;
    try {
      ipcMain.handle('getStaticData', () => ({ fixture: 'ELECTRON45_PRELOAD_OK' }));
      const errors = [];
      win = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: join(__dirname, '../dist-electron/preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
      win.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason));
      await win.loadURL(
        'data:text/html,<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>Isolated preload fixture</body></html>',
      );
      const result = await win.webContents.executeJavaScript(
        `(async()=>({bridge:typeof window.electron?.sendClientEvent,reply:await window.electron.getStaticData(),nodeRequire:typeof require,nodeProcess:typeof process}))()`,
      );
      assert.equal(result.bridge, 'function');
      assert.equal(result.reply.fixture, 'ELECTRON45_PRELOAD_OK');
      assert.equal(result.nodeRequire, 'undefined');
      assert.equal(result.nodeProcess, 'undefined');
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          electron: process.versions.electron,
          sandboxedPreload: true,
          contextBridge: true,
          ipc: true,
          rendererNodeDisabled: true,
        }),
      );
      clearTimeout(timer);
      win.destroy();
      app.quit();
    } catch (error) {
      clearTimeout(timer);
      console.error(error);
      win?.destroy();
      app.exit(1);
    }
  })
  .catch((error) => {
    clearTimeout(timer);
    console.error(error);
    app.exit(1);
  });
